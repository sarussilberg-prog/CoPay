#!/usr/bin/env bash
# Push EXPO_PUBLIC_* vars from apps/mobile/.env to EAS (for cloud builds).
# Run once after eas init: bash scripts/eas-sync-secrets.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-${ROOT}/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}." >&2
  echo "  Dev:  bash scripts/eas-sync-secrets.sh" >&2
  echo "  Prod: bash scripts/eas-sync-secrets.sh .env.production" >&2
  exit 1
fi

case "$(basename "$ENV_FILE")" in
  .env.production|.env.production.local)
    if ! grep -q 'jfqxjjjbpxbwwvoygahu' "$ENV_FILE" 2>/dev/null; then
      echo "✗ ${ENV_FILE} must use production URL (jfqxjjjbpxbwwvoygahu)" >&2
      exit 1
    fi
    ;;
  *)
    if ! grep -q 'drxfbicunusmipdgbgdk' "$ENV_FILE" 2>/dev/null; then
      echo "⚠️  ${ENV_FILE} does not contain dev project ref (drxfbicunusmipdgbgdk)" >&2
    fi
    ;;
esac

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

sync_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "Skip ${name} (empty)"
    return
  fi
  echo "Sync ${name}..."
  eas secret:create --name "$name" --value "$value" --type string --force
}

for key in \
  EXPO_PUBLIC_SUPABASE_URL \
  EXPO_PUBLIC_SUPABASE_ANON_KEY \
  EXPO_PUBLIC_WEB_APP_URL \
  EXPO_PUBLIC_APP_STORE_URL \
  EXPO_PUBLIC_PLAY_STORE_URL \
  EXPO_PUBLIC_SUPPORT_EMAIL; do
  sync_secret "$key"
done

echo "Done. Verify: eas secret:list"
