import { describe, it, expect } from 'vitest';
import { parseColor } from '@formepdf/shared';
import { parseMarkup } from '../src/parser.js';

/** Wrap markup in a document root and parse. */
function parseIn(inner: string) {
  return parseMarkup(`<forme-document props="{}">${inner}</forme-document>`);
}

/** Build a props attribute value from an object (as Svelte would emit it). */
function attr(props: Record<string, unknown>): string {
  return JSON.stringify(props).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const DEFAULT_PAGE = {
  size: 'A4',
  margin: { top: 54, right: 54, bottom: 54, left: 54 },
  wrap: true,
};

describe('document', () => {
  it('parses an empty document to the FormeDocument skeleton', () => {
    const doc = parseMarkup('<forme-document props="{}"></forme-document>');
    expect(doc).toEqual({
      children: [],
      metadata: {},
      defaultPage: DEFAULT_PAGE,
    });
  });

  it('tolerates SSR block anchors and whitespace around the root', () => {
    const doc = parseMarkup('<!--[--> \n<forme-document props="{}"></forme-document>\n<!--]-->');
    expect(doc.children).toEqual([]);
  });

  it('throws when the root is not a Document', () => {
    expect(() => parseMarkup('<forme-view props="{}"></forme-view>')).toThrow(
      'Top-level element must be <Document>'
    );
    expect(() => parseMarkup('just text')).toThrow('Top-level element must be <Document>');
  });
});

describe('page', () => {
  it('parses an empty page with the default config', () => {
    const doc = parseMarkup(
      '<forme-document props="{}"><forme-page props="{}"></forme-page></forme-document>'
    );
    expect(doc.children).toEqual([
      {
        kind: { type: 'Page', config: DEFAULT_PAGE },
        style: {},
        children: [],
      },
    ]);
  });

  it('maps size string, custom size object, and margin shorthand', () => {
    const props = JSON.stringify({ size: 'Letter', margin: 20 });
    const doc = parseMarkup(
      `<forme-document props="{}"><forme-page props='${props.replace(/"/g, '&quot;')}'></forme-page></forme-document>`
    );
    expect(doc.children[0].kind).toEqual({
      type: 'Page',
      config: { size: 'Letter', margin: { top: 20, right: 20, bottom: 20, left: 20 }, wrap: true },
    });

    const custom = JSON.stringify({ size: { width: 400, height: 600 }, margin: [10, 20] });
    const doc2 = parseMarkup(
      `<forme-document props="{}"><forme-page props='${custom.replace(/"/g, '&quot;')}'></forme-page></forme-document>`
    );
    expect(doc2.children[0].kind).toEqual({
      type: 'Page',
      config: {
        size: { Custom: { width: 400, height: 600 } },
        margin: { top: 10, right: 20, bottom: 10, left: 20 },
        wrap: true,
      },
    });
  });

  it('passes page background props and style through', () => {
    const props = JSON.stringify({
      backgroundImage: 'bg.png',
      backgroundOpacity: 0.5,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      style: { padding: 8 },
    });
    const doc = parseMarkup(
      `<forme-document props="{}"><forme-page props='${props.replace(/"/g, '&quot;')}'></forme-page></forme-document>`
    );
    const kind = doc.children[0].kind as { type: 'Page'; config: Record<string, unknown> };
    expect(kind.config.backgroundImage).toBe('bg.png');
    expect(kind.config.backgroundOpacity).toBe(0.5);
    expect(kind.config.backgroundSize).toBe('cover');
    expect(kind.config.backgroundPosition).toBe('center');
    expect(doc.children[0].style).toEqual({
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
    });
  });
});

describe('view', () => {
  it('parses a view with mapped style and nested children', () => {
    const doc = parseIn(
      `<forme-view props='${attr({ style: { flexDirection: 'row', gap: 8 } })}'>` +
        `<forme-view props="{}"></forme-view>` +
        `</forme-view>`
    );
    expect(doc.children).toEqual([
      {
        kind: { type: 'View' },
        style: { flexDirection: 'Row', gap: 8 },
        children: [{ kind: { type: 'View' }, style: {}, children: [] }],
      },
    ]);
  });

  it('maps wrap into style and passes bookmark/href through', () => {
    const doc = parseIn(
      `<forme-view props='${attr({ wrap: false, bookmark: 'Intro', href: 'https://x.dev' })}'></forme-view>`
    );
    expect(doc.children[0]).toEqual({
      kind: { type: 'View' },
      style: { wrap: false },
      children: [],
      bookmark: 'Intro',
      href: 'https://x.dev',
    });
  });

  it('parses CSS string shorthands in styles through mapStyle', () => {
    const doc = parseIn(
      `<forme-view props='${attr({ style: { border: '1px solid #000', padding: '8 16' } })}'></forme-view>`
    );
    expect(doc.children[0].style).toEqual({
      borderWidth: { top: 1, right: 1, bottom: 1, left: 1 },
      borderColor: {
        top: { r: 0, g: 0, b: 0, a: 1 },
        right: { r: 0, g: 0, b: 0, a: 1 },
        bottom: { r: 0, g: 0, b: 0, a: 1 },
        left: { r: 0, g: 0, b: 0, a: 1 },
      },
      padding: { top: 8, right: 16, bottom: 8, left: 16 },
    });
  });
});

describe('text content whitespace', () => {
  function textContent(inner: string): string {
    const doc = parseIn(`<forme-text props="{}">${inner}</forme-text>`);
    const kind = doc.children[0].kind;
    if (kind.type !== 'Text') throw new Error('expected Text node');
    return kind.content;
  }

  it('parses simple text content', () => {
    expect(textContent('hello')).toBe('hello');
  });

  it('joins lines with a single space (JSX semantics)', () => {
    expect(textContent('Hello\nworld')).toBe('Hello world');
    expect(textContent('line one\nline two\nline three')).toBe('line one line two line three');
  });

  it('strips line indentation when joining (interpolations split across lines)', () => {
    expect(textContent('A\n    B')).toBe('A B');
  });

  it('preserves interior spaces on the same line', () => {
    expect(textContent('same-line  spaces kept')).toBe('same-line  spaces kept');
    expect(textContent('Hello World!')).toBe('Hello World!');
  });

  it('produces empty content for an empty element', () => {
    expect(textContent('')).toBe('');
  });

  it('drops trailing/leading whitespace-only lines', () => {
    // Raw markup case (Svelte usually pre-trims fragment edges, but the
    // parser owns the rule for markup it is handed directly)
    expect(textContent('\n  indented\n')).toBe('indented');
    expect(textContent('  \n  a\n  b\n  ')).toBe('a b');
  });

  it('decodes HTML entities and preserves non-breaking spaces', () => {
    expect(textContent('a&amp;b &lt;tag&gt;')).toBe('a&b <tag>');
    expect(textContent('x&nbsp;&nbsp;y')).toBe('x  y');
  });

  it('merges text across SSR block anchor comments', () => {
    expect(textContent('Hello <!--[0-->World<!--]-->!')).toBe('Hello World!');
    expect(textContent('A<!--[-->B<!--]-->')).toBe('AB');
  });
});

describe('text node', () => {
  it('maps style onto the node and puts href on the kind', () => {
    const doc = parseIn(
      `<forme-text props='${attr({ style: { fontSize: 12 }, href: 'https://x.dev', bookmark: 'B' })}'>go</forme-text>`
    );
    expect(doc.children[0]).toEqual({
      kind: { type: 'Text', content: 'go', href: 'https://x.dev' },
      style: { fontSize: 12 },
      children: [],
      bookmark: 'B',
    });
  });
});

describe('text runs', () => {
  function textKind(inner: string) {
    const doc = parseIn(`<forme-text props="{}">${inner}</forme-text>`);
    const kind = doc.children[0].kind;
    if (kind.type !== 'Text') throw new Error('expected Text node');
    return kind;
  }

  it('leaves runs absent for plain text content', () => {
    expect(textKind('hello').runs).toBeUndefined();
  });

  it('builds runs from nested Text spans, content stays empty', () => {
    const styled = attr({ style: { textDecoration: 'line-through' } });
    expect(textKind(`Was <forme-text props='${styled}'>$56.00</forme-text> due now`)).toEqual({
      type: 'Text',
      content: '',
      runs: [
        { content: 'Was ' },
        { content: '$56.00', style: { textDecoration: 'LineThrough' } },
        { content: ' due now' },
      ],
    });
  });

  it('omits style on unstyled runs and passes href per run', () => {
    const linked = attr({ href: 'https://x.dev' });
    expect(
      textKind(`See <forme-text props="{}">plain</forme-text> or <forme-text props='${linked}'>link</forme-text>`).runs
    ).toEqual([
      { content: 'See ' },
      { content: 'plain' },
      { content: ' or ' },
      { content: 'link', href: 'https://x.dev' },
    ]);
  });

  it('keeps a same-line space between two spans as its own run', () => {
    expect(
      textKind(`<forme-text props="{}">a</forme-text> <forme-text props="{}">b</forme-text>`).runs
    ).toEqual([{ content: 'a' }, { content: ' ' }, { content: 'b' }]);
  });

  it('drops whitespace-only chunks that span lines (JSX semantics)', () => {
    expect(
      textKind(`<forme-text props="{}">a</forme-text>\n  <forme-text props="{}">b</forme-text>`).runs
    ).toEqual([{ content: 'a' }, { content: 'b' }]);
  });

  it('flattens deeper nesting into the run of the outermost span', () => {
    expect(
      textKind(
        `x <forme-text props="{}">a<forme-text props="{}">b</forme-text>c</forme-text>`
      ).runs
    ).toEqual([{ content: 'x ' }, { content: 'abc' }]);
  });

  it('merges text across SSR block anchor comments within a chunk', () => {
    expect(
      textKind(`Total<!--[--> due<!--]-->: <forme-text props="{}">now</forme-text>`).runs
    ).toEqual([{ content: 'Total due: ' }, { content: 'now' }]);
  });
});

describe('fixed', () => {
  it('maps header and footer positions', () => {
    const header = parseIn(`<forme-fixed props='${attr({ position: 'header' })}'></forme-fixed>`);
    expect(header.children[0].kind).toEqual({ type: 'Fixed', position: 'Header' });

    const footer = parseIn(`<forme-fixed props='${attr({ position: 'footer' })}'></forme-fixed>`);
    expect(footer.children[0].kind).toEqual({ type: 'Fixed', position: 'Footer' });
  });

  it('defaults to footer when position is missing', () => {
    const doc = parseIn('<forme-fixed props="{}"></forme-fixed>');
    expect(doc.children[0].kind).toEqual({ type: 'Fixed', position: 'Footer' });
  });

  it('carries style, bookmark, and children', () => {
    const doc = parseIn(
      `<forme-fixed props='${attr({ position: 'footer', style: { paddingTop: 8 }, bookmark: 'F' })}'>` +
        `<forme-text props="{}">Page {{pageNumber}} of {{totalPages}}</forme-text>` +
        `</forme-fixed>`
    );
    expect(doc.children[0]).toEqual({
      kind: { type: 'Fixed', position: 'Footer' },
      style: { padding: { top: 8, right: 0, bottom: 0, left: 0 } },
      children: [
        {
          kind: { type: 'Text', content: 'Page {{pageNumber}} of {{totalPages}}' },
          style: {},
          children: [],
        },
      ],
      bookmark: 'F',
    });
  });
});

describe('element-context text', () => {
  it('wraps loose text in an anonymous Text node', () => {
    const doc = parseIn('<forme-view props="{}">loose text</forme-view>');
    expect(doc.children[0].children).toEqual([
      { kind: { type: 'Text', content: 'loose text' }, style: {}, children: [] },
    ]);
  });

  it('trims collapsed edge whitespace around loose text', () => {
    // The Svelte compiler collapses newline+indent to a single space
    // before the parser sees it
    const doc = parseIn('<forme-view props="{}"><forme-text props="{}">a</forme-text> loose</forme-view>');
    expect(doc.children[0].children).toEqual([
      { kind: { type: 'Text', content: 'a' }, style: {}, children: [] },
      { kind: { type: 'Text', content: 'loose' }, style: {}, children: [] },
    ]);
  });

  it('drops whitespace-only text between elements', () => {
    const doc = parseIn(
      '<forme-view props="{}"><forme-text props="{}">a</forme-text> <forme-text props="{}">b</forme-text></forme-view>'
    );
    expect(doc.children[0].children).toHaveLength(2);
  });

  it('drops loose whitespace and comments in the document context', () => {
    const doc = parseMarkup(
      '<forme-document props="{}"> <!--[--><forme-view props="{}"></forme-view><!--]--> </forme-document>'
    );
    expect(doc.children).toEqual([{ kind: { type: 'View' }, style: {}, children: [] }]);
  });
});

describe('document-level props', () => {
  it('maps metadata props', () => {
    const doc = parseMarkup(
      `<forme-document props='${attr({
        title: 'T',
        author: 'A',
        subject: 'S',
        creator: 'C',
        lang: 'en-US',
      })}'></forme-document>`
    );
    expect(doc.metadata).toEqual({ title: 'T', author: 'A', subject: 'S', creator: 'C', lang: 'en-US' });
  });

  it('maps style to defaultStyle and passes compliance flags through', () => {
    const doc = parseMarkup(
      `<forme-document props='${attr({
        style: { fontFamily: 'Helvetica' },
        tagged: true,
        pdfa: '2b',
        pdfUa: true,
      })}'></forme-document>`
    );
    expect(doc.defaultStyle).toEqual({ fontFamily: 'Helvetica' });
    expect(doc.tagged).toBe(true);
    expect(doc.pdfa).toBe('2b');
    expect(doc.pdfUa).toBe(true);
  });

  it('omits absent document-level keys entirely', () => {
    const doc = parseMarkup('<forme-document props="{}"></forme-document>');
    expect('defaultStyle' in doc).toBe(false);
    expect('tagged' in doc).toBe(false);
    expect('pdfa' in doc).toBe(false);
    expect('pdfUa' in doc).toBe(false);
    expect('certification' in doc).toBe(false);
  });

  it('passes certification through, and accepts deprecated signature with a warning', () => {
    const cert = { certificatePem: 'CERT', privateKeyPem: 'KEY', reason: 'Approved' };
    const doc = parseMarkup(`<forme-document props='${attr({ certification: cert })}'></forme-document>`);
    expect(doc.certification).toEqual(cert);

    const warnings: unknown[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));
    try {
      const doc2 = parseMarkup(`<forme-document props='${attr({ signature: cert })}'></forme-document>`);
      expect(doc2.certification).toEqual(cert);
      expect(warnings.join('\n')).toContain('signature');
    } finally {
      console.warn = original;
    }
  });

  it('appends loose content nodes to the last page', () => {
    const doc = parseIn(
      '<forme-page props="{}"></forme-page>' +
        '<forme-page props="{}"></forme-page>' +
        '<forme-view props="{}"></forme-view>'
    );
    expect(doc.children).toHaveLength(2);
    expect(doc.children[1].children).toEqual([{ kind: { type: 'View' }, style: {}, children: [] }]);
  });
});

describe('table', () => {
  it('maps fraction, fixed, and auto column widths', () => {
    const doc = parseIn(
      `<forme-table props='${attr({
        columns: [{ width: { fraction: 0.5 } }, { width: { fixed: 120 } }, { width: 'auto' }],
      })}'></forme-table>`
    );
    expect(doc.children[0].kind).toEqual({
      type: 'Table',
      columns: [{ width: { Fraction: 0.5 } }, { width: { Fixed: 120 } }, { width: 'Auto' }],
    });
  });

  it('defaults to no columns', () => {
    const doc = parseIn('<forme-table props="{}"></forme-table>');
    expect(doc.children[0].kind).toEqual({ type: 'Table', columns: [] });
  });

  it('maps the Row header flag, defaulting to false', () => {
    const doc = parseIn(
      `<forme-table props="{}">` +
        `<forme-row props='${attr({ header: true })}'></forme-row>` +
        `<forme-row props="{}"></forme-row>` +
        `</forme-table>`
    );
    expect(doc.children[0].children.map(r => r.kind)).toEqual([
      { type: 'TableRow', is_header: true },
      { type: 'TableRow', is_header: false },
    ]);
  });

  it('maps Cell spans, defaulting to 1', () => {
    const doc = parseIn(
      `<forme-table props="{}"><forme-row props="{}">` +
        `<forme-cell props='${attr({ colSpan: 3, rowSpan: 2 })}'></forme-cell>` +
        `<forme-cell props="{}"></forme-cell>` +
        `</forme-row></forme-table>`
    );
    expect(doc.children[0].children[0].children.map(c => c.kind)).toEqual([
      { type: 'TableCell', col_span: 3, row_span: 2 },
      { type: 'TableCell', col_span: 1, row_span: 1 },
    ]);
  });

  it('carries table, row, and cell styles', () => {
    const doc = parseIn(
      `<forme-table props='${attr({ style: { marginTop: 12 } })}'>` +
        `<forme-row props='${attr({ header: true, style: { backgroundColor: '#333' } })}'>` +
        `<forme-cell props='${attr({ style: { padding: 4 } })}'></forme-cell>` +
        `</forme-row></forme-table>`
    );
    const table = doc.children[0];
    expect(table.style.margin).toEqual({ top: 12, right: 0, bottom: 0, left: 0 });
    expect(table.children[0].style.backgroundColor).toEqual({ r: 0.2, g: 0.2, b: 0.2, a: 1 });
    expect(table.children[0].children[0].style.padding).toEqual({
      top: 4,
      right: 4,
      bottom: 4,
      left: 4,
    });
  });

  it('nests non-text cell content (views, nested text)', () => {
    const doc = parseIn(
      `<forme-table props="{}"><forme-row props="{}"><forme-cell props="{}">` +
        `<forme-view props='${attr({ style: { flexDirection: 'row' } })}'>` +
        `<forme-text props="{}">badge</forme-text>` +
        `</forme-view>` +
        `</forme-cell></forme-row></forme-table>`
    );
    const cell = doc.children[0].children[0].children[0];
    expect(cell.kind).toEqual({ type: 'TableCell', col_span: 1, row_span: 1 });
    expect(cell.children).toEqual([
      {
        kind: { type: 'View' },
        style: { flexDirection: 'Row' },
        children: [{ kind: { type: 'Text', content: 'badge' }, style: {}, children: [] }],
      },
    ]);
  });
});

describe('image', () => {
  it('parses a full image with dimensions, style, href, and alt', () => {
    const doc = parseIn(
      `<forme-image props='${attr({
        src: 'data:image/png;base64,iVBORw0KGgo=',
        width: 64,
        height: 48,
        style: { marginTop: 8 },
        href: 'https://formepdf.com',
        alt: 'Company logo',
      })}'></forme-image>`
    );
    const node = doc.children[0];
    expect(node.kind).toEqual({
      type: 'Image',
      src: 'data:image/png;base64,iVBORw0KGgo=',
      width: 64,
      height: 48,
    });
    expect(node.style.margin).toEqual({ top: 8, right: 0, bottom: 0, left: 0 });
    expect(node.href).toBe('https://formepdf.com');
    expect(node.alt).toBe('Company logo');
  });

  it('omits width/height when unset and keeps path srcs unresolved', () => {
    const doc = parseIn(`<forme-image props='${attr({ src: './assets/photo.jpg' })}'></forme-image>`);
    expect(doc.children[0]).toEqual({
      kind: { type: 'Image', src: './assets/photo.jpg' },
      style: {},
      children: [],
    });
  });

  it('passes src through byte-identical, including JSON- and HTML-hostile characters', () => {
    const src = 'data:image/png;base64,AB+/cd==?"quoted"&<tag>\\backé';
    const doc = parseIn(`<forme-image props='${attr({ src })}'></forme-image>`);
    expect((doc.children[0].kind as { src: string }).src).toBe(src);
  });
});

describe('svg', () => {
  it('parses dimensions, view_box, style, href, and alt', () => {
    const doc = parseIn(
      `<forme-svg props='${attr({
        width: 100,
        height: 80,
        viewBox: '0 0 100 80',
        content: '<circle cx="50" cy="40" r="10"/>',
        style: { marginBottom: 4 },
        href: 'https://formepdf.com/svg',
        alt: 'A circle',
      })}'></forme-svg>`
    );
    const node = doc.children[0];
    expect(node.kind).toEqual({
      type: 'Svg',
      width: 100,
      height: 80,
      view_box: '0 0 100 80',
      content: '<circle cx="50" cy="40" r="10"/>',
    });
    expect(node.style.margin).toEqual({ top: 0, right: 0, bottom: 4, left: 0 });
    expect(node.href).toBe('https://formepdf.com/svg');
    expect(node.alt).toBe('A circle');
  });

  it('round-trips content with quotes, angle brackets, and ampersands intact', () => {
    const content =
      '<path d="M10 10 L90 90" stroke="#c00" stroke-width="2"/><text>a &amp; b < c > "d"</text>';
    const doc = parseIn(`<forme-svg props='${attr({ width: 10, height: 10, content })}'></forme-svg>`);
    expect((doc.children[0].kind as { content: string }).content).toBe(content);
  });

  it('defaults content to an empty string and omits view_box when unset', () => {
    const doc = parseIn(`<forme-svg props='${attr({ width: 20, height: 20 })}'></forme-svg>`);
    expect(doc.children[0].kind).toEqual({ type: 'Svg', width: 20, height: 20, content: '' });
  });
});

describe('qrcode', () => {
  it('parses data with optional size and maps color into style', () => {
    const doc = parseIn(
      `<forme-qrcode props='${attr({ data: 'https://formepdf.com', size: 96, color: '#1a365d' })}'></forme-qrcode>`
    );
    const node = doc.children[0];
    expect(node.kind).toEqual({ type: 'QrCode', data: 'https://formepdf.com', size: 96 });
    expect(node.style.color).toEqual(parseColor('#1a365d'));
    expect(node.children).toEqual([]);
  });

  it('omits size and color when unset', () => {
    const doc = parseIn(`<forme-qrcode props='${attr({ data: 'plain' })}'></forme-qrcode>`);
    expect(doc.children[0]).toEqual({
      kind: { type: 'QrCode', data: 'plain' },
      style: {},
      children: [],
    });
  });
});

describe('barcode', () => {
  it('parses explicit format, dimensions, and color', () => {
    const doc = parseIn(
      `<forme-barcode props='${attr({
        data: 'TKT-0042',
        format: 'Code39',
        width: 220,
        height: 50,
        color: '#333333',
      })}'></forme-barcode>`
    );
    const node = doc.children[0];
    expect(node.kind).toEqual({
      type: 'Barcode',
      data: 'TKT-0042',
      format: 'Code39',
      width: 220,
      height: 50,
    });
    expect(node.style.color).toEqual(parseColor('#333333'));
  });

  it('defaults format to Code128 and height to 60, omitting width', () => {
    const doc = parseIn(`<forme-barcode props='${attr({ data: 'ABC-123' })}'></forme-barcode>`);
    expect(doc.children[0]).toEqual({
      kind: { type: 'Barcode', data: 'ABC-123', format: 'Code128', height: 60 },
      style: {},
      children: [],
    });
  });
});

describe('canvas', () => {
  it('parses dimensions, the recorded operation list, and style', () => {
    const operations = [
      { op: 'SetFillColor', r: 59, g: 130, b: 246 },
      { op: 'Rect', x: 10, y: 10, width: 80, height: 40 },
      { op: 'Fill' },
      { op: 'Arc', cx: 60, cy: 60, r: 25, start_angle: 0, end_angle: 4.71, counterclockwise: false },
      { op: 'Stroke' },
    ];
    const doc = parseIn(
      `<forme-canvas props='${attr({ width: 200, height: 110, operations, style: { marginBottom: 8 } })}'></forme-canvas>`
    );
    const node = doc.children[0];
    expect(node.kind).toEqual({ type: 'Canvas', width: 200, height: 110, operations });
    expect(node.style.margin).toEqual({ top: 0, right: 0, bottom: 8, left: 0 });
    expect(node.children).toEqual([]);
  });

  it('keeps an empty operation list', () => {
    const doc = parseIn(
      `<forme-canvas props='${attr({ width: 50, height: 50, operations: [] })}'></forme-canvas>`
    );
    expect(doc.children[0]).toEqual({
      kind: { type: 'Canvas', width: 50, height: 50, operations: [] },
      style: {},
      children: [],
    });
  });
});

describe('watermark', () => {
  it('parses text with explicit fontSize, rgba color, and angle', () => {
    const doc = parseIn(
      `<forme-watermark props='${attr({
        text: 'DRAFT',
        fontSize: 72,
        color: 'rgba(200,30,30,0.15)',
        angle: -30,
      })}'></forme-watermark>`
    );
    const node = doc.children[0];
    expect(node.kind).toEqual({ type: 'Watermark', text: 'DRAFT', font_size: 72, angle: -30 });
    expect(node.style.color).toEqual({ r: 200 / 255, g: 30 / 255, b: 30 / 255, a: 1 });
    expect(node.style.opacity).toBeCloseTo(0.15);
    expect(node.style.fontSize).toBe(72);
  });

  it('defaults fontSize 60, angle -45, color rgba(0,0,0,0.1)', () => {
    const doc = parseIn(`<forme-watermark props='${attr({ text: 'CONFIDENTIAL' })}'></forme-watermark>`);
    const node = doc.children[0];
    expect(node.kind).toEqual({ type: 'Watermark', text: 'CONFIDENTIAL', font_size: 60, angle: -45 });
    expect(node.style.color).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(node.style.opacity).toBeCloseTo(0.1);
    expect(node.style.fontSize).toBe(60);
  });

  it('multiplies the color alpha with an explicit style opacity', () => {
    const doc = parseIn(
      `<forme-watermark props='${attr({
        text: 'X',
        color: 'rgba(0,0,0,0.5)',
        style: { opacity: 0.5 },
      })}'></forme-watermark>`
    );
    expect(doc.children[0].style.opacity).toBeCloseTo(0.25);
  });
});

describe('page break', () => {
  it('parses to a bare PageBreak node', () => {
    const doc = parseIn('<forme-page-break></forme-page-break>');
    expect(doc.children).toEqual([{ kind: { type: 'PageBreak' }, style: {}, children: [] }]);
  });
});

describe('errors', () => {
  it('rejects a Page nested outside Document', () => {
    expect(() =>
      parseIn('<forme-view props="{}"><forme-page props="{}"></forme-page></forme-view>')
    ).toThrow('Invalid nesting: <Page> found inside <View>. <Page> must be a direct child of <Document>.');
  });

  it('rejects a Row outside a Table and a Cell outside a Row', () => {
    expect(() =>
      parseIn('<forme-view props="{}"><forme-row props="{}"></forme-row></forme-view>')
    ).toThrow(
      'Invalid nesting: <Row> found inside <View>. <Row> must be inside a <Table>. Wrap it: <Table><Row>...</Row></Table>'
    );
    expect(() =>
      parseIn('<forme-table props="{}"><forme-cell props="{}"></forme-cell></forme-table>')
    ).toThrow(
      'Invalid nesting: <Cell> found inside <Table>. <Cell> must be inside a <Row>. Wrap it: <Row><Cell>...</Cell></Row>'
    );
  });

  it('suggests the Forme component for known HTML elements', () => {
    expect(() => parseIn('<div>x</div>')).toThrow(
      'HTML element <div> is not supported. Use <View> instead.'
    );
    expect(() => parseIn('<span>x</span>')).toThrow(
      'HTML element <span> is not supported. Use <Text> instead.'
    );
  });

  it('rejects unknown elements', () => {
    expect(() => parseIn('<marquee>x</marquee>')).toThrow(
      'Unsupported element <marquee> in a Forme template.'
    );
  });

  it('names the component when the props attribute is not valid JSON', () => {
    expect(() => parseIn('<forme-text props="{oops">x</forme-text>')).toThrow(
      /\[Forme\] <Text>: failed to decode props/
    );
  });
});
