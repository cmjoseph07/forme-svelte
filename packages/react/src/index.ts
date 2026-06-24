// Components
export { Document, Page, View, Text, Strong, Em, Code, Link, Image, Table, Row, Cell, Fixed, Svg, QrCode, Barcode, Canvas, Watermark, PageBreak, BarChart, LineChart, PieChart, AreaChart, DotPlot, TextField, Checkbox, Dropdown, RadioButton } from './components.js';
export { LegacyBarChart, LegacyLineChart, LegacyPieChart } from './charts.js';

// Serialization
export { serialize, serializeTemplate, mapStyle, mapDimension, parseColor, expandEdges, expandCorners } from './serialize.js';

// StyleSheet
export { StyleSheet } from './stylesheet.js';

// Font registration
export { Font } from './font.js';
export type { FontRegistration } from './font.js';

// Template compilation
export { createDataProxy, isRefMarker, isEachMarker, isExprMarker } from './template-proxy.js';
export { expr } from './expr.js';

// Render functions
export { render, renderToObject } from './render.js';

// Types
export type {
  // Developer-facing
  Style,
  GridTrackSize,
  Edges,
  Corners,
  EdgeColors,
  DocumentProps,
  PageProps,
  ViewProps,
  TextProps,
  StrongProps,
  EmProps,
  CodeProps,
  LinkProps,
  ImageProps,
  ColumnDef,
  TableProps,
  RowProps,
  CellProps,
  FixedProps,
  SvgProps,
  QrCodeProps,
  BarcodeProps,
  BarcodeFormat,
  CanvasProps,
  CanvasContext,
  CanvasOp,
  WatermarkProps,
  ChartDataPoint,
  PieDataPoint,
  ChartSeries,
  DotPlotGroup,
  BarChartProps,
  LineChartProps,
  PieChartProps,
  AreaChartProps,
  DotPlotProps,
  TextFieldProps,
  CheckboxProps,
  DropdownProps,
  RadioButtonProps,
  TextRun,
  CertificationConfig,
  SignatureConfig,
  // Forme JSON output
  FormeDocument,
  FormeFont,
  FormeNode,
  FormeNodeKind,
  FormeStyle,
  FormePageConfig,
  FormePageSize,
  FormeEdges,
  FormeMetadata,
  FormeColumnDef,
  FormeColumnWidth,
  FormeDimension,
  FormeColor,
  FormeEdgeValues,
  FormeCornerValues,
  FormeGridTrackSize,
  FormeGridPlacement,
} from './types.js';
