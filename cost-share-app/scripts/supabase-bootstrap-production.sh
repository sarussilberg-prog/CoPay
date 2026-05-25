#!/usr/bin/env bash
# One-time: apply canonical schema + patches to empty PRODUCTION project.
# Requires supabase/.env.production (service role). Does NOT seed data.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SUPABASE_DIR="$ROOT_DIR/supabase"

export SUPABASE_ENV=production
# shellcheck source=supabase-env.sh
source "$SCRIPT_DIR/supabase-env.sh"

ENV_FILE="$SUPABASE_DIR/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ Missing $ENV_FILE — create from supabase/.env.example (production URL + SUPABASE_DB_PASSWORD)" >&2
  exit 1
fi

if [[ "${CONFIRM_PRODUCTION_BOOTSTRAP:-}" != "yes" ]]; then
  echo "⚠️  This applies schema to PRODUCTION: $SUPABASE_URL" >&2
  echo "   Re-run with: CONFIRM_PRODUCTION_BOOTSTRAP=yes bash scripts/supabase-bootstrap-production.sh" >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ supabase CLI not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT_DIR"

LINK_ARGS=(--project-ref "$SUPABASE_PROJECT_REF" --yes)
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  LINK_ARGS+=(--password "$SUPABASE_DB_PASSWORD")
else
  echo "✗ Set SUPABASE_DB_PASSWORD in $ENV_FILE" >&2
  exit 1
fi

echo "▶ Linking production $SUPABASE_PROJECT_REF ..."
supabase link "${LINK_ARGS[@]}"

echo "▶ Applying schema.sql ..."
supabase db query --linked --agent=no -f "$SUPABASE_DIR/schema.sql"

echo "▶ Applying idempotent patches ..."
SUPABASE_ENV=production CONFIRM_PRODUCTION=yes bash "$SCRIPT_DIR/supabase-apply-patches.sh"

echo "✓ Production bootstrap complete. Run verify with supabase/.env.production:"
echo "  DOTENV_CONFIG_PATH=./supabase/.env.production npm run supabase:verify"
