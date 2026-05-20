// Workerd smoke test for the @formepdf/core/worker entry. Catches the
// exact 0.10.0 regression: `TypeError: wasm.__wbindgen_start is not a
// function` triggered on module load when the bundler-target glue is
// imported under Wrangler. The vitest pool runs this whole file inside
// workerd, so we get real Wrangler WASM-as-ESM semantics — including
// the `import wasm from '*.wasm'` → `{ default: WebAssembly.Module }`
// shape that broke us.

import { describe, expect, it } from 'vitest';

describe('@formepdf/core/worker', () => {
  it('module load does not throw under workerd (regression: 0.10.0 wasm.__wbindgen_start)', async () => {
    // The bug surfaced on import — before any function was called. Even
    // a bare `await import('...')` of the broken 0.10.0 build threw.
    // Run the import inside the test so vitest captures the failure
    // instead of crashing the whole pool.
    const mod = await import('../dist/worker.js');
    expect(typeof mod.init).toBe('function');
    expect(typeof mod.renderPdf).toBe('function');
    expect(typeof mod.renderDocument).toBe('function');
  });

  it('init(wasmModule) + renderPdf produces a valid PDF', async () => {
    const { init, renderPdf } = await import('../dist/worker.js');
    // Workerd resolves this import to a WebAssembly.Module — same shape
    // Wrangler hands a real Worker. This is the path that broke in 0.10.0.
    // @ts-expect-error -- *.wasm import shape is provided by workerd at runtime
    const wasm = (await import('../pkg-web/forme_bg.wasm')).default;
    await init(wasm);

    // Minimal page so we exercise the WASM pipeline end-to-end.
    const pdf = await renderPdf(
      JSON.stringify({
        children: [
          {
            kind: {
              type: 'Page',
              size: { width: 100, height: 100 },
              margin: { top: 10, right: 10, bottom: 10, left: 10 },
            },
            children: [],
          },
        ],
      }),
    );

    expect(pdf.byteLength).toBeGreaterThan(100);
    // PDF magic header: %PDF
    expect(String.fromCharCode(...pdf.slice(0, 4))).toBe('%PDF');
  });

  it('init is idempotent', async () => {
    const { init } = await import('../dist/worker.js');
    // @ts-expect-error -- runtime-provided WASM module shape
    const wasm = (await import('../pkg-web/forme_bg.wasm')).default;
    await init(wasm);
    await init(wasm); // second call should resolve, not re-instantiate or throw
    expect(true).toBe(true);
  });
});
