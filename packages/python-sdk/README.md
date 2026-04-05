# formepdf

Python SDK for [Forme](https://formepdf.com) — the page-native PDF rendering engine. Two ways to use it:

1. **API client** — calls the hosted API at api.formepdf.com (requires API key)
2. **Local rendering** — runs the WASM engine locally via wasmtime (no API key needed)

## Installation

```bash
# API client only (zero dependencies)
pip install formepdf

# Local rendering with component DSL (adds wasmtime)
pip install formepdf[local]
```

## API Client

### Setup

```python
from formepdf import Forme

client = Forme("forme_sk_...")
```

### Render

Render a template (created in the [dashboard](https://app.formepdf.com)) with data:

```python
pdf = client.render("invoice", {"customer": "Acme", "total": 245})

with open("invoice.pdf", "wb") as f:
    f.write(pdf)
```

### Async render

```python
job = client.render_async("report", data, webhook_url="https://example.com/hook")

result = client.get_job(job["jobId"])
if result["status"] == "complete":
    pdf_b64 = result["pdfBase64"]
```

### Certify

Apply a PKCS#7 digital signature to an existing PDF:

```python
with open("document.pdf", "rb") as f:
    pdf = f.read()

certified = client.certify(
    pdf,
    certificate=open("cert.pem").read(),
    private_key=open("key.pem").read(),
    reason="Approved",
    location="New York",
)

with open("certified.pdf", "wb") as f:
    f.write(certified)
```

Or use a saved certificate on the hosted API:

```python
certified = client.certify(pdf, certificate_id="cert_abc123")
```

### Redact

Remove sensitive content from a PDF — true redaction (text operators removed, not just covered):

```python
# By text pattern
redacted = client.redact(pdf, patterns=[
    {"pattern": "Jane Doe", "pattern_type": "Literal"},
    {"pattern": r"\d{3}-\d{2}-\d{4}", "pattern_type": "Regex"},
])

# By built-in presets
redacted = client.redact(pdf, presets=["ssn", "email", "phone"])

# By coordinate regions
redacted = client.redact(pdf, redactions=[
    {"page": 0, "x": 100, "y": 200, "width": 150, "height": 20},
])

# By saved redaction template
redacted = client.redact(pdf, template="hipaa-patient-record")
```

### Merge

Combine multiple PDFs into one:

```python
merged = client.merge([pdf1_bytes, pdf2_bytes, pdf3_bytes])

with open("merged.pdf", "wb") as f:
    f.write(merged)
```

### Extract embedded data

```python
data = client.extract(pdf)  # returns dict or None
```

### Error handling

```python
from formepdf import Forme, FormeError

try:
    pdf = client.render("invoice", data)
except FormeError as e:
    print(f"Error {e.status}: {e.message}")
```

---

## Local Rendering (WASM)

Build PDF documents in Python with a component DSL that mirrors the JSX API. Renders locally via the WASM engine — no API key or network calls needed.

### Basic example

```python
from formepdf import Document, Page, View, Text, Image

doc = Document(
    Page(
        View(
            Text("Invoice #001", font_size=24, font_weight="bold"),
            Text("Acme Corp", font_size=14, color="#666"),
            flex_direction="column", gap=8,
        ),
    ),
    title="Invoice #001",
)

pdf = doc.render()

with open("invoice.pdf", "wb") as f:
    f.write(pdf)
```

### Components

| Component | Description |
|-----------|-------------|
| `Document(*children)` | Root container. `.render()` returns PDF bytes. Options: `title`, `author`, `subject`, `lang`, `tagged`, `pdf_ua`, `pdfa`, `flatten_forms` |
| `Page(*children)` | Page container. Options: `size` (e.g. `"A4"`, `"Letter"`), `margin` |
| `View(*children)` | Flex/grid container. Options: all style kwargs (`flex_direction`, `gap`, `padding`, etc.) |
| `Text(content)` | Text element. Options: `font_size`, `font_weight`, `color`, `text_align`, etc. |
| `Image(src)` | Image (file path, URL, or data URI). Options: `width`, `height`, `alt` |
| `Table(*rows)` | Table with auto-repeating headers. Options: `columns` |
| `Row(*cells)` | Table row. Options: `header=True` for repeat-on-page-break |
| `Cell(*children)` | Table cell. Options: `col_span`, `row_span` |
| `Svg(content)` | Inline SVG. Options: `width`, `height` |
| `QrCode(data)` | Vector QR code. Options: `size`, `color` |
| `Barcode(data)` | 1D barcode. Options: `format` (`"Code128"`, `"Code39"`, `"EAN13"`, etc.), `width`, `height` |
| `BarChart(data)` | Bar chart. Options: `width`, `height`, `color`, `title` |
| `LineChart(series, labels)` | Line chart. Options: `width`, `height`, `show_points`, `title` |
| `PieChart(data)` | Pie/donut chart. Options: `width`, `height`, `donut`, `title` |
| `AreaChart(series, labels)` | Area chart. Options: `width`, `height`, `title` |
| `DotPlot(groups)` | Scatter plot. Options: `width`, `height`, `title` |
| `TextField(name)` | Fillable text field. Options: `value`, `placeholder`, `multiline` |
| `Checkbox(name)` | Fillable checkbox. Options: `checked` |
| `Dropdown(name, options)` | Fillable dropdown. Options: `value` |
| `RadioButton(name, value)` | Radio button. Options: `checked` |
| `Watermark(text)` | Rotated watermark. Options: `font_size`, `color`, `angle` |
| `PageBreak()` | Force a page break |
| `Fixed(*children)` | Fixed-position element. Options: `position` (`"header"`, `"footer"`) |

### Certify locally

```python
from formepdf.wasm import certify_pdf

with open("document.pdf", "rb") as f:
    pdf = f.read()

import json
config = json.dumps({
    "certificate_pem": open("cert.pem").read(),
    "private_key_pem": open("key.pem").read(),
    "reason": "Approved",
})

certified = certify_pdf(pdf, config)
```

## Requirements

- Python 3.8+
- No external dependencies for the API client (stdlib only)
- `wasmtime` for local rendering (`pip install formepdf[local]`)
