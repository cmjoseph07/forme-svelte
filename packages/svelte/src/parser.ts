/**
 * Markup parser: Svelte SSR output in, Forme document model out.
 *
 * The Forme Svelte components render namespaced placeholder tags
 * (`<forme-document>`, `<forme-page>`, `<forme-view>`, `<forme-text>`)
 * with a single `props` attribute holding the JSON-encoded component
 * props. This module parses that markup — the emitting components and
 * this parser are a matched pair inside this package. The placeholder
 * tag/attribute vocabulary is an INTERNAL contract, not a public
 * format: it may change in any release without notice.
 *
 * Whitespace is normalized to JSX-equivalent semantics so that a
 * `.svelte` template and its TSX counterpart serialize identically:
 * indentation and newlines never leak into text content, while
 * interior spaces and interpolation boundaries are preserved. The
 * Svelte compiler trims fragment edges and collapses inter-element
 * whitespace before we ever see the markup, so the remaining rules
 * are applied here (see `cleanJsxText`). Known divergences from JSX,
 * where the compiler destroys the distinction before serialization —
 * each matches how Svelte itself renders the template to the DOM:
 *
 * - Same-line leading/trailing spaces inside `<Text>` are trimmed
 *   (`<Text> a </Text>` → `"a"`; JSX keeps them).
 * - Interpolations split across lines join with a single space
 *   (JSX drops the whitespace-only literal between them entirely).
 * - Newlines inside interpolated *values* are treated like template
 *   text and collapse to a space.
 */

import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  buildAreaChartKind,
  buildBarChartKind,
  buildDotPlotKind,
  buildLineChartKind,
  buildPieChartKind,
  expandEdges,
  mapColumnWidth,
  mapStyle,
  parseColor,
} from '@formepdf/shared';
import type {
  BarcodeFormat,
  CanvasOp,
  CertificationConfig,
  ColumnDef,
  Edges,
  FormeColumnDef,
  FormeDocument,
  FormeEdges,
  FormeNode,
  FormeNodeKind,
  FormePageConfig,
  FormePageSize,
  Style,
  TextRun,
} from '@formepdf/shared';

/** The slice of a chart placeholder's props the parser handles itself:
 *  every chart carries an optional style; the rest is chart-specific
 *  and typed by its shared kind builder. */
interface ChartPlaceholderProps {
  style?: Style;
}

type P5Node = DefaultTreeAdapterMap['childNode'];
type P5Element = DefaultTreeAdapterMap['element'];

type P5Text = DefaultTreeAdapterMap['textNode'];

function isElement(node: P5Node): node is P5Element {
  return 'tagName' in node;
}

function isText(node: P5Node): node is P5Text {
  return node.nodeName === '#text';
}

/**
 * Parse placeholder markup emitted by the Forme Svelte components into
 * a Forme JSON document object. The markup must contain a single
 * `<forme-document>` root element.
 */
interface DocumentProps {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  lang?: string;
  style?: Style;
  tagged?: boolean;
  pdfa?: '2a' | '2b';
  pdfUa?: boolean;
  certification?: CertificationConfig;
  /** @deprecated Use certification */
  signature?: CertificationConfig;
}

export function parseMarkup(markup: string): FormeDocument {
  const fragment = parseFragment(markup);
  const root = findDocumentRoot(fragment.childNodes);

  const props = decodeProps(root, 'Document') as DocumentProps;

  // Separate Page children from content children
  const pageNodes: FormeNode[] = [];
  const contentNodes: FormeNode[] = [];
  for (const child of root.childNodes) {
    if (isElement(child) && child.tagName === 'forme-page') {
      pageNodes.push(parsePage(child));
    } else {
      const node = parseChild(child, 'Document');
      if (node) contentNodes.push(node);
    }
  }

  // If there are page nodes, use them. Otherwise the content stands alone.
  let children: FormeNode[];
  if (pageNodes.length > 0) {
    // Any loose content nodes get added to the last page's children
    if (contentNodes.length > 0) {
      const lastPage = pageNodes[pageNodes.length - 1];
      lastPage.children.push(...contentNodes);
    }
    children = pageNodes;
  } else {
    children = contentNodes;
  }

  const metadata: FormeDocument['metadata'] = {};
  if (props.title !== undefined) metadata.title = props.title;
  if (props.author !== undefined) metadata.author = props.author;
  if (props.subject !== undefined) metadata.subject = props.subject;
  if (props.creator !== undefined) metadata.creator = props.creator;
  if (props.lang !== undefined) metadata.lang = props.lang;

  const result: FormeDocument = {
    children,
    metadata,
    defaultPage: {
      size: 'A4',
      margin: { top: 54, right: 54, bottom: 54, left: 54 },
      wrap: true,
    },
  };

  if (props.style) result.defaultStyle = mapStyle(props.style);
  if (props.tagged !== undefined) result.tagged = props.tagged;
  if (props.pdfa !== undefined) result.pdfa = props.pdfa;
  if (props.pdfUa) result.pdfUa = true;
  const cert = props.certification ?? props.signature;
  if (cert) {
    if (props.signature && !props.certification) {
      console.warn('[Forme] The `signature` prop is deprecated. Use `certification` instead.');
    }
    result.certification = cert;
  }

  return result;
}

// ─── Node dispatch ───────────────────────────────────────────────────

type ParentContext = 'Document' | 'Page' | 'View' | 'Table' | 'Row' | 'Cell' | 'Fixed' | null;

/**
 * Parse one markup node into a Forme node. Returns null for nodes that
 * produce no output (comments, i.e. Svelte SSR block anchors, and
 * whitespace-only text between elements).
 */
function parseChild(node: P5Node, parent: ParentContext): FormeNode | null {
  if (isElement(node)) {
    return parseElement(node, parent);
  }
  if (isText(node)) {
    // Loose text directly inside a container becomes an anonymous Text
    // node. Edges are trimmed: the Svelte compiler collapses the
    // whitespace around inter-element newlines to a single space, so
    // by the time the markup reaches the parser, indentation and
    // intentional edge spaces are indistinguishable.
    const content = cleanJsxText(node.value).replace(/^[ \t]+|[ \t]+$/g, '');
    if (content === '') return null;
    return {
      kind: { type: 'Text', content },
      style: {},
      children: [],
    };
  }
  return null;
}

function parseElement(element: P5Element, parent: ParentContext): FormeNode | null {
  switch (element.tagName) {
    case 'forme-view':
      return parseView(element);
    case 'forme-text':
      return parseText(element);
    case 'forme-table':
      return parseTable(element);
    case 'forme-row':
      validateNesting('Row', parent);
      return parseRow(element);
    case 'forme-cell':
      validateNesting('Cell', parent);
      return parseCell(element);
    case 'forme-fixed':
      return parseFixed(element);
    case 'forme-image':
      return parseImage(element);
    case 'forme-svg':
      return parseSvg(element);
    case 'forme-qrcode':
      return parseQrCode(element);
    case 'forme-barcode':
      return parseBarcode(element);
    case 'forme-canvas':
      return parseCanvas(element);
    case 'forme-watermark':
      return parseWatermark(element);
    case 'forme-bar-chart':
      return parseChart(element, 'BarChart', buildBarChartKind);
    case 'forme-line-chart':
      return parseChart(element, 'LineChart', buildLineChartKind);
    case 'forme-pie-chart':
      return parseChart(element, 'PieChart', buildPieChartKind);
    case 'forme-area-chart':
      return parseChart(element, 'AreaChart', buildAreaChartKind);
    case 'forme-dot-plot':
      return parseChart(element, 'DotPlot', buildDotPlotKind);
    case 'forme-page-break':
      return { kind: { type: 'PageBreak' }, style: {}, children: [] };
    case 'forme-page':
      validateNesting('Page', parent);
      return parsePage(element);
    default:
      throw unknownElementError(element.tagName);
  }
}

// ─── Nesting validation ──────────────────────────────────────────────

const VALID_PARENTS: Record<string, { allowed: ParentContext[]; suggestion: string }> = {
  Page: {
    allowed: ['Document'],
    suggestion: '<Page> must be a direct child of <Document>.',
  },
  Row: {
    allowed: ['Table'],
    suggestion: '<Row> must be inside a <Table>. Wrap it: <Table><Row>...</Row></Table>',
  },
  Cell: {
    allowed: ['Row'],
    suggestion: '<Cell> must be inside a <Row>. Wrap it: <Row><Cell>...</Cell></Row>',
  },
};

function validateNesting(componentName: string, parent: ParentContext): void {
  const rule = VALID_PARENTS[componentName];
  if (!rule) return;
  if (parent !== null && !rule.allowed.includes(parent)) {
    throw new Error(
      `Invalid nesting: <${componentName}> found inside <${parent}>. ${rule.suggestion}`
    );
  }
}

// ─── Unknown elements ────────────────────────────────────────────────

const HTML_SUGGESTIONS: Record<string, string> = {
  div: 'View', span: 'Text', p: 'Text', h1: 'Text', h2: 'Text',
  h3: 'Text', img: 'Image', table: 'Table', tr: 'Row', td: 'Cell',
};

function unknownElementError(tagName: string): Error {
  const suggestion = HTML_SUGGESTIONS[tagName];
  if (suggestion) {
    return new Error(`HTML element <${tagName}> is not supported. Use <${suggestion}> instead.`);
  }
  return new Error(`Unsupported element <${tagName}> in a Forme template.`);
}

function parseChildren(nodes: P5Node[], parent: ParentContext): FormeNode[] {
  const children: FormeNode[] = [];
  for (const node of nodes) {
    const child = parseChild(node, parent);
    if (child) children.push(child);
  }
  return children;
}

// ─── Page ────────────────────────────────────────────────────────────

interface PageProps {
  size?: string | { width: number; height: number };
  margin?: number | string | number[] | Edges;
  style?: Style;
  backgroundImage?: string;
  backgroundOpacity?: number;
  backgroundSize?: 'fill' | 'cover' | 'contain';
  backgroundPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

function parsePage(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Page') as PageProps;

  let size: FormePageSize = 'A4';
  if (props.size !== undefined) {
    if (typeof props.size === 'string') {
      size = props.size as FormePageSize;
    } else {
      size = { Custom: { width: props.size.width, height: props.size.height } };
    }
  }

  let margin: FormeEdges = { top: 54, right: 54, bottom: 54, left: 54 };
  if (props.margin !== undefined) {
    margin = expandEdges(props.margin);
  }

  const config: FormePageConfig = { size, margin, wrap: true };
  if (props.backgroundImage !== undefined) config.backgroundImage = props.backgroundImage;
  if (props.backgroundOpacity !== undefined) config.backgroundOpacity = props.backgroundOpacity;
  if (props.backgroundSize !== undefined) config.backgroundSize = props.backgroundSize;
  if (props.backgroundPosition !== undefined) config.backgroundPosition = props.backgroundPosition;

  return {
    kind: { type: 'Page', config },
    style: props.style ? mapStyle(props.style) : {},
    children: parseChildren(element.childNodes, 'Page'),
  };
}

// ─── View ────────────────────────────────────────────────────────────

interface ViewProps {
  style?: Style;
  wrap?: boolean;
  bookmark?: string;
  href?: string;
}

function parseView(element: P5Element): FormeNode {
  const props = decodeProps(element, 'View') as ViewProps;
  const style = mapStyle(props.style);
  if (props.wrap !== undefined) {
    style.wrap = props.wrap;
  }

  const node: FormeNode = {
    kind: { type: 'View' },
    style,
    children: parseChildren(element.childNodes, 'View'),
  };
  if (props.bookmark) node.bookmark = props.bookmark;
  if (props.href) node.href = props.href;

  return node;
}

// ─── Text ────────────────────────────────────────────────────────────

interface TextProps {
  style?: Style;
  href?: string;
  bookmark?: string;
}

function parseText(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Text') as TextProps;

  const kind: FormeNode['kind'] = { type: 'Text', content: '' };
  const runs = textRunsOf(element.childNodes);
  if (runs) {
    kind.runs = runs;
  } else {
    kind.content = textContentOf(element.childNodes);
  }
  if (props.href) kind.href = props.href;

  const node: FormeNode = {
    kind,
    style: mapStyle(props.style),
    children: [],
  };
  if (props.bookmark) node.bookmark = props.bookmark;

  return node;
}

/**
 * Build styled text runs from a Text element's children, mirroring the
 * react adapter: only used when at least one direct child is a nested
 * `<Text>` (returns null otherwise). Plain text chunks become unstyled
 * runs; each nested `<Text>` becomes one run carrying its own
 * style/href with all its descendant text merged (deeper nesting
 * flattens — a run has exactly one style). Elements other than
 * `<Text>` are skipped but still split the surrounding text into
 * separate runs, as react's per-child loop does.
 */
function textRunsOf(nodes: P5Node[]): TextRun[] | null {
  if (!nodes.some(n => isElement(n) && n.tagName === 'forme-text')) return null;

  const runs: TextRun[] = [];
  let buffer = '';
  const flush = () => {
    const content = cleanJsxText(buffer);
    buffer = '';
    // JSX drops whitespace-only literals spanning lines but keeps
    // same-line spaces between spans; cleanJsxText reproduces that,
    // leaving only genuinely empty chunks to discard.
    if (content !== '') runs.push({ content });
  };

  for (const node of nodes) {
    if (isText(node)) {
      buffer += node.value;
    } else if (isElement(node)) {
      flush();
      if (node.tagName !== 'forme-text') continue;
      const props = decodeProps(node, 'Text') as TextProps;
      const run: TextRun = { content: textContentOf(node.childNodes) };
      if (props.style) run.style = mapStyle(props.style);
      if (props.href) run.href = props.href;
      runs.push(run);
    }
    // Comments (SSR block anchors) fall through: the text around them
    // stays one contiguous chunk.
  }
  flush();
  return runs;
}

/**
 * Extract the merged text content of a Text element's children.
 * Comments (Svelte SSR block anchors) vanish and the text around them
 * is treated as one contiguous chunk, so `{#if}`/`{#each}` boundaries
 * inside a `<Text>` never introduce breaks. Element children
 * contribute their own descendant text (react's flattenTextContent
 * recurses the same way).
 */
function textContentOf(nodes: P5Node[]): string {
  return cleanJsxText(rawTextOf(nodes));
}

function rawTextOf(nodes: P5Node[]): string {
  let merged = '';
  for (const node of nodes) {
    if (isText(node)) merged += node.value;
    else if (isElement(node)) merged += rawTextOf(node.childNodes);
  }
  return merged;
}

// ─── Table ───────────────────────────────────────────────────────────

interface TableProps {
  columns?: ColumnDef[];
  style?: Style;
}

function parseTable(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Table') as TableProps;
  const columns: FormeColumnDef[] = (props.columns ?? []).map(col => ({
    width: mapColumnWidth(col.width),
  }));

  return {
    kind: { type: 'Table', columns },
    style: mapStyle(props.style),
    children: parseChildren(element.childNodes, 'Table'),
  };
}

interface RowProps {
  header?: boolean;
  style?: Style;
}

function parseRow(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Row') as RowProps;

  return {
    kind: { type: 'TableRow', is_header: props.header ?? false },
    style: mapStyle(props.style),
    children: parseChildren(element.childNodes, 'Row'),
  };
}

interface CellProps {
  colSpan?: number;
  rowSpan?: number;
  style?: Style;
}

function parseCell(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Cell') as CellProps;

  return {
    kind: { type: 'TableCell', col_span: props.colSpan ?? 1, row_span: props.rowSpan ?? 1 },
    style: mapStyle(props.style),
    children: parseChildren(element.childNodes, 'Cell'),
  };
}

// ─── Fixed ───────────────────────────────────────────────────────────

interface FixedProps {
  position?: 'header' | 'footer';
  style?: Style;
  bookmark?: string;
}

function parseFixed(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Fixed') as FixedProps;
  // Mirrors react: anything other than 'header' falls back to Footer.
  const position = props.position === 'header' ? ('Header' as const) : ('Footer' as const);

  const node: FormeNode = {
    kind: { type: 'Fixed', position },
    style: mapStyle(props.style),
    children: parseChildren(element.childNodes, 'Fixed'),
  };
  if (props.bookmark) node.bookmark = props.bookmark;

  return node;
}

// ─── Media leaves ────────────────────────────────────────────────────

interface ImageProps {
  src: string;
  width?: number;
  height?: number;
  style?: Style;
  href?: string;
  alt?: string;
}

function parseImage(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Image') as ImageProps;

  const kind: FormeNodeKind = { type: 'Image', src: props.src };
  if (props.width !== undefined) kind.width = props.width;
  if (props.height !== undefined) kind.height = props.height;

  const node: FormeNode = {
    kind,
    style: mapStyle(props.style),
    children: [],
  };
  if (props.href) node.href = props.href;
  if (props.alt) node.alt = props.alt;
  return node;
}

interface SvgProps {
  width: number;
  height: number;
  viewBox?: string;
  content?: string;
  style?: Style;
  href?: string;
  alt?: string;
}

function parseSvg(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Svg') as SvgProps;

  const kind: FormeNodeKind = {
    type: 'Svg',
    width: props.width,
    height: props.height,
    content: props.content ?? '',
  };
  if (props.viewBox) kind.view_box = props.viewBox;

  const node: FormeNode = {
    kind,
    style: mapStyle(props.style),
    children: [],
  };
  if (props.href) node.href = props.href;
  if (props.alt) node.alt = props.alt;
  return node;
}

interface QrCodeProps {
  data: string;
  size?: number;
  color?: string;
  style?: Style;
}

function parseQrCode(element: P5Element): FormeNode {
  const props = decodeProps(element, 'QrCode') as QrCodeProps;

  const kind: FormeNodeKind = { type: 'QrCode', data: props.data };
  if (props.size !== undefined) kind.size = props.size;

  const style = mapStyle(props.style);
  if (props.color) style.color = parseColor(props.color);

  return { kind, style, children: [] };
}

interface BarcodeProps {
  data: string;
  format?: BarcodeFormat;
  width?: number;
  height?: number;
  color?: string;
  style?: Style;
}

function parseBarcode(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Barcode') as BarcodeProps;

  const kind: FormeNodeKind = {
    type: 'Barcode',
    data: props.data,
    format: props.format ?? 'Code128',
    height: props.height ?? 60,
  };
  if (props.width !== undefined) kind.width = props.width;

  const style = mapStyle(props.style);
  if (props.color) style.color = parseColor(props.color);

  return { kind, style, children: [] };
}

// ─── Vector extras ───────────────────────────────────────────────────

interface CanvasProps {
  width: number;
  height: number;
  /** Recorded by the emitting component, which executes the user's
   *  `draw` callback at emit time (the callback itself cannot survive
   *  the attribute round-trip). */
  operations: CanvasOp[];
  style?: Style;
}

function parseCanvas(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Canvas') as CanvasProps;

  return {
    kind: { type: 'Canvas', width: props.width, height: props.height, operations: props.operations },
    style: mapStyle(props.style),
    children: [],
  };
}

interface WatermarkProps {
  text: string;
  fontSize?: number;
  color?: string;
  angle?: number;
  style?: Style;
}

function parseWatermark(element: P5Element): FormeNode {
  const props = decodeProps(element, 'Watermark') as WatermarkProps;
  const fontSize = props.fontSize ?? 60;
  const angle = props.angle ?? -45;

  // Mirrors react: the color's alpha channel becomes opacity (multiplied
  // with any style opacity); the stored color itself is fully opaque.
  const parsed = parseColor(props.color ?? 'rgba(0,0,0,0.1)');
  const style = mapStyle(props.style);
  style.color = { r: parsed.r, g: parsed.g, b: parsed.b, a: 1 };
  style.opacity = parsed.a * (style.opacity ?? 1);
  style.fontSize = fontSize;

  return {
    kind: { type: 'Watermark', text: props.text, font_size: fontSize, angle },
    style,
    children: [],
  };
}

// ─── Charts ──────────────────────────────────────────────────────────

/**
 * Parse one chart placeholder. The camelCase-to-snake_case prop
 * mapping (and its defaults) lives in the shared kind builders, the
 * same functions the react adapter serializes with, so the two
 * adapters cannot drift.
 */
function parseChart<P extends ChartPlaceholderProps>(
  element: P5Element,
  component: string,
  buildKind: (props: P) => FormeNodeKind
): FormeNode {
  const props = decodeProps(element, component) as P;

  return {
    kind: buildKind(props),
    style: mapStyle(props.style),
    children: [],
  };
}

// ─── Whitespace normalization ────────────────────────────────────────

/**
 * Normalize template text to JSX-equivalent semantics — the same
 * algorithm Babel, TypeScript, and esbuild apply to JSX text literals:
 *
 * - lines are trimmed (leading whitespace on all but the first line,
 *   trailing whitespace on all but the last line) and joined with a
 *   single space; whitespace-only lines are dropped
 * - tabs count as spaces
 * - only ASCII space/tab are trimmed, so non-breaking spaces survive
 */
function cleanJsxText(text: string): string {
  const lines = text.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) lastNonEmptyLine = i;
  }

  let str = '';
  for (let i = 0; i < lines.length; i++) {
    const isFirstLine = i === 0;
    const isLastLine = i === lines.length - 1;
    const isLastNonEmptyLine = i === lastNonEmptyLine;

    let trimmed = lines[i].replace(/\t/g, ' ');
    if (!isFirstLine) trimmed = trimmed.replace(/^ +/, '');
    if (!isLastLine) trimmed = trimmed.replace(/ +$/, '');

    if (trimmed) {
      if (!isLastNonEmptyLine) trimmed += ' ';
      str += trimmed;
    }
  }
  return str;
}

function findDocumentRoot(nodes: P5Node[]): P5Element {
  for (const node of nodes) {
    if (isElement(node) && node.tagName === 'forme-document') {
      return node;
    }
  }
  throw new Error('Top-level element must be <Document>');
}

/** Decode the JSON `props` attribute of a placeholder element. */
function decodeProps(element: P5Element, component: string): unknown {
  const attr = element.attrs.find(a => a.name === 'props');
  if (attr === undefined) return {};
  try {
    return JSON.parse(attr.value) as unknown;
  } catch (err) {
    throw new Error(
      `[Forme] <${component}>: failed to decode props attribute: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
