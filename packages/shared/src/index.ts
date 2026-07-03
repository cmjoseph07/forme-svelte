// Style mapping
export { mapStyle, mapDimension, parseColor, expandEdges, expandCorners, mapColumnWidth } from './style.js';

// Font registration
export { Font, mergeFonts } from './font.js';
export type { FontRegistration } from './font.js';

// Canvas recording
export { recordCanvasOperations } from './canvas.js';

// Types
export type {
  // Developer-facing
  Style,
  GridTrackSize,
  Edges,
  Corners,
  EdgeColors,
  CertificationConfig,
  SignatureConfig,
  ColumnDef,
  BarcodeFormat,
  ChartDataPoint,
  PieDataPoint,
  ChartSeries,
  DotPlotGroup,
  CanvasContext,
  CanvasOp,
  TextRun,
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
  FormeBoxShadow,
  FormeGradientStop,
  FormeBackground,
  FormeMarginEdges,
  FormeColumnDef,
  FormeColumnWidth,
  FormeDimension,
  FormeColor,
  FormeEdgeValues,
  FormeCornerValues,
  FormeGridTrackSize,
  FormeGridPlacement,
} from './types.js';
