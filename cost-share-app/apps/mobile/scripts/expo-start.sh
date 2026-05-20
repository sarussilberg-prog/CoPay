#!/usr/bin/env bash
# Start Expo dev client with a real TTY (QR + w/i/a keys).
# When EXPO_AUTO_OPEN_MOBILE=1 (dev-start --open-simulators), opens iOS + Android dev clients once Metro is ready.
# Default: no auto-open — press i / a in Expo to launch simulators.
# Log watcher still runs ios-open after manual "i" in Expo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${EXPO_METRO_PORT:-8081}"
LOG="${TMPDIR:-/tmp}/kupa-expo-$$.log"
IOS_OPEN="$SCRIPT_DIR/ios-open.sh"
OPEN_MOBILE="$SCRIPT_DIR/open-mobile-dev.sh"
AUTO_OPEN_MOBILE="${EXPO_AUTO_OPEN_MOBILE:-0}"

WATCHER_PID=""
AUTO_OPEN_PID=""

cleanup() {
  if [[ -n "$WATCHER_PID" ]]; then
    kill "$WATCHER_PID" 2>/dev/null || true
  fi
  if [[ -n "$AUTO_OPEN_PID" ]]; then
    kill "$AUTO_OPEN_PID" 2>/dev/null || true
  fi
  rm -f "$LOG"
}
trap cleanup EXIT INT TERM

start_ios_watcher() {
  touch "$LOG"
  (
    tail -n 0 -f "$LOG" 2>/dev/null | while IFS= read -r line; do
      if [[ "$line" == *"Opening on iOS"* ]] || [[ "$line" == *"Opening exp://"* ]] || [[ "$line" == *"Opening on iPhone"* ]]; then
        sleep 1.2
        EXPO_METRO_PORT="$PORT" bash "$IOS_OPEN" 2>/dev/null || true
      fi
    done
  ) &
  WATCHER_PID=$!
}

start_mobile_auto_open() {
  [[ "$AUTO_OPEN_MOBILE" == "1" ]] || return 0
  (
    EXPO_METRO_PORT="$PORT" bash "$OPEN_MOBILE"
  ) &
  AUTO_OPEN_PID=$!
}

cd "$MOBILE_DIR"

if [[ "${EXPO_START_WEB:-0}" == "1" && "${DEV_AUTO_OPEN:-0}" == "1" ]]; then
  (
    for _ in $(seq 1 30); do
      if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
        command -v open >/dev/null 2>&1 && open "http://127.0.0.1:${PORT}/" 2>/dev/null || true
        break
      fi
      sleep 1
    done
  ) &
fi

run_expo() {
  start_mobile_auto_open
  local -a args=(start --dev-client --localhost --port "$PORT")
  if [[ "${EXPO_START_WEB:-0}" == "1" ]]; then
    args+=(--web)
  fi
  exec npx expo "${args[@]}"
}

# Node wrapper piped stdout and hid the QR / key menu. script(1) keeps a PTY in real terminals.
if [[ -t 0 && -t 1 ]] && command -v script >/dev/null 2>&1; then
  start_ios_watcher
  start_mobile_auto_open
  WEB_FLAG=()
  [[ "${EXPO_START_WEB:-0}" == "1" ]] && WEB_FLAG=(--web)
  if script -q "$LOG" npx expo start --dev-client --localhost --port "$PORT" ${WEB_FLAG[@]+"${WEB_FLAG[@]}"}; then
    :
  else
    kill "$WATCHER_PID" 2>/dev/null || true
    WATCHER_PID=""
    kill "$AUTO_OPEN_PID" 2>/dev/null || true
    AUTO_OPEN_PID=""
    run_expo
  fi
else
  run_expo
fi
