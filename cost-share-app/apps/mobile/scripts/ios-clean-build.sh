#!/usr/bin/env bash
# Clean iOS build caches (fixes many codesign / Embed Pods Frameworks errors).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Cleaning DerivedData for mobile..."
rm -rf ~/Library/Developer/Xcode/DerivedData/mobile-*

echo "Cleaning ios/build..."
rm -rf ios/build

echo "Reinstalling pods + regenerating codegen..."
cd ios
pod install

echo "Done. Next:"
echo "  npm run mobile:ios:device   OR   Xcode ▶ Run (with Metro: npm run dev:mobile)"
