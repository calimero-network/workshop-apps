#!/bin/bash
# Install `cargo-mero` - the Calimero app toolchain that compiles the WASM,
# emits + embeds the ABI, and signs bundle manifests.
#
# The version is derived from the app's own calimero-sdk tag, so the toolchain,
# the SDK and the merod that installs the bundle are all one release.
set -euo pipefail

# The oldest release that ships a cargo-mero asset. This is settled history, not
# a mirror of the SDK pin: an app pinned before it still needs a toolchain, and
# that is the oldest one there is. cargoMeroFloor.test.js holds it at or below
# the template's tag, so the fallback never installs a newer tool than the SDK.
FLOOR_VERSION="0.11.0-rc.19"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CARGO_TOML="${CARGO_MERO_CARGO_TOML:-$SCRIPT_DIR/../logic/Cargo.toml}"
BIN_DIR="${CARGO_MERO_BIN_DIR:-$HOME/.local/bin}"

VERSION="${CARGO_MERO_VERSION:-}"
if [[ -z "$VERSION" && -f "$CARGO_TOML" ]]; then
  VERSION="$(sed -nE 's/.*calimero-sdk.*tag *= *"([^"]+)".*/\1/p' "$CARGO_TOML" | head -1)"
fi
VERSION="${VERSION:-$FLOOR_VERSION}"

STAMP="$BIN_DIR/.cargo-mero-version"
if [[ -x "$BIN_DIR/cargo-mero" && "$(cat "$STAMP" 2>/dev/null || true)" == "$VERSION" ]]; then
  echo "cargo-mero $VERSION already installed at $BIN_DIR/cargo-mero"
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)              ASSET="cargo-mero_x86_64-unknown-linux-gnu.tar.gz" ;;
  Linux-aarch64|Linux-arm64) ASSET="cargo-mero_aarch64-unknown-linux-gnu.tar.gz" ;;
  Darwin-arm64)              ASSET="cargo-mero_aarch64-apple-darwin.tar.gz" ;;
  *)                         ASSET="" ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$BIN_DIR"

# Set when a digest could not be looked up, so the caller stops trying prebuilt
# assets (the next one fails the same way) and goes straight to the source build.
UNVERIFIABLE=0

sha256_of() {
  if command -v shasum > /dev/null; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

# The digest GitHub computed for the stored asset. This catches a truncated,
# corrupted or swapped download; it cannot vouch for a compromised release,
# which needs signed artifacts upstream.
expected_digest() {
  command -v jq > /dev/null || return 1
  # Array, not a bare ${VAR:+...}: the header value has a space in it and would
  # word-split into three arguments.
  local auth=() out
  [[ -n "${GITHUB_TOKEN:-}" ]] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")
  # Retried: a single anonymous call is rate-limited often enough that one
  # failure would otherwise decide whether the binary gets verified.
  for delay in 0 2 5; do
    [[ "$delay" -gt 0 ]] && sleep "$delay"
    out="$(curl -fsSL ${auth[@]+"${auth[@]}"} \
      "https://api.github.com/repos/calimero-network/core/releases/tags/$1" 2>/dev/null \
      | jq -r --arg a "$ASSET" '.assets[] | select(.name == $a) | .digest // empty' \
      | sed 's/^sha256://')" || true
    if [[ -n "$out" ]]; then printf '%s' "$out"; return 0; fi
  done
  return 1
}

# The immutable commit a release tag currently points at. An annotated tag also
# lists its own object, so prefer the dereferenced `^{}` line over ref order.
tag_commit() {
  local refs
  refs="$(git ls-remote https://github.com/calimero-network/core \
            "refs/tags/$1^{}" "refs/tags/$1" 2>/dev/null)" || return 1
  { grep '\^{}$' <<< "$refs" || grep . <<< "$refs"; } | head -1 | cut -f1
}

fetch() {
  [[ -n "$ASSET" ]] || return 1
  curl -fsSL "https://github.com/calimero-network/core/releases/download/$1/$ASSET" \
    -o "$TMP/cargo-mero.tgz" 2>/dev/null || return 1

  local want actual
  want="$(expected_digest "$1" || true)"
  if [[ -z "$want" ]]; then
    if [[ "${CARGO_MERO_ALLOW_UNVERIFIED:-}" == "1" ]]; then
      echo "warning: installing $ASSET WITHOUT integrity verification (CARGO_MERO_ALLOW_UNVERIFIED=1)" >&2
      return 0
    fi
    # No digest means no prebuilt install, but this is a lookup failure rather
    # than evidence of tampering, so the caller still gets to fall through to
    # the source build - which is pinned to a commit and verifiable on its own.
    echo "warning: no published digest for $ASSET at $1 - refusing the prebuilt binary" >&2
    UNVERIFIABLE=1
    return 1
  fi
  actual="$(sha256_of "$TMP/cargo-mero.tgz")"
  if [[ "$actual" != "$want" ]]; then
    # A published digest that does not match the bytes is tampering, not a
    # transient failure. Stop rather than reaching for another asset.
    echo "Error: $ASSET failed its integrity check at $1" >&2
    echo "  expected $want" >&2
    echo "  actual   $actual" >&2
    exit 1
  fi
  echo "verified $ASSET (sha256 $actual)"
}

RESOLVED="$VERSION"
if ! fetch "$VERSION"; then
  if [[ "$UNVERIFIABLE" == "0" && "$VERSION" != "$FLOOR_VERSION" ]] && fetch "$FLOOR_VERSION"; then
    RESOLVED="$FLOOR_VERSION"
    echo "no cargo-mero asset for $VERSION - using $FLOOR_VERSION"
  else
    # No prebuilt asset for this platform (Intel macOS ships none), or none that
    # could be verified - compile it instead.
    if [[ "$UNVERIFIABLE" == "1" ]]; then
      echo "could not verify a prebuilt cargo-mero - building from source instead" >&2
      echo "  set GITHUB_TOKEN to lift the anonymous API rate limit and use the verified binary" >&2
    fi
    echo "building cargo-mero from source for $(uname -s)-$(uname -m)"
    # Build the commit the tag points at, not the tag: a tag is mutable, so
    # `--tag` can silently resolve to different source on a later run.
    rev="$(tag_commit "$FLOOR_VERSION" || true)"
    if [[ -n "$rev" ]]; then
      echo "building cargo-mero from $FLOOR_VERSION ($rev)"
      cargo install --git https://github.com/calimero-network/core --rev "$rev" \
        --root "$TMP/cargo" cargo-mero
    else
      echo "warning: could not resolve $FLOOR_VERSION to a commit - building from the mutable tag" >&2
      cargo install --git https://github.com/calimero-network/core --tag "$FLOOR_VERSION" \
        --root "$TMP/cargo" cargo-mero
    fi
    install -m 0755 "$TMP/cargo/bin/cargo-mero" "$BIN_DIR/cargo-mero"
    printf '%s' "$FLOOR_VERSION" > "$STAMP"
    echo "cargo-mero installed at $BIN_DIR/cargo-mero"
    exit 0
  fi
fi

tar -xzf "$TMP/cargo-mero.tgz" -C "$TMP"
install -m 0755 "$(find "$TMP" -type f -name cargo-mero | head -1)" "$BIN_DIR/cargo-mero"
printf '%s' "$RESOLVED" > "$STAMP"
echo "cargo-mero $RESOLVED installed at $BIN_DIR/cargo-mero"
