import type { ReactNode } from 'react';
import type { FontRegistration } from './font.js';
import type {
  Style,
  Edges,
  ColumnDef,
  BarcodeFormat,
  CanvasContext,
  CertificationConfig,
} from '@formepdf/shared';

// Framework-neutral types (document model, Style, canvas ops) live in
// @formepdf/shared; re-exported here so the public API is unchanged.
export type {
  Edges,
  Corners,
  GridTrackSize,
  EdgeColors,
  Style,
  CertificationConfig,
  SignatureConfig,
  ColumnDef,
  BarcodeFormat,
  ChartDataPoint,
  PieDataPoint,
  ChartSeries,
  DotPlotGroup,
  BarChartProps,
  LineChartProps,
  PieChartProps,
  AreaChartProps,
  DotPlotProps,
  CanvasContext,
  CanvasOp,
  TextRun,
  FormeFont,
  FormeDocument,
  FormeMetadata,
  FormePageConfig,
  FormePageSize,
  FormeEdges,
  FormeBoxShadow,
  FormeGradientStop,
  FormeBackground,
  FormeMarginEdges,
  FormeNode,
  FormeNodeKind,
  FormeColumnDef,
  FormeColumnWidth,
  FormeDimension,
  FormeColor,
  FormeEdgeValues,
  FormeCornerValues,
  FormeGridTrackSize,
  FormeGridPlacement,
  FormeStyle,
} from '@formepdf/shared';

// ─── Component prop types ────────────────────────────────────────────

export interface DocumentProps {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  /** Document language (BCP 47 tag, e.g. "en-US"). Emitted as /Lang in the PDF Catalog. */
  lang?: string;
  /** Default style applied to the entire document. Sets global fontFamily, fontSize, color, etc. */
  style?: Style;
  /** Whether to produce a tagged (accessible) PDF with structure tree. */
  tagged?: boolean;
  /** PDF/A conformance level. "2a" requires tagging, "2b" is visual-only compliance. */
  pdfa?: '2a' | '2b';
  /** When true, the PDF claims PDF/UA-1 conformance. Forces tagging. */
  pdfUa?: boolean;
  /** Digital certification configuration. Certifies the PDF with an X.509 certificate. */
  certification?: CertificationConfig;
  /** @deprecated Use certification */
  signature?: CertificationConfig;
  fonts?: FontRegistration[];
  children?: ReactNode;
}

export interface PageProps {
  size?: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'Tabloid' | { width: number; height: number };
  margin?: number | string | number[] | Edges;
  /** Optional background image painted behind the page's content. URL,
   *  file path, or `data:image/...;base64,` URI. */
  backgroundImage?: string;
  /** Background image opacity 0–1. Defaults to 1.0. */
  backgroundOpacity?: number;
  /** How the background image is sized within the page. */
  backgroundSize?: 'fill' | 'cover' | 'contain';
  /** Where the background image is positioned within the page. */
  backgroundPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  children?: ReactNode;
}

export interface ViewProps {
  style?: Style;
  wrap?: boolean;
  bookmark?: string;
  href?: string;
  children?: ReactNode;
}

export interface TextProps {
  style?: Style;
  href?: string;
  bookmark?: string;
  children?: ReactNode;
}

export interface ImageProps {
  src: string;
  width?: number;
  height?: number;
  style?: Style;
  /** Optional hyperlink URL — makes the image clickable. */
  href?: string;
  /** Alt text for accessibility. */
  alt?: string;
}

export interface TableProps {
  columns?: ColumnDef[];
  style?: Style;
  children?: ReactNode;
}

export interface RowProps {
  header?: boolean;
  style?: Style;
  children?: ReactNode;
}

export interface CellProps {
  colSpan?: number;
  rowSpan?: number;
  style?: Style;
  children?: ReactNode;
}

export interface FixedProps {
  position: 'header' | 'footer';
  style?: Style;
  bookmark?: string;
  children?: ReactNode;
}

export interface SvgProps {
  width: number;
  height: number;
  viewBox?: string;
  /** SVG markup string (inner content). If children are provided, this takes priority. */
  content?: string;
  style?: Style;
  /** Optional hyperlink URL — makes the SVG clickable. */
  href?: string;
  /** Alt text for accessibility. */
  alt?: string;
  /** JSX SVG children (path, rect, circle, g, etc.). Alternative to the content prop. */
  children?: ReactNode;
}

export interface QrCodeProps {
  /** Data to encode (URL, text, etc.) */
  data: string;
  /** Display size in points (QR codes are square). Defaults to available width. */
  size?: number;
  /** QR code color. Default: black. */
  color?: string;
  style?: Style;
}

export interface BarcodeProps {
  /** The data to encode. */
  data: string;
  /** Barcode format. Default: "Code128". */
  format?: BarcodeFormat;
  /** Width in points. Defaults to available width. */
  width?: number;
  /** Height in points. Default: 60. */
  height?: number;
  /** Bar color. Default: black. */
  color?: string;
  style?: Style;
}

export interface TextFieldProps {
  /** Unique field name (used as the PDF field identifier). */
  name: string;
  /** Pre-filled value. */
  value?: string;
  /** Placeholder text shown when empty. */
  placeholder?: string;
  /** Field width in points. */
  width: number;
  /** Field height in points. Default: 24. */
  height?: number;
  /** Allow multi-line input. Default: false. */
  multiline?: boolean;
  /** Mask input as password. Default: false. */
  password?: boolean;
  /** Prevent editing. Default: false. */
  readOnly?: boolean;
  /** Maximum number of characters. */
  maxLength?: number;
  /** Font size in points. Default: 12. */
  fontSize?: number;
  style?: Style;
}

export interface CheckboxProps {
  /** Unique field name. */
  name: string;
  /** Whether the checkbox is checked. Default: false. */
  checked?: boolean;
  /** Display width in points. Default: 14. */
  width?: number;
  /** Display height in points. Default: 14. */
  height?: number;
  /** Prevent editing. Default: false. */
  readOnly?: boolean;
  style?: Style;
}

export interface DropdownProps {
  /** Unique field name. */
  name: string;
  /** List of selectable options. */
  options: string[];
  /** Pre-selected value. */
  value?: string;
  /** Field width in points. */
  width: number;
  /** Field height in points. Default: 24. */
  height?: number;
  /** Prevent editing. Default: false. */
  readOnly?: boolean;
  /** Font size in points. Default: 12. */
  fontSize?: number;
  style?: Style;
}

export interface RadioButtonProps {
  /** Field name — multiple RadioButtons with the same name form a group. */
  name: string;
  /** The value this button represents within the group. */
  value: string;
  /** Whether this button is selected. Default: false. */
  checked?: boolean;
  /** Display width in points. Default: 14. */
  width?: number;
  /** Display height in points. Default: 14. */
  height?: number;
  /** Prevent editing. Default: false. */
  readOnly?: boolean;
  style?: Style;
}

export interface WatermarkProps {
  /** The watermark text (e.g. "DRAFT", "CONFIDENTIAL"). */
  text: string;
  /** Font size in points. Default: 60. */
  fontSize?: number;
  /** Text color with alpha. Use `rgba(r,g,b,a)` for opacity. Default: "rgba(0,0,0,0.1)". */
  color?: string;
  /** Rotation angle in degrees (negative = counterclockwise). Default: -45. */
  angle?: number;
  style?: Style;
}

export interface CanvasProps {
  width: number;
  height: number;
  draw: (ctx: CanvasContext) => void;
  style?: Style;
}
