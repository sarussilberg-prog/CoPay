#!/usr/bin/env bash
# Builds the Expo Web export for production (kupa.pro).
# Maps Vercel web env vars to Expo public env when needed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# Expo build; also accepts Next.js and Vercel Supabase integration variable names
export EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_ANON_KEY:-}}}}}"

if [[ -z "$EXPO_PUBLIC_SUPABASE_URL" || -z "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]]; then
  echo "Missing Supabase env vars in Vercel. Set any pair:" >&2
  echo "  URL: EXPO_PUBLIC_SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL" >&2
  echo "  Key: EXPO_PUBLIC_SUPABASE_ANON_KEY | NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY | SUPABASE_PUBLISHABLE_KEY | SUPABASE_ANON_KEY" >&2
  exit 1
fi

cd "$ROOT"
npm run build -w @cost-share/shared
npm run build:web -w @cost-share/mobile
