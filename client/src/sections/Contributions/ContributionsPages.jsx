import React from "react";
import { formatMonth, formatDateTime, currentMonth } from "../../utils/helpers";
// ── Import PDF generation engines ───────────────────────────────────────────
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ── Export to CSV Utility ────────────────────────────────────────────────────
function exportToCSV(contributions, groupName = "Stokvel") {
  const headers = ["Member Name", "Month", "Amount (ZAR)", "Reference", "Status", "Date Paid"];
  
  const rows = contributions.map(c => [
    `"${c.member?.name || "—"}"`,
    `"${formatMonth(c.month)}"`,
    `"R${c.amount}"`,
    `"${c.reference || "—"}"`,
    `"${c.status}"`,
    `"${c.paidAt ? formatDateTime(c.paidAt) : "—"}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${(groupName || "Stokvel").replace(/\s+/g, "_")}_Contribution_Report.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Export to PDF Utility ────────────────────────────────────────────────────
function exportToPDF(contributions, groupName = "Stokvel") {
  const doc = new jsPDF();
  
  // Title & Headers
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`${groupName || "Stokvel"} - Payout & Contribution History`, 14, 22);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 30);

  const tableHeaders = [["Member", "Month", "Amount", "Reference", "Status", "Date"]];
  
  const tableRows = contributions.map(c => [
    c.member?.name || "—",
    formatMonth(c.month),
    `R${c.amount}`,
    c.reference || "—",
    c.status.toUpperCase(),
    c.paidAt ? formatDateTime(c.paidAt) : "—"
  ]);

  // FIX: Pass 'doc' explicitly into the standalone autoTable function
  autoTable(doc, {
    startY: 35,
    head: tableHeaders,
    body: tableRows,
    theme: "striped",
    headStyles: { fillColor: [59, 186, 140] }, // Matching your custom green color theme
    styles: { fontSize: 9 },
  });

  doc.save(`${(groupName || "Stokvel").replace(/\s+/g, "_")}_Contribution_Report.pdf`);
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
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => exportToCSV(contributions, group?.name)}> Export CSV</button>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => exportToPDF(contributions, group?.name)}> Export PDF</button>
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
          <button className="btn-secondary" onClick={onFlagMissing}> Flag Unpaid</button>
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
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => exportToCSV(contributions, group?.name)}>Export CSV</button>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => exportToPDF(contributions, group?.name)}>Export PDF</button>
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

// ── Member Contributions (own view + online pay) ───────────────────────────────
export function MemberContributions({ contributions, members, group, onPay, loading, currentUserEmail }) {
  const month = currentMonth();
  const me = members.find((m) => m.contact === currentUserEmail);
  const myContributions = me ? contributions.filter((c) => (c.member?._id || c.member) === me._id) : [];
  const paidThisMonth   = myContributions.some((c) => c.month === month && c.status === "paid");
  const totalPaid       = myContributions.filter((c) => c.status === "paid").reduce((sum, c) => sum + c.amount, 0);

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
            <div className="stat-label">This Month</div>
            <div style={{ marginTop: 6 }}>
              <span className={`status-badge ${paidThisMonth ? "active" : "pending"}`}>
                {paidThisMonth ? "✓ Paid" : "Unpaid"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {me && !paidThisMonth && (
        <div className="card" style={{ marginBottom: 24, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15, color: "var(--text)" }}>Make Your Contribution</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
            Your contribution of <strong>R{group.amount}</strong> is due for {formatMonth(month)}.
          </p>
          <button className="btn-primary" onClick={() => onPay(me)} disabled={loading} style={{ minWidth: 160 }}>
            {loading ? "Processing…" : `Pay R${group.amount} Now`}
          </button>
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
                <tr>{["Month","Amount","Reference","Status","Date"].map((h) => <th key={h} scope="col">{h}</th>)}</tr>
              </thead>
              <tbody>
                {myContributions.map((c) => (
                  <tr key={c._id}>
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