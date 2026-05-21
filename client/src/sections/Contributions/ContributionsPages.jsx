import React, { useState } from "react";
import { formatMonth, formatDateTime, currentMonth, addMonths, monthsBetween, calcInterest } from "../../utils/helpers";
import { useRates } from "../../utils/useRates";
// ── Import PDF generation engines (used for member's personal export) ────────
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const API = import.meta.env.VITE_API_URL;

// ── Compliance report download (CSV or PDF) from backend ─────────────────────
async function downloadReport(groupId, type) {
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
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Member personal CSV export (own contributions only) ──────────────────────
function exportToCSV(contributions, groupName = "Stokvel") {
  const headers = ["Member Name", "Month", "Amount (ZAR)", "Reference", "Status", "Date Paid"];
  const rows = contributions.map(c => [
    `"${c.member?.name || "—"}"`,
    `"${formatMonth(c.month)}"`,
    `"R${c.amount}"`,
    `"${c.reference || "—"}"`,
    `"${c.status}"`,
    `"${c.paidAt ? formatDateTime(c.paidAt) : "—"}"`,
  ]);
  const csvContent = "data:text/csv;charset=utf-8,"
    + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `${(groupName || "Stokvel").replace(/\s+/g, "_")}_My_Contributions.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Member personal PDF export (own contributions only) ──────────────────────
function exportToPDF(contributions, groupName = "Stokvel") {
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`${groupName || "Stokvel"} - My Contribution History`, 14, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 30);
  autoTable(doc, {
    startY: 35,
    head: [["Month", "Amount", "Reference", "Status", "Date"]],
    body: contributions.map(c => [
      formatMonth(c.month),
      `R${c.amount}`,
      c.reference || "—",
      c.status.toUpperCase(),
      c.paidAt ? formatDateTime(c.paidAt) : "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [59, 186, 140] },
    styles: { fontSize: 9 },
  });
  doc.save(`${(groupName || "Stokvel").replace(/\s+/g, "_")}_My_Contributions.pdf`);
}

// ── Admin/General Contributions ───────────────────────────────────────────────
export function Contributions({ contributions, members, group, onPay, loading, onFlagMissing, onConfirm, onFlagMissed, currentUserEmail }) {
  const month = currentMonth();
  const paidMemberIds = new Set(
    contributions.filter((c) => c.month === month && c.status === "paid").map((c) => c.member?._id || c.member)
  );
  const totalExpected  = group.amount && members.length ? Number(group.amount) * members.length : 0;
  const totalCollected = contributions
    .filter((c) => c.month === month && c.status === "paid")
    .reduce((sum, c) => sum + c.amount, 0);
  const progress = totalExpected ? Math.round((totalCollected / totalExpected) * 100) : 0;

  return (
    <section aria-labelledby="contributions-heading">
      <header className="section-header-bar">
        <h2 id="contributions-heading">Contributions</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="month-label">{formatMonth(month)}</span>
          <button className="btn-secondary" onClick={onFlagMissing}>Flag Unpaid</button>
        </div>
      </header>
      <div className="contribution-summary card" style={{ marginBottom: 24 }}>
        <div className="contrib-summary-row">
          <div>
            <div className="stat-label">Collected This Month</div>
            <div className="stat-value" style={{ fontSize: 22 }}>
              R {totalCollected.toLocaleString()}
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400 }}> / R {totalExpected.toLocaleString()}</span>
            </div>
          </div>
          <div className="contrib-progress-wrap">
            <div className="contrib-progress-bar">
              <div className="contrib-progress-fill" style={{ width: `${progress}%` }}
                role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} />
            </div>
            <span className="contrib-progress-label">{progress}% collected</span>
          </div>
        </div>
      </div>
      {members.length === 0 ? (
        <p className="empty-state">No members yet.</p>
      ) : (
        <ul className="contributions-list">
          {members.map((m) => {
            const hasPaid = paidMemberIds.has(m._id);
            const record  = contributions.find(
              (c) => (c.member?._id || c.member) === m._id && c.month === month && c.status === "paid"
            );
            return (
              <li key={m._id} className={`contribution-row${hasPaid ? " paid" : ""}`}>
                <div className="payout-avatar">{m.initials}</div>
                <div className="payout-name"><strong>{m.name}</strong><span>{m.role}</span></div>
                {hasPaid ? (
                  <div className="contrib-paid-info">
                    <span className="status-badge active">✓ Paid</span>
                    <span className="contrib-ref">{record?.reference}</span>
                    <span className="contrib-date">{formatDateTime(record?.paidAt)}</span>
                  </div>
                ) : (
                  <div className="contrib-actions">
                    <span className="status-badge pending">Unpaid</span>
                    {m.contact === currentUserEmail && (
                    <button className="btn-pay" onClick={() => onPay(m)} disabled={loading}>Pay R{group.amount}</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {contributions.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="card-title" style={{ margin: 0 }}>Payment History</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => downloadReport(group._id, "csv").catch((e) => alert(`CSV export failed: ${e.message}`))}>💾 Export CSV</button>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => downloadReport(group._id, "pdf").catch((e) => alert(`PDF export failed: ${e.message}`))}>📄 Export PDF</button>
            </div>
          </div>
          <div className="meetings-table-wrap">
            <table className="meetings-table">
              <caption className="sr-only">Contribution history</caption>
              <thead><tr>{["Member","Month","Amount","Reference","Status","Date"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c._id}>
                    <td>{c.member?.name || "—"}</td>
                    <td>{formatMonth(c.month)}</td>
                    <td style={{ color: "var(--green)", fontWeight: 600 }}>R{c.amount}</td>
                    <td><code style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.reference}</code></td>
                    <td><span className={`status-badge ${c.status}`}>{c.status}</span></td>
                    <td>{c.paidAt ? formatDateTime(c.paidAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Treasurer Contributions ───────────────────────────────────────────────────
export function TreasurerContributions({ contributions, members, group, onConfirm, onFlagMissing, onFlagMissed, loading }) {
  const month = currentMonth();
  const paidMemberIds = new Set(
    contributions.filter((c) => c.month === month && c.status === "paid").map((c) => c.member?._id || c.member)
  );
  const totalExpected  = group.amount && members.length ? Number(group.amount) * members.length : 0;
  const totalCollected = contributions
    .filter((c) => c.month === month && c.status === "paid")
    .reduce((sum, c) => sum + c.amount, 0);
  const progress = totalExpected ? Math.round((totalCollected / totalExpected) * 100) : 0;

  return (
    <section aria-labelledby="t-contributions-heading">
      <header className="section-header-bar">
        <h2 id="t-contributions-heading">Contributions</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="month-label">{formatMonth(month)}</span>
          <button className="btn-secondary" onClick={onFlagMissing}>🚩 Flag Unpaid</button>
        </div>
      </header>

      <div className="contribution-summary card" style={{ marginBottom: 24 }}>
        <div className="contrib-summary-row">
          <div>
            <div className="stat-label">Collected This Month</div>
            <div className="stat-value" style={{ fontSize: 22 }}>
              R {totalCollected.toLocaleString()}
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400 }}>
                {" "}/ R {totalExpected.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="contrib-progress-wrap">
            <div className="contrib-progress-bar">
              <div className="contrib-progress-fill" style={{ width: `${progress}%` }}
                role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} />
            </div>
            <span className="contrib-progress-label">{progress}% collected</span>
          </div>
        </div>
      </div>

      {members.length === 0 ? (
        <p className="empty-state">No members yet.</p>
      ) : (
        <ul className="contributions-list" aria-label="Member contribution status">
          {members.map((m) => {
            const hasPaid = paidMemberIds.has(m._id);
            const record  = contributions.find(
              (c) => (c.member?._id || c.member) === m._id && c.month === month && c.status === "paid"
            );
            return (
              <li key={m._id} className={`contribution-row${hasPaid ? " paid" : ""}`}>
                <div className="payout-avatar">{m.initials}</div>
                <div className="payout-name">
                  <strong>{m.name}</strong>
                  <span>{m.role}</span>
                </div>
                {hasPaid ? (
                  <div className="contrib-paid-info">
                    <span className="status-badge active">✓ Paid</span>
                    <span className="contrib-ref">{record?.reference}</span>
                    <span className="contrib-date">{formatDateTime(record?.paidAt)}</span>
                  </div>
               ) : (
                      <div className="contrib-actions">
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <span className="status-badge pending">Unpaid</span>
                          
                          <button
                            className="btn-pay"
                            style={{ background: "var(--green, #035d21)", color: "#fff" }}
                            onClick={() => onConfirm(m)}
                            disabled={loading}
                          >
                            Confirm Payment
                          </button>
                          <button
                            className="btn-flag-missed"
                            style={{ background: "#500808", color: "#fff", padding: "5px 12px", borderRadius: "30px", border: "none", cursor: loading ? "not-allowed" : "pointer" }}
                            onClick={() => onFlagMissed(m)}
                            disabled={loading}
                          >
                            Flag Missed
                          </button>
                        </div>
                      </div>
                    )}
              </li>
            );
          })}
        </ul>
      )}

      {contributions.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="card-title" style={{ margin: 0 }}>Payment History</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => downloadReport(group._id, "csv").catch((e) => alert(`CSV export failed: ${e.message}`))}>💾 Export CSV</button>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => downloadReport(group._id, "pdf").catch((e) => alert(`PDF export failed: ${e.message}`))}>📄 Export PDF</button>
            </div>
          </div>
          <div className="meetings-table-wrap">
            <table className="meetings-table">
              <caption className="sr-only">Contribution history</caption>
              <thead>
                <tr>{["Member","Month","Amount","Reference","Status","Date"].map((h) => <th key={h} scope="col">{h}</th>)}</tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c._id}>
                    <td>{c.member?.name || "—"}</td>
                    <td>{formatMonth(c.month)}</td>
                    <td style={{ color: "var(--green)", fontWeight: 600 }}>R{c.amount}</td>
                    <td><code style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.reference}</code></td>
                    <td><span className={`status-badge ${c.status}`}>{c.status}</span></td>
                    <td>{c.paidAt ? formatDateTime(c.paidAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Member Contributions (own view + online pay + advance payments) ───────────
export function MemberContributions({ contributions, members, group, onPay, loading, currentUserEmail }) {
  const month = currentMonth();
  const rates = useRates();

  const me = members.find((m) => m.contact === currentUserEmail);
  const myContributions = me ? contributions.filter((c) => (c.member?._id || c.member) === me._id) : [];
  const paidMonths = new Set(myContributions.filter((c) => c.status === "paid").map((c) => c.month));
  const totalPaid = myContributions.filter((c) => c.status === "paid").reduce((sum, c) => sum + c.amount, 0);
  const totalInterest = myContributions
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + calcInterest(c.paidAt, c.month, c.amount, rates?.primeRate), 0);

  // First unpaid month from current (enforces sequential payments)
  const startMonth = (() => {
    let mo = month;
    for (let n = 0; paidMonths.has(mo) && n < 12; n++) mo = addMonths(mo, 1);
    return mo;
  })();
  const endMonthOptions = Array.from({ length: 6 }, (_, i) => addMonths(startMonth, i));
  const [selectedEndMonth, setSelectedEndMonth] = useState(startMonth);
  const safeEnd = selectedEndMonth >= startMonth ? selectedEndMonth : startMonth;
  const monthsToPay = monthsBetween(startMonth, safeEnd).filter((mo) => !paidMonths.has(mo));
  const totalAmount = monthsToPay.length * Number(group.amount || 0);
  const previewInterest = monthsToPay
    .filter((mo) => mo > month)
    .reduce((sum, mo) => sum + calcInterest(new Date().toISOString(), mo, Number(group.amount || 0), rates?.primeRate), 0);

  return (
    <section aria-labelledby="m-contributions-heading">
      <header className="section-header-bar">
        <h2 id="m-contributions-heading">My Contributions</h2>
        <span className="month-label">{formatMonth(month)}</span>
      </header>

      <div className="contribution-summary card" style={{ marginBottom: 24 }}>
        <div className="contrib-summary-row">
          <div>
            <div className="stat-label">Total I've Contributed</div>
            <div className="stat-value" style={{ fontSize: 22 }}>R {totalPaid.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              across {myContributions.filter((c) => c.status === "paid").length} payment(s)
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="stat-label">Interest Earned</div>
            <div style={{ color: "var(--gold-light, #ffb400)", fontWeight: 700, fontSize: 18, marginTop: 4 }}>
              {totalInterest > 0 ? `+R${totalInterest.toFixed(2)}` : "R0.00"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>from advance payments</div>
          </div>
        </div>
      </div>

      {me && (
        <div className="card" style={{ marginBottom: 24, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Make a Contribution</h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>
              From:{" "}
              <strong style={{ color: "var(--text)" }}>{formatMonth(startMonth)}</strong>
              {startMonth > month && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "var(--gold-light, #ffb400)", fontWeight: 600 }}>
                  (advance)
                </span>
              )}
            </div>
            <label style={{ fontSize: 13, color: "var(--text-dim)", display: "block", marginBottom: 6 }}>
              Through:
            </label>
            <select
              value={safeEnd}
              onChange={(e) => setSelectedEndMonth(e.target.value)}
              style={{
                background: "var(--surface, #1a2235)",
                color: "var(--text)",
                border: "1px solid var(--border, #252d45)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                width: "100%",
                maxWidth: 280,
                cursor: "pointer",
              }}
            >
              {endMonthOptions.map((mo) => (
                <option key={mo} value={mo}>
                  {formatMonth(mo)}{mo === month ? " (Current)" : " (Advance)"}
                </option>
              ))}
            </select>
          </div>

          {monthsToPay.length > 0 ? (
            <>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
                {monthsToPay.length} month{monthsToPay.length !== 1 ? "s" : ""}:{" "}
                {monthsToPay.map((mo) => formatMonth(mo)).join(", ")}
              </div>

              {previewInterest > 0 && (
                <div style={{
                  padding: "10px 14px",
                  background: "rgba(255,180,0,0.08)",
                  border: "1px solid rgba(255,180,0,0.25)",
                  borderRadius: 8,
                  marginBottom: 14,
                  fontSize: 13,
                }}>
                  <strong style={{ color: "var(--gold-light, #ffb400)" }}>Advance payment bonus:</strong>{" "}
                  Paying early earns approximately{" "}
                  <strong style={{ color: "var(--gold-light, #ffb400)" }}>+R{previewInterest.toFixed(2)}</strong>{" "}
                  interest (prime rate {rates?.primeRate}% p.a.).
                </div>
              )}

              <button
                className="btn-primary"
                onClick={() => onPay(me, monthsToPay)}
                disabled={loading}
                style={{ minWidth: 200 }}
              >
                {loading
                  ? "Processing…"
                  : `Pay R${totalAmount.toLocaleString()} for ${monthsToPay.length} month${monthsToPay.length !== 1 ? "s" : ""}`}
              </button>
            </>
          ) : (
            <div style={{
              padding: "12px 16px",
              background: "rgba(61,186,140,0.1)",
              border: "1px solid rgba(61,186,140,0.3)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, color: "var(--green)" }}>All up to date!</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Nothing to pay for the selected range</div>
              </div>
            </div>
          )}
        </div>
      )}

      {myContributions.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="card-title" style={{ margin: 0 }}>Payment History</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => exportToCSV(myContributions, group?.name)}>💾 Export CSV</button>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => exportToPDF(myContributions, group?.name)}>📄 Export PDF</button>
            </div>
          </div>
          <div className="meetings-table-wrap">
            <table className="meetings-table">
              <caption className="sr-only">My contribution history</caption>
              <thead>
                <tr>{["Month","Amount","Interest","Reference","Status","Date"].map((h) => <th key={h} scope="col">{h}</th>)}</tr>
              </thead>
              <tbody>
                {myContributions.map((c) => {
                  const interest = calcInterest(c.paidAt, c.month, c.amount, rates?.primeRate);
                  return (
                    <tr key={c._id}>
                      <td>{formatMonth(c.month)}</td>
                      <td style={{ color: "var(--green)", fontWeight: 600 }}>R{c.amount}</td>
                      <td style={{ color: interest > 0 ? "var(--gold-light, #ffb400)" : "var(--text-dim)", fontWeight: interest > 0 ? 600 : 400 }}>
                        {interest > 0 ? `+R${interest.toFixed(2)}` : "—"}
                      </td>
                      <td><code style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.reference}</code></td>
                      <td><span className={`status-badge ${c.status}`}>{c.status}</span></td>
                      <td>{c.paidAt ? formatDateTime(c.paidAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}