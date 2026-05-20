#!/bin/bash
# Assert the @formepdf/core tarball ships every file the package's own
# entry points import. Catches the failure mode that shipped in 0.10.0
# — wasm-pack writes a `.gitignore` containing `*` inside each output
# dir, and `npm publish` silently drops the directory contents. The
# `build:wasm` script removes those gitignores, but if a future change
# adds a new pkg-* dir and forgets to add the matching `rm`, this
# script fails loudly during `npm publish` (it's wired up via
# `prepublishOnly`).
#
# Also runs as part of CI so we catch the regression at PR time, not
# release time.
set -euo pipefail

cd "$(dirname "$0")/.."

# npm pack writes <name>-<version>.tgz to cwd. Capture the name.
TARBALL=$(npm pack --silent)
trap 'rm -f "$TARBALL"' EXIT

# Read the tarball's file list once.
FILES=$(tar -tzf "$TARBALL")

REQUIRED=(
  package/dist/index.js
  package/dist/browser.js
  package/dist/worker.js
  package/pkg/forme.js
  package/pkg/forme_bg.js
  package/pkg/forme_bg.wasm
  package/pkg-web/forme.js
  package/pkg-web/forme_bg.wasm
  package/pkg-node/forme.js
  package/pkg-node/forme_bg.wasm
  package/package.json
)

missing=0
for f in "${REQUIRED[@]}"; do
  if ! printf '%s\n' "$FILES" | grep -qx "$f"; then
    echo "MISSING from tarball: $f"
    missing=1
  fi
done

# Stray .gitignore inside any published pkg dir means wasm-pack's output
# slipped through — exactly the 0.10.0 regression.
if printf '%s\n' "$FILES" | grep -E '/pkg(-web|-node)?/\.gitignore$' >/dev/null; then
  echo "Stray .gitignore inside a published pkg* dir — npm publish will drop directory contents. Add it to the build:wasm cleanup step."
  printf '%s\n' "$FILES" | grep -E '/pkg(-web|-node)?/\.gitignore$' >&2
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  echo
  echo "Tarball is missing files. Refusing to publish."
  exit 1
fi

echo "OK: tarball has all required files and no stray .gitignore files."
