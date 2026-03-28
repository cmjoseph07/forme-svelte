//! Bar chart builder.

use super::*;
use crate::model::ChartDataPoint;

/// Configuration for bar chart rendering.
pub struct BarChartConfig {
    pub color: Option<String>,
    pub show_labels: bool,
    pub show_values: bool,
    pub show_grid: bool,
    pub title: Option<String>,
}

/// Build bar chart primitives from data points.
pub fn build(
    width: f64,
    height: f64,
    data: &[ChartDataPoint],
    config: &BarChartConfig,
) -> Vec<ChartPrimitive> {
    if data.is_empty() {
        return vec![];
    }

    let mut primitives = Vec::new();

    // Reserve space for title
    let title_offset = if config.title.is_some() {
        TITLE_HEIGHT
    } else {
        0.0
    };

    // Plot area
    let plot_left = Y_AXIS_WIDTH;
    let plot_top = title_offset;
    let plot_right = width - LABEL_MARGIN;
    let plot_bottom = height - X_AXIS_HEIGHT;
    let plot_width = plot_right - plot_left;
    let plot_height = plot_bottom - plot_top;

    if plot_width <= 0.0 || plot_height <= 0.0 {
        return vec![];
    }

    // Compute Y range
    let max_value = data.iter().map(|d| d.value).fold(0.0_f64, f64::max);
    let y_max = nice_number(max_value);
    let y_ticks = 5;

    // Grid lines
    if config.show_grid {
        for i in 0..=y_ticks {
            let frac = i as f64 / y_ticks as f64;
            let y = plot_bottom - frac * plot_height;
            primitives.push(ChartPrimitive::Line {
                x1: plot_left,
                y1: y,
                x2: plot_right,
                y2: y,
                stroke: GRID_COLOR,
                width: 0.5,
            });
        }
    }

    // Y-axis labels
    for i in 0..=y_ticks {
        let frac = i as f64 / y_ticks as f64;
        let y = plot_bottom - frac * plot_height;
        let value = y_max * frac;
        let label = format_number(value);
        primitives.push(ChartPrimitive::Label {
            text: label,
            x: plot_left - LABEL_MARGIN,
            y: y + AXIS_LABEL_FONT * 0.35,
            font_size: AXIS_LABEL_FONT,
            color: LABEL_COLOR,
            anchor: TextAnchor::Right,
        });
    }

    // Axes
    primitives.push(ChartPrimitive::Line {
        x1: plot_left,
        y1: plot_top,
        x2: plot_left,
        y2: plot_bottom,
        stroke: AXIS_COLOR,
        width: 1.0,
    });
    primitives.push(ChartPrimitive::Line {
        x1: plot_left,
        y1: plot_bottom,
        x2: plot_right,
        y2: plot_bottom,
        stroke: AXIS_COLOR,
        width: 1.0,
    });

    // Bars
    let bar_gap = 4.0;
    let n = data.len() as f64;
    let bar_width = (plot_width - bar_gap * (n + 1.0)) / n;
    let default_color = resolve_color(config.color.as_deref(), 0);

    for (i, dp) in data.iter().enumerate() {
        let bar_color = dp
            .color
            .as_deref()
            .map(parse_hex_color)
            .unwrap_or(default_color);
        let bar_h = if y_max > 0.0 {
            (dp.value / y_max) * plot_height
        } else {
            0.0
        };
        let bx = plot_left + bar_gap + i as f64 * (bar_width + bar_gap);
        let by = plot_bottom - bar_h;

        primitives.push(ChartPrimitive::Rect {
            x: bx,
            y: by,
            w: bar_width,
            h: bar_h,
            fill: bar_color,
        });

        // Value label above bar
        if config.show_values {
            let label = format_number(dp.value);
            primitives.push(ChartPrimitive::Label {
                text: label,
                x: bx + bar_width / 2.0,
                y: by - LABEL_MARGIN,
                font_size: AXIS_LABEL_FONT,
                color: LABEL_COLOR,
                anchor: TextAnchor::Center,
            });
        }

        // X-axis label
        if config.show_labels {
            primitives.push(ChartPrimitive::Label {
                text: dp.label.clone(),
                x: bx + bar_width / 2.0,
                y: plot_bottom + AXIS_LABEL_FONT + LABEL_MARGIN,
                font_size: AXIS_LABEL_FONT,
                color: LABEL_COLOR,
                anchor: TextAnchor::Center,
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
