#!/usr/bin/env bash
# Open the iOS workspace in Xcode so you can fix signing (Personal Team).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="${ROOT}/ios/mobile.xcworkspace"

if [[ ! -d "$WORKSPACE" ]]; then
  echo "Missing ${WORKSPACE}. Run: npm run prebuild -w @cost-share/mobile"
  exit 1
fi

echo "Opening Xcode workspace for signing setup..."
open "$WORKSPACE"
echo ""
echo "In Xcode:"
echo "  1. Select project 'mobile' → target 'mobile' → Signing & Capabilities"
echo "  2. Team: Personal Team (sarussilberg@gmail.com)"
echo "  3. Enable 'Automatically manage signing'"
echo "  4. Xcode → Settings → Apple Accounts → Manage Certificates → + Apple Development"
echo "Then run: npm run mobile:ios:device (from repo root or cost-share-app)"
