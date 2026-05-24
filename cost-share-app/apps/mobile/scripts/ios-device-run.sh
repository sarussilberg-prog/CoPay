#!/usr/bin/env bash
# Install Kupa dev build on a connected iPhone (Personal Team OK while Apple enrolls).
# 1. iPhone: Settings → Privacy & Security → Developer Mode ON (iOS 16+)
# 2. Connect USB, unlock phone, tap Trust
# 3. Xcode → Settings → Apple Accounts → Personal Team → Manage Certificates (if prompted)
# 4. Run from cost-share-app: npm run ios:device -w @cost-share/mobile

set -euo pipefail

cd "$(dirname "$0")/.."

PHYSICAL="$(xcrun xctrace list devices 2>/dev/null | grep -v Simulator | grep -E 'iPhone|iPad' || true)"
if [[ -z "$PHYSICAL" ]]; then
  echo "No physical iPhone/iPad detected."
  echo "Check: USB cable, unlock phone, Trust This Computer, Developer Mode ON."
  echo "Verify in Xcode: Window → Devices and Simulators"
  exit 1
fi
echo "Detected device(s):"
echo "$PHYSICAL"

echo "Building and installing on device (first run may take several minutes)..."
# --no-build-cache avoids stale ReactCodegen paths after ios/build was cleaned
npx expo run:ios --device --no-build-cache
