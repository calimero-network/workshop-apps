#!/bin/bash
# Build the multi-service .mpk bundle from `studio.config.json`.
#
# Modes:
#   (default)   dev signing via `mero-sign sign --dev`. The auth-frontend's
#               local-app bypass kicks in for did:key:z6MknF…2B3eZQd, so the
#               bundle installs without hitting the public registry. Re-runs
#               with the same appVersion are intentional — you reinstall via
#               `install-dev-application` on each iteration.
#   --release   prod signing. Requires:
#                 - MERO_SIGN_KEY env var pointing to the prod signing key
#                 - studio.config.json appVersion bumped vs the previously
#                   published version (the registry rejects duplicates)
#
# Reads `../studio.config.json` for: appVersion, package, metadata, services.
# Service entries provide { id, name, crate } — `name` becomes both the
# manifest service name and the bundled wasm filename, `crate` is the Cargo
# package name (used to locate the wasm cargo emits as <crate_with_underscores>.wasm).

set -e
cd "$(dirname $0)"

if ! command -v jq > /dev/null; then
  echo "Error: jq is required (brew install jq / apt-get install jq)" >&2
  exit 1
fi

CONFIG="../studio.config.json"
if [[ ! -f "$CONFIG" ]]; then
  echo "Error: $CONFIG not found" >&2
  exit 1
fi

MODE="dev"
if [[ "${1:-}" == "--release" ]]; then
  MODE="release"
fi

APP_NAME=$(jq -r '.appName' "$CONFIG")
APP_VERSION=$(jq -r '.appVersion' "$CONFIG")
APP_PACKAGE=$(jq -r '.package' "$CONFIG")
APP_DISPLAY=$(jq -r '.metadata.name' "$CONFIG")
APP_DESC=$(jq -r '.metadata.description' "$CONFIG")
SERVICES_JSON=$(jq -c '.services' "$CONFIG")
SERVICE_COUNT=$(echo "$SERVICES_JSON" | jq 'length')

echo "Building $APP_DISPLAY ($APP_PACKAGE@$APP_VERSION) in $MODE mode — $SERVICE_COUNT services"

# Build each service via its build.sh — those scripts read the crate name
# from the matching service entry and copy the wasm into crates/<name>/res/<name>.wasm.
for i in $(seq 0 $((SERVICE_COUNT - 1))); do
  SVC_NAME=$(echo "$SERVICES_JSON" | jq -r ".[$i].name")
  SVC_CRATE=$(echo "$SERVICES_JSON" | jq -r ".[$i].crate")
  echo "Building $SVC_NAME service ($SVC_CRATE)..."
  (cd "crates/$SVC_NAME" && SVC_CRATE="$SVC_CRATE" SVC_NAME="$SVC_NAME" bash build.sh)
done

# Gather artifacts into bundle-temp.
mkdir -p res/bundle-temp
rm -f res/bundle-temp/*.wasm res/bundle-temp/*.json

SERVICE_ENTRIES=""
TAR_FILES="manifest.json"
for i in $(seq 0 $((SERVICE_COUNT - 1))); do
  SVC_NAME=$(echo "$SERVICES_JSON" | jq -r ".[$i].name")
  WASM_SRC="crates/$SVC_NAME/res/$SVC_NAME.wasm"
  ABI_SRC="crates/$SVC_NAME/res/abi.json"

  cp "$WASM_SRC" "res/bundle-temp/$SVC_NAME.wasm"
  ABI_BUNDLE_NAME="$SVC_NAME-abi.json"
  cp "$ABI_SRC" "res/bundle-temp/$ABI_BUNDLE_NAME" 2>/dev/null || true

  WASM_SIZE=$(stat -f%z "$WASM_SRC" 2>/dev/null || stat -c%s "$WASM_SRC")
  ABI_SIZE=$(stat -f%z "$ABI_SRC" 2>/dev/null || stat -c%s "$ABI_SRC" 2>/dev/null || echo 0)

  ENTRY=$(jq -nc \
    --arg name "$SVC_NAME" \
    --arg wasm "$SVC_NAME.wasm" \
    --argjson wsize "$WASM_SIZE" \
    --arg abi "$ABI_BUNDLE_NAME" \
    --argjson asize "$ABI_SIZE" \
    '{name:$name, wasm:{path:$wasm,size:$wsize,hash:null}, abi:{path:$abi,size:$asize,hash:null}}')

  if [[ -z "$SERVICE_ENTRIES" ]]; then
    SERVICE_ENTRIES="$ENTRY"
  else
    SERVICE_ENTRIES="$SERVICE_ENTRIES,$ENTRY"
  fi
  TAR_FILES="$TAR_FILES $SVC_NAME.wasm $ABI_BUNDLE_NAME"
done

# Compose bundle manifest.json.
jq -n \
  --arg version "1.0" \
  --arg pkg "$APP_PACKAGE" \
  --arg appVersion "$APP_VERSION" \
  --arg minRuntime "0.1.0" \
  --arg name "$APP_DISPLAY" \
  --arg desc "$APP_DESC" \
  --argjson services "[$SERVICE_ENTRIES]" \
  '{version:$version, package:$pkg, appVersion:$appVersion, minRuntimeVersion:$minRuntime,
    metadata:{name:$name, description:$desc},
    services:$services, migrations:[],
    links:{frontend:"http://localhost:5173/"}}' \
  > res/bundle-temp/manifest.json

# Sign per mode.
if [[ "$MODE" == "release" ]]; then
  if [[ -z "${MERO_SIGN_KEY:-}" ]]; then
    echo "Error: --release requires MERO_SIGN_KEY pointing to the prod signing key" >&2
    exit 1
  fi
  if ! command -v mero-sign > /dev/null; then
    echo "Error: mero-sign not on PATH (install from calimero-network/core/tools/mero-sign)" >&2
    exit 1
  fi
  mero-sign sign --key "$MERO_SIGN_KEY" res/bundle-temp/manifest.json
else
  if command -v mero-sign > /dev/null; then
    mero-sign sign --dev res/bundle-temp/manifest.json
  else
    echo "Warning: mero-sign not found, bundle will be unsigned (auth-frontend won't bypass)" >&2
  fi
fi

# Tar into the .mpk. Filename uses appName (clean) — package is in the manifest.
cd res/bundle-temp
tar -czf "../$APP_NAME-$APP_VERSION.mpk" $TAR_FILES

cd ..
echo "Bundle created: res/$APP_NAME-$APP_VERSION.mpk"
