// src/sections/Dashboard/DashboardPages.jsx
import React from "react";
import { formatDate, formatMonth, getInitials, currentMonth } from "../../utils/helpers";
import { useRates } from "../../utils/useRates";

// ── Admin Dashboard ───────────────────────────────────────────────────────────
export function AdminDashboard({ group, members, meetings, onBack }) {
  const rates = useRates();

  const pool = group.amount && members.length
    ? `R ${(Number(group.amount) * members.length).toLocaleString()}`
    : "—";

  const upcoming = meetings
    .filter((m) => m.status === "upcoming")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const stats = [
    { label: "Total Members", value: members.length },
    { label: "Monthly Pool",  value: pool },
    { label: "Payout Method", value: group.payoutMethod || "—" },
    { label: "Next Meeting",  value: upcoming.length ? formatDate(upcoming[0].date) : "—" },
    { label: "Repo Rate",     value: rates ? `${rates.repoRate}%` : "—" },   // ← fixed typo
    { label: "Prime Rate",    value: rates ? `${rates.primeRate}%` : "—" },  // ← fixed typo
  ];

  const details = [
    ["Contribution",  group.amount && group.freq ? `R${group.amount} / ${group.freq}` : "—"],
    ["Meeting",       group.meetDay ? `Every ${group.meetDay}` : "—"],
    ["Cycle",         group.cycle || "—"],
    ["Payout Method", group.payoutMethod || "—"],
    ["Max Members",   group.max || "—"],
  ];

  const now = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
  const activity = [
    ...members.slice().reverse().slice(0, 4).map((m) => `${m.name} invited as ${m.role}`),
    ...meetings.slice().reverse().slice(0, 3).map((m) => `Meeting scheduled for ${formatDate(m.date)}`),
  ];

  return (
    <>
      <div className="section-header-bar">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h2>{group.name}</h2>
        <span className="badge active">Active</span>
      </div>
      <ul className="stats-row" aria-label="Group statistics">
        {stats.map(({ label, value }) => (
          <li key={label} className="stat-card">
            <span className="stat-label">{label}</span>
            <strong className="stat-value">{value}</strong>
          </li>
        ))}
      </ul>
      <div className="dashboard-grid">
        <article className="card group-summary">
          <header className="card-header"><h3>Group Details</h3></header>
          <dl className="group-details">
            {details.map(([label, val]) => (
              <div className="group-detail" key={label}>
                <dt>{label}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
          {group.rules && (
            <div className="group-rules">
              <strong>Rules</strong>
              <p>{group.rules}</p>
            </div>
          )}
        </article>
        <article className="card recent-activity">
          <h3 className="card-title">Recent Activity</h3>
          {activity.length === 0 ? (
            <p style={{ color: "var(--text-dim)" }}>No activity yet.</p>
          ) : (
            <ul className="activity-list">
              {activity.map((text, i) => (
                <li key={i}>
                  <span className="dot blue" aria-hidden="true" />
                  {text} — <time>{now}</time>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </>
  );
}

// ── Treasurer Dashboard ───────────────────────────────────────────────────────
export function TreasurerDashboard({ group, members, meetings, contributions, disbursements, onBack, onNavigate }) {
  const rates = useRates();
  const month = currentMonth();

  const paid           = contributions.filter((c) => c.month === month && c.status === "paid");
  const unpaid         = members.filter((m) => !paid.some((c) => (c.member?._id || c.member) === m._id));
  const totalExpected  = group.amount && members.length ? Number(group.amount) * members.length : 0;
  const totalCollected = paid.reduce((sum, c) => sum + c.amount, 0);
  const progress       = totalExpected ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const upcomingMeetings     = meetings.filter((m) => m.status === "upcoming").sort((a, b) => new Date(a.date) - new Date(b.date));
  const pendingDisbursements = disbursements.filter((d) => d.status === "pending");

  return (
    <>
      <div className="section-header-bar">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h2>{group.name}</h2>
        <span className="badge" style={{ background: "rgba(255,180,0,0.15)", color: "#ffb400", border: "1px solid rgba(255,180,0,0.3)" }}>Treasurer</span>
      </div>

      {/* ── Stats row now includes rates ── */}
      <ul className="stats-row" aria-label="Treasurer overview">
        <li className="stat-card">
          <span className="stat-label">Members</span>
          <strong className="stat-value">{members.length}</strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Collected</span>
          <strong className="stat-value" style={{ color: "var(--green)" }}>R {totalCollected.toLocaleString()}</strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Outstanding</span>
          <strong className="stat-value" style={{ color: unpaid.length ? "#e05c5c" : "var(--green)" }}>
            {unpaid.length} unpaid
          </strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Next Meeting</span>
          <strong className="stat-value">{upcomingMeetings.length ? formatDate(upcomingMeetings[0].date) : "None"}</strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Repo Rate</span>
          <strong className="stat-value">{rates ? `${rates.repoRate}%` : "—"}</strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Prime Rate</span>
          <strong className="stat-value">{rates ? `${rates.primeRate}%` : "—"}</strong>
        </li>
      </ul>

      <div className="dashboard-grid">
        {/* Collection progress */}
        <article className="card">
          <header className="card-header">
            <h3>This Month's Collection</h3>
            <span className="month-label">{formatMonth(month)}</span>
          </header>
          <div className="contrib-progress-wrap" style={{ margin: "16px 0" }}>
            <div className="contrib-progress-bar">
              <div className="contrib-progress-fill" style={{ width: `${progress}%` }}
                role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} />
            </div>
            <span className="contrib-progress-label">
              {progress}% — R{totalCollected.toLocaleString()} of R{totalExpected.toLocaleString()}
            </span>
          </div>
          {unpaid.length > 0 ? (
            <>
              <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>
                Still unpaid ({unpaid.length}):
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {unpaid.map((m) => (
                  <li key={m._id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="payout-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{m.initials}</div>
                    <span style={{ fontSize: 13 }}>{m.name}</span>
                    <span className="status-badge pending" style={{ marginLeft: "auto" }}>Unpaid</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--green)" }}>✓ All members have paid this month!</p>
          )}
          <button className="btn-secondary" style={{ marginTop: 16, width: "100%" }} onClick={() => onNavigate("t-contributions")}>
            Manage Contributions →
          </button>
        </article>

        {/* Upcoming meetings */}
        <article className="card">
          <header className="card-header"><h3>Upcoming Meetings</h3></header>
          {upcomingMeetings.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No upcoming meetings scheduled.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 12 }}>
              {upcomingMeetings.slice(0, 3).map((m) => (
                <li key={m._id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ background: "var(--accent-subtle, rgba(155,127,212,0.15))", borderRadius: 8, padding: "6px 10px", textAlign: "center", minWidth: 44, flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {new Date(m.date + "T00:00:00").toLocaleDateString("en-ZA", { month: "short" })}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent, #9b7fd4)", lineHeight: 1.1 }}>
                      {new Date(m.date + "T00:00:00").getDate()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.venue || "TBD"}</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      {m.time || ""}{m.notes ? ` · ${m.notes}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-secondary" style={{ marginTop: 16, width: "100%" }} onClick={() => onNavigate("t-meetings")}>
            Manage Meetings →
          </button>
        </article>

        {/* Pending disbursements */}
        <article className="card">
          <header className="card-header"><h3>Pending Disbursements</h3></header>
          {pendingDisbursements.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No pending payouts.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingDisbursements.map((d) => (
                <li key={d._id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="payout-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                    {getInitials(d.member?.name || "?")}
                  </div>
                  <span style={{ fontSize: 13 }}>{d.member?.name || "—"}</span>
                  <span style={{ color: "var(--gold-light)", fontWeight: 600, fontSize: 13, marginLeft: "auto" }}>
                    R{d.amount?.toLocaleString()}
                  </span>
                  <span className="status-badge pending">Pending</span>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-secondary" style={{ marginTop: 16, width: "100%" }} onClick={() => onNavigate("disbursements")}>
            Manage Disbursements →
          </button>
        </article>
      </div>
    </>
  );
}

// ── Member Dashboard ──────────────────────────────────────────────────────────
export function MemberDashboard({ group, members, meetings, contributions, currentUserEmail, onBack, onNavigate }) {
  const rates = useRates();
  const month = currentMonth();

  const me              = members.find((m) => m.contact === currentUserEmail);
  const myContributions = me ? contributions.filter((c) => (c.member?._id || c.member) === me._id) : [];
  const paidThisMonth   = myContributions.some((c) => c.month === month && c.status === "paid");
  const totalPaid       = myContributions.filter((c) => c.status === "paid").reduce((sum, c) => sum + c.amount, 0);
  const upcomingMeetings = meetings.filter((m) => m.status === "upcoming").sort((a, b) => new Date(a.date) - new Date(b.date));
  const nextMeeting     = upcomingMeetings[0];
  const myPosition      = me ? members.findIndex((m) => m._id === me._id) + 1 : null;
  const pool            = group.amount && members.length ? `R ${(Number(group.amount) * members.length).toLocaleString()}` : "—";

  return (
    <>
      <div className="section-header-bar">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h2>{group.name}</h2>
        <span className="badge" style={{ background: "rgba(61,186,140,0.15)", color: "#3dba8c", border: "1px solid rgba(61,186,140,0.3)" }}>Member</span>
      </div>

      {/* ── Stats row now includes rates ── */}
      <ul className="stats-row" aria-label="My overview">
        <li className="stat-card">
          <span className="stat-label">This Month</span>
          <strong className="stat-value" style={{ color: paidThisMonth ? "var(--green)" : "#e05c5c" }}>
            {paidThisMonth ? "✓ Paid" : "Unpaid"}
          </strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Total Contributed</span>
          <strong className="stat-value">R {totalPaid.toLocaleString()}</strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Payout Pool</span>
          <strong className="stat-value">{pool}</strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">My Payout Position</span>
          <strong className="stat-value">{myPosition ? `#${myPosition} of ${members.length}` : "—"}</strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Repo Rate</span>
          <strong className="stat-value">{rates ? `${rates.repoRate}%` : "—"}</strong>
        </li>
        <li className="stat-card">
          <span className="stat-label">Prime Rate</span>
          <strong className="stat-value">{rates ? `${rates.primeRate}%` : "—"}</strong>
        </li>
      </ul>

      <div className="dashboard-grid">
        {/* Contribution status */}
        <article className="card">
          <header className="card-header"><h3>My Contribution</h3></header>
          <div style={{ padding: "12px 0" }}>
            {paidThisMonth ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(61,186,140,0.1)", borderRadius: 10, border: "1px solid rgba(61,186,140,0.3)" }}>
                <span style={{ fontSize: 24 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--green)" }}>Paid for {formatMonth(month)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>R{group.amount} contributed</div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "12px 16px", background: "rgba(224,92,92,0.08)", borderRadius: 10, border: "1px solid rgba(224,92,92,0.25)", marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: "#e05c5c", marginBottom: 4 }}>Payment Due — {formatMonth(month)}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Amount: R{group.amount || "—"}</div>
              </div>
            )}
          </div>
          <button className="btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={() => onNavigate("m-contributions")}>
            {paidThisMonth ? "View Contribution History" : "Make a Contribution →"}
          </button>
        </article>

        {/* Next meeting */}
        <article className="card">
          <header className="card-header"><h3>Next Meeting</h3></header>
          {!nextMeeting ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No upcoming meetings yet.</p>
          ) : (
            <div style={{ padding: "12px 0" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ background: "var(--accent-subtle, rgba(155,127,212,0.15))", borderRadius: 10, padding: "10px 16px", textAlign: "center", minWidth: 56, flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {new Date(nextMeeting.date + "T00:00:00").toLocaleDateString("en-ZA", { month: "short" })}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent, #9b7fd4)", lineHeight: 1.1 }}>
                    {new Date(nextMeeting.date + "T00:00:00").getDate()}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{nextMeeting.venue || "TBD"}</div>
                  {nextMeeting.time && <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>🕐 {nextMeeting.time}</div>}
                  {nextMeeting.notes && <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>📋 {nextMeeting.notes}</div>}
                  {nextMeeting.link && (
                    <a href={nextMeeting.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>🔗 Join online</a>
                  )}
                </div>
              </div>
            </div>
          )}
          <button className="btn-secondary" style={{ width: "100%", marginTop: 12 }} onClick={() => onNavigate("m-meetings")}>
            View All Meetings →
          </button>
        </article>

        {/* Group info */}
        <article className="card">
          <header className="card-header"><h3>Group Details</h3></header>
          <dl className="group-details">
            {[
              ["Contribution",  group.amount && group.freq ? `R${group.amount} / ${group.freq}` : "—"],
              ["Total Members", members.length],
              ["Payout Method", group.payoutMethod || "—"],
              ["Cycle",         group.cycle || "—"],
            ].map(([label, val]) => (
              <div className="group-detail" key={label}>
                <dt>{label}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </article>
      </div>
    </>
  );
}