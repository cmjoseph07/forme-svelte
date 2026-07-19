// Components
export { default as Document } from './components/Document.svelte';
export { default as Page } from './components/Page.svelte';
export { default as View } from './components/View.svelte';
export { default as Text } from './components/Text.svelte';
export { default as Table } from './components/Table.svelte';
export { default as Row } from './components/Row.svelte';
export { default as Cell } from './components/Cell.svelte';
export { default as Fixed } from './components/Fixed.svelte';
export { default as Image } from './components/Image.svelte';
export { default as Svg } from './components/Svg.svelte';
export { default as QrCode } from './components/QrCode.svelte';
export { default as Barcode } from './components/Barcode.svelte';

// Page-number placeholders
export { PAGE_NUMBER, TOTAL_PAGES } from './constants.js';

// Serialization
export { serialize, render, renderToObject } from './serialize.js';
export type { SerializeOptions } from './serialize.js';
export { mapStyle, mapDimension, parseColor, expandEdges, expandCorners } from '@formepdf/shared';

// StyleSheet
export { StyleSheet } from './stylesheet.js';

// Types
export type {
  // Developer-facing
  Style,
  TextRun,
  ColumnDef,
  BarcodeFormat,
  GridTrackSize,
  Edges,
  Corners,
  EdgeColors,
  CertificationConfig,
  SignatureConfig,
  // Forme JSON output
  FormeDocument,
  FormeFont,
  FormeNode,
  FormeNodeKind,
  FormeStyle,
  FormeMetadata,
  FormePageConfig,
  FormePageSize,
  FormeEdges,
  FormeColumnDef,
  FormeColumnWidth,
  FormeDimension,
  FormeColor,
  FormeEdgeValues,
  FormeCornerValues,
  FormeGridTrackSize,
  FormeGridPlacement,
} from '@formepdf/shared';
