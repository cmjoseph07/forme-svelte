// Vitest config that runs tests inside Cloudflare's workerd via
// `@cloudflare/vitest-pool-workers`. Used by the `test:workers`
// script + the corresponding CI step. The whole point is to catch
// regressions where the published `@formepdf/core/worker` entry
// (and the WASM glue it relies on) silently breaks under workerd's
// WASM-as-ESM semantics — something Node-based unit tests can't
// detect, as we found out with the 0.10.0 Wrangler crash.

import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['tests/worker.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './tests/worker-fixture/wrangler.toml' },
        miniflare: {
          // Tell workerd to treat .wasm files as CompiledWasm modules
          // (matching real Wrangler behaviour); this is what makes
          // `import wasm from '…/forme_bg.wasm'` produce a
          // WebAssembly.Module that `init(wasm)` can consume.
          modulesRules: [
            { type: 'CompiledWasm', include: ['**/*.wasm'], fallthrough: true },
          ],
        },
      },
    },
  },
});
