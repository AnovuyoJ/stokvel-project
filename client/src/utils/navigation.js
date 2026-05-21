// src/pages/Group/utils/navigation.js

export const ADMIN_NAV = [
  { id: "groups",        icon: "⌂", label: "My Groups" },
  { id: "members",       icon: "⬡", label: "Members" },
  { id: "payouts",       icon: "◎", label: "Payout Order" },
  { id: "meetings",      icon: "◷", label: "Meetings" },
  { id: "contributions", icon: "₴", label: "Contributions" },
  { id: "disbursements", icon: "◈", label: "Disbursements" },
  { id: "reports",       icon: "◧", label: "Reports" },
];

export const TREASURER_NAV = [
  { id: "groups",          icon: "⌂", label: "My Groups" },
  { id: "dashboard",       icon: "◎", label: "Overview" },
  { id: "t-members",       icon: "⬡", label: "Members" },
  { id: "t-contributions", icon: "₴", label: "Contributions" },
  { id: "t-meetings",      icon: "◷", label: "Meetings" },
  { id: "disbursements",   icon: "◈", label: "Disbursements" },
  { id: "reports",         icon: "◧", label: "Reports" },
];

export const MEMBER_NAV = [
  { id: "groups",          icon: "⌂", label: "My Groups" },
  { id: "dashboard",       icon: "◎", label: "Overview" },
  { id: "m-contributions", icon: "₴", label: "My Contributions" },
  { id: "m-meetings",      icon: "◷", label: "Meetings" },
];

export function getNavItems(role) {
  if (role === "Admin")     return ADMIN_NAV;
  if (role === "Treasurer") return TREASURER_NAV;
  return MEMBER_NAV;
}