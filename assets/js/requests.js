/* ==========================================================================
   TKG Hub — request forms

   Two kinds of form live here and they are NOT interchangeable:

   1. INTERNAL (monday) — marketing and vendor requests. These are ours.
      Submitting creates an item on a TKG board, so a request becomes tracked
      work with an owner and a due date instead of a text message that gets
      buried.

   2. BROKERAGE (JotForm) — listing request and new offer. These belong to LPT
      and are part of the compliance path. They are deliberately NOT rebuilt
      here — the brokerage needs its own form, submitted its own way. The hub
      just launches them from the same place as everything else, and points at
      the CKOS command that prefills them from Lofty first.

   Neither provider can be iframed into this site: monday's CSP restricts
   frame-ancestors to monday domains. So every form opens in a new tab.
   ========================================================================== */

export const REQUESTS = [
  {
    id: "marketing",
    title: "Marketing Request",
    blurb:
      "Graphics, flyers, Reels, email blasts, Just Listed and Just Sold posts.",
    where: "Lands on the TKG Marketing Requests board",
    kind: "internal",
    needBefore: [
      "A link to the photos (Drive, Dropbox, or MLS)",
      "The details that must appear — price, beds and baths, open house time",
      "A real deadline",
    ],
    url: "https://forms.monday.com/forms/aae02f26619067b134897c8f6a7d9bff?r=use1",
    boardUrl: "https://thekincergroup-force.monday.com/boards/18423565607",
    cta: "Open marketing request",
  },
  {
    id: "vendor",
    title: "Vendor & Repair Request",
    blurb:
      "Painter, cleaner, contractor, inspector, landscaper, junk haul — anything that needs a person at a property.",
    where: "Lands on the TKG Vendor & Repair Requests board",
    kind: "internal",
    needBefore: [
      "Exactly what needs doing, room by room",
      "How the vendor gets in — lockbox, occupied or vacant, who to call",
      "Who is paying, and the hard deadline",
    ],
    url: "https://forms.monday.com/forms/e2e9d00f561018c2280e122eea8c7d6c?r=use1",
    boardUrl: "https://thekincergroup-force.monday.com/boards/18423565621",
    cta: "Open vendor request",
  },
  {
    id: "listing",
    title: "Listing Request",
    blurb:
      "Opens a new listing with the brokerage. Commission, admin fee, photography, sign and lockbox, go-live date.",
    where: "Goes to LPT Realty — this is the brokerage's form, not ours",
    kind: "brokerage",
    prefill:
      "Ask CKOS to run /listing-request <seller name> first. It pulls the seller from Lofty, applies the standard TKG defaults, and hands back a prefilled link — far less typing and fewer mistakes.",
    needBefore: [
      "Signed listing agreement",
      "List price and go-live date",
      "Commission split and showing instructions",
    ],
    url: "https://form.jotform.com/233066564363155",
    cta: "Open listing request",
  },
  {
    id: "offer",
    title: "New Offer",
    blurb:
      "Submits a buyer's offer through the brokerage. Terms, EMD, inspection deadlines, title company.",
    where: "Goes to LPT Realty — this is the brokerage's form, not ours",
    kind: "brokerage",
    prefill:
      "Ask CKOS to run /offer <client name> first. It pulls the buyer from Lofty and applies the TKG defaults — Terrain Title, $595 admin, Structural & Mechanical with a 7-day deadline, 1% EMD.",
    needBefore: [
      "Property address and offer price",
      "Financing type and pre-approval letter",
      "Inspection and settlement dates",
    ],
    url: "https://form.jotform.com/233064180759156",
    cta: "Open offer form",
  },
];
