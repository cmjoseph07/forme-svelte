import { getTemplate, listTemplates } from '@formepdf/templates';
import type { MiddlewareHandler } from 'hono';
import type { ReactElement } from 'react';

interface PdfOptions {
  filename?: string;
  download?: boolean;
}

interface FormePdfOptions {
  defaultDownload?: boolean;
}

// --- Runtime-adaptive import: Node.js uses @formepdf/core, edge uses @formepdf/core/browser ---

type RenderDocumentFn = (element: ReactElement) => Promise<Uint8Array>;

let _renderDocument: RenderDocumentFn | null = null;

async function getRenderDocument(): Promise<RenderDocumentFn> {
  if (_renderDocument) return _renderDocument;

  // Check if we can resolve file paths — Workers with nodejs_compat provide
  // process.versions.node but import.meta.url is undefined, so the Node
  // entry's fileURLToPath() call crashes. This detects the actual capability.
  const isEdge = typeof import.meta.url !== 'string' || !import.meta.url.startsWith('file://');
  if (isEdge) {
    const browser = await import('@formepdf/core/browser');
    // In edge runtimes (Cloudflare Workers), import.meta.url doesn't resolve
    // to a valid URL so the default WASM loader fails. Import the .wasm file
    // directly — Wrangler/esbuild resolves this to a WebAssembly.Module.
    const wasm = await import('@formepdf/core/pkg/forme_bg.wasm');
    await browser.init(wasm.default ?? wasm);
    _renderDocument = browser.renderDocument as RenderDocumentFn;
  } else {
    const core = await import('@formepdf/core');
    _renderDocument = core.renderDocument as RenderDocumentFn;
  }
  return _renderDocument;
}

// --- Standalone pdfResponse (no middleware needed) ---

export async function pdfResponse(
  templateOrRenderFn: string | (() => ReactElement),
  dataOrOptions?: Record<string, any> | PdfOptions,
  maybeOptions?: PdfOptions
): Promise<Response> {
  let element: ReactElement;
  let options: PdfOptions;

  if (typeof templateOrRenderFn === 'string') {
    const template = templateOrRenderFn;
    const data = (dataOrOptions as Record<string, any>) || {};
    options = maybeOptions || {};

    const templateFn = getTemplate(template);
    if (!templateFn) {
      return Response.json({ error: `Unknown template: "${template}"` }, { status: 400 });
    }
    element = templateFn(data);
    options.filename = options.filename || `${template}.pdf`;
  } else {
    const renderFn = templateOrRenderFn;
    options = (dataOrOptions as PdfOptions) || {};
    element = renderFn();
    options.filename = options.filename || 'document.pdf';
  }

  const renderDocument = await getRenderDocument();
  const pdfBytes = await renderDocument(element);
  const disposition = (options.download ?? false) ? 'attachment' : 'inline';

  return new Response(pdfBytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${options.filename}"`,
      'Content-Length': String(pdfBytes.byteLength),
    },
  });
}

// --- Middleware (adds c.pdf()) ---

declare module 'hono' {
  interface Context {
    pdf: (
      templateOrRenderFn: string | (() => ReactElement),
      dataOrOptions?: Record<string, any> | PdfOptions,
      maybeOptions?: PdfOptions
    ) => Promise<Response>;
  }
}

export function formePdf(opts?: FormePdfOptions): MiddlewareHandler {
  const defaultDownload = opts?.defaultDownload ?? false;

  return async (c, next) => {
    (c as any).pdf = async function (
      templateOrRenderFn: string | (() => ReactElement),
      dataOrOptions?: Record<string, any> | PdfOptions,
      maybeOptions?: PdfOptions
    ): Promise<Response> {
      let options: PdfOptions;
      if (typeof templateOrRenderFn === 'string') {
        options = maybeOptions || {};
      } else {
        options = (dataOrOptions as PdfOptions) || {};
      }
      if (options.download === undefined) {
        options.download = defaultDownload;
      }

      return pdfResponse(
        templateOrRenderFn,
        dataOrOptions,
        typeof templateOrRenderFn === 'string' ? options : undefined
      );
    };

    await next();
  };
}

export { listTemplates };
export type { PdfOptions, FormePdfOptions };
