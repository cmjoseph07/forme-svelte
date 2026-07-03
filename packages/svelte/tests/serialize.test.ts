import { describe, it, expect } from 'vitest';
import { serialize, render, renderToObject } from '../src/index.js';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import HelloWorld from './fixtures/hello-world.svelte';
// @ts-expect-error .svelte fixtures have no type declarations in tests
import BadProp from './fixtures/bad-prop.svelte';

describe('serialize', () => {
  it('serializes a template with interpolation, #each, and #if', async () => {
    const doc = await serialize(HelloWorld, {
      props: { name: 'Svelte', items: ['a', 'b'], showFooter: true },
    });

    expect(doc.metadata).toEqual({ title: 'Hello' });
    expect(doc.children).toHaveLength(1);

    const page = doc.children[0];
    expect(page.kind).toEqual({
      type: 'Page',
      config: {
        size: 'A4',
        margin: { top: 40, right: 40, bottom: 40, left: 40 },
        wrap: true,
      },
    });

    const view = page.children[0];
    expect(view.kind).toEqual({ type: 'View' });
    expect(view.style).toEqual({ flexDirection: 'Column', gap: 8 });
    expect(view.children.map(c => c.kind)).toEqual([
      { type: 'Text', content: 'Hello Svelte!' },
      { type: 'Text', content: 'Item: a' },
      { type: 'Text', content: 'Item: b' },
      { type: 'Text', content: 'The footer' },
    ]);
    expect(view.children[0].style).toEqual({ fontSize: 24 });
  });

  it('honors #if=false and empty #each', async () => {
    const doc = await serialize(HelloWorld, { props: {} });
    const view = doc.children[0].children[0];
    expect(view.children.map(c => c.kind)).toEqual([{ type: 'Text', content: 'Hello World!' }]);
  });

  it('render returns a JSON string and renderToObject the same document', async () => {
    const [str, obj, doc] = await Promise.all([
      render(HelloWorld, { props: { name: 'X' } }),
      renderToObject(HelloWorld, { props: { name: 'X' } }),
      serialize(HelloWorld, { props: { name: 'X' } }),
    ]);
    expect(typeof str).toBe('string');
    expect(JSON.parse(str)).toEqual(obj);
    expect(obj).toEqual(doc);
  });

  it('propagates encoding errors naming component and prop', async () => {
    await expect(serialize(BadProp)).rejects.toThrow(/\[Forme\] <Text>: prop "style"/);
  });
});
