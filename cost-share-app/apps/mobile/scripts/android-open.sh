#!/usr/bin/env bash
# Re-open the Kupay dev client on a running Android emulator with the current Metro URL.
# Requires a local dev build: npm run android:run (once) before using android:open.

set -euo pipefail

PORT="${EXPO_METRO_PORT:-8081}"
METRO_STATUS="http://127.0.0.1:${PORT}/status"
PACKAGE="com.kupay.mobile"
SCHEME="com.kupay.mobile"
METRO_URL="http://127.0.0.1:${PORT}"
ENCODED_METRO_URL="$(python3 -c "import urllib.parse; print(urllib.parse.quote('${METRO_URL}', safe=''))")"
DEV_CLIENT_URL="${SCHEME}://expo-development-client/?url=${ENCODED_METRO_URL}"

adb_device() {
  adb devices 2>/dev/null | awk '/^emulator-[0-9]+\tdevice$/{print $1; exit}'
}

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install Android SDK platform-tools."
  exit 1
fi

device="$(adb_device)"
if [[ -z "$device" ]]; then
  echo "No Android emulator running. Start one in Android Studio or: npm run android:run -w @cost-share/mobile"
  exit 1
fi

tries=15
while [[ $tries -gt 0 ]]; do
  if curl -sf "$METRO_STATUS" 2>/dev/null | grep -q packager-status:running; then
    break
  fi
  sleep 0.4
  tries=$((tries - 1))
done

if [[ $tries -eq 0 ]]; then
  echo "Metro is not running on port ${PORT}. Start Expo first (npm run start)."
  exit 1
fi

echo "Opening Kupay dev client on Android (Metro :${PORT})..."
adb -s "$device" reverse "tcp:${PORT}" "tcp:${PORT}" 2>/dev/null || true
adb -s "$device" shell am force-stop "$PACKAGE" 2>/dev/null || true
sleep 0.5

if adb -s "$device" shell am start -a android.intent.action.VIEW -d "$DEV_CLIENT_URL" >/dev/null 2>&1; then
  echo "Opened ${DEV_CLIENT_URL}"
  exit 0
fi

if adb -s "$device" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; then
  echo "Launched ${PACKAGE}"
  exit 0
fi

echo "Dev client not installed. Build once with: npm run android:run -w @cost-share/mobile"
exit 1
