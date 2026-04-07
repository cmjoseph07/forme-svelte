import { getTemplate, listTemplates } from '@formepdf/templates';
import type { ReactElement } from 'react';

interface PdfOptions {
  filename?: string;
  download?: boolean;
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
    // In edge runtimes, import.meta.url doesn't resolve to a valid URL so
    // the default WASM loader fails. Import the .wasm file directly —
    // bundlers (Next.js/webpack, wrangler/esbuild) resolve this to a
    // WebAssembly.Module.
    const wasm = await import('@formepdf/core/pkg/forme_bg.wasm');
    await browser.init(wasm.default ?? wasm);
    _renderDocument = browser.renderDocument as RenderDocumentFn;
  } else {
    const core = await import('@formepdf/core');
    _renderDocument = core.renderDocument as RenderDocumentFn;
  }
  return _renderDocument;
}

// --- Render callback invocation (with React Compiler diagnostic) ---
// User-supplied render callbacks are called outside React's render cycle.
// If the callback was compiled by React Compiler, it will inject useMemoCache
// and throw a cryptic "Invalid hook call" error. Catch and rethrow with guidance.

function callRenderFn(fn: () => ReactElement, entryPoint: string): ReactElement {
  try {
    return fn();
  } catch (err) {
    if (err instanceof Error && /hook|useMemoCache|Invalid hook call/i.test(err.message)) {
      const name = (fn as any).displayName || fn.name || 'render callback';
      throw new Error(
        `The function passed to ${entryPoint}() ("${name}") appears to be compiled by ` +
        `React Compiler, which injects hooks that cannot run outside of React's render cycle.\n\n` +
        `Fix: Add 'use no memo' at the top of the function to opt it out:\n\n` +
        `  function ${name}() {\n` +
        `    'use no memo';\n` +
        `    return <Document>...</Document>;\n` +
        `  }\n\n` +
        `Alternatively, wrap it in an inline arrow:\n\n` +
        `  ${entryPoint}(() => <${name} />)`
      );
    }
    throw err;
  }
}

// --- renderPdf: returns raw bytes ---

export async function renderPdf(
  templateOrRenderFn: string | (() => ReactElement),
  data?: Record<string, any>
): Promise<Uint8Array> {
  let element: ReactElement;

  if (typeof templateOrRenderFn === 'string') {
    const templateFn = getTemplate(templateOrRenderFn);
    if (!templateFn) {
      throw new Error(`Unknown template: "${templateOrRenderFn}"`);
    }
    element = templateFn(data || {});
  } else {
    element = callRenderFn(templateOrRenderFn, 'renderPdf');
  }

  const renderDocument = await getRenderDocument();
  return renderDocument(element);
}

// --- pdfResponse: returns a Response object ---

export async function pdfResponse(
  templateOrRenderFn: string | (() => ReactElement),
  dataOrOptions?: Record<string, any> | PdfOptions,
  maybeOptions?: PdfOptions
): Promise<Response> {
  let pdfBytes: Uint8Array;
  let options: PdfOptions;

  if (typeof templateOrRenderFn === 'string') {
    const data = (dataOrOptions as Record<string, any>) || {};
    options = maybeOptions || {};
    pdfBytes = await renderPdf(templateOrRenderFn, data);
    options.filename = options.filename || `${templateOrRenderFn}.pdf`;
  } else {
    options = (dataOrOptions as PdfOptions) || {};
    pdfBytes = await renderPdf(templateOrRenderFn);
    options.filename = options.filename || 'document.pdf';
  }

  const disposition = options.download ? 'attachment' : 'inline';

  return new Response(pdfBytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${options.filename}"`,
      'Content-Length': String(pdfBytes.byteLength),
    },
  });
}

// --- pdfHandler: creates a route handler ---

export function pdfHandler(
  templateOrRenderFn: string | ((req: Request, context: any) => Promise<() => ReactElement>),
  dataFnOrOptions?: ((req: Request, context: any) => Promise<Record<string, any>>) | PdfOptions,
  maybeOptions?: PdfOptions
) {
  if (typeof templateOrRenderFn === 'string') {
    const template = templateOrRenderFn;
    const dataFn = dataFnOrOptions as (req: Request, context: any) => Promise<Record<string, any>>;
    const options = maybeOptions || {};

    return async (req: Request, context: any): Promise<Response> => {
      try {
        const data = await dataFn(req, context);
        return pdfResponse(template, data, options);
      } catch (err) {
        return Response.json(
          { error: 'PDF render failed', message: (err as Error).message },
          { status: 500 }
        );
      }
    };
  } else {
    const renderFnFactory = templateOrRenderFn;
    const options = (dataFnOrOptions as PdfOptions) || {};

    return async (req: Request, context: any): Promise<Response> => {
      try {
        const renderFn = await renderFnFactory(req, context);
        return pdfResponse(renderFn, options);
      } catch (err) {
        return Response.json(
          { error: 'PDF render failed', message: (err as Error).message },
          { status: 500 }
        );
      }
    };
  }
}

export { listTemplates };
export type { PdfOptions };
