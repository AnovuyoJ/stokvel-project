// src/pages/MeetingMinutes/MeetingMinutes.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles/minutes.css";

const API = import.meta.env.VITE_API_URL;

function authHeader() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const token = user.token || user.accessToken || user.user?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function formatDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-ZA", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function MeetingMinutes() {
  const { meetingId } = useParams();
  const navigate = useNavigate();

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const currentUserEmail = currentUser.email || currentUser.user?.email || "";
  const currentUsername = currentUser.username || currentUser.user?.username || "";

  const [meeting, setMeeting] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState("edit");

  const [summary, setSummary] = useState("");
  const [decisions, setDecisions] = useState([""]);
  const [actions, setActions] = useState([""]);
  const [attendance, setAttendance] = useState({});

  const hasMinutes = meeting?.minutes?.summary ||
    (meeting?.minutes?.decisions?.length > 0) ||
    (meeting?.minutes?.actions?.length > 0);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  useEffect(() => {
    async function load() {
      try {
        const meetRes = await axios.get(
          `${API}/api/meetings/${meetingId}`,
          { headers: authHeader() }
        );
        const m = meetRes.data;
        setMeeting(m);

        const membersRes = await axios.get(
          `${API}/api/members?groupId=${m.group}`,
          { headers: authHeader() }
        );
        const memberList = membersRes.data;
        setMembers(memberList);

        if (m.minutes) {
          setSummary(m.minutes.summary || "");
          setDecisions(m.minutes.decisions?.length > 0 ? m.minutes.decisions : [""]);
          setActions(m.minutes.actions?.length > 0 ? m.minutes.actions : [""]);
          const savedAttendance = m.minutes.attendance || {};
          const init = {};
          memberList.forEach((mem) => {
            init[mem._id] = savedAttendance[mem._id] || "present";
          });
          setAttendance(init);
          if (m.minutes.summary || m.minutes.decisions?.length > 0) setViewMode("preview");
        } else {
          const init = {};
          memberList.forEach((mem) => { init[mem._id] = "present"; });
          setAttendance(init);
        }
      } catch (err) {
        showToast("Failed to load meeting: " + (err.response?.data?.error || err.message));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [meetingId]);

  function setMemberAttendance(id, status) {
    setAttendance((prev) => ({ ...prev, [id]: status }));
  }

  function addDecision() { setDecisions((d) => [...d, ""]); }
  function addAction() { setActions((a) => [...a, ""]); }
  function removeDecision(i) { setDecisions((d) => d.filter((_, idx) => idx !== i)); }
  function removeAction(i) { setActions((a) => a.filter((_, idx) => idx !== i)); }
  function updateDecision(i, v) { setDecisions((d) => d.map((x, idx) => idx === i ? v : x)); }
  function updateAction(i, v) { setActions((a) => a.map((x, idx) => idx === i ? v : x)); }

  async function handleSave() {
    if (!summary.trim()) {
      showToast("Please add a summary before saving.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/meetings/${meetingId}`,
        {
          minutes: {
            summary,
            decisions: decisions.filter((d) => d.trim()),
            actions: actions.filter((a) => a.trim()),
            attendance,
          },
          status: "completed",
        },
        { headers: authHeader() }
      );
      setMeeting(data);
      showToast("✓ Minutes saved successfully");
      setViewMode("preview");
    } catch (err) {
      showToast("Failed to save: " + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  }

  const present = members.filter((m) => attendance[m._id] === "present");
  const absent = members.filter((m) => attendance[m._id] === "absent");
  const late = members.filter((m) => attendance[m._id] === "late");

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", minHeight: "100vh" }}>
        <p style={{ color: "var(--text-dim)" }}>Loading meeting…</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f1419 0%, #1a1f2e 100%)",
      padding: "20px",
      width: "100%",
    }}>
      <div style={{ width: "100%" }}>

        {toast && <div className="minutes-toast">{toast}</div>}

        {/* Header */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "15px",
          padding: "20px 24px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "15px",
        }}>
          <div>
            <button
              onClick={() => navigate(-1)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "13px",
                cursor: "pointer",
                marginBottom: "8px",
              }}
            >
              ← Back
            </button>
            <h1 style={{
              fontSize: "24px",
              color: "var(--text)",
              margin: 0,
              fontWeight: 700,
            }}>
              Record Meeting Minutes
            </h1>
          </div>
          {meeting && (
            <div style={{
              background: "rgba(76, 175, 125, 0.15)",
              border: "1px solid rgba(76, 175, 125, 0.3)",
              padding: "8px 15px",
              borderRadius: "20px",
              fontSize: "13px",
              color: "var(--green)",
              fontWeight: 500,
            }}>
              {meeting.venue || "Meeting"}
            </div>
          )}
        </div>

        {/* Meeting Details Card */}
        {meeting && (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "15px",
            padding: "20px 24px",
            marginBottom: "20px",
          }}>
            <h2 style={{
              fontSize: "13px",
              fontWeight: 700,
              margin: "0 0 16px",
              color: "var(--gold)",
              borderLeft: "4px solid var(--gold)",
              paddingLeft: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
            }}>
              Meeting Details
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "16px",
            }}>
              <div>
                <div style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "6px",
                }}>Date</div>
                <div style={{
                  fontSize: "14px",
                  color: "var(--text)",
                  fontWeight: 500,
                }}>{formatDate(meeting.date)}</div>
              </div>
              <div>
                <div style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "6px",
                }}>Time</div>
                <div style={{
                  fontSize: "14px",
                  color: "var(--text)",
                  fontWeight: 500,
                }}>{meeting.time || "—"}</div>
              </div>
              <div>
                <div style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "6px",
                }}>Venue</div>
                <div style={{
                  fontSize: "14px",
                  color: "var(--text)",
                  fontWeight: 500,
                }}>{meeting.venue || "—"}</div>
              </div>
              {meeting.link && (
                <div>
                  <div style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "6px",
                  }}>Link</div>
                  <a href={meeting.link} target="_blank" rel="noopener noreferrer"
                    style={{
                      fontSize: "14px",
                      color: "var(--gold)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}>
                    Join Meeting →
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* View Mode Toggle */}
        {hasMinutes && (
          <div style={{
            display: "flex",
            gap: "8px",
            marginBottom: "20px",
          }}>
           
            <button
              onClick={() => setViewMode("preview")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: viewMode === "preview" ? "var(--gold)" : "transparent",
                color: viewMode === "preview" ? "#000" : "var(--text)",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                transition: "all 0.2s",
              }}
            >
              📄 Preview
            </button>
          </div>
        )}

        {/* Two Column Layout */}
        {viewMode === "edit" ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
            marginBottom: "20px",
          }}>

            {/* LEFT COLUMN: Form */}
            <div>
              {/* Summary */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "15px",
                padding: "20px 24px",
                marginBottom: "20px",
              }}>
                <h2 style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  margin: "0 0 16px",
                  color: "var(--gold)",
                  borderLeft: "4px solid var(--gold)",
                  paddingLeft: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}>
                  📋 Summary
                </h2>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Write a brief summary of what was discussed..."
                  className="minutes-textarea"
                  style={{
                    minHeight: "150px",
                  }}
                />
              </div>

              {/* Decisions */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "15px",
                padding: "20px 24px",
                marginBottom: "20px",
              }}>
                <h2 style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  margin: "0 0 16px",
                  color: "var(--gold)",
                  borderLeft: "4px solid var(--gold)",
                  paddingLeft: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}>
                  📊 Decisions Made
                </h2>
                {decisions.map((d, i) => (
                  <div key={i} className="minutes-list-row">
                    <span className="minutes-list-num">{i + 1}.</span>
                    <input
                      className="minutes-input"
                      type="text"
                      value={d}
                      onChange={(e) => updateDecision(i, e.target.value)}
                      placeholder="e.g. Payout schedule confirmed for next month"
                    />
                    {decisions.length > 1 && (
                      <button
                        className="minutes-remove-btn"
                        onClick={() => removeDecision(i)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn-ghost minutes-add-btn" onClick={addDecision}>
                  + Add Decision
                </button>
              </div>

              {/* Actions */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "15px",
                padding: "20px 24px",
              }}>
                <h2 style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  margin: "0 0 16px",
                  color: "var(--gold)",
                  borderLeft: "4px solid var(--gold)",
                  paddingLeft: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}>
                  ✅ Action Items
                </h2>
                {actions.map((a, i) => (
                  <div key={i} className="minutes-list-row">
                    <span className="minutes-list-num">{i + 1}.</span>
                    <input
                      className="minutes-input"
                      type="text"
                      value={a}
                      onChange={(e) => updateAction(i, e.target.value)}
                      placeholder="e.g. Treasurer to send reminders by Friday"
                    />
                    {actions.length > 1 && (
                      <button
                        className="minutes-remove-btn"
                        onClick={() => removeAction(i)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn-ghost minutes-add-btn" onClick={addAction}>
                  + Add Action Item
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: Attendance & Actions */}
            <div>
              {/* Attendance */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "15px",
                padding: "20px 24px",
                marginBottom: "20px",
              }}>
                <div className="minutes-attendance-header">
                  <h2 style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    margin: 0,
                    color: "var(--gold)",
                    borderLeft: "4px solid var(--gold)",
                    paddingLeft: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                  }}>
                    👥 Attendance
                  </h2>
                </div>
                <div className="minutes-attendance-summary"
                  style={{
                    display: "flex",
                    gap: "12px",
                    fontSize: "12px",
                    marginBottom: "12px",
                  }}>
                  <span className="present-label">✓ {present.length} present</span>
                  <span className="late-label">◷ {late.length} late</span>
                  <span className="absent-label">✕ {absent.length} absent</span>
                </div>
                <ul className="minutes-attendance-list">
                  {members.map((m) => (
                    <li key={m._id} className="minutes-attendance-row">
                      <div className="minutes-member-info">
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            background: "rgba(155,127,212,0.2)",
                            border: "1px solid var(--gold)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "var(--gold)",
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(m.name)}
                        </div>
                        <div>
                          <strong style={{ fontSize: "13px", color: "var(--text)" }}>{m.name}</strong>
                          <span style={{
                            fontSize: "11px",
                            color: "var(--text-dim)",
                            marginLeft: "6px",
                          }}>
                            {m.role}
                          </span>
                        </div>
                      </div>
                      <div className="minutes-attendance-btns">
                        {["present", "late", "absent"].map((s) => (
                          <button
                            key={s}
                            className={`minutes-att-btn ${s}${attendance[m._id] === s ? " selected" : ""}`}
                            onClick={() => setMemberAttendance(m._id, s)}
                          >
                            {s === "present" ? "✓" : s === "late" ? "◷" : "✕"}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Buttons */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "15px",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}>
                <button
                  onClick={() => setShowModal(true)}
                  className="btn-secondary"
                  style={{ width: "100%" }}
                >
                 Full Preview
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary"
                  style={{ width: "100%" }}
                >
                  {saving ? "Saving…" : "💾 Save Minutes"}
                </button>
                <button
                  onClick={() => navigate(-1)}
                  className="btn-ghost"
                  style={{ width: "100%" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* PREVIEW MODE */
          <div className="minutes-document">
            <div className="minutes-doc-header">
              <div className="minutes-doc-logo">◈ Stokvel Manager</div>
              <h1 className="minutes-doc-title">Meeting Minutes</h1>
              <div className="minutes-doc-meta">
                <span>Date: {formatDate(meeting.date)}</span>
                <span>Time: {meeting.time || "—"}</span>
                <span>Venue: {meeting.venue || "—"}</span>
              </div>
            </div>

            <hr className="minutes-doc-divider" />

            <section className="minutes-doc-section">
              <h2 className="minutes-doc-section-title">Attendance</h2>
              <div className="minutes-doc-attendance-grid">
                <div>
                  <h4 className="minutes-doc-attendance-label present-label">✓ Present ({present.length})</h4>
                  {present.length === 0 ? (
                    <p className="minutes-doc-empty">None recorded</p>
                  ) : (
                    <ul className="minutes-doc-list">
                      {present.map((m) => (
                        <li key={m._id}>{m.name} <span className="minutes-doc-role">({m.role})</span></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="minutes-doc-attendance-label late-label">◷ Late ({late.length})</h4>
                  {late.length === 0 ? (
                    <p className="minutes-doc-empty">None recorded</p>
                  ) : (
                    <ul className="minutes-doc-list">
                      {late.map((m) => (
                        <li key={m._id}>{m.name} <span className="minutes-doc-role">({m.role})</span></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="minutes-doc-attendance-label absent-label">✕ Absent ({absent.length})</h4>
                  {absent.length === 0 ? (
                    <p className="minutes-doc-empty">None recorded</p>
                  ) : (
                    <ul className="minutes-doc-list">
                      {absent.map((m) => (
                        <li key={m._id}>{m.name} <span className="minutes-doc-role">({m.role})</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <hr className="minutes-doc-divider" />

            {meeting.notes && (
              <>
                <section className="minutes-doc-section">
                  <h2 className="minutes-doc-section-title">Agenda</h2>
                  <p className="minutes-doc-body">{meeting.notes}</p>
                </section>
                <hr className="minutes-doc-divider" />
              </>
            )}

            <section className="minutes-doc-section">
              <h2 className="minutes-doc-section-title">Summary</h2>
              {summary
                ? <p className="minutes-doc-body">{summary}</p>
                : <p className="minutes-doc-empty">No summary recorded.</p>}
            </section>

            <hr className="minutes-doc-divider" />

            <section className="minutes-doc-section">
              <h2 className="minutes-doc-section-title">Decisions Made</h2>
              {!decisions.some(d => d.trim())
                ? <p className="minutes-doc-empty">No decisions recorded.</p>
                : (
                  <ol className="minutes-doc-numbered">
                    {decisions.filter(d => d.trim()).map((d, i) => <li key={i}>{d}</li>)}
                  </ol>
                )}
            </section>

            <hr className="minutes-doc-divider" />

            <section className="minutes-doc-section">
              <h2 className="minutes-doc-section-title">Action Items</h2>
              {!actions.some(a => a.trim())
                ? <p className="minutes-doc-empty">No action items recorded.</p>
                : (
                  <ol className="minutes-doc-numbered">
                    {actions.filter(a => a.trim()).map((a, i) => <li key={i}>{a}</li>)}
                  </ol>
                )}
            </section>

            <hr className="minutes-doc-divider" />

            <div className="minutes-doc-footer">
              <span>Stokvel Manager — Official Meeting Record</span>
              <span>{formatDate(meeting.date)}</span>
            </div>

            <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
              <button
                onClick={() => setViewMode("edit")}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                Edit
              </button>
              <button
                onClick={() => window.print()}
                className="btn-primary"
                style={{ flex: 1 }}
              >
                🖨️ Print
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Preview Modal */}
      {showModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px",
        }}>
          <div style={{
            background: "var(--surface)",
            borderRadius: "15px",
            padding: "30px",
            maxWidth: "700px",
            maxHeight: "80vh",
            overflowY: "auto",
            border: "1px solid var(--border)",
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              paddingBottom: "15px",
              borderBottom: "1px solid var(--border)",
            }}>
              <h3 style={{
                fontSize: "18px",
                color: "var(--text)",
                margin: 0,
                fontWeight: 700,
              }}>
                📄 Meeting Minutes Preview
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{
              fontSize: "13px",
              color: "var(--text)",
              lineHeight: "1.8",
            }}>
              <h4 style={{ color: "var(--gold)" }}>📅 {formatDate(meeting?.date)}</h4>
              {meeting?.time && <p><strong>Time:</strong> {meeting.time}</p>}
              {meeting?.venue && <p><strong>Venue:</strong> {meeting.venue}</p>}

              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "15px 0" }} />

              <h4 style={{ color: "var(--gold)" }}>👥 Attendance</h4>
              <p>
                <strong>Present ({present.length}):</strong> {present.map(p => p.name).join(", ") || "None"}
              </p>
              {late.length > 0 && (
                <p>
                  <strong>Late ({late.length}):</strong> {late.map(l => l.name).join(", ")}
                </p>
              )}
              {absent.length > 0 && (
                <p>
                  <strong>Absent ({absent.length}):</strong> {absent.map(a => a.name).join(", ")}
                </p>
              )}

              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "15px 0" }} />

              {summary && (
                <>
                  <h4 style={{ color: "var(--gold)" }}>📋 Summary</h4>
                  <p>{summary}</p>
                </>
              )}

              {decisions.some(d => d.trim()) && (
                <>
                  <h4 style={{ color: "var(--gold)" }}>📊 Decisions Made</h4>
                  <ol style={{ paddingLeft: "20px" }}>
                    {decisions.filter(d => d.trim()).map((d, i) => (
                      <li key={i} style={{ marginBottom: "6px" }}>{d}</li>
                    ))}
                  </ol>
                </>
              )}

              {actions.some(a => a.trim()) && (
                <>
                  <h4 style={{ color: "var(--gold)" }}> Action Items</h4>
                  <ol style={{ paddingLeft: "20px" }}>
                    {actions.filter(a => a.trim()).map((a, i) => (
                      <li key={i} style={{ marginBottom: "6px" }}>{a}</li>
                    ))}
                  </ol>
                </>
              )}

              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "15px 0" }} />

              <p style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: "15px",
              }}>
                Recorded by: {currentUsername || currentUserEmail}
                <br />
                Date: {formatDateTime(new Date())}
              </p>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="btn-primary"
              style={{ width: "100%", marginTop: "20px" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}