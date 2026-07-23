# TKG Hub

Internal transaction dashboard for The Kincer Group. One URL the team opens on
a phone or a laptop to see every live deal, what is due next, and exactly what
still has to be done on each file.

Static site. No server, no database, no monthly bill.

---

## The security setup — read this first

GitHub Pages on the free tier **only serves public repositories**. A private
repo cannot serve a private site. This board carries client names, emails,
phone numbers, lender and title contacts, and commission splits — none of that
can sit in a public repo as plaintext.

So it does not. `data/deals.enc.json` is the deal data encrypted with
**AES-256-GCM**, keyed from the team passcode through **PBKDF2-SHA256 at
250,000 iterations**. What is published is ciphertext. The passcode is typed
into the browser, never sent anywhere, and the decryption happens client-side
in WebCrypto. A wrong passcode fails loudly — GCM authenticates, so it cannot
silently return garbage.

What this protects against: someone finding the repo, or the URL leaking.
What it does not protect against: someone the passcode was given to. Treat the
passcode like an office key.

**The passcode is never written down in this repo.** It lives only in the
local `.passcode` file, which is gitignored. Send it to the team out of band —
a text or a Slack DM, separate from the URL. Never put it in this README, in a
commit message, or in an issue.

Two files are deliberately never committed (see `.gitignore`):

| File | Why |
|---|---|
| `.passcode` | The key itself. |
| `tools/board-dump.json` | The plaintext deal export. |

---

## Refreshing the deal data

The hub reads from a snapshot of the monday board **TKG Active Transactions**
(board `18412032467`). To pull in board changes:

1. Update `tools/board-dump.json` with a fresh export of the board.
2. Rebuild and push:

```bash
python3 tools/build_data.py
git add data/deals.enc.json && git commit -m "Refresh deal data" && git push
```

The build prints a summary — how many deals, how many are live, how many have
data-hygiene problems.

Requires Python 3 with the `cryptography` package.

---

## Changing the passcode

```bash
echo 'your-new-passcode' > .passcode
python3 tools/build_data.py
git add data/deals.enc.json && git commit -m "Rotate passcode" && git push
```

Everyone re-enters the new passcode on next load. There is no per-person
access — one passcode for the team. Rotate it when someone leaves.

---

## What is in it

**Dashboard** — pipeline volume, projected GCI, closed year-to-date, and a
count of deadlines inside 7 days. Deals grouped by stage, sorted by what is due
soonest. Filter by agent, side, or stage; search across addresses, clients,
agents, and notes. Each card carries a colored edge: red for a blown deadline,
amber for one inside a week, green for clear.

**Deal pages** — one per transaction, at `#/deal/<id>`. A stage-aware checklist,
the money (price, GCI %, GCI $, EMD, split), a dated timeline with live
countdowns, every contact on the file with tap-to-call and tap-to-email buttons,
the board notes, and one-tap links into monday, Lofty, Dotloop, and driving
directions. Closing dates export to a calendar file.

**Deadline radar** — every inspection, financing, and closing date across all
live deals in the next 30 days, in one list, soonest first.

**Data check** — where the board contradicts itself. Deals sitting in a group
that disagrees with their status, live deals with no price or no GCI %, files
under contract with no closing date or no title company, records flagged in the
notes as having no paper trail. Fix on the board, re-run the sync.

---

## Checklists

Assembled per deal from status and side, in `assets/js/checklists.js`:
pre-listing, active listing, under contract (buy / sell / double-ended),
closing week, post-close, and fell-out. Maryland and LPT specifics are baked in
— MD property disclosure, lead paint, HOA resale review clocks, the LPT
Commission Intake, verifying wire instructions by phone, checking the
commission on the ALTA before it goes out.

Editing an item's **text** is safe. Changing its **`id`** resets that checkbox
for everyone, because progress is stored against ids.

---

## Known limit: checklist progress is per-device

Checkboxes save to `localStorage` in the browser that ticked them. Sean checking
a box on his phone does not show up on Chase's laptop. Settings → Export /
Import moves progress between devices, and importing merges rather than
overwrites.

Making progress shared across the team needs a small always-on backend. The
cheapest route that stays free is a Google Apps Script web app writing to a
sheet, which can also push completions back to the monday board so the hub and
the board stop drifting apart. All storage already routes through
`saveState()` / `checksFor()` in `assets/js/store.js`, so that swap is two
functions, not a rewrite.

---

## Layout

```
index.html                  app shell + passcode gate
assets/css/app.css          design system, TKG brand tokens
assets/js/app.js            router + views
assets/js/store.js          decryption, checklist state, date + money helpers
assets/js/checklists.js     the transaction checklists
data/deals.enc.json         encrypted deal data (committed)
tools/board-dump.json       plaintext board export (NOT committed)
tools/build_data.py         normalize + encrypt
```

Brand tokens come from `CKOS/Brand System v1/tokens/tokens.json` v2.2 —
Kincer Navy `#282E39`, Harbor Blue `#769FB6`, Linen `#F5F5F3`, Montserrat for
display and Inter for UI. Light and dark both supported.

---

## Running it locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. It has to be served over HTTP — opening
`index.html` off the filesystem will not work, because ES modules and WebCrypto
both require a real origin.
