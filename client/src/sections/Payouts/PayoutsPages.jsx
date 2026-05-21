// src/pages/Group/sections/Payouts/PayoutsPage.jsx
import React, { useRef } from "react";

export function Payouts({ members, group, onReorder }) {
  const dragRef = useRef(null);
  const isFIFO  = group?.payoutMethod === "Fixed Order (Roster)";
  const pool    = group?.amount && members.length ? `R ${(Number(group.amount) * members.length).toLocaleString()}` : "—";

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
          {members.map((m, i) => (
            <li key={m._id} className={`payout-row${isFIFO ? " fifo-locked" : ""}`}
             
            >
              <span className="payout-num">{String(i + 1).padStart(2, "0")}</span>
              <div className="payout-avatar">{m.initials}</div>
              <div className="payout-name">
                <strong>{m.name}</strong>
                <span>{m.role}</span>
              </div>
              <span className="payout-amount">{pool}</span>
              <span className="payout-status">
                {i === 0 ? <span className="status-badge active">Next Up</span> : <span className="status-badge pending">Pending</span>}
              </span>
              
              {isFIFO  && <span className="fifo-lock-icon" aria-label="Locked — FIFO order">🔒</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}