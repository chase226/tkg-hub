/* ==========================================================================
   TKG Hub — transaction checklists
   Maryland / Bright MLS / LPT Realty workflow. A deal's list is assembled
   from its Status + Side, so every card shows only the work that is actually
   in front of the agent right now.

   Item ids are stable strings — checkbox state is keyed on them, so editing
   an item's LABEL is safe but changing its ID resets that box for everyone.
   ========================================================================== */

const ALWAYS = {
  title: "Every deal",
  items: [
    { id: "u1", text: "Deal created in Lofty and on the monday board" },
    { id: "u2", text: "Loop created in Dotloop with all executed docs uploaded" },
    { id: "u3", text: "Client added to the TKG communication cadence" },
  ],
};

const TEMPLATES = {
  "Pre-listing": {
    label: "Pre-Listing",
    groups: [
      {
        title: "Win the listing",
        items: [
          { id: "pl1", text: "Listing appointment completed" },
          { id: "pl2", text: "CMA delivered and pricing agreed with seller" },
          { id: "pl3", text: "Listing agreement signed in Dotloop" },
          { id: "pl4", text: "Listing Request JotForm submitted to LPT", note: "Run /listing-request to prefill it" },
        ],
      },
      {
        title: "Paperwork",
        items: [
          { id: "pl5", text: "MD Residential Property Disclosure / Disclaimer signed" },
          { id: "pl6", text: "Lead paint disclosure signed (built before 1978)" },
          { id: "pl7", text: "HOA / condo docs ordered" },
          { id: "pl8", text: "Seller wire-fraud warning delivered" },
        ],
      },
      {
        title: "Get it market-ready",
        items: [
          { id: "pl9", text: "Pre-list repairs scoped and scheduled" },
          { id: "pl10", text: "Paint / carpet / turnover work confirmed complete" },
          { id: "pl11", text: "Declutter + packing conversation had with seller", note: "Recurring gap — have it early, in writing" },
          { id: "pl12", text: "Photography and floor plan scheduled" },
          { id: "pl13", text: "Sign and lockbox installed" },
        ],
      },
      {
        title: "Launch",
        items: [
          { id: "pl14", text: "MLS public remarks written", note: "Run /listing for a Bright-compliant draft" },
          { id: "pl15", text: "Coming Soon post scheduled (GBP + Instagram)" },
          { id: "pl16", text: "Go-live date confirmed with seller" },
        ],
      },
    ],
  },

  "Active Listing": {
    label: "Active Listing",
    groups: [
      {
        title: "Live and correct",
        items: [
          { id: "al1", text: "Listing live in Bright MLS — every field proofed" },
          { id: "al2", text: "Syndication confirmed on Zillow, Realtor.com, Redfin" },
          { id: "al3", text: "Showing instructions and lockbox access verified" },
          { id: "al4", text: "Compensation terms documented per NAR settlement rules" },
        ],
      },
      {
        title: "Drive traffic",
        items: [
          { id: "al5", text: "Open house scheduled and marketed" },
          { id: "al6", text: "Just Listed social pushed (IG Reel + GBP post)" },
          { id: "al7", text: "Neighborhood / SOI blast sent" },
          { id: "al8", text: "Agent-to-agent outreach to recent area buyers" },
        ],
      },
      {
        title: "Manage the seller",
        items: [
          { id: "al9", text: "Showing feedback requested after every tour" },
          { id: "al10", text: "Weekly seller update sent (traffic, feedback, position)" },
          { id: "al11", text: "Day-14 price and position review completed" },
          { id: "al12", text: "Offer review / deadline strategy set with seller" },
        ],
      },
    ],
  },

  "Under Contract:Buy": {
    label: "Under Contract — Buy Side",
    groups: [
      {
        title: "First 72 hours",
        items: [
          { id: "ucb1", text: "Fully ratified contract distributed to all parties" },
          { id: "ucb2", text: "EMD delivered — receipt confirmed in writing by title" },
          { id: "ucb3", text: "Intro email sent connecting buyer, lender, and title", note: "Run /transactions to draft it" },
          { id: "ucb4", text: "LPT Commission Intake submitted" },
          { id: "ucb5", text: "All deadlines calendared for buyer and agent" },
        ],
      },
      {
        title: "Inspection",
        items: [
          { id: "ucb6", text: "Inspection scheduled and buyer confirmed attending" },
          { id: "ucb7", text: "Report reviewed with buyer" },
          { id: "ucb8", text: "Repair request / addendum submitted before deadline" },
          { id: "ucb9", text: "Inspection resolution fully executed" },
        ],
      },
      {
        title: "Financing",
        items: [
          { id: "ucb10", text: "Loan application submitted to lender" },
          { id: "ucb11", text: "Rate locked" },
          { id: "ucb12", text: "Appraisal ordered" },
          { id: "ucb13", text: "Appraisal received — value supports the contract" },
          { id: "ucb14", text: "Written financing commitment received before deadline" },
        ],
      },
      {
        title: "Title and property",
        items: [
          { id: "ucb15", text: "HOA / condo resale package delivered — review clock tracked" },
          { id: "ucb16", text: "Title search clear — no liens or open permits" },
          { id: "ucb17", text: "Homeowners insurance bound" },
          { id: "ucb18", text: "Utilities transfer scheduled for closing day" },
        ],
      },
    ],
  },

  "Under Contract:Sell": {
    label: "Under Contract — Sell Side",
    groups: [
      {
        title: "First 72 hours",
        items: [
          { id: "ucs1", text: "Fully ratified contract distributed to all parties" },
          { id: "ucs2", text: "Title company file opened" },
          { id: "ucs3", text: "Buyer EMD receipt confirmed" },
          { id: "ucs4", text: "MLS status updated to Under Contract" },
          { id: "ucs5", text: "LPT Commission Intake submitted" },
        ],
      },
      {
        title: "Buyer due diligence",
        items: [
          { id: "ucs6", text: "Inspection access coordinated with seller" },
          { id: "ucs7", text: "Repair request received and negotiated" },
          { id: "ucs8", text: "Repair addendum executed and work scheduled" },
          { id: "ucs9", text: "Appraisal access coordinated" },
          { id: "ucs10", text: "Appraisal value confirmed at or above contract" },
          { id: "ucs11", text: "Buyer financing commitment confirmed in writing" },
        ],
      },
      {
        title: "Seller side",
        items: [
          { id: "ucs12", text: "HOA / condo docs delivered to buyer" },
          { id: "ucs13", text: "Payoff ordered by title" },
          { id: "ucs14", text: "Move-out date or rent-back terms confirmed" },
          { id: "ucs15", text: "Seller net sheet updated and reviewed" },
        ],
      },
    ],
  },

  Pending: {
    label: "Closing Week",
    groups: [
      {
        title: "Clear to close",
        items: [
          { id: "pd1", text: "Clear-to-close received from lender" },
          { id: "pd2", text: "Final CD / ALTA reviewed line by line" },
          { id: "pd3", text: "Commission on the settlement statement matches the intake", note: "This is where money gets lost — check it" },
          { id: "pd4", text: "Wire instructions verified BY PHONE to a known number", note: "Never trust wire instructions sent by email" },
        ],
      },
      {
        title: "Final steps",
        items: [
          { id: "pd5", text: "Final walkthrough scheduled and completed" },
          { id: "pd6", text: "Utilities confirmed on / final reads scheduled" },
          { id: "pd7", text: "Closing time, location, and ID requirements sent to client" },
          { id: "pd8", text: "Keys, garage remotes, and mailbox handoff planned" },
          { id: "pd9", text: "Cash to close confirmed sent and received" },
        ],
      },
      {
        title: "Line up the after",
        items: [
          { id: "pd10", text: "Closing gift ordered" },
          { id: "pd11", text: "Review request drafted and scheduled" },
          { id: "pd12", text: "Closing-day photo / social post planned" },
        ],
      },
    ],
  },

  Closed: {
    label: "Post-Close",
    groups: [
      {
        title: "Get paid, close the file",
        items: [
          { id: "cl1", text: "Signed ALTA / CD received and filed" },
          { id: "cl2", text: "Commission wire landed and reconciled" },
          { id: "cl3", text: "LPT disbursement authorization finalized" },
          { id: "cl4", text: "Deal marked Closed in Lofty and on the monday board" },
          { id: "cl5", text: "Client reimbursables recouped at settlement" },
        ],
      },
      {
        title: "Turn it into the next deal",
        items: [
          { id: "cl6", text: "Google review requested", note: "Run /gbp for the review link" },
          { id: "cl7", text: "Closing gift delivered" },
          { id: "cl8", text: "Just Sold post published (IG + GBP)" },
          { id: "cl9", text: "Client moved into the SOI long-term nurture" },
          { id: "cl10", text: "Referral ask made 30 days post-close" },
        ],
      },
    ],
  },

  "Canceled / Fell Out": {
    label: "Fell Out",
    groups: [
      {
        title: "Close it out cleanly",
        items: [
          { id: "cx1", text: "Release of deposit executed by all parties" },
          { id: "cx2", text: "EMD returned or released — confirmed in writing" },
          { id: "cx3", text: "MLS status updated" },
          { id: "cx4", text: "Reason documented in the notes for the post-mortem" },
          { id: "cx5", text: "Client re-engaged with a next-step plan" },
        ],
      },
    ],
  },
};

/**
 * Pick the checklist for a deal. Double-ended deals get both sides of the
 * under-contract list, because that is genuinely two files' worth of work.
 */
export function checklistFor(deal) {
  const status = deal.status;
  const side = deal.side;
  const groups = [];
  let label = status || "Unassigned";

  if (status === "Under Contract") {
    if (side === "Double ended") {
      label = "Under Contract — Double Ended";
      groups.push(...TEMPLATES["Under Contract:Sell"].groups);
      groups.push(...TEMPLATES["Under Contract:Buy"].groups);
    } else {
      const key = side === "Sell" ? "Under Contract:Sell" : "Under Contract:Buy";
      label = TEMPLATES[key].label;
      groups.push(...TEMPLATES[key].groups);
    }
  } else if (TEMPLATES[status]) {
    label = TEMPLATES[status].label;
    groups.push(...TEMPLATES[status].groups);
  } else {
    // No status on the board — the only real task is to fix that.
    label = "Needs a Status";
    groups.push({
      title: "Before anything else",
      items: [
        { id: "ns1", text: "Set the Status on the monday board so this deal gets a real checklist" },
        { id: "ns2", text: "Confirm with the agent whether this deal is still alive" },
      ],
    });
  }

  groups.push(ALWAYS);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return { label, groups, total };
}

export const CHECKLIST_LABELS = TEMPLATES;
