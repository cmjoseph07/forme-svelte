#!/usr/bin/env bash
set -euo pipefail

VERSION="0.8.3"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${GREEN}=== $1 ===${NC}\n"; }
warn() { echo -e "${YELLOW}$1${NC}"; }
fail() { echo -e "${RED}$1${NC}"; exit 1; }
confirm() {
  read -r -p "$1 [y/N] " response
  [[ "$response" =~ ^[Yy]$ ]] || { echo "Skipped."; return 1; }
}

# ─── 1. Push to origin ───────────────────────────────────────────────
step "1/8 Push to origin"
echo "Current branch: $(git branch --show-current)"
echo "Commits ahead of origin:"
git log --oneline origin/main..HEAD
echo ""
if confirm "Push to origin/main?"; then
  git push origin main
fi

# ─── 2. npm publish ──────────────────────────────────────────────────
step "2/8 npm publish (11 packages)"

NPM_PACKAGES=(
  react core renderer cli
  hono next resend mcp
  sdk tailwind templates
)

for pkg in "${NPM_PACKAGES[@]}"; do
  dir="packages/$pkg"
  current=$(node -p "require('./$dir/package.json').version")
  echo -e "  ${GREEN}$dir${NC} → v$current"
done

echo ""
if confirm "Publish all 11 packages to npm?"; then
  for pkg in "${NPM_PACKAGES[@]}"; do
    echo -e "\n  Publishing @formepdf/$pkg..."
    (cd "packages/$pkg" && npm publish --access public) || fail "Failed to publish @formepdf/$pkg"
    echo -e "  ${GREEN}✓${NC} @formepdf/$pkg@$VERSION"
  done
fi

# ─── 3. crates.io ────────────────────────────────────────────────────
step "3/8 crates.io (forme-pdf)"

echo "Running dry run first..."
(cd engine && cargo publish --dry-run 2>&1) || fail "Dry run failed"
echo ""
if confirm "Publish forme-pdf@$VERSION to crates.io?"; then
  (cd engine && cargo publish)
fi

# ─── 4. Docker image ─────────────────────────────────────────────────
step "4/8 Docker image (formepdf/forme)"

warn "Requires Docker Desktop running and docker login."
echo "Will build: formepdf/forme:$VERSION + formepdf/forme:latest"
echo "Platforms: linux/amd64, linux/arm64"
echo ""
if confirm "Build and push Docker image?"; then
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --provenance=true \
    --sbom=true \
    -f server/Dockerfile \
    -t "formepdf/forme:$VERSION" \
    -t formepdf/forme:latest \
    --push \
    .
fi

# ─── 5. PyPI ─────────────────────────────────────────────────────────
step "5/8 PyPI (formepdf)"

echo "Cleaning old builds..."
rm -f packages/python-sdk/dist/formepdf-*
echo ""
if confirm "Build and upload formepdf@$VERSION to PyPI?"; then
  (cd packages/python-sdk && python -m build && twine upload "dist/formepdf-$VERSION"*)
fi

# ─── 6. Go SDK ────────────────────────────────────────────────────────
step "6/8 Go SDK (separate repo)"

warn "The Go SDK is a separate git repo at packages/go-sdk/."
warn "You need to manually:"
echo "  cd packages/go-sdk"
echo "  go test ./..."
echo "  git add ."
echo "  git commit -m \"Release v$VERSION\""
echo "  git push origin main"
echo "  git tag v$VERSION"
echo "  git push origin v$VERSION"
echo ""
if confirm "Open a shell in packages/go-sdk?"; then
  echo "Run the commands above, then exit to continue."
  (cd packages/go-sdk && $SHELL) || true
fi

# ─── 7. Git tag ──────────────────────────────────────────────────────
step "7/8 Git tag"

if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  warn "Tag v$VERSION already exists. Skipping."
else
  if confirm "Create and push tag v$VERSION?"; then
    git tag "v$VERSION"
    git push origin "v$VERSION"
  fi
fi

# ─── 8. Post-publish verification ────────────────────────────────────
step "8/8 Post-publish verification"

if confirm "Run verification checks?"; then
  echo ""
  echo "npm packages:"
  TMPDIR=$(mktemp -d)
  (cd "$TMPDIR" && npm init -y --silent && npm install "@formepdf/react@$VERSION" "@formepdf/core@$VERSION" "@formepdf/cli@$VERSION" 2>&1) \
    && echo -e "  ${GREEN}✓${NC} npm install succeeded" \
    || echo -e "  ${RED}✗${NC} npm install failed"
  rm -rf "$TMPDIR"

  echo ""
  echo "Docker image:"
  if docker run --rm -p 3000:3000 -d --name forme-verify "formepdf/forme:$VERSION" >/dev/null 2>&1; then
    sleep 2
    HEALTH=$(curl -sf http://localhost:3000/health 2>/dev/null || echo "FAILED")
    docker stop forme-verify >/dev/null 2>&1
    echo "  Health check: $HEALTH"
  else
    warn "  Docker verification skipped (image not available yet or Docker not running)"
  fi

  echo ""
  echo "crates.io:"
  echo "  Check: https://crates.io/crates/forme-pdf/$VERSION"

  echo ""
  echo "PyPI:"
  echo "  Check: https://pypi.org/project/formepdf/$VERSION/"

  echo ""
  echo "Go:"
  echo "  Check: https://pkg.go.dev/github.com/formepdf/forme-go@v$VERSION"
fi

echo ""
echo -e "${GREEN}Done! 🎉 v$VERSION release complete.${NC}"
