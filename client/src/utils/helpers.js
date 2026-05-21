// src/pages/Group/utils/helpers.js

export function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function getInitials(name) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonth(m) {
  if (!m) return "—";
  const [year, month] = m.split("-");
  return new Date(year, month - 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

export function formatDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function futureMonths(count = 5) {
  const months = [];
  const now = new Date();
  for (let i = 0; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export function calcInterest(paidAt, forMonth, amount, annualRate) {
  if (!paidAt || !forMonth || !amount || !annualRate) return 0;
  const paidDate = new Date(paidAt);
  const [year, month] = forMonth.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const daysEarly = Math.max(0, (monthStart - paidDate) / 86400000);
  return parseFloat((amount * (annualRate / 100) * (daysEarly / 365)).toFixed(2));
}

export function addMonths(yearMonth, n) {
  const [year, month] = yearMonth.split("-").map(Number);
  const d = new Date(year, month - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthsBetween(start, end) {
  const result = [];
  let cur = start;
  while (cur <= end) {
    result.push(cur);
    cur = addMonths(cur, 1);
  }
  return result;
}

export function authHeader() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  // The token is directly on the user object from login response
  const token = user.token;
  
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}