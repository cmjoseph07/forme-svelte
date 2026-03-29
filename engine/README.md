# forme-pdf

A page-native PDF rendering engine written in Rust. Layout happens **into** pages, not onto an infinite canvas that gets sliced afterward — so page breaks, table headers, and flex layout all work correctly across pages.

`cargo add forme-pdf` installs the crate. The library name is `forme`:

```rust
use forme::{render_json, Document, FormeError};
```

## Features

- **Page-native layout** — flexbox, tables, and text reflow with real page boundary awareness
- **CSS-like styling** — flexbox (`row`/`column`, `wrap`, `grow`/`shrink`), CSS Grid, absolute positioning
- **Text** — OpenType shaping, Knuth-Plass line breaking, hyphenation (35+ languages), BiDi, per-character font fallback
- **Tables** — automatic header repetition on page breaks, column spans
- **Images** — JPEG, PNG, WebP (embedded or data URI)
- **SVG** — inline SVG rendering (rect, circle, line, path, arc)
- **Charts** — BarChart, LineChart, PieChart, AreaChart, DotPlot (engine-native, no JS)
- **QR codes & barcodes** — vector rendering (Code128, Code39, EAN13, EAN8, Codabar)
- **Canvas** — arbitrary vector drawing via a Canvas-like API
- **Watermarks** — rotated text behind page content
- **Tagged PDF / PDF/A-2a** — accessibility and archival compliance
- **Templates** — expression language for dynamic documents (`$ref`, `$each`, `$if`)
- **WASM** — compiles to WebAssembly for browser and serverless use

## Quick start

```rust
use forme::{render_json, FormeError};

fn main() -> Result<(), FormeError> {
    let json = r#"{
        "pages": [{ "size": "A4" }],
        "children": [{
            "kind": "text",
            "content": "Hello from Forme!",
            "style": { "fontSize": 24, "margin": { "top": 72, "left": 72 } }
        }]
    }"#;

    let pdf_bytes = render_json(json)?;
    std::fs::write("hello.pdf", pdf_bytes).unwrap();
    Ok(())
}
```

## API

| Function | Description |
|----------|-------------|
| `render(&Document)` | Render a document struct to PDF bytes |
| `render_json(&str)` | Parse JSON and render to PDF bytes |
| `render_with_layout(&Document)` | Render and return layout metadata |
| `render_template(&str, &str)` | Evaluate a template with data, then render |

All functions return `Result<Vec<u8>, FormeError>` (or a tuple with `LayoutInfo` for the `_with_layout` variants).

## Documentation

- [Full docs](https://docs.formepdf.com) — component reference, styling guide, examples
- [API reference](https://docs.rs/forme-pdf) — Rust API docs
- [GitHub](https://github.com/formepdf/forme) — source, issues, JSX/TypeScript packages

## License

MIT
