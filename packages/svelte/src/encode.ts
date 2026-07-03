/**
 * Prop encoding for the emitting components.
 *
 * Each Forme Svelte component renders one placeholder tag whose
 * `props` attribute carries the component's props as JSON (part of
 * the internal emitter/parser contract — see `parser.ts`). Values
 * that cannot survive the JSON round-trip fail loudly here, naming
 * the component and prop, rather than silently producing a wrong PDF.
 */

/**
 * JSON-encode a component's props for the placeholder `props`
 * attribute. `undefined` values are omitted (matching how absent
 * props behave in the react adapter). Functions, symbols, bigints,
 * and circular structures throw an error naming the component and
 * the offending prop.
 */
export function encodeProps(component: string, props: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    let json: string | undefined;
    try {
      json = JSON.stringify(value, (_k, v) => {
        const t = typeof v;
        if (t === 'function' || t === 'symbol' || t === 'bigint') {
          throw new TypeError(`contains a ${t}, which cannot be serialized to JSON`);
        }
        return v;
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`[Forme] <${component}>: prop "${key}" is not serializable: ${reason}`);
    }
    if (json === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${json}`);
  }
  return `{${parts.join(',')}}`;
}
