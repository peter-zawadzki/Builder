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
