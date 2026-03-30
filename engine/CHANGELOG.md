# Changelog

## [0.8.1] - 2026-03-30

### Fixed
- Fix Latin Extended character widths in standard font tables (Å, Ä, Ö, etc. no longer stack)
- Fix page number placeholder width mismatch during layout ({{pageNumber}} measured at actual width)

## [0.8.0] - 2026-03-29

### Added
- AcroForm support: `NodeKind::TextField`, `NodeKind::Checkbox`, `NodeKind::Dropdown`, `NodeKind::RadioButton`
- Form field layout functions and PDF AcroForm widget rendering
- `flattenForms` option in render pipeline to convert form fields to static content
- PDF/UA-1 compliance: structure tree (`StructTreeRoot`), tab order, role map, artifact tagging for headers/footers
- `pdf/tagged.rs`: structure tree generation for tagged PDF
- PDF/A compliance: sRGB output intent, XMP metadata with `pdfaid:part/conformance`, full font embedding mode
- `pdf/signing.rs`: PKCS#7 detached digital signatures with ByteRange placeholder
- `Document.pdf_ua`, `Document.pdfa`, `Document.signature` fields
- `Image.alt` and `Svg.alt` emit `/Alt` entries in structure elements for PDF/UA

### Fixed
- `extract_cn_from_cert_der()` handles multi-byte DER lengths (CN > 127 bytes)
- Checkbox appearance: checkmark instead of X; radio button: filled circle
- `flatten_forms` renders placeholder text in grey when value is empty
- Signing preserves existing AcroForm `/NeedAppearances` and `/DA` metadata
- Unique signature field names (`Signature1`, `Signature2`) for double-signing
- Form fields tagged as `/Form` role in structure tree (PDF/UA compliance)

### Removed
- `SignatureConfig.page` field (was accepted but silently ignored)

## [0.7.13] - 2026-03-28

### Added
- `chart/` module with shared types (`ChartPrimitive`, `TextAnchor`) and per-type builders (`bar.rs`, `line.rs`, `pie.rs`, `area.rs`, `dot.rs`)
- Five `NodeKind` variants: `BarChart`, `LineChart`, `PieChart`, `AreaChart`, `DotPlot`
- `DrawCommand::Chart { primitives }` with PDF rendering (Y-flip transform, arc sector bezier approximation, Helvetica labels)
- `ChartDataPoint`, `ChartSeries`, `DotPlotGroup` data structs
- 10 integration tests for chart rendering

## [0.7.9] - 2026-03-17

_Version bump only._

## [0.7.8] - 2026-03-17

### Added
- `barcode.rs`: 1D barcode generation via `barcoders` crate (Code128, Code39, EAN13, EAN8, Codabar)
- `NodeKind::Barcode` variant with `data`, `format`, `width`, `height` fields
- `layout_barcode()` function (follows `layout_qrcode` pattern)
- `DrawCommand::Barcode` with filled rectangle emission in PDF serializer
- `wasm_raw` feature with C-ABI exports for non-JS WASM hosts (wasmtime, wasmer)

## [0.7.6] - 2026-03-13

### Added
- `Document.embedded_data` field for embedding JSON as a FlateDecode-compressed PDF file attachment
- PDF serializer emits EmbeddedFile stream + Names tree for `forme-data.json`

## [0.7.3] - 2026-03-07

_No changes._

## [0.7.2] - 2026-03-07

_No changes._

## [0.7.1] - 2026-03-07

### Added
- Builtin Noto Sans Regular (400) and Bold (700) fonts via `include_bytes!()` (`font/builtin.rs`)
- `Document.default_style` field for global style defaults (inherited by all children)
- Automatic per-character font fallback to Noto Sans for chars not covered by the primary font

### Changed
- `FontRegistry::new()` now registers Noto Sans alongside standard PDF fonts
- `resolve_for_char()` tries Noto Sans before Helvetica as last-resort fallback
- `segment_by_font()` checks glyph coverage even for single-family text
- `char_width()` uses per-char resolution when primary font lacks a glyph

## [0.7.0] - 2026-03-06

### Fixed
- Skip Arabic font fallback test when system font unavailable (CI fix)

## [0.6.2] - 2026-02-21

### Added
- Per-character font fallback (`font/fallback.rs`, `segment_by_font`)
- `overflow: hidden` via PDF clip path operators (`q / re W n / Q`)
- Canvas drawing primitive (`CanvasOp` enum, reuses SVG command pipeline)
- SVG arc (`A`/`a`) path commands (`svg_arc_to_curves`, W3C F.6.5/F.6.6)
- Watermarks with rotation matrix and opacity in PDF output
- Justified text via PDF `Tw` (word spacing) operator
- PDF standard font `/Widths` arrays for Helvetica, Times, Courier
- `lineBreaking` toggle

### Fixed
- Cross-axis stretch propagation (`cross_axis_height` parameter in `layout_node`)
- Font weight fallback with opposite weight resolution (700 to 400 and vice versa)
- Shaping cluster byte-to-char conversion for multi-byte characters
- `measure_intrinsic_width` accounts for `textTransform`

## [0.6.1] - 2026-02-14

### Added
- Canvas clipping to bounds via `DrawCommand::Svg { clip: true }`
- Arc counterclockwise parameter support

## [0.6.0] - 2026-02-07

### Added
- Knuth-Plass optimal line breaking algorithm
- UAX#14 Unicode line breaking
- Multi-language hyphenation via hypher crate (35+ languages)
- OpenType shaping via rustybuzz
- BiDi text support (unicode-bidi + unicode-script)
- CSS Grid layout (track sizing, auto/explicit placement)
- Tagged PDF / PDF/A-2a compliance with structure tree
- Visual regression test framework
- QR code generation (`qrcode.rs`, vector PDF rendering)
- `textOverflow` (ellipsis/clip) truncation
- Font fallback chains (comma-separated `fontFamily` resolution)
- Alt text field on `LayoutElement`
- Document language (`/Lang` in PDF Catalog)
- Clickable images/SVGs via `href`

## [0.4.0] - 2025-12-13

### Added
- Template expression evaluator (`template.rs`)
- Custom font registration and base64 font loading
- Font subsetting for embedded custom fonts

## [0.1.0 - 0.3.0] - Pre-releases

### Added
- Page-native layout engine with `PageCursor`
- PDF 1.7 serializer (from scratch)
- TrueType font embedding with CIDFont objects and subsetting
- Standard font metrics (Helvetica, Times, Courier) with WinAnsi mapping
- Flex layout (row/column, grow/shrink/wrap)
- Table layout with header repetition across pages
- Image loading (JPEG, PNG, WebP, data URIs)
- SVG parsing and rendering
- Widow/orphan control
- `align-content` for flex wrap
- Table cell overflow preservation
- Bookmarks and internal anchor links
- Letter-spacing
- Absolute positioning
- Fixed height containers
- Background/border on breakable views across page splits
