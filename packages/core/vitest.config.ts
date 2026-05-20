import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // worker.test.ts only runs under workerd via `npm run test:workers`
    // (vitest.config.workers.ts). It does `import wasm from '.wasm'`,
    // which Node's loader can't resolve.
    exclude: ['tests/worker.test.ts', 'node_modules/**'],
  },
  esbuild: {
    jsx: 'automatic',
  },
});
