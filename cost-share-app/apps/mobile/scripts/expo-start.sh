#!/usr/bin/env bash
# Start Expo dev client with a real TTY (QR + w/i/a keys).
# When EXPO_AUTO_OPEN_MOBILE=1, opens iOS + Android dev clients once Metro is ready.
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
  [[ "$AUTO_OPEN_MOBILE" == "1" ]] || return
  (
    EXPO_METRO_PORT="$PORT" bash "$OPEN_MOBILE"
  ) &
  AUTO_OPEN_PID=$!
}

cd "$MOBILE_DIR"

run_expo() {
  start_mobile_auto_open
  exec npx expo start --dev-client --localhost --port "$PORT"
}

# Node wrapper piped stdout and hid the QR / key menu. script(1) keeps a PTY in real terminals.
if [[ -t 0 && -t 1 ]] && command -v script >/dev/null 2>&1; then
  start_ios_watcher
  start_mobile_auto_open
  if script -q "$LOG" npx expo start --dev-client --localhost --port "$PORT"; then
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
