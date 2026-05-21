// src/sections/Disbursements/DisbursementsPages.jsx
import { formatMonth, formatDateTime, currentMonth, calcInterest } from "../../utils/helpers";
import { useRates } from "../../utils/useRates";

function getMemberPayout(memberId, contributions, primeRate) {
  const memberContribs = contributions.filter(
    (c) => (c.member?._id || c.member) === memberId && c.status === "paid"
  );
  const total = memberContribs.reduce((sum, c) => sum + c.amount, 0);
  const interest = memberContribs.reduce(
    (sum, c) => sum + calcInterest(c.paidAt, c.month, c.amount, primeRate), 0
  );
  return parseFloat((total + interest).toFixed(2));
}

export function Disbursements({ disbursements, members, group, contributions, onDisburseNext, onDisburse, onMarkPaid, loading }) {
  const month = currentMonth();
  const rates = useRates();

  // Members who have already been paid out (ever, not just this month)
  const disbursedIds = new Set(
    disbursements
      .filter((d) => d.status === "paid")
      .map((d) => d.member?._id || d.member)
  );

  // Next eligible member in FIFO order who hasn't been paid out yet
  const nextMember = members.find((m) => !disbursedIds.has(m._id));
  const nextMemberPayout = nextMember
    ? getMemberPayout(nextMember._id, contributions, rates?.primeRate)
    : 0;

  return (
    <section aria-labelledby="disbursements-heading">

      {/* ── Header ── */}
      <header className="section-header-bar">
        <h2 id="disbursements-heading">Payout Disbursements</h2>
        <span className="month-label">{formatMonth(month)}</span>
      </header>

      {/* ── Payout method ── */}
      <div className="card contribution-summary" style={{ marginBottom: 24 }}>
        <div className="contrib-summary-row">
          <div>
            <div className="stat-label">Payout Model</div>
            <div style={{ fontSize: 14, color: "var(--text)", marginTop: 4 }}>
              Each member receives their own contributions + interest earned
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
        <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--text)" }}>Next in FIFO Queue</h3>
        {nextMember ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div className="payout-avatar">{nextMember.initials}</div>
              <div>
                <strong>{nextMember.name}</strong>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>{nextMember.role}</span>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Payout Amount</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gold-light, #ffb400)" }}>
                  R{nextMemberPayout.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>contributions + interest</div>
              </div>
            </div>

            {onDisburseNext && (
              <>
                <button
                  className="btn-primary"
                  onClick={onDisburseNext}
                  disabled={loading || nextMemberPayout === 0}
                  style={{ minWidth: 200 }}
                >
                  {loading ? "Processing…" : `Disburse R${nextMemberPayout.toLocaleString()} to ${nextMember.name.split(" ")[0]}`}
                </button>

                {nextMemberPayout === 0 && (
                  <p style={{ fontSize: 12, color: "#e05c5c", marginTop: 8 }}>
                    This member has no contributions yet.
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <p style={{ color: "var(--green)", fontSize: 16 }}>
            ✓ All members have been paid out!
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
              const disbursed = disbursedIds.has(m._id);
              const isNext = !disbursed && m._id === nextMember?._id;
              const memberPayout = getMemberPayout(m._id, contributions, rates?.primeRate);

              return (
                <li key={m._id} className={`contribution-row${disbursed ? " paid" : ""}`}>
                  <span className="payout-num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="payout-avatar">{m.initials}</div>
                  <div className="payout-name">
                    <strong>{m.name}</strong>
                    <span>{m.role}</span>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: disbursed ? "var(--green)" : "var(--gold-light, #ffb400)" }}>
                    R{memberPayout.toLocaleString()}
                  </span>
                  {disbursed ? (
                    <span className="status-badge active">✓ Paid Out</span>
                  ) : isNext ? (
                    <span className="status-badge" style={{ background: "rgba(155,127,212,0.15)", color: "#9b7fd4", border: "1px solid rgba(155,127,212,0.3)" }}>Next Up</span>
                  ) : (
                    <span className="status-badge pending">Pending</span>
                  )}
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