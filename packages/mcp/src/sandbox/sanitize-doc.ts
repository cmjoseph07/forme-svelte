/// Runs on the document JSON returned by the worker (before WASM
/// rendering). Closes a post-sandbox escape: `@formepdf/core` resolves
/// font and image `src` values by reading the local filesystem and
/// fetching `http(s)://` URLs. An attacker who controls the JSX can put
/// arbitrary file paths or URLs into the document and exfiltrate via
/// the rendered PDF (font bytes baked in) or trigger SSRF (image
/// fetches).
///
/// The MCP sandbox therefore restricts asset `src` to `data:` URIs only.
/// Templates that need custom fonts/images must inline them as base64
/// data URIs — which is also what `@formepdf/react`'s Font.register
/// produces when given a Uint8Array.

export class SandboxAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxAssetError';
  }
}

/// Walks the serialized document. Throws on the first font/image `src`
/// that isn't a `data:` URI. Mutates nothing — purely a validator.
export function sanitizeDocument(doc: unknown): void {
  if (!doc || typeof doc !== 'object') return;
  const d = doc as Record<string, unknown>;

  // Custom font registrations live on `doc.fonts`.
  const fonts = d.fonts;
  if (Array.isArray(fonts)) {
    for (let i = 0; i < fonts.length; i += 1) {
      const f = fonts[i] as Record<string, unknown> | null | undefined;
      if (!f) continue;
      const src = f.src;
      if (!isAllowedAssetSrc(src)) {
        const family = typeof f.family === 'string' ? f.family : '<unknown>';
        throw new SandboxAssetError(
          `Blocked font src for family "${family}" (entry ${i}): only data: URIs are allowed in the MCP sandbox. ` +
            `Got: ${describeSrc(src)}. Inline the font as a base64 data: URI (e.g. \`data:font/ttf;base64,...\`).`,
        );
      }
    }
  }

  // Image src is on `kind.src` for Image nodes. Watermarks/SVGs use
  // string content rather than external src, so they're not vectors here.
  const children = d.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      checkNodeRecursive(child);
    }
  }
}

function checkNodeRecursive(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  const kind = n.kind as Record<string, unknown> | undefined;
  if (kind && typeof kind === 'object') {
    if (kind.type === 'Image') {
      const src = kind.src;
      if (!isAllowedAssetSrc(src)) {
        throw new SandboxAssetError(
          `Blocked image src: only data: URIs are allowed in the MCP sandbox. ` +
            `Got: ${describeSrc(src)}. Inline the image as a base64 data: URI ` +
            `(e.g. \`data:image/png;base64,...\`).`,
        );
      }
    }
  }
  const children = n.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      checkNodeRecursive(child);
    }
  }
}

/// Allowed `src` values: a `data:` URI string, or a Uint8Array (which
/// `@formepdf/core` base64-encodes without touching disk). Empty/undefined
/// is also allowed — that's a no-op (no asset specified).
function isAllowedAssetSrc(src: unknown): boolean {
  if (src === undefined || src === null) return true;
  if (src instanceof Uint8Array) return true;
  if (typeof src !== 'string') return false;
  if (src.length === 0) return true;
  return src.startsWith('data:');
}

function describeSrc(src: unknown): string {
  if (src === null) return 'null';
  if (src === undefined) return 'undefined';
  if (src instanceof Uint8Array) return `Uint8Array(${src.length} bytes)`;
  if (typeof src !== 'string') return `${typeof src}`;
  // Truncate long strings so error messages stay readable.
  const trimmed = src.length > 120 ? `${src.slice(0, 117)}...` : src;
  return `"${trimmed}"`;
}
