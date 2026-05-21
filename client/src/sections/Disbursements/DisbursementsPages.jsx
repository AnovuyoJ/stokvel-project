// src/sections/Disbursements/DisbursementsPages.jsx
import { formatMonth, formatDateTime, currentMonth, getInitials } from "../../utils/helpers";

export function Disbursements({ disbursements, members, group, contributions, onDisburseNext, onDisburse, onMarkPaid, loading }) {
  const month = currentMonth();

  const totalCollected = contributions
    .filter((c) => c.month === month && c.status === "paid")
    .reduce((sum, c) => sum + c.amount, 0);

  const paidCount = contributions.filter((c) => c.month === month && c.status === "paid").length;

  // Members who have already received a disbursement this month
  const disbursedThisMonth = new Set(
    disbursements
      .filter((d) => d.month === month)
      .map((d) => d.member?._id || d.member)
  );

  // Next eligible member in FIFO order who hasn't been disbursed yet
  const nextMember = members.find((m) => !disbursedThisMonth.has(m._id));

  return (
    <section aria-labelledby="disbursements-heading">

      {/* ── Header ── */}
      <header className="section-header-bar">
        <h2 id="disbursements-heading">Payout Disbursements</h2>
        <span className="month-label">{formatMonth(month)}</span>
      </header>

      {/* ── Pool summary ── */}
      <div className="card contribution-summary" style={{ marginBottom: 24 }}>
        <div className="contrib-summary-row">
          <div>
            <div className="stat-label">Available Pool</div>
            <div className="stat-value" style={{ fontSize: 22 }}>
              R {totalCollected.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              from {paidCount} member{paidCount !== 1 ? "s" : ""} this month
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="stat-label">Payout Method</div>
            <div style={{ color: "var(--gold-light)", fontSize: 14, fontWeight: 600, marginTop: 4 }}>
              {group.payoutMethod || "Not set"}
            </div>
          </div>
        </div>
      </div>

      {/* ── FIFO next-up card ── */}
      <div className="card" style={{ marginBottom: 24, padding: "20px 24px" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15,color: "var(--text)" }}>Next in FIFO Queue</h3>
        {nextMember ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div className="payout-avatar">{nextMember.initials}</div>
              <div style={{color: "var(--gold)"}}>
                <strong>{nextMember.name}</strong>
                <span style={{ display: "block", fontSize: 12, color: "var(--text)" }}>
                  {nextMember.role}
                </span>
              </div>
              <span className="status-badge active" style={{ marginLeft: "auto" }}>Next Up</span>
            </div>

            <button
              className="btn-primary"
              onClick={onDisburseNext}
              disabled={loading || totalCollected === 0}
              style={{ minWidth: 200 }}
            >
              {loading
                ? "Processing…"
                : `Disburse R${totalCollected.toLocaleString()} to ${nextMember.name.split(" ")[0]}`}
            </button>

            {totalCollected === 0 && (
              <p style={{ fontSize: 12, color: "#e05c5c", marginTop: 8 }}>
                No funds collected this month yet.
              </p>
            )}
          </>
        ) : (
          <p style={{ color: "var(--green)", fontSize: 16 }}>
            ✓ All members have been paid this month!
          </p>
        )}
      </div>

      {/* ── Per-member roster ── */}
      {members.length === 0 ? (
        <p className="empty-state">No members yet.</p>
      ) : (
        <>
          <h3 className="card-title" style={{ marginBottom: 12 }}>Payout Roster</h3>
          <ul className="contributions-list" aria-label="Disbursement roster">
            {members.map((m, i) => {
              const record    = disbursements.find((d) => (d.member?._id || d.member) === m._id && d.month === month);
              const disbursed = !!record;

              return (
                <li key={m._id} className={`contribution-row${disbursed ? " paid" : ""}`}>
                  <span className="payout-num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="payout-avatar">{m.initials}</div>
                  <div className="payout-name">
                    <strong>{m.name}</strong>
                    <span>{m.role}</span>
                  </div>

                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* ── History table ── */}
      {disbursements.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 className="card-title" style={{ marginBottom: 12 }}>Disbursement History</h3>
          <div className="meetings-table-wrap">
            <table className="meetings-table">
              <caption className="sr-only">Disbursement history</caption>
              <thead>
                <tr>
                  {["Member", "Month", "Amount", "Reference", "Status", "Date", "Note"].map((h) => (
                    <th key={h} scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {disbursements.map((d) => (
                  <tr key={d._id}>
                    <td>{d.member?.name || "—"}</td>
                    <td>{formatMonth(d.month)}</td>
                    <td style={{ color: "var(--gold-light)", fontWeight: 600 }}>
                      R{d.amount?.toLocaleString()}
                    </td>
                    <td>
                      <code style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        {d.reference || "—"}
                      </code>
                    </td>
                    <td>
                      <span className={`status-badge ${d.status === "paid" ? "active" : "pending"}`}>
                        {d.status}
                      </span>
                    </td>
                    <td>{d.paidAt ? formatDateTime(d.paidAt) : "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--text-dim)" }}>{d.note || "—"}</td>
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