import { resolveColor } from "./colors.js";
import type { FormeStyle } from "./types.js";

// ── Spacing ──────────────────────────────────────────────────────────

function parseSpacingValue(val: string): number | undefined {
  if (val === "px") return 1;
  const n = parseFloat(val);
  if (isNaN(n)) return undefined;
  return n * 4;
}

const spacingMap: Record<string, keyof FormeStyle> = {
  pt: "paddingTop", pr: "paddingRight", pb: "paddingBottom", pl: "paddingLeft",
  px: "paddingHorizontal", py: "paddingVertical",
  mt: "marginTop", mr: "marginRight", mb: "marginBottom", ml: "marginLeft",
  mx: "marginHorizontal", my: "marginVertical",
};

function parseSpacing(cls: string): Partial<FormeStyle> | null {
  // p-{n} / m-{n}
  const pMatch = cls.match(/^(p|m)-(.+)$/);
  if (pMatch) {
    const prop = pMatch[1] === "p" ? "padding" : "margin";
    if (pMatch[2] === "auto" && prop === "margin") return { margin: "auto" };
    const val = parseSpacingValue(pMatch[2]);
    if (val !== undefined) return { [prop]: val };
    return null;
  }

  // pt-{n}, px-{n}, mx-auto, etc.
  const sideMatch = cls.match(/^(pt|pr|pb|pl|px|py|mt|mr|mb|ml|mx|my)-(.+)$/);
  if (sideMatch) {
    const key = spacingMap[sideMatch[1]];
    if (!key) return null;
    if (sideMatch[2] === "auto") return { [key]: "auto" };
    const val = parseSpacingValue(sideMatch[2]);
    if (val !== undefined) return { [key]: val };
  }

  return null;
}

// ── Typography ───────────────────────────────────────────────────────

const textSizes: Record<string, number> = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20,
  "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128,
};

const fontWeights: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, normal: 400, medium: 500,
  semibold: 600, bold: 700, extrabold: 800, black: 900,
};

const namedLeading: Record<string, number> = {
  none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625, loose: 2,
};

const trackingValues: Record<string, number> = {
  tighter: -0.05, tight: -0.025, normal: 0, wide: 0.025, wider: 0.05, widest: 0.1,
};

function parseTypography(cls: string): Partial<FormeStyle> | null {
  // text-{size}
  if (cls.startsWith("text-")) {
    const rest = cls.substring(5);
    if (textSizes[rest] !== undefined) return { fontSize: textSizes[rest] };

    // text-left/center/right/justify
    if (rest === "left" || rest === "center" || rest === "right" || rest === "justify") {
      return { textAlign: rest };
    }

    // text-{color}-{shade} or text-black/white — handled in parseColor
    return null;
  }

  // font-{weight}
  if (cls.startsWith("font-")) {
    const weight = fontWeights[cls.substring(5)];
    if (weight !== undefined) return { fontWeight: weight };
    return null;
  }

  // italic
  if (cls === "italic") return { fontStyle: "italic" };

  // leading-{value}
  if (cls.startsWith("leading-")) {
    const rest = cls.substring(8);
    if (namedLeading[rest] !== undefined) return { lineHeight: namedLeading[rest] };
    const n = parseFloat(rest);
    if (!isNaN(n)) return { lineHeight: n * 4 };
    return null;
  }

  // tracking-{value}
  if (cls.startsWith("tracking-")) {
    const val = trackingValues[cls.substring(9)];
    if (val !== undefined) return { letterSpacing: val };
    return null;
  }

  // text decorations
  if (cls === "underline") return { textDecoration: "underline" };
  if (cls === "line-through") return { textDecoration: "line-through" };
  if (cls === "no-underline") return { textDecoration: "none" };

  // text transforms
  if (cls === "uppercase") return { textTransform: "uppercase" };
  if (cls === "lowercase") return { textTransform: "lowercase" };
  if (cls === "capitalize") return { textTransform: "capitalize" };
  if (cls === "normal-case") return { textTransform: "none" };

  return null;
}

// ── Colors ───────────────────────────────────────────────────────────

function parseColorClass(cls: string): Partial<FormeStyle> | null {
  // text-{color}-{shade} or text-black/white/transparent
  if (cls.startsWith("text-")) {
    const rest = cls.substring(5);
    // Skip size and alignment keywords
    if (textSizes[rest] !== undefined) return null;
    if (rest === "left" || rest === "center" || rest === "right" || rest === "justify") return null;
    const color = resolveColor(rest);
    if (color) return { color };
    return null;
  }

  // bg-{color}-{shade}
  if (cls.startsWith("bg-")) {
    const color = resolveColor(cls.substring(3));
    if (color) return { backgroundColor: color };
    return null;
  }

  // border-{color}-{shade} — only when it looks like a color, not a width or side
  if (cls.startsWith("border-")) {
    const rest = cls.substring(7);
    // Skip width values and sides
    if (/^\d+$/.test(rest)) return null;
    if (["t", "r", "b", "l"].includes(rest)) return null;
    if (rest.startsWith("t-") || rest.startsWith("r-") || rest.startsWith("b-") || rest.startsWith("l-")) return null;
    const color = resolveColor(rest);
    if (color) return { borderColor: color };
    return null;
  }

  return null;
}

// ── Layout ───────────────────────────────────────────────────────────

const alignItemsMap: Record<string, FormeStyle["alignItems"]> = {
  start: "flex-start", end: "flex-end", center: "center", stretch: "stretch", baseline: "baseline",
};

const justifyContentMap: Record<string, FormeStyle["justifyContent"]> = {
  start: "flex-start", end: "flex-end", center: "center",
  between: "space-between", around: "space-around", evenly: "space-evenly",
};

function parseDimension(val: string): number | string | undefined {
  if (val === "full") return "100%";
  if (val === "auto") return "auto";
  if (val === "screen") return "100%";
  // Fractional like 1/2, 1/3, etc. — check before numeric parse since parseFloat("1/2") === 1
  const fracMatch = val.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) return `${(parseInt(fracMatch[1]) / parseInt(fracMatch[2]) * 100).toFixed(6)}%`;
  const n = parseFloat(val);
  if (!isNaN(n)) return n * 4;
  return undefined;
}

function parseLayout(cls: string): Partial<FormeStyle> | null {
  // flex direction
  if (cls === "flex") return {}; // no-op, flex is default in Forme
  if (cls === "flex-row") return { flexDirection: "row" };
  if (cls === "flex-col") return { flexDirection: "column" };
  if (cls === "flex-row-reverse") return { flexDirection: "row-reverse" };
  if (cls === "flex-col-reverse") return { flexDirection: "column-reverse" };

  // align/justify
  if (cls.startsWith("items-")) {
    const val = alignItemsMap[cls.substring(6)];
    if (val) return { alignItems: val };
    return null;
  }
  if (cls.startsWith("justify-")) {
    const val = justifyContentMap[cls.substring(8)];
    if (val) return { justifyContent: val };
    return null;
  }

  // flex shorthand
  if (cls === "flex-1") return { flex: 1 };
  if (cls === "flex-auto") return { flexGrow: 1, flexShrink: 1, flexBasis: "auto" };
  if (cls === "flex-initial") return { flexGrow: 0, flexShrink: 1, flexBasis: "auto" };
  if (cls === "flex-none") return { flex: 0 };
  if (cls === "flex-grow") return { flexGrow: 1 };
  if (cls === "flex-grow-0") return { flexGrow: 0 };
  if (cls === "flex-shrink") return { flexShrink: 1 };
  if (cls === "flex-shrink-0") return { flexShrink: 0 };
  if (cls === "flex-wrap") return { flexWrap: "wrap" };
  if (cls === "flex-nowrap") return { flexWrap: "nowrap" };

  // gap
  if (cls.startsWith("gap-x-")) {
    const n = parseFloat(cls.substring(6));
    if (!isNaN(n)) return { columnGap: n * 4 };
    return null;
  }
  if (cls.startsWith("gap-y-")) {
    const n = parseFloat(cls.substring(6));
    if (!isNaN(n)) return { rowGap: n * 4 };
    return null;
  }
  if (cls.startsWith("gap-")) {
    const n = parseFloat(cls.substring(4));
    if (!isNaN(n)) return { gap: n * 4 };
    return null;
  }

  // dimensions
  if (cls.startsWith("w-")) {
    const val = parseDimension(cls.substring(2));
    if (val !== undefined) return { width: val };
    return null;
  }
  if (cls.startsWith("h-")) {
    const val = parseDimension(cls.substring(2));
    if (val !== undefined) return { height: val };
    return null;
  }
  if (cls.startsWith("min-w-")) {
    const n = parseFloat(cls.substring(6));
    if (!isNaN(n)) return { minWidth: n * 4 };
    return null;
  }
  if (cls.startsWith("max-w-")) {
    const n = parseFloat(cls.substring(6));
    if (!isNaN(n)) return { maxWidth: n * 4 };
    return null;
  }
  if (cls.startsWith("min-h-")) {
    const n = parseFloat(cls.substring(6));
    if (!isNaN(n)) return { minHeight: n * 4 };
    return null;
  }
  if (cls.startsWith("max-h-")) {
    const n = parseFloat(cls.substring(6));
    if (!isNaN(n)) return { maxHeight: n * 4 };
    return null;
  }

  // position
  if (cls === "relative") return { position: "relative" };
  if (cls === "absolute") return { position: "absolute" };

  // positional offsets
  if (cls.startsWith("top-")) {
    const n = parseFloat(cls.substring(4));
    if (!isNaN(n)) return { top: n * 4 };
    return null;
  }
  if (cls.startsWith("right-")) {
    const n = parseFloat(cls.substring(6));
    if (!isNaN(n)) return { right: n * 4 };
    return null;
  }
  if (cls.startsWith("bottom-")) {
    const n = parseFloat(cls.substring(7));
    if (!isNaN(n)) return { bottom: n * 4 };
    return null;
  }
  if (cls.startsWith("left-")) {
    const n = parseFloat(cls.substring(5));
    if (!isNaN(n)) return { left: n * 4 };
    return null;
  }

  // overflow
  if (cls === "overflow-hidden") return { overflow: "hidden" };
  if (cls === "overflow-visible") return { overflow: "visible" };

  return null;
}

// ── Borders ──────────────────────────────────────────────────────────

const roundedValues: Record<string, number> = {
  "": 4, sm: 2, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24, full: 9999, none: 0,
};

function parseBorder(cls: string): Partial<FormeStyle> | null {
  // border width
  if (cls === "border") return { borderWidth: 1 };
  if (cls.match(/^border-[0248]$/)) {
    return { borderWidth: parseInt(cls.substring(7)) };
  }

  // per-side border width
  const sideMap: Record<string, keyof FormeStyle> = {
    t: "borderTopWidth", r: "borderRightWidth", b: "borderBottomWidth", l: "borderLeftWidth",
  };
  if (cls.match(/^border-[trbl]$/)) {
    return { [sideMap[cls.substring(7)]]: 1 };
  }
  const sideWidthMatch = cls.match(/^border-([trbl])-(\d+)$/);
  if (sideWidthMatch) {
    return { [sideMap[sideWidthMatch[1]]]: parseInt(sideWidthMatch[2]) };
  }

  // rounded
  if (cls === "rounded") return { borderRadius: roundedValues[""] };
  if (cls.startsWith("rounded-")) {
    const val = roundedValues[cls.substring(8)];
    if (val !== undefined) return { borderRadius: val };
    // rounded-{n} for arbitrary numeric
    const n = parseFloat(cls.substring(8));
    if (!isNaN(n)) return { borderRadius: n };
    return null;
  }

  return null;
}

// ── Opacity ──────────────────────────────────────────────────────────

function parseOpacity(cls: string): Partial<FormeStyle> | null {
  if (cls.startsWith("opacity-")) {
    const n = parseInt(cls.substring(8));
    if (!isNaN(n)) return { opacity: n / 100 };
  }
  return null;
}

// ── Grid ────────────────────────────────────────────────────────────

function parseGrid(cls: string): Partial<FormeStyle> | null {
  if (cls === "grid") return { display: "grid" };

  // grid-cols-{n} / grid-cols-none
  if (cls.startsWith("grid-cols-")) {
    const rest = cls.substring(10);
    if (rest === "none") return { gridTemplateColumns: "none" };
    const n = parseInt(rest);
    if (!isNaN(n) && n >= 1 && n <= 12) return { gridTemplateColumns: `repeat(${n}, 1fr)` };
    return null;
  }

  // grid-rows-{n} / grid-rows-none
  if (cls.startsWith("grid-rows-")) {
    const rest = cls.substring(10);
    if (rest === "none") return { gridTemplateRows: "none" };
    const n = parseInt(rest);
    if (!isNaN(n) && n >= 1 && n <= 6) return { gridTemplateRows: `repeat(${n}, 1fr)` };
    return null;
  }

  // col-span-{n} / col-span-full
  if (cls.startsWith("col-span-")) {
    const rest = cls.substring(9);
    if (rest === "full") return { gridColumnStart: 1, gridColumnEnd: -1 };
    const n = parseInt(rest);
    if (!isNaN(n) && n >= 1 && n <= 12) return { gridColumnSpan: n };
    return null;
  }

  // col-start-{n}
  if (cls.startsWith("col-start-")) {
    const n = parseInt(cls.substring(10));
    if (!isNaN(n) && n >= 1 && n <= 13) return { gridColumnStart: n };
    return null;
  }

  // col-end-{n}
  if (cls.startsWith("col-end-")) {
    const n = parseInt(cls.substring(8));
    if (!isNaN(n) && n >= 1 && n <= 13) return { gridColumnEnd: n };
    return null;
  }

  // row-span-{n} / row-span-full
  if (cls.startsWith("row-span-")) {
    const rest = cls.substring(9);
    if (rest === "full") return { gridRowStart: 1, gridRowEnd: -1 };
    const n = parseInt(rest);
    if (!isNaN(n) && n >= 1 && n <= 6) return { gridRowSpan: n };
    return null;
  }

  // row-start-{n}
  if (cls.startsWith("row-start-")) {
    const n = parseInt(cls.substring(10));
    if (!isNaN(n) && n >= 1 && n <= 7) return { gridRowStart: n };
    return null;
  }

  // row-end-{n}
  if (cls.startsWith("row-end-")) {
    const n = parseInt(cls.substring(8));
    if (!isNaN(n) && n >= 1 && n <= 7) return { gridRowEnd: n };
    return null;
  }

  return null;
}

// ── Self Alignment ──────────────────────────────────────────────────

const alignSelfMap: Record<string, FormeStyle["alignSelf"]> = {
  auto: "auto", start: "flex-start", end: "flex-end", center: "center", stretch: "stretch",
};

function parseSelf(cls: string): Partial<FormeStyle> | null {
  if (cls.startsWith("self-")) {
    const val = alignSelfMap[cls.substring(5)];
    if (val) return { alignSelf: val };
  }
  return null;
}

// ── Arbitrary Values ────────────────────────────────────────────────

const arbitraryPrefixMap: Record<string, keyof FormeStyle | "special"> = {
  w: "width", h: "height",
  "min-w": "minWidth", "max-w": "maxWidth", "min-h": "minHeight", "max-h": "maxHeight",
  p: "padding", px: "paddingHorizontal", py: "paddingVertical",
  pt: "paddingTop", pr: "paddingRight", pb: "paddingBottom", pl: "paddingLeft",
  m: "margin", mx: "marginHorizontal", my: "marginVertical",
  mt: "marginTop", mr: "marginRight", mb: "marginBottom", ml: "marginLeft",
  gap: "gap", "gap-x": "columnGap", "gap-y": "rowGap",
  top: "top", right: "right", bottom: "bottom", left: "left",
  rounded: "borderRadius",
  opacity: "opacity",
  leading: "lineHeight",
  text: "special",
  bg: "special",
  border: "special",
};

function parseArbitrary(cls: string): Partial<FormeStyle> | null {
  const bracketIdx = cls.indexOf("[");
  if (bracketIdx === -1 || !cls.endsWith("]")) return null;

  const prefix = cls.substring(0, bracketIdx - 1); // strip trailing '-'
  const raw = cls.substring(bracketIdx + 1, cls.length - 1); // content inside brackets

  const prop = arbitraryPrefixMap[prefix];
  if (!prop) return null;

  if (prop === "special") {
    // text-[...]: numeric → fontSize, color → color
    if (prefix === "text") {
      if (raw.startsWith("#")) return { color: raw };
      const n = parseFloat(raw.replace(/px$/, ""));
      if (!isNaN(n)) return { fontSize: n };
      return null;
    }
    // bg-[...]: color only
    if (prefix === "bg") {
      if (raw.startsWith("#")) return { backgroundColor: raw };
      return null;
    }
    // border-[...]: numeric → borderWidth, color → borderColor
    if (prefix === "border") {
      if (raw.startsWith("#")) return { borderColor: raw };
      const n = parseFloat(raw.replace(/px$/, ""));
      if (!isNaN(n)) return { borderWidth: n };
      return null;
    }
    return null;
  }

  // Numeric value (strip px suffix)
  const n = parseFloat(raw.replace(/px$/, ""));
  if (!isNaN(n)) return { [prop]: n };

  return null;
}

// ── Main dispatcher ──────────────────────────────────────────────────

export function parseClass(cls: string): Partial<FormeStyle> | null {
  // Check for arbitrary bracket values first
  if (cls.includes("[")) return parseArbitrary(cls);

  return (
    parseSpacing(cls) ??
    parseTypography(cls) ??
    parseColorClass(cls) ??
    parseLayout(cls) ??
    parseGrid(cls) ??
    parseSelf(cls) ??
    parseBorder(cls) ??
    parseOpacity(cls)
  );
}
