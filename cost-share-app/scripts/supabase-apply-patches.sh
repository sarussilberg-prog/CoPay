#!/usr/bin/env bash
# Apply idempotent Supabase patches (RLS helpers + anon grants) to the linked remote project.
# Run from anywhere: bash cost-share-app/scripts/supabase-apply-patches.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SUPABASE_DIR="$ROOT_DIR/supabase"
PROJECT_REF="${SUPABASE_PROJECT_REF:-drxfbicunusmipdgbgdk}"

cd "$ROOT_DIR"

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

echo "▶ Verifying REST probes ..."
bash "$SCRIPT_DIR/verify-supabase-schema.sh"
