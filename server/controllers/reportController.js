const mongoose = require("mongoose")
const PDFDocument = require("pdfkit")

// ── Brand colours (from g.css) ────────────────────────────────────────────────
const C = {
  bg:        "#131929",
  surface:   "#1a2238",
  border:    "#252d45",
  gold:      "#9b7fd4",
  goldLight: "#c4a8f0",
  green:     "#218b34",
  red:       "#7b1111",
  yellow:    "#e0b54c",
  blue:      "#5c9be0",
  text:      "#f0eeff",
  muted:     "#7a7a9a",
  rowEven:   "#f4f2ff",   // very light lavender tint for print
  rowOdd:    "#ffffff",
  black:     "#111111",
}

// ── Period generators ─────────────────────────────────────────────────────────

function generatePeriods(groupCreatedAt, freq) {
  const start = new Date(groupCreatedAt)
  start.setHours(0, 0, 0, 0)
  const now = new Date()
  const periods = []

  if (!freq || freq === "Monthly") {
    let cur = new Date(start.getFullYear(), start.getMonth(), 1)
    const endMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    while (cur <= endMonth) {
      const id = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`
      periods.push({
        id,
        label: cur.toLocaleDateString("en-ZA", { month: "short", year: "numeric" }),
        start: new Date(cur),
        end: new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59),
        type: "monthly",
      })
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
  } else if (freq === "Weekly") {
    let cur = new Date(start)
    let n = 1
    while (cur <= now) {
      const end = new Date(cur)
      end.setDate(end.getDate() + 6)
      end.setHours(23, 59, 59)
      periods.push({
        id: `${cur.getFullYear()}-W${String(n).padStart(3, "0")}`,
        label: `Wk ${n} - ${cur.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}`,
        start: new Date(cur),
        end: new Date(Math.min(end.getTime(), now.getTime())),
        type: "weekly",
      })
      cur.setDate(cur.getDate() + 7)
      n++
    }
  } else if (freq === "Bi-weekly") {
    let cur = new Date(start)
    let n = 1
    while (cur <= now) {
      const end = new Date(cur)
      end.setDate(end.getDate() + 13)
      end.setHours(23, 59, 59)
      periods.push({
        id: `${cur.getFullYear()}-BW${String(n).padStart(3, "0")}`,
        label: `BW ${n} - ${cur.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}`,
        start: new Date(cur),
        end: new Date(Math.min(end.getTime(), now.getTime())),
        type: "biweekly",
      })
      cur.setDate(cur.getDate() + 14)
      n++
    }
  }

  return periods
}

function matchContribToPeriod(contrib, period) {
  if (period.type === "monthly") {
    return contrib.month === period.id
  }
  const date = contrib.paidAt ? new Date(contrib.paidAt) : new Date(contrib.createdAt)
  return date >= period.start && date <= period.end
}

// ── Shared data builder ───────────────────────────────────────────────────────

async function buildReportData(groupId) {
  const Group = mongoose.models.Group
  const Member = mongoose.models.Member
  const Contribution = mongoose.models.Contribution

  if (!Group) throw new Error("Group model not registered")
  if (!Member) throw new Error("Member model not registered")

  const group = await Group.findById(groupId)
  if (!group) return null

  const members = await Member.find({ group: groupId, status: "active" }).sort("createdAt")
  const allContributions = Contribution
    ? await Contribution.find({ group: groupId })
    : []

  const freq = group.freq || "Monthly"
  const allPeriods = generatePeriods(group.createdAt, freq)

  const report = members.map((member) => {
    const memberContribs = allContributions.filter(
      (c) => c.member?.toString() === member._id.toString()
    )

    const periodStatuses = allPeriods.map((period) => {
      const contrib = memberContribs.find((c) => matchContribToPeriod(c, period))
      return {
        periodId: period.id,
        label: period.label,
        status: contrib?.status || "missed",
        amount: contrib?.status === "paid" ? contrib.amount : 0,
        paidAt: contrib?.paidAt || null,
      }
    })

    const totalExpected = allPeriods.length
    const totalPaid = periodStatuses.filter((p) => p.status === "paid").length
    const totalPaidAmount = periodStatuses
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0)
    const missedCount = periodStatuses.filter((p) => p.status === "missed").length
    const pendingCount = periodStatuses.filter((p) => p.status === "pending").length
    const compliancePercentage = totalExpected
      ? Math.round((totalPaid / totalExpected) * 100)
      : 0

    return {
      memberId: member._id,
      name: member.name,
      email: member.contact,
      role: member.role,
      periodStatuses,
      totalExpected,
      totalPaid,
      totalPaidAmount,
      missedCount,
      pendingCount,
      compliancePercentage,
    }
  })

  const overallPaid = report.reduce((sum, m) => sum + m.totalPaid, 0)
  const overallExpected = report.reduce((sum, m) => sum + m.totalExpected, 0)
  const groupCompliance = overallExpected
    ? Math.round((overallPaid / overallExpected) * 100)
    : 0

  return {
    groupName: group.name,
    freq,
    amount: group.amount,
    periods: allPeriods.map((p) => ({ id: p.id, label: p.label })),
    report,
    groupCompliance,
  }
}

// ── JSON report ───────────────────────────────────────────────────────────────

async function getContributionCompliance(req, res) {
  try {
    const data = await buildReportData(req.params.groupId)
    if (!data) return res.status(404).json({ error: "Group not found" })
    res.json(data)
  } catch (err) {
    console.error("Compliance report error:", err)
    res.status(500).json({ error: err.message })
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────

async function exportComplianceCSV(req, res) {
  try {
    const data = await buildReportData(req.params.groupId)
    if (!data) return res.status(404).json({ error: "Group not found" })

    const { groupName, freq, amount, periods, report, groupCompliance } = data
    const dateStr = new Date().toLocaleDateString("en-ZA")

    const lines = []

    // Header block
    lines.push(`"STOKVEL CONTRIBUTION COMPLIANCE REPORT"`)
    lines.push(`"Group:","${groupName}"`)
    lines.push(`"Frequency:","${freq}"`)
    lines.push(`"Contribution Amount:","R${Number(amount).toLocaleString()}"`)
    lines.push(`"Group Compliance:","${groupCompliance}%"`)
    lines.push(`"Generated:","${dateStr}"`)
    lines.push(`""`)

    // Summary table header
    const summaryHeaders = [
      "Member", "Email", "Role",
      "Expected", "Paid", "Missed", "Pending",
      "Total Paid (R)", "Compliance %", "Standing",
    ]
    lines.push(summaryHeaders.map(h => `"${h}"`).join(","))

    // Summary rows
    report.forEach((m) => {
      const standing = m.compliancePercentage >= 80 ? "GOOD" : m.compliancePercentage >= 50 ? "AT RISK" : "POOR"
      lines.push([
        `"${m.name}"`,
        `"${m.email}"`,
        `"${m.role}"`,
        m.totalExpected,
        m.totalPaid,
        m.missedCount,
        m.pendingCount,
        `"R${m.totalPaidAmount.toLocaleString()}"`,
        `"${m.compliancePercentage}%"`,
        `"${standing}"`,
      ].join(","))
    })

    lines.push(`""`)

    // Period detail table
    if (periods.length > 0) {
      lines.push(`"PERIOD DETAIL"`)
      const periodHeaders = ["Member", ...periods.map(p => `"${p.label}"`)]
      lines.push([`"Member"`, ...periods.map(p => `"${p.label}"`)].join(","))

      report.forEach((m) => {
        const cells = [
          `"${m.name}"`,
          ...periods.map((p) => {
            const ps = m.periodStatuses.find((s) => s.periodId === p.id)
            return `"${ps?.status === "paid" ? "PAID" : ps?.status === "pending" ? "PENDING" : "MISSED"}"`
          }),
        ]
        lines.push(cells.join(","))
      })
    }

    const csv = lines.join("\n")
    const filename = `compliance_${(groupName || "group").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err) {
    console.error("CSV export error:", err)
    res.status(500).json({ error: err.message })
  }
}

// ── PDF helpers ───────────────────────────────────────────────────────────────

function pdfTableRow(doc, cells, colWidths, y, bg, textColor, fontSize = 9) {
  const x = doc.page.margins.left
  const totalW = colWidths.reduce((a, b) => a + b, 0)
  const rowH = 18
  doc.rect(x, y, totalW, rowH).fill(bg)
  doc.font("Helvetica").fontSize(fontSize).fill(textColor)
  cells.forEach((cell, i) => {
    const cx = colWidths.slice(0, i).reduce((a, b) => a + b, x)
    doc.text(String(cell ?? ""), cx + 4, y + 5, { width: colWidths[i] - 8, align: "left", lineBreak: false })
  })
  return rowH
}

function pdfTableHeader(doc, headers, colWidths, y) {
  const x = doc.page.margins.left
  const totalW = colWidths.reduce((a, b) => a + b, 0)
  const rowH = 20
  doc.rect(x, y, totalW, rowH).fill(C.surface)
  // Left accent stripe
  doc.rect(x, y, 4, rowH).fill(C.gold)
  doc.font("Helvetica-Bold").fontSize(8).fill(C.text)
  headers.forEach((h, i) => {
    const cx = colWidths.slice(0, i).reduce((a, b) => a + b, x)
    doc.text(h, cx + (i === 0 ? 8 : 4), y + 6, { width: colWidths[i] - 8, align: "left", lineBreak: false })
  })
  return rowH
}

function pdfSectionTitle(doc, title, y) {
  const x = doc.page.margins.left
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right
  doc.rect(x, y, w, 22).fill(C.bg)
  doc.rect(x, y, 3, 22).fill(C.gold)
  doc.font("Helvetica-Bold").fontSize(10).fill(C.goldLight)
    .text(title, x + 12, y + 6, { width: w - 16, lineBreak: false })
  return 22
}

// ── PDF export ────────────────────────────────────────────────────────────────

async function exportCompliancePDF(req, res) {
  try {
    const data = await buildReportData(req.params.groupId)
    if (!data) return res.status(404).json({ error: "Group not found" })

    const { groupName, freq, amount, periods, report, groupCompliance } = data
    const filename = `compliance_${(groupName || "group").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)

    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" })
    doc.pipe(res)

    const pageW = doc.page.width
    const pageH = doc.page.height
    const ml = doc.page.margins.left
    const mr = doc.page.margins.right
    const contentW = pageW - ml - mr

    // ── Hero header ──
    doc.rect(0, 0, pageW, 60).fill(C.bg)
    doc.rect(0, 0, 6, 60).fill(C.gold)
    doc.font("Helvetica-Bold").fontSize(20).fill(C.goldLight)
      .text(groupName || "Stokvel Group", ml + 12, 12, { lineBreak: false })
    doc.font("Helvetica").fontSize(9).fill(C.muted)
      .text("Contribution Compliance Report", ml + 12, 36, { lineBreak: false })

    // Compliance badge (top right)
    const badgeColor = groupCompliance >= 80 ? C.green : groupCompliance >= 50 ? C.yellow : C.red
    const badgeX = pageW - mr - 90
    doc.rect(badgeX, 10, 82, 40).fill(C.surface)
    doc.rect(badgeX, 10, 3, 40).fill(badgeColor)
    doc.font("Helvetica-Bold").fontSize(22).fill(badgeColor)
      .text(`${groupCompliance}%`, badgeX + 8, 14, { width: 74, align: "center", lineBreak: false })
    doc.font("Helvetica").fontSize(7).fill(C.muted)
      .text("GROUP COMPLIANCE", badgeX + 8, 38, { width: 74, align: "center", lineBreak: false })

    // ── Metadata strip ──
    doc.rect(0, 60, pageW, 22).fill(C.surface)
    const meta = [
      `Frequency: ${freq}`,
      `Contribution: R${Number(amount).toLocaleString()}`,
      `Members: ${report.length}`,
      `Generated: ${new Date().toLocaleDateString("en-ZA")}`,
    ]
    doc.font("Helvetica").fontSize(8).fill(C.text)
    meta.forEach((item, i) => {
      doc.text(item, ml + i * (contentW / meta.length), 67, {
        width: contentW / meta.length - 8,
        lineBreak: false,
      })
    })

    let y = 92

    // ── Member Summary ──
    y += pdfSectionTitle(doc, "Member Summary", y) + 6

    const sumCols = [130, 65, 52, 38, 48, 52, 80, 68]
    const sumHeaders = ["Member", "Role", "Expected", "Paid", "Missed", "Pending", "Total Paid (R)", "Compliance"]
    y += pdfTableHeader(doc, sumHeaders, sumCols, y)

    report.forEach((m, ri) => {
      if (y > pageH - doc.page.margins.bottom - 30) {
        doc.addPage({ layout: "landscape" })
        y = doc.page.margins.top
        y += pdfTableHeader(doc, sumHeaders, sumCols, y)
      }

      const bg = ri % 2 === 0 ? C.rowEven : C.rowOdd
      const compColor = m.compliancePercentage >= 80 ? C.green : m.compliancePercentage >= 50 ? C.yellow : C.red

      // Draw row bg
      const totalW = sumCols.reduce((a, b) => a + b, 0)
      doc.rect(ml, y, totalW, 18).fill(bg)

      // Left cells
      const regularCells = [
        m.name, m.role,
        m.totalExpected, m.totalPaid, m.missedCount, m.pendingCount,
        `R${m.totalPaidAmount.toLocaleString()}`,
      ]
      doc.font("Helvetica").fontSize(9).fill(C.black)
      regularCells.forEach((cell, i) => {
        const cx = sumCols.slice(0, i).reduce((a, b) => a + b, ml)
        doc.text(String(cell), cx + 4, y + 5, { width: sumCols[i] - 8, align: "left", lineBreak: false })
      })

      // Compliance % cell with colour
      const cx7 = sumCols.slice(0, 7).reduce((a, b) => a + b, ml)
      doc.rect(cx7, y, sumCols[7], 18).fill(bg)
      doc.font("Helvetica-Bold").fontSize(9).fill(compColor)
        .text(`${m.compliancePercentage}%`, cx7 + 4, y + 5, { width: sumCols[7] - 8, lineBreak: false })

      y += 18
    })

    y += 14

    // ── Period Detail ──
    if (y > pageH - doc.page.margins.bottom - 60) {
      doc.addPage({ layout: "landscape" })
      y = doc.page.margins.top
    }

    y += pdfSectionTitle(doc, "Period Detail (last 12 periods)", y) + 6

    const displayPeriods = periods.slice(-12)
    if (displayPeriods.length > 0) {
      const pNameW = 120
      const pColW = Math.max(
        30,
        Math.floor((contentW - pNameW) / displayPeriods.length)
      )
      const pTotalW = pNameW + pColW * displayPeriods.length

      // Period table header
      const rowH = 20
      doc.rect(ml, y, pTotalW, rowH).fill(C.surface)
      doc.rect(ml, y, 4, rowH).fill(C.gold)
      doc.font("Helvetica-Bold").fontSize(7).fill(C.text)
        .text("Member", ml + 8, y + 6, { width: pNameW - 10, lineBreak: false })
      displayPeriods.forEach((p, i) => {
        doc.text(p.label, ml + pNameW + i * pColW, y + 6, { width: pColW - 2, align: "center", lineBreak: false })
      })
      y += rowH

      report.forEach((m, ri) => {
        if (y > pageH - doc.page.margins.bottom - 20) {
          doc.addPage({ layout: "landscape" })
          y = doc.page.margins.top
        }
        const bg = ri % 2 === 0 ? C.rowEven : C.rowOdd
        doc.rect(ml, y, pTotalW, 16).fill(bg)
        doc.font("Helvetica").fontSize(8).fill(C.black)
          .text(m.name, ml + 4, y + 4, { width: pNameW - 8, lineBreak: false })

        displayPeriods.forEach((p, i) => {
          const ps = m.periodStatuses.find((s) => s.periodId === p.id)
          const status = ps?.status || "missed"
          const label = status === "paid" ? "PAID" : status === "pending" ? "PEND" : "MISS"
          const color = status === "paid" ? C.green : status === "pending" ? C.yellow : C.red
          doc.font("Helvetica-Bold").fontSize(7).fill(color)
            .text(label, ml + pNameW + i * pColW, y + 4, { width: pColW - 2, align: "center", lineBreak: false })
        })
        y += 16
      })
    }

    // ── Footer ──
    const footerY = pageH - 24
    doc.rect(0, footerY, pageW, 24).fill(C.bg)
    doc.font("Helvetica").fontSize(7).fill(C.muted)
      .text(
        `Stokvel Platform  |  Confidential  |  ${new Date().toLocaleString("en-ZA")}`,
        ml, footerY + 8, { width: contentW, align: "center", lineBreak: false }
      )

    doc.end()
  } catch (err) {
    console.error("PDF export error:", err)
    if (!res.headersSent) res.status(500).json({ error: err.message })
  }
}

module.exports = { getContributionCompliance, exportCompliancePDF, exportComplianceCSV }
