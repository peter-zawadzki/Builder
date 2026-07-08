# Working Session → Build Plan · YULLR Builder

_What the meeting decided, and what to build next._

Distilled from the recorded working session (Builder walkthrough + whiteboard).
Every decision traces to the transcript; the plan starts from what's already on
`main` rather than re-planning finished work.

- **Source:** `transcript_builder.txt` (~1.5 hr session)
- **Baseline:** `main @ 45b7799`
- **Q&A answered:** July 8, 2026 (folded into the phases)

---

## 1. Decisions from the meeting

### Projects — the spine of everything
- **Project types:** Install, Repair, Upgrade — the only three things done on a
  mountain. Replaces the earlier Initial Install / Expansion split. An Install
  always has a proposal ($0 proposals allowed — e.g. the Waterville airbag). A
  Repair doesn't need one. An Upgrade might.
- **Project = proposal boundary:** where one project ends and another begins is
  drawn by proposal. Same proposal/payment = one project (even if half-done). New
  scope in a new proposal = a new project. A revised/replacement proposal stays
  tied to its existing project.
- **Concurrent projects:** a mountain can run multiple at once (Sunapee:
  Eggbeater+Links in October, Terrain Park in February). One progress bar per
  project on the mountain page, expandable.
- **One owner, always:** exactly one owner per project — required, internal,
  transferable. Multiple people can be tied to a project, but one owns it.
  Projects viewable company-wide by owner, region, or state.
- **Pipeline = projects:** the dashboard "pipeline" is the list of projects.
- **Inspections attach to projects:** an inspection nests under a location and
  carries a project dropdown, defaulting to the mountain's single active project.

### Dashboard & visibility
- **Mine vs. everyone:** internal team toggles between "just my stuff" and
  "everything." Ambassadors see only their own. "My stuff" = mountains/projects
  you've touched or that have items assigned to you.
- **Activity, filterable by person:** per-person dropdown on recent activity.
  Every action records who did it.
- **Users are "us and extended us":** internal team, mountain ambassadors,
  contracted sales help. Not customers/coaches/installers. Installers never touch
  Builder; the ambassador owns data correctness on install day.

### Contacts & organizations
- **Richer contact fields:** mobile phone, work phone, multiple emails, title —
  Apple-contacts-grade, so data isn't stuffed into notes.
- **No single "primary contact" flag:** dropped. Role tags (Technical
  Administrator, Decision Maker) carry that meaning.
- **Institutional memory:** when a contact leaves, unlink from the mountain and
  move to General — but tenure history ("prior GM of Attitash 2023–2026")
  survives in timestamped, append-only, searchable notes.
- **Duplicate detection:** fuzzy-match on add so the address book doesn't grow
  seven copies of one person.
- **Archive, don't delete:** archive state for contacts/orgs; hard delete stays
  but requires type-to-confirm.
- **Affiliates:** who sells/represents a mountain for YULLR (ambassador, sales
  agency) — possibly more than one. Builder records who; rates/commissions live
  only in QuickBooks (single source of truth for revenue).

### Trails, locations & the field flow
- **Locations are single-purpose:** one of install site / power / start / finish
  — never multiple (proposals pull install-site locations only). One building can
  host two locations.
- **"Trail" stays; cameras always tie to a trail.** Miscellaneous (pseudo-trail)
  is only for the server/IT room, finish shacks, other no-camera spots.
- **Save, then prompt:** saving a location just saves; then prompts "add an
  inspection?" — two moments, not one form.
- **Adding trails gets deliberate:** quick-add-trail comes off the mountain page;
  trails added at mountain creation (encouraged up front) or via Edit Mountain.
  Google Maps everywhere; pin movable after install.

### Inventory
- **Check-out / check-in:** a Check Out button on the mountain inventory panel
  opens the scanner; scan items onto the van, scan returns back to stock.
- **Reconciliation is a task, not a hope:** if inspection said 5 cameras and
  install hung 3, Builder asks "does the final install match the inspection?" and
  routes a fix-it task to the ambassador. Installers stay out of the software.
- **Asset vs. expense lens:** serialized reconciled inventory (cameras, servers,
  componentry) vs. cheap expensed items (gateways, cables) flagged non-asset so
  reports don't confuse the balance sheet. Depreciation lives in QuickBooks.

### Tasks & notifications
- **Delegation:** next actions get an assign-to; assigned items surface in the
  assignee's Needs Follow-up. Completing moves it to the mountain's Updates
  history (no un-complete; create a new one).
- **Builder feeds Slack:** Builder is the record; Slack is a notification mirror.
- **Small fixes:** stall reason "Other" requires a note. "Cancel" leaves the
  pipeline (churned covers it). Mountain profile gains night skiing,
  terrain-park count, national-forest flag, instructor count, plus the
  Mackenzie/Zach data list.

---

## 2. Where `main` already is

| Meeting decision | State on main | Gap |
|---|---|---|
| Projects as unit of work, per-project trails/locations/inspections | Schema in place (0001/0009) | **The running app does not use it** — see reality note below |
| Project types Install / Repair / Upgrade | Mismatch | Schema has `'Initial Install'/'Expansion'`; needs enum change + proposal-required-by-type |
| One required, transferable owner per project | Missing | `projects` has `created_by`, no `owner_user_id`; no transfer flow |
| Dashboard: pipeline + follow-ups + activity | Partial | HomeDashboard is CRM-pipeline-driven; needs project-driven + mine/all toggle + per-person filter |
| Location types (single-purpose) | Partial | `location_type` enum is only `Install`/`Other`; needs Install Site/Power/Start/Finish |
| Contact↔mountain assoc., per-contact notes | In place | Tenure history, dedup, richer phone/email still open |
| Inventory items, server builds, scanning | In place | Check-out/check-in + reconciliation task are the gaps |
| Who-did-what attribution | Partial | `activity_log.actor_user_id` exists; some events written without actor; no per-person UI filter |
| Email→app updates (build@yullr.com) | Schema only | `inbound_email_updates` exists; no webhook/interpreter wired |
| Slack notifications from Builder | Missing | Nothing wired |

> **Reality note (added during grounding):** the running app reads/writes the
> **legacy jsonb layer** (`/api/legacy` → `legacy_records`), not the normalized
> `projects` tables. Mountains currently carry `pipelineStage`, notes, and
> contacts directly in the legacy record; there is **no project entity in the
> app's runtime data model yet.** So "Projects" is shipped as _schema_, not as
> app behavior. Phase 1/2 must introduce Projects into the layer the app
> actually uses — see the open decision at the bottom.

---

## 3. The plan, phased

### Phase 1 — Make Project match the meeting
- Create a project with a **type** (Install / Repair / Upgrade); the form demands
  a proposal only when the type requires one (Install → yes, $0 allowed; Repair →
  never; Upgrade → optional).
- Repair/Upgrade get a lightweight status (**Open / In Progress / Done**); only
  Install runs the full Intro→Training stage list.
- **Single named owner**, transferable; transfer logs actor + old/new owner.
- `/projects` company-wide list filterable by **owner, region, state**.
- Stall reason **"Other" requires a note**.

### Phase 2 — Dashboard = projects
- **YULLR is an Organization**; its people are Contacts assigned Employee or
  Ambassador; each app user links to their contact record.
- Dashboard defaults to projects where I'm owner or ambassador; **Employees can
  flip to "all"**, ambassadors can't (enforced server-side).
- **Recent Activity filterable by person**; every write populates `actor_user_id`.
- **One progress bar per active project** on the mountain page (Sunapee scenario).

### Phase 3 — Contacts that remember
- Apple-contacts-grade fields (mobile + work phone, multiple emails, title).
- **Duplicate warning** on add (fuzzy name + exact email/phone).
- **Institutional memory** via manual, timestamped, append-only, searchable notes.
- **Archive** contacts/orgs; hard delete requires typing "delete."
- **Affiliates** on a mountain (who sells it, not what they're paid).

### Phase 4 — The field flow, guided
- Saving a location **just saves**, then prompts "add an inspection?"
- Location has **exactly one type** (Install Site / Power / Start / Finish);
  proposal generation filters to Install Site.
- Inspection **auto-attaches to the single active project**; dropdown only when >1.
- Trails added at mountain creation or via Edit Mountain; **detail-page quick-add
  removed**.

### Phase 5 — Inventory: out the door and back
- New gear enters **unassigned**; deploy by scanning the **barcode (= serial)**
  and picking a **project** (mountain derived from project); each scan writes a
  deployment record with actor + timestamp.
- **Return scan** updates counts ("went out with 5, back with 2, 3 deployed").
- **Reconciliation task** when install differs from inspection; project can't
  complete until confirmed.
- **Asset vs. expense flag**; reports subtotal by flag; depreciation in QuickBooks.

### Phase 6 — Delegation & the Slack mirror
- Next actions get **type + due date + assignee**; land in assignee's Needs
  Follow-up; completing moves to Updates history (no un-complete).
- **Slack mirror allowlist:** project status/stage changes, stalls, and task
  create/assign/complete only. Folds in the 3/7/14-day stall reminders.

---

## 4. Parking lot — agreed, explicitly later
- Region-locking per user (Mackenzie → Midwest only)
- People hierarchies / oversight chains (Zach → William → Peter)
- Role-based dashboards as a setting
- Inventory cycle counts (quarterly scan-to-verify)
- QuickBooks export (light customer profile per mountain, revenue reporting)
- Per-camera placement tracking
- Social/ads tooling

---

## 5. Questions — asked and answered (July 8, 2026)
1. **Do Repair/Upgrade run the Install pipeline?** No — lightweight Open/In
   Progress/Done. → Phase 1.
2. **What makes something "mine"?** YULLR is an Org; people are Contacts
   (Employee/Ambassador); default view = owner or ambassador; Employees can flip
   to all. → Phase 2.
3. **Location-type list final?** Yes: Install Site, Power, Start, Finish. → Phase 4.
4. **Check-out to mountain or project?** Project-first; barcode = serial. → Phase 5.
5. **Contact tenure auto-prompt?** No — manual, searchable notes. → Phase 3.
6. **What posts to Slack?** Mountain-related status + task updates only. → Phase 6.
7. **Data migration before enum change?** Not needed now — dev is fresh local
   Postgres; production migrates later. → Phase 1 unblocked immediately.
