#!/bin/bash
# Wrapper for build-bundle.sh that patches two environment issues present in
# sandboxed / offline CI workers:
#
# 1. Registry unreachable — build-bundle.sh calls curl to fetch the latest
#    published appVersion; when the Calimero registry is not reachable the
#    curl exits with code 5 and the subsequent jq call on the empty stream
#    also exits non-zero, triggering `set -e` and aborting the whole script.
#    Fix: export APP_VERSION_OVERRIDE so build-bundle.sh skips the curl path.
#
# 2. mktemp GNU vs macOS incompatibility — when STUDIO_DEV_SIGNING_KEY holds
#    inline JSON, build-bundle.sh runs `mktemp -t studio-dev-key` which is
#    macOS-style and fails on GNU coreutils mktemp (template needs trailing
#    X's). Fix: materialise the inline JSON to a temp file here, using the
#    portable mktemp invocation, and point STUDIO_DEV_SIGNING_KEY at that file.
set -e
cd "$(dirname "$0")"  # ensure we are in logic/

# ── 1. APP_VERSION_OVERRIDE ──────────────────────────────────────────────────
export APP_VERSION_OVERRIDE
APP_VERSION_OVERRIDE="$(node -p "require('../studio.config.json').appVersion")"

# ── 2. Inline signing-key normalisation ──────────────────────────────────────
KEY="${STUDIO_DEV_SIGNING_KEY:-}"
if [[ -n "$KEY" && "${KEY:0:1}" == "{" ]]; then
  # Write inline JSON to a temp file using the portable GNU mktemp syntax.
  KEYFILE="$(mktemp /tmp/studio-dev-keyXXXXXX.json)"
  printf '%s' "$KEY" > "$KEYFILE"
  export STUDIO_DEV_SIGNING_KEY="$KEYFILE"
fi

exec bash build-bundle.sh "$@"
