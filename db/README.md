# Database

The relational schema for YULLR Builder. Plain SQL migrations, applied with
`psql` — no ORM or migration-tool lock-in, so the exact same SQL that runs
locally runs against Amazon RDS.

## Local setup

PostgreSQL 17 via Homebrew, database `yullr_builder`:

```
brew services start postgresql@17
createdb yullr_builder        # once
```

Connection string (local, trust auth — no password):

```
postgresql://peter@localhost:5432/yullr_builder
```

## Running migrations

```
./db/migrate.sh
```

Applies any files in `db/migrations/` not yet recorded in the
`schema_migrations` table, in filename order, each in its own transaction.
Safe to re-run — already-applied migrations are skipped.

Against RDS (or any other Postgres):

```
DATABASE_URL="postgresql://USER:PASS@HOST:5432/yullr_builder" ./db/migrate.sh
```

## Conventions

- Files are `NNNN_name.sql`, applied in order. Never edit an applied migration —
  add a new one.
- UUID primary keys via `gen_random_uuid()` (core in PG13+, no extension).
- `created_at` / `updated_at` on mutable tables; `updated_at` is maintained by
  the shared `set_updated_at()` trigger.
- `created_by` / `changed_by` reference `users(id)` (the Clerk-synced user
  table), not Clerk IDs directly.

## Migrations

- `0001_core.sql` — foundation (`users`, `set_updated_at()`, core enums) and the
  Party/Project spine: `organizations`, `mountains`, `mountain_organizations`,
  `contacts`, `contact_roles`, `projects`, `project_stage_history`.
- `0002_site.sql` — `sync_status`; `trails`, `locations`, `location_inspections`.
- `0003_inventory.sql` — `equipment_catalog`, `inventory_items`,
  `inventory_deployments`.
- `0004_assets.sql` — `assets` (after inventory, so its FKs resolve).
- `0005_sales.sql` — `proposals`, `customer_agreements`, `signatures`,
  `invoices`.
- `0006_metrics.sql` — `mountain_program_profile`,
  `mountain_season_participation`, `mountain_season_platform_stats`.
- `0007_engagement.sql` — `contact_activities`, `notes`, `note_entries`,
  `documents`, `notification_log`.
- `0008_options.sql` — `app_options`, `item_prices`.
- `0009_project_work.sql` — `project_trails`, `project_locations`,
  `activity_log`, `inbound_email_updates`. See `docs/BUILD_PLAN.md`.
- `0010_legacy_records.sql` — `legacy_records`, the JSONB-blob table the
  running app actually reads/writes through `/api/legacy/*` today (see
  "Current runtime data model" below) — not the normalized tables above.
- `0011_user_roles.sql` — `user_role` enum (`user`/`admin`/`super_admin`) on
  `users`.
- `0012_site_assessments.sql` — `site_assessments` and its child tables
  (`_participants`, `_objects`, `_object_relationships`, `_annotations`,
  `_measurements`) for the Site Assessment map-survey feature. `mountain_id`/
  `project_id` are plain `uuid` columns with no `REFERENCES` constraint,
  since they point at `legacy_records.id` values, not rows in `mountains`/
  `projects`.

## Current runtime data model

The app's day-to-day mountains/trails/locations/notes/contacts data does
**not** live in the normalized tables from `0001`–`0009` — those tables are
real and migrated-into (see `MIGRATION_MAP.md`), but the frontend exclusively
calls `/api/legacy/*`, which reads/writes JSONB blobs in `legacy_records`
(`0010_legacy_records.sql`). The dedicated `/api/mountains`, `/api/trails`,
`/api/locations` routes and their backing tables are effectively dead code
today. Anything that needs a real foreign key into "whatever mountain/project
the user is looking at" (e.g. `site_assessments.mountain_id`) has to use an
unconstrained `uuid` column for that reason — there's no enforceable FK target.
