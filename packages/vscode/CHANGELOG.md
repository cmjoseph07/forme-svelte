# Changelog

## [0.10.0] - 2026-05-19

_Dependency bump only._


## [0.9.2] - 2026-04-28

_Version bump only._

## [0.9.1] - 2026-04-06

_Dependency bump only._

## [0.9.0] - 2026-04-04

_Dependency bump only._

## [0.8.2] - 2026-03-30

_Dependency bump only._

## [0.8.1] - 2026-03-30

### Changed
- Version bump to match engine 0.8.1

## [0.7.11] - 2026-03-24

### Fixed
- Fix React instance mismatch when previewing templates from external projects (e.g. Next.js apps with their own `node_modules/react`)

## [0.7.10] - 2026-03-24

### Fixed
- Clear error message when a template exports a function but no companion data file is found (instead of crashing with "Cannot read properties of undefined")

### Changed
- Updated `@formepdf/renderer` to 0.7.12

## [0.7.9] - 2026-03-17

### Changed
- Updated `@formepdf/renderer` to 0.7.8 (barcode support)

## [0.7.8] - 2026-03-16

### Changed
- Single preview panel that follows the active editor instead of one panel per file
- Auto-open now switches the existing panel to the new file without stealing focus

### Fixed
- Stale inspector/tree selection cleared immediately on file switch

## [0.7.7] - 2026-03-13

### Changed
- Two-way data sync between Data tab and companion JSON file

## [0.7.6] - 2026-03-08

### Fixed
- Bookmark link navigation displacing the PDF view in VS Code (inspector margin applied in VS Code mode)

## [0.7.5] - 2026-03-07

### Added
- Download PDF button in preview toolbar (saves to workspace root)
- Two-row toolbar layout to prevent clipping on narrow panels

### Fixed
- Local image paths now resolve correctly (stale renderer build in 0.7.4)

### Changed
- Copy Style button moved from bottom of inspector to header for immediate visibility

## [0.7.4] - 2026-03-07

### Changed
- Replaced static screenshot with animated demo gif in README
- Renamed "Components" tab to "Tree" in sidebar webview

## [0.7.3] - 2026-03-07

### Fixed
- Commands ("Forme: Preview", "Forme: Preview to Side") not found until a .tsx file was opened
- VSIX packaging: esbuild-wasm now correctly included (was installing native esbuild instead)
- Rebuilt WASM with bundled Noto Sans fonts for builtin Unicode support

## [0.7.2] - 2026-03-07

### Added
- Data tab in sidebar - edit companion JSON data and see the preview update live
- Live preview updates as you type (uses editor buffer, no longer requires save)
- Local image file paths in templates now resolve to base64 data URIs

### Fixed
- Cross-platform VSIX support: switched from platform-specific esbuild to esbuild-wasm

### Changed
- Improved README: added requirements, quick start with example, use cases, comparisons, and React rationale

## [0.7.1] - 2026-03-06

### Fixed
- Component tree showing "No layout data" on marketplace installs (webview ready handshake)
- Preview panel stealing focus when clicking back into the TSX editor with auto-open enabled

## [0.7.0] - 2026-03-06

### Added
- Initial release: VS Code extension for Forme PDF preview
- Native sidebar component tree with hover-to-highlight
- Native sidebar inspector panel (box model, computed styles, Open in Editor, Copy Style)
- Forme activity bar icon
- `forme.autoOpen` setting for auto-preview on file open
- Marketplace icon and improved discoverability (keywords, description)

### Changed
- Shorter command titles ("Forme: Preview", "Forme: Preview to Side")
