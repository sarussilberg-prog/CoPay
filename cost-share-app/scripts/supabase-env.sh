#!/usr/bin/env bash
# Resolve Supabase environment (development | production) from SUPABASE_ENV or git branch.
set -euo pipefail

DEV_REF="drxfbicunusmipdgbgdk"
PROD_REF="jfqxjjjbpxbwwvoygahu"
DEV_URL="https://${DEV_REF}.supabase.co"
PROD_URL="https://${PROD_REF}.supabase.co"

resolve_from_git() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 1
  fi
  local branch
  branch="$(git branch --show-current 2>/dev/null || true)"
  if [[ "$branch" == "main" ]]; then
    echo "production"
    return 0
  fi
  if [[ -n "$branch" ]]; then
    echo "development"
    return 0
  fi
  return 1
}

if [[ -n "${SUPABASE_ENV:-}" ]]; then
  ENV_NAME="$SUPABASE_ENV"
else
  ENV_NAME="$(resolve_from_git || echo "development")"
fi

case "$ENV_NAME" in
  development|dev)
    ENV_NAME="development"
    PROJECT_REF="$DEV_REF"
    SUPABASE_URL="$DEV_URL"
    ;;
  production|prod)
    ENV_NAME="production"
    PROJECT_REF="$PROD_REF"
    SUPABASE_URL="$PROD_URL"
    ;;
  *)
    echo "✗ Invalid SUPABASE_ENV=${SUPABASE_ENV:-} (use development or production)" >&2
    exit 1
    ;;
esac

export SUPABASE_ENV="$ENV_NAME"
export SUPABASE_PROJECT_REF="$PROJECT_REF"
export SUPABASE_URL
