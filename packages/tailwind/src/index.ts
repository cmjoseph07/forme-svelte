import { parseClass } from "./parsers.js";
import type { FormeStyle } from "./types.js";

export type { FormeStyle } from "./types.js";

/**
 * Convert Tailwind CSS class names to a Forme style object.
 *
 * Unknown classes are silently ignored. When classes conflict,
 * the last one wins (natural Object.assign behavior).
 */
export function tw(classes: string): FormeStyle {
  const result: FormeStyle = {};
  if (!classes) return result;
  for (const cls of classes.trim().split(/\s+/)) {
    if (!cls) continue;

    // Negative values: -mt-4, -top-2, etc.
    if (cls.startsWith("-") && !cls.startsWith("-[")) {
      const parsed = parseClass(cls.substring(1));
      if (parsed) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "number") (parsed as Record<string, unknown>)[k] = -v;
        }
        Object.assign(result, parsed);
        continue;
      }
    }

    const parsed = parseClass(cls);
    if (parsed) Object.assign(result, parsed);
  }
  return result;
}
