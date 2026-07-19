/**
 * One-call rendering convenience: template in, PDF bytes out.
 *
 * `@formepdf/core` (the WASM engine bridge) is an *optional* peer
 * dependency (ADR 0002): `serialize`/`render` work without it, and
 * hosted-API users who POST JSON never download WASM. The import is a
 * bare dynamic `import('@formepdf/core')` so core's runtime-conditional
 * exports (node/browser/worker) pick the right entry - no runtime
 * sniffing here. Render options are forwarded to core untouched, so
 * their semantics (embedData JSON-stringified onto the document,
 * flattenForms, and any future options) stay identical to the react
 * path.
 */

import type { Component } from 'svelte';
import type {
  RenderDocumentOptions as CoreRenderDocumentOptions,
  RenderWithLayoutResult,
} from '@formepdf/core';
import { serialize } from './serialize.js';
import type { SerializeOptions } from './serialize.js';

/** Serialization props plus `@formepdf/core`'s render options. */
export type RenderDocumentOptions<Props extends Record<string, any>> = SerializeOptions<Props> &
  CoreRenderDocumentOptions;

async function importCore(): Promise<typeof import('@formepdf/core')> {
  try {
    return await import('@formepdf/core');
  } catch (cause) {
    throw new Error(
      'renderDocument requires @formepdf/core, an optional peer dependency of ' +
        '@formepdf/svelte. Install it with: npm install @formepdf/core',
      { cause },
    );
  }
}

/**
 * Serialize a Svelte template and render it to PDF bytes.
 * The template's top-level element must be a `<Document>`.
 */
export async function renderDocument<Props extends Record<string, any>>(
  template: Component<Props>,
  options?: RenderDocumentOptions<Props>,
): Promise<Uint8Array> {
  const { props, ...renderOptions } = options ?? ({} as RenderDocumentOptions<Props>);
  const doc = await serialize(template, { props });
  const core = await importCore();
  return core.renderSerializedDoc(doc as unknown as Record<string, unknown>, renderOptions);
}

/**
 * Like `renderDocument` but also returns layout info for overlays,
 * mirroring core's react-facing `renderDocumentWithLayout`.
 */
export async function renderDocumentWithLayout<Props extends Record<string, any>>(
  template: Component<Props>,
  options?: RenderDocumentOptions<Props>,
): Promise<RenderWithLayoutResult> {
  const { props, ...renderOptions } = options ?? ({} as RenderDocumentOptions<Props>);
  const doc = await serialize(template, { props });
  const core = await importCore();
  return core.renderSerializedDocWithLayout(
    doc as unknown as Record<string, unknown>,
    renderOptions,
  );
}
