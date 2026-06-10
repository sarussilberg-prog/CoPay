#!/usr/bin/env bash
# Install CoPay dev build on a connected iPhone (Personal Team OK while Apple enrolls).
# 1. iPhone: Settings → Privacy & Security → Developer Mode ON (iOS 16+)
# 2. Connect USB, unlock phone, tap Trust
# 3. Xcode → Settings → Apple Accounts → Personal Team → Manage Certificates (if prompted)
# 4. Run from cost-share-app: npm run ios:device -w @cost-share/mobile

set -euo pipefail

cd "$(dirname "$0")/.."

# Prefer devicectl (CoreDevice — current tooling); fall back to xctrace.
# xctrace often shows physical devices as "Offline" on recent macOS/Xcode even when they're paired and available.
# NR>2 skips the two header rows; exclude clearly unreachable states.
PHYSICAL="$(xcrun devicectl list devices 2>/dev/null | awk 'NR>2 && /iPhone|iPad/ && !/disconnected/ && !/unavailable/' || true)"
if [[ -z "$PHYSICAL" ]]; then
  PHYSICAL="$(xcrun xctrace list devices 2>/dev/null | grep -v Simulator | grep -E 'iPhone|iPad' || true)"
fi
if [[ -z "$PHYSICAL" ]]; then
  echo "No physical iPhone/iPad detected."
  echo "Check: USB cable, unlock phone, Trust This Computer, Developer Mode ON."
  echo "Verify in Xcode: Window → Devices and Simulators, or run: xcrun devicectl list devices"
  exit 1
fi
echo "Detected device(s):"
echo "$PHYSICAL"

echo "Building and installing on device (first run may take several minutes)..."
# --no-build-cache avoids stale ReactCodegen paths after ios/build was cleaned
npx expo run:ios --device --no-build-cache
