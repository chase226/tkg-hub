/* ==========================================================================
   TKG Hub — router + views
   ========================================================================== */

import { checklistFor } from "./checklists.js";
import { REQUESTS } from "./requests.js";
import {
  loadDeals, savedPasscode, rememberPasscode, forgetPasscode,
  whoAmI, setWhoAmI,
  isChecked, toggleCheck, doneCount, exportState, importState,
  daysUntil, fmtDate, fmtCountdown, fmtMoney,
  stageRank, nextDeadline, allDeadlines,
} from "./store.js";

let DB = null;              // decrypted payload
let filters = { q: "", agent: "", side: "", status: "" };

/* ------------------------------------------------------------- helpers -- */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("is-on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("is-on"), 2200);
}

const STATUS_PILL = {
  "Pre-listing": "live",
  "Active Listing": "live",
  "Under Contract": "uc",
  Pending: "pending",
  Closed: "closed",
  "Canceled / Fell Out": "dead",
};

const HEALTH_PILL = { "On Track": "ontrack", "At Risk": "atrisk", Stuck: "stuck" };

function statusPill(status) {
  if (!status) return `<span class="pill pill--dead">No status</span>`;
  return `<span class="pill pill--${STATUS_PILL[status] || ""}">${esc(status)}</span>`;
}

function mapsUrl(name) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}`;
}

/* --------------------------------------------------------------- gate -- */

async function unlock(passcode, persist) {
  DB = await loadDeals(passcode);
  rememberPasscode(passcode, persist);
  $("#gate").classList.add("hidden");
  $("#app").classList.remove("hidden");
  route();
}

function mountGate() {
  const err = $("#gate-err");
  $("#gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#gate-btn");
    err.textContent = "";
    btn.disabled = true;
    btn.textContent = "Unlocking…";
    try {
      await unlock($("#gate-pass").value, $("#gate-remember").checked);
    } catch (ex) {
      err.textContent =
        ex.message === "DATA_MISSING"
          ? "Deal data not found. Run tools/build_data.py and push."
          : "That passcode did not work.";
      $("#gate-pass").select();
    } finally {
      btn.disabled = false;
      btn.textContent = "Unlock";
    }
  });
}

/* ------------------------------------------------------------- filters -- */

function visibleDeals() {
  const q = filters.q.trim().toLowerCase();
  return DB.deals.filter((d) => {
    if (filters.agent && !d.agents.includes(filters.agent)) return false;
    if (filters.side && d.side !== filters.side) return false;
    if (filters.status === "__live" && !d.isLive) return false;
    if (filters.status && filters.status !== "__live" && d.status !== filters.status) return false;
    if (!q) return true;
    const hay = [d.name, d.agents.join(" "), d.status, d.side, d.notes,
      ...d.people.map((p) => p.raw)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function sortForBoard(deals) {
  return [...deals].sort((a, b) => {
    const sr = stageRank(a.status) - stageRank(b.status);
    if (sr) return sr;
    const ad = nextDeadline(a)?.date || "9999";
    const bd = nextDeadline(b)?.date || "9999";
    return ad.localeCompare(bd);
  });
}

/* ---------------------------------------------------------- deal card -- */

function dealCard(d) {
  const cl = checklistFor(d);
  const ids = cl.groups.flatMap((g) => g.items.map((i) => i.id));
  const done = doneCount(d.id, ids);
  const pct = cl.total ? Math.round((done / cl.total) * 100) : 0;

  const nd = nextDeadline(d);
  const cd = nd ? fmtCountdown(nd.date) : null;
  const tone = cd?.tone === "overdue" ? "overdue" : cd?.tone === "soon" ? "soon" : "ok";

  const meta = [];
  if (d.price) meta.push(`<span><b>${fmtMoney(d.price, true)}</b></span>`);
  if (d.gciDollars) meta.push(`<span>GCI <b>${fmtMoney(d.gciDollars)}</b></span>`);
  if (d.agents.length) meta.push(`<span>${esc(d.agents.join(" + "))}</span>`);
  if (nd) {
    meta.push(
      `<span>${esc(nd.label)} <span class="deal__countdown deal__countdown--${cd.tone}">${esc(cd.text)}</span></span>`
    );
  }

  return `
    <a class="deal deal--${d.isLive ? tone : "ok"}" href="#/deal/${d.id}">
      <div class="deal__top">
        <div>
          <div class="deal__addr">${esc(d.street)}</div>
          ${d.locality ? `<div class="deal__city">${esc(d.locality)}</div>` : ""}
        </div>
        <div class="deal__pills">
          ${statusPill(d.status)}
          ${d.side ? `<span class="pill">${esc(d.side)}</span>` : ""}
          ${d.health && HEALTH_PILL[d.health] ? `<span class="pill pill--${HEALTH_PILL[d.health]}">${esc(d.health)}</span>` : ""}
        </div>
      </div>
      <div class="deal__meta">${meta.join("")}</div>
      <div class="deal__progress">
        <div class="bar"><div class="bar__fill ${pct === 100 ? "bar__fill--done" : ""}" style="width:${pct}%"></div></div>
        <span>${done}/${cl.total}</span>
      </div>
      ${d.flags.length ? `<div class="deal__flag">${esc(d.flags[0])}${d.flags.length > 1 ? ` · +${d.flags.length - 1} more` : ""}</div>` : ""}
    </a>`;
}

/* -------------------------------------------------------------- views -- */

function viewDashboard() {
  const live = DB.deals.filter((d) => d.isLive);
  const deals = sortForBoard(visibleDeals());

  const pipelineVol = live.reduce((n, d) => n + (d.price || 0), 0);
  const pipelineGci = live.reduce((n, d) => n + (d.gciDollars || 0), 0);

  const thisYear = String(new Date().getFullYear());
  const closedYtd = DB.deals.filter(
    (d) => d.status === "Closed" && (d.closingDate || "").startsWith(thisYear)
  );
  const closedVol = closedYtd.reduce((n, d) => n + (d.price || 0), 0);

  const urgent = live.filter((d) => {
    const nd = nextDeadline(d);
    if (!nd) return false;
    const n = daysUntil(nd.date);
    return n !== null && n <= 7;
  });

  const flagged = DB.deals.filter((d) => d.flags.length);

  const agents = [...new Set(DB.deals.flatMap((d) => d.agents))].sort();
  const statuses = [...new Set(DB.deals.map((d) => d.status).filter(Boolean))]
    .sort((a, b) => stageRank(a) - stageRank(b));

  // Group the filtered set by stage so the board reads like the pipeline.
  const buckets = new Map();
  for (const d of deals) {
    const k = d.status || "No status";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(d);
  }

  const sections = [...buckets.entries()]
    .map(
      ([stage, list]) => `
      <div class="section-title">
        <h2>${esc(stage)}</h2><span>${list.length} deal${list.length === 1 ? "" : "s"}</span>
      </div>
      <div class="deals">${list.map(dealCard).join("")}</div>`
    )
    .join("");

  return `
    <div class="wrap">
      <div class="page-head">
        <div>
          <div class="eyebrow">The Kincer Group</div>
          <h1>Transaction Dashboard</h1>
        </div>
        <div class="actions">
          <a class="btn btn--ghost btn--sm" href="#/radar">Deadline radar</a>
          <a class="btn btn--ghost btn--sm" href="#/hygiene">Data check (${flagged.length})</a>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat__label">Live deals</div>
          <div class="stat__value">${live.length}</div>
          <div class="stat__sub">of ${DB.deals.length} on the board</div>
        </div>
        <div class="stat">
          <div class="stat__label">Pipeline volume</div>
          <div class="stat__value">${fmtMoney(pipelineVol, true)}</div>
          <div class="stat__sub">under contract + listed</div>
        </div>
        <div class="stat">
          <div class="stat__label">Projected GCI</div>
          <div class="stat__value">${fmtMoney(pipelineGci, true)}</div>
          <div class="stat__sub">where GCI % is filled in</div>
        </div>
        <div class="stat">
          <div class="stat__label">Closed ${thisYear}</div>
          <div class="stat__value">${closedYtd.length}</div>
          <div class="stat__sub">${fmtMoney(closedVol, true)} volume</div>
        </div>
        <div class="stat ${urgent.length ? "stat--alert" : ""}">
          <div class="stat__label">Due in 7 days</div>
          <div class="stat__value">${urgent.length}</div>
          <div class="stat__sub">deadlines needing action</div>
        </div>
      </div>

      <div class="toolbar">
        <input class="input toolbar__search" id="f-q" type="search"
               placeholder="Search address, client, agent, notes…" value="${esc(filters.q)}">
        <select class="input" id="f-status">
          <option value="">All stages</option>
          <option value="__live"${filters.status === "__live" ? " selected" : ""}>Live only</option>
          ${statuses.map((s) => `<option${filters.status === s ? " selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
        <select class="input" id="f-agent">
          <option value="">All agents</option>
          ${agents.map((a) => `<option${filters.agent === a ? " selected" : ""}>${esc(a)}</option>`).join("")}
        </select>
        <select class="input" id="f-side">
          <option value="">Buy + Sell</option>
          ${["Buy", "Sell", "Double ended"].map((s) => `<option${filters.side === s ? " selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
      </div>

      ${deals.length ? sections : `<div class="empty"><div class="empty__big">◇</div>No deals match those filters.</div>`}
    </div>`;
}

function viewRadar() {
  const rows = [];
  for (const d of DB.deals.filter((x) => x.isLive)) {
    for (const dl of allDeadlines(d)) {
      if (dl.past) continue;
      const n = daysUntil(dl.date);
      if (n === null || n > 30) continue;
      rows.push({ deal: d, label: dl.label, date: dl.date, n });
    }
  }
  rows.sort((a, b) => a.n - b.n);

  const body = rows.length
    ? rows
        .map((r) => {
          const c = fmtCountdown(r.date);
          return `
        <a class="radar-row" href="#/deal/${r.deal.id}">
          <div class="radar-row__when radar-row__when--${c.tone}">${esc(c.text)}</div>
          <div class="radar-row__what">
            <b>${esc(r.label)}</b>
            <span>${esc(r.deal.street)} · ${esc(r.deal.agents.join(" + ") || "Unassigned")}</span>
          </div>
          <div class="radar-row__date">${esc(fmtDate(r.date))}</div>
        </a>`;
        })
        .join("")
    : `<div class="empty"><div class="empty__big">✓</div>Nothing due in the next 30 days.</div>`;

  return `
    <div class="wrap">
      <div class="page-head">
        <div>
          <div class="eyebrow">Next 30 days</div>
          <h1>Deadline Radar</h1>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/">Home</a>
      </div>
      <div class="card"><div class="card__body--flush">${body}</div></div>
    </div>`;
}

function viewHygiene() {
  const flagged = DB.deals
    .filter((d) => d.flags.length)
    .sort((a, b) => b.flags.length - a.flags.length);

  const body = flagged.length
    ? flagged
        .map(
          (d) => `
      <div class="person">
        <div class="person__role">${esc(d.status || "No status")} · ${esc(d.agents.join(" + ") || "Unassigned")}</div>
        <div class="person__raw"><a href="#/deal/${d.id}" style="font-weight:600">${esc(d.street)}</a></div>
        <ul class="flags-list">${d.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      </div>`
        )
        .join("")
    : `<div class="empty"><div class="empty__big">✓</div>The board is clean.</div>`;

  return `
    <div class="wrap">
      <div class="page-head">
        <div>
          <div class="eyebrow">Board integrity</div>
          <h1>Data Check</h1>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/">Home</a>
      </div>
      <p class="note-inline" style="margin-bottom:18px">
        Every issue below is a deal whose monday record contradicts itself or is missing
        something a live file needs. Fix it on the board, then re-run the sync.
      </p>
      <div class="card"><div class="card__body--flush">${body}</div></div>
    </div>`;
}

function viewDeal(id) {
  const d = DB.deals.find((x) => x.id === id);
  if (!d) return `<div class="wrap"><div class="empty">Deal not found.</div></div>`;

  const cl = checklistFor(d);
  const ids = cl.groups.flatMap((g) => g.items.map((i) => i.id));
  const done = doneCount(d.id, ids);
  const pct = cl.total ? Math.round((done / cl.total) * 100) : 0;

  const money = [
    { label: "Sales price", value: d.price ? fmtMoney(d.price) : null },
    { label: "GCI %", value: d.gciPct ? `${d.gciPct}%` : null },
    { label: "GCI $", value: d.gciDollars ? fmtMoney(d.gciDollars) : null },
    { label: "Earnest money", value: d.emd ? fmtMoney(d.emd) : null },
    { label: "Agent split", value: d.agentSplit ? `${d.agentSplit}%` : null },
  ];

  const factHtml = money
    .map(
      (f) => `
    <div class="fact">
      <div class="fact__label">${esc(f.label)}</div>
      <div class="fact__value ${f.value ? "" : "fact__value--muted"}">${esc(f.value || "not set")}</div>
    </div>`
    )
    .join("");

  const timeline = allDeadlines(d)
    .map((dl) => {
      const n = daysUntil(dl.date);
      const cls = dl.past || n < 0 ? (dl.past ? "done" : "overdue") : n <= 7 ? "next" : "";
      const c = fmtCountdown(dl.date);
      return `
      <div class="tl__item">
        <div class="tl__dot tl__dot--${cls}"></div>
        <div class="tl__label">${esc(dl.label)}</div>
        <div class="tl__date">${esc(fmtDate(dl.date))}${dl.past ? "" : ` · ${esc(c.text)}`}</div>
      </div>`;
    })
    .join("");

  const people = d.people.length
    ? d.people
        .map((p) => {
          const acts = [
            ...p.phones.map(
              (ph) => `<a class="btn btn--ghost btn--sm" href="tel:${esc(ph)}">Call ${esc(ph.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3"))}</a>`
            ),
            ...p.emails.map(
              (em) => `<a class="btn btn--ghost btn--sm" href="mailto:${esc(em)}">Email</a>`
            ),
          ];
          return `
        <div class="person">
          <div class="person__role">${esc(p.role)}</div>
          <div class="person__raw">${esc(p.raw)}</div>
          ${acts.length ? `<div class="person__acts">${acts.join("")}</div>` : ""}
        </div>`;
        })
        .join("")
    : `<div class="card__body"><span class="fact__value--muted">No contacts on the board record yet.</span></div>`;

  const checklistHtml = cl.groups
    .map(
      (g) => `
    <div class="chk-group">
      <div class="chk-group__title">${esc(g.title)}</div>
      ${g.items
        .map((it) => {
          const on = isChecked(d.id, it.id);
          return `
        <label class="chk">
          <input type="checkbox" data-deal="${esc(d.id)}" data-item="${esc(it.id)}"${on ? " checked" : ""}>
          <span class="chk__body">
            <span class="chk__text">${esc(it.text)}</span>
            ${it.note ? `<span class="chk__note">${esc(it.note)}</span>` : ""}
          </span>
        </label>`;
        })
        .join("")}
    </div>`
    )
    .join("");

  const links = [
    d.links.monday && { href: d.links.monday, label: "Open in monday" },
    d.links.lofty && { href: d.links.lofty, label: "Open in Lofty" },
    d.links.dotloop && { href: d.links.dotloop, label: "Open in Dotloop" },
  ].filter(Boolean);

  return `
    <div class="detail-head">
      <div class="wrap">
        <a class="back-link" href="#/deals">← All deals</a>
        <h1>${esc(d.street)}</h1>
        ${d.locality ? `<div class="locality">${esc(d.locality)}</div>` : ""}
        <div class="detail-head__pills">
          ${statusPill(d.status)}
          ${d.side ? `<span class="pill">${esc(d.side)}</span>` : ""}
          ${d.health ? `<span class="pill">${esc(d.health)}</span>` : ""}
          ${d.agents.length ? `<span class="pill">${esc(d.agents.join(" + "))}</span>` : ""}
        </div>
      </div>
    </div>

    <div class="wrap">
      ${d.flags.length ? `
        <div class="card" style="border-color:rgba(181,84,76,.4)">
          <div class="card__head"><h3>Needs attention</h3></div>
          <div class="card__body"><ul class="flags-list" style="margin:0">${d.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>
        </div>` : ""}

      <div class="grid-2">
        <div>
          <div class="card">
            <div class="card__head">
              <h3>${esc(cl.label)}</h3>
              <span id="chk-count" style="font-size:12px;color:var(--text-3)">${done}/${cl.total} done</span>
            </div>
            <div class="chk-progress">
              <div class="bar"><div class="bar__fill ${pct === 100 ? "bar__fill--done" : ""}" style="width:${pct}%"></div></div>
              <span>${pct}%</span>
            </div>
            <div class="card__body--flush">${checklistHtml}</div>
          </div>

          ${d.notes ? `
          <div class="card">
            <div class="card__head"><h3>Notes from the board</h3></div>
            <div class="card__body"><div class="notes">${esc(d.notes)}</div></div>
          </div>` : ""}
        </div>

        <div>
          <div class="card">
            <div class="card__head"><h3>Actions</h3></div>
            <div class="card__body">
              <div class="actions">
                ${links.map((l) => `<a class="btn btn--ghost btn--sm" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}
                <a class="btn btn--ghost btn--sm" href="${esc(mapsUrl(d.name))}" target="_blank" rel="noopener">Directions</a>
                <button class="btn btn--ghost btn--sm" data-copy="${esc(d.name)}">Copy address</button>
                ${d.closingDate ? `<button class="btn btn--ghost btn--sm" data-ics="${esc(d.id)}">Add closing to calendar</button>` : ""}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h3>The money</h3></div>
            <div class="card__body"><div class="facts">${factHtml}</div></div>
          </div>

          ${timeline ? `
          <div class="card">
            <div class="card__head"><h3>Key dates</h3></div>
            <div class="card__body"><div class="tl">${timeline}</div></div>
          </div>` : ""}

          <div class="card">
            <div class="card__head"><h3>Who's on this deal</h3></div>
            <div class="card__body--flush">${people}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function reqTile(r) {
  return `
    <a class="tile tile--${r.kind}" href="${esc(r.url)}" target="_blank" rel="noopener">
      <div class="tile__top">
        <span class="tile__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
               stroke-linecap="round" stroke-linejoin="round">${r.icon}</svg>
        </span>
        <span class="tile__kind">${r.kind === "internal" ? "Tracked on monday" : "Goes to LPT"}</span>
      </div>

      <h3 class="tile__title">${esc(r.title)}</h3>
      <p class="tile__blurb">${esc(r.blurb)}</p>

      <div class="tile__need">
        <span class="tile__need-label">Have ready</span>
        <ul>${r.needBefore.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
      </div>

      <span class="tile__go">${esc(r.cta)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
    </a>`;
}

function viewHome() {
  const live = DB.deals.filter((d) => d.isLive);
  const pipelineVol = live.reduce((n, d) => n + (d.price || 0), 0);
  const flagged = DB.deals.filter((d) => d.flags.length).length;

  // The three most urgent things across every live deal — the one thing worth
  // seeing before you do anything else.
  const soon = [];
  for (const d of live) {
    for (const dl of allDeadlines(d)) {
      if (dl.past) continue;
      const n = daysUntil(dl.date);
      if (n === null || n > 14) continue;
      soon.push({ deal: d, label: dl.label, date: dl.date, n });
    }
  }
  soon.sort((a, b) => a.n - b.n);

  const soonHtml = soon.length
    ? soon
        .slice(0, 3)
        .map((r) => {
          const c = fmtCountdown(r.date);
          return `<a class="urg" href="#/deal/${r.deal.id}">
            <span class="urg__when urg__when--${c.tone}">${esc(c.text)}</span>
            <span class="urg__what"><b>${esc(r.deal.street)}</b> ${esc(r.label)}</span>
          </a>`;
        })
        .join("")
    : `<div class="urg urg--none">Nothing due in the next two weeks.</div>`;

  const extra = soon.length > 3 ? soon.length - 3 : 0;

  return `
    <div class="hero">
      <div class="wrap">
        <div class="hero__eyebrow">The Kincer Group</div>
        <h1 class="hero__title">What do you need?</h1>
        <p class="hero__sub">
          Submit it here and it gets tracked. Nothing gets lost in a text thread.
        </p>
      </div>
    </div>

    <div class="wrap">
      <div class="tiles">${REQUESTS.map(reqTile).join("")}</div>

      <div class="section-title" style="margin-top:34px">
        <h2>Where things stand</h2>
        <span>${live.length} live deals · ${fmtMoney(pipelineVol, true)} in the pipeline</span>
      </div>

      <div class="glance">
        <div class="glance__urgent">
          <div class="glance__label">Needs attention first</div>
          ${soonHtml}
          ${extra ? `<a class="urg urg--more" href="#/radar">+ ${extra} more in the next 14 days</a>` : ""}
        </div>
        <div class="glance__links">
          <a class="glance__link" href="#/deals">
            <b>All deals</b><span>Pipeline, filters, per-deal checklists</span>
          </a>
          <a class="glance__link" href="#/radar">
            <b>Deadline radar</b><span>Everything due in the next 30 days</span>
          </a>
          <a class="glance__link" href="#/hygiene">
            <b>Data check</b><span>${flagged} board records need fixing</span>
          </a>
        </div>
      </div>
    </div>`;
}

function viewSettings() {
  return `
    <div class="wrap">
      <div class="page-head">
        <div>
          <div class="eyebrow">Your device</div>
          <h1>Settings</h1>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/">Home</a>
      </div>

      <div class="card">
        <div class="card__head"><h3>Who are you</h3></div>
        <div class="card__body">
          <p style="font-size:13.5px;color:var(--text-3)">
            Stamped on items you check off, so the team can see who did what once sync is on.
          </p>
          <input class="input" id="who" placeholder="e.g. Chase Kincer" value="${esc(whoAmI())}" style="max-width:320px">
        </div>
      </div>

      <div class="card">
        <div class="card__head"><h3>Checklist progress</h3></div>
        <div class="card__body">
          <p style="font-size:13.5px;color:var(--text-3)">
            Progress is saved on this device. Export it to move to another device or to
            hand it to Chase — importing merges, it never wipes what is already there.
          </p>
          <div class="actions">
            <button class="btn btn--ghost btn--sm" id="export-btn">Export progress</button>
            <button class="btn btn--ghost btn--sm" id="import-btn">Import progress</button>
            <input type="file" id="import-file" accept="application/json" class="hidden">
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><h3>Access</h3></div>
        <div class="card__body">
          <p style="font-size:13.5px;color:var(--text-3)">
            Deal data is AES-256 encrypted in the repo. Locking clears the saved passcode
            from this browser — do this on a shared or borrowed device.
          </p>
          <button class="btn btn--sm" id="lock-btn">Lock the hub</button>
        </div>
      </div>

      <p class="note-inline">
        Data pulled from the monday board <b>${esc(DB.source)}</b> on
        ${esc(new Date(DB.generatedAt).toLocaleString("en-US"))}.
      </p>
    </div>`;
}

/* ------------------------------------------------------------ actions -- */

function downloadIcs(deal) {
  const d = deal.closingDate.replace(/-/g, "");
  const end = new Date(deal.closingDate);
  end.setDate(end.getDate() + 1);
  const dEnd = end.toISOString().slice(0, 10).replace(/-/g, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Kincer Group//TKG Hub//EN",
    "BEGIN:VEVENT",
    `UID:tkg-${deal.id}@thekincergroup.com`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${dEnd}`,
    `SUMMARY:Closing — ${deal.street}`,
    `DESCRIPTION:${(deal.agents.join(" + ") || "TKG")} · ${deal.side || ""}`,
    `LOCATION:${deal.name}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `closing-${deal.street.replace(/\W+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------- router -- */

function route() {
  const hash = location.hash || "#/";
  const view = $("#view");

  const dealMatch = hash.match(/^#\/deal\/(.+)$/);
  if (dealMatch) view.innerHTML = viewDeal(dealMatch[1]);
  else if (hash === "#/deals") view.innerHTML = viewDashboard();
  else if (hash === "#/radar") view.innerHTML = viewRadar();
  else if (hash === "#/hygiene") view.innerHTML = viewHygiene();
  else if (hash === "#/settings") view.innerHTML = viewSettings();
  else view.innerHTML = viewHome();

  document.querySelectorAll(".topnav a").forEach((a) => {
    a.classList.toggle("is-active", a.getAttribute("href") === hash);
  });

  window.scrollTo(0, 0);
  wireView();
}

function wireView() {
  const q = $("#f-q");
  if (q) {
    q.addEventListener("input", (e) => {
      filters.q = e.target.value;
      const pos = e.target.selectionStart;
      route();
      const nq = $("#f-q");
      nq.focus();
      nq.setSelectionRange(pos, pos);
    });
  }
  $("#f-status")?.addEventListener("change", (e) => { filters.status = e.target.value; route(); });
  $("#f-agent")?.addEventListener("change", (e) => { filters.agent = e.target.value; route(); });
  $("#f-side")?.addEventListener("change", (e) => { filters.side = e.target.value; route(); });

  $("#who")?.addEventListener("change", (e) => {
    setWhoAmI(e.target.value.trim());
    toast("Saved");
  });

  $("#export-btn")?.addEventListener("click", () => {
    download("tkg-hub-progress.json", exportState(), "application/json");
    toast("Progress exported");
  });

  $("#import-btn")?.addEventListener("click", () => $("#import-file").click());
  $("#import-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importState(await file.text());
      toast("Progress merged in");
      route();
    } catch {
      toast("That file did not look right");
    }
  });

  $("#lock-btn")?.addEventListener("click", () => {
    forgetPasscode();
    location.reload();
  });
}

/* --------------------------------------------------------- global wire -- */

document.addEventListener("change", (e) => {
  const box = e.target.closest('input[type="checkbox"][data-item]');
  if (!box) return;
  toggleCheck(box.dataset.deal, box.dataset.item, box.checked);

  // Repaint just the progress bar rather than the whole page, so the list
  // does not jump under the agent's finger mid-checkoff.
  const deal = DB.deals.find((x) => x.id === box.dataset.deal);
  const cl = checklistFor(deal);
  const ids = cl.groups.flatMap((g) => g.items.map((i) => i.id));
  const done = doneCount(deal.id, ids);
  const pct = Math.round((done / cl.total) * 100);
  const fill = $(".chk-progress .bar__fill");
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.classList.toggle("bar__fill--done", pct === 100);
    $(".chk-progress span").textContent = `${pct}%`;
    $("#chk-count").textContent = `${done}/${cl.total} done`;
  }
});

document.addEventListener("click", (e) => {
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) {
    navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => toast("Address copied"));
    return;
  }
  const icsBtn = e.target.closest("[data-ics]");
  if (icsBtn) {
    downloadIcs(DB.deals.find((x) => x.id === icsBtn.dataset.ics));
    toast("Calendar file downloaded");
  }
});

$("#theme-btn").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : cur === "light" ? "dark" :
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("tkg.hub.theme", next);
});

window.addEventListener("hashchange", route);

/* ---------------------------------------------------------------- boot -- */

const savedTheme = localStorage.getItem("tkg.hub.theme");
if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

mountGate();

(async () => {
  const p = savedPasscode();
  if (p) {
    try {
      await unlock(p, Boolean(localStorage.getItem("tkg.hub.pass")));
      return;
    } catch {
      forgetPasscode();
    }
  }
  $("#gate").classList.remove("hidden");
  $("#gate-pass").focus();
})();
