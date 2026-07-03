import { describe, it, expect } from 'vitest';
import { encodeProps } from '../src/encode.js';

describe('encodeProps', () => {
  it('drops undefined props but keeps falsy values', () => {
    const json = encodeProps('View', { style: undefined, wrap: false, gap: 0, label: '' });
    expect(JSON.parse(json)).toEqual({ wrap: false, gap: 0, label: '' });
  });

  it('round-trips nested style objects', () => {
    const style = { flexDirection: 'row', padding: [8, 16], border: '1px solid #000' };
    const json = encodeProps('View', { style });
    expect(JSON.parse(json)).toEqual({ style });
  });

  it('rejects function props, naming component and prop', () => {
    expect(() => encodeProps('Text', { style: () => {} })).toThrow(
      /\[Forme\] <Text>: prop "style".*function/
    );
  });

  it('rejects functions nested inside props', () => {
    expect(() => encodeProps('View', { style: { color: '#fff', bad: () => {} } })).toThrow(
      /\[Forme\] <View>: prop "style".*function/
    );
  });

  it('rejects circular props, naming component and prop', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => encodeProps('Page', { style: circular })).toThrow(/\[Forme\] <Page>: prop "style"/);
  });
});
