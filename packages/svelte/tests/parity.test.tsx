/**
 * Cross-adapter parity: equivalent documents authored in TSX and
 * .svelte must serialize to deep-equal document-model JSON. This is
 * the drift alarm between @formepdf/react and @formepdf/svelte.
 */
import { describe, it, expect } from 'vitest';
import { serialize as serializeReact } from '@formepdf/react';
import { serialize } from '../src/index.js';
import HelloWorldReact from './fixtures/hello-world';
import KitchenSinkReact from './fixtures/kitchen-sink';
import TextRunsReact from './fixtures/text-runs';
import FixedPageNumbersReact from './fixtures/fixed-page-numbers';
import TableReact from './fixtures/table';
import MediaReact from './fixtures/media';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import HelloWorldSvelte from './fixtures/hello-world.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import KitchenSinkSvelte from './fixtures/kitchen-sink.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import TextRunsSvelte from './fixtures/text-runs.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import FixedPageNumbersSvelte from './fixtures/fixed-page-numbers.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import TableSvelte from './fixtures/table.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import MediaSvelte from './fixtures/media.svelte';

describe('cross-adapter parity', () => {
  it('hello-world: interpolation, #each/#if vs map/&&', async () => {
    const props = { name: 'Svelte', items: ['alpha', 'beta'], showFooter: true };
    const svelteDoc = await serialize(HelloWorldSvelte, { props });
    const reactDoc = serializeReact(<HelloWorldReact {...props} />);
    expect(svelteDoc).toEqual(reactDoc);
  });

  it('hello-world with default props', async () => {
    const svelteDoc = await serialize(HelloWorldSvelte);
    const reactDoc = serializeReact(<HelloWorldReact />);
    expect(svelteDoc).toEqual(reactDoc);
  });

  it('kitchen-sink: document props, CSS shorthands, multi-line text', async () => {
    const svelteDoc = await serialize(KitchenSinkSvelte, { props: { discount: 25 } });
    const reactDoc = serializeReact(<KitchenSinkReact discount={25} />);
    expect(svelteDoc).toEqual(reactDoc);
  });

  it('text-runs: nested spans, run styles, boundary whitespace', async () => {
    const svelteDoc = await serialize(TextRunsSvelte, { props: { price: 42 } });
    const reactDoc = serializeReact(<TextRunsReact price={42} />);
    expect(svelteDoc).toEqual(reactDoc);
  });

  it('table: 50-row #each, header row, column widths, spans, view cells', async () => {
    const svelteDoc = await serialize(TableSvelte);
    const reactDoc = serializeReact(<TableReact />);
    expect(svelteDoc).toEqual(reactDoc);
  });

  it('media: Image src pass-through, Svg content, QrCode, Barcode defaults', async () => {
    const svelteDoc = await serialize(MediaSvelte, { props: { ticketId: 'TKT-7777' } });
    const reactDoc = serializeReact(<MediaReact ticketId="TKT-7777" />);
    expect(svelteDoc).toEqual(reactDoc);
  });

  it('media with default props', async () => {
    const svelteDoc = await serialize(MediaSvelte);
    const reactDoc = serializeReact(<MediaReact />);
    expect(svelteDoc).toEqual(reactDoc);
  });

  it('fixed-page-numbers: header/footer, placeholder constants', async () => {
    const svelteDoc = await serialize(FixedPageNumbersSvelte, { props: { paragraphs: 5 } });
    const reactDoc = serializeReact(<FixedPageNumbersReact paragraphs={5} />);
    expect(svelteDoc).toEqual(reactDoc);
  });
});
