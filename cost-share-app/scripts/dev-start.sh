#!/usr/bin/env bash
# Kupay dev launcher — preflight, then web (+ shared watch) in background, Expo in foreground.
#
# Usage (bash or npm run dev:start):
#   scripts/dev-start.sh
#   scripts/dev-start.sh --web-only      # web + shared only (no Expo)
#   scripts/dev-start.sh --mobile-only   # Expo only (no Next.js)
#   scripts/dev-start.sh --skip-tests
#   scripts/dev-start.sh --skip-schema   # skip Supabase HTTP probe
#   scripts/dev-start.sh --check-only
#   scripts/dev-start.sh --no-open         # skip auto-open web in browser
#   scripts/dev-start.sh --open-simulators # boot iOS/Android + open dev clients (legacy)
#
# Default: web may open in browser; Expo runs without starting simulators.
# Press i / a in the Expo terminal to open iOS / Android when you want.
# First time on a new simulator: npm run mobile:ios && npm run mobile:android
#
# Env: WEB_PORT=8081 (Expo Web). Data: Supabase via apps/mobile/.env

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

export CI=1
export npm_config_yes=true
export npm_config_loglevel=error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

WEB_DIR="$ROOT_DIR/apps/web"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
SHARED_DIR="$ROOT_DIR/packages/shared"
SCRIPTS_DIR="$ROOT_DIR/scripts"

SUPABASE_ENV="$ROOT_DIR/supabase/.env"
WEB_ENV="$WEB_DIR/.env.local"
MOBILE_ENV="$MOBILE_DIR/.env"
VERIFY_SCHEMA_SH="$SCRIPTS_DIR/verify-supabase-schema.sh"

WEB_PORT="${WEB_PORT:-8081}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/.dev-logs}"

SKIP_CHECKS=false
SKIP_TESTS=false
SKIP_SCHEMA=false
WEB_ONLY=false
MOBILE_ONLY=false
CHECK_ONLY=false
FORCE_INSTALL=false
DEV_AUTO_OPEN=1
DEV_AUTO_OPEN_MOBILE=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PIDS=()

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
}

log()  { printf '%b▶%b %s\n' "$BLUE" "$NC" "$*"; }
ok()   { printf '%b✓%b %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%b!%b %s\n' "$YELLOW" "$NC" "$*"; }
fail() { printf '%b✗%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-checks)   SKIP_CHECKS=true ;;
    --skip-tests)    SKIP_TESTS=true ;;
    --skip-schema)   SKIP_SCHEMA=true ;;
    --web-only)      WEB_ONLY=true ;;
    --mobile-only)   MOBILE_ONLY=true ;;
    --check-only)    CHECK_ONLY=true ;;
    --with-mobile)   WEB_ONLY=false ;; # legacy alias
    -h|--help)       usage; exit 0 ;;
    --install)       FORCE_INSTALL=true ;;
    --no-open)         DEV_AUTO_OPEN=0 ;;
    --open-simulators) DEV_AUTO_OPEN_MOBILE=1 ;;
    *)                 fail "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

if [[ "$WEB_ONLY" == true && "$MOBILE_ONLY" == true ]]; then
  fail "Use either --web-only or --mobile-only, not both"
fi

WITH_MOBILE=true
WITH_WEB=true
if [[ "$WEB_ONLY" == true ]]; then
  WITH_MOBILE=false
fi
if [[ "$MOBILE_ONLY" == true ]]; then
  WITH_WEB=false
fi

cleanup() {
  if [[ ${#PIDS[@]} -eq 0 ]]; then
    return
  fi
  echo ""
  log "Stopping background services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      pkill -P "$pid" 2>/dev/null || true
    fi
  done
  wait "${PIDS[@]}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

is_placeholder() {
  local value="$1"
  [[ -z "$value" ]] && return 0
  [[ "$value" == *"YOUR-"* || "$value" == *"your-"* || "$value" == *"YOUR_"* ]]
}

port_in_use() {
  lsof -i ":$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    warn "Freeing port $port (stale process)..."
    kill $pids 2>/dev/null || true
    sleep 0.5
  fi
}

free_metro_ports() {
  local p
  for p in 8081 8082 8083; do
    free_port "$p"
  done
}

free_dev_stack_ports() {
  if [[ "$WITH_WEB" == true ]]; then
    free_port "$WEB_PORT"
  fi
  if [[ "$WITH_MOBILE" == true ]]; then
    free_metro_ports
  fi
}

require_free_port() {
  local port="$1" label="$2"
  if port_in_use "$port"; then
    fail "$label port $port is still in use after cleanup. Stop the other process or change WEB_PORT."
  fi
}

check_node() {
  log "Checking Node.js..."
  command -v node >/dev/null || fail "Node.js is not installed"
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  [[ "$major" -ge 18 ]] || fail "Node.js 18+ required (found $(node -v))"
  ok "Node $(node -v)"
}

check_dependencies() {
  log "Checking dependencies..."
  if [[ "$FORCE_INSTALL" == true ]] || [[ ! -d "$ROOT_DIR/node_modules/@types/jest" ]]; then
    warn "Installing dependencies (npm install)..."
    (cd "$ROOT_DIR" && npm install --no-fund --no-audit)
  fi
  ok "node_modules ready"
}

env_example_path() {
  local file="$1"
  if [[ "$(basename "$file")" == ".env.local" ]]; then
    echo "$(dirname "$file")/.env.example"
  else
    echo "${file}.example"
  fi
}

check_env_file() {
  local label="$1" file="$2"
  shift 2
  local -a required=("$@")
  local example
  example="$(env_example_path "$file")"

  log "Checking $label env ($file)..."
  if [[ ! -f "$file" ]]; then
    if [[ -f "$example" ]]; then
      cp "$example" "$file"
      warn "$label: created $file from $(basename "$example") — add your Supabase credentials"
    else
      fail "$label: missing $file (no $(basename "$example") found)"
    fi
  fi

  local missing=()
  for key in "${required[@]}"; do
    local val
    val="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
    if is_placeholder "$val"; then
      missing+=("$key")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "$label: set these in $file: ${missing[*]}"
  fi
  ok "$label env"
}

check_env() {
  if [[ -f "$SUPABASE_ENV" ]]; then
    check_env_file "Supabase (seed/verify)" "$SUPABASE_ENV" \
      SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
  else
    warn "Optional: supabase/.env (service role) — only needed for npm run seed"
  fi

  if [[ "$WITH_WEB" == true || "$WITH_MOBILE" == true ]]; then
    check_env_file "Mobile" "$MOBILE_ENV" \
      EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY
  fi
}

run_tsc() {
  local name="$1" dir="$2"
  log "Typecheck $name..."
  (cd "$dir" && npx tsc --noEmit)
  ok "Typecheck $name"
}

check_typescript() {
  run_tsc "shared" "$SHARED_DIR"
  if [[ "$WITH_MOBILE" == true ]]; then
    run_tsc "mobile" "$MOBILE_DIR"
  fi
}

check_shared_build() {
  log "Building @cost-share/shared..."
  (cd "$ROOT_DIR" && npm run build -w @cost-share/shared --silent)
  ok "Shared package build"
}

check_tests() {
  if [[ "$WITH_MOBILE" != true ]]; then
    warn "Skipping mobile tests (mobile not in this dev profile)"
    return
  fi
  log "Running mobile unit tests (Jest)..."
  (cd "$ROOT_DIR" && npm test -w @cost-share/mobile -- --ci --passWithNoTests --silent)
  ok "Mobile tests passed"
}

check_supabase_schema() {
  if [[ "$SKIP_SCHEMA" == true ]]; then
    warn "Skipping Supabase schema probe (--skip-schema)"
    return
  fi
  log "Checking Supabase schema..."
  bash "$VERIFY_SCHEMA_SH"
  ok "Supabase schema"
}

run_checks() {
  echo ""
  echo "══════════════════════════════════════════"
  echo "  Kupay — preflight checks"
  echo "══════════════════════════════════════════"
  echo ""

  check_node
  check_dependencies
  check_env
  check_supabase_schema
  check_typescript
  check_shared_build
  if [[ "$SKIP_TESTS" != true ]]; then
    check_tests
  else
    warn "Skipping tests (--skip-tests)"
  fi

  echo ""
  ok "All checks passed"
  echo ""
}

start_bg() {
  local name="$1"
  shift
  mkdir -p "$LOG_DIR"
  rm -f "$LOG_DIR/server.log" # legacy Nest API (removed)
  (cd "$ROOT_DIR" && "$@") >"$LOG_DIR/${name}.log" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  echo "  → $name  PID $pid  log: $LOG_DIR/${name}.log"
}

wait_for_port() {
  local port="$1" name="$2" logfile="$3" tries=30
  while [[ $tries -gt 0 ]]; do
    if port_in_use "$port"; then
      ok "$name listening on :${port}"
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  warn "$name not ready — see $logfile"
  tail -15 "$logfile" 2>/dev/null || true
  return 1
}

open_web_browser() {
  [[ "$DEV_AUTO_OPEN" == "1" ]] || return 0
  [[ "$WITH_WEB" == true ]] || return 0
  local port="${EXPO_METRO_PORT:-8081}"
  local url="http://localhost:${port}"
  if command -v open >/dev/null 2>&1; then
    log "Opening Expo web app in browser: ${url}"
    open "$url" 2>/dev/null || warn "Could not open browser for ${url}"
  else
    log "Expo web app ready at ${url}"
  fi
}

ios_dev_build_installed() {
  xcrun simctl list devices booted 2>/dev/null | grep -q Booted \
    && xcrun simctl get_app_container booted com.kupay.mobile data 2>/dev/null
}

warn_missing_mobile_builds() {
  [[ "$WITH_MOBILE" == true ]] || return 0
  if ! ios_dev_build_installed; then
    warn "iOS dev client NOT installed on the booted simulator."
    warn "In another terminal: npm run mobile:ios   (then restart dev:start or press i)"
  fi
  if command -v adb >/dev/null 2>&1 && ! adb devices 2>/dev/null | grep -qE '^emulator-[0-9]+\tdevice$'; then
    warn "No Android emulator — skip Android or run: npm run mobile:android"
  fi
}

prepare_mobile_simulators() {
  [[ "$WITH_MOBILE" == true ]] || return 0
  local ensure="$MOBILE_DIR/scripts/ensure-simulators.sh"
  if [[ -x "$ensure" ]] || [[ -f "$ensure" ]]; then
    log "Ensuring iOS / Android simulators are running..."
    bash "$ensure" || warn "Simulator prep incomplete — mobile auto-open may skip a platform"
  fi
  warn_missing_mobile_builds
}

start_background_stack() {
  free_dev_stack_ports

  log "Starting shared package (watch)..."
  start_bg "shared" npm run dev -w @cost-share/shared --silent

  if [[ "$WITH_WEB" == true ]]; then
    export EXPO_START_WEB=1
  fi
}

start_expo_foreground() {
  echo ""
  echo "══════════════════════════════════════════"
  echo "  Expo — interactive (this terminal)"
  echo "══════════════════════════════════════════"
  if [[ "$DEV_AUTO_OPEN_MOBILE" == "1" ]]; then
    echo "  Simulators: auto-boot + open dev clients (--open-simulators)"
  else
    echo "  Simulators: off until you press i (iOS) or a (Android) in Expo"
  fi
  echo "  w → Expo web  |  a → Android  |  i → iOS"
  echo "  First time on a simulator? npm run mobile:ios && npm run mobile:android"
  echo "  Metro: exp://127.0.0.1:8081"
  if [[ "$WITH_WEB" == true ]]; then
    echo "  Expo Web: http://localhost:${EXPO_METRO_PORT:-8081}"
  fi
  echo "  Data: Supabase (apps/mobile/.env)"
  echo "  Ctrl+C stops Expo and background services"
  echo ""

  unset CI
  export EXPO_METRO_PORT=8081
  export DEV_AUTO_OPEN="$DEV_AUTO_OPEN"
  if [[ "$DEV_AUTO_OPEN_MOBILE" == "1" ]]; then
    export EXPO_AUTO_OPEN_MOBILE=1
    prepare_mobile_simulators
  else
    export EXPO_AUTO_OPEN_MOBILE=0
  fi
  cd "$MOBILE_DIR"
  npm run start
}

start_services() {
  echo "══════════════════════════════════════════"
  echo "  Kupay — starting dev stack"
  echo "══════════════════════════════════════════"
  echo ""
  if [[ "$WITH_WEB" == true ]]; then
    echo "  Web:  http://localhost:${EXPO_METRO_PORT:-8081} (Expo Web)"
  fi
  if [[ "$WITH_MOBILE" == true ]]; then
    echo "  Expo: interactive below (Metro ~8081)"
  else
    echo "  Logs: $LOG_DIR/"
  fi
  echo "  Data: Supabase"
  echo ""

  start_background_stack

  if [[ "$WITH_MOBILE" == true ]]; then
    start_expo_foreground
  elif [[ "$WITH_WEB" == true ]]; then
    echo ""
    echo "══════════════════════════════════════════"
    echo "  Expo Web — foreground (this terminal)"
    echo "══════════════════════════════════════════"
    echo "  URL: http://localhost:${WEB_PORT}"
    echo "  Ctrl+C to stop"
    echo ""
    unset CI
    cd "$MOBILE_DIR"
    npx expo start --web --port "$WEB_PORT"
  else
    echo ""
    log "Tailing logs (Ctrl+C to stop)..."
    local -a logs=("$LOG_DIR/shared.log")
    tail -f "${logs[@]}"
  fi
}

# ─── Main ───────────────────────────────────────────────────────────────────

if [[ "$SKIP_CHECKS" != true ]]; then
  run_checks
else
  warn "Skipping preflight checks (--skip-checks)"
fi

if [[ "$CHECK_ONLY" == true ]]; then
  ok "Check-only mode — not starting servers"
  trap - EXIT INT TERM
  exit 0
fi

start_services
