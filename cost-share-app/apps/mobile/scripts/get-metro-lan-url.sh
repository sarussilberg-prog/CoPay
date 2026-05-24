#!/usr/bin/env bash
# Print Metro URL reachable from a physical iPhone on the same network as this Mac.
set -euo pipefail

PORT="${EXPO_METRO_PORT:-8081}"
IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "$IP" ]]; then
  IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [[ -z "$IP" ]]; then
  echo "Could not detect LAN IP. Connect Mac to Wi‑Fi or iPhone hotspot." >&2
  exit 1
fi
echo "http://${IP}:${PORT}"
