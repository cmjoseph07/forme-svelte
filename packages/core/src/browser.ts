/**
 * Browser entry point for @formepdf/core.
 *
 * Import as `@formepdf/core/browser` — no Node APIs, works in any
 * modern browser with WebAssembly support.
 *
 * WASM is loaded via fetch() from the same origin as the importing
 * module (using import.meta.url resolution in the wasm-pack glue).
 * Bundlers like Vite, esbuild, and webpack handle this automatically.
 * For script-tag usage, call `initWasm()` with an explicit URL first.
 */

import initWasm, {
  render_pdf as wasmRenderPdf,
  render_pdf_with_layout as wasmRenderPdfWithLayout,
  render_template_pdf as wasmRenderTemplatePdf,
  render_template_pdf_with_layout as wasmRenderTemplatePdfWithLayout,
} from '../pkg/forme.js';

import type { InitInput } from '../pkg/forme.js';

// ── Re-export types from the main entry ────────────────────────────

export type {
  Color,
  EdgeValues,
  CornerValues,
  ElementStyleInfo,
  ElementInfo,
  PageInfo,
  LayoutInfo,
  RenderWithLayoutResult,
  RenderDocumentOptions,
  RedactionRegion,
} from './index.js';

import type { LayoutInfo, RenderWithLayoutResult, RenderDocumentOptions, RedactionRegion } from './index.js';

// ── WASM initialization ────────────────────────────────────────────

let initialized = false;

/**
 * Initialize the WASM module. Called automatically on first render,
 * but you can call it early to control timing or provide a custom
 * WASM URL/bytes.
 *
 * @example
 * // Auto-resolve (works with bundlers)
 * await initWasm();
 *
 * // Explicit URL (CDN, custom path, etc.)
 * await initWasm('/wasm/forme_bg.wasm');
 * await initWasm(new URL('./forme_bg.wasm', import.meta.url));
 */
export async function init(module?: InitInput | Promise<InitInput>): Promise<void> {
  if (initialized) return;
  if (module !== undefined) {
    await initWasm({ module_or_path: module });
  } else {
    await initWasm();
  }
  initialized = true;
}

// ── Helpers ────────────────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Browser-native: binary string → btoa
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function resolveFonts(doc: Record<string, unknown>): Promise<void> {
  const fonts = doc.fonts as
    | Array<{ family: string; src: string | Uint8Array; weight: number; italic: boolean }>
    | undefined;
  if (!fonts?.length) return;

  for (const font of fonts) {
    if (font.src instanceof Uint8Array) {
      font.src = uint8ArrayToBase64(font.src);
    } else if (typeof font.src === 'string' && !font.src.startsWith('data:')) {
      // In the browser, non-data-URI strings are treated as URLs
      const res = await fetch(font.src);
      if (!res.ok) throw new Error(`Failed to fetch font: ${font.src} (${res.status})`);
      const buf = new Uint8Array(await res.arrayBuffer());
      font.src = uint8ArrayToBase64(buf);
    }
    // data URIs pass through as-is (engine extracts base64 portion)
  }
}

async function resolveImages(doc: Record<string, unknown>): Promise<void> {
  const children = doc.children as Array<Record<string, unknown>> | undefined;
  if (!children?.length) return;
  for (const child of children) {
    await resolveImagesInNode(child);
  }
}

async function resolveImagesInNode(node: Record<string, unknown>): Promise<void> {
  const kind = node.kind as Record<string, unknown> | undefined;
  if (kind?.type === 'Image' && typeof kind.src === 'string') {
    const src = kind.src as string;
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Failed to fetch image: ${src} (${res.status})`);
      const contentType = res.headers.get('content-type') || 'image/png';
      const buf = new Uint8Array(await res.arrayBuffer());
      kind.src = `data:${contentType};base64,${uint8ArrayToBase64(buf)}`;
    }
  }
  const children = node.children as Array<Record<string, unknown>> | undefined;
  if (children?.length) {
    for (const child of children) {
      await resolveImagesInNode(child);
    }
  }
}

// ── Render functions ───────────────────────────────────────────────

async function ensureInit(): Promise<void> {
  if (!initialized) await init();
}

export async function renderPdf(json: string): Promise<Uint8Array> {
  await ensureInit();
  return wasmRenderPdf(json);
}

export async function renderPdfWithLayout(json: string): Promise<RenderWithLayoutResult> {
  await ensureInit();
  const result = wasmRenderPdfWithLayout(json) as { pdf: Uint8Array; layout: LayoutInfo };
  return result;
}

export async function renderDocument(
  element: import('react').ReactElement,
  options?: RenderDocumentOptions,
): Promise<Uint8Array> {
  const { serialize } = await import('@formepdf/react');
  const doc = serialize(element) as unknown as Record<string, unknown>;
  if (options?.embedData !== undefined) {
    doc.embeddedData = JSON.stringify(options.embedData);
  }
  if (options?.flattenForms) {
    doc.flattenForms = true;
  }
  await Promise.all([resolveFonts(doc), resolveImages(doc)]);
  return renderPdf(JSON.stringify(doc));
}

export async function renderDocumentWithLayout(
  element: import('react').ReactElement,
  options?: RenderDocumentOptions,
): Promise<RenderWithLayoutResult> {
  const { serialize } = await import('@formepdf/react');
  const doc = serialize(element) as unknown as Record<string, unknown>;
  if (options?.embedData !== undefined) {
    doc.embeddedData = JSON.stringify(options.embedData);
  }
  if (options?.flattenForms) {
    doc.flattenForms = true;
  }
  await Promise.all([resolveFonts(doc), resolveImages(doc)]);
  return renderPdfWithLayout(JSON.stringify(doc));
}

// ── Serialized document rendering ────────────────────────────────────

/**
 * Render a pre-serialized document object (from `serialize()`) to PDF,
 * resolving any HTTP image/font URLs to data URIs first.
 *
 * Use this when you have a serialized doc (e.g. from a web worker that
 * calls `serialize()` directly) and need image resolution without going
 * through the React element–based `renderDocument()`.
 */
export async function renderSerializedDoc(
  doc: Record<string, unknown>,
  options?: RenderDocumentOptions,
): Promise<Uint8Array> {
  if (options?.embedData !== undefined) {
    doc.embeddedData = JSON.stringify(options.embedData);
  }
  if (options?.flattenForms) {
    doc.flattenForms = true;
  }
  await Promise.all([resolveFonts(doc), resolveImages(doc)]);
  return renderPdf(JSON.stringify(doc));
}

/**
 * Like `renderSerializedDoc` but also returns layout info for overlays.
 */
export async function renderSerializedDocWithLayout(
  doc: Record<string, unknown>,
  options?: RenderDocumentOptions,
): Promise<RenderWithLayoutResult> {
  if (options?.embedData !== undefined) {
    doc.embeddedData = JSON.stringify(options.embedData);
  }
  if (options?.flattenForms) {
    doc.flattenForms = true;
  }
  await Promise.all([resolveFonts(doc), resolveImages(doc)]);
  return renderPdfWithLayout(JSON.stringify(doc));
}

// ── Template rendering ──────────────────────────────────────────────

export async function renderTemplate(
  templateJson: string,
  dataJson: string,
): Promise<Uint8Array> {
  await ensureInit();
  return wasmRenderTemplatePdf(templateJson, dataJson);
}

export async function renderTemplateWithLayout(
  templateJson: string,
  dataJson: string,
): Promise<RenderWithLayoutResult> {
  await ensureInit();
  const result = wasmRenderTemplatePdfWithLayout(templateJson, dataJson) as {
    pdf: Uint8Array;
    layout: LayoutInfo;
  };
  return result;
}

// ── PDF signing ──────────────────────────────────────────────────────

export async function signPdf(
  pdfBytes: Uint8Array,
  config: { certificatePem: string; privateKeyPem: string; reason?: string; location?: string; contact?: string; visible?: boolean; page?: number; x?: number; y?: number; width?: number; height?: number },
): Promise<Uint8Array> {
  await ensureInit();
  const { sign_pdf } = await import('../pkg/forme.js');
  return sign_pdf(pdfBytes, JSON.stringify(config));
}

// ── PDF redaction ────────────────────────────────────────────────────

export async function redactPdf(
  pdfBytes: Uint8Array,
  regions: RedactionRegion[],
): Promise<Uint8Array> {
  await ensureInit();
  const { redact_pdf } = await import('../pkg/forme.js');
  return redact_pdf(pdfBytes, JSON.stringify(regions));
}

// ── PDF merging ──────────────────────────────────────────────────────

/**
 * Merge multiple PDF documents into a single PDF.
 *
 * @param pdfs - Array of PDF byte arrays to merge in order.
 * @returns The merged PDF as a Uint8Array.
 */
export async function mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  await ensureInit();
  const { merge_pdfs } = await import('../pkg/forme.js');
  const base64Pdfs = pdfs.map((pdf) =>
    btoa(Array.from(pdf, (b) => String.fromCharCode(b)).join('')),
  );
  return merge_pdfs(JSON.stringify(base64Pdfs));
}

// ── Data extraction (browser-native decompression) ──────────────────

/**
 * Extract embedded JSON data from a Forme-generated PDF.
 * Uses the browser-native DecompressionStream API (no node:zlib).
 */
export async function extractData(pdfBytes: Uint8Array): Promise<unknown | null> {
  const text = new TextDecoder('latin1').decode(pdfBytes);

  // Find the FileSpec referencing forme-data.json
  const fsMatch = text.match(/\/F\s*\(forme-data\.json\)/);
  if (!fsMatch) return null;

  // Extract the EmbeddedFile stream object number from /EF << /F N 0 R >>
  const fsStart = fsMatch.index!;
  const fsRegion = text.slice(Math.max(0, fsStart - 200), fsStart + 200);
  const efMatch = fsRegion.match(/\/EF\s*<<\s*\/F\s+(\d+)\s+0\s+R\s*>>/);
  if (!efMatch) return null;

  const streamObjId = efMatch[1];

  // Find the stream object
  const objPattern = new RegExp(streamObjId + '\\s+0\\s+obj\\b');
  const objMatch = text.match(objPattern);
  if (!objMatch) return null;

  const objStart = objMatch.index!;

  // Find stream start
  const streamKeyword = text.indexOf('stream', objStart);
  if (streamKeyword === -1) return null;

  let streamDataStart = streamKeyword + 6;
  if (pdfBytes[streamDataStart] === 0x0d) streamDataStart++;
  if (pdfBytes[streamDataStart] === 0x0a) streamDataStart++;

  const endstreamPos = text.indexOf('\nendstream', streamDataStart);
  if (endstreamPos === -1) return null;

  const compressedBytes = pdfBytes.slice(streamDataStart, endstreamPos);

  const objRegion = text.slice(objStart, streamKeyword);
  const isCompressed = objRegion.includes('/FlateDecode');

  let jsonBytes: Uint8Array;
  if (isCompressed) {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(compressedBytes);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    jsonBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      jsonBytes.set(chunk, offset);
      offset += chunk.length;
    }
  } else {
    jsonBytes = compressedBytes;
  }

  const jsonString = new TextDecoder('utf-8').decode(jsonBytes);
  return JSON.parse(jsonString);
}
