#!/usr/bin/env bash
# Apply pending SQL migrations in order. Each migration runs in a single
# transaction and is recorded in schema_migrations, so re-running is safe and
# only new files are applied.
#
# Usage:
#   ./db/migrate.sh                 # apply against local yullr_builder
#   DATABASE_URL=... ./db/migrate.sh   # apply against any Postgres (e.g. RDS)
set -euo pipefail

# Local dev default; override with DATABASE_URL for RDS.
DB_URL="${DATABASE_URL:-postgresql://peter@localhost:5432/yullr_builder}"

# Make psql findable even if the shell didn't source ~/.zshrc (keg-only formula).
command -v psql >/dev/null 2>&1 || export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

DIR="$(cd "$(dirname "$0")" && pwd)/migrations"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -t -A)

# Tracking table
"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);" >/dev/null

applied=0
for f in "$DIR"/*.sql; do
  version="$(basename "$f")"
  exists="$("${PSQL[@]}" -c "SELECT 1 FROM schema_migrations WHERE version = '${version}';")"
  if [ "$exists" = "1" ]; then
    echo "· skip   ${version}"
    continue
  fi
  echo "→ apply  ${version}"
  # Migration + its bookkeeping row, atomically. ON_ERROR_STOP + single
  # transaction means a failure rolls back and leaves it unrecorded.
  psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q --single-transaction \
    -f "$f" \
    -c "INSERT INTO schema_migrations (version) VALUES ('${version}');"
  applied=$((applied + 1))
done

echo "done — ${applied} migration(s) applied."
