#!/usr/bin/env bash
# Open Kupay dev clients on booted iOS simulator and running Android emulator (Metro must be up).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${EXPO_METRO_PORT:-8081}"
METRO_STATUS="http://127.0.0.1:${PORT}/status"

tries=45
while [[ $tries -gt 0 ]]; do
  if curl -sf "$METRO_STATUS" 2>/dev/null | grep -q packager-status:running; then
    break
  fi
  sleep 1
  tries=$((tries - 1))
done

if [[ $tries -eq 0 ]]; then
  echo "Metro is not running on port ${PORT}."
  exit 1
fi

sleep 1.5

ios_ok=0
android_ok=0

if EXPO_METRO_PORT="$PORT" bash "$SCRIPT_DIR/ios-open.sh"; then
  ios_ok=1
fi

if EXPO_METRO_PORT="$PORT" bash "$SCRIPT_DIR/android-open.sh"; then
  android_ok=1
fi

if [[ $ios_ok -eq 1 && $android_ok -eq 1 ]]; then
  echo "Mobile dev clients opened on iOS and Android."
  exit 0
fi

if [[ $ios_ok -eq 1 || $android_ok -eq 1 ]]; then
  echo "Opened on one platform. Missing dev build? ios:run / android:run -w @cost-share/mobile"
  exit 0
fi

echo "Could not open mobile dev clients. Build once:"
echo "  npm run ios:run -w @cost-share/mobile"
echo "  npm run android:run -w @cost-share/mobile"
exit 1
