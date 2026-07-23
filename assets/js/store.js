/* ==========================================================================
   TKG Hub — data + state layer

   Two separate concerns live here on purpose:

   1. DEAL DATA — read-only, decrypted from data/deals.enc.json with the team
      passcode. Rebuilt from the monday board by tools/build_data.py.
   2. CHECKLIST STATE — read/write, currently per-device in localStorage.
      Every write goes through saveState(), so swapping in a shared backend
      later is a change to two functions, not a rewrite.
   ========================================================================== */

const DATA_URL = "data/deals.enc.json";
const PASS_KEY = "tkg.hub.pass";
const STATE_KEY = "tkg.hub.state.v1";
const WHO_KEY = "tkg.hub.who";

/* -------------------------------------------------------------- crypto -- */

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passcode, salt, iterations) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

/**
 * Fetch and decrypt the deal payload. Throws "BAD_PASSCODE" on a failed
 * decrypt — AES-GCM authenticates, so a wrong passcode fails loudly rather
 * than returning garbage.
 */
export async function loadDeals(passcode) {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("DATA_MISSING");
  const env = await res.json();

  const key = await deriveKey(passcode, b64(env.kdf.salt), env.kdf.iterations);
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64(env.iv) },
      key,
      b64(env.ct)
    );
  } catch {
    throw new Error("BAD_PASSCODE");
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ------------------------------------------------------------ passcode -- */

export const savedPasscode = () => sessionStorage.getItem(PASS_KEY) || localStorage.getItem(PASS_KEY);
export const rememberPasscode = (p, persist) =>
  (persist ? localStorage : sessionStorage).setItem(PASS_KEY, p);
export function forgetPasscode() {
  sessionStorage.removeItem(PASS_KEY);
  localStorage.removeItem(PASS_KEY);
}

/* --------------------------------------------------------------- who -- */

export const whoAmI = () => localStorage.getItem(WHO_KEY) || "";
export const setWhoAmI = (name) => localStorage.setItem(WHO_KEY, name);

/* -------------------------------------------------------- checkstate -- */

let state = readState();

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) || { checks: {} };
  } catch {
    return { checks: {} };
  }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/** All checked item ids for one deal. */
export function checksFor(dealId) {
  return state.checks[dealId] || {};
}

export function isChecked(dealId, itemId) {
  return Boolean(checksFor(dealId)[itemId]);
}

export function toggleCheck(dealId, itemId, on, by) {
  state.checks[dealId] = state.checks[dealId] || {};
  if (on) {
    state.checks[dealId][itemId] = { at: new Date().toISOString(), by: by || whoAmI() || "" };
  } else {
    delete state.checks[dealId][itemId];
  }
  saveState();
}

export function doneCount(dealId, validIds) {
  const c = checksFor(dealId);
  return validIds.reduce((n, id) => n + (c[id] ? 1 : 0), 0);
}

/** Full backup so progress can move between devices until sync lands. */
export function exportState() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importState(json) {
  const incoming = JSON.parse(json);
  if (!incoming || typeof incoming.checks !== "object") throw new Error("BAD_FILE");
  // Merge rather than replace — never destroy another device's progress.
  for (const [dealId, items] of Object.entries(incoming.checks)) {
    state.checks[dealId] = { ...(state.checks[dealId] || {}), ...items };
  }
  saveState();
}

/* ---------------------------------------------------------- date help -- */

/** Whole days from today to an ISO date. Negative = in the past. */
export function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target - today) / 86400000);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtCountdown(iso) {
  const n = daysUntil(iso);
  if (n === null) return { text: "No date", tone: "" };
  if (n < 0) return { text: `${Math.abs(n)}d past`, tone: "overdue" };
  if (n === 0) return { text: "Today", tone: "overdue" };
  if (n === 1) return { text: "Tomorrow", tone: "soon" };
  if (n <= 7) return { text: `${n} days`, tone: "soon" };
  return { text: `${n} days`, tone: "" };
}

export function fmtMoney(n, compact) {
  if (n === null || n === undefined || n === "") return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n);
}

/* --------------------------------------------------------- deal derive -- */

const STAGE_ORDER = [
  "Pre-listing",
  "Active Listing",
  "Under Contract",
  "Pending",
  "Closed",
  "Canceled / Fell Out",
];

export function stageRank(status) {
  const i = STAGE_ORDER.indexOf(status);
  return i === -1 ? 99 : i;
}

/**
 * The soonest date that still needs action on a deal. Drives card sorting
 * and the deadline radar — an agent should never have to hunt for what is
 * due next.
 */
export function nextDeadline(deal) {
  const candidates = [
    { label: "Inspection deadline", date: deal.inspectionDeadline },
    { label: "Financing deadline", date: deal.financingDeadline },
    { label: "Closing", date: deal.closingDate },
  ].filter((c) => c.date);

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.date.localeCompare(b.date));

  // Prefer the next one that has not passed; otherwise the most recent miss.
  const upcoming = candidates.find((c) => daysUntil(c.date) >= 0);
  return upcoming || candidates[candidates.length - 1];
}

export function allDeadlines(deal) {
  return [
    { label: "Contract ratified", date: deal.contractDate, past: true },
    { label: "Inspection deadline", date: deal.inspectionDeadline },
    { label: "Financing deadline", date: deal.financingDeadline },
    { label: "Closing", date: deal.closingDate },
  ].filter((d) => d.date);
}
