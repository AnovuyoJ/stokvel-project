// routes/payfastRoutes.js - Handles PayFast contribution and payout routes
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { sendContributionReceiptEmail } = require("../services/emailService");
const User = require("../models/users");
const Rate = require("../models/rate");

// PayFast configuration
const PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX !== "false";
const PAYFAST_HOST = PAYFAST_SANDBOX
  ? "https://sandbox.payfast.co.za"
  : "https://www.payfast.co.za";

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "10000100";
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "46f0cd694581a";
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";
const BACKEND_URL = process.env.AZURE_URL || "http://localhost:3001";
const FRONTEND_URL = process.env.CLIENT_URL || "http://localhost:5173";

// ── Middleware ────────────────────────────────────────────────────────────
function protect(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Helper Functions ──────────────────────────────────────────────────────
function getGroup() {
  return mongoose.models.Group;
}

function getMember() {
  return mongoose.models.Member;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function calcMemberPayout(groupId, memberId) {
  const contributions = await Contribution.find({ group: groupId, member: memberId, status: "paid" });
  const rateData = await Rate.findOne().sort({ lastUpdated: -1 });
  const annualRate = rateData?.primeRate || 11.75;

  let total = 0;
  for (const c of contributions) {
    total += c.amount;
    if (c.paidAt && c.month) {
      const [year, month] = c.month.split("-").map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const daysEarly = Math.max(0, (monthStart - new Date(c.paidAt)) / 86400000);
      total += parseFloat((c.amount * (annualRate / 100) * (daysEarly / 365)).toFixed(2));
    }
  }
  return parseFloat(total.toFixed(2));
}

function generateSignature(data, passphrase = "") {
  const filtered = Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== "signature")
  );

  const sortedKeys = Object.keys(filtered).sort();

  let str = Object.entries(filtered)
    .map(
      ([key, value]) =>
        `${key}=${encodeURIComponent(String(value).trim()).replace(/%20/g, "+")}`
    )
    .join("&");

  if (passphrase && passphrase.trim() !== "") {
    str += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  }

  console.log("Signature string:", str);

  return crypto.createHash("md5").update(str).digest("hex");
}

// ── Models ────────────────────────────────────────────────────────────────
const contributionSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    amount: { type: Number, required: true },
    month: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    pfPaymentId: { type: String },
    reference: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

const Contribution =
  mongoose.models.Contribution ||
  mongoose.model("Contribution", contributionSchema);

const disbursementSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    amount: { type: Number, required: true },
    month: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    reference: { type: String },
    note: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

const Disbursement =
  mongoose.models.Disbursement ||
  mongoose.model("Disbursement", disbursementSchema);

// ══════════════════════════════════════════════════════════════════════════
// CONTRIBUTION ROUTES
// ══════════════════════════════════════════════════════════════════════════

// POST /api/payfast/contribute - Start a contribution payment
router.post("/contribute", protect, async (req, res) => {
  try {
    const { groupId, memberId, month: requestedMonth, months: requestedMonths } = req.body;

    if (!groupId || !memberId) {
      return res.status(400).json({ error: "groupId and memberId required" });
    }

    const Group = getGroup();
    const Member = getMember();

    if (!Group) return res.status(500).json({ error: "Group model not loaded" });
    if (!Member) return res.status(500).json({ error: "Member model not loaded" });

    const group = await Group.findById(groupId.toString());
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.amount) {
      return res.status(400).json({ error: "Group contribution amount not set" });
    }

    const isOwner = group.owner.toString() === req.userId;
    const currentUser = await User.findById(req.userId).select("email");

    const myMember = await Member.findOne({
      group: groupId,
      status: "active",
      $or: [
        { userId: req.userId },
        { contact: currentUser?.email?.toLowerCase() },
      ],
    });

    if (!isOwner && !myMember) {
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    if (!isOwner && myMember._id.toString() !== memberId) {
      return res.status(403).json({ error: "You can only make payments for yourself" });
    }

    const member = await Member.findOne({ _id: memberId, group: groupId });
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    // Build months array (supports single month or lump-sum array)
    const cur = currentMonth();
    let months;
    if (Array.isArray(requestedMonths) && requestedMonths.length > 0) {
      months = requestedMonths.filter((m) => /^\d{4}-\d{2}$/.test(m) && m >= cur).sort();
    } else if (requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) && requestedMonth >= cur) {
      months = [requestedMonth];
    } else {
      months = [cur];
    }
    if (months.length === 0) months = [cur];

    // Reject if any month in the range is already paid
    const alreadyPaid = await Contribution.find({
      group: groupId,
      member: memberId,
      month: { $in: months },
      status: "paid",
    });
    if (alreadyPaid.length > 0) {
      return res.status(409).json({
        error: `Already paid for: ${alreadyPaid.map((c) => c.month).join(", ")}`,
      });
    }

    // Remove any stale pending records for these months before creating fresh ones
    await Contribution.deleteMany({
      group: groupId,
      member: memberId,
      month: { $in: months },
      status: "pending",
    });

    const reference = `STK-${groupId.toString().slice(-4).toUpperCase()}-${memberId.toString().slice(-4).toUpperCase()}-${Date.now()}`;
    const totalAmount = Number(group.amount) * months.length;

    await Contribution.insertMany(
      months.map((m) => ({
        group: groupId,
        member: memberId,
        amount: group.amount,
        month: m,
        status: "pending",
        reference,
      }))
    );

    const paymentData = {
      merchant_id: MERCHANT_ID,
      merchant_key: MERCHANT_KEY,
      return_url: `${req.headers.origin || FRONTEND_URL}/group?payment=success&ref=${reference}`,
      cancel_url: `${req.headers.origin || FRONTEND_URL}/group?payment=cancelled&ref=${reference}`,
      notify_url: `${BACKEND_URL}/api/payfast/itn`,
      name_first: member.name.split(" ")[0],
      name_last: member.name.split(" ").slice(1).join(" ") || "Member",
      email_address: PAYFAST_SANDBOX ? "sbtu01@payfast.io" : member.contact,
      m_payment_id: reference,
      amount: totalAmount.toFixed(2),
      item_name: months.length > 1 ? `Stokvel Contribution (${months.length} months)` : "Stokvel Contribution",
    };

    paymentData.signature = generateSignature(paymentData, PASSPHRASE);

    const params = Object.keys(paymentData)
      .map((key) => `${key}=${encodeURIComponent(String(paymentData[key]).trim()).replace(/%20/g, "+")}`)
      .join("&");

    const paymentUrl = `${PAYFAST_HOST}/eng/process?${params}`;
    console.log("PayFast URL:", paymentUrl);

    res.json({
      paymentUrl,
      reference,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payfast/itn - PayFast ITN callback
router.post("/itn", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const data = req.body;
    console.log("Raw body:", data);

    const received = data.signature;
    const toVerify = { ...data };
    delete toVerify.signature;
    const expected = generateSignature(toVerify, PASSPHRASE);
    console.log("Received signature:", received);
    console.log("Expected signature:", expected);

    if (received !== expected) {
      console.error("PayFast ITN: invalid signature. Expected:", expected, "Got:", received);
      return res.status(400).send("Invalid signature");
    }

    if (data.payment_status !== "COMPLETE") {
      await Contribution.updateMany(
        { reference: data.m_payment_id },
        { status: "failed" }
      );
      return res.status(200).send("OK");
    }

    const updated = await Contribution.updateMany(
      { reference: data.m_payment_id },
      {
        status: "paid",
        pfPaymentId: data.pf_payment_id,
        paidAt: new Date(),
      }
    );

    if (updated.matchedCount === 0) {
      console.error("PayFast ITN: contribution not found for ref", data.m_payment_id);
      return res.status(404).send("Contribution not found");
    }

    const contribution = await Contribution.findOne({ reference: data.m_payment_id });

    try {
      const Member = getMember();
      const Group = getGroup();
      const member = await Member.findById(contribution.member);
      const group = await Group.findById(contribution.group);

      await sendContributionReceiptEmail({
        toEmail: member.contact,
        toName: member.name,
        groupName: group.name,
        amount: data.amount_gross,
        reference: data.m_payment_id,
        date: new Date().toLocaleDateString("en-ZA"),
      });
    } catch (emailErr) {
      console.error("Receipt email failed:", emailErr.message);
    }

    console.log(`Contribution paid: ${data.m_payment_id} — R${data.amount_gross}`);
    res.status(200).send("OK");
  } catch (err) {
    console.error("PayFast ITN error:", err);
    res.status(500).send("Server error");
  }
});

// GET /api/payfast/contributions - Get contributions for a group
router.get("/contributions", protect, async (req, res) => {
  try {
    const { groupId } = req.query;
    if (!groupId) return res.status(400).json({ error: "groupId required" });

    const Group = getGroup();
    const Member = getMember();

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const isOwner = group.owner.toString() === req.userId;
    if (!isOwner) {
      const currentUser = await User.findById(req.userId).select("email");
      const isMember = await Member.findOne({
        group: groupId,
        status: "active",
        $or: [
          { userId: req.userId },
          { contact: currentUser?.email?.toLowerCase() },
        ],
      });
      if (!isMember) return res.status(403).json({ error: "Access denied" });
    }

    const contributions = await Contribution.find({ group: groupId })
      .populate("member", "name initials")
      .sort("-paidAt");

    res.json(contributions);
  } catch (err) {
    console.error("Error fetching contributions:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payfast/confirm - Treasurer manually confirms an offline payment
router.post("/confirm", protect, async (req, res) => {
  try {
    const { groupId, memberId, month } = req.body;
    if (!groupId || !memberId) {
      return res.status(400).json({ error: "groupId and memberId required" });
    }

    const Group = getGroup();
    const Member = getMember();

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Allow owner or treasurer
    const isOwner = group.owner.toString() === req.userId;
    let isTreasurer = false;
    if (!isOwner) {
      const currentUser = await User.findById(req.userId).select("email");
      const treasurerMember = await Member.findOne({
        group: groupId,
        role: "Treasurer",
        status: "active",
        $or: [
          { userId: req.userId },
          { contact: currentUser?.email?.toLowerCase() },
        ],
      });
      isTreasurer = !!treasurerMember;
    }
    if (!isOwner && !isTreasurer) {
      return res.status(403).json({ error: "Only owner or treasurer can confirm payments" });
    }

    const member = await Member.findOne({ _id: memberId, group: groupId });
    if (!member) return res.status(404).json({ error: "Member not found" });

    const contributionMonth = month || currentMonth();

    // Check if already paid
    const existing = await Contribution.findOne({
      group: groupId,
      member: memberId,
      month: contributionMonth,
      status: "paid",
    });
    if (existing) {
      return res.status(409).json({ error: `${member.name} already paid for ${contributionMonth}` });
    }

    const reference = `MANUAL-${groupId.toString().slice(-4).toUpperCase()}-${memberId.toString().slice(-4).toUpperCase()}-${Date.now()}`;

    const contribution = await Contribution.create({
      group: groupId,
      member: memberId,
      amount: group.amount,
      month: contributionMonth,
      status: "paid",
      reference,
      paidAt: new Date(),
    });

    await contribution.populate("member", "name initials");

    res.status(201).json({ contribution });
  } catch (err) {
    console.error("Confirm payment error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// DISBURSEMENT ROUTES
// ══════════════════════════════════════════════════════════════════════════

// POST /api/payfast/disburse - Creates disbursement record
router.post("/disburse", protect, async (req, res) => {
  try {
    const { groupId, memberId, note } = req.body;

    if (!groupId || !memberId) {
      return res.status(400).json({ error: "groupId and memberId required" });
    }

    const Group = getGroup();
    const Member = getMember();

    const group = await Group.findOne({ _id: groupId, owner: req.userId });
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.amount) {
      return res.status(400).json({ error: "Group amount not set" });
    }

    const member = await Member.findOne({ _id: memberId, group: groupId });
    if (!member) {
      return res.status(404).json({ error: "Member not found" });
    }

    const month = currentMonth();

    const existing = await Disbursement.findOne({
      group: groupId,
      member: memberId,
      month,
    });

    if (existing) {
      return res.status(409).json({
        error: `Payout already initiated for ${member.name} this month`,
      });
    }

    const payoutAmount = await calcMemberPayout(groupId, memberId);
    if (payoutAmount <= 0) {
      return res.status(400).json({ error: `${member.name} has no contributions to pay out` });
    }

    const reference = `PAYOUT-${groupId.toString().slice(-4).toUpperCase()}-${Date.now()}`;

    const disbursement = await Disbursement.create({
      group: groupId,
      member: memberId,
      amount: payoutAmount,
      month,
      status: "pending",
      reference,
      note: note || "",
    });

    await disbursement.populate("member", "name initials");

    res.status(201).json({
      disbursement,
      message: `Payout of R${payoutAmount} to ${member.name} recorded as pending.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payfast/disburse-next - FIFO disbursement
router.post("/disburse-next", protect, async (req, res) => {
  try {
    const { groupId } = req.body;
    if (!groupId) return res.status(400).json({ error: "groupId required" });

    const Group = getGroup();
    const Member = getMember();

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // 1. Authorize — only owner or treasurer
    const isOwner = group.owner.toString() === req.userId;
    let isTreasurer = false;
    if (!isOwner) {
      const currentUser = await User.findById(req.userId).select("email");
      const treasurerMember = await Member.findOne({
        group: groupId,
        role: "Treasurer",
        status: "active",
        $or: [
          { userId: req.userId },
          { contact: currentUser?.email?.toLowerCase() },
        ],
      });
      isTreasurer = !!treasurerMember;
    }
    if (!isOwner && !isTreasurer) {
      return res.status(403).json({ error: "Only owner or treasurer can disburse" });
    }

    // 2. FIFO order — find next eligible member who has paid and not yet disbursed
    const members = await Member.find({ group: groupId, status: "active" }).sort("createdAt");
    if (members.length === 0) return res.status(400).json({ error: "No active members" });

    const currentMonthStr = new Date().toISOString().slice(0, 7);
    let currentIndex = group.nextPayoutIndex || 0;
    if (currentIndex >= members.length) currentIndex = 0;

    let nextMember = null;
    let nextMemberIndex = currentIndex;

    for (let i = 0; i < members.length; i++) {
      const idx = (currentIndex + i) % members.length;
      const candidate = members[idx];

      const contribution = await Contribution.findOne({
        group: groupId,
        member: candidate._id,
        month: currentMonthStr,
        status: "paid",
      });

      const alreadyDisbursed = await Disbursement.findOne({
        group: groupId,
        member: candidate._id,
        month: currentMonthStr,
      });

      if (contribution && !alreadyDisbursed) {
        nextMember = candidate;
        nextMemberIndex = idx;
        break;
      }
    }

    if (!nextMember) {
      return res.status(400).json({
        error: "No eligible members found. Either no one has paid yet, or all paid members have already been disbursed this month.",
      });
    }

    // 3. Calculate this member's personal payout (all their contributions + interest)
    const payoutAmount = await calcMemberPayout(groupId, nextMember._id);
    if (payoutAmount <= 0) {
      return res.status(400).json({ error: `${nextMember.name} has no contributions to pay out.` });
    }

    // 4. Record a PENDING disbursement
    const reference = `PAYOUT-${groupId.toString().slice(-4)}-${Date.now()}`;
    const disbursement = await Disbursement.create({
      group: groupId,
      member: nextMember._id,
      amount: payoutAmount,
      month: currentMonthStr,
      status: "pending",
      reference,
      note: "Treasurer to complete bank/cash transfer and mark as paid.",
    });
    await disbursement.populate("member", "name initials contact");

    // 5. Advance the FIFO queue
    group.nextPayoutIndex = (nextMemberIndex + 1) % members.length;
    await group.save();

    res.json({
      success: true,
      disbursement,
      member: { id: nextMember._id, name: nextMember.name },
      amount: payoutAmount,
      message: `Payout of R${payoutAmount} recorded for ${nextMember.name}. Treasurer must now send funds manually, then mark as paid.`,
    });
  } catch (err) {
    console.error("Disburse-next error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/payfast/disburse/:disbursementId - Mark disbursement as paid
router.patch("/disburse/:disbursementId", protect, async (req, res) => {
  try {
    console.log("PATCH disburse called with ID:", req.params.disbursementId);
    
    const updated = await Disbursement.findByIdAndUpdate(
      req.params.disbursementId,
      { status: "paid", paidAt: new Date() },
      { new: true }
    ).populate({
      path: "group",
      select: "owner",
    });

    if (!updated) {
      console.error("Disbursement not found:", req.params.disbursementId);
      return res.status(404).json({ error: "Disbursement not found" });
    }

    if (!updated.group) {
      console.error("Group not found for disbursement:", updated._id);
      return res.status(404).json({ error: "Group not found" });
    }

    const ownerId = updated.group.owner;

    if (!ownerId || ownerId.toString() !== req.userId) {
      console.error("User not authorized. Owner:", ownerId, "User:", req.userId);
      return res.status(403).json({ error: "Not authorized" });
    }

    console.log("Successfully marked disbursement as paid:", updated._id);
    return res.status(200).json(updated);
  } catch (err) {
    console.error("PATCH disbursement error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
});

// GET /api/payfast/disbursements - Get disbursements for a group
router.get("/disbursements", protect, async (req, res) => {
  try {
    const { groupId } = req.query;
    if (!groupId) return res.status(400).json({ error: "groupId required" });

    const Group = getGroup();
    const Member = getMember();

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const isOwner = group.owner.toString() === req.userId;
    if (!isOwner) {
      const currentUser = await User.findById(req.userId).select("email");
      const isMember = await Member.findOne({
        group: groupId,
        status: "active",
        $or: [
          { userId: req.userId },
          { contact: currentUser?.email?.toLowerCase() },
        ],
      });
      if (!isMember) return res.status(403).json({ error: "Access denied" });
    }

    const disbursements = await Disbursement.find({ group: groupId })
      .populate("member", "name initials")
      .sort("-createdAt");

    res.json(disbursements);
  } catch (err) {
    console.error("Error fetching disbursements:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payfast/disbursements/my - Get member's own payouts
router.get("/disbursements/my", protect, async (req, res) => {
  try {
    const { groupId } = req.query;
    if (!groupId) return res.status(400).json({ error: "groupId required" });

    const Member = getMember();
    const currentUser = await User.findById(req.userId).select("email");
    const member = await Member.findOne({
      group: groupId,
      status: "active",
      $or: [
        { userId: req.userId },
        { contact: currentUser?.email?.toLowerCase() },
      ],
    });
    if (!member) return res.status(404).json({ error: "You are not a member of this group" });

    const myPayouts = await Disbursement.find({ group: groupId, member: member._id }).sort("-paidAt");
    res.json(myPayouts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// FLAG PAYMENT ROUTES
// ══════════════════════════════════════════════════════════════════════════

// POST /api/payfast/flag-payment/:groupId - Flag a member's payment as missed
router.post("/flag-payment/:groupId", protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId, status } = req.body;

    if (!memberId) return res.status(400).json({ error: "memberId required" });

    const Group = mongoose.models.Group;
    const Member = mongoose.models.Member;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Allow owner or treasurer
    const isOwner = group.owner.toString() === req.userId;
    let isTreasurer = false;
    if (!isOwner) {
      const currentUser = await User.findById(req.userId).select("email");
      const treasurerMember = await Member.findOne({
        group: groupId,
        role: "Treasurer",
        status: "active",
        $or: [
          { userId: req.userId },
          { contact: currentUser?.email?.toLowerCase() },
        ],
      });
      isTreasurer = !!treasurerMember;
    }
    if (!isOwner && !isTreasurer) {
      return res.status(403).json({ error: "Only owner or treasurer can flag payments" });
    }

    const member = await Member.findOne({ _id: memberId, group: groupId });
    if (!member) return res.status(404).json({ error: "Member not found" });

    const month = currentMonth();

    // Upsert a missed contribution record
    const existing = await Contribution.findOne({
      group: groupId,
      member: memberId,
      month,
    });

    if (existing) {
      existing.status = status || "missed";
      await existing.save();
    } else {
      await Contribution.create({
        group: groupId,
        member: memberId,
        amount: group.amount,
        month,
        status: status || "missed",
        reference: `MISSED-${memberId.toString().slice(-4)}-${Date.now()}`,
      });
    }

    res.json({ message: `Payment flagged as ${status || "missed"} for ${member.name}` });
  } catch (err) {
    console.error("Flag payment error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;