#!/usr/bin/env bash
# CI helper: push migrations via pooler URL; reconcile history when remote has MCP-only versions.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_URL="$(bash scripts/supabase-migration-db-url.sh)"

# NOTE (2026-06-10): a previous `mark_local_applied` step ran
# `supabase migration repair --status applied` for EVERY local migration BEFORE
# pushing. That marked migrations as "applied" in the remote history WITHOUT
# running their SQL, so `db push` then had nothing to apply. Result: production
# silently desynced — objects (group archive, admin metrics, optimized dashboard)
# were missing while `migration list` claimed they were applied. It was removed.
# Migrations MUST be idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP IF
# EXISTS) so `db push` can run them safely even if some objects already exist.
# See migrations/20260610120000_reconcile_prod_drift.sql.

revert_remote_only() {
  local out
  out="$(supabase db push --db-url "$DB_URL" --dry-run 2>&1)" && return 0
  if ! grep -q 'migration repair --status reverted' <<<"$out"; then
    echo "$out" >&2
    return 1
  fi
  local ids
  ids="$(sed -n 's/.*migration repair --status reverted //p' <<<"$out" | head -1)"
  if [[ -z "$ids" ]]; then
    echo "$out" >&2
    return 1
  fi
  echo "▶ Reconciling remote-only migration history (schema unchanged) ..."
  # shellcheck disable=SC2086
  supabase migration repair --status reverted $ids --db-url "$DB_URL" --yes
}

revert_remote_only || true

echo "▶ Pushing pending migrations ..."
supabase db push --db-url "$DB_URL" --yes
