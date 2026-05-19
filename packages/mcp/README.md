# @formepdf/mcp

MCP server that lets AI tools generate PDFs. Add one line to your config, then ask Claude, Cursor, or Windsurf to generate invoices, receipts, reports, and more.

## Setup

Add to your MCP config:

```json
{
  "mcpServers": {
    "forme": {
      "command": "npx",
      "args": ["@formepdf/mcp"]
    }
  }
}
```

Restart your AI tool. Done.

## What you can say

- "Generate an invoice for Acme Corp, 10 hours of consulting at $150/hour"
- "Create a shipping label from Seattle to NYC, 3 lbs, fragile"
- "Make a receipt for 2 lattes and a muffin"
- "Write a business letter to Jane Smith about our partnership proposal"
- "Create a custom PDF with a big centered title that says Hello World"
- "Generate an invoice with a blue theme and our logo at https://..."
- "Make that report with a DRAFT watermark"

The agent figures out the data shape from the tool schema. You don't need to know the template fields.

## Tools

### `list_templates`

Returns all available templates with descriptions and field summaries.

### `get_template_schema`

Returns the full JSON Schema and example data for a specific template. This is how the agent knows what data to construct from your request.

### `render_pdf`

Renders a built-in template with data and writes the PDF to disk.

```
Input: { template: "invoice", data: { ... }, output: "invoice.pdf", watermark: "DRAFT" }
Output: PDF file at the specified path
```

Options:
- `watermark` (optional) — overlay text on every page (e.g. "DRAFT", "CONFIDENTIAL")

### `render_custom_pdf`

Renders arbitrary JSX to PDF. The agent writes Forme JSX on the fly, the server transpiles it with esbuild and renders it.

```
Input: { jsx: "<Document><Page>...</Page></Document>", output: "custom.pdf" }
Output: PDF file at the specified path
```

Available components, grouped:

- **Layout**: `Document`, `Page`, `View`, `Text`, `Image`, `PageBreak`
- **Tables**: `Table`, `Row`, `Cell`
- **Fixed / decorative**: `Fixed`, `Watermark`
- **Graphics**: `Svg`, `Canvas`, `QrCode`, `Barcode`
- **Charts**: `BarChart`, `LineChart`, `PieChart`, `AreaChart`, `DotPlot`
- **Forms (AcroForms)**: `TextField`, `Checkbox`, `Dropdown`, `RadioButton`
- **Style / font helpers**: `StyleSheet`, `Font`

`<Document>` accepts `pdfUa` (PDF/UA-1 accessibility), `pdfa="2b"` (PDF/A archival), `signature={{ certificatePem, privateKeyPem }}` (digital signature), and `fonts={[...]}` (custom fonts; also registerable globally via `Font.register()`). The render tool also accepts an `embedData` option to attach a JSON payload as a file attachment inside the PDF.

## Built-in Templates

| Template | Description |
|----------|-------------|
| `invoice` | Line items, tax, totals, company/customer info, optional logo |
| `receipt` | Payment confirmation, items, total, payment method |
| `report` | Multi-page report with cover, TOC, tables, charts, recommendations |
| `letter` | Business letter with letterhead, optional logo, body, signature |
| `shipping-label` | From/to addresses, weight, 4x6 format, handling stamps |

All templates support an optional `theme` object:

```json
{
  "theme": {
    "primaryColor": "#2563eb",
    "fontFamily": "Helvetica",
    "margins": 48
  }
}
```

## Prompts

The server provides prompts to guide agents through data collection:

- `generate-invoice` — walks through invoice fields
- `generate-report` — walks through report sections
- `create-custom-pdf` — lists available components and JSX patterns

## Security

`render_custom_pdf` is **intended for trusted local use**. The sandbox is a guardrail against accidental misuse — not a service-grade boundary for arbitrary attacker code.

What's enforced:

- **AST-level denylist** (host) — rejects `import`/`require`/`eval`, `new Function(...)`, dynamic imports, constructor-chain escapes (`({}).constructor.constructor`), and named/re-exports before the worker starts.
- **Worker isolation** — JSX evaluates in a `node:worker_threads` Worker with `resourceLimits` (128 MB old-gen heap). A crash in user JSX cannot bring down the MCP server.
- **`vm.Context` inside the worker** — fresh global with only React + Forme components. No `process`, `Buffer`, `fetch`, `require`, `setTimeout`. Code generation (`eval`, `Function`) is disabled at the context level.
- **Synchronous timeout** — `vm.runInContext` with a 5-second timeout actually interrupts `while(true){}`. An outer 10-second wall-clock timeout, backed by `worker.terminate()`, catches anything the inner timeout can't. **The synchronous timeout does not catch async hangs** — a template that awaits an unresolved Promise is caught by the outer 10-second wall-clock timeout, not the 5-second vm timeout.
- **Asset src restriction** — font and image `src` values must be `data:` URIs (or `Uint8Array`). File paths and `http(s)://` URLs are rejected, closing the exfiltration vector through `@formepdf/core`'s asset resolver.
- **Output path allowlist** — writes are restricted to the current working directory by default. Set `FORME_MCP_OUTPUT_DIRS` (colon-separated on Unix, semicolon on Windows) to opt in to additional directories.

What's NOT enforced:

- This is not isolation-grade. `node:vm` is explicitly not a security boundary per the Node docs, and the worker shares an OS process with the MCP server. A determined attacker with Node-vm CVE-level skills can probably escape.
- No network sandboxing of the host. If you trust the JSX to the point of running it through the sandbox at all, the MCP server still has whatever network access your machine grants it.
- No multi-tenant isolation. The sandbox protects you from your own templates and from your AI agent's accidents — not from arbitrary attacker code submitted by other users.

For multi-tenant code execution (e.g. running JSX templates from untrusted users on a shared service), use OS-level isolation: a container, a separate process with seccomp/AppArmor, or `isolated-vm` (V8 isolates). None of these are baked into `@formepdf/mcp` because they'd hurt the local-dev use case this package is built for.

## How it works

The MCP server runs locally. PDF rendering happens in-process via Forme's Rust/WASM engine. No network calls, no API keys, no browser. The agent calls the tool, gets a file path back.

## Works with

- Claude Code
- Cursor
- Windsurf
- Any tool supporting the Model Context Protocol

## Links

- [Forme](https://github.com/formepdf/forme) -- PDF generation with JSX
- [Docs](https://docs.formepdf.com)
- [MCP Specification](https://modelcontextprotocol.io)
