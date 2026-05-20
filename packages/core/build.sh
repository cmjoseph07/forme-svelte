#!/bin/bash
# Build the WASM engine for three consumer shapes:
#
#   pkg/      — wasm-pack --target bundler — Vite, Webpack, Turbopack,
#               esbuild. Ships split forme.js + forme_bg.js + .wasm;
#               bundler instantiates implicitly at module load.
#   pkg-web/  — wasm-pack --target web     — Cloudflare Workers and
#               other edge runtimes whose WASM-as-ESM contract returns
#               `{ default: WebAssembly.Module }`. Driven by an
#               explicit init(module) call from dist/worker.js.
#   pkg-node/ — wasm-pack --target nodejs  — Node SSR via dist/index.js.
#               Self-initializes via fs.readFileSync at require time.
set -e
cd "$(dirname "$0")/../../engine"
wasm-pack build --target bundler --out-dir ../packages/core/pkg      --features wasm
wasm-pack build --target web     --out-dir ../packages/core/pkg-web  --features wasm
wasm-pack build --target nodejs  --out-dir ../packages/core/pkg-node --features wasm
