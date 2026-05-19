/// The list of Forme component names exposed to user JSX. Source of
/// truth — the tool description in `index.ts`, the create-custom-pdf
/// prompt, and the README must all stay aligned with this list. Anything
/// missing here becomes a `ReferenceError` at evaluation time.
export const FORME_COMPONENT_NAMES = [
  // Layout
  'Document', 'Page', 'View', 'Text', 'Image', 'PageBreak',
  // Tables
  'Table', 'Row', 'Cell',
  // Fixed / decorative
  'Fixed', 'Watermark',
  // Graphics
  'Svg', 'Canvas', 'QrCode', 'Barcode',
  // Charts
  'BarChart', 'LineChart', 'PieChart', 'AreaChart', 'DotPlot',
  // Forms (AcroForms)
  'TextField', 'Checkbox', 'Dropdown', 'RadioButton',
  // Style / font helpers
  'StyleSheet', 'Font',
] as const;

export type FormeComponentName = (typeof FORME_COMPONENT_NAMES)[number];
