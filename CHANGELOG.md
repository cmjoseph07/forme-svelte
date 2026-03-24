# Changelog

All notable changes to the Forme monorepo are documented in this file.

## [0.7.12] - 2026-03-24

### Fixed
- **Edge runtime support in `@formepdf/core`**: Added `worker`, `edge-light`, `deno`, `react-native`, and `browser` conditional exports so `import { renderDocument } from '@formepdf/core'` automatically resolves to the browser entry point in Cloudflare Workers, Vercel Edge, Deno Deploy, Netlify Edge, Astro edge routes, React Native/Expo, and other non-Node runtimes ([#1](https://github.com/danmolitor/forme/issues/1))

## [0.7.11] - 2026-03-23

### Added
- `@formepdf/templates`: New shared package for built-in PDF templates and Zod schemas
- Templates use `<QrCode>` for shipping label tracking (replaces fake barcode rectangles)
- `@formepdf/templates/schemas` sub-export for Zod schemas with descriptions, fields, and examples
- Root `templates/letter.tsx` demo for `forme dev`

### Fixed
- **Cloudflare Workers crash**: `@formepdf/hono` and `@formepdf/next` now detect edge runtimes via `import.meta.url` instead of `process.versions.node`, fixing `TypeError: The "path" argument must be of type string` when `nodejs_compat` is enabled ([#1](https://github.com/danmolitor/forme/issues/1))

### Changed
- `@formepdf/hono`, `@formepdf/next`, `@formepdf/resend`, `@formepdf/mcp` now import templates from `@formepdf/templates` (single source of truth)

## [0.7.10] - 2026-03-18

### Added
- Auto margin support (`margin-left: auto`, `margin-right: auto`) for horizontal centering — enables `mx-auto` in Tailwind
- Engine: `EdgeValue` enum (`Pt` / `Auto`) and `MarginEdges` struct with auto detection and resolution
- Layout: auto margin resolution in flex row cross-axis and column cross-axis (priority over `align-items`)
- Integration tests for auto margin centering, push-right, and JSON deserialization
- `@formepdf/tailwind`: `mx-auto`, `my-auto`, `mt-auto`, `mr-auto`, `mb-auto`, `ml-auto` support
- Added `@formepdf/tailwind` to the version bump script

### Fixed
- `@formepdf/tailwind` `FormeStyle` type compatibility with `@formepdf/react` `Style` (narrowed `fontWeight`, added `oblique`/`wrap-reverse`, widened `minWidth`/`maxWidth` to accept strings)
- Python SDK `_expand_margin_edges()` preserves `"auto"` string values

## [0.7.9] - 2026-03-17

### Added
- `@formepdf/tailwind` package: style Forme components with Tailwind CSS utility classes (`tw("p-4 text-lg font-bold")`)
- Full Tailwind class coverage: spacing, typography, colors (all shades), layout, flexbox, grid, borders, opacity, negative values, arbitrary bracket values, `self-*` alignment

### Changed
- Rebuilt WASM binary with barcode and Python SDK (wasm-raw) support

## [0.7.8] - 2026-03-17

### Added
- `<Barcode>` component: 1D barcodes (Code 128, Code 39, EAN-13, EAN-8, Codabar) rendered as native PDF vector rectangles
- Python SDK: local rendering via wasmtime with component DSL (`Document`, `Page`, `View`, `Text`, `Image`, `Table`, `QrCode`, `Barcode`, etc.)
- Python SDK: `pip install formepdf[local]` optional dependency for self-hosted PDF generation

## [0.7.7] - 2026-03-16

### Added
- `@formepdf/core`: Browser entry point (`@formepdf/core/browser`) for client-side PDF generation — no Node.js required
- VS Code 0.7.8: Single preview panel that follows the active editor

## [0.7.6] - 2026-03-13

### Added
- Embedded data support: attach JSON to PDFs as file attachments via `renderDocument(el, { embedData })`
- `extractData(pdfBytes)` to read embedded JSON back from Forme-generated PDFs
- `@formepdf/mcp`: `extract_pdf` tool for round-trip data extraction
- `@formepdf/mcp`: `render_pdf` now auto-embeds template data

### Changed
- VS Code: two-way data sync between Data tab and companion JSON file

## [0.7.5] - 2026-03-12

### Removed
- `@formepdf/mcp`: Output path restriction — absolute paths now work

## [0.7.4] - 2026-03-11

### Added
- `@formepdf/mcp`: Theme customization for all templates (accent color, font family, margins)
- `@formepdf/mcp`: Logo/image support for invoice and letter templates
- `@formepdf/mcp`: Watermark parameter on `render_pdf` tool
- `@formepdf/mcp`: MCP prompts for guided PDF generation
- `@formepdf/mcp`: More components available in `render_custom_pdf` (Watermark, QrCode, charts, Canvas)

### Fixed
- `@formepdf/mcp`: Dynamic version from package.json (was hardcoded to 0.4.4)
- `@formepdf/mcp`: Code sandbox for custom JSX evaluation (security)
- `@formepdf/mcp`: Rendering timeout, improved error messages

## [0.7.1] - 2026-03-07

### Added
- Builtin Noto Sans font (Regular + Bold) for automatic non-Latin text support (Cyrillic, Greek, etc.)
- `<Document style>` prop for global default styles (fontFamily, fontSize, color, etc.)
- `Canvas` `line(x1, y1, x2, y2)` convenience method

### Changed
- Single-font text now automatically falls back to builtin Noto Sans when characters are missing
- Image component JSDoc updated with concrete path examples

## [0.7.0] - 2026-03-06

### Added
- `@formepdf/renderer` package for shared render pipeline (VS Code and future integrations)
- VS Code extension with native sidebar component tree, inspector panel, and hover-to-highlight
- VS Code extension activity bar icon and `forme.autoOpen` setting
- VS Code extension marketplace icon and improved discoverability

### Changed
- Shorter VS Code command titles ("Forme: Preview", "Forme: Preview to Side")

### Fixed
- CI: skip Arabic font fallback test when system font unavailable

## [0.6.2] - 2026-02-21

### Added
- Per-character font fallback for Arabic and CJK scripts
- `overflow: hidden` via PDF clip paths
- Canvas drawing primitive (`<Canvas>` component)
- Chart components: `<BarChart>`, `<LineChart>`, `<PieChart>`
- Watermarks with rotation and opacity
- SVG arc (`A`/`a`) path commands
- Justified text via PDF `Tw` operator
- PDF standard font `/Widths` arrays
- `lineBreaking` toggle
- Chart legend flex-wrap

### Fixed
- Cross-axis stretch propagation for flex layout
- Font weight fallback (opposite weight resolution)
- Shaping cluster byte-to-char conversion for multi-byte characters

## [0.6.1] - 2026-02-14

### Added
- Canvas clipping and arc counterclockwise parameter
- PDF bytes option for `sendPdf` in `@formepdf/resend`

## [0.6.0] - 2026-02-07

### Added
- `@formepdf/mcp` package for AI-powered PDF generation via MCP
- `@formepdf/resend` package for PDF + email via Resend
- `@formepdf/next` package for Next.js App Router route handlers
- `@formepdf/hono` package for Hono middleware (Workers, Deno, Bun, Node)
- CSS shorthands for border, padding, and margin (string and array formats)
- Alt text for images and SVGs
- Document language (`<Document lang="...">`)
- Clickable images and SVGs via `href` prop
- Knuth-Plass optimal line breaking
- UAX#14 Unicode line breaking
- Multi-language hyphenation via hypher (35+ languages)
- Tagged PDF / PDF/A-2a compliance
- Visual regression tests
- OpenType shaping via rustybuzz
- BiDi text support (unicode-bidi + unicode-script)
- CSS Grid layout (track sizing, auto/explicit placement)
- `repeat()` syntax for grid templates
- `textOverflow` (ellipsis/clip)
- Font fallback chains (comma-separated `fontFamily`)
- QR code generation with vector PDF rendering

## [0.4.4] - 2026-01-10

### Changed
- Version bump across packages

## [0.4.3] - 2026-01-03

### Fixed
- Keyboard shortcuts intercepting input in custom size fields
- Shipping label font and layout adjustments

## [0.4.2] - 2025-12-27

### Added
- Resolve HTTP/HTTPS image URLs to base64 data URIs before WASM render

## [0.4.1] - 2025-12-20

### Fixed
- Expose `pkg/` in `@formepdf/core` exports map for browser consumers

## [0.4.0] - 2025-12-13

### Added
- Template expression system for hosted API rendering
- Custom font registration API (`Font.register()` + `<Document fonts>` prop)

## [0.1.0 - 0.3.0] - Pre-releases

### Added
- Page-native PDF rendering engine with real font metrics
- TrueType font embedding with CIDFont objects and subsetting
- `@formepdf/react` JSX-to-JSON serializer package
- `@formepdf/core` WASM build of the Rust engine
- `@formepdf/cli` with `forme dev` live preview and `forme build`
- Click-to-inspect dev tools with source jumping
- Component tree, data editor, and page size switcher
- Widow/orphan control, `align-content`, table cell overflow
- Bookmarks, internal anchor links, letter-spacing
- Absolute positioning, SVG module
- Style shorthand properties
- Background/border preservation on breakable views across page splits
- Nested flex layout, Fragment serialization, footer positioning, dynamic page numbers
