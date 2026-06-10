#!/usr/bin/env bash
# copay-dev Ignored Build Step: exit 0 = skip, exit 1 = build.
# Build only on dev.
if [ "$VERCEL_GIT_COMMIT_REF" = "dev" ]; then
  exit 1
fi
exit 0
