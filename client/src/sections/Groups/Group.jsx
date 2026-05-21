
// src/sections/Groups/Group.jsx
// CORRECTED VERSION - Use this if staying in src/sections/Groups/
 
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import GroupForm from "../../components/GroupForm";
import { Toast, Modal, Field } from "../../components/UiComponents";
import { GroupsList } from "./GroupsPage";
import {
  AdminDashboard,
  TreasurerDashboard,
  MemberDashboard
} from "../Dashboard/DashboardPages";
import {
  Members,
  TreasurerMembers
} from "../Members/MembersPages";
import {
  Contributions,
  TreasurerContributions,
  MemberContributions
} from "../Contributions/ContributionsPages";
import {
  Meetings,
  MemberMeetings
} from "../Meetings/MeetingsPages";
import { Payouts } from "../Payouts/PayoutsPages";
import {
  Disbursements
} from "../Disbursements/DisbursementsPages";
import { Reports } from "../Reports/ReportsPages";
import { getNavItems } from "../../utils/navigation";
import {
  formatDate,
  getInitials,
  currentMonth,
  formatMonth,
  formatDateTime,
  authHeader
} from "../../utils/helpers";
import "../../styles/g.css";

const API = import.meta.env.VITE_API_URL;

// ── Toast helper ──────────────────────────────────────────────────────────────
const showToastHelper = (setToast) => (msg) => {
  setToast(msg);
  setTimeout(() => setToast(""), 3500);
};

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Group() {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const currentUserEmail = (currentUser.email || currentUser.user?.email || "").toLowerCase();
  const currentUsername  = currentUser.username || currentUser.user?.username || "";


  const [activeSection,  setActiveSection]  = useState(() => {
    return sessionStorage.getItem("stokvel_active_section") || "groups";
  });
  
  const [selectedGroup,  setSelectedGroup]  = useState(() => {
    const savedGroup = sessionStorage.getItem("stokvel_selected_group");
    try {
      return savedGroup ? JSON.parse(savedGroup) : null;
    } catch {
      return null;
    }
  });

  const [groups,         setGroups]         = useState([]);
  const [members,        setMembers]        = useState([]);
  const [meetings,       setMeetings]       = useState([]);
  const [loadingGroups,  setLoadingGroups]  = useState(true);
  const [showGroupForm,  setShowGroupForm]  = useState(false);
  const [toast,          setToast]          = useState("");
  const [inviteModal,    setInviteModal]    = useState(false);
  const [meetingModal,   setMeetingModal]   = useState(false);
  const [inviteName,     setInviteName]     = useState("");
  const [inviteContact,  setInviteContact]  = useState("");
  const [meetDate,       setMeetDate]       = useState("");
  const [meetTime,       setMeetTime]       = useState("");
  const [meetVenue,      setMeetVenue]      = useState("");
  const [meetLink,       setMeetLink]       = useState("");
  const [meetNotes,      setMeetNotes]      = useState("");
  const [contributions,  setContributions]  = useState([]);
  const [disbursements,  setDisbursements]  = useState([]);
  const [payLoading,     setPayLoading]     = useState(false);
  const [membersLoading,   setMembersLoading]   = useState(false);
  const [showProfile,     setShowProfile]      = useState(false);
  const navigate = useNavigate();

  const showToast = useCallback(showToastHelper(setToast), []);

  // Current user's role in the selected group
  const myMemberRole = members.find((m) => m.contact === currentUserEmail)?.role || null;
  const navItems     = getNavItems(selectedGroup ? myMemberRole : "Member");


  useEffect(() => {
    sessionStorage.setItem("stokvel_active_section", activeSection);
  }, [activeSection]);

  useEffect(() => {
    if (selectedGroup) {
      sessionStorage.setItem("stokvel_selected_group", JSON.stringify(selectedGroup));
    } else {
      sessionStorage.removeItem("stokvel_selected_group");
    }
  }, [selectedGroup]);

  // ── Load groups on mount ──────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API}/api/groups`, { headers: authHeader() })
      .then((r) => setGroups(r.data))
      .catch(() => showToast("Failed to load groups"))
      .finally(() => setLoadingGroups(false));
  }, []);

  // ── Load group data when selected ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedGroup) return;
    setMembersLoading(true);
    const h = { headers: authHeader() };
    Promise.all([
      axios.get(`${API}/api/members?groupId=${selectedGroup._id}`, h),
      axios.get(`${API}/api/meetings?groupId=${selectedGroup._id}`, h),
      axios.get(`${API}/api/payfast/contributions?groupId=${selectedGroup._id}`, h),
      axios.get(`${API}/api/payfast/disbursements?groupId=${selectedGroup._id}`, h),
    ])
      .then(([mRes, mtRes, cRes, dRes]) => {
        setMembers(mRes.data);
        setMeetings(mtRes.data);
        setContributions(cRes.data);
        setDisbursements(dRes.data);
      })
      .catch(() => showToast("Failed to load group data"))
      .finally(() => setMembersLoading(false));
  }, [selectedGroup]);

  // ── Handle payment callback ───────────────────────────────────────────────
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const ref     = params.get("ref");
    if (payment === "success") {
      showToast(`✓ Payment successful! Ref: ${ref}`);
      window.history.replaceState({}, "", window.location.pathname);
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          if (selectedGroup) {
            const r = await axios.get(`${API}/api/payfast/contributions?groupId=${selectedGroup._id}`, { headers: authHeader() });
            setContributions(r.data);
            const paid = r.data.find((c) => c.reference === ref && c.status === "paid");
            if (paid || attempts >= 5) clearInterval(interval);
          }
        } catch { clearInterval(interval); }
      }, 3000);
    } else if (payment === "cancelled") {
      showToast("Payment was cancelled");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [selectedGroup]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSelectGroup(g) {
    setSelectedGroup(g);
    setActiveSection("dashboard");
  }

  function handleBack() {
    sessionStorage.removeItem("stokvel_selected_group");
    sessionStorage.setItem("stokvel_active_section", "groups");

    setSelectedGroup(null);
    setMembers([]);
    setMeetings([]);
    setContributions([]);
    setDisbursements([]);
    setActiveSection("groups");
  }

  async function handleRoleChange(memberId, newRole) {
    try {
      const { data } = await axios.patch(`${API}/api/members/${memberId}/role`, { role: newRole }, { headers: authHeader() });
      setMembers((prev) => prev.map((m) => m._id === memberId ? { ...m, role: data.role } : m));
      showToast(`✓ Role updated to ${newRole}`);
    } catch (err) {
      showToast("Failed to update role: " + (err.response?.data?.error || err.message));
    }
  }

  async function handleFlagMissing() {
    try {
      const { data } = await axios.post(`${API}/api/flag-missing`, { groupId: selectedGroup._id, month: currentMonth() }, { headers: authHeader() });
      showToast(`✓ ${data.message}`);
    } catch (err) {
      showToast("Failed: " + (err.response?.data?.error || err.message));
    }
  }

  async function handleConfirmPayment(member) {
    setPayLoading(true);
    try {
      const { data } = await axios.post(
        `${API}/api/payfast/confirm`,
        { groupId: selectedGroup._id, memberId: member._id, month: currentMonth() },
        { headers: authHeader() }
      );
      setContributions((prev) => [data.contribution, ...prev]);
      showToast(`✓ Payment confirmed for ${member.name}`);
    } catch (err) {
      showToast("Error: " + (err.response?.data?.error || err.message));
    } finally { setPayLoading(false); }
  }

  async function handleFlagMissed(member) {
    if (!selectedGroup) return;
    setPayLoading(true);
    try {
      await axios.post(
        `${API}/api/groups/${selectedGroup._id}/flag-payment`,
        { memberId: member._id, status: 'missed' },
        { headers: authHeader() }
      );
      showToast(`✓ Payment flagged as missed for ${member.name}`);
      const { data: newContributions } = await axios.get(
        `${API}/api/payfast/contributions?groupId=${selectedGroup._id}`,
        { headers: authHeader() }
      );
      setContributions(newContributions);
    } catch (err) {
      showToast(`❌ Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setPayLoading(false);
    }
  }

  async function saveGroup(form) {
    try {
      const { data } = await axios.post(`${API}/api/group`, form, { headers: authHeader() });
      setGroups((prev) => [data, ...prev]);
      setShowGroupForm(false);
      showToast(`✓ "${data.name}" created`);
    } catch (err) {
      showToast("Failed to save: " + (err.response?.data?.error || err.message));
    }
  }

  async function sendInvite() {
    if (!inviteName.trim() || !inviteContact.trim()) { showToast("Please fill in all fields"); return; }
    try {
      const { data } = await axios.post(`${API}/api/members`, { name: inviteName, contact: inviteContact, groupId: selectedGroup._id }, { headers: authHeader() });
      setMembers((prev) => [...prev, data]);
      setInviteName(""); setInviteContact("");
      setInviteModal(false);
      showToast(`✓ Invite sent to ${inviteName.trim()}`);
    } catch (err) {
      showToast("Failed: " + (err.response?.data?.error || err.message));
    }
  }

  async function addMeeting() {
    if (!meetDate || !meetVenue.trim()) { showToast("Please add date and venue"); return; }
    try {
      const { data } = await axios.post(
        `${API}/api/meetings`,
        { date: meetDate, time: meetTime, venue: meetVenue, link: meetLink, notes: meetNotes, groupId: selectedGroup._id },
        { headers: authHeader() }
      );
      setMeetings((prev) => [...prev, data].sort((a, b) => new Date(a.date) - new Date(b.date)));
      setMeetDate(""); setMeetTime(""); setMeetVenue(""); setMeetNotes(""); setMeetLink("");
      setMeetingModal(false);
      showToast("✓ Meeting scheduled");
    } catch (err) {
      showToast("Failed: " + (err.response?.data?.error || err.message));
    }
  }

  async function handleReorder(reordered) {
    setMembers(reordered);
    try {
      await axios.put(`${API}/api/members/reorder`, { order: reordered.map((m, i) => ({ id: m._id, slot: i + 1 })) }, { headers: authHeader() });
    } catch { showToast("Failed to save order"); }
  }

  async function handlePay(member, months) {
    const monthsArray = Array.isArray(months) ? months : months ? [months] : undefined;
    setPayLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/payfast/contribute`, { groupId: selectedGroup._id, memberId: member._id, months: monthsArray }, { headers: authHeader() });
      window.location.href = data.paymentUrl;
    } catch (err) {
      showToast("Payment error: " + (err.response?.data?.error || err.message));
    } finally { setPayLoading(false); }
  }

  async function handleDisburse(member) {
    setPayLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/payfast/disburse`, { groupId: selectedGroup._id, memberId: member._id }, { headers: authHeader() });
      setDisbursements((prev) => [data.disbursement, ...prev]);
      showToast(data.message);
    } catch (err) {
      showToast("Error: " + (err.response?.data?.error || err.message));
    } finally { setPayLoading(false); }
  }

  
  async function handleDisburseNext() {
    if (!selectedGroup) { showToast("No group selected"); return; }
    setPayLoading(true);
    try {
      const token = JSON.parse(localStorage.getItem("user") || "{}");
      const authToken = token.token || token.accessToken || token.user?.token;

      const response = await fetch(`${API}/api/payfast/disburse-next`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({ groupId: selectedGroup._id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong");

      const h = { "Authorization": `Bearer ${authToken}` };
      const [groupsRes, contribRes, disbRes] = await Promise.all([
        fetch(`${API}/api/groups`, { headers: h }),
        fetch(`${API}/api/payfast/contributions?groupId=${selectedGroup._id}`, { headers: h }),
        fetch(`${API}/api/payfast/disbursements?groupId=${selectedGroup._id}`, { headers: h }),
      ]);

      const [groupsData, contribData, disbData] = await Promise.all([
        groupsRes.json(),
        contribRes.json(),
        disbRes.json(),
      ]);

      const updatedGroup = groupsData.find((g) => g._id === selectedGroup._id);
      if (updatedGroup) setSelectedGroup(updatedGroup);
      setContributions(contribData);
      setDisbursements(disbData);
      showToast(data.message || "✓ Payout recorded successfully!");
    } catch (err) {
      showToast(`${err.message}`);
    } finally { setPayLoading(false); }
  }

  async function handleMarkPaid(disbursementId) {
    try {
      const { data } = await axios.patch(
        `${API}/api/payfast/disburse/${disbursementId}`,
        {},
        { headers: authHeader() }
      );
      setDisbursements((prev) => prev.map((d) => d._id === disbursementId ? data : d));
      showToast("✓ Payout marked as paid");
    } catch (err) {
      showToast("Error: " + (err.response?.data?.error || err.message));
    }
  }

  function handleCompleteMeeting(meeting) {
    navigate(`/meetings/${meeting._id}/minutes`);
  }

  const topbarTitle = activeSection === "groups" ? "" : selectedGroup?.name || "";
  // ── Render GroupForm overlay ──────────────────────────────────────────────
  if (showGroupForm) {
    return (
      <div style={{ minHeight: "100vh", color: "#f0eeff", display: "flex", flexDirection: "column", width: "100vw" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 40px", height: 64, background: "#131929", borderBottom: "1px solid #252d45", flexShrink: 0, width: "100%" }}>
          <button onClick={() => setShowGroupForm(false)} style={{ color: "#9b7fd4", background: "none", border: "none", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
            ‹ New Group
          </button>
        </header>
        <main style={{ padding: "40px", overflowY: "auto", flex: 1, width: "100%", boxSizing: "border-box" }}>
          <GroupForm onSave={saveGroup} onCancel={() => setShowGroupForm(false)} />
        </main>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div className="app-layout">
      <header className="topbar">
        <span className="logo-icon">◈</span>
        <span className="logo-text">Stokvel</span>
        {topbarTitle && <h1 className="topbar-title" style={{ marginLeft: 24 }}>{topbarTitle}</h1>}
      </header>

      <div className="app-body">
        <aside className="sidebar" aria-label="Main navigation">
          <nav aria-label="Sections">
            <ul className="sidebar-nav">
              {navItems
                .filter((n) => n.id === "groups" || selectedGroup)
                .map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`nav-item${activeSection === item.id || (item.id === "groups" && activeSection === "dashboard") ? " active" : ""}`}
                      aria-current={activeSection === item.id ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        if (item.id === "groups") handleBack();
                        else setActiveSection(item.id);
                      }}
                    >
                      <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                      {item.label}
                    </a>
                  </li>
                ))}
            </ul>
          </nav>

          <footer className="sidebar-footer">
            <div className="sidebar-user"
              onClick={() => setShowProfile(true)} style={{ cursor: "pointer" }} >
              <div className="sidebar-user-avatar" style={{ transition: "0.2s", border: showProfile ? "2px solid #9b7fd4": "2px solid transparent" }}>{getInitials(currentUsername || currentUserEmail || "U")}</div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{currentUsername || "User"}</span>
                <span className="sidebar-user-email">{currentUserEmail}</span>
              </div>
              <span className={`sidebar-role-badge ${(myMemberRole || "member").toLowerCase()}`}>{myMemberRole  || ""}</span>
            </div>
          </footer>
        </aside>

        <div className="main">
          <main id="main-content">

            {/* Groups list — all roles */}
            <div hidden={activeSection !== "groups"}>
              <GroupsList groups={groups} loading={loadingGroups} onSelect={handleSelectGroup} onNew={() => setShowGroupForm(true)} username={currentUsername} />
            </div>

            {/* Overview — routed by role */}
            <div hidden={activeSection !== "dashboard"}>
              {selectedGroup && membersLoading && (
                <div style={{ 
                  display: "flex", alignItems: "center", justifyContent: "center", 
                  height: "60vh", flexDirection: "column", gap: 16 
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    border: "3px solid rgba(155,127,212,0.2)",
                    borderTop: "3px solid #9b7fd4",
                    animation: "spin 1s linear infinite"
                  }} />
                  <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading...</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
              {selectedGroup && !membersLoading && myMemberRole === "Admin" && (
                <AdminDashboard group={selectedGroup} members={members} meetings={meetings} onBack={handleBack} />
              )}
              {selectedGroup && !membersLoading && myMemberRole === "Treasurer" && (
                <TreasurerDashboard
                  group={selectedGroup} members={members} meetings={meetings}
                  contributions={contributions} disbursements={disbursements}
                  onBack={handleBack} onNavigate={setActiveSection}
                />
              )}
              {selectedGroup && !membersLoading && myMemberRole === "Member" && (
                <MemberDashboard
                  group={selectedGroup} members={members} meetings={meetings}
                  contributions={contributions} currentUserEmail={currentUserEmail}
                  onBack={handleBack} onNavigate={setActiveSection}
                />
              )}
              {selectedGroup && !membersLoading && !myMemberRole && members.length > 0 && (
                <p className="empty-state">Unable to determine your role in this group.</p>
              )}
            </div>

            {/* Admin-only */}
            <div hidden={activeSection !== "members"}>
              <Members members={members} onInvite={() => setInviteModal(true)} onRoleChange={handleRoleChange} currentUserEmail={currentUserEmail} />
            </div>
            <div hidden={activeSection !== "payouts"}>
              <Payouts members={members} group={selectedGroup} contributions={contributions} disbursements={disbursements} onReorder={handleReorder} />
            </div>
            <div hidden={activeSection !== "meetings"}>
              <Meetings meetings={meetings} onAddMeeting={() => setMeetingModal(true)} onCompleteMeeting={handleCompleteMeeting} />
            </div>
            <div hidden={activeSection !== "contributions"}>
              <Contributions contributions={contributions} members={members} group={selectedGroup || {}} onPay={handlePay} onFlagMissing={handleFlagMissing} loading={payLoading} onConfirm={handleConfirmPayment} onFlagMissed={handleFlagMissed} currentUserEmail={currentUserEmail} />
            </div>
            <div hidden={activeSection !== "disbursements"}>
              <Disbursements disbursements={disbursements} members={members} group={selectedGroup || {}} contributions={contributions} onDisburse={handleDisburse} onDisburseNext={myMemberRole === "Treasurer" ? handleDisburseNext : undefined} onMarkPaid={handleMarkPaid} loading={payLoading} />
            </div>
            {(myMemberRole === "Admin" || myMemberRole === "Treasurer") && (
              <div hidden={activeSection !== "reports"}>
                <Reports group={selectedGroup || {}} contributions={contributions} members={members} />
              </div>
            )}

            {/* Treasurer-only */}
            <div hidden={activeSection !== "t-members"}>
              <TreasurerMembers members={members} contributions={contributions} />
            </div>
            <div hidden={activeSection !== "t-contributions"}>
              <TreasurerContributions contributions={contributions} members={members} group={selectedGroup || {}} onConfirm={handleConfirmPayment} onFlagMissing={handleFlagMissing} onFlagMissed={handleFlagMissed} loading={payLoading} />
            </div>
            <div hidden={activeSection !== "t-meetings"}>
              <Meetings meetings={meetings} onAddMeeting={() => setMeetingModal(true)} onCompleteMeeting={handleCompleteMeeting} />
            </div>

            {/* Member-only */}
            <div hidden={activeSection !== "m-contributions"}>
              <MemberContributions contributions={contributions} members={members} group={selectedGroup || {}} onPay={handlePay} loading={payLoading} currentUserEmail={currentUserEmail} />
            </div>
            <div hidden={activeSection !== "m-meetings"}>
              <MemberMeetings meetings={meetings} />
            </div>
          </main>
        </div>
      </div>

      {/* Invite modal — admin only */}
      <Modal open={inviteModal} onClose={() => setInviteModal(false)} title="Invite a Member"
        actions={[
          <button key="send" className="btn-primary" onClick={sendInvite}>Send Invite</button>,
          <button key="cancel" className="btn-ghost" onClick={() => setInviteModal(false)}>Cancel</button>,
        ]}
      >
        <Field label="Full Name" htmlFor="invite-name">
          <input id="invite-name" type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="e.g. Zanele Dlamini" />
        </Field>
        <Field label="Email Address" htmlFor="invite-contact">
          <input id="invite-contact" type="email" value={inviteContact} onChange={(e) => setInviteContact(e.target.value)} placeholder="e.g. zanele@email.com" />
        </Field>
      </Modal>

      {/* Meeting modal — admin & treasurer */}
      <Modal open={meetingModal} onClose={() => setMeetingModal(false)} title="Schedule Meeting"
        actions={[
          <button key="add" className="btn-primary" onClick={addMeeting}>Schedule</button>,
          <button key="cancel" className="btn-ghost" onClick={() => setMeetingModal(false)}>Cancel</button>,
        ]}
      >
        <Field label="Date" htmlFor="meet-date">
          <input id="meet-date" type="date" value={meetDate} onChange={(e) => setMeetDate(e.target.value)} />
        </Field>
        <Field label="Time" htmlFor="meet-time">
          <input id="meet-time" type="time" value={meetTime} onChange={(e) => setMeetTime(e.target.value)} />
        </Field>
        <Field label="Venue" htmlFor="meet-venue">
          <input id="meet-venue" type="text" value={meetVenue} onChange={(e) => setMeetVenue(e.target.value)} placeholder="e.g. Community Hall / Zoom" />
        </Field>
        <Field label="Meeting Link (optional)" htmlFor="meet-link">
          <input id="meet-link" type="url" value={meetLink} onChange={(e) => setMeetLink(e.target.value)} placeholder="e.g. https://zoom.us/j/123456789" />
        </Field>
        <Field label="Agenda / Notes (optional)" htmlFor="meet-notes">
          <input id="meet-notes" type="text" value={meetNotes} onChange={(e) => setMeetNotes(e.target.value)} placeholder="e.g. Discuss payout schedule, review contributions..." />
        </Field>
      </Modal>

      {/* Profile Modal */}
      {showProfile && (
        <div
          className="modal-overlay open"
          onClick={() => setShowProfile(false)}
        >
          <article className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <header className="modal-header">
              <h3>My Profile</h3>
              <button className="modal-close" onClick={() => setShowProfile(false)}>✕</button>
            </header>

            <div className="modal-body">
              {/* Avatar */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "rgba(155,127,212,0.2)",
                  border: "2px solid #9b7fd4",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700,
                  color: "#c4a8f0"
                }}>
                  {getInitials(currentUsername || currentUserEmail || "U")}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>
                    {currentUsername || "User"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                    {currentUserEmail}
                  </div>
                  {myMemberRole && (
                    <span className={`sidebar-role-badge ${myMemberRole.toLowerCase()}`} style={{ marginTop: 8, display: "inline-block" }}>
                      {myMemberRole}
                    </span>
                  )}
                </div>
              </div>

              {/* Info rows */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>Email</span>
                  <span style={{ color: "var(--text)" }}>{currentUserEmail}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>Username</span>
                  <span style={{ color: "var(--text)" }}>{currentUsername || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>Groups</span>
                  <span style={{ color: "var(--text)" }}>{groups.length}</span>
                </div>
              </div>
            </div>

            <footer className="modal-actions" style={{ flexDirection: "column", gap: 8 }}>
              <button
                className="btn-primary"
                style={{ width: "100%", background: "#7d1010", justifyContent: "center" }}
                onClick={() => {
                  localStorage.removeItem("user");
                  window.location.href = "/login";
                }}
              >
                <span className="material-icons" style={{ fontSize: 18 }}></span> Logout
                
              </button>
              <button className="btn-ghost" style={{ width: "100%" }} onClick={() => setShowProfile(false)}>
                Cancel
              </button>
            </footer>
          </article>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}