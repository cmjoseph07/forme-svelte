export interface FormeStyle {
  // Layout
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly";
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  flexWrap?: "wrap" | "nowrap";
  gap?: number;
  columnGap?: number;
  rowGap?: number;
  position?: "relative" | "absolute";
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  overflow?: "hidden" | "visible";
  display?: "flex" | "grid";
  alignSelf?:
    | "auto"
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch";

  // Grid
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridColumnStart?: number;
  gridColumnEnd?: number;
  gridRowStart?: number;
  gridRowEnd?: number;
  gridColumnSpan?: number;
  gridRowSpan?: number;

  // Dimensions
  width?: number | string;
  height?: number | string;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;

  // Spacing
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  margin?: number | string;
  marginTop?: number | string;
  marginRight?: number | string;
  marginBottom?: number | string;
  marginLeft?: number | string;
  marginHorizontal?: number | string;
  marginVertical?: number | string;

  // Typography
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  color?: string;

  // Background
  backgroundColor?: string;

  // Borders
  borderWidth?: number;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomRightRadius?: number;
  borderBottomLeftRadius?: number;

  // Opacity
  opacity?: number;
}
