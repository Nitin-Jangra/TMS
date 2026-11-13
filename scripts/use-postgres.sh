#!/usr/bin/env bash
# Flip the Prisma datasource provider between SQLite (local dev) and
# PostgreSQL (Supabase). Usage:
#   bash scripts/use-postgres.sh postgres    # prepare for Supabase
#   bash scripts/use-postgres.sh sqlite      # back to local development
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
SCHEMA="prisma/schema.prisma"

if [[ "$MODE" == "postgres" ]]; then
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA"
  echo "schema.prisma → postgresql. Next: bunx prisma db push (DATABASE_URL = Supabase connection string)."
elif [[ "$MODE" == "sqlite" ]]; then
  sed -i 's/provider = "postgresql"/provider = "sqlite"/' "$SCHEMA"
  echo "schema.prisma → sqlite. Next: bun prisma db push && bun prisma/seed.ts"
else
  echo "Usage: bash scripts/use-postgres.sh [postgres|sqlite]" && exit 1
fi

grep -n 'provider =' "$SCHEMA" | head -2
