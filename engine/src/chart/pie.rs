//! Pie/donut chart builder.

use super::*;
use crate::model::ChartDataPoint;

/// Configuration for pie chart rendering.
pub struct PieChartConfig {
    pub donut: bool,
    pub show_legend: bool,
    pub title: Option<String>,
}

/// Build pie chart primitives from data points.
pub fn build(
    width: f64,
    height: f64,
    data: &[ChartDataPoint],
    config: &PieChartConfig,
) -> Vec<ChartPrimitive> {
    if data.is_empty() {
        return vec![];
    }

    let mut primitives = Vec::new();

    let title_offset = if config.title.is_some() {
        TITLE_HEIGHT
    } else {
        0.0
    };

    // Legend space on the right
    let legend_width = if config.show_legend { 80.0 } else { 0.0 };

    let available_w = width - legend_width;
    let available_h = height - title_offset;
    let radius = (available_w.min(available_h) / 2.0 - LABEL_MARGIN).max(1.0);
    let cx = available_w / 2.0;
    let cy = title_offset + available_h / 2.0;

    let total: f64 = data.iter().map(|d| d.value).sum();
    if total <= 0.0 {
        return vec![];
    }

    // Arc sectors
    let mut start_angle: f64 = -std::f64::consts::FRAC_PI_2; // Start at 12 o'clock
    for (i, dp) in data.iter().enumerate() {
        let slice_angle = (dp.value / total) * std::f64::consts::TAU;
        let end_angle = start_angle + slice_angle;
        let color = resolve_color(dp.color.as_deref(), i);

        primitives.push(ChartPrimitive::ArcSector {
            cx,
            cy,
            r: radius,
            start_angle,
            end_angle,
            fill: color,
        });

        start_angle = end_angle;
    }

    // Donut: white center circle
    if config.donut {
        let inner_r = radius * 0.55;
        primitives.push(ChartPrimitive::Circle {
            cx,
            cy,
            r: inner_r,
            fill: Color::WHITE,
        });
    }

    // Legend
    if config.show_legend {
        let legend_x = available_w + LABEL_MARGIN;
        let legend_y_start = title_offset + LABEL_MARGIN;
        let swatch_size = 8.0;
        let line_height = 14.0;

        for (i, dp) in data.iter().enumerate() {
            let ly = legend_y_start + i as f64 * line_height;
            let color = resolve_color(dp.color.as_deref(), i);

            primitives.push(ChartPrimitive::Rect {
                x: legend_x,
                y: ly,
                w: swatch_size,
                h: swatch_size,
                fill: color,
            });
            primitives.push(ChartPrimitive::Label {
                text: dp.label.clone(),
                x: legend_x + swatch_size + LABEL_MARGIN,
                y: ly + swatch_size - 1.0,
                font_size: AXIS_LABEL_FONT,
                color: LABEL_COLOR,
                anchor: TextAnchor::Left,
            });
        }
    }

    // Title
    if let Some(ref title) = config.title {
        primitives.push(ChartPrimitive::Label {
            text: title.clone(),
            x: width / 2.0,
            y: TITLE_FONT,
            font_size: TITLE_FONT,
            color: Color::BLACK,
            anchor: TextAnchor::Center,
        });
    }

    primitives
}
