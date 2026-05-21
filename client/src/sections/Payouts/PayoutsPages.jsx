// src/pages/Group/sections/Payouts/PayoutsPage.jsx
import React, { useRef } from "react";
import { calcInterest } from "../../utils/helpers";
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

export function Payouts({ members, group, contributions = [], disbursements = [], onReorder }) {
  const dragRef = useRef(null);
  const rates = useRates();
  const isFIFO = group?.payoutMethod === "Fixed Order (Roster)";

  const disbursedIds = new Set(
    disbursements
      .filter((d) => d.status === "paid")
      .map((d) => d.member?._id || d.member)
  );
  const nextMember = members.find((m) => !disbursedIds.has(m._id));

  const handleDragStart = (i) => { dragRef.current = i; };
  const handleDrop = (i) => {
    if (isFIFO || dragRef.current === null || dragRef.current === i) return;
    const reordered = [...members];
    const [moved] = reordered.splice(dragRef.current, 1);
    reordered.splice(i, 0, moved);
    onReorder(reordered);
    dragRef.current = null;
  };

  return (
    <section aria-labelledby="payouts-heading">
      <header className="section-header-bar">
        <h2 id="payouts-heading">Payout Roster</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="payout-method-badge">
            {group?.payoutMethod === "Fixed Order (Roster)" && "📋 Fixed Roster"}
          </span>
        </div>
      </header>
      {members.length === 0 ? (
        <p className="empty-state">No members added yet.</p>
      ) : (
        <ol className="payout-list">
          {members.map((m, i) => {
            const payout = getMemberPayout(m._id, contributions, rates?.primeRate);
            const disbursed = disbursedIds.has(m._id);
            const isNext = !disbursed && m._id === nextMember?._id;
            return (
              <li
                key={m._id}
                className={`payout-row${isFIFO ? " fifo-locked" : ""}${disbursed ? " paid" : ""}`}
                draggable={!isFIFO}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
              >
                <span className="payout-num">{String(i + 1).padStart(2, "0")}</span>
                <div className="payout-avatar">{m.initials}</div>
                <div className="payout-name">
                  <strong>{m.name}</strong>
                  <span>{m.role}</span>
                </div>
                <span
                  className="payout-amount"
                  style={{ color: disbursed ? "var(--green)" : "var(--gold-light, #ffb400)" }}
                >
                  {payout > 0 ? `R ${payout.toLocaleString()}` : "—"}
                </span>
                <span className="payout-status">
                  {disbursed ? (
                    <span className="status-badge active">✓ Paid Out</span>
                  ) : isNext ? (
                    <span className="status-badge active">Next Up</span>
                  ) : (
                    <span className="status-badge pending">Pending</span>
                  )}
                </span>
                {isFIFO && <span className="fifo-lock-icon" aria-label="Locked — FIFO order">🔒</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
