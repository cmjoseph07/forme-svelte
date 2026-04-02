# Changelog

## [0.8.3] - 2026-04-01

### Added
- `<Svg>` children API: JSX children as alternative to `content` string prop, with camelCase→kebab-case attribute mapping and XML escaping

### Fixed
- `serializePage()` now reads and maps the `style` prop instead of discarding it — `<Page style={{ fontFamily: "..." }}>` works correctly

## [0.8.2] - 2026-03-30

_Dependency bump only._

## [0.8.1] - 2026-03-30

### Changed
- Version bump to match engine 0.8.1

## [0.8.0] - 2026-03-29

### Added
- `<TextField>` component with `name`, `value`, `width`, `multiline`, `password`, `readOnly`, `maxLength`, `fontSize` props
- `<Checkbox>` component with `name`, `checked`, `width`, `height`, `readOnly` props
- `<Dropdown>` component with `name`, `options`, `value`, `width`, `readOnly`, `fontSize` props
- `<RadioButton>` component with `name`, `value`, `checked` props
- `pdfUa` prop on `<Document>` for PDF/UA-1 accessibility compliance
- `pdfa` prop on `<Document>` for PDF/A archival compliance (`"2b"`, `"2a"`)
- `signature` prop on `<Document>` for PKCS#7 digital signatures
- `TextFieldProps`, `CheckboxProps`, `DropdownProps`, `RadioButtonProps` type exports

### Removed
- `page` field from `SignatureConfig` type (was never functional)

## [0.7.13] - 2026-03-28

### Added
- `<AreaChart>` component for multi-series area charts
- `<DotPlot>` component for scatter plots with grouped (x, y) data
- `ChartSeries`, `DotPlotGroup`, `AreaChartProps`, `DotPlotProps` type exports

### Changed
- `<BarChart>`, `<LineChart>`, `<PieChart>` are now engine-native intrinsic elements (serialized directly to engine JSON)
- `<LineChart>` API: `series` + `labels` replace old `data` + `color` props (multi-series support)
- `<PieChart>` API: `donut` boolean replaces `innerRadius`; `showLegend` replaces `showLabels`
- Old SVG-based implementations renamed to `LegacyBarChart`, `LegacyLineChart`, `LegacyPieChart`

## [0.7.12] - 2026-03-24

_Dependency bump only._

## [0.7.11] - 2026-03-23

_Dependency bump only._

## [0.7.9] - 2026-03-17

_Version bump only._

## [0.7.8] - 2026-03-17

### Added
- `<Barcode>` component with `data`, `format`, `width`, `height`, `color` props
- `BarcodeFormat` type: `'Code128' | 'Code39' | 'EAN13' | 'EAN8' | 'Codabar'`
- `BarcodeProps` interface and `serializeBarcode()` serialization

## [0.7.3] - 2026-03-07

_No changes._

## [0.7.2] - 2026-03-07

_No changes._

## [0.7.1] - 2026-03-07

### Added
- `style` prop on `<Document>` for global defaults (emits `defaultStyle` in JSON)
- `line(x1, y1, x2, y2)` convenience method on `CanvasContext`
- `defaultStyle` field on `FormeDocument` type

### Changed
- Image component JSDoc updated with concrete path examples (data URI, relative, absolute)

## [0.7.0] - 2026-03-06

_No changes._

## [0.6.2] - 2026-02-21

### Added
- `<Canvas>` component with recording `CanvasContext`
- `<BarChart>`, `<LineChart>`, `<PieChart>` chart components
- `<Watermark>` component
- `rgba()` and `rgb()` color parsing in `parseColor()`
- Chart legend flex-wrap support

## [0.6.1] - 2026-02-14

_No changes._

## [0.6.0] - 2026-02-07

### Added
- `<QrCode>` component
- CSS border shorthand parsing (`border: "1px solid #000"`)
- Edge string/array shorthands for padding and margin
- `alt` prop on `<Image>` and `<Svg>`
- `lang` prop on `<Document>`
- `href` prop on `<Image>` and `<Svg>`
- `repeat()` expansion for grid template strings
- Template proxy system (`createDataProxy`, `serializeTemplate`)
- Expression helpers (`expr.ts`) for template comparisons and arithmetic

## [0.4.0] - 2025-12-13

### Added
- `Font.register()` static API for custom font registration
- `<Document fonts={[...]}>` prop for per-document fonts
- Font merge strategy (global + document fonts keyed by family:weight:italic)

## [0.1.0 - 0.3.0] - Pre-releases

### Added
- JSX component library: `<Document>`, `<Page>`, `<View>`, `<Text>`, `<Image>`, `<Svg>`, `<Link>`
- `serialize()` function to convert JSX tree to JSON document
- Style shorthand properties
- `<Page margin>` accepts strings and arrays

### Changed
- Package scope renamed from `@forme/react` to `@formepdf/react`
