#!/usr/bin/env python3
"""
TKG Hub — data build step.

Reads tools/board-dump.json (a normalized export of the monday
"TKG Active Transactions" board) and writes data/deals.enc.json:
an AES-256-GCM encrypted payload that only decrypts with the team passcode.

Why encrypted: GitHub Pages on the free tier only serves PUBLIC repos.
The board carries client names, emails, phone numbers, lender/title
contacts, and commission splits. Ciphertext ships to the public repo;
plaintext exists only in a teammate's browser after they enter the passcode.

Usage:
    python3 tools/build_data.py                      # prompts for passcode
    TKG_HUB_PASSCODE='...' python3 tools/build_data.py
"""

import base64
import getpass
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parent.parent
DUMP = ROOT / "tools" / "board-dump.json"
OUT = ROOT / "data" / "deals.enc.json"

PBKDF2_ITERATIONS = 250_000

# Deals in these statuses are live work. Everything else is history.
LIVE_STATUSES = {"Pre-listing", "Active Listing", "Under Contract", "Pending"}

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"\b(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b")


def contacts_from(text):
    """Pull emails + phone numbers out of a free-text contact field so the
    UI can render real call/email buttons instead of dead text."""
    if not text:
        return {"emails": [], "phones": []}
    emails = EMAIL_RE.findall(text)
    phones = ["".join(m) for m in PHONE_RE.findall(text)]
    # A 10-digit string that is actually part of an NMLS / order number is
    # rare enough to accept; dedupe while preserving order.
    return {
        "emails": list(dict.fromkeys(emails)),
        "phones": list(dict.fromkeys(phones)),
    }


def city_state(name):
    """Best-effort split of the board's item name into street / locality."""
    parts = [p.strip() for p in name.split(",")]
    if len(parts) >= 2:
        return parts[0], ", ".join(parts[1:])
    return name, ""


def hygiene_flags(d):
    """The board has real drift — items sitting in a group that contradicts
    their Status, live deals with no price, records with no paper trail.
    Surfacing this is half the value of the dashboard."""
    flags = []
    status = d.get("status")
    group = d.get("group")

    if not status:
        flags.append("No Status set on the board")

    group_expects = {
        "Under Contract (Buy)": {"Under Contract"},
        "Under Contract (Sell)": {"Under Contract"},
        "Pending": {"Pending"},
        "Closed": {"Closed"},
        "Cancelled": {"Canceled / Fell Out"},
        "Active Listing": {"Active Listing"},
        "Pre-Listing": {"Pre-listing"},
    }
    expected = group_expects.get(group)
    if expected and status and status not in expected:
        flags.append(f'Sitting in "{group}" but Status is "{status}"')

    if status in LIVE_STATUSES:
        if not d.get("price"):
            flags.append("Live deal with no sales price")
        if d.get("gci_pct") in (None, 0):
            flags.append("No GCI % — commission cannot be projected")
        if status in ("Under Contract", "Pending") and not d.get("closing_date"):
            flags.append("Under contract with no closing date")
        if status == "Under Contract" and not d.get("contract_date"):
            flags.append("No ratified contract date")
        if status in ("Under Contract", "Pending") and not d.get("title"):
            flags.append("No title company on file")

    notes = (d.get("notes") or "").upper()
    if "ZERO EMAIL" in notes or "NO EMAIL" in notes:
        flags.append("No paper trail found — verify this deal is real")
    if "VERIFY" in notes:
        flags.append("Flagged for verification in notes")

    return flags


def normalize(item):
    street, locality = city_state(item["name"])
    price = item.get("price") or 0
    gci_pct = item.get("gci_pct")
    gci_dollars = round(price * gci_pct / 100, 2) if price and gci_pct else None

    agents = [a.strip() for a in (item.get("agent") or "").split(",") if a.strip()]

    d = {
        "id": item["id"],
        "name": item["name"],
        "street": street,
        "locality": locality,
        "url": item.get("url"),
        "group": item.get("group"),
        "agents": agents,
        "side": item.get("side"),
        "health": item.get("health"),
        "status": item.get("status"),
        "closingDate": item.get("closing_date"),
        "contractDate": item.get("contract_date"),
        "inspectionDeadline": item.get("inspection_deadline"),
        "financingDeadline": item.get("financing_deadline"),
        "price": price or None,
        "gciPct": gci_pct,
        "gciDollars": gci_dollars,
        "emd": item.get("emd"),
        "agentSplit": item.get("agent_split"),
        "notes": item.get("notes"),
        "links": {
            "monday": item.get("url"),
            "lofty": item.get("lofty"),
            "dotloop": item.get("dotloop"),
        },
        "people": [],
    }

    for role, key in [
        ("Buyer", "buyer"),
        ("Seller", "seller"),
        ("Lender", "lender"),
        ("Title", "title"),
        ("Inspector", "inspector"),
    ]:
        raw = item.get(key)
        if not raw:
            continue
        c = contacts_from(raw)
        d["people"].append(
            {"role": role, "raw": raw, "emails": c["emails"], "phones": c["phones"]}
        )

    d["isLive"] = d["status"] in LIVE_STATUSES
    d["flags"] = hygiene_flags(item)
    return d


def encrypt(payload_bytes, passcode):
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", passcode.encode(), salt, PBKDF2_ITERATIONS, 32)
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, payload_bytes, None)
    b64 = lambda b: base64.b64encode(b).decode()
    return {
        "v": 1,
        "kdf": {"name": "PBKDF2-SHA256", "iterations": PBKDF2_ITERATIONS, "salt": b64(salt)},
        "cipher": "AES-256-GCM",
        "iv": b64(iv),
        "ct": b64(ct),
    }


def main():
    if not DUMP.exists():
        sys.exit(f"Missing {DUMP}")

    passcode = os.environ.get("TKG_HUB_PASSCODE")
    if not passcode:
        # A local, git-ignored file keeps the passcode out of shell history.
        pass_file = ROOT / ".passcode"
        if pass_file.exists():
            passcode = pass_file.read_text().strip()
        elif not sys.stdin.isatty():
            passcode = sys.stdin.read().strip()
        else:
            passcode = getpass.getpass("Team passcode: ")

    if len(passcode) < 8:
        sys.exit("Passcode must be at least 8 characters.")

    raw = json.loads(DUMP.read_text())
    deals = [normalize(i) for i in raw["items"]]

    # Newest activity first inside each status bucket; UI re-sorts anyway.
    deals.sort(key=lambda d: (d.get("closingDate") or "0000-00-00"), reverse=True)

    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": raw.get("board", {}).get("name", "monday board"),
        "boardUrl": f"https://thekincergroup-force.monday.com/boards/{raw['board']['id']}",
        "deals": deals,
    }

    blob = json.dumps(payload, separators=(",", ":")).encode()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(encrypt(blob, passcode), indent=2))

    live = sum(1 for d in deals if d["isLive"])
    flagged = sum(1 for d in deals if d["flags"])
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"  {len(deals)} deals  ·  {live} live  ·  {flagged} with hygiene flags")
    print(f"  {len(blob):,} bytes plaintext → {OUT.stat().st_size:,} bytes ciphertext")


if __name__ == "__main__":
    main()
