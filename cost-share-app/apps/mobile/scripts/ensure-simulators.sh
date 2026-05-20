#!/usr/bin/env bash
# Boot iOS Simulator and start an Android emulator if none are running (best-effort).

set -euo pipefail

ios_ready() {
  xcrun simctl list devices booted 2>/dev/null | grep -q Booted
}

android_ready() {
  command -v adb >/dev/null 2>&1 && adb devices 2>/dev/null | grep -qE '^emulator-[0-9]+\tdevice$'
}

if ! ios_ready; then
  echo "▶ No booted iOS simulator — opening Simulator..."
  open -a Simulator 2>/dev/null || true
  for _ in $(seq 1 20); do
    sleep 0.5
    ios_ready && break
  done
fi

if android_ready; then
  exit 0
fi

if ! command -v emulator >/dev/null 2>&1; then
  echo "! Android emulator CLI not on PATH — start an emulator manually for Android."
  exit 0
fi

avd="${DEV_ANDROID_AVD:-}"
if [[ -z "$avd" ]]; then
  avd="$(emulator -list-avds 2>/dev/null | head -1)"
fi

if [[ -z "$avd" ]]; then
  echo "! No Android AVD found — create one in Android Studio for Android auto-open."
  exit 0
fi

echo "▶ Starting Android emulator: ${avd} (background)..."
nohup emulator -avd "$avd" -no-snapshot-load >/dev/null 2>&1 &
if command -v adb >/dev/null 2>&1; then
  adb wait-for-device 2>/dev/null || true
  for _ in $(seq 1 60); do
    android_ready && break
    sleep 1
  done
fi
