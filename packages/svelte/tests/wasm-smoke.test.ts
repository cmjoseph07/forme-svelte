/**
 * WASM smoke test: the serialized document model renders to real PDF
 * bytes through @formepdf/core (devDependency — the adapter itself
 * never depends on WASM).
 */
import { describe, it, expect } from 'vitest';
import { renderPdf } from '@formepdf/core';
import { render } from '../src/index.js';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import HelloWorld from './fixtures/hello-world.svelte';

describe('WASM smoke', () => {
  it('renders a serialized .svelte template to valid PDF bytes', async () => {
    const json = await render(HelloWorld, {
      props: { name: 'Svelte', items: ['alpha', 'beta'], showFooter: true },
    });
    const pdf = await renderPdf(json);

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(500);
    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe('%PDF-');
  });
});
