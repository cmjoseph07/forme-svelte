import { describe, it, expect } from 'vitest';
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

describe('errors', () => {
  it('rejects a Page nested outside Document', () => {
    expect(() =>
      parseIn('<forme-view props="{}"><forme-page props="{}"></forme-page></forme-view>')
    ).toThrow('Invalid nesting: <Page> found inside <View>. <Page> must be a direct child of <Document>.');
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
