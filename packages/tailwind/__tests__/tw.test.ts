import { describe, it, expect } from "vitest";
import { tw } from "../src/index.js";

describe("tw()", () => {
  // ── Edge cases ───────────────────────────────────────────────────
  it("returns empty object for empty string", () => {
    expect(tw("")).toEqual({});
  });

  it("returns empty object for whitespace-only string", () => {
    expect(tw("   ")).toEqual({});
  });

  it("ignores unknown classes", () => {
    expect(tw("unknown-class")).toEqual({});
  });

  it("ignores unknown classes mixed with known ones", () => {
    expect(tw("p-4 unknown flex")).toEqual({ padding: 16 });
  });

  // ── Layout ───────────────────────────────────────────────────────
  describe("layout", () => {
    it("flex direction", () => {
      expect(tw("flex flex-col")).toEqual({ flexDirection: "column" });
      expect(tw("flex-row")).toEqual({ flexDirection: "row" });
      expect(tw("flex-row-reverse")).toEqual({ flexDirection: "row-reverse" });
      expect(tw("flex-col-reverse")).toEqual({ flexDirection: "column-reverse" });
    });

    it("align and justify", () => {
      expect(tw("items-center")).toEqual({ alignItems: "center" });
      expect(tw("items-start")).toEqual({ alignItems: "flex-start" });
      expect(tw("items-end")).toEqual({ alignItems: "flex-end" });
      expect(tw("items-stretch")).toEqual({ alignItems: "stretch" });
      expect(tw("items-baseline")).toEqual({ alignItems: "baseline" });
      expect(tw("justify-between")).toEqual({ justifyContent: "space-between" });
      expect(tw("justify-center")).toEqual({ justifyContent: "center" });
      expect(tw("justify-evenly")).toEqual({ justifyContent: "space-evenly" });
      expect(tw("items-center justify-between")).toEqual({
        alignItems: "center",
        justifyContent: "space-between",
      });
    });

    it("flex shortcuts", () => {
      expect(tw("flex-1")).toEqual({ flex: 1 });
      expect(tw("flex-none")).toEqual({ flex: 0 });
      expect(tw("flex-auto")).toEqual({ flexGrow: 1, flexShrink: 1, flexBasis: "auto" });
      expect(tw("flex-grow")).toEqual({ flexGrow: 1 });
      expect(tw("flex-grow-0")).toEqual({ flexGrow: 0 });
      expect(tw("flex-shrink")).toEqual({ flexShrink: 1 });
      expect(tw("flex-shrink-0")).toEqual({ flexShrink: 0 });
    });

    it("flex wrap", () => {
      expect(tw("flex-wrap")).toEqual({ flexWrap: "wrap" });
      expect(tw("flex-nowrap")).toEqual({ flexWrap: "nowrap" });
    });

    it("gap", () => {
      expect(tw("gap-4")).toEqual({ gap: 16 });
      expect(tw("gap-x-2")).toEqual({ columnGap: 8 });
      expect(tw("gap-y-3")).toEqual({ rowGap: 12 });
    });

    it("space-y and space-x", () => {
      expect(tw("space-y-4")).toEqual({ rowGap: 16 });
      expect(tw("space-x-2")).toEqual({ columnGap: 8 });
      expect(tw("space-y-0")).toEqual({ rowGap: 0 });
      expect(tw("space-x-0.5")).toEqual({ columnGap: 2 });
    });

    it("dimensions", () => {
      expect(tw("w-64")).toEqual({ width: 256 });
      expect(tw("h-32")).toEqual({ height: 128 });
      expect(tw("w-full")).toEqual({ width: "100%" });
      expect(tw("h-auto")).toEqual({ height: "auto" });
      expect(tw("w-0")).toEqual({ width: 0 });
    });

    it("min/max dimensions", () => {
      expect(tw("min-w-0")).toEqual({ minWidth: 0 });
      expect(tw("max-w-16")).toEqual({ maxWidth: 64 });
      expect(tw("min-h-4")).toEqual({ minHeight: 16 });
      expect(tw("max-h-8")).toEqual({ maxHeight: 32 });
    });

    it("position", () => {
      expect(tw("relative")).toEqual({ position: "relative" });
      expect(tw("absolute")).toEqual({ position: "absolute" });
    });

    it("positional offsets", () => {
      expect(tw("top-4")).toEqual({ top: 16 });
      expect(tw("right-2")).toEqual({ right: 8 });
      expect(tw("bottom-0")).toEqual({ bottom: 0 });
      expect(tw("left-8")).toEqual({ left: 32 });
    });

    it("overflow", () => {
      expect(tw("overflow-hidden")).toEqual({ overflow: "hidden" });
      expect(tw("overflow-visible")).toEqual({ overflow: "visible" });
    });
  });

  // ── Spacing ──────────────────────────────────────────────────────
  describe("spacing", () => {
    it("padding shorthand", () => {
      expect(tw("p-4")).toEqual({ padding: 16 });
      expect(tw("p-0")).toEqual({ padding: 0 });
      expect(tw("p-px")).toEqual({ padding: 1 });
      expect(tw("p-0.5")).toEqual({ padding: 2 });
    });

    it("padding axis", () => {
      expect(tw("px-4")).toEqual({ paddingHorizontal: 16 });
      expect(tw("py-2")).toEqual({ paddingVertical: 8 });
    });

    it("padding sides", () => {
      expect(tw("pt-4")).toEqual({ paddingTop: 16 });
      expect(tw("pr-2")).toEqual({ paddingRight: 8 });
      expect(tw("pb-6")).toEqual({ paddingBottom: 24 });
      expect(tw("pl-1")).toEqual({ paddingLeft: 4 });
    });

    it("margin shorthand", () => {
      expect(tw("m-2")).toEqual({ margin: 8 });
      expect(tw("m-auto")).toEqual({ margin: "auto" });
    });

    it("margin sides", () => {
      expect(tw("mt-4")).toEqual({ marginTop: 16 });
      expect(tw("mb-8")).toEqual({ marginBottom: 32 });
      expect(tw("mx-auto")).toEqual({ marginHorizontal: "auto" });
      expect(tw("my-auto")).toEqual({ marginVertical: "auto" });
    });

    it("combined spacing", () => {
      expect(tw("p-4 m-2")).toEqual({ padding: 16, margin: 8 });
      expect(tw("px-4 py-2")).toEqual({ paddingHorizontal: 16, paddingVertical: 8 });
      expect(tw("mt-4 mb-8")).toEqual({ marginTop: 16, marginBottom: 32 });
    });
  });

  // ── Typography ───────────────────────────────────────────────────
  describe("typography", () => {
    it("font sizes with default line heights (multipliers)", () => {
      // lineHeight is a multiplier (ratio), not pixels — Forme's engine does fontSize * lineHeight
      const result = tw("text-xs");
      expect(result.fontSize).toBe(12);
      expect(result.lineHeight).toBeCloseTo(16 / 12, 4);

      expect(tw("text-sm")).toEqual({ fontSize: 14, lineHeight: 20 / 14 });
      expect(tw("text-base")).toEqual({ fontSize: 16, lineHeight: 1.5 });
      expect(tw("text-lg")).toEqual({ fontSize: 18, lineHeight: 28 / 18 });
      expect(tw("text-xl")).toEqual({ fontSize: 20, lineHeight: 1.4 });
      expect(tw("text-2xl")).toEqual({ fontSize: 24, lineHeight: 32 / 24 });
      expect(tw("text-3xl")).toEqual({ fontSize: 30, lineHeight: 1.2 });
      expect(tw("text-4xl")).toEqual({ fontSize: 36, lineHeight: 40 / 36 });
      expect(tw("text-5xl")).toEqual({ fontSize: 48, lineHeight: 1 });
    });

    it("explicit leading overrides text size default", () => {
      expect(tw("text-sm leading-tight")).toEqual({ fontSize: 14, lineHeight: 1.25 });
      expect(tw("text-lg leading-none")).toEqual({ fontSize: 18, lineHeight: 1 });
      expect(tw("text-base leading-6")).toEqual({ fontSize: 16, lineHeight: 1.5 });
    });

    it("font weights", () => {
      expect(tw("font-thin")).toEqual({ fontWeight: 100 });
      expect(tw("font-light")).toEqual({ fontWeight: 300 });
      expect(tw("font-normal")).toEqual({ fontWeight: 400 });
      expect(tw("font-medium")).toEqual({ fontWeight: 500 });
      expect(tw("font-semibold")).toEqual({ fontWeight: 600 });
      expect(tw("font-bold")).toEqual({ fontWeight: 700 });
      expect(tw("font-extrabold")).toEqual({ fontWeight: 800 });
      expect(tw("font-black")).toEqual({ fontWeight: 900 });
    });

    it("font style", () => {
      expect(tw("italic")).toEqual({ fontStyle: "italic" });
    });

    it("text alignment", () => {
      expect(tw("text-left")).toEqual({ textAlign: "left" });
      expect(tw("text-center")).toEqual({ textAlign: "center" });
      expect(tw("text-right")).toEqual({ textAlign: "right" });
      expect(tw("text-justify")).toEqual({ textAlign: "justify" });
    });

    it("line height", () => {
      expect(tw("leading-tight")).toEqual({ lineHeight: 1.25 });
      expect(tw("leading-normal")).toEqual({ lineHeight: 1.5 });
      expect(tw("leading-loose")).toEqual({ lineHeight: 2 });
      expect(tw("leading-6")).toEqual({ lineHeight: 1.5 });
    });

    it("letter spacing", () => {
      expect(tw("tracking-tight")).toEqual({ letterSpacing: -0.025 });
      expect(tw("tracking-normal")).toEqual({ letterSpacing: 0 });
      expect(tw("tracking-wide")).toEqual({ letterSpacing: 0.025 });
    });

    it("text decoration", () => {
      expect(tw("underline")).toEqual({ textDecoration: "underline" });
      expect(tw("line-through")).toEqual({ textDecoration: "line-through" });
      expect(tw("no-underline")).toEqual({ textDecoration: "none" });
    });

    it("text transform", () => {
      expect(tw("uppercase")).toEqual({ textTransform: "uppercase" });
      expect(tw("lowercase")).toEqual({ textTransform: "lowercase" });
      expect(tw("capitalize")).toEqual({ textTransform: "capitalize" });
      expect(tw("normal-case")).toEqual({ textTransform: "none" });
    });

    it("combined typography", () => {
      expect(tw("text-lg font-bold")).toEqual({ fontSize: 18, lineHeight: 28 / 18, fontWeight: 700 });
      expect(tw("italic underline")).toEqual({ fontStyle: "italic", textDecoration: "underline" });
      expect(tw("text-center uppercase")).toEqual({ textAlign: "center", textTransform: "uppercase" });
    });
  });

  // ── Colors ───────────────────────────────────────────────────────
  describe("colors", () => {
    it("text colors", () => {
      expect(tw("text-blue-500")).toEqual({ color: "#3b82f6" });
      expect(tw("text-red-600")).toEqual({ color: "#dc2626" });
      expect(tw("text-black")).toEqual({ color: "#000000" });
      expect(tw("text-white")).toEqual({ color: "#ffffff" });
    });

    it("background colors", () => {
      expect(tw("bg-gray-100")).toEqual({ backgroundColor: "#f3f4f6" });
      expect(tw("bg-blue-500")).toEqual({ backgroundColor: "#3b82f6" });
      expect(tw("bg-white")).toEqual({ backgroundColor: "#ffffff" });
    });

    it("border colors", () => {
      expect(tw("border-red-600")).toEqual({ borderColor: "#dc2626" });
      expect(tw("border-gray-300")).toEqual({ borderColor: "#d1d5db" });
    });

    it("does not confuse text-{size} with text-{color}", () => {
      expect(tw("text-lg")).toEqual({ fontSize: 18, lineHeight: 28 / 18 });
      expect(tw("text-center")).toEqual({ textAlign: "center" });
    });
  });

  // ── Borders ──────────────────────────────────────────────────────
  describe("borders", () => {
    it("border width", () => {
      expect(tw("border")).toEqual({ borderWidth: 1 });
      expect(tw("border-0")).toEqual({ borderWidth: 0 });
      expect(tw("border-2")).toEqual({ borderWidth: 2 });
      expect(tw("border-4")).toEqual({ borderWidth: 4 });
      expect(tw("border-8")).toEqual({ borderWidth: 8 });
    });

    it("per-side border width", () => {
      expect(tw("border-t")).toEqual({ borderTopWidth: 1 });
      expect(tw("border-r")).toEqual({ borderRightWidth: 1 });
      expect(tw("border-b")).toEqual({ borderBottomWidth: 1 });
      expect(tw("border-l")).toEqual({ borderLeftWidth: 1 });
      expect(tw("border-t-2")).toEqual({ borderTopWidth: 2 });
      expect(tw("border-t-0")).toEqual({ borderTopWidth: 0 });
    });

    it("border radius", () => {
      expect(tw("rounded")).toEqual({ borderRadius: 4 });
      expect(tw("rounded-sm")).toEqual({ borderRadius: 2 });
      expect(tw("rounded-md")).toEqual({ borderRadius: 6 });
      expect(tw("rounded-lg")).toEqual({ borderRadius: 8 });
      expect(tw("rounded-xl")).toEqual({ borderRadius: 12 });
      expect(tw("rounded-2xl")).toEqual({ borderRadius: 16 });
      expect(tw("rounded-full")).toEqual({ borderRadius: 9999 });
      expect(tw("rounded-none")).toEqual({ borderRadius: 0 });
    });

    it("combined borders", () => {
      expect(tw("border rounded-lg")).toEqual({ borderWidth: 1, borderRadius: 8 });
      expect(tw("border-2 border-t-0")).toEqual({ borderWidth: 2, borderTopWidth: 0 });
    });
  });

  // ── Opacity ──────────────────────────────────────────────────────
  describe("opacity", () => {
    it("opacity values", () => {
      expect(tw("opacity-0")).toEqual({ opacity: 0 });
      expect(tw("opacity-50")).toEqual({ opacity: 0.5 });
      expect(tw("opacity-100")).toEqual({ opacity: 1 });
      expect(tw("opacity-75")).toEqual({ opacity: 0.75 });
    });
  });

  // ── Negative values ─────────────────────────────────────────────
  describe("negative values", () => {
    it("negative margin", () => {
      expect(tw("-m-2")).toEqual({ margin: -8 });
      expect(tw("-mt-4")).toEqual({ marginTop: -16 });
      expect(tw("-mb-1")).toEqual({ marginBottom: -4 });
      expect(tw("-mx-2")).toEqual({ marginHorizontal: -8 });
    });

    it("negative positional offsets", () => {
      expect(tw("-top-4")).toEqual({ top: -16 });
      expect(tw("-right-2")).toEqual({ right: -8 });
      expect(tw("-bottom-1")).toEqual({ bottom: -4 });
      expect(tw("-left-8")).toEqual({ left: -32 });
    });

    it("does not negate non-numeric values", () => {
      expect(tw("-flex-row")).toEqual({ flexDirection: "row" });
    });
  });

  // ── Fraction widths ────────────────────────────────────────────────
  describe("fraction widths", () => {
    it("width fractions", () => {
      expect(tw("w-1/2")).toEqual({ width: "50.000000%" });
      expect(tw("w-1/3")).toEqual({ width: "33.333333%" });
      expect(tw("w-2/3")).toEqual({ width: "66.666667%" });
      expect(tw("w-1/4")).toEqual({ width: "25.000000%" });
      expect(tw("w-3/4")).toEqual({ width: "75.000000%" });
    });

    it("height fractions", () => {
      expect(tw("h-1/2")).toEqual({ height: "50.000000%" });
      expect(tw("h-1/3")).toEqual({ height: "33.333333%" });
    });
  });

  // ── Grid ───────────────────────────────────────────────────────────
  describe("grid", () => {
    it("display grid", () => {
      expect(tw("grid")).toEqual({ display: "grid" });
    });

    it("grid-cols", () => {
      expect(tw("grid-cols-1")).toEqual({ gridTemplateColumns: "repeat(1, 1fr)" });
      expect(tw("grid-cols-3")).toEqual({ gridTemplateColumns: "repeat(3, 1fr)" });
      expect(tw("grid-cols-12")).toEqual({ gridTemplateColumns: "repeat(12, 1fr)" });
      expect(tw("grid-cols-none")).toEqual({ gridTemplateColumns: "none" });
    });

    it("grid-rows", () => {
      expect(tw("grid-rows-2")).toEqual({ gridTemplateRows: "repeat(2, 1fr)" });
      expect(tw("grid-rows-6")).toEqual({ gridTemplateRows: "repeat(6, 1fr)" });
      expect(tw("grid-rows-none")).toEqual({ gridTemplateRows: "none" });
    });

    it("col-span", () => {
      expect(tw("col-span-2")).toEqual({ gridColumnSpan: 2 });
      expect(tw("col-span-12")).toEqual({ gridColumnSpan: 12 });
      expect(tw("col-span-full")).toEqual({ gridColumnStart: 1, gridColumnEnd: -1 });
    });

    it("col-start / col-end", () => {
      expect(tw("col-start-1")).toEqual({ gridColumnStart: 1 });
      expect(tw("col-start-13")).toEqual({ gridColumnStart: 13 });
      expect(tw("col-end-3")).toEqual({ gridColumnEnd: 3 });
    });

    it("row-span", () => {
      expect(tw("row-span-2")).toEqual({ gridRowSpan: 2 });
      expect(tw("row-span-full")).toEqual({ gridRowStart: 1, gridRowEnd: -1 });
    });

    it("row-start / row-end", () => {
      expect(tw("row-start-1")).toEqual({ gridRowStart: 1 });
      expect(tw("row-end-3")).toEqual({ gridRowEnd: 3 });
    });

    it("combined grid", () => {
      expect(tw("grid grid-cols-3 gap-4")).toEqual({
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 16,
      });
    });
  });

  // ── Arbitrary values ───────────────────────────────────────────────
  describe("arbitrary values", () => {
    it("width and height", () => {
      expect(tw("w-[200]")).toEqual({ width: 200 });
      expect(tw("w-[200px]")).toEqual({ width: 200 });
      expect(tw("h-[100]")).toEqual({ height: 100 });
    });

    it("spacing", () => {
      expect(tw("p-[20]")).toEqual({ padding: 20 });
      expect(tw("px-[10]")).toEqual({ paddingHorizontal: 10 });
      expect(tw("mt-[8]")).toEqual({ marginTop: 8 });
      expect(tw("m-[16px]")).toEqual({ margin: 16 });
    });

    it("typography", () => {
      expect(tw("text-[14px]")).toEqual({ fontSize: 14 });
      expect(tw("text-[14]")).toEqual({ fontSize: 14 });
      expect(tw("leading-[20]")).toEqual({ lineHeight: 20 });
    });

    it("colors", () => {
      expect(tw("text-[#333]")).toEqual({ color: "#333" });
      expect(tw("bg-[#ff0000]")).toEqual({ backgroundColor: "#ff0000" });
      expect(tw("border-[#ccc]")).toEqual({ borderColor: "#ccc" });
    });

    it("gap, space, and position", () => {
      expect(tw("gap-[12]")).toEqual({ gap: 12 });
      expect(tw("space-y-[6]")).toEqual({ rowGap: 6 });
      expect(tw("space-x-[12px]")).toEqual({ columnGap: 12 });
      expect(tw("top-[10]")).toEqual({ top: 10 });
      expect(tw("left-[20px]")).toEqual({ left: 20 });
    });

    it("border and radius", () => {
      expect(tw("border-[3]")).toEqual({ borderWidth: 3 });
      expect(tw("border-[3px]")).toEqual({ borderWidth: 3 });
      expect(tw("rounded-[8]")).toEqual({ borderRadius: 8 });
    });

    it("opacity", () => {
      expect(tw("opacity-[0.8]")).toEqual({ opacity: 0.8 });
    });

    it("min/max dimensions", () => {
      expect(tw("min-w-[100]")).toEqual({ minWidth: 100 });
      expect(tw("max-w-[500px]")).toEqual({ maxWidth: 500 });
      expect(tw("min-h-[50]")).toEqual({ minHeight: 50 });
      expect(tw("max-h-[300]")).toEqual({ maxHeight: 300 });
    });
  });

  // ── alignSelf ──────────────────────────────────────────────────────
  describe("alignSelf", () => {
    it("self-* classes", () => {
      expect(tw("self-start")).toEqual({ alignSelf: "flex-start" });
      expect(tw("self-center")).toEqual({ alignSelf: "center" });
      expect(tw("self-end")).toEqual({ alignSelf: "flex-end" });
      expect(tw("self-stretch")).toEqual({ alignSelf: "stretch" });
      expect(tw("self-baseline")).toEqual({ alignSelf: "baseline" });
    });
  });

  // ── Combined / Real-world ────────────────────────────────────────
  describe("combined", () => {
    it("card-like styling", () => {
      expect(tw("flex flex-col items-center p-4 bg-gray-100 rounded-lg text-lg font-bold text-gray-900")).toEqual({
        flexDirection: "column",
        alignItems: "center",
        padding: 16,
        backgroundColor: "#f3f4f6",
        borderRadius: 8,
        fontSize: 18,
        lineHeight: 28 / 18,
        fontWeight: 700,
        color: "#111827",
      });
    });

    it("button-like styling", () => {
      expect(tw("px-4 py-2 bg-blue-500 text-white font-semibold rounded-md")).toEqual({
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "#3b82f6",
        color: "#ffffff",
        fontWeight: 600,
        borderRadius: 6,
      });
    });

    it("last class wins on conflict", () => {
      expect(tw("p-4 p-8")).toEqual({ padding: 32 });
      expect(tw("text-sm text-lg")).toEqual({ fontSize: 18, lineHeight: 28 / 18 });
      expect(tw("font-bold font-normal")).toEqual({ fontWeight: 400 });
    });
  });
});
