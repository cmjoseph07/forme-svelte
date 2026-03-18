# @formepdf/tailwind

Style [Forme](https://formepdf.com) PDF components with Tailwind CSS utility classes.

```bash
npm install @formepdf/tailwind
```

```tsx
import { tw } from '@formepdf/tailwind';
import { Document, Page, View, Text } from '@formepdf/react';

<Document>
  <Page size="Letter" margin={54}>
    <View style={tw("flex-row items-center justify-between p-6 bg-slate-100 rounded-lg")}>
      <Text style={tw("text-2xl font-bold text-slate-900")}>Invoice #001</Text>
      <Text style={tw("text-sm text-slate-500")}>March 2026</Text>
    </View>
  </Page>
</Document>
```

`tw()` parses a space-separated string of Tailwind classes and returns a plain style object. Unknown classes are silently ignored. When classes conflict, the last one wins.

```tsx
tw("p-4 text-lg font-bold text-blue-500")
// → { padding: 16, fontSize: 18, fontWeight: 700, color: '#3b82f6' }
```

## Supported classes

**Spacing** — `p-{n}`, `px-{n}`, `py-{n}`, `pt-{n}`, `m-{n}`, `mx-{n}`, `mx-auto`, negative values (`-mt-4`), `p-px`

**Typography** — `text-xs` through `text-9xl`, `font-thin` through `font-black`, `italic`, `text-left/center/right/justify`, `leading-*`, `tracking-*`, `underline`, `line-through`, `uppercase`, `lowercase`, `capitalize`

**Colors** — Full Tailwind palette (slate, gray, red, blue, etc.) with shades 50–950: `text-{color}-{shade}`, `bg-{color}-{shade}`, `border-{color}-{shade}`

**Layout** — `flex-row`, `flex-col`, `items-*`, `justify-*`, `self-*`, `flex-1`, `flex-wrap`, `gap-{n}`

**Dimensions** — `w-{n}`, `h-{n}`, `w-full`, `w-auto`, `w-1/2`, `min-w-{n}`, `max-w-{n}`

**Grid** — `grid`, `grid-cols-{n}`, `col-span-{n}`, `col-start-{n}`, `row-span-{n}`

**Borders** — `border`, `border-{n}`, `border-t`, `rounded`, `rounded-lg`, `rounded-full`

**Other** — `relative`, `absolute`, `top-{n}`, `overflow-hidden`, `opacity-{n}`

**Arbitrary values** — `w-[200]`, `text-[14px]`, `p-[20]`, `text-[#333]`, `bg-[#ff0000]`

## Auto margins

Horizontal centering with `mx-auto`:

```tsx
<View style={tw("mx-auto w-64")}>
  <Text>Centered content</Text>
</View>
```

Also supports `my-auto`, `mt-auto`, `mr-auto`, `mb-auto`, `ml-auto`, `m-auto`.

## TypeScript

`tw()` returns a `FormeStyle` compatible with Forme component `style` props — no type casting needed:

```tsx
import { tw, type FormeStyle } from '@formepdf/tailwind';

const style: FormeStyle = tw("p-4 bg-white rounded-lg");
```

## What's not supported

Tailwind features that don't apply to PDF rendering: responsive prefixes (`sm:`, `md:`), state variants (`hover:`, `focus:`), dark mode, `space-x/y`, `z-index`, `aspect-ratio`.

## Docs

Full documentation: [docs.formepdf.com/tailwind](https://docs.formepdf.com/tailwind)
