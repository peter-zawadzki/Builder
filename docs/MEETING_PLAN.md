# YULLR Builder — Post-Meeting Build Plan

Distilled from the recorded working session (Builder walkthrough + whiteboard),
with all seven follow-up questions answered by Peter on July 8. This is the
working roadmap for Phases 1–6; the companion architecture docs are
`docs/BUILD_PLAN.md` (migration strategy, email-updates flow) and the data
model in `db/README.md`.

**Status: Phase 1 shipped** (`80dfb00`, `b6c8db4` — Projects pane, /projects
list, type rules, owner, stall-note requirement). Phases 2–6 below are open.

---

## Decisions from the meeting

### Projects — the spine of everything

- **Types: Install / Repair / Upgrade.** "Those are the three things we're
  ever doing on a mountain." An **Install always has a proposal** ($0 proposals
  allowed — e.g. the Waterville airbag). A Repair doesn't need one. An Upgrade
  might.
- **Only Install runs the full stage pipeline** (Intro/Lead → … → Training).
  Repair and Upgrade carry a lightweight status: Open / In Progress / Done.
- **Project = proposal boundary.** Wachusett half-done is still one project
  (same proposal). New scope in a new proposal = a new project. A revised or
  replacement proposal stays tied to its existing project.
- **Concurrent projects per mountain: yes** (Sunapee: Eggbeater+Links in
  October, Terrain Park in February). Mountain page shows one progress bar per
  project, expandable.
- **Exactly one owner per project** — required, transferable, transfer is
  logged. Multiple people can be tied to a project; one person owns it.
- **Inspections attach to projects**, defaulting to the mountain's single
  active project when there's only one.
- Stall reason "Other" requires a note. "Cancel" leaves the pipeline (churned
  covers it).

### Identity & visibility (Q2 answer — load-bearing)

- **YULLR itself is an Organization** in the system. Our people are Contacts
  under it, assigned **Employee** or **Ambassador**.
- Each Builder login links to their contact record (users.contact_id).
- **Default dashboard view = projects where I'm the owner or the ambassador.**
  Employees can flip to "all projects"; ambassadors cannot (enforced
  server-side).
- Recent activity gets a per-person filter; every action records who did it.
- Installers never touch Builder — the ambassador owns data correctness on
  install day.

### Contacts & organizations

- Richer fields: mobile + work phone, multiple emails, title ("look at Apple
  contacts").
- **No single "primary contact" flag** — role tags (Technical Administrator,
  Decision Maker) carry that meaning.
- **Institutional memory is manual** (Q5): when someone leaves a mountain, add
  a timestamped note ("prior GM of Attitash 2023–2026") and update their
  links. Contact notes are append-only and full-text searchable.
- **Duplicate detection** on add: fuzzy name match + exact email/phone match →
  "existing Mark Smith at Attitash — use this one?" with merge-or-continue.
- **Archive, don't delete.** Hard delete stays, gated by type-to-confirm.
- **Affiliates**: tag one or more selling reps/ambassadors on a mountain.
  Builder records *who*; rates/commissions live only in QuickBooks (which
  holds a light customer profile per mountain and owns revenue).

### Trails, locations & the field flow

- **Location types (final, Q3): Install Site, Power, Start, Finish.** One type
  per location — proposals pull Install Sites only. One building can host two
  locations (one per camera/trail).
- **"Trail" stays.** A camera on a lodge watching Eggbeater is a location on
  the Eggbeater trail. Miscellaneous (pseudo-trail) is only for server/IT
  rooms, finish shacks, other no-camera spots.
- **Save location just saves; then prompt "add an inspection?"** — two
  moments, not one form.
- Quick-add-trail comes off the mountain page; trails are added at mountain
  creation (nudge to enter the likely trails up front) or via Edit Mountain.
- Google Maps everywhere; the location pin can move after install; exact
  camera GPS doesn't matter.

### Inventory (Q4 answer — project-first)

- New gear enters inventory **unassigned**.
- **Deploy = scan the barcode → choose a project** → item associates to that
  project's mountain and is tagged to the project, one step.
- **Barcode = serial number** (one identifier for scanning and
  cross-reference).
- Returns scan back to stock; Builder reflects "out with 5, back with 2, 3
  deployed."
- **Reconciliation is a task**: when an install closes with different gear
  than the inspection specified, the mountain ambassador gets an assigned
  task ("install differs from inspection — update Builder") and the project
  can't complete until resolved.
- Asset vs. expense lens: cameras/servers/componentry are tracked assets
  (CIP → assembled → deployed; depreciation lives in QuickBooks); gateways,
  cables etc. are expensed but still countable/locatable, flagged non-asset.

### Tasks & notifications

- Next actions get **assign-to** (delegation); assigned items land in the
  assignee's Needs Follow-up. Email-type actions offer a contact picker.
  Completing moves to Updates history; no un-complete (create a new one).
- **Builder feeds Slack** (Q6): every mountain-related **status update and
  task update** — nothing else. Folds in the earlier 3/7/14-day stall
  reminder design (email to primary + technical contact, Slack ping,
  in-app stalled badge at day 3; reminders at 7 and 14; then stop).
- Mountain profile gains: night skiing, terrain-park count, national-forest
  flag, instructor count (plus the Mackenzie/Zach data list, largely already
  modeled in `mountain_program_profile`).

### Data migration (Q7)

Dev runs on a fresh local Postgres with new data. Existing production data
migrates later, after the model settles. Enum/schema changes need no
back-compat gymnastics right now.

---

## The phases

### Phase 1 — Make Project match the meeting ✅ SHIPPED

Types Install/Repair/Upgrade with per-type proposal rule; single transferable
owner (logged); lightweight status for Repair/Upgrade vs full pipeline for
Install; stall "Other" requires note; company-wide /projects list filterable
by owner/region/search; Projects pane on the mountain page.

### Phase 2 — Dashboard = projects, identity model

- YULLR org seeded; Employee/Ambassador assignment on contacts; users link to
  their contact record (`users.contact_id`).
- Dashboard pipeline lists projects; default scope = owner-or-ambassador;
  Employee-only "all projects" toggle, enforced server-side, persisted as a
  preference.
- Recent Activity person filter; every write path populates
  `activity_log.actor_user_id`.

### Phase 3 — Contacts that remember

- Multiple phones/emails with type labels (migrate existing single fields).
- Duplicate detection on add (fuzzy name, exact email/phone) with
  merge-or-continue.
- Timestamped, append-only, searchable contact notes (manual tenure records).
- Archive for contacts and organizations; hard delete via type-to-confirm.
- Affiliate tagging on mountains (who sells it — no rate fields anywhere).

### Phase 4 — The field flow, guided

- Save location → then prompt "add an inspection?" (decline leaves a clean
  saved location).
- `location_type` = Install Site / Power / Start / Finish (final); proposal
  generation filters to Install Site.
- Inspection auto-attaches to the single active project; dropdown only when
  several; completed projects drop out.
- Remove quick-add-trail from the mountain page; keep it in create-mountain
  (with nudge) and Edit Mountain.

### Phase 5 — Inventory: out the door and back

- Unassigned by default; scan-to-deploy: barcode (= serial) → pick project →
  mountain + project association in one step; deployment record with actor +
  timestamp.
- Return-to-stock scan flow; per-project deployed/returned delta visible.
- Reconciliation task to the ambassador when install ≠ inspection; project
  completion blocked until confirmed.
- Asset/expense flag on inventory categories; reports subtotal by flag.

### Phase 6 — Delegation & the Slack mirror

- Next actions: type, due date, assignee; contact picker for email actions;
  completion → Updates history.
- Slack webhook on `activity_log` writes, allowlist = project status/stage
  changes, stalls + stall reminders, task create/assign/complete. Nothing
  else.

---

## Parking lot (agreed, explicitly later)

- Region-locking per user (Mackenzie sees only Midwest)
- People hierarchies / oversight chains (Zach → William → Peter)
- Role-based dashboards ("what do I want to see when I log in" as a setting)
- Inventory cycle counts (quarterly scan-to-verify for shrinkage)
- QuickBooks export (light customer profile per mountain, revenue reporting)
- Per-camera placement tracking (assignable later, not required)
- Social/ads tooling ("not ready for that yet")
