import React, { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMonth, formatDateTime } from "../../utils/helpers";

const API = import.meta.env.VITE_API_URL;

// ── Download compliance report from backend ───────────────────────────────────
async function downloadComplianceReport(groupId, type) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const token = user.token || user.accessToken || user.user?.token;
  const res = await fetch(`${API}/api/reports/${groupId}?format=${type}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server error ${res.status}`);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `compliance_report.${type}`;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Payment history client-side exports ───────────────────────────────────────
function exportHistoryCSV(contributions, groupName) {
  const lines = [];
  lines.push(`"PAYMENT HISTORY REPORT"`);
  lines.push(`"Group:","${groupName}"`);
  lines.push(`"Generated:","${new Date().toLocaleDateString("en-ZA")}"`);
  lines.push(`""`);
  lines.push([`"Member"`, `"Month"`, `"Amount (R)"`, `"Reference"`, `"Status"`, `"Date Paid"`].join(","));
  contributions.forEach((c) => {
    lines.push([
      `"${c.member?.name || "-"}"`,
      `"${formatMonth(c.month)}"`,
      `"R${c.amount}"`,
      `"${c.reference || "-"}"`,
      `"${c.status.toUpperCase()}"`,
      `"${c.paidAt ? formatDateTime(c.paidAt) : "-"}"`,
    ].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payment_history_${(groupName || "group").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportHistoryPDF(contributions, groupName) {
  const doc = new jsPDF({ orientation: "landscape" });

  // Header bar
  doc.setFillColor(19, 25, 41);
  doc.rect(0, 0, doc.internal.pageSize.width, 22, "F");
  doc.setFillColor(155, 127, 212);
  doc.rect(0, 0, 4, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(196, 168, 240);
  doc.text(groupName || "Stokvel Group", 10, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(122, 122, 154);
  doc.text("Payment History Report", 10, 19);
  doc.setTextColor(122, 122, 154);
  doc.text(new Date().toLocaleDateString("en-ZA"), doc.internal.pageSize.width - 14, 13, { align: "right" });

  const paid    = contributions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const pending = contributions.filter((c) => c.status === "pending").length;
  const missed  = contributions.filter((c) => c.status === "missed").length;

  // Meta strip
  doc.setFillColor(26, 34, 56);
  doc.rect(0, 22, doc.internal.pageSize.width, 12, "F");
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(240, 238, 255);
  doc.text(`Total Collected: R${paid.toLocaleString()}`, 10, 30);
  doc.text(`Pending: ${pending}`, 80, 30);
  doc.text(`Missed: ${missed}`, 130, 30);
  doc.text(`Records: ${contributions.length}`, 180, 30);

  autoTable(doc, {
    startY: 38,
    head: [["Member", "Month", "Amount (R)", "Reference", "Status", "Date Paid"]],
    body: contributions.map((c) => [
      c.member?.name || "-",
      formatMonth(c.month),
      `R${c.amount}`,
      c.reference || "-",
      c.status.toUpperCase(),
      c.paidAt ? formatDateTime(c.paidAt) : "-",
    ]),
    theme: "grid",
    headStyles: { fillColor: [26, 34, 56], textColor: [240, 238, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [244, 242, 255] },
    bodyStyles: { fontSize: 8, textColor: [17, 17, 17] },
    columnStyles: {
      4: {
        fontStyle: "bold",
        cellWidth: 28,
      },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 4) {
        const val = String(data.cell.raw).toUpperCase();
        if (val === "PAID")    data.cell.styles.textColor = [33, 139, 52];
        else if (val === "MISSED")  data.cell.styles.textColor = [123, 17, 17];
        else if (val === "PENDING") data.cell.styles.textColor = [224, 181, 76];
      }
    },
    margin: { left: 10, right: 10 },
  });

  // Footer
  const pageH = doc.internal.pageSize.height;
  doc.setFillColor(19, 25, 41);
  doc.rect(0, pageH - 10, doc.internal.pageSize.width, 10, "F");
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(122, 122, 154);
  doc.text("Stokvel Platform  |  Confidential", doc.internal.pageSize.width / 2, pageH - 3, { align: "center" });

  doc.save(`payment_history_${(groupName || "group").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Custom report export helpers ──────────────────────────────────────────────
function exportCustomCSV(rows, filters, groupName) {
  const lines = [];
  lines.push(`"CUSTOM REPORT"`);
  lines.push(`"Group:","${groupName}"`);
  if (filters.fromMonth) lines.push(`"From:","${formatMonth(filters.fromMonth)}"`);
  if (filters.toMonth)   lines.push(`"To:","${formatMonth(filters.toMonth)}"`);
  lines.push(`"Statuses:","${filters.statuses.join(", ")}"`);
  lines.push(`"Generated:","${new Date().toLocaleDateString("en-ZA")}"`);
  lines.push(`""`);
  lines.push([`"Member"`,`"Month"`,`"Amount (R)"`,`"Reference"`,`"Status"`,`"Date Paid"`].join(","));
  rows.forEach((c) => {
    lines.push([
      `"${c.member?.name || "-"}"`,
      `"${formatMonth(c.month)}"`,
      `"R${c.amount}"`,
      `"${c.reference || "-"}"`,
      `"${c.status.toUpperCase()}"`,
      `"${c.paidAt ? formatDateTime(c.paidAt) : "-"}"`,
    ].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `custom_report_${(groupName || "group").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCustomPDF(rows, filters, groupName) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;

  // Header
  doc.setFillColor(19, 25, 41); doc.rect(0, 0, pageW, 22, "F");
  doc.setFillColor(92, 155, 224); doc.rect(0, 0, 4, 22, "F");
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(196, 168, 240);
  doc.text(groupName || "Stokvel Group", 10, 13);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(122, 122, 154);
  doc.text("Custom Report", 10, 19);
  doc.text(new Date().toLocaleDateString("en-ZA"), pageW - 14, 13, { align: "right" });

  // Filter strip
  doc.setFillColor(26, 34, 56); doc.rect(0, 22, pageW, 12, "F");
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(240, 238, 255);
  const meta = [];
  if (filters.fromMonth) meta.push(`From: ${formatMonth(filters.fromMonth)}`);
  if (filters.toMonth)   meta.push(`To: ${formatMonth(filters.toMonth)}`);
  meta.push(`Status: ${filters.statuses.join(", ")}`);
  meta.push(`Records: ${rows.length}`);
  meta.forEach((t, i) => doc.text(t, 10 + i * 68, 30));

  autoTable(doc, {
    startY: 38,
    head: [["Member", "Month", "Amount (R)", "Reference", "Status", "Date Paid"]],
    body: rows.map((c) => [
      c.member?.name || "-",
      formatMonth(c.month),
      `R${c.amount}`,
      c.reference || "-",
      c.status.toUpperCase(),
      c.paidAt ? formatDateTime(c.paidAt) : "-",
    ]),
    theme: "grid",
    headStyles: { fillColor: [26, 34, 56], textColor: [240, 238, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [244, 242, 255] },
    bodyStyles: { fontSize: 8, textColor: [17, 17, 17] },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 4) {
        const v = String(data.cell.raw);
        if (v === "PAID")    data.cell.styles.textColor = [33, 139, 52];
        else if (v === "MISSED")  data.cell.styles.textColor = [123, 17, 17];
        else if (v === "PENDING") data.cell.styles.textColor = [224, 181, 76];
      }
    },
    margin: { left: 10, right: 10 },
  });

  // Footer
  doc.setFillColor(19, 25, 41); doc.rect(0, pageH - 10, pageW, 10, "F");
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(122, 122, 154);
  doc.text("Stokvel Platform  |  Custom Report  |  Confidential", pageW / 2, pageH - 3, { align: "center" });

  doc.save(`custom_report_${(groupName || "group").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Custom Report component ───────────────────────────────────────────────────
function CustomReport({ contributions, members, group }) {
  const availableMonths = [...new Set(contributions.map((c) => c.month).filter(Boolean))].sort();
  const allStatuses = ["paid", "missed", "pending", "failed"];

  const [fromMonth,       setFromMonth]       = useState(availableMonths[0] || "");
  const [toMonth,         setToMonth]         = useState(availableMonths[availableMonths.length - 1] || "");
  const [selectedMembers, setSelectedMembers] = useState(new Set());   // empty = all
  const [statuses,        setStatuses]        = useState(new Set(["paid", "missed", "pending"]));
  const [preview,         setPreview]         = useState(null);
  const [exporting,       setExporting]       = useState("");

  function toggleMember(id) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleStatus(s) {
    setStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  function applyFilters() {
    let rows = [...contributions];
    if (fromMonth) rows = rows.filter((c) => (c.month || "") >= fromMonth);
    if (toMonth)   rows = rows.filter((c) => (c.month || "") <= toMonth);
    if (selectedMembers.size > 0)
      rows = rows.filter((c) => selectedMembers.has(c.member?._id || c.member));
    rows = rows.filter((c) => statuses.has(c.status));
    setPreview(rows);
  }

  function clearFilters() {
    setFromMonth(availableMonths[0] || "");
    setToMonth(availableMonths[availableMonths.length - 1] || "");
    setSelectedMembers(new Set());
    setStatuses(new Set(["paid", "missed", "pending"]));
    setPreview(null);
  }

  async function handleExport(fmt) {
    if (!preview) return;
    setExporting(fmt);
    try {
      const filters = {
        fromMonth,
        toMonth,
        statuses: [...statuses],
      };
      if (fmt === "csv") exportCustomCSV(preview, filters, group?.name);
      else exportCustomPDF(preview, filters, group?.name);
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    } finally {
      setExporting("");
    }
  }

  const totalPaid = preview?.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0) ?? 0;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h3 className="card-title" style={{ margin: "0 0 4px" }}>Custom Report</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Filter by period, member and status, then preview or export.
          </p>
        </div>
        {preview && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 16 }}>
            <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}
              onClick={() => handleExport("csv")} disabled={!!exporting}>
              {exporting === "csv" ? "Exporting…" : "💾 CSV"}
            </button>
            <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}
              onClick={() => handleExport("pdf")} disabled={!!exporting}>
              {exporting === "pdf" ? "Exporting…" : "📄 PDF"}
            </button>
          </div>
        )}
      </div>

      {/* Filter controls */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>

        {/* Period range */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Period Range</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={fromMonth} onChange={(e) => setFromMonth(e.target.value)}
              style={selectStyle}>
              <option value="">Any start</option>
              {availableMonths.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>to</span>
            <select value={toMonth} onChange={(e) => setToMonth(e.target.value)}
              style={selectStyle}>
              <option value="">Any end</option>
              {availableMonths.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
          </div>
        </div>

        {/* Status filter */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Status</div>
          <div style={{ display: "flex", gap: 10 }}>
            {allStatuses.map((s) => (
              <label key={s} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={statuses.has(s)} onChange={() => toggleStatus(s)}
                  style={{ accentColor: "var(--gold)" }} />
                <span style={{ color: statusColor(s), fontWeight: 600, textTransform: "capitalize" }}>{s}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Member filter */}
        {members.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Members <span style={{ fontSize: 10, color: "var(--text-dim)" }}>(none = all)</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 400 }}>
              {members.map((m) => {
                const active = selectedMembers.has(m._id);
                return (
                  <button key={m._id} onClick={() => toggleMember(m._id)}
                    style={{
                      padding: "4px 10px", fontSize: 12, borderRadius: 20, border: "1px solid",
                      cursor: "pointer", transition: "0.15s",
                      background: active ? "var(--gold)" : "transparent",
                      borderColor: active ? "var(--gold)" : "var(--border)",
                      color: active ? "#fff" : "var(--text-muted)",
                    }}>
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: preview ? 20 : 0 }}>
        <button className="btn-primary" style={{ padding: "8px 20px", fontSize: 13 }} onClick={applyFilters}>
          Generate Preview
        </button>
        {preview && (
          <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }} onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* Preview results */}
      {preview && (
        <>
          {/* Summary bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "Records",  value: preview.length,   color: "var(--blue)" },
              { label: "Collected", value: `R${totalPaid.toLocaleString()}`, color: "var(--green)" },
              { label: "Paid",     value: preview.filter((c) => c.status === "paid").length,    color: "var(--green)" },
              { label: "Missed",   value: preview.filter((c) => c.status === "missed").length,  color: "var(--red)" },
              { label: "Pending",  value: preview.filter((c) => c.status === "pending").length, color: "var(--yellow)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderLeft: `3px solid ${color}`, borderRadius: 8,
                padding: "8px 16px", minWidth: 90,
              }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>

          {preview.length === 0 ? (
            <p className="empty-state">No records match your filters.</p>
          ) : (
            <div className="meetings-table-wrap">
              <table className="meetings-table">
                <thead>
                  <tr>{["Member", "Month", "Amount", "Reference", "Status", "Date"].map((h) => <th key={h} scope="col">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((c) => (
                    <tr key={c._id}>
                      <td><strong>{c.member?.name || "—"}</strong></td>
                      <td>{formatMonth(c.month)}</td>
                      <td style={{ color: "var(--green)", fontWeight: 600 }}>R{c.amount}</td>
                      <td><code style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.reference || "—"}</code></td>
                      <td><span className={`status-badge ${c.status}`}>{c.status}</span></td>
                      <td>{c.paidAt ? formatDateTime(c.paidAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const selectStyle = {
  background: "var(--surface)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 13,
  cursor: "pointer",
};

function statusColor(s) {
  if (s === "paid")    return "var(--green)";
  if (s === "missed")  return "var(--red)";
  if (s === "pending") return "var(--yellow)";
  return "var(--text-muted)";
}

// ── Reports page component ────────────────────────────────────────────────────
export function Reports({ group, contributions, members }) {
  const [compliance, setCompliance]   = useState(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const [compError, setCompError]     = useState("");
  const [exporting, setExporting]     = useState("");

  // Fetch compliance data on mount
  useEffect(() => {
    if (!group?._id) return;
    setLoadingComp(true);
    setCompError("");
    const user  = JSON.parse(localStorage.getItem("user") || "{}");
    const token = user.token || user.accessToken || user.user?.token;
    fetch(`${API}/api/reports/${group._id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setCompliance(d); })
      .catch((e) => setCompError(e.message))
      .finally(() => setLoadingComp(false));
  }, [group?._id]);

  async function handleExport(reportType, format) {
    const key = `${reportType}-${format}`;
    setExporting(key);
    try {
      if (reportType === "compliance") {
        await downloadComplianceReport(group._id, format);
      } else {
        if (format === "csv") exportHistoryCSV(contributions, group?.name);
        else exportHistoryPDF(contributions, group?.name);
      }
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    } finally {
      setExporting("");
    }
  }

  const paidCount    = contributions.filter((c) => c.status === "paid").length;
  const totalCollected = contributions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);

  return (
    <section aria-labelledby="reports-heading">
      <header className="section-header-bar">
        <h2 id="reports-heading">Reports</h2>
      </header>

      {/* ── Compliance Report ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h3 className="card-title" style={{ margin: "0 0 4px" }}>Compliance Report</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Per-member contribution compliance across all periods, based on group frequency ({group?.freq || "Monthly"}).
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 16 }}>
            <button
              className="btn-secondary"
              style={{ padding: "6px 14px", fontSize: 13 }}
              onClick={() => handleExport("compliance", "csv")}
              disabled={!!exporting}
            >
              {exporting === "compliance-csv" ? "Exporting…" : "💾 CSV"}
            </button>
            <button
              className="btn-secondary"
              style={{ padding: "6px 14px", fontSize: 13 }}
              onClick={() => handleExport("compliance", "pdf")}
              disabled={!!exporting}
            >
              {exporting === "compliance-pdf" ? "Exporting…" : "📄 PDF"}
            </button>
          </div>
        </div>

        {loadingComp && (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading compliance data…</p>
        )}
        {compError && (
          <p style={{ color: "var(--red)", fontSize: 13 }}>{compError}</p>
        )}
        {compliance && !loadingComp && (
          <>
            {/* Group compliance badge */}
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${compliance.groupCompliance >= 80 ? "var(--green)" : compliance.groupCompliance >= 50 ? "var(--yellow)" : "var(--red)"}`,
                borderRadius: 8, padding: "12px 20px", minWidth: 140,
              }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Group Compliance</div>
                <div style={{
                  fontSize: 28, fontWeight: 700, marginTop: 4,
                  color: compliance.groupCompliance >= 80 ? "var(--green)" : compliance.groupCompliance >= 50 ? "var(--yellow)" : "var(--red)",
                }}>
                  {compliance.groupCompliance}%
                </div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "4px solid var(--gold)", borderRadius: 8, padding: "12px 20px", minWidth: 120 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Periods</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--gold-light)", marginTop: 4 }}>{compliance.periods.length}</div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "4px solid var(--blue)", borderRadius: 8, padding: "12px 20px", minWidth: 120 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Members</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--blue)", marginTop: 4 }}>{compliance.report.length}</div>
              </div>
            </div>

            {/* Per-member compliance table */}
            <div className="meetings-table-wrap">
              <table className="meetings-table">
                <caption className="sr-only">Member compliance summary</caption>
                <thead>
                  <tr>
                    {["Member", "Role", "Paid", "Missed", "Pending", "Total Paid (R)", "Compliance"].map((h) => (
                      <th key={h} scope="col">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compliance.report.map((m) => {
                    const color = m.compliancePercentage >= 80 ? "var(--green)" : m.compliancePercentage >= 50 ? "var(--yellow)" : "var(--red)";
                    return (
                      <tr key={m.memberId}>
                        <td><strong>{m.name}</strong></td>
                        <td><span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>{m.role}</span></td>
                        <td style={{ color: "var(--green)", fontWeight: 600 }}>{m.totalPaid}</td>
                        <td style={{ color: "var(--red)" }}>{m.missedCount}</td>
                        <td style={{ color: "var(--yellow)" }}>{m.pendingCount}</td>
                        <td style={{ color: "var(--gold-light)", fontWeight: 600 }}>R{m.totalPaidAmount.toLocaleString()}</td>
                        <td>
                          <span style={{ color, fontWeight: 700, fontSize: 14 }}>{m.compliancePercentage}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Payment History Report ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h3 className="card-title" style={{ margin: "0 0 4px" }}>Payment History</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Full transaction log for all members — {paidCount} paid payment{paidCount !== 1 ? "s" : ""}, R{totalCollected.toLocaleString()} collected.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 16 }}>
            <button
              className="btn-secondary"
              style={{ padding: "6px 14px", fontSize: 13 }}
              onClick={() => handleExport("history", "csv")}
              disabled={!!exporting}
            >
              {exporting === "history-csv" ? "Exporting…" : "💾 CSV"}
            </button>
            <button
              className="btn-secondary"
              style={{ padding: "6px 14px", fontSize: 13 }}
              onClick={() => handleExport("history", "pdf")}
              disabled={!!exporting}
            >
              {exporting === "history-pdf" ? "Exporting…" : "📄 PDF"}
            </button>
          </div>
        </div>

        {contributions.length === 0 ? (
          <p className="empty-state">No payment records yet.</p>
        ) : (
          <div className="meetings-table-wrap">
            <table className="meetings-table">
              <caption className="sr-only">Payment history</caption>
              <thead>
                <tr>{["Member", "Month", "Amount", "Reference", "Status", "Date"].map((h) => <th key={h} scope="col">{h}</th>)}</tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c._id}>
                    <td><strong>{c.member?.name || "—"}</strong></td>
                    <td>{formatMonth(c.month)}</td>
                    <td style={{ color: "var(--green)", fontWeight: 600 }}>R{c.amount}</td>
                    <td><code style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.reference || "—"}</code></td>
                    <td>
                      <span className={`status-badge ${c.status}`}>{c.status}</span>
                    </td>
                    <td>{c.paidAt ? formatDateTime(c.paidAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Custom Report ── */}
      <CustomReport group={group} contributions={contributions} members={members} />
    </section>
  );
}
