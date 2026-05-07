/**
 * Browser / edge entry point for @formepdf/core.
 *
 * Import as `@formepdf/core/browser` — no Node APIs, works in any
 * modern browser, edge runtime, or worker with WebAssembly support.
 *
 * Backed by the wasm-pack `--target bundler` build of pkg/, so the
 * WASM module is wired up implicitly by the consuming bundler at
 * module-load time (via `import * as wasm from './forme_bg.wasm'`
 * inside pkg/forme.js). Vite, esbuild, Webpack, Turbopack, and
 * Wrangler all handle this — there is no explicit init step.
 */

import {
  certify_pdf as wasmCertifyPdf,
  find_text_regions as wasmFindTextRegions,
  merge_pdfs as wasmMergePdfs,
  redact_pdf as wasmRedactPdf,
  redact_text as wasmRedactText,
  render_pdf as wasmRenderPdf,
  render_pdf_with_layout as wasmRenderPdfWithLayout,
  render_template_pdf as wasmRenderTemplatePdf,
  render_template_pdf_with_layout as wasmRenderTemplatePdfWithLayout,
} from '../pkg/forme.js';

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
  RedactionPattern,
} from './index.js';

import type { LayoutInfo, RenderWithLayoutResult, RenderDocumentOptions, RedactionRegion, RedactionPattern } from './index.js';

// ── WASM initialization ────────────────────────────────────────────
//
// Kept as a no-op for backward compatibility with callers that did
// `await init()` against the old --target web build. The bundler-
// target build instantiates the WASM at module-load time, so by the
// time anyone could invoke any of the exports below, the engine is
// already live.
//
/** @deprecated The bundler now wires up WASM automatically; calling
 *  this is a no-op. Safe to delete from your code. */
export async function init(_module?: unknown): Promise<void> {
  return;
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

export async function renderPdf(json: string): Promise<Uint8Array> {
  return wasmRenderPdf(json);
}

export async function renderPdfWithLayout(json: string): Promise<RenderWithLayoutResult> {
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
  return wasmRenderTemplatePdf(templateJson, dataJson);
}

export async function renderTemplateWithLayout(
  templateJson: string,
  dataJson: string,
): Promise<RenderWithLayoutResult> {
  const result = wasmRenderTemplatePdfWithLayout(templateJson, dataJson) as {
    pdf: Uint8Array;
    layout: LayoutInfo;
  };
  return result;
}

// ── PDF certification ────────────────────────────────────────────────

export async function certifyPdf(
  pdfBytes: Uint8Array,
  config: { certificatePem: string; privateKeyPem: string; reason?: string; location?: string; contact?: string; visible?: boolean; page?: number; x?: number; y?: number; width?: number; height?: number },
): Promise<Uint8Array> {
  return wasmCertifyPdf(pdfBytes, JSON.stringify(config));
}

/** @deprecated Use certifyPdf */
export const signPdf = certifyPdf;

// ── PDF redaction ────────────────────────────────────────────────────

export async function redactPdf(
  pdfBytes: Uint8Array,
  regions: RedactionRegion[],
): Promise<Uint8Array> {
  return wasmRedactPdf(pdfBytes, JSON.stringify(regions));
}

// ── Text-search redaction ─────────────────────────────────────────────

/**
 * Find text regions matching patterns in a PDF.
 *
 * Searches PDF content streams for literal or regex patterns and returns
 * redaction regions (in web top-origin coordinates) for each match.
 */
export async function findTextRegions(
  pdfBytes: Uint8Array,
  patterns: RedactionPattern[],
): Promise<RedactionRegion[]> {
  const json = wasmFindTextRegions(pdfBytes, JSON.stringify(patterns));
  return JSON.parse(json) as RedactionRegion[];
}

/**
 * Redact text matching patterns from a PDF.
 *
 * Convenience wrapper: finds all text matching the patterns, then
 * applies coordinate-based redaction to each match.
 */
export async function redactText(
  pdfBytes: Uint8Array,
  patterns: RedactionPattern[],
): Promise<Uint8Array> {
  return wasmRedactText(pdfBytes, JSON.stringify(patterns));
}

// ── PDF merging ──────────────────────────────────────────────────────

/**
 * Merge multiple PDF documents into a single PDF.
 *
 * @param pdfs - Array of PDF byte arrays to merge in order.
 * @returns The merged PDF as a Uint8Array.
 */
export async function mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  const base64Pdfs = pdfs.map((pdf) =>
    btoa(Array.from(pdf, (b) => String.fromCharCode(b)).join('')),
  );
  return wasmMergePdfs(JSON.stringify(base64Pdfs));
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
