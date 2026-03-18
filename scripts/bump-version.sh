#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: ./scripts/bump-version.sh <version>"
  echo "Example: ./scripts/bump-version.sh 0.8.0"
  exit 1
fi

VERSION="$1"

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: '$VERSION' is not a valid semver version"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Bumping all packages to $VERSION"
echo ""

# ── Rust engine ──────────────────────────────────────────────
echo "  engine/Cargo.toml"
sed -i '' -E "1,/^version = \"[^\"]+\"/s/^version = \"[^\"]+\"/version = \"$VERSION\"/" "$ROOT/engine/Cargo.toml"

# Regenerate Cargo.lock
(cd "$ROOT/engine" && cargo check --quiet 2>/dev/null)

# ── Python SDK (versioned independently — bump manually) ─────

# ── NPM packages (version + interdependencies) ──────────────
NPM_PACKAGES=(react core cli renderer hono next resend mcp sdk tailwind)
for pkg in "${NPM_PACKAGES[@]}"; do
  pkgfile="$ROOT/packages/$pkg/package.json"
  [ -f "$pkgfile" ] || continue

  echo "  packages/$pkg/package.json"
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    p.version = process.argv[2];
    const internalPrefixes = ['@formepdf/'];
    for (const section of ['dependencies', 'devDependencies']) {
      if (!p[section]) continue;
      for (const [dep, ver] of Object.entries(p[section])) {
        if (internalPrefixes.some(pfx => dep.startsWith(pfx)) && !ver.startsWith('^')) {
          p[section][dep] = process.argv[2];
        }
      }
    }
    fs.writeFileSync(process.argv[1], JSON.stringify(p, null, 2) + '\n');
  " "$pkgfile" "$VERSION"
done

# ── VS Code extension (dep only, version managed separately) ─
VSCODE_PKG="$ROOT/packages/vscode/package.json"
if [ -f "$VSCODE_PKG" ]; then
  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync(process.argv[1], 'utf8');
    const updated = raw.replace(/\"@formepdf\/renderer\": \"[^\"]+\"/, '\"@formepdf/renderer\": \"' + process.argv[2] + '\"');
    if (updated !== raw) {
      fs.writeFileSync(process.argv[1], updated);
      console.log('  packages/vscode/package.json: updated renderer dep');
    }
  " "$VSCODE_PKG" "$VERSION"
fi

echo ""
echo "Done. All packages at $VERSION (vscode version unchanged, dep updated)"
echo ""
echo "Next steps:"
echo "  1. Update changelogs"
echo "  2. git add -A && git commit -m 'Bump all packages to $VERSION'"
echo "  3. git tag v$VERSION"
