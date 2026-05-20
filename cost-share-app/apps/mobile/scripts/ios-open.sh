#!/usr/bin/env bash
# Re-open the Kupa dev client on the booted iOS simulator with the current Metro URL.
# Requires a local dev build: npm run ios:run (once) before using ios:open.

set -euo pipefail

PORT="${EXPO_METRO_PORT:-8081}"
METRO_STATUS="http://127.0.0.1:${PORT}/status"
BUNDLE_ID="com.kupa.mobile"
SCHEME="com.kupa.mobile"
METRO_URL="http://127.0.0.1:${PORT}"
ENCODED_METRO_URL="$(python3 -c "import urllib.parse; print(urllib.parse.quote('${METRO_URL}', safe=''))")"
DEV_CLIENT_URL="${SCHEME}://expo-development-client/?url=${ENCODED_METRO_URL}"

if ! xcrun simctl list devices booted 2>/dev/null | grep -q Booted; then
  echo "No booted iOS simulator. Run: npm run ios:run -w @cost-share/mobile"
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

echo "Opening Kupa dev client (Metro :${PORT})..."
xcrun simctl terminate booted "$BUNDLE_ID" 2>/dev/null || true
sleep 0.5

if xcrun simctl openurl booted "$DEV_CLIENT_URL" 2>/dev/null; then
  echo "Opened ${DEV_CLIENT_URL}"
  exit 0
fi

if xcrun simctl launch booted "$BUNDLE_ID" 2>/dev/null; then
  echo "Launched ${BUNDLE_ID}"
  exit 0
fi

echo "Dev client not installed. Build once with: npm run ios:run -w @cost-share/mobile"
exit 1
