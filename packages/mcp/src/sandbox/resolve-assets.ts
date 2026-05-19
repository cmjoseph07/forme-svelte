/// Converts Uint8Array font/image bytes to base64 data URIs in place.
/// The sanitizer has already guaranteed every `src` is either a `data:`
/// URI string or a `Uint8Array` — this step normalizes to data URI
/// strings so the document can be JSON.stringified for the WASM engine.
///
/// This is the MCP sandbox's replacement for `@formepdf/core`'s
/// `resolveFonts` + `resolveImages`, which read from disk and `fetch()`
/// — both of which we've removed as attack surface.

export async function resolveBundledAssets(doc: unknown): Promise<unknown> {
  if (!doc || typeof doc !== 'object') return doc;
  const d = doc as Record<string, unknown>;

  // Fonts
  const fonts = d.fonts;
  if (Array.isArray(fonts)) {
    for (const font of fonts) {
      if (font && typeof font === 'object') {
        const f = font as Record<string, unknown>;
        if (f.src instanceof Uint8Array) {
          // Guess font/ttf — the engine doesn't care about the exact
          // MIME type, it parses the bytes directly. font/ttf is the
          // safest generic prefix.
          f.src = `data:font/ttf;base64,${uint8ToBase64(f.src)}`;
        }
      }
    }
  }

  // Images (walk recursively)
  const children = d.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      resolveBundledImageAssets(child);
    }
  }
  return d;
}

function resolveBundledImageAssets(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  const kind = n.kind as Record<string, unknown> | undefined;
  if (kind && kind.type === 'Image' && kind.src instanceof Uint8Array) {
    // image/png is a reasonable default — the engine sniffs the bytes
    // (PNG magic vs JPEG SOI) regardless of the declared MIME.
    kind.src = `data:image/png;base64,${uint8ToBase64(kind.src as Uint8Array)}`;
  }
  const children = n.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      resolveBundledImageAssets(child);
    }
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
