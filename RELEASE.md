# Release Process

## Version Strategy

- Engine (Cargo) + all npm packages share the same version (e.g. 0.9.0)
- Python SDK (`formepdf` on PyPI) follows the same version
- Rust crate (`forme-pdf` on crates.io) follows the same version
- Go SDK (`github.com/formepdf/forme-go`) uses a `v0.9.0` git tag
- VS Code extension has its own independent version (e.g. `0.9.0`) since it publishes to the Marketplace separately
- Docker image (`formepdf/forme`) follows the same version — tagged as `{version}` and `latest`
- Rasterizer Docker image (`formepdf/rasterizer`) follows the same version as the engine (e.g. `0.9.0`)

---

## Build Order

Build order matters. Later packages depend on earlier ones.

```bash
# 1. Engine (Rust) — only if engine/ changed
cd engine
cargo fmt
cargo clippy -- -W clippy::all
cargo test

# 2. React (JSX components, serialize, types)
cd packages/react
npm run build
npm test

# 3. Core (WASM bridge — compiles engine to WebAssembly)
cd packages/core
npm run build    # runs wasm-pack + tsc

# 4. Renderer (shared render pipeline — depends on react + core)
cd packages/renderer
npm run build
npm test

# 5. CLI (dev server + build command — depends on renderer)
cd packages/cli
npm run build

# 6. VS Code extension (depends on renderer)
cd packages/vscode
npm run build    # esbuild bundle + copies WASM + preview HTML

# 7. Integration and utility packages (depend on react + core)
cd packages/hono && npm run build
cd packages/next && npm run build
cd packages/mcp && npm run build
cd packages/resend && npm run build

# 8. Packages with no build step (verify they resolve correctly)
cd packages/sdk && npm run build       # TypeScript hosted API client
cd packages/tailwind && npm run build  # tw() function, Tailwind v3
cd packages/templates && npm run build # shared templates + Zod schemas

# 9. Python SDK — rebuild WASM (only if engine/ changed)
cd packages/python-sdk
bash build_wasm.sh   # builds wasm32-wasip1 target, copies to formepdf/forme.wasm

# 10. Go SDK — rebuild WASM (only if engine/ changed)
# The Go SDK is a separate git repo at packages/go-sdk/
# It uses //go:embed for the WASM binary (gitignored, must be present locally)
cd packages/go-sdk
bash templates/build_wasm.sh   # or copy from engine target:
# cp ../../engine/target/wasm32-wasip1/release/forme.wasm templates/forme.wasm
```

---

## Version Bump Checklist

Files to update when bumping (e.g. 0.8.3 -> 0.9.0):

### npm packages
- [ ] `packages/react/package.json`
- [ ] `packages/core/package.json`
- [ ] `packages/renderer/package.json`
- [ ] `packages/cli/package.json`
- [ ] `packages/hono/package.json`
- [ ] `packages/next/package.json`
- [ ] `packages/resend/package.json`
- [ ] `packages/mcp/package.json`
- [ ] `packages/sdk/package.json`
- [ ] `packages/tailwind/package.json`
- [ ] `packages/templates/package.json`
- [ ] `packages/vscode/package.json` — separate version, bump independently

### Non-npm packages
- [ ] `engine/Cargo.toml` — `version = "0.9.0"`
- [ ] `server/Cargo.toml` — `version = "0.9.0"`
- [ ] `packages/python-sdk/pyproject.toml` — `version = "0.9.0"`
- [ ] `rasterizer/Cargo.toml` — `version = "0.9.0"`
- [ ] Go SDK `packages/go-sdk/` — no version file; versioned by git tag

### SDK WASM binaries (if engine/ changed)
- [ ] `packages/python-sdk/formepdf/forme.wasm` — rebuild via `bash build_wasm.sh`
- [ ] `packages/go-sdk/templates/forme.wasm` — rebuild via `bash templates/build_wasm.sh` or copy from `engine/target/wasm32-wasip1/release/forme.wasm`
- Both use the `wasm32-wasip1` target with `--features wasm-raw` (C-ABI exports for non-JS hosts)
- The Python SDK WASM is gitignored — use `git add -f` to commit it
- The Go SDK WASM is gitignored — use `git add -f` to commit it (separate git repo)

### Cross-package dependency references
Update peer/runtime dependencies that pin to the formepdf packages:
- [ ] `packages/core/package.json` — `@formepdf/react`
- [ ] `packages/renderer/package.json` — `@formepdf/core`, `@formepdf/react`
- [ ] `packages/cli/package.json` — `@formepdf/renderer`
- [ ] `packages/vscode/package.json` — `@formepdf/renderer`
- [ ] `packages/hono/package.json` — `@formepdf/react`, `@formepdf/core`
- [ ] `packages/next/package.json` — `@formepdf/react`, `@formepdf/core`
- [ ] `packages/resend/package.json` — `@formepdf/react`, `@formepdf/core`
- [ ] `packages/mcp/package.json` — `@formepdf/react`, `@formepdf/core`
- [ ] `packages/sdk/package.json` — `@formepdf/react`, `@formepdf/core` if referenced
- [ ] `packages/tailwind/package.json` — `@formepdf/react` if referenced
- [ ] `packages/templates/package.json` — `@formepdf/react`, `@formepdf/core`

### Changelogs
- [ ] `engine/CHANGELOG.md`
- [ ] `server/CHANGELOG.md`
- [ ] `packages/react/CHANGELOG.md`
- [ ] `packages/core/CHANGELOG.md`
- [ ] `packages/renderer/CHANGELOG.md`
- [ ] `packages/cli/CHANGELOG.md`
- [ ] `packages/hono/CHANGELOG.md`
- [ ] `packages/next/CHANGELOG.md`
- [ ] `packages/resend/CHANGELOG.md`
- [ ] `packages/mcp/CHANGELOG.md`
- [ ] `packages/sdk/CHANGELOG.md`
- [ ] `packages/tailwind/CHANGELOG.md`
- [ ] `packages/templates/CHANGELOG.md`
- [ ] `packages/vscode/CHANGELOG.md`

### READMEs (if new components, APIs, or capabilities were added)
- [ ] `README.md` (root) — features list, component table
- [ ] `packages/react/README.md` — component list, usage examples
- [ ] `packages/core/README.md` — API surface, render functions
- [ ] `packages/cli/README.md` — CLI commands, flags

### Docs (if user-facing behavior changed)
- [ ] `docs/` — Mintlify docs at docs.formepdf.com. Update pages affected by the release (e.g. `components.mdx`, `charts.mdx`, `styles.mdx`, `svg.mdx`). New props, changed defaults, and new components all need doc updates.

### Lockfile
- [ ] Run `npm install` from root to update `package-lock.json`

---

## Publish

### npm packages

```bash
cd packages/react && npm publish --access public
cd packages/core && npm publish --access public
cd packages/renderer && npm publish --access public
cd packages/cli && npm publish --access public
cd packages/hono && npm publish --access public
cd packages/next && npm publish --access public
cd packages/resend && npm publish --access public
cd packages/mcp && npm publish --access public
cd packages/sdk && npm publish --access public
cd packages/tailwind && npm publish --access public
cd packages/templates && npm publish --access public
```

### VS Code extension

```bash
cd packages/vscode
npm run package    # creates forme-pdf-{version}.vsix
npx @vscode/vsce publish
```

### PyPI

```bash
cd packages/python-sdk
python -m build
twine upload dist/*
# Requires PyPI API token in ~/.pypirc or TWINE_PASSWORD env var
# Package name: formepdf
# Verify at: https://pypi.org/project/formepdf/
```

### crates.io

```bash
cd engine
cargo publish
# Requires `cargo login` with crates.io token (one-time)
# Crate name: forme-pdf
# Verify at: https://crates.io/crates/forme-pdf
# Note: cargo publish does a dry run check first; add --dry-run to verify before publishing
```

### Docker image

Build and push multi-platform image from the monorepo root:

```bash
# One-time builder setup (if not already done)
docker buildx create --name multiplatform --use
docker buildx inspect --bootstrap

docker login

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --provenance=true \
  --sbom=true \
  -f server/Dockerfile \
  -t formepdf/forme:{version} \
  -t formepdf/forme:latest \
  --push \
  .

# Verify
docker run --rm -p 3000:3000 formepdf/forme:{version}
curl http://localhost:3000/health
```

Note: The Dockerfile requires Rust 1.88+ due to dependencies. Use `rust:latest` in the Dockerfile if the pinned version is too old.

### Rasterizer Docker image

Build and push multi-platform rasterizer image from the monorepo root:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --provenance=true \
  --sbom=true \
  -f rasterizer/Dockerfile \
  -t formepdf/rasterizer:{version} \
  -t formepdf/rasterizer:latest \
  --push \
  .

# Verify
docker run --rm -p 3001:3001 formepdf/rasterizer:{version}
curl http://localhost:3001/health
```

After publishing, update `forme-dashboard/packages/api/Dockerfile` to reference the new tag:
```dockerfile
FROM formepdf/rasterizer:{version} AS rasterizer
```

### Go SDK

The Go SDK is published via git tag — pkg.go.dev indexes it automatically.

```bash
cd packages/go-sdk
# Verify tests pass
go test ./...

# Push to the Go SDK repo
git add .
git commit -m "Release v0.9.0"
git push origin main

# Tag the release (Go modules use the tag as the version)
git tag v0.9.0
git push origin v0.9.0

# pkg.go.dev will index it automatically within ~30 minutes
# Verify at: https://pkg.go.dev/github.com/formepdf/forme-go
```

---

## Git Tag (monorepo)

```bash
git tag v0.9.0
git push origin main
git push origin v0.9.0
```

---

## Post-Publish Verification

Verify the published packages actually work before announcing:

```bash
# npm — fresh install test
mkdir /tmp/test-forme-090 && cd /tmp/test-forme-090
npm init -y
npm install @formepdf/react @formepdf/core @formepdf/cli
# Run a minimal render

# Docker image
docker run --rm -p 3000:3000 formepdf/forme:{version}
curl http://localhost:3000/health
# Should return {"status":"ok","version":"{version}"}

# PyPI
pip install formepdf==0.9.0
python -c "import formepdf; print(formepdf.__version__)"

# crates.io
cargo add forme-pdf@0.9.0
# or check https://crates.io/crates/forme-pdf

# Go
go get github.com/formepdf/forme-go@v0.9.0
# Check https://pkg.go.dev/github.com/formepdf/forme-go@v0.9.0
```

---

## Common Mistakes

- **Stale WASM**: If `engine/` changed, must rebuild `packages/core` (`npm run build`) before anything else. The WASM binary is ~5.1MB (grew from 4.8MB in 0.7.x when signatures were added). **Also rebuild** the Python SDK (`packages/python-sdk/build_wasm.sh`) and Go SDK (`packages/go-sdk/templates/build_wasm.sh`) WASM binaries — these are separate wasm32-wasip1 builds, not the wasm-pack JS build.
- **SDK WASM is gitignored**: Both `packages/python-sdk/formepdf/forme.wasm` and `packages/go-sdk/templates/forme.wasm` are in `.gitignore`. Use `git add -f` to stage them. The Go SDK is a separate git repo — commit and tag there independently.
- **Stale dist/**: Always rebuild `packages/renderer` before VS Code or CLI. A stale `dist/` can silently ship broken code.
- **VS Code copies**: The VS Code esbuild config copies WASM from `packages/core/pkg/` and preview HTML from `packages/renderer/dist/preview/`. These are snapshots — rebuild VS Code after rebuilding core or renderer.
- **Lockfile**: Run `npm install` from root after version bumps to update `package-lock.json`.
- **npm cache**: Can't republish the same version. If you published broken code, bump the version.
- **crates.io is permanent**: Same rule — can't yank and republish the same version. Use `--dry-run` first.
- **Go tag must be on the right repo**: The Go SDK is at `github.com/formepdf/forme-go`, not the monorepo. Tag there, not in the monorepo.
- **Docker Rust version**: The server Dockerfile requires Rust 1.88+ due to dependencies. If the pinned version errors, check the current minimum required version and update `FROM rust:X.XX-bookworm` accordingly. Using `rust:latest` is a safe fallback.
- **Docker buildx context**: Run the buildx build from the monorepo root (`forme/`), not from `server/`. The Dockerfile copies both `engine/` and `server/` directories.
- **PyPI stale dist/**: `twine upload dist/*` uploads everything in `dist/`, including old versions. Clean old builds first (`rm dist/formepdf-0.*.whl dist/formepdf-0.*.tar.gz`) or upload only the target version (`twine upload dist/formepdf-{version}*`).
- **PyPI token scope**: Make sure the PyPI token has upload rights for the `formepdf` project specifically (project-scoped token), not just your account.
- **Rasterizer version in dashboard Dockerfile**: After publishing a new `formepdf/rasterizer` tag, update the `FROM formepdf/rasterizer:{version}` line in `forme-dashboard/packages/api/Dockerfile`. Otherwise the dashboard will use the old rasterizer.
