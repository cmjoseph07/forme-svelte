#!/usr/bin/env bash
# Build the Forme engine as a WASI WASM module for use with Python wasmtime.
# Output: formepdf/forme.wasm
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENGINE_DIR="$SCRIPT_DIR/../../engine"

echo "Building Forme WASM (wasm32-wasip1, release)..."
cargo build \
  --manifest-path "$ENGINE_DIR/Cargo.toml" \
  --lib \
  --target wasm32-wasip1 \
  --release \
  --features wasm-raw

WASM_SRC="$ENGINE_DIR/target/wasm32-wasip1/release/forme.wasm"
WASM_DST="$SCRIPT_DIR/formepdf/forme.wasm"

cp "$WASM_SRC" "$WASM_DST"
echo "Copied to $WASM_DST ($(du -h "$WASM_DST" | cut -f1))"
