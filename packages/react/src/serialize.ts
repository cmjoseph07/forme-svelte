import { type ReactElement, type ReactNode, isValidElement, Children, Fragment } from 'react';
import { Document, Page, View, Text, Strong, Em, Code, Link, Image, Table, Row, Cell, Fixed, Svg, QrCode, Barcode, Canvas, Watermark, PageBreak, BarChart, LineChart, PieChart, AreaChart, DotPlot, TextField, Checkbox, Dropdown, RadioButton } from './components.js';
import { Font, type FontRegistration } from './font.js';
import {
  isRefMarker, getRefPath,
  isEachMarker, getEachPath, getEachTemplate,
  isExprMarker, getExpr,
  REF_SENTINEL, REF_SENTINEL_END,
} from './template-proxy.js';
import type {
  Style,
  Edges,
  Corners,
  EdgeColors,
  ColumnDef,
  TextRun,
  GridTrackSize,
  DocumentProps,
  FormeDocument,
  FormeFont,
  FormeNode,
  FormeNodeKind,
  FormeStyle,
  FormePageConfig,
  FormePageSize,
  FormeEdges,
  FormeMarginEdges,
  FormeColumnDef,
  FormeColumnWidth,
  FormeDimension,
  FormeColor,
  FormeBoxShadow,
  FormeBackground,
  FormeGradientStop,
  FormeEdgeValues,
  FormeCornerValues,
  FormeGridTrackSize,
  FormeGridPlacement,
  QrCodeProps,
  BarcodeProps,
  CanvasProps,
  CanvasOp,
  CanvasContext,
  WatermarkProps,
  BarChartProps,
  LineChartProps,
  PieChartProps,
  AreaChartProps,
  DotPlotProps,
  TextFieldProps,
  CheckboxProps,
  DropdownProps,
  RadioButtonProps,
} from './types.js';

// ─── Nesting validation ──────────────────────────────────────────────

type ParentContext = 'Document' | 'Page' | 'View' | 'Table' | 'Row' | 'Cell' | 'Fixed' | null;

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

// ─── Source location extraction ─────────────────────────────────────

function extractSourceLocation(element: ReactElement): { file: string; line: number; column: number } | undefined {
  // Check globalThis.__formeSourceMap (populated by CLI dev server's JSX shim for React 19+)
  const map = (globalThis as any).__formeSourceMap as WeakMap<object, { file: string; line: number; column: number }> | undefined;
  if (map) {
    const source = map.get(element);
    if (source) return source;
  }
  // Fallback to _source for React 18 and earlier
  const s = (element as any)._source;
  if (s && s.fileName) {
    return { file: s.fileName, line: s.lineNumber, column: s.columnNumber };
  }
  return undefined;
}

// ─── Version-independent type checks ─────────────────────────────────

/**
 * Check if a component type is `Document`, even across different package versions.
 * Uses `__formeType` marker first (survives minification), then falls back to
 * `displayName` / `name` for legacy builds without the marker.
 */
function isDocumentType(type: unknown): boolean {
  if (type === Document) return true;
  if (typeof type === 'function') {
    return (type as any).__formeType === 'Document'
      || (type as any).displayName === 'Document'
      || (type as any).name === 'Document';
  }
  return false;
}

// ─── Component resolution ────────────────────────────────────────────

/**
 * Resolve wrapper function components (e.g. `<MyReport data={...} />`) by
 * calling them until we reach a Forme primitive like `<Document>`. This lets
 * users pass custom components directly to `renderDocument()` /
 * `serialize()` without manually invoking them first.
 */
function resolveElement(element: ReactElement): ReactElement {
  let resolved = element;
  for (let i = 0; i < 10 && typeof resolved.type === 'function' && !isDocumentType(resolved.type); i++) {
    const result = callComponent(resolved.type as (props: unknown) => ReactElement, resolved.props);
    if (!isValidElement(result)) break;
    resolved = result;
  }
  return resolved;
}

/**
 * Call a function component directly (outside React's render cycle).
 * React Compiler injects `useMemoCache` hooks into compiled components,
 * which throws when called outside a render context. We catch that and
 * give a clear error message pointing to the `'use no memo'` directive.
 */
function callComponent(fn: (props: unknown) => unknown, props: unknown): unknown {
  try {
    return fn(props);
  } catch (err) {
    if (err instanceof Error && /hook|useMemoCache|Invalid hook call/i.test(err.message)) {
      const name = (fn as any).displayName || fn.name || 'Unknown';
      throw new Error(
        `Component "${name}" appears to be compiled by React Compiler, which injects hooks ` +
        `that cannot run outside of React's render cycle. Forme's serialize() calls components ` +
        `directly to walk the element tree.\n\n` +
        `Fix: Add 'use no memo' at the top of the component to opt it out of React Compiler:\n\n` +
        `  function ${name}(props) {\n` +
        `    'use no memo';\n` +
        `    return <Document>...</Document>;\n` +
        `  }\n\n` +
        `Alternatively, call the component yourself before passing to renderDocument():\n\n` +
        `  const element = <${name} data={data} />;\n` +
        `  // becomes:\n` +
        `  const element = ${name}({ data });\n` +
        `  await renderDocument(element);`
      );
    }
    throw err;
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Serialize a React element tree into a Forme JSON document object.
 * The top-level element must be a <Document> (or a component that returns one).
 */
export function serialize(element: ReactElement): FormeDocument {
  element = resolveElement(element);

  if (!isDocumentType(element.type)) {
    throw new Error('Top-level element must be <Document>');
  }

  const props = element.props as DocumentProps & { children?: unknown };
  const childElements = flattenChildren(props.children);

  // Separate Page children from content children
  const pageNodes: FormeNode[] = [];
  const contentNodes: FormeNode[] = [];

  for (const child of childElements) {
    if (isValidElement(child) && child.type === Page) {
      pageNodes.push(serializePage(child));
    } else {
      const node = serializeChild(child, 'Document');
      if (node) contentNodes.push(node);
    }
  }

  // If there are page nodes, use them. Otherwise wrap content in a default page.
  let children: FormeNode[];
  if (pageNodes.length > 0) {
    // Any loose content nodes get added to the last page's children
    if (contentNodes.length > 0) {
      const lastPage = pageNodes[pageNodes.length - 1];
      lastPage.children.push(...contentNodes);
    }
    children = pageNodes;
  } else if (contentNodes.length > 0) {
    children = contentNodes;
  } else {
    children = [];
  }

  const metadata: FormeDocument['metadata'] = {};
  if (props.title !== undefined) metadata.title = props.title;
  if (props.author !== undefined) metadata.author = props.author;
  if (props.subject !== undefined) metadata.subject = props.subject;
  if (props.creator !== undefined) metadata.creator = props.creator;
  if (props.lang !== undefined) metadata.lang = props.lang;

  // Merge global + document fonts (document fonts override on conflict)
  const mergedFonts = mergeFonts(Font.getRegistered(), props.fonts);

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

  if (mergedFonts.length > 0) {
    result.fonts = mergedFonts;
  }

  return result;
}

// ─── Page serialization ──────────────────────────────────────────────

function serializePage(element: ReactElement): FormeNode {
  const props = element.props as {
    size?: string | { width: number; height: number };
    margin?: number | string | number[] | Edges;
    style?: Style;
    children?: unknown;
    backgroundImage?: string;
    backgroundOpacity?: number;
    backgroundSize?: 'fill' | 'cover' | 'contain';
    backgroundPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };

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
  const childElements = flattenChildren(props.children);
  const children = serializeChildren(childElements, 'Page');

  return {
    kind: { type: 'Page', config },
    style: props.style ? mapStyle(props.style) : {},
    children,
    sourceLocation: extractSourceLocation(element),
  };
}

// ─── Node serialization ─────────────────────────────────────────────

function serializeChild(child: unknown, parent: ParentContext = null): FormeNode | null {
  if (child === null || child === undefined || typeof child === 'boolean') {
    return null;
  }

  if (typeof child === 'string') {
    return {
      kind: { type: 'Text', content: child },
      style: {},
      children: [],
    };
  }

  if (typeof child === 'number') {
    return {
      kind: { type: 'Text', content: String(child) },
      style: {},
      children: [],
    };
  }

  if (!isValidElement(child)) {
    // Detect HTML elements and give helpful suggestion
    if (typeof child === 'object' && child !== null && 'type' in child) {
      const t = (child as { type: unknown }).type;
      if (typeof t === 'string') {
        const suggestions: Record<string, string> = {
          div: 'View', span: 'Text', p: 'Text', h1: 'Text', h2: 'Text',
          h3: 'Text', img: 'Image', table: 'Table', tr: 'Row', td: 'Cell',
        };
        const suggestion = suggestions[t];
        if (suggestion) {
          throw new Error(
            `HTML element <${t}> is not supported. Use <${suggestion}> instead.`
          );
        }
      }
    }
    return null;
  }

  const element = child as ReactElement;

  if (element.type === View) {
    return serializeView(element, parent);
  }
  if (element.type === Text) {
    return serializeText(element);
  }
  if (element.type === Image) {
    return serializeImage(element);
  }
  if (element.type === Table) {
    return serializeTable(element, parent);
  }
  if (element.type === Row) {
    validateNesting('Row', parent);
    return serializeRow(element);
  }
  if (element.type === Cell) {
    validateNesting('Cell', parent);
    return serializeCell(element);
  }
  if (element.type === Fixed) {
    return serializeFixed(element);
  }
  if (element.type === Svg) {
    return serializeSvg(element);
  }
  if (element.type === QrCode) {
    return serializeQrCode(element);
  }
  if (element.type === Barcode) {
    return serializeBarcode(element);
  }
  if (element.type === TextField) {
    return serializeTextField(element);
  }
  if (element.type === Checkbox) {
    return serializeCheckbox(element);
  }
  if (element.type === Dropdown) {
    return serializeDropdown(element);
  }
  if (element.type === RadioButton) {
    return serializeRadioButton(element);
  }
  if (element.type === Canvas) {
    return serializeCanvas(element);
  }
  if (element.type === Watermark) {
    return serializeWatermark(element);
  }
  if (element.type === BarChart) {
    return serializeBarChart(element);
  }
  if (element.type === LineChart) {
    return serializeLineChart(element);
  }
  if (element.type === PieChart) {
    return serializePieChart(element);
  }
  if (element.type === AreaChart) {
    return serializeAreaChart(element);
  }
  if (element.type === DotPlot) {
    return serializeDotPlot(element);
  }
  if (element.type === PageBreak) {
    return {
      kind: { type: 'PageBreak' },
      style: {},
      children: [],
      sourceLocation: extractSourceLocation(element),
    };
  }
  if (element.type === Page) {
    validateNesting('Page', parent);
    return serializePage(element);
  }
  if (isDocumentType(element.type)) {
    // Nested Document — just serialize its children
    const props = element.props as { children?: unknown };
    const childElements = flattenChildren(props.children);
    const nodes = serializeChildren(childElements, parent);
    return nodes.length === 1 ? nodes[0] : {
      kind: { type: 'View' },
      style: {},
      children: nodes,
    };
  }

  // Unknown component — try to call it as a function component
  if (typeof element.type === 'function') {
    const result = callComponent(element.type as (props: unknown) => unknown, element.props);
    if (isValidElement(result)) {
      return serializeChild(result, parent);
    }
    return null;
  }

  return null;
}

function serializeView(element: ReactElement, _parent: ParentContext = null): FormeNode {
  const props = element.props as { style?: Style; wrap?: boolean; bookmark?: string; href?: string; children?: unknown };
  const style = mapStyle(props.style);
  if (props.wrap !== undefined) {
    style.wrap = props.wrap;
  }
  const childElements = flattenChildren(props.children);
  const children = serializeChildren(childElements, 'View');

  const node: FormeNode = {
    kind: { type: 'View' },
    style,
    children,
    sourceLocation: extractSourceLocation(element),
  };
  if (props.bookmark) node.bookmark = props.bookmark;
  if (props.href) node.href = props.href;

  return node;
}

// Inline formatting components produce TextRuns with these default styles
// (merged under any user-supplied style, so user style wins).
const STRONG_DEFAULTS: Style = { fontWeight: 700 };
const EM_DEFAULTS: Style = { fontStyle: 'italic' };
const CODE_DEFAULTS: Style = {
  fontFamily: 'Courier',
  backgroundColor: '#F4F4F5',
};
const LINK_DEFAULTS: Style = {
  color: '#2563EB',
  textDecoration: 'underline',
};

/** Return the component-default style for a recognized inline component,
 *  or `null` if the element isn't a recognized inline component.
 *  `Text` returns `{}` because it carries no defaults beyond the user's style. */
function inlineDefaults(type: unknown): Style | null {
  switch (type) {
    case Text: return {};
    case Strong: return STRONG_DEFAULTS;
    case Em: return EM_DEFAULTS;
    case Code: return CODE_DEFAULTS;
    case Link: return LINK_DEFAULTS;
    default: return null;
  }
}

/**
 * Recursively flatten children of a `<Text>` into TextRuns, accumulating
 * styles and href as we descend. Outer style is overlaid by each inline
 * component's defaults, which are in turn overlaid by the user-supplied
 * `style` on that element — so user style wins at every level while
 * still inheriting whatever wasn't explicitly set.
 *
 * E.g. `<Strong><Em>both</Em></Strong>` produces a single run with
 * `{ fontWeight: 700, fontStyle: 'italic' }`. A `<Link href>` nested in a
 * `<Strong>` produces a bold underlined blue run with the href set.
 */
function buildTextRuns(
  children: unknown,
  accStyle: Style = {},
  accHref: string | undefined = undefined,
): TextRun[] {
  const out: TextRun[] = [];
  const elements = flattenChildren(children);
  for (const child of elements) {
    if (child === null || child === undefined || typeof child === 'boolean') continue;
    if (typeof child === 'string' || typeof child === 'number') {
      const content = String(child);
      if (content === '') continue;
      const run: TextRun = { content };
      if (Object.keys(accStyle).length > 0) run.style = mapStyle(accStyle);
      if (accHref) run.href = accHref;
      out.push(run);
      continue;
    }
    if (!isValidElement(child)) continue;
    const defaults = inlineDefaults(child.type);
    if (defaults === null) continue; // unknown element inside <Text> — skip
    const childProps = child.props as { style?: Style; href?: string; children?: unknown };
    // Cascade: outer accumulated → this component's defaults → user style.
    // Later spreads win, so user style overrides defaults and outer.
    const nextStyle: Style = { ...accStyle, ...defaults, ...(childProps.style || {}) };
    const nextHref = childProps.href ?? accHref;
    out.push(...buildTextRuns(childProps.children, nextStyle, nextHref));
  }
  return out;
}

function serializeText(element: ReactElement): FormeNode {
  const props = element.props as { style?: Style; href?: string; bookmark?: string; children?: unknown };
  const childElements = flattenChildren(props.children);

  // Detect mixed content: any inline element child (<Text>, <Strong>, <Em>,
  // <Code>, <Link>) means we need TextRuns rather than a flat content string.
  const hasInlineChild = childElements.some(
    c => isValidElement(c) && inlineDefaults(c.type) !== null
  );

  const kind: FormeNodeKind & { type: 'Text' } = { type: 'Text', content: '' };

  if (hasInlineChild) {
    kind.runs = buildTextRuns(props.children);
  } else {
    kind.content = flattenTextContent(props.children);
  }

  if (props.href) kind.href = props.href;

  const node: FormeNode = {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
  if (props.bookmark) node.bookmark = props.bookmark;

  return node;
}

function serializeImage(element: ReactElement): FormeNode {
  const props = element.props as { src: string; width?: number; height?: number; style?: Style; href?: string; alt?: string };
  const kind: FormeNodeKind = { type: 'Image', src: props.src };
  if (props.width !== undefined) (kind as { width?: number }).width = props.width;
  if (props.height !== undefined) (kind as { height?: number }).height = props.height;

  const node: FormeNode = {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
  if (props.href) node.href = props.href;
  if (props.alt) node.alt = props.alt;
  return node;
}

function serializeTable(element: ReactElement, _parent: ParentContext = null): FormeNode {
  const props = element.props as { columns?: ColumnDef[]; style?: Style; children?: unknown };
  const columns: FormeColumnDef[] = (props.columns ?? []).map(col => ({
    width: mapColumnWidth(col.width),
  }));

  const childElements = flattenChildren(props.children);
  const children = serializeChildren(childElements, 'Table');

  return {
    kind: { type: 'Table', columns },
    style: mapStyle(props.style),
    children,
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeRow(element: ReactElement): FormeNode {
  const props = element.props as { header?: boolean; style?: Style; children?: unknown };
  const childElements = flattenChildren(props.children);
  const children = serializeChildren(childElements, 'Row');

  return {
    kind: { type: 'TableRow', is_header: props.header ?? false },
    style: mapStyle(props.style),
    children,
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeCell(element: ReactElement): FormeNode {
  const props = element.props as { colSpan?: number; rowSpan?: number; style?: Style; children?: unknown };
  const childElements = flattenChildren(props.children);
  const children = serializeChildren(childElements, 'Cell');

  return {
    kind: { type: 'TableCell', col_span: props.colSpan ?? 1, row_span: props.rowSpan ?? 1 },
    style: mapStyle(props.style),
    children,
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeFixed(element: ReactElement): FormeNode {
  const props = element.props as { position: 'header' | 'footer'; style?: Style; bookmark?: string; children?: unknown };
  const position = props.position === 'header' ? 'Header' as const : 'Footer' as const;
  const childElements = flattenChildren(props.children);
  const children = serializeChildren(childElements, 'Fixed');

  const node: FormeNode = {
    kind: { type: 'Fixed', position },
    style: mapStyle(props.style),
    children,
    sourceLocation: extractSourceLocation(element),
  };
  if (props.bookmark) node.bookmark = props.bookmark;

  return node;
}

function serializeSvg(element: ReactElement): FormeNode {
  const props = element.props as { width: number; height: number; viewBox?: string; content?: string; style?: Style; href?: string; alt?: string; children?: ReactNode };
  const content = props.content ?? (props.children ? svgChildrenToString(props.children) : '');
  const kind: FormeNodeKind = {
    type: 'Svg',
    width: props.width,
    height: props.height,
    content,
  };
  if (props.viewBox) (kind as { view_box?: string }).view_box = props.viewBox;

  const node: FormeNode = {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
  if (props.href) node.href = props.href;
  if (props.alt) node.alt = props.alt;
  return node;
}

/** Map camelCase SVG prop names to kebab-case attribute names. */
const svgCamelToKebab: Record<string, string> = {
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeOpacity: 'stroke-opacity',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
};

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgChildrenToString(children: ReactNode): string {
  let result = '';
  Children.forEach(children, (child) => {
    if (typeof child === 'string') {
      result += child.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return;
    }
    if (!isValidElement(child)) return;
    const tag = typeof child.type === 'string' ? child.type : null;
    if (!tag) return;
    const { children: nested, ...attrs } = child.props as Record<string, unknown>;
    const attrStr = Object.entries(attrs)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        const name = svgCamelToKebab[k] ?? k;
        return `${name}="${escapeXmlAttr(String(v))}"`;
      })
      .join(' ');
    const open = attrStr ? `<${tag} ${attrStr}` : `<${tag}`;
    if (nested) {
      result += `${open}>${svgChildrenToString(nested as ReactNode)}</${tag}>`;
    } else {
      result += `${open}/>`;
    }
  });
  return result;
}

function serializeQrCode(element: ReactElement): FormeNode {
  const props = element.props as QrCodeProps;
  const kind: FormeNodeKind = { type: 'QrCode', data: props.data } as FormeNodeKind;
  if (props.size !== undefined) (kind as Record<string, unknown>).size = props.size;
  const style = mapStyle(props.style);
  if (props.color) style.color = parseColor(props.color);
  return {
    kind,
    style,
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeBarcode(element: ReactElement): FormeNode {
  const props = element.props as BarcodeProps;
  const kind: FormeNodeKind = {
    type: 'Barcode',
    data: props.data,
    format: props.format ?? 'Code128',
    height: props.height ?? 60,
  } as FormeNodeKind;
  if (props.width !== undefined) (kind as Record<string, unknown>).width = props.width;
  const style = mapStyle(props.style);
  if (props.color) style.color = parseColor(props.color);
  return {
    kind,
    style,
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeTextField(element: ReactElement): FormeNode {
  const props = element.props as TextFieldProps;
  const kind: FormeNodeKind = {
    type: 'TextField',
    name: props.name,
    width: props.width,
    height: props.height ?? 24,
    multiline: props.multiline ?? false,
    password: props.password ?? false,
    read_only: props.readOnly ?? false,
    font_size: props.fontSize ?? 12,
  } as FormeNodeKind;
  if (props.value !== undefined) (kind as Record<string, unknown>).value = props.value;
  if (props.placeholder !== undefined) (kind as Record<string, unknown>).placeholder = props.placeholder;
  if (props.maxLength !== undefined) (kind as Record<string, unknown>).max_length = props.maxLength;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeCheckbox(element: ReactElement): FormeNode {
  const props = element.props as CheckboxProps;
  const kind: FormeNodeKind = {
    type: 'Checkbox',
    name: props.name,
    checked: props.checked ?? false,
    width: props.width ?? 14,
    height: props.height ?? 14,
    read_only: props.readOnly ?? false,
  } as FormeNodeKind;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeDropdown(element: ReactElement): FormeNode {
  const props = element.props as DropdownProps;
  const kind: FormeNodeKind = {
    type: 'Dropdown',
    name: props.name,
    options: props.options,
    width: props.width,
    height: props.height ?? 24,
    read_only: props.readOnly ?? false,
    font_size: props.fontSize ?? 12,
  } as FormeNodeKind;
  if (props.value !== undefined) (kind as Record<string, unknown>).value = props.value;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeRadioButton(element: ReactElement): FormeNode {
  const props = element.props as RadioButtonProps;
  const kind: FormeNodeKind = {
    type: 'RadioButton',
    name: props.name,
    value: props.value,
    checked: props.checked ?? false,
    width: props.width ?? 14,
    height: props.height ?? 14,
    read_only: props.readOnly ?? false,
  } as FormeNodeKind;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeCanvas(element: ReactElement): FormeNode {
  const props = element.props as CanvasProps;
  const operations: CanvasOp[] = [];

  // Create a recording context that captures draw calls as CanvasOp[]
  const ctx: CanvasContext = {
    moveTo(x, y) { operations.push({ op: 'MoveTo', x, y }); },
    lineTo(x, y) { operations.push({ op: 'LineTo', x, y }); },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      operations.push({ op: 'BezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
    },
    quadraticCurveTo(cpx, cpy, x, y) {
      operations.push({ op: 'QuadraticCurveTo', cpx, cpy, x, y });
    },
    closePath() { operations.push({ op: 'ClosePath' }); },
    rect(x, y, w, h) { operations.push({ op: 'Rect', x, y, width: w, height: h }); },
    circle(cx, cy, r) { operations.push({ op: 'Circle', cx, cy, r }); },
    ellipse(cx, cy, rx, ry) { operations.push({ op: 'Ellipse', cx, cy, rx, ry }); },
    arc(cx, cy, r, startAngle, endAngle, counterclockwise = false) {
      operations.push({ op: 'Arc', cx, cy, r, start_angle: startAngle, end_angle: endAngle, counterclockwise });
    },
    line(x1, y1, x2, y2) {
      operations.push({ op: 'MoveTo', x: x1, y: y1 });
      operations.push({ op: 'LineTo', x: x2, y: y2 });
      operations.push({ op: 'Stroke' });
    },
    stroke() { operations.push({ op: 'Stroke' }); },
    fill() { operations.push({ op: 'Fill' }); },
    fillAndStroke() { operations.push({ op: 'FillAndStroke' }); },
    setFillColor(r, g, b) { operations.push({ op: 'SetFillColor', r, g, b }); },
    setStrokeColor(r, g, b) { operations.push({ op: 'SetStrokeColor', r, g, b }); },
    setLineWidth(w) { operations.push({ op: 'SetLineWidth', width: w }); },
    setLineCap(cap) { operations.push({ op: 'SetLineCap', cap }); },
    setLineJoin(join) { operations.push({ op: 'SetLineJoin', join }); },
    save() { operations.push({ op: 'Save' }); },
    restore() { operations.push({ op: 'Restore' }); },
  };

  // Execute the draw callback to record operations
  props.draw(ctx);

  return {
    kind: { type: 'Canvas', width: props.width, height: props.height, operations },
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeWatermark(element: ReactElement): FormeNode {
  const props = element.props as WatermarkProps;
  const fontSize = props.fontSize ?? 60;
  const angle = props.angle ?? -45;
  const colorStr = props.color ?? 'rgba(0,0,0,0.1)';

  // Parse color — extract alpha for opacity
  const parsedColor = parseColor(colorStr);
  const style = mapStyle(props.style);
  style.color = { r: parsedColor.r, g: parsedColor.g, b: parsedColor.b, a: 1 };
  // Multiply color alpha with any existing opacity
  const colorOpacity = parsedColor.a;
  const styleOpacity = (style.opacity !== undefined) ? style.opacity as number : 1;
  style.opacity = colorOpacity * styleOpacity;
  style.fontSize = fontSize;

  return {
    kind: { type: 'Watermark', text: props.text, font_size: fontSize, angle },
    style,
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeBarChart(element: ReactElement): FormeNode {
  const props = element.props as BarChartProps;
  const kind: FormeNodeKind = {
    type: 'BarChart',
    data: props.data.map(d => ({ label: d.label, value: d.value, color: d.color })),
    width: props.width,
    height: props.height,
    show_labels: props.showLabels ?? true,
    show_values: props.showValues ?? false,
    show_grid: props.showGrid ?? false,
  } as FormeNodeKind;
  if (props.color !== undefined) (kind as Record<string, unknown>).color = props.color;
  if (props.title !== undefined) (kind as Record<string, unknown>).title = props.title;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeLineChart(element: ReactElement): FormeNode {
  const props = element.props as LineChartProps;
  const kind: FormeNodeKind = {
    type: 'LineChart',
    series: props.series.map(s => ({ name: s.name, data: s.data, color: s.color })),
    labels: props.labels,
    width: props.width,
    height: props.height,
    show_points: props.showPoints ?? false,
    show_grid: props.showGrid ?? false,
  } as FormeNodeKind;
  if (props.title !== undefined) (kind as Record<string, unknown>).title = props.title;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializePieChart(element: ReactElement): FormeNode {
  const props = element.props as PieChartProps;
  const kind: FormeNodeKind = {
    type: 'PieChart',
    data: props.data.map(d => ({ label: d.label, value: d.value, color: d.color })),
    width: props.width,
    height: props.height,
    donut: props.donut ?? false,
    show_legend: props.showLegend ?? false,
  } as FormeNodeKind;
  if (props.title !== undefined) (kind as Record<string, unknown>).title = props.title;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeAreaChart(element: ReactElement): FormeNode {
  const props = element.props as AreaChartProps;
  const kind: FormeNodeKind = {
    type: 'AreaChart',
    series: props.series.map(s => ({ name: s.name, data: s.data, color: s.color })),
    labels: props.labels,
    width: props.width,
    height: props.height,
    show_grid: props.showGrid ?? false,
  } as FormeNodeKind;
  if (props.title !== undefined) (kind as Record<string, unknown>).title = props.title;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

function serializeDotPlot(element: ReactElement): FormeNode {
  const props = element.props as DotPlotProps;
  const kind: FormeNodeKind = {
    type: 'DotPlot',
    groups: props.groups.map(g => ({ name: g.name, color: g.color, data: g.data })),
    width: props.width,
    height: props.height,
    show_legend: props.showLegend ?? false,
    dot_size: props.dotSize ?? 4,
  } as FormeNodeKind;
  if (props.xMin !== undefined) (kind as Record<string, unknown>).x_min = props.xMin;
  if (props.xMax !== undefined) (kind as Record<string, unknown>).x_max = props.xMax;
  if (props.yMin !== undefined) (kind as Record<string, unknown>).y_min = props.yMin;
  if (props.yMax !== undefined) (kind as Record<string, unknown>).y_max = props.yMax;
  if (props.xLabel !== undefined) (kind as Record<string, unknown>).x_label = props.xLabel;
  if (props.yLabel !== undefined) (kind as Record<string, unknown>).y_label = props.yLabel;
  return {
    kind,
    style: mapStyle(props.style),
    children: [],
    sourceLocation: extractSourceLocation(element),
  };
}

// ─── Children helpers ────────────────────────────────────────────────

function flattenChildren(children: unknown): unknown[] {
  const result: unknown[] = [];
  Children.forEach(children as React.ReactNode, child => {
    if (Array.isArray(child)) {
      result.push(...child.flatMap(c => flattenChildren(c)));
    } else if (isValidElement(child) && child.type === Fragment) {
      const fragProps = child.props as { children?: unknown };
      result.push(...flattenChildren(fragProps.children));
    } else {
      result.push(child);
    }
  });
  return result;
}

function serializeChildren(children: unknown[], parent: ParentContext = null): FormeNode[] {
  const nodes: FormeNode[] = [];
  for (const child of children) {
    const node = serializeChild(child, parent);
    if (node) nodes.push(node);
  }
  return nodes;
}

/**
 * Flatten all text content within a <Text> element to a single string.
 * Nested <Text> children have their content extracted and concatenated.
 */
function flattenTextContent(children: unknown): string {
  if (children === null || children === undefined) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (typeof children === 'boolean') return '';

  if (Array.isArray(children)) {
    return children.map(c => flattenTextContent(c)).join('');
  }

  if (isValidElement(children)) {
    const element = children as ReactElement;
    if (element.type === Text) {
      const props = element.props as { children?: unknown };
      return flattenTextContent(props.children);
    }
    // For other elements inside Text, try to extract text content
    const props = element.props as { children?: unknown };
    return flattenTextContent(props.children);
  }

  // React.Children.toArray for iterables
  const arr: unknown[] = [];
  Children.forEach(children as React.ReactNode, c => arr.push(c));
  if (arr.length > 0) {
    return arr.map(c => flattenTextContent(c)).join('');
  }

  return String(children);
}

// ─── Style mapping ──────────────────────────────────────────────────

const FLEX_DIRECTION_MAP: Record<string, string> = {
  'row': 'Row',
  'column': 'Column',
  'row-reverse': 'RowReverse',
  'column-reverse': 'ColumnReverse',
};

const JUSTIFY_CONTENT_MAP: Record<string, string> = {
  'flex-start': 'FlexStart',
  'flex-end': 'FlexEnd',
  'center': 'Center',
  'space-between': 'SpaceBetween',
  'space-around': 'SpaceAround',
  'space-evenly': 'SpaceEvenly',
};

const ALIGN_ITEMS_MAP: Record<string, string> = {
  'flex-start': 'FlexStart',
  'flex-end': 'FlexEnd',
  'center': 'Center',
  'stretch': 'Stretch',
  'baseline': 'Baseline',
};

const FLEX_WRAP_MAP: Record<string, string> = {
  'nowrap': 'NoWrap',
  'wrap': 'Wrap',
  'wrap-reverse': 'WrapReverse',
};

const ALIGN_CONTENT_MAP: Record<string, string> = {
  'flex-start': 'FlexStart',
  'flex-end': 'FlexEnd',
  'center': 'Center',
  'space-between': 'SpaceBetween',
  'space-around': 'SpaceAround',
  'space-evenly': 'SpaceEvenly',
  'stretch': 'Stretch',
};

const FONT_STYLE_MAP: Record<string, string> = {
  'normal': 'Normal',
  'italic': 'Italic',
  'oblique': 'Oblique',
};

const TEXT_ALIGN_MAP: Record<string, string> = {
  'left': 'Left',
  'right': 'Right',
  'center': 'Center',
  'justify': 'Justify',
};

const TEXT_DECORATION_MAP: Record<string, string> = {
  'none': 'None',
  'underline': 'Underline',
  'line-through': 'LineThrough',
};

const TEXT_TRANSFORM_MAP: Record<string, string> = {
  'none': 'None',
  'uppercase': 'Uppercase',
  'lowercase': 'Lowercase',
  'capitalize': 'Capitalize',
};

const HYPHENS_MAP: Record<string, string> = {
  'none': 'none',
  'manual': 'manual',
  'auto': 'auto',
};

const TEXT_OVERFLOW_MAP: Record<string, string> = {
  'wrap': 'Wrap',
  'ellipsis': 'Ellipsis',
  'clip': 'Clip',
};

const LINE_BREAKING_MAP: Record<string, string> = {
  'optimal': 'optimal',
  'greedy': 'greedy',
};

const OVERFLOW_MAP: Record<string, string> = {
  'visible': 'Visible',
  'hidden': 'Hidden',
};

export function mapStyle(style?: Style): FormeStyle {
  if (!style) return {};

  const result: FormeStyle = {};

  // Dimensions
  if (style.width !== undefined) result.width = mapDimension(style.width);
  if (style.height !== undefined) result.height = mapDimension(style.height);
  if (style.minWidth !== undefined) result.minWidth = mapDimension(style.minWidth);
  if (style.minHeight !== undefined) result.minHeight = mapDimension(style.minHeight);
  if (style.maxWidth !== undefined) result.maxWidth = mapDimension(style.maxWidth);
  if (style.maxHeight !== undefined) result.maxHeight = mapDimension(style.maxHeight);

  // Edges (individual > axis > base)
  if (style.padding !== undefined || style.paddingTop !== undefined || style.paddingRight !== undefined || style.paddingBottom !== undefined || style.paddingLeft !== undefined || style.paddingHorizontal !== undefined || style.paddingVertical !== undefined) {
    const base = style.padding !== undefined ? expandEdges(style.padding) : { top: 0, right: 0, bottom: 0, left: 0 };
    const vt = style.paddingVertical ?? base.top;
    const vb = style.paddingVertical ?? base.bottom;
    const hl = style.paddingHorizontal ?? base.left;
    const hr = style.paddingHorizontal ?? base.right;
    result.padding = {
      top: style.paddingTop ?? vt,
      right: style.paddingRight ?? hr,
      bottom: style.paddingBottom ?? vb,
      left: style.paddingLeft ?? hl,
    };
  }
  if (style.margin !== undefined || style.marginTop !== undefined || style.marginRight !== undefined || style.marginBottom !== undefined || style.marginLeft !== undefined || style.marginHorizontal !== undefined || style.marginVertical !== undefined) {
    const base: FormeMarginEdges = style.margin !== undefined ? expandMarginEdges(style.margin) : { top: 0, right: 0, bottom: 0, left: 0 };
    const vt: number | 'auto' = style.marginVertical ?? base.top;
    const vb: number | 'auto' = style.marginVertical ?? base.bottom;
    const hl: number | 'auto' = style.marginHorizontal ?? base.left;
    const hr: number | 'auto' = style.marginHorizontal ?? base.right;
    result.margin = {
      top: style.marginTop ?? vt,
      right: style.marginRight ?? hr,
      bottom: style.marginBottom ?? vb,
      left: style.marginLeft ?? hl,
    };
  }

  // Flex shorthand: flex: N → flexGrow: N, flexShrink: 1, flexBasis: 0
  if (style.flex !== undefined) {
    if (style.flexGrow === undefined) result.flexGrow = style.flex;
    if (style.flexShrink === undefined) result.flexShrink = 1;
    if (style.flexBasis === undefined) result.flexBasis = { Pt: 0 };
  }

  // Flex
  if (style.flexDirection !== undefined) result.flexDirection = FLEX_DIRECTION_MAP[style.flexDirection];
  if (style.justifyContent !== undefined) result.justifyContent = JUSTIFY_CONTENT_MAP[style.justifyContent];
  if (style.alignItems !== undefined) result.alignItems = ALIGN_ITEMS_MAP[style.alignItems];
  if (style.alignSelf !== undefined) result.alignSelf = ALIGN_ITEMS_MAP[style.alignSelf];
  if (style.flexWrap !== undefined) result.flexWrap = FLEX_WRAP_MAP[style.flexWrap];
  if (style.alignContent !== undefined) result.alignContent = ALIGN_CONTENT_MAP[style.alignContent];
  if (style.flexGrow !== undefined) result.flexGrow = style.flexGrow;
  if (style.flexShrink !== undefined) result.flexShrink = style.flexShrink;
  if (style.flexBasis !== undefined) result.flexBasis = mapDimension(style.flexBasis);
  if (style.gap !== undefined) result.gap = style.gap;
  if (style.rowGap !== undefined) result.rowGap = style.rowGap;
  if (style.columnGap !== undefined) result.columnGap = style.columnGap;

  // Display mode
  if (style.display !== undefined) {
    result.display = style.display === 'grid' ? 'Grid' : 'Flex';
  }

  // CSS Grid
  if (style.gridTemplateColumns !== undefined) {
    result.gridTemplateColumns = parseGridTemplate(style.gridTemplateColumns);
  }
  if (style.gridTemplateRows !== undefined) {
    result.gridTemplateRows = parseGridTemplate(style.gridTemplateRows);
  }
  if (style.gridAutoRows !== undefined) {
    result.gridAutoRows = mapGridTrack(style.gridAutoRows);
  }
  if (style.gridAutoColumns !== undefined) {
    result.gridAutoColumns = mapGridTrack(style.gridAutoColumns);
  }
  // Grid placement (individual props → single gridPlacement object)
  if (style.gridColumnStart !== undefined || style.gridColumnEnd !== undefined ||
      style.gridRowStart !== undefined || style.gridRowEnd !== undefined ||
      style.gridColumnSpan !== undefined || style.gridRowSpan !== undefined) {
    const placement: FormeGridPlacement = {};
    if (style.gridColumnStart !== undefined) placement.columnStart = style.gridColumnStart;
    if (style.gridColumnEnd !== undefined) placement.columnEnd = style.gridColumnEnd;
    if (style.gridRowStart !== undefined) placement.rowStart = style.gridRowStart;
    if (style.gridRowEnd !== undefined) placement.rowEnd = style.gridRowEnd;
    if (style.gridColumnSpan !== undefined) placement.columnSpan = style.gridColumnSpan;
    if (style.gridRowSpan !== undefined) placement.rowSpan = style.gridRowSpan;
    result.gridPlacement = placement;
  }

  // Typography
  if (style.fontFamily !== undefined) result.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) result.fontSize = style.fontSize;
  if (style.fontWeight !== undefined) {
    result.fontWeight = style.fontWeight === 'bold' ? 700 : style.fontWeight === 'normal' ? 400 : style.fontWeight;
  }
  if (style.fontStyle !== undefined) result.fontStyle = FONT_STYLE_MAP[style.fontStyle];
  if (style.lineHeight !== undefined) result.lineHeight = style.lineHeight;
  if (style.textAlign !== undefined) result.textAlign = TEXT_ALIGN_MAP[style.textAlign];
  if (style.letterSpacing !== undefined) result.letterSpacing = style.letterSpacing;
  if (style.wordSpacing !== undefined) result.wordSpacing = style.wordSpacing;
  if (style.boxShadow !== undefined) {
    const parsed = parseBoxShadow(style.boxShadow);
    if (parsed) result.boxShadow = parsed;
  }
  if (style.textDecoration !== undefined) result.textDecoration = TEXT_DECORATION_MAP[style.textDecoration];
  if (style.textTransform !== undefined) result.textTransform = TEXT_TRANSFORM_MAP[style.textTransform];
  if (style.hyphens !== undefined) result.hyphens = HYPHENS_MAP[style.hyphens];
  if (style.lang !== undefined) result.lang = style.lang;
  if (style.direction !== undefined) result.direction = style.direction;
  if (style.textOverflow !== undefined) result.textOverflow = TEXT_OVERFLOW_MAP[style.textOverflow];
  if (style.lineBreaking !== undefined) result.lineBreaking = LINE_BREAKING_MAP[style.lineBreaking];
  if (style.overflow !== undefined) result.overflow = OVERFLOW_MAP[style.overflow];

  // Color
  if (style.color !== undefined) result.color = parseColor(style.color);
  if (style.backgroundColor !== undefined) result.backgroundColor = parseColor(style.backgroundColor);
  if (style.background !== undefined) {
    const parsed = parseBackground(style.background);
    if (parsed) {
      if (parsed.type === 'color') {
        // Solid color string in `background`: route to backgroundColor for
        // engine compatibility (Background::Color also works, but
        // backgroundColor is the canonical solid path).
        if (result.backgroundColor === undefined) result.backgroundColor = parsed.value;
      } else {
        result.background = parsed;
      }
    }
  }
  if (style.opacity !== undefined) result.opacity = style.opacity;

  // Border — cascade: border < borderTop/Right/Bottom/Left < borderWidth/borderColor < borderTopWidth/borderTopColor
  // Step 1: Parse string shorthands into intermediate per-side values
  let shortWidth: FormeEdgeValues<number | undefined> = { top: undefined, right: undefined, bottom: undefined, left: undefined };
  let shortColor: FormeEdgeValues<FormeColor | undefined> = { top: undefined, right: undefined, bottom: undefined, left: undefined };

  if (style.border !== undefined) {
    const parsed = parseBorderString(style.border);
    if (parsed.width !== undefined) shortWidth = { top: parsed.width, right: parsed.width, bottom: parsed.width, left: parsed.width };
    if (parsed.color !== undefined) shortColor = { top: parsed.color, right: parsed.color, bottom: parsed.color, left: parsed.color };
  }

  // Per-side string shorthands override all-side shorthand
  for (const [side, prop] of [['top', 'borderTop'], ['right', 'borderRight'], ['bottom', 'borderBottom'], ['left', 'borderLeft']] as const) {
    const val = style[prop];
    if (val === undefined) continue;
    if (typeof val === 'number') {
      shortWidth[side] = val;
    } else {
      const parsed = parseBorderString(val);
      if (parsed.width !== undefined) shortWidth[side] = parsed.width;
      if (parsed.color !== undefined) shortColor[side] = parsed.color;
    }
  }

  // Step 2: Build borderWidth — existing borderWidth/borderTopWidth override shorthands
  const hasBorderWidth = style.borderWidth !== undefined || style.borderTopWidth !== undefined || style.borderRightWidth !== undefined || style.borderBottomWidth !== undefined || style.borderLeftWidth !== undefined;
  const hasShortWidth = shortWidth.top !== undefined || shortWidth.right !== undefined || shortWidth.bottom !== undefined || shortWidth.left !== undefined;
  if (hasBorderWidth || hasShortWidth) {
    const base = style.borderWidth !== undefined
      ? expandEdgeValues(style.borderWidth)
      : { top: shortWidth.top ?? 0, right: shortWidth.right ?? 0, bottom: shortWidth.bottom ?? 0, left: shortWidth.left ?? 0 };
    result.borderWidth = {
      top: style.borderTopWidth ?? base.top,
      right: style.borderRightWidth ?? base.right,
      bottom: style.borderBottomWidth ?? base.bottom,
      left: style.borderLeftWidth ?? base.left,
    };
  }

  // Step 3: Build borderColor — existing borderColor/borderTopColor override shorthands
  const hasBorderColor = style.borderColor !== undefined || style.borderTopColor !== undefined || style.borderRightColor !== undefined || style.borderBottomColor !== undefined || style.borderLeftColor !== undefined;
  const hasShortColor = shortColor.top !== undefined || shortColor.right !== undefined || shortColor.bottom !== undefined || shortColor.left !== undefined;
  if (hasBorderColor || hasShortColor) {
    const defaultColor = parseColor('#000000');
    let base = {
      top: shortColor.top ?? defaultColor,
      right: shortColor.right ?? defaultColor,
      bottom: shortColor.bottom ?? defaultColor,
      left: shortColor.left ?? defaultColor,
    };
    if (typeof style.borderColor === 'string') {
      const c = parseColor(style.borderColor);
      base = { top: c, right: c, bottom: c, left: c };
    } else if (style.borderColor && typeof style.borderColor === 'object') {
      base = {
        top: parseColor(style.borderColor.top),
        right: parseColor(style.borderColor.right),
        bottom: parseColor(style.borderColor.bottom),
        left: parseColor(style.borderColor.left),
      };
    }
    result.borderColor = {
      top: style.borderTopColor ? parseColor(style.borderTopColor) : base.top,
      right: style.borderRightColor ? parseColor(style.borderRightColor) : base.right,
      bottom: style.borderBottomColor ? parseColor(style.borderBottomColor) : base.bottom,
      left: style.borderLeftColor ? parseColor(style.borderLeftColor) : base.left,
    };
  }
  if (style.borderRadius !== undefined || style.borderTopLeftRadius !== undefined || style.borderTopRightRadius !== undefined || style.borderBottomRightRadius !== undefined || style.borderBottomLeftRadius !== undefined) {
    const base = style.borderRadius !== undefined ? expandCorners(style.borderRadius) : { top_left: 0, top_right: 0, bottom_right: 0, bottom_left: 0 };
    result.borderRadius = {
      top_left: style.borderTopLeftRadius ?? base.top_left,
      top_right: style.borderTopRightRadius ?? base.top_right,
      bottom_right: style.borderBottomRightRadius ?? base.bottom_right,
      bottom_left: style.borderBottomLeftRadius ?? base.bottom_left,
    };
  }

  // Positioning
  if (style.position !== undefined) {
    result.position = style.position === 'absolute' ? 'Absolute' : 'Relative';
  }
  if (style.top !== undefined) result.top = style.top;
  if (style.right !== undefined) result.right = style.right;
  if (style.bottom !== undefined) result.bottom = style.bottom;
  if (style.left !== undefined) result.left = style.left;

  // Page behavior
  if (style.wrap !== undefined) result.wrap = style.wrap;
  if (style.breakBefore !== undefined) result.breakBefore = style.breakBefore;
  if (style.minWidowLines !== undefined) result.minWidowLines = style.minWidowLines;
  if (style.minOrphanLines !== undefined) result.minOrphanLines = style.minOrphanLines;

  return result;
}

// ─── Grid helpers ───────────────────────────────────────────────────

/** Convert a single GridTrackSize to the Forme JSON format. */
function mapGridTrack(track: GridTrackSize): FormeGridTrackSize {
  if (typeof track === 'number') return { Pt: track };
  if (track === 'auto') return 'Auto';
  if (typeof track === 'string') {
    const frMatch = track.match(/^([0-9.]+)fr$/);
    if (frMatch) return { Fr: parseFloat(frMatch[1]) };
    // Try numeric string
    const num = parseFloat(track);
    if (!isNaN(num)) return { Pt: num };
    return 'Auto';
  }
  if (typeof track === 'object' && 'min' in track && 'max' in track) {
    return { MinMax: [mapGridTrack(track.min), mapGridTrack(track.max)] };
  }
  return 'Auto';
}

/**
 * Expand `repeat(N, tracks)` in a grid template string.
 * E.g. `"repeat(3, 1fr)"` → `"1fr 1fr 1fr"`
 *       `"200 repeat(2, 1fr) 200"` → `"200 1fr 1fr 200"`
 */
function expandRepeat(input: string): string {
  return input.replace(/repeat\(\s*(\d+)\s*,\s*([^)]+)\)/g, (_match, count, tracks) => {
    return (tracks.trim() + ' ').repeat(parseInt(count, 10)).trim();
  });
}

/**
 * Parse a grid template string shorthand into an array of FormeGridTrackSize.
 * E.g. `"1fr 2fr 200"` → `[{Fr:1}, {Fr:2}, {Pt:200}]`
 * Supports `repeat(N, tracks)` syntax.
 */
function parseGridTemplate(value: string | GridTrackSize[]): FormeGridTrackSize[] {
  if (Array.isArray(value)) {
    return value.map(mapGridTrack);
  }
  const expanded = expandRepeat(value);
  return expanded.split(/\s+/).filter(Boolean).map((token) => {
    if (token === 'auto') return 'Auto' as FormeGridTrackSize;
    const frMatch = token.match(/^([0-9.]+)fr$/);
    if (frMatch) return { Fr: parseFloat(frMatch[1]) } as FormeGridTrackSize;
    const num = parseFloat(token);
    if (!isNaN(num)) return { Pt: num } as FormeGridTrackSize;
    return 'Auto' as FormeGridTrackSize;
  });
}

export function mapDimension(val: number | string): FormeDimension {
  if (typeof val === 'number') {
    return { Pt: val };
  }
  if (val === 'auto') return 'Auto';
  const match = val.match(/^([0-9.]+)%$/);
  if (match) {
    return { Percent: parseFloat(match[1]) };
  }
  // Try to parse as a number (e.g. "100" without units)
  const num = parseFloat(val);
  if (!isNaN(num)) {
    return { Pt: num };
  }
  return 'Auto';
}

export function parseColor(hex: string): FormeColor {
  const s = hex.trim();

  // rgba(r, g, b, a)
  const rgbaMatch = s.match(/^rgba\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/);
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]) / 255,
      g: parseFloat(rgbaMatch[2]) / 255,
      b: parseFloat(rgbaMatch[3]) / 255,
      a: parseFloat(rgbaMatch[4]),
    };
  }

  // rgb(r, g, b)
  const rgbMatch = s.match(/^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/);
  if (rgbMatch) {
    return {
      r: parseFloat(rgbMatch[1]) / 255,
      g: parseFloat(rgbMatch[2]) / 255,
      b: parseFloat(rgbMatch[3]) / 255,
      a: 1,
    };
  }

  const h = s.replace(/^#/, '');

  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16) / 255;
    const g = parseInt(h[1] + h[1], 16) / 255;
    const b = parseInt(h[2] + h[2], 16) / 255;
    return { r, g, b, a: 1 };
  }

  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return { r, g, b, a: 1 };
  }

  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const a = parseInt(h.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }

  // Fallback: black
  return { r: 0, g: 0, b: 0, a: 1 };
}

/**
 * Parse a `boxShadow` value (object form or CSS-like string
 * `"offsetX offsetY blur color"`) into the engine's FormeBoxShadow shape.
 * Returns null on malformed input. v1 ignores blur but parses it.
 */
function parseBoxShadow(
  val: string | { offsetX: number; offsetY: number; blur?: number; color: string },
): FormeBoxShadow | null {
  if (typeof val === 'object') {
    const c = parseColor(val.color);
    return {
      offsetX: val.offsetX,
      offsetY: val.offsetY,
      blur: val.blur ?? 0,
      color: c,
    };
  }
  // String form: "offsetX offsetY blur color".
  // Split on whitespace, but preserve any rgba(...)/rgb(...) parens.
  const tokens: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of val.trim()) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (buf) {
        tokens.push(buf);
        buf = '';
      }
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  if (tokens.length < 4) return null;
  const offsetX = parseFloat(tokens[0]);
  const offsetY = parseFloat(tokens[1]);
  const blur = parseFloat(tokens[2]);
  if (Number.isNaN(offsetX) || Number.isNaN(offsetY) || Number.isNaN(blur)) return null;
  const color = parseColor(tokens[3]);
  return { offsetX, offsetY, blur, color };
}

/**
 * Parse a CSS `background` value. Supports three forms:
 *   - `linear-gradient(<angle>, <stop>, <stop>, ...)` — CSS angle conventions
 *     (`0deg` = bottom→top, `90deg` = left→right, `180deg` = top→bottom).
 *     Angle is optional; defaults to `180deg` (top→bottom). Side keywords
 *     (`to bottom`, `to right`, etc.) also supported.
 *   - `radial-gradient(circle, <stop>, <stop>, ...)` — `circle` is the only
 *     shape in v1. The `circle` keyword is optional.
 *   - solid color (`#abc`, `rgb(...)`, `rgba(...)`) — falls through to a
 *     `Color`-typed background, which the caller routes to `backgroundColor`.
 *
 * v1 supports exactly 2 stops; gradients with 3+ stops are flattened to
 * the first and last stop (the engine's v1 ShadingType 2 only renders 2
 * colors). Multi-stop support is planned via PDF Type 3 stitching.
 *
 * Returns null on parse failure (e.g. malformed gradient string with no
 * usable color tokens) so the caller can omit the property.
 */
function parseBackground(val: string): FormeBackground | null {
  const s = val.trim();

  // linear-gradient(...)
  const linearMatch = s.match(/^linear-gradient\s*\(\s*([\s\S]*)\s*\)$/i);
  if (linearMatch) {
    const inner = linearMatch[1];
    const parts = splitGradientArgs(inner);
    if (parts.length === 0) return null;

    let angleDeg = 180;
    let stopParts = parts;
    const first = parts[0].trim();
    const angleParsed = parseGradientAngle(first);
    if (angleParsed !== null) {
      angleDeg = angleParsed;
      stopParts = parts.slice(1);
    }
    const stops = parseGradientStops(stopParts);
    if (stops.length < 2) return null;
    return { type: 'linear', angleDeg, stops };
  }

  // radial-gradient(...)
  const radialMatch = s.match(/^radial-gradient\s*\(\s*([\s\S]*)\s*\)$/i);
  if (radialMatch) {
    const inner = radialMatch[1];
    const parts = splitGradientArgs(inner);
    if (parts.length === 0) return null;
    let stopParts = parts;
    // Optional shape keyword (`circle`, `ellipse`) — only `circle` honored
    // here; `ellipse` strings parse but render as a circle.
    const first = parts[0].trim().toLowerCase();
    if (first === 'circle' || first === 'ellipse' || first.startsWith('circle ') || first.startsWith('ellipse ')) {
      stopParts = parts.slice(1);
    }
    const stops = parseGradientStops(stopParts);
    if (stops.length < 2) return null;
    return { type: 'radial', stops };
  }

  // Solid color fallback. parseColor never throws; on garbage input it
  // returns black, so check that the input looks color-shaped first to
  // avoid silently turning a typo'd gradient into a black background.
  if (/^(#|rgb\(|rgba\()/i.test(s)) {
    return { type: 'color', value: parseColor(s) };
  }
  return null;
}

/**
 * Split a gradient's interior comma-separated arguments, respecting parens
 * so `rgba(0, 0, 0, 0.5)` doesn't get split mid-color.
 */
function splitGradientArgs(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of inner) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Parse a CSS gradient angle token. Returns degrees, or null if the token
 * isn't an angle.
 *
 * Forms supported:
 *   - `<n>deg` (e.g. `135deg`)
 *   - `<n>turn` (e.g. `0.5turn`)
 *   - `<n>rad` / `<n>grad`
 *   - `to <side>` keywords: `to top` (0), `to right` (90), `to bottom` (180), `to left` (270),
 *     and the four diagonal forms (`to top right`, etc.).
 */
function parseGradientAngle(token: string): number | null {
  const t = token.trim().toLowerCase();
  const degMatch = t.match(/^(-?\d+(?:\.\d+)?)deg$/);
  if (degMatch) return parseFloat(degMatch[1]);
  const turnMatch = t.match(/^(-?\d+(?:\.\d+)?)turn$/);
  if (turnMatch) return parseFloat(turnMatch[1]) * 360;
  const radMatch = t.match(/^(-?\d+(?:\.\d+)?)rad$/);
  if (radMatch) return (parseFloat(radMatch[1]) * 180) / Math.PI;
  const gradMatch = t.match(/^(-?\d+(?:\.\d+)?)grad$/);
  if (gradMatch) return parseFloat(gradMatch[1]) * 0.9;
  if (t === 'to top') return 0;
  if (t === 'to right') return 90;
  if (t === 'to bottom') return 180;
  if (t === 'to left') return 270;
  if (t === 'to top right' || t === 'to right top') return 45;
  if (t === 'to bottom right' || t === 'to right bottom') return 135;
  if (t === 'to bottom left' || t === 'to left bottom') return 225;
  if (t === 'to top left' || t === 'to left top') return 315;
  return null;
}

/**
 * Parse a list of gradient color stops. Each stop is `<color>` or
 * `<color> <position>`. Position can be `<n>%` (CSS) or `<n>` (treated as
 * a 0..1 fraction). Stops without explicit positions get evenly distributed
 * positions matching CSS defaults: first at 0, last at 1, intermediate
 * stops linearly interpolated.
 */
function parseGradientStops(parts: string[]): FormeGradientStop[] {
  if (parts.length === 0) return [];
  const positions: (number | null)[] = [];
  const colors: { r: number; g: number; b: number; a: number }[] = [];
  for (const p of parts) {
    // Find the last whitespace-separated token; if it's a position
    // (`50%` or `0.5`), treat it as such, else everything is the color.
    const trimmed = p.trim();
    const tokens = splitColorAndPosition(trimmed);
    if (!tokens) continue;
    colors.push(parseColor(tokens.color));
    positions.push(tokens.position);
  }
  if (colors.length === 0) return [];

  // Fill in missing positions with CSS defaults.
  if (positions[0] === null) positions[0] = 0;
  if (positions[positions.length - 1] === null) positions[positions.length - 1] = 1;
  for (let i = 1; i < positions.length - 1; i += 1) {
    if (positions[i] === null) {
      // Linear interpolate between previous known and next known.
      let prev = i - 1;
      while (prev >= 0 && positions[prev] === null) prev -= 1;
      let next = i + 1;
      while (next < positions.length && positions[next] === null) next += 1;
      const p0 = positions[prev] ?? 0;
      const p1 = positions[next] ?? 1;
      positions[i] = p0 + ((p1 - p0) * (i - prev)) / (next - prev);
    }
  }
  return colors.map((color, i) => ({
    position: Math.max(0, Math.min(1, positions[i] as number)),
    color,
  }));
}

/**
 * Split a stop string like `"#fff 50%"` into color + position.
 * Position can be percentage or fraction; null if not specified.
 */
function splitColorAndPosition(s: string): { color: string; position: number | null } | null {
  // The position token, if present, is the last whitespace-separated piece
  // and matches `<number>%` or a bare number. Splitting on whitespace
  // respects parens so `rgba(...)` is not chopped up.
  const tokens: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (buf) {
        tokens.push(buf);
        buf = '';
      }
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1];
  const pctMatch = last.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (pctMatch) {
    return { color: tokens.slice(0, -1).join(' '), position: parseFloat(pctMatch[1]) / 100 };
  }
  const fracMatch = last.match(/^(-?\d+(?:\.\d+)?)$/);
  if (fracMatch && tokens.length > 1) {
    return { color: tokens.slice(0, -1).join(' '), position: parseFloat(fracMatch[1]) };
  }
  return { color: tokens.join(' '), position: null };
}

/**
 * Parse a CSS-style 1-4 value edge shorthand.
 * Accepts: `"8"`, `"8 16"`, `"8 16 24"`, `"8 16 24 32"` (with optional `px` suffix).
 * Also accepts number arrays: `[8]`, `[8, 16]`, `[8, 16, 24]`, `[8, 16, 24, 32]`.
 */
function parseCSSEdges(val: string | number[]): FormeEdges {
  const values: number[] = Array.isArray(val)
    ? val
    : val.trim().split(/\s+/).map(s => parseFloat(s.replace(/px$/i, '')));

  switch (values.length) {
    case 1: return { top: values[0], right: values[0], bottom: values[0], left: values[0] };
    case 2: return { top: values[0], right: values[1], bottom: values[0], left: values[1] };
    case 3: return { top: values[0], right: values[1], bottom: values[2], left: values[1] };
    default: return { top: values[0], right: values[1], bottom: values[2], left: values[3] };
  }
}

const BORDER_STYLE_KEYWORDS = new Set([
  'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'none', 'hidden',
]);

/**
 * Parse a CSS border shorthand string like `"1px solid #000"`.
 * Returns extracted width and/or color. Style keywords are recognized but ignored.
 */
function parseBorderString(val: string): { width?: number; color?: FormeColor } {
  const tokens = val.trim().split(/\s+/);
  let width: number | undefined;
  let color: FormeColor | undefined;

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (BORDER_STYLE_KEYWORDS.has(lower)) continue;

    const num = parseFloat(lower.replace(/px$/i, ''));
    if (!isNaN(num) && /^[\d.]/.test(lower)) {
      width = num;
    } else {
      color = parseColor(token);
    }
  }

  return { width, color };
}

export function expandEdges(val: number | string | number[] | Edges): FormeEdges {
  if (typeof val === 'number') {
    return { top: val, right: val, bottom: val, left: val };
  }
  if (typeof val === 'string' || Array.isArray(val)) {
    return parseCSSEdges(val);
  }
  return { top: val.top, right: val.right, bottom: val.bottom, left: val.left };
}

/** Expand margin edges, preserving 'auto' string values. */
function expandMarginEdges(val: number | string | number[] | Edges): FormeMarginEdges {
  if (typeof val === 'number') {
    return { top: val, right: val, bottom: val, left: val };
  }
  if (typeof val === 'string') {
    if (val === 'auto') {
      return { top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' };
    }
    const edges = parseCSSEdges(val);
    return edges;
  }
  if (Array.isArray(val)) {
    return parseCSSEdges(val);
  }
  return { top: val.top, right: val.right, bottom: val.bottom, left: val.left };
}

function expandEdgeValues(val: number | Edges): FormeEdgeValues<number> {
  if (typeof val === 'number') {
    return { top: val, right: val, bottom: val, left: val };
  }
  return { top: val.top, right: val.right, bottom: val.bottom, left: val.left };
}

export function expandCorners(val: number | Corners): FormeCornerValues {
  if (typeof val === 'number') {
    return { top_left: val, top_right: val, bottom_right: val, bottom_left: val };
  }
  return {
    top_left: val.topLeft,
    top_right: val.topRight,
    bottom_right: val.bottomRight,
    bottom_left: val.bottomLeft,
  };
}

function mapColumnWidth(w: ColumnDef['width']): FormeColumnWidth {
  if (w === 'auto') return 'Auto';
  if ('fraction' in w) return { Fraction: w.fraction };
  if ('fixed' in w) return { Fixed: w.fixed };
  return 'Auto';
}

// ─── Font merging ─────────────────────────────────────────────────

function normalizeFontWeight(w?: number | string): number {
  if (w === undefined || w === 'normal') return 400;
  if (w === 'bold') return 700;
  return typeof w === 'number' ? w : (parseInt(w, 10) || 400);
}

function fontKey(family: string, weight: number, italic: boolean): string {
  return `${family}:${weight}:${italic}`;
}

function mergeFonts(
  globalFonts: FontRegistration[],
  docFonts?: FontRegistration[],
): FormeFont[] {
  const map = new Map<string, FormeFont>();

  for (const f of globalFonts) {
    const weight = normalizeFontWeight(f.fontWeight);
    const italic = f.fontStyle === 'italic' || f.fontStyle === 'oblique';
    const key = fontKey(f.family, weight, italic);
    map.set(key, { family: f.family, src: f.src, weight, italic });
  }

  if (docFonts) {
    for (const f of docFonts) {
      const weight = normalizeFontWeight(f.fontWeight);
      const italic = f.fontStyle === 'italic' || f.fontStyle === 'oblique';
      const key = fontKey(f.family, weight, italic);
      map.set(key, { family: f.family, src: f.src, weight, italic });
    }
  }

  return Array.from(map.values());
}

// ─── Template serialization ─────────────────────────────────────────
//
// Parallel to `serialize()` but detects proxy markers and expr markers,
// converting them to `$ref`, `$each`, `$if`, and operator nodes.

/**
 * Serialize a React element tree into a Forme template JSON document.
 * Like `serialize()` but with expression marker detection for template compilation.
 */
export function serializeTemplate(element: ReactElement): Record<string, unknown> {
  element = resolveElement(element);

  if (!isDocumentType(element.type)) {
    throw new Error('Top-level element must be <Document>');
  }

  const props = element.props as { title?: string; author?: string; subject?: string; creator?: string; children?: unknown } & DocumentProps;
  const childElements = flattenTemplateChildren(props.children);

  const pageNodes: unknown[] = [];
  const contentNodes: unknown[] = [];

  for (const child of childElements) {
    if (isValidElement(child) && child.type === Page) {
      pageNodes.push(serializeTemplatePage(child));
    } else {
      const node = serializeTemplateChild(child, 'Document');
      if (node !== null) contentNodes.push(node);
    }
  }

  let children: unknown[];
  if (pageNodes.length > 0) {
    if (contentNodes.length > 0) {
      const lastPage = pageNodes[pageNodes.length - 1] as { children: unknown[] };
      lastPage.children.push(...contentNodes);
    }
    children = pageNodes;
  } else if (contentNodes.length > 0) {
    children = contentNodes;
  } else {
    children = [];
  }

  const metadata: Record<string, unknown> = {};
  if (props.title !== undefined) metadata.title = processTemplateValue(props.title);
  if (props.author !== undefined) metadata.author = processTemplateValue(props.author);
  if (props.subject !== undefined) metadata.subject = processTemplateValue(props.subject);
  if (props.creator !== undefined) metadata.creator = processTemplateValue(props.creator);
  if (props.lang !== undefined) metadata.lang = processTemplateValue(props.lang);

  const mergedFonts = mergeFonts(Font.getRegistered(), props.fonts);

  const result: Record<string, unknown> = {
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

  if (mergedFonts.length > 0) {
    result.fonts = mergedFonts;
  }

  return result;
}

function serializeTemplatePage(element: ReactElement): Record<string, unknown> {
  const props = element.props as { size?: string | { width: number; height: number }; margin?: number | string | number[] | Edges; children?: unknown };

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
  const childElements = flattenTemplateChildren(props.children);
  const children = serializeTemplateChildren(childElements, 'Page');

  return {
    kind: { type: 'Page', config },
    style: {},
    children,
  };
}

function serializeTemplateChild(child: unknown, parent: ParentContext = null): unknown | null {
  if (child === null || child === undefined || typeof child === 'boolean') {
    return null;
  }

  // Check for each marker (from .map() on proxy)
  if (isEachMarker(child)) {
    const path = getEachPath(child);
    const template = getEachTemplate(child);
    // The template is the JSX element returned from the .map() callback
    const serializedTemplate = isValidElement(template as ReactElement)
      ? serializeTemplateChild(template, parent)
      : processTemplateValue(template);
    return {
      $each: { $ref: path },
      as: '$item',
      template: serializedTemplate,
    };
  }

  // Check for expr marker
  if (isExprMarker(child)) {
    return serializeExprValues(getExpr(child), parent);
  }

  // Check for ref sentinel strings
  if (typeof child === 'string') {
    const processed = processTemplateString(child);
    if (processed !== null) return processed;
    return {
      kind: { type: 'Text', content: child },
      style: {},
      children: [],
    };
  }

  if (typeof child === 'number') {
    return {
      kind: { type: 'Text', content: String(child) },
      style: {},
      children: [],
    };
  }

  if (!isValidElement(child)) return null;

  const element = child as ReactElement;

  if (element.type === View) return serializeTemplateView(element, parent);
  if (element.type === Text) return serializeTemplateText(element);
  if (element.type === Image) return serializeTemplateImage(element);
  if (element.type === Table) return serializeTemplateTable(element, parent);
  if (element.type === Row) {
    validateNesting('Row', parent);
    return serializeTemplateRow(element);
  }
  if (element.type === Cell) {
    validateNesting('Cell', parent);
    return serializeTemplateCell(element);
  }
  if (element.type === Fixed) return serializeTemplateFixed(element);
  if (element.type === Svg) return serializeSvg(element);
  if (element.type === QrCode) return serializeQrCode(element);
  if (element.type === Barcode) return serializeBarcode(element);
  if (element.type === TextField) return serializeTextField(element);
  if (element.type === Checkbox) return serializeCheckbox(element);
  if (element.type === Dropdown) return serializeDropdown(element);
  if (element.type === RadioButton) return serializeRadioButton(element);
  if (element.type === Canvas) return serializeCanvas(element);
  if (element.type === Watermark) return serializeWatermark(element);
  if (element.type === BarChart) return serializeBarChart(element);
  if (element.type === LineChart) return serializeLineChart(element);
  if (element.type === PieChart) return serializePieChart(element);
  if (element.type === AreaChart) return serializeAreaChart(element);
  if (element.type === DotPlot) return serializeDotPlot(element);
  if (element.type === PageBreak) {
    return { kind: { type: 'PageBreak' }, style: {}, children: [] };
  }
  if (element.type === Page) {
    validateNesting('Page', parent);
    return serializeTemplatePage(element);
  }

  // Unknown function component — call it
  if (typeof element.type === 'function') {
    const result = callComponent(element.type as (props: unknown) => unknown, element.props);
    if (isValidElement(result)) {
      return serializeTemplateChild(result, parent);
    }
    return null;
  }

  return null;
}

function serializeTemplateView(element: ReactElement, _parent: ParentContext = null): Record<string, unknown> {
  const props = element.props as { style?: Style; wrap?: boolean; bookmark?: string; href?: string; children?: unknown };
  const style = mapTemplateStyle(props.style);
  if (props.wrap !== undefined) style.wrap = props.wrap;
  const childElements = flattenTemplateChildren(props.children);
  const children = serializeTemplateChildren(childElements, 'View');

  const node: Record<string, unknown> = { kind: { type: 'View' }, style, children };
  if (props.bookmark) node.bookmark = props.bookmark;
  if (props.href) node.href = props.href;
  return node;
}

function serializeTemplateText(element: ReactElement): Record<string, unknown> {
  const props = element.props as { style?: Style; href?: string; bookmark?: string; children?: unknown };
  const childElements = flattenTemplateChildren(props.children);

  const hasTextChild = childElements.some(
    c => isValidElement(c) && c.type === Text
  );

  const kind: Record<string, unknown> = { type: 'Text', content: '' };

  if (hasTextChild) {
    const runs: Record<string, unknown>[] = [];
    for (const child of childElements) {
      if (typeof child === 'string' || typeof child === 'number') {
        const processed = typeof child === 'string' ? processTemplateString(child) : null;
        if (processed !== null) {
          runs.push({ content: processed });
        } else {
          runs.push({ content: String(child) });
        }
      } else if (isValidElement(child) && child.type === Text) {
        const childProps = child.props as { style?: Style; href?: string; children?: unknown };
        const run: Record<string, unknown> = {
          content: flattenTemplateTextContent(childProps.children),
        };
        if (childProps.style) run.style = mapTemplateStyle(childProps.style);
        if (childProps.href) run.href = childProps.href;
        runs.push(run);
      }
    }
    kind.runs = runs;
  } else {
    kind.content = flattenTemplateTextContent(props.children);
  }

  if (props.href) kind.href = props.href;

  const node: Record<string, unknown> = {
    kind,
    style: mapTemplateStyle(props.style),
    children: [],
  };
  if (props.bookmark) node.bookmark = props.bookmark;
  return node;
}

function serializeTemplateImage(element: ReactElement): Record<string, unknown> {
  const props = element.props as { src: string | unknown; width?: number; height?: number; style?: Style };
  const kind: Record<string, unknown> = { type: 'Image', src: processTemplateValue(props.src) };
  if (props.width !== undefined) kind.width = processTemplateValue(props.width);
  if (props.height !== undefined) kind.height = processTemplateValue(props.height);
  return { kind, style: mapTemplateStyle(props.style), children: [] };
}

function serializeTemplateTable(element: ReactElement, _parent: ParentContext = null): Record<string, unknown> {
  const props = element.props as { columns?: ColumnDef[]; style?: Style; children?: unknown };
  const columns: FormeColumnDef[] = (props.columns ?? []).map(col => ({
    width: mapColumnWidth(col.width),
  }));
  const childElements = flattenTemplateChildren(props.children);
  const children = serializeTemplateChildren(childElements, 'Table');
  return { kind: { type: 'Table', columns }, style: mapTemplateStyle(props.style), children };
}

function serializeTemplateRow(element: ReactElement): Record<string, unknown> {
  const props = element.props as { header?: boolean; style?: Style; children?: unknown };
  const childElements = flattenTemplateChildren(props.children);
  const children = serializeTemplateChildren(childElements, 'Row');
  return { kind: { type: 'TableRow', is_header: props.header ?? false }, style: mapTemplateStyle(props.style), children };
}

function serializeTemplateCell(element: ReactElement): Record<string, unknown> {
  const props = element.props as { colSpan?: number; rowSpan?: number; style?: Style; children?: unknown };
  const childElements = flattenTemplateChildren(props.children);
  const children = serializeTemplateChildren(childElements, 'Cell');
  return { kind: { type: 'TableCell', col_span: props.colSpan ?? 1, row_span: props.rowSpan ?? 1 }, style: mapTemplateStyle(props.style), children };
}

function serializeTemplateFixed(element: ReactElement): Record<string, unknown> {
  const props = element.props as { position: 'header' | 'footer'; style?: Style; bookmark?: string; children?: unknown };
  const position = props.position === 'header' ? 'Header' as const : 'Footer' as const;
  const childElements = flattenTemplateChildren(props.children);
  const children = serializeTemplateChildren(childElements, 'Fixed');
  const node: Record<string, unknown> = { kind: { type: 'Fixed', position }, style: mapTemplateStyle(props.style), children };
  if (props.bookmark) node.bookmark = props.bookmark;
  return node;
}

function serializeTemplateChildren(children: unknown[], parent: ParentContext = null): unknown[] {
  const nodes: unknown[] = [];
  for (const child of children) {
    const node = serializeTemplateChild(child, parent);
    if (node !== null) nodes.push(node);
  }
  return nodes;
}

/**
 * Flatten children without using React.Children.forEach, which rejects
 * proxy objects and markers. Handles arrays, Fragments, and raw values.
 */
function flattenTemplateChildren(children: unknown): unknown[] {
  if (children === null || children === undefined) return [];

  const result: unknown[] = [];

  if (Array.isArray(children)) {
    for (const child of children) {
      result.push(...flattenTemplateChildren(child));
    }
    return result;
  }

  // Fragment unwrapping
  if (isValidElement(children) && children.type === Fragment) {
    const fragProps = children.props as { children?: unknown };
    return flattenTemplateChildren(fragProps.children);
  }

  result.push(children);
  return result;
}

// ─── Expression value serialization ─────────────────────────────────

/**
 * Recursively process an expression object, serializing any React elements
 * found in its values (e.g. $if then/else branches).
 */
function serializeExprValues(expr: Record<string, unknown>, parent: ParentContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(expr)) {
    if (isValidElement(val as ReactElement)) {
      result[key] = serializeTemplateChild(val, parent);
    } else if (Array.isArray(val)) {
      result[key] = val.map(v =>
        isValidElement(v as ReactElement) ? serializeTemplateChild(v, parent) : v
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ─── Template value processing ──────────────────────────────────────

/**
 * Process a value that may contain ref markers, expr markers, or proxy objects.
 * Returns the expression form or the original value.
 */
function processTemplateValue(v: unknown): unknown {
  if (typeof v === 'string') {
    if (isRefMarker(v)) {
      return { $ref: getRefPath(v) };
    }
    // Check for embedded sentinels in longer strings
    if (v.includes(REF_SENTINEL)) {
      return processTemplateInterpolatedString(v);
    }
    return v;
  }
  if (isExprMarker(v)) {
    return getExpr(v);
  }
  if (isEachMarker(v)) {
    return {
      $each: { $ref: getEachPath(v) },
      as: '$item',
      template: processTemplateValue(getEachTemplate(v)),
    };
  }
  // Proxy objects with toPrimitive
  if (typeof v === 'object' && v !== null && Symbol.toPrimitive in (v as object)) {
    const str = String(v);
    if (isRefMarker(str)) {
      return { $ref: getRefPath(str) };
    }
  }
  return v;
}

/**
 * Process a string that contains interpolated ref sentinels.
 * e.g. "Hello \0FORME_REF:name\0!" → {$concat: ["Hello ", {$ref: "name"}, "!"]}
 */
function processTemplateInterpolatedString(s: string): unknown {
  const parts: unknown[] = [];
  let remaining = s;

  while (remaining.length > 0) {
    const startIdx = remaining.indexOf(REF_SENTINEL);
    if (startIdx === -1) {
      parts.push(remaining);
      break;
    }

    if (startIdx > 0) {
      parts.push(remaining.slice(0, startIdx));
    }

    const afterSentinel = remaining.slice(startIdx + REF_SENTINEL.length);
    const endIdx = afterSentinel.indexOf(REF_SENTINEL_END);
    if (endIdx === -1) {
      parts.push(remaining);
      break;
    }

    const path = afterSentinel.slice(0, endIdx);
    parts.push({ $ref: path });
    remaining = afterSentinel.slice(endIdx + REF_SENTINEL_END.length);
  }

  if (parts.length === 1) return parts[0];
  return { $concat: parts };
}

/**
 * Process a string that might be a pure ref sentinel.
 * Returns the $ref node if it's a pure ref, null otherwise.
 */
function processTemplateString(s: string): unknown | null {
  if (isRefMarker(s)) {
    return { $ref: getRefPath(s) };
  }
  if (s.includes(REF_SENTINEL)) {
    return processTemplateInterpolatedString(s);
  }
  return null;
}

/**
 * Flatten text content within a <Text> element, detecting ref markers.
 * Returns either a plain string or a $ref/$concat expression.
 */
function flattenTemplateTextContent(children: unknown): unknown {
  if (children === null || children === undefined) return '';
  if (typeof children === 'boolean') return '';

  if (typeof children === 'string') {
    if (isRefMarker(children)) return { $ref: getRefPath(children) };
    if (children.includes(REF_SENTINEL)) return processTemplateInterpolatedString(children);
    return children;
  }

  if (typeof children === 'number') return String(children);

  if (isExprMarker(children)) return getExpr(children);

  // Proxy with toPrimitive
  if (typeof children === 'object' && children !== null && Symbol.toPrimitive in (children as object)) {
    const str = String(children);
    if (isRefMarker(str)) return { $ref: getRefPath(str) };
    return str;
  }

  if (Array.isArray(children)) {
    const parts = children.map(c => flattenTemplateTextContent(c));
    // If all parts are strings, join them
    if (parts.every(p => typeof p === 'string')) {
      return (parts as string[]).join('');
    }
    // Otherwise produce a $concat
    return { $concat: parts };
  }

  if (isValidElement(children)) {
    const element = children as ReactElement;
    if (element.type === Text) {
      const props = element.props as { children?: unknown };
      return flattenTemplateTextContent(props.children);
    }
    const props = element.props as { children?: unknown };
    return flattenTemplateTextContent(props.children);
  }

  const arr: unknown[] = [];
  Children.forEach(children as React.ReactNode, c => arr.push(c));
  if (arr.length > 0) {
    return flattenTemplateTextContent(arr);
  }

  return String(children);
}

/**
 * Map style, processing values that may contain template expressions.
 */
function mapTemplateStyle(style?: Style): Record<string, unknown> {
  if (!style) return {};
  // Use the regular mapStyle but then post-process values that contain markers
  const result = mapStyle(style) as Record<string, unknown>;
  return processTemplateStyleValues(result);
}

function processTemplateStyleValues(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      result[key] = processTemplateStyleValues(val as Record<string, unknown>);
    } else {
      result[key] = processTemplateValue(val);
    }
  }
  return result;
}
