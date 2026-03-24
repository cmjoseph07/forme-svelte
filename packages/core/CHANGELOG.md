# Changelog

## [0.7.12] - 2026-03-24

### Fixed
- Added `worker`, `edge-light`, `deno`, `react-native`, and `browser` conditional exports so edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy, Netlify Edge, React Native/Expo) automatically resolve to the browser entry point — no manual `@formepdf/core/browser` import needed

## [0.7.11] - 2026-03-23

_Dependency bump only._

## [0.7.9] - 2026-03-17

### Changed
- Rebuilt WASM with barcode support and wasm-raw C-ABI exports

## [0.7.8] - 2026-03-17

### Added
- Barcode support in WASM engine (Code 128, Code 39, EAN-13, EAN-8, Codabar)

## [0.7.7] - 2026-03-16

### Added
- Browser entry point (`@formepdf/core/browser`) for client-side PDF generation
- `init()` function to pre-load WASM or provide a custom URL/bytes
- Browser-native `extractData()` using DecompressionStream (no node:zlib)

## [0.7.6] - 2026-03-13

### Added
- `renderDocument(el, { embedData })` option to attach JSON as a PDF file attachment
- `extractData(pdfBytes)` to read embedded JSON back from Forme-generated PDFs

## [0.7.3] - 2026-03-07

_No changes._

## [0.7.2] - 2026-03-07

### Fixed
- Rebuilt WASM with bundled Noto Sans fonts (0.7.1 published without them)

## [0.7.1] - 2026-03-07

_No changes._

## [0.7.0] - 2026-03-06

_No changes._

## [0.6.2] - 2026-02-21

_No changes._

## [0.6.1] - 2026-02-14

_No changes._

## [0.6.0] - 2026-02-07

### Added
- `renderTemplate()` and `renderTemplateWithLayout()` WASM bindings
- Font source resolution (file paths, data URIs, Uint8Array to base64)

## [0.4.2] - 2025-12-27

### Added
- Resolve HTTP/HTTPS image URLs to base64 data URIs before WASM render

## [0.4.1] - 2025-12-20

### Fixed
- Expose `pkg/` in exports map for browser consumers

## [0.4.0] - 2025-12-13

### Added
- `resolveFonts()` for base64 font encoding before WASM calls

## [0.1.0 - 0.3.0] - Pre-releases

### Added
- WASM bridge: `renderDocument()`, `renderWithLayout()` JS API
- `wasm-pack` build pipeline with `wasm-opt`

### Changed
- Package scope renamed from `@forme/core` to `@formepdf/core`
