#!/usr/bin/env bash
# Push EXPO_PUBLIC_* vars from apps/mobile/.env to EAS (for cloud builds).
# Run once after eas init: bash scripts/eas-sync-secrets.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}. Copy from .env.example and fill values."
  exit 1
fi

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
