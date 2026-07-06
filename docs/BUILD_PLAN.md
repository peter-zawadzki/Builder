# YULLR Builder — migration & build plan

## Guiding principle

**Add and organize, eliminate nothing.** Migrate off Supabase onto the local
Postgres DB *without* losing any field or changing the live app until a new
piece is at parity and Peter approves flipping it. New work happens **off to the
side** (separate routes / behind a toggle) so the day-to-day dashboard is never
disrupted mid-build.

## Migration strategy

1. **Lossless copy** — every Supabase record is brought across verbatim; no
   field is dropped. The existing screens can run unchanged on the local DB by
   pointing the data layer at the local API (same shapes), behind an opt-in
   toggle (default off).
2. **Organize alongside** — the normalized tables (contacts, projects, etc.)
   are populated from the same data, powering the reorganized mountain page and
   new features below.
3. **Flip when ready** — only after a piece matches or beats the old one, and
   Peter says go.

## Mountain page — panels

Status · Updates · Trails · Notes · Contacts · Documents · Inventory

- **Status** — mountain + current project state at a glance.
- **Updates** — activity feed: notes added, statuses changed, inspections
  logged, email-driven updates. Backed by `activity_log`.
- **Trails** — each trail with its **most-recent project's** status.
- **Notes / Contacts / Documents / Inventory** — existing data, surfaced as
  panels (nothing removed from today's app).

## Project is the unit of work

A project scopes the work at a mountain (Initial Install, then expansions).
You pick a project, add its trails, add existing/new locations, and inspect.

- **Trail status is per project** — `project_trails(project_id, trail_id,
  status)`, status ∈ pending / in-process / completed / live. The trail list on
  the mountain page shows the status from the **most recent** project touching
  that trail.
- **Location type is per project** — `project_locations(project_id,
  location_id, location_type)`, type ∈ Install / Other.
- **Inspections are per (project, location)** — `location_inspections` gains a
  `project_id`. One location can have several inspections across projects (an
  Initial Install inspection, later a Trail Expansion inspection).

## Admin visibility

- **Inspection-item catalog** (checklist definitions) — super-admin only
  (peter@yullr.com).
- **Inventory** — visible to all signed-in users.

## build@yullr.com → app updates (human-in-the-loop)

1. **Inbound**: `build@yullr.com` routed to an inbound-email provider — likely
   **Postmark** (already used for outbound). It parses each email and POSTs it
   to a backend webhook.
2. **Interpret**: the backend hands the email to Claude, which returns a
   structured proposal — which mountain/project, a note to add, any status
   change, and any attachments to file as documents.
3. **Review (human-in-the-loop)**: the proposal lands in the mountain's
   **Updates** panel as a *pending* item (`inbound_email_updates`). A user
   approves → it applies and logs to `activity_log`; or rejects. No unattended
   edits to start.
4. **Guardrails**: only accept senders on an allowlist (`@yullr.com`);
   association via content or a tagged reply address
   (`build+<projectid>@yullr.com`).

## Schema additions (migration 0009)

- `trail_work_status` enum, `location_type` enum.
- `project_trails`, `project_locations` join tables.
- `project_id` on `location_inspections` (backfilled to each mountain's initial
  project).
- `activity_log` (Updates feed).
- `inbound_email_updates` (pending email proposals).

Existing trails/locations are backfilled into the mountain's initial project so
the project-centric views have real data. Nothing is deleted.
