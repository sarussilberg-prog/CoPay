#!/usr/bin/env bash
# React Native / Expo Android builds require JDK 17. Homebrew's default JDK 25 breaks
# com.facebook.react.settings in settings.gradle (Gradle reports "> 25.0.2").
set -euo pipefail

cd "$(dirname "$0")/.."

pick_java17() {
  if [[ -n "${JAVA_HOME:-}" ]] && "$JAVA_HOME/bin/java" -version 2>&1 | grep -qE 'version "(1[789]|21)\.'; then
    return 0
  fi
  if [[ -d /Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ]]; then
    export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
    return 0
  fi
  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    local home
    home="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
    if [[ -n "$home" ]]; then
      export JAVA_HOME="$home"
      return 0
    fi
  fi
  return 1
}

if ! pick_java17; then
  echo "JDK 17 is required for Android builds. Install Temurin 17 or set JAVA_HOME." >&2
  exit 1
fi

echo "Using JAVA_HOME=${JAVA_HOME}"
exec npx expo run:android "$@"
