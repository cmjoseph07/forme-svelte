#!/bin/bash
# Build the WASM engine twice — once for bundler-aware consumers
# (Webpack, Turbopack, Vite, esbuild, Wrangler) and once for Node.js
# SSR. The bundler target ships split forme.js / forme_bg.js / .wasm
# so direct `.wasm` imports resolve cleanly; the nodejs target ships
# a self-initializing CJS module Node can require directly via fs.
set -e
cd "$(dirname "$0")/../../engine"
wasm-pack build --target bundler --out-dir ../packages/core/pkg --features wasm
wasm-pack build --target nodejs --out-dir ../packages/core/pkg-node --features wasm
