import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

export function generateInvoicePrompt(): GetPromptResult {
  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: [
          'I need to generate a professional PDF invoice. Please help me collect the following details:',
          '',
          '1. **Invoice number** — e.g. "INV-2026-0142"',
          '2. **Date** and **due date**',
          '3. **Tax rate** — as a decimal, e.g. 0.08 for 8%',
          '4. **Company details** — name, initials (1-3 letters for logo badge), address, email. Optionally a logoUrl (URL to company logo image).',
          '5. **Bill-to address** — customer name, company, address, email',
          '6. **Ship-to address** — name, address',
          '7. **Line items** — each with description, quantity, and unit price',
          '8. **Payment terms** — e.g. "Net 30"',
          '9. **Notes** (optional)',
          '',
          'Once I have these details, use the `render_pdf` tool with template "invoice" to generate the PDF.',
          'You can also pass a `theme` object with `primaryColor`, `fontFamily`, and/or `margins` to customize the look.',
        ].join('\n'),
      },
    }],
  };
}

export function generateReportPrompt(): GetPromptResult {
  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: [
          'I need to generate a multi-page business report PDF. Please help me collect:',
          '',
          '1. **Title** and **subtitle**',
          '2. **Author**, **department**, **company**',
          '3. **Date** and **classification** (e.g. "Internal - Confidential")',
          '4. **Key metrics** (optional) — array of {value, label} cards',
          '5. **Sections** (4 required):',
          '   - **Executive Summary** — paragraphs of text',
          '   - **Data section** — intro text + table rows with region, q1-q4 values',
          '   - **Visual Analysis** — intro text (charts auto-generated from table data)',
          '   - **Recommendations** — items with title, description, priority, timeline',
          '',
          'Use the `render_pdf` tool with template "report" to generate the PDF.',
          'You can also pass a `theme` object with `primaryColor`, `fontFamily`, and/or `margins`.',
        ].join('\n'),
      },
    }],
  };
}

export function createCustomPdfPrompt(): GetPromptResult {
  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: [
          'I want to create a custom PDF using JSX. Here are the available Forme components:',
          '',
          '**Layout**: `<Document>`, `<Page>`, `<View>`, `<PageBreak>`',
          '**Text**: `<Text>` — fontSize, fontWeight, color, textAlign ("left"|"right"|"center"|"justify"), lineHeight, textDecoration, textTransform, textOverflow ("ellipsis"|"clip")',
          '**Tables**: `<Table columns={[...]}>`, `<Row>`, `<Cell>`',
          '**Media**: `<Image src="..." />`, `<Svg width={} height={}>...</Svg>` (accepts JSX children like `<rect />`, `<circle />`, `<path />` as an alternative to the `content="..."` string prop)',
          '**Fixed / Watermark**: `<Fixed position="header|footer">` (repeats on every page), `<Watermark text="DRAFT" fontSize={60} angle={-45} />`',
          '**Graphics**: `<Canvas width={w} height={h} draw={(ctx) => { ctx.setFillColor(59, 130, 246); ctx.fillRect(0, 0, 100, 50); ctx.line(0, 0, 100, 50); ctx.arc(50, 50, 20, 0, Math.PI * 2); }} />` — note: colors are 0–255 RGB, not 0–1. Methods: `line`, `arc`, `bezier`, `fillRect`, `strokeRect`, `setFillColor`, `setStrokeColor`, `setLineWidth`, `beginPath`/`moveTo`/`lineTo`/`closePath`/`fill`/`stroke`.',
          '**Codes**: `<QrCode data="..." size={100} />`, `<Barcode data="ABC-123" format="Code128" width={200} height={50} />` (formats: Code128, Code39, EAN13, EAN8, Codabar)',
          '**Charts**: `<BarChart>`, `<LineChart>`, `<PieChart>`, `<AreaChart>`, `<DotPlot>`',
          '**Forms (AcroForms)**: `<TextField name="..." defaultValue="..." />`, `<Checkbox name="..." />`, `<Dropdown name="..." options={["A", "B"]} />`, `<RadioButton name="group" value="a" />` — produce fillable PDF form fields',
          '',
          '**Document options**: `<Document pdfUa>` (PDF/UA-1 accessibility), `pdfa="2b"` (PDF/A archival), `signature={{ certificatePem, privateKeyPem, reason, location }}` (digital signature), `fonts={[{ family, src, weight, style }]}` (custom fonts; also available via `Font.register()`), `lang="en-US"`, `default_style={{ ... }}`. The `render_custom_pdf` tool also supports `embedData` to attach a JSON payload as a file attachment inside the PDF.',
          '',
          '**Styling** uses a React Native/CSS-like object. Notable shorthands:',
          '- Border: `border: "1px solid #000"`, per-side `borderTop: "2px solid red"`',
          '- Edges: `padding: "8 16"` or `padding: [8, 16, 24, 32]` (CSS 1–4 value pattern), same for `margin`',
          '- Text: `textOverflow: "ellipsis"`, `textAlign: "justify"`',
          '- Overflow: `overflow: "hidden"` (clips children to parent box)',
          '- Grid: `gridTemplateColumns: "repeat(3, 1fr)"`',
          '- Font fallback: `fontFamily: "Inter, NotoSansSC, Helvetica"` — per-character fallback for CJK/Arabic/etc.',
          '',
          '**Example JSX**:',
          '```tsx',
          '<Document>',
          '  <Page size="Letter" margin={48}>',
          '    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>',
          '      <Text style={{ fontSize: 24, fontWeight: 700 }}>Title</Text>',
          '      <Text style={{ fontSize: 10, color: "#64748b" }}>Subtitle</Text>',
          '    </View>',
          '  </Page>',
          '</Document>',
          '```',
          '',
          '**Example with a Barcode + Canvas accent + PDF/UA**:',
          '```tsx',
          '<Document pdfUa>',
          '  <Page size="Letter" margin={48}>',
          '    <Canvas width={200} height={4} draw={(ctx) => {',
          '      ctx.setFillColor(59, 130, 246);',
          '      ctx.fillRect(0, 0, 200, 4);',
          '    }} />',
          '    <Text style={{ fontSize: 14, marginTop: 12 }}>Order #ABC-123</Text>',
          '    <Barcode data="ABC-123" format="Code128" width={200} height={50} />',
          '  </Page>',
          '</Document>',
          '```',
          '',
          'Describe the PDF you want and I\'ll write the JSX and render it using `render_custom_pdf`.',
        ].join('\n'),
      },
    }],
  };
}
