#!/usr/bin/env bash
# Probes Supabase REST API (profiles table). Uses service role or anon key.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_SQL="$ROOT_DIR/supabase/schema.sql"
PROBE_FILE="$(mktemp "${TMPDIR:-/tmp}/kupay-schema-probe.XXXXXX")"
trap 'rm -f "$PROBE_FILE"' EXIT

load_env_file() {
  local file="$1"
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

SUPABASE_URL=""
API_KEY=""
ENV_SOURCE=""

if [[ -f "$ROOT_DIR/supabase/.env" ]]; then
  load_env_file "$ROOT_DIR/supabase/.env"
  SUPABASE_URL="${SUPABASE_URL:-}"
  API_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
  ENV_SOURCE="supabase/.env"
elif [[ -f "$ROOT_DIR/apps/mobile/.env" ]]; then
  load_env_file "$ROOT_DIR/apps/mobile/.env"
  SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-}"
  API_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}"
  ENV_SOURCE="apps/mobile/.env"
elif [[ -f "$ROOT_DIR/apps/web/.env.local" ]]; then
  load_env_file "$ROOT_DIR/apps/web/.env.local"
  SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
  API_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}"
  ENV_SOURCE="apps/web/.env.local"
fi

if [[ -z "$SUPABASE_URL" || -z "$API_KEY" ]]; then
  echo "✗ No Supabase credentials found."
  echo "  Set EXPO_PUBLIC_SUPABASE_* in apps/mobile/.env"
  echo "  (optional: supabase/.env with service role for npm run seed)"
  exit 1
fi

probe() {
  local table="$1"
  local label="$2"
  HTTP_CODE="$(curl -s -o "$PROBE_FILE" -w "%{http_code}" \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $API_KEY" \
    "$SUPABASE_URL/rest/v1/${table}?select=*&limit=1")"
  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "✓ $label reachable (HTTP 200)"
    return 0
  fi
  echo "✗ $label probe failed (HTTP $HTTP_CODE)"
  cat "$PROBE_FILE" 2>/dev/null || true
  echo ""
  if grep -q '42P17\|infinite recursion' "$PROBE_FILE" 2>/dev/null; then
    echo "  → RLS recursion detected. Apply cost-share-app/supabase/fix-rls-group-members-recursion.sql in Supabase SQL Editor."
  elif grep -q '42501\|permission denied for function is_group_member' "$PROBE_FILE" 2>/dev/null; then
    echo "  → Grant anon EXECUTE on RLS helpers. Apply cost-share-app/supabase/fix-is-group-member-anon-grants.sql in Supabase SQL Editor."
  else
    echo "  → Re-apply $SCHEMA_SQL in Supabase SQL Editor"
  fi
  return 1
}

FAILED=0
probe profiles        "profiles" || FAILED=1
probe group_members   "group_members (catches RLS recursion 42P17)" || FAILED=1
probe groups          "groups" || FAILED=1
probe expenses        "expenses" || FAILED=1
probe settlements     "settlements" || FAILED=1

# RPC must exist for profile dashboard (404 = function not deployed)
RPC_HTTP_CODE="$(curl -s -o "$PROBE_FILE" -w "%{http_code}" \
  -X POST \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_user_id":"00000000-0000-0000-0000-000000000000"}' \
  "$SUPABASE_URL/rest/v1/rpc/get_user_dashboard")"
if [[ "$RPC_HTTP_CODE" == "200" ]]; then
  echo "✓ get_user_dashboard RPC reachable (HTTP 200)"
elif [[ "$RPC_HTTP_CODE" == "404" ]]; then
  echo "✗ get_user_dashboard RPC missing (HTTP 404)"
  echo "  → Apply cost-share-app/supabase/get-user-dashboard.sql (or: bash scripts/supabase-apply-patches.sh)"
  FAILED=1
else
  echo "✗ get_user_dashboard RPC probe failed (HTTP $RPC_HTTP_CODE)"
  cat "$PROBE_FILE" 2>/dev/null || true
  echo ""
  FAILED=1
fi

MSG_RPC_HTTP_CODE="$(curl -s -o "$PROBE_FILE" -w "%{http_code}" \
  -X POST \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_group_id":"00000000-0000-0000-0000-000000000000","p_limit":1}' \
  "$SUPABASE_URL/rest/v1/rpc/get_group_messages")"
if [[ "$MSG_RPC_HTTP_CODE" == "404" ]]; then
  echo "✗ get_group_messages RPC missing (HTTP 404)"
  echo "  → Apply cost-share-app/supabase/group-messages.sql (or: bash scripts/supabase-apply-patches.sh)"
  FAILED=1
elif [[ "$MSG_RPC_HTTP_CODE" =~ ^[245] ]]; then
  echo "✓ get_group_messages RPC reachable (HTTP $MSG_RPC_HTTP_CODE)"
else
  echo "✗ get_group_messages RPC probe failed (HTTP $MSG_RPC_HTTP_CODE)"
  cat "$PROBE_FILE" 2>/dev/null || true
  echo ""
  FAILED=1
fi

if [[ "$FAILED" -eq 0 ]]; then
  echo ""
  echo "✓ Supabase schema OK [source: $ENV_SOURCE]"
  exit 0
fi
echo ""
echo "✗ Supabase schema has issues [source: $ENV_SOURCE]"
exit 1
