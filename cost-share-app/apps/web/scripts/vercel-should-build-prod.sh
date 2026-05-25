#!/usr/bin/env bash
# kupa-prod Ignored Build Step: exit 0 = skip, exit 1 = build.
# Build only on main.
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then
  exit 1
fi
exit 0
