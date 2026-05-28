# Changelog

## [0.10.3] - 2026-05-28

### Fixed
- `<Text style={{ width }}>` inside a flex row now renders at the requested width instead of the parent row's full width. A 0.10.2 regression positioned such text using the requested width but sized its box to the row width; combined with `textAlign: 'right'` this pushed glyphs off the page (silent corruption — PDF bytes were deterministic so byte-hash snapshots passed). `layout_text` and the text branch of `measure_node_height` now honor a resolved fixed `style.width`, matching how `layout_view` and `Image` already behave

## [0.10.2] - 2026-05-21

### Fixed
- Flex row children with percentage widths (e.g. `width: '30%'`) are no longer double-resolved against their own already-resolved width — the percentage now correctly resolves against the parent's content width. Two children at 100% now shrink to 50/50 instead of collapsing
- Grid containers that wrap over a page break now page-break by row (all columns moved to the next page together) instead of letting each cell trigger its own page break, which was scattering the columns across separate pages

### Internal
- `layout_node` now accepts a `forced_outer_width: Option<f64>` parameter so flex parents can hand the distributed width to the child without re-running style resolution

## [0.10.1]

_Skipped — npm-only patch._

## [0.10.0] - 2026-05-19

### Added
- `opacity` now cascades to children — wrapping happens at the element level (single `q ... Q` covering own paint and child recursion) instead of the previous per-Rect wrap that left text inside opaque parents at full alpha. Nested opacities multiply via the PDF graphics-state stack
- `wordSpacing` style property — user-facing, emits the PDF `Tw` operator. Stacks with `text-align: justify`'s computed slack
- Rounded clipping when `overflow: hidden` + `borderRadius` — clip path uses the rounded rectangle (m/c/h W n) instead of the rectangular `re W n`
- `boxShadow` style property — offset filled rect behind the element, honors borderRadius, alpha routed through ExtGState
- Page `backgroundImage` with `backgroundOpacity` / `backgroundSize` (fill/cover/contain) / `backgroundPosition`. XObjects dedupe across pages by URL
- `background` style property accepting CSS linear and radial gradients. 2-stop gradients use a Type 2 (exponential) Shading; 3+ stops use a Type 3 (stitching) function. CSS angle convention (0deg = bottom→top, 180deg = top→bottom)

### Internal
- CI now runs a PDF size regression check (`.github/scripts/check-pdf-size.sh`) against a fixture that exercises all six new features. Fails on >5% byte growth over the committed baseline

## [0.9.2] - 2026-04-28

### Fixed
- Redaction text-stripping now uses real per-CID glyph advances when locating regions, so partial-line redactions match the visible overlay precisely instead of dropping the surrounding text
- CID font decoding in the redaction text extractor — handles Type0/CIDFontType2 streams correctly
- PDF parsing in CID redaction is robust to binary font streams that previously confused the tokenizer
- `text_decoration` is now part of the glyph style grouping key, so a `line-through` span inside an otherwise plain text node is no longer merged with its neighbors during PDF emission

## [0.9.1] - 2026-04-06

_Version bump only._

## [0.9.0] - 2026-04-04

### Added
- `certify_pdf()` — apply a PKCS#7 digital signature to an existing PDF
- `redact_pdf()` — redact regions from a PDF (removes underlying text)
- `redact_text()` — find text by pattern and redact matching regions
- `find_text_regions()` — find text regions in a PDF without redacting
- `merge_pdfs()` — combine multiple PDFs into one
- PKCS#1 private key auto-conversion: `parse_pem_private_key()` now accepts both PKCS#8 (`BEGIN PRIVATE KEY`) and PKCS#1 (`BEGIN RSA PRIVATE KEY`) formats, falling back automatically

### Fixed
- WASI timestamp: `current_timestamp_secs()` now uses `std::time::SystemTime` on wasm32-wasip1 targets instead of `js_sys::Date` (which is only available in browser WASM)

## [0.8.3] - 2026-04-01

### Added
- SVG element opacity support: `opacity`, `fill-opacity`, and `stroke-opacity` attributes rendered via PDF ExtGState with inheritance through `<g>` groups

### Fixed
- Page node style now resolves against root style, so properties like `fontFamily` set on `<Page style={...}>` correctly inherit to child nodes

## [0.8.2] - 2026-03-30

### Fixed
- Fix PDF serializer ignoring custom font weights — multiple weights for the same family (e.g. 200, 400, 700) now produce distinct font objects instead of collapsing to 400/700

## [0.8.1] - 2026-03-30

### Fixed
- Fix Latin Extended character widths in standard font tables (Å, Ä, Ö, etc. no longer stack)
- Fix page number placeholder width mismatch during layout ({{pageNumber}} measured at actual width)
- Two-pass rendering: sentinel width now matches actual page count digits (1-9→"0", 10-99→"00", 100+→"000")

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
