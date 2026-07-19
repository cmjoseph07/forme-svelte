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
// @ts-expect-error .svelte fixtures have no type declarations in tests
import TableFixture from './fixtures/table.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import MediaFixture from './fixtures/media.svelte';

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

  it('renders a 50-row table with a header row to a multi-page PDF', async () => {
    const json = await render(TableFixture);
    const pdf = await renderPdf(json);

    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe('%PDF-');
    // One /Type /Page per page (the page-tree root is /Type /Pages).
    const raw = Buffer.from(pdf).toString('latin1');
    const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
    // The header row repeats on continuation pages: "SKU" is drawn
    // once per page in the content streams.
    const text = decompressedStreams(pdf);
    const headerDraws = (text.match(/\(SKU\)/g) ?? []).length;
    expect(headerDraws).toBe(pageCount);
  });

  it('renders media leaves (Image, Svg, QrCode, Barcode) in one document', async () => {
    const json = await render(MediaFixture, { props: { ticketId: 'TKT-0042' } });
    const pdf = await renderPdf(json);

    expect(pdf).toBeInstanceOf(Uint8Array);
    const header = new TextDecoder().decode(pdf.slice(0, 5));
    expect(header).toBe('%PDF-');
    // QR modules and barcode bars are drawn as rectangle ops (`re`) in
    // the content stream — a media-free page has nowhere near this
    // many. The data-URI image becomes an XObject (`/Im0 Do`).
    const text = decompressedStreams(pdf);
    const rectOps = (text.match(/\bre\b/g) ?? []).length;
    expect(rectOps).toBeGreaterThan(100);
    expect(text).toMatch(/\/Im\d+ Do/);
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
