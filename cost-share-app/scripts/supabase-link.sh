#!/usr/bin/env bash
# Link Supabase CLI to dev or production project (explicit SUPABASE_ENV required for production).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=supabase-env.sh
source "$SCRIPT_DIR/supabase-env.sh"

ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$SUPABASE_ENV" == "production" && -f "$ROOT_DIR/supabase/.env.production" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/supabase/.env.production"
  set +a
fi

if [[ "$SUPABASE_ENV" == "production" && "${CONFIRM_PRODUCTION:-}" != "yes" ]]; then
  echo "⚠️  Linking CLI to PRODUCTION ($SUPABASE_PROJECT_REF)." >&2
  echo "   Re-run with: SUPABASE_ENV=production CONFIRM_PRODUCTION=yes bash scripts/supabase-link.sh" >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ supabase CLI not found. Install: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

LINK_ARGS=(--project-ref "$SUPABASE_PROJECT_REF" --yes)
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  LINK_ARGS+=(--password "$SUPABASE_DB_PASSWORD")
fi

echo "▶ Linking [$SUPABASE_ENV] project $SUPABASE_PROJECT_REF ..."
supabase link "${LINK_ARGS[@]}"
echo "✓ Linked to $SUPABASE_URL"
