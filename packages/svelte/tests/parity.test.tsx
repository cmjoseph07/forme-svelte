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
// @ts-expect-error .svelte fixtures have no type declarations in tests
import HelloWorldSvelte from './fixtures/hello-world.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import KitchenSinkSvelte from './fixtures/kitchen-sink.svelte';

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
});
