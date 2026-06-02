#!/usr/bin/env bash
# Open Kupay dev client on a connected physical iPhone with the LAN Metro URL.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${EXPO_METRO_PORT:-8081}"
METRO_URL="$("$SCRIPT_DIR/get-metro-lan-url.sh")"
METRO_STATUS="http://127.0.0.1:${PORT}/status"
SCHEME="com.kupay.mobile"
ENCODED_METRO_URL="$(python3 -c "import urllib.parse; print(urllib.parse.quote('${METRO_URL}', safe=''))")"
DEV_CLIENT_URL="${SCHEME}://expo-development-client/?url=${ENCODED_METRO_URL}"

tries=15
while [[ $tries -gt 0 ]]; do
  if curl -sf "$METRO_STATUS" 2>/dev/null | grep -q packager-status:running; then
    break
  fi
  sleep 0.4
  tries=$((tries - 1))
done
if [[ $tries -eq 0 ]]; then
  echo "Metro is not running on port ${PORT}. Start: npm run dev:mobile:device (from repo root)"
  exit 1
fi

DEVICE_LINE="$(xcrun xctrace list devices 2>/dev/null | grep -v Simulator | grep -E 'iPhone|iPad' | head -1 || true)"
if [[ -z "$DEVICE_LINE" ]]; then
  echo "No physical iPhone/iPad found. Connect via USB."
  exit 1
fi
UDID="$(echo "$DEVICE_LINE" | sed -n 's/.*(\([0-9A-Fa-f-]*\)).*/\1/p')"

echo "Opening Kupay on device with Metro at: ${METRO_URL}"
echo "Or on iPhone: tap Enter URL manually → ${METRO_URL}"

if xcrun devicectl device process launch --device "$UDID" --payload-url "$DEV_CLIENT_URL" 2>/dev/null; then
  exit 0
fi

# Fallback: show URL for manual entry in dev client
echo ""
echo "Could not auto-open. On iPhone in Kupay dev client:"
echo "  Enter URL manually → ${METRO_URL}"
