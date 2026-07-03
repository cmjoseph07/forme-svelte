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
import { expandEdges, mapStyle } from '@formepdf/shared';
import type {
  CertificationConfig,
  Edges,
  FormeDocument,
  FormeEdges,
  FormeNode,
  FormePageConfig,
  FormePageSize,
  Style,
} from '@formepdf/shared';

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

  const kind: FormeNode['kind'] = { type: 'Text', content: textContentOf(element.childNodes) };
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
 * Extract the text content of a Text element's children. Comments
 * (Svelte SSR block anchors) vanish and the text around them is
 * treated as one contiguous chunk, so `{#if}`/`{#each}` boundaries
 * inside a `<Text>` never introduce breaks.
 */
function textContentOf(nodes: P5Node[]): string {
  let merged = '';
  for (const node of nodes) {
    if (isText(node)) merged += node.value;
  }
  return cleanJsxText(merged);
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
function decodeProps(element: P5Element, component: string): Record<string, unknown> {
  const attr = element.attrs.find(a => a.name === 'props');
  if (attr === undefined) return {};
  try {
    return JSON.parse(attr.value) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `[Forme] <${component}>: failed to decode props attribute: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
