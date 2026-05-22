
jest.setTimeout(30000)
jest.mock('../services/emailService', () => ({
  sendContributionReceiptEmail: jest.fn().mockResolvedValue(true),
  sendInviteEmail: jest.fn().mockResolvedValue(true),
  sendMeetingNotification: jest.fn().mockResolvedValue(true),
  sendMissingContributionEmail: jest.fn().mockResolvedValue(true),
  sendRoleAssignedEmail: jest.fn().mockResolvedValue(true),
  sendMeetingMinutes: jest.fn().mockResolvedValue(true),
}));

const request  = require("supertest")
const express  = require("express")
const mongoose = require("mongoose")
const jwt      = require("jsonwebtoken")
const { MongoMemoryServer } = require("mongodb-memory-server")

// ── Setup ─────────────────────────────────────────────────────────────────────
let mongod
let app
let token
let userId
let groupId
let memberId

// Models (inline for test isolation)
const Group = mongoose.models.Group || mongoose.model("Group", new mongoose.Schema({
  owner:        mongoose.Schema.Types.ObjectId,
  name:         String,
  amount:       Number,
  freq:         String,
  payoutMethod: String,
}))

const Member = mongoose.models.Member || mongoose.model("Member", new mongoose.Schema({
  group:    mongoose.Schema.Types.ObjectId,
  name:     String,
  contact:  String,
  role:     { type: String, default: "Member" },
  initials: String,
  slot:     Number,
  status:   { type: String, default: "pending" },
}))

const Contribution = mongoose.models.Contribution || mongoose.model("Contribution", new mongoose.Schema({
  group:       mongoose.Schema.Types.ObjectId,
  member:      mongoose.Schema.Types.ObjectId,
  amount:      Number,
  month:       String,
  status:      { type: String, default: "pending" },
  pfPaymentId: String,
  reference:   String,
  paidAt:      Date,
}, { timestamps: true }))

const Disbursement = mongoose.models.Disbursement || mongoose.model("Disbursement", new mongoose.Schema({
  group:     mongoose.Schema.Types.ObjectId,
  member:    mongoose.Schema.Types.ObjectId,
  amount:    Number,
  month:     String,
  status:    { type: String, default: "pending" },
  reference: String,
  note:      String,
  paidAt:    Date,
}, { timestamps: true }))

// ── Start in-memory DB before all tests ───────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())

  process.env.JWT_SECRET          = "test_secret"
  process.env.PAYFAST_SANDBOX     = "true"
  process.env.PAYFAST_PASSPHRASE  = ""
  process.env.AZURE_URL           = "http://localhost:3001"
  process.env.CLIENT_URL          = "http://localhost:5173"

  // Create a fake user ID and token
  userId = new mongoose.Types.ObjectId()
  token  = jwt.sign({ id: userId }, "test_secret", { expiresIn: "1d" })

  // Create a test group
  const group = await Group.create({
    owner:  userId,
    name:   "Test Stokvel",
    amount: 500,
    freq:   "Monthly",
    payoutMethod: "Fixed Order (Roster)",
  })
  groupId = group._id

  // Create a test member
  const member = await Member.create({
    group:    groupId,
    name:     "Zanele Dlamini",
    contact:  "zanele@test.com",
    initials: "ZD",
    slot:     1,
  })
  memberId = member._id
  fakeDisbursementId = new mongoose.Types.ObjectId();

  // Build express app with the routes
  app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))
  const payfastRoutes = require("../routes/payfastRoutes")
  app.use("/api/payfast", payfastRoutes)
})

afterAll(async () => {
  await mongoose.disconnect()
  if (mongod) {
    await mongod.stop()
  }
})

afterEach(async () => {
  // Clean contributions and disbursements between tests
  await Contribution.deleteMany({})
  await Disbursement.deleteMany({})
})

// ─────────────────────────────────────────────────────────────────────────────
// CONTRIBUTION TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/payfast/contribute", () => {

  test("returns a PayFast payment URL for a valid member", async () => {
    const res = await request(app)
      .post("/api/payfast/contribute")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupId: groupId.toString(), memberId: memberId.toString() })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("paymentUrl")
    expect(res.body).toHaveProperty("reference")
    expect(res.body.paymentUrl).toContain("sandbox.payfast.co.za")
  })

  test("payment URL contains correct amount", async () => {
    const res = await request(app)
      .post("/api/payfast/contribute")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupId: groupId.toString(), memberId: memberId.toString() })

    expect(res.body.paymentUrl).toContain("amount=500.00")
  })

  test("creates a pending contribution record in DB", async () => {
    await request(app)
      .post("/api/payfast/contribute")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupId: groupId.toString(), memberId: memberId.toString() })

    const contribution = await Contribution.findOne({ group: groupId, member: memberId })
    expect(contribution).not.toBeNull()
    expect(contribution.status).toBe("pending")
    expect(contribution.amount).toBe(500)
  })

  test("rejects duplicate payment for same member and month", async () => {
    // First create a paid contribution
    await Contribution.create({
      group:     groupId,
      member:    memberId,
      amount:    500,
      month:     currentMonth(),
      status:    "paid",
      reference: "STK-TEST-001",
    })

    const res = await request(app)
      .post("/api/payfast/contribute")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupId: groupId.toString(), memberId: memberId.toString() })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already paid/)
  })

  test("returns 400 when groupId is missing", async () => {
    const res = await request(app)
      .post("/api/payfast/contribute")
      .set("Authorization", `Bearer ${token}`)
      .send({ memberId: memberId.toString() })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/)
  })

  test("returns 400 when memberId is missing", async () => {
    const res = await request(app)
      .post("/api/payfast/contribute")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupId: groupId.toString() })

    expect(res.status).toBe(400)
  })

  test("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/payfast/contribute")
      .send({ groupId: groupId.toString(), memberId: memberId.toString() })

    expect(res.status).toBe(401)
  })

  test("returns 404 for a group that does not belong to user", async () => {
    const otherUserId = new mongoose.Types.ObjectId()
    const otherToken  = jwt.sign({ id: otherUserId }, "test_secret")

    const res = await request(app)
      .post("/api/payfast/contribute")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ groupId: groupId.toString(), memberId: memberId.toString() })

    expect(res.status).toBe(404)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// ITN TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/payfast/itn", () => {

  test("marks contribution as paid on COMPLETE status", async () => {
    const ref = "STK-ITN-TEST-001"
    await Contribution.create({
      group: groupId, member: memberId,
      amount: 500, month: currentMonth(),
      status: "pending", reference: ref,
    })

    const itnPayload = {
      m_payment_id:   ref,
      pf_payment_id:  "PF123456",
      payment_status: "COMPLETE",
      amount_gross:   "500.00",
    }

    // Generate valid signature for test
    const crypto    = require("crypto")
    const sigString = Object.entries(itnPayload)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`)
      .join("&")
    itnPayload.signature = crypto.createHash("md5").update(sigString).digest("hex")

    const res = await request(app)
      .post("/api/payfast/itn")
      .send(itnPayload)

    expect(res.status).toBe(200)

    const updated = await Contribution.findOne({ reference: ref })
    expect(updated.status).toBe("paid")
    expect(updated.pfPaymentId).toBe("PF123456")
    expect(updated.paidAt).not.toBeNull()
  })

  test("marks contribution as failed on non-COMPLETE status", async () => {
    const ref = "STK-ITN-TEST-002"
    await Contribution.create({
      group: groupId, member: memberId,
      amount: 500, month: currentMonth(),
      status: "pending", reference: ref,
    })

    const itnPayload = {
      m_payment_id:   ref,
      pf_payment_id:  "PF999",
      payment_status: "FAILED",
      amount_gross:   "500.00",
    }

    const crypto    = require("crypto")
    const sigString = Object.entries(itnPayload)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`)
      .join("&")
    itnPayload.signature = crypto.createHash("md5").update(sigString).digest("hex")

    await request(app).post("/api/payfast/itn").send(itnPayload)

    const updated = await Contribution.findOne({ reference: ref })
    expect(updated.status).toBe("failed")
  })

  test("rejects ITN with invalid signature", async () => {
    const res = await request(app)
      .post("/api/payfast/itn")
      .send({
        m_payment_id:   "STK-FAKE",
        payment_status: "COMPLETE",
        signature:      "invalidsignature",
      })

    expect(res.status).toBe(400)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GET CONTRIBUTIONS TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/payfast/contributions", () => {

  test("returns all contributions for a group", async () => {
    await Contribution.create([
      { group: groupId, member: memberId, amount: 500, month: currentMonth(), status: "paid", reference: "REF-1" },
      { group: groupId, member: memberId, amount: 500, month: "2025-01",      status: "paid", reference: "REF-2" },
    ])

    const res = await request(app)
      .get(`/api/payfast/contributions?groupId=${groupId}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  test("returns empty array when no contributions", async () => {
    const res = await request(app)
      .get(`/api/payfast/contributions?groupId=${groupId}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test("returns 400 when groupId is missing", async () => {
    const res = await request(app)
      .get("/api/payfast/contributions")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(400)
  })

  test("returns 401 without token", async () => {
    const res = await request(app)
      .get(`/api/payfast/contributions?groupId=${groupId}`)

    expect(res.status).toBe(401)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// DISBURSEMENT TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/payfast/disburse", () => {

  test("creates a pending disbursement record", async () => {
    // First add a paid contribution so there's a pool
    await Contribution.create({
      group: groupId, member: memberId,
      amount: 500, month: currentMonth(),
      status: "paid", reference: "POOL-REF",
    })

    const res = await request(app)
      .post("/api/payfast/disburse")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupId: groupId.toString(), memberId: memberId.toString(), note: "First payout" })

    expect(res.status).toBe(201)
    expect(res.body.disbursement.status).toBe("pending")
    expect(res.body.disbursement.amount).toBe(500)
    expect(res.body.message).toMatch(/R500/)
  })

  test("prevents duplicate disbursement for same member and month", async () => {
    await Disbursement.create({
      group: groupId, member: memberId,
      amount: 500, month: currentMonth(),
      status: "pending", reference: "PAYOUT-001",
    })

    const res = await request(app)
      .post("/api/payfast/disburse")
      .set("Authorization", `Bearer ${token}`)
      .send({ groupId: groupId.toString(), memberId: memberId.toString() })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already initiated/)
  })

  test("returns 400 when groupId is missing", async () => {
    const res = await request(app)
      .post("/api/payfast/disburse")
      .set("Authorization", `Bearer ${token}`)
      .send({ memberId: memberId.toString() })

    expect(res.status).toBe(400)
  })

  test("returns 401 without token", async () => {
    const res = await request(app)
      .post("/api/payfast/disburse")
      .send({ groupId: groupId.toString(), memberId: memberId.toString() })

    expect(res.status).toBe(401)
  })

})

describe("PATCH /api/payfast/disburse/:id", () => {

  test("marks a disbursement as paid", async () => {
    const disbursement = await Disbursement.create({
      group: groupId, member: memberId,
      amount: 500, month: currentMonth(),
      status: "pending", reference: "PAYOUT-MARK-001",
    })

    const res = await request(app)
      .patch(`/api/payfast/disburse/${disbursement._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send()

    expect(res.status).toBe(200)
    expect(res.body.status).toBe("paid")
    expect(res.body.paidAt).not.toBeNull()
  })
  

  test("returns 404 for a disbursement that doesn't belong to user", async () => {
    const otherUserId = new mongoose.Types.ObjectId()
    const otherToken  = jwt.sign({ id: otherUserId }, "test_secret")

    const disbursement = await Disbursement.create({
      group: groupId, member: memberId,
      amount: 500, month: currentMonth(),
      status: "pending", reference: "PAYOUT-OTHER",
    })

    const res = await request(app)
      .patch(`/api/payfast/disburse/${disbursement._id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send()

    expect(res.status).toBe(404)
  })

})



// ─────────────────────────────────────────────────────────────────────────────
// GET DISBURSEMENTS TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/payfast/disbursements", () => {

  test("returns all disbursements for a group", async () => {
    await Disbursement.create([
      { group: groupId, member: memberId, amount: 500, month: currentMonth(), status: "pending", reference: "D1" },
      { group: groupId, member: memberId, amount: 500, month: "2025-01",      status: "paid",    reference: "D2" },
    ])

    const res = await request(app)
      .get(`/api/payfast/disbursements?groupId=${groupId}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  test("returns 400 when groupId missing", async () => {
    const res = await request(app)
      .get("/api/payfast/disbursements")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(400)
  })

})

// ── Helper (mirrors the one in Group2.jsx) ────────────────────────────────────
function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}