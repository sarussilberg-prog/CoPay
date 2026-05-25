#!/usr/bin/env bash
# Apply idempotent Supabase patches (RLS helpers + anon grants) to the linked remote project.
# Default: development only. Production requires SUPABASE_ENV=production CONFIRM_PRODUCTION=yes
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SUPABASE_DIR="$ROOT_DIR/supabase"

# shellcheck source=supabase-env.sh
source "$SCRIPT_DIR/supabase-env.sh"
PROJECT_REF="$SUPABASE_PROJECT_REF"

if [[ "$SUPABASE_ENV" == "production" && -f "$ROOT_DIR/supabase/.env.production" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/supabase/.env.production"
  set +a
fi

if [[ "$SUPABASE_ENV" == "production" && "${CONFIRM_PRODUCTION:-}" != "yes" ]]; then
  echo "✗ Refusing to patch PRODUCTION without CONFIRM_PRODUCTION=yes" >&2
  echo "  Target: $SUPABASE_URL" >&2
  exit 1
fi

cd "$ROOT_DIR"
echo "▶ Environment: $SUPABASE_ENV ($SUPABASE_URL)"

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  exit 1
fi

echo "▶ Linking project $PROJECT_REF ..."
supabase link --project-ref "$PROJECT_REF" --yes

echo "▶ Applying RLS helper policies ..."
supabase db query --linked --agent=no -f "$SUPABASE_DIR/fix-rls-group-members-recursion.sql"

echo "▶ Applying anon EXECUTE grants (required for RLS policy evaluation) ..."
supabase db query --linked --agent=no -f "$SUPABASE_DIR/fix-is-group-member-anon-grants.sql"

echo "▶ Applying get_user_dashboard RPC (profile dashboard) ..."
supabase db query --linked --agent=no -f "$SUPABASE_DIR/get-user-dashboard.sql"

echo "▶ Applying profiles account deactivation (is_active, delete_my_account) ..."
supabase db query --linked --agent=no -f "$SUPABASE_DIR/fix-profiles-account-deactivation.sql"

echo "▶ Applying groups SELECT policy fix for creators ..."
supabase db query --linked --agent=no -f "$SUPABASE_DIR/fix-groups-select-creator.sql"

echo "▶ Applying friends system (tables, trigger, backfill, RLS, RPCs) ..."
supabase db query --linked --agent=no -f "$SUPABASE_DIR/friends-system.sql"

echo "▶ Verifying REST probes ..."
bash "$SCRIPT_DIR/verify-supabase-schema.sh"
