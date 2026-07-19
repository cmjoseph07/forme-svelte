/**
 * WASM smoke test: the serialized document model renders to real PDF
 * bytes through @formepdf/core (devDependency — the adapter itself
 * never depends on WASM).
 */
import { inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { renderPdf } from '@formepdf/core';
import { render } from '../src/index.js';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import HelloWorld from './fixtures/hello-world.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import FixedPageNumbers from './fixtures/fixed-page-numbers.svelte';

/**
 * Concatenate every stream object in the PDF, inflating the
 * FlateDecode-compressed ones, so text-showing operators like
 * `(Page 1 of 2) Tj` become searchable.
 */
function decompressedStreams(pdf: Uint8Array): string {
  const buf = Buffer.from(pdf);
  let out = '';
  let pos = 0;
  for (;;) {
    const start = buf.indexOf('stream', pos);
    if (start === -1) break;
    let dataStart = start + 'stream'.length;
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;
    let end = buf.indexOf('endstream', dataStart);
    if (end === -1) break;
    while (end > dataStart && (buf[end - 1] === 0x0a || buf[end - 1] === 0x0d)) end--;
    const raw = buf.subarray(dataStart, end);
    try {
      out += inflateSync(raw).toString('latin1');
    } catch {
      out += raw.toString('latin1');
    }
    pos = end + 'endstream'.length;
  }
  return out;
}

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

  it('substitutes PAGE_NUMBER / TOTAL_PAGES in a multi-page footer', async () => {
    const json = await render(FixedPageNumbers, { props: { paragraphs: 40 } });
    const pdf = await renderPdf(json);
    const text = decompressedStreams(pdf);

    const first = text.match(/\(Page 1 of (\d+)\)/);
    expect(first).not.toBeNull();
    const total = Number(first![1]);
    expect(total).toBeGreaterThan(1);
    // The footer repeats on every page with the running page number.
    for (let page = 1; page <= total; page++) {
      expect(text).toContain(`(Page ${page} of ${total})`);
    }
    expect(text).not.toContain('{{pageNumber}}');
    expect(text).not.toContain('{{totalPages}}');
  });
});
