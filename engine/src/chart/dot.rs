//! Dot plot (scatter plot) builder.

use super::*;
use crate::model::DotPlotGroup;

/// Configuration for dot plot rendering.
pub struct DotPlotConfig {
    pub x_min: Option<f64>,
    pub x_max: Option<f64>,
    pub y_min: Option<f64>,
    pub y_max: Option<f64>,
    pub x_label: Option<String>,
    pub y_label: Option<String>,
    pub show_legend: bool,
    pub dot_size: f64,
}

/// Build dot plot primitives from grouped data.
pub fn build(
    width: f64,
    height: f64,
    groups: &[DotPlotGroup],
    config: &DotPlotConfig,
) -> Vec<ChartPrimitive> {
    if groups.is_empty() {
        return vec![];
    }

    let mut primitives = Vec::new();

    // Legend space
    let legend_width = if config.show_legend { 80.0 } else { 0.0 };

    let plot_left = Y_AXIS_WIDTH;
    let plot_top = LABEL_MARGIN;
    let plot_right = width - LABEL_MARGIN - legend_width;
    let plot_bottom = height - X_AXIS_HEIGHT;
    let plot_width = plot_right - plot_left;
    let plot_height = plot_bottom - plot_top;

    if plot_width <= 0.0 || plot_height <= 0.0 {
        return vec![];
    }

    // Compute data bounds
    let all_points: Vec<(f64, f64)> = groups.iter().flat_map(|g| g.data.iter().copied()).collect();
    if all_points.is_empty() {
        return vec![];
    }

    let data_x_min = all_points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
    let data_x_max = all_points
        .iter()
        .map(|p| p.0)
        .fold(f64::NEG_INFINITY, f64::max);
    let data_y_min = all_points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
    let data_y_max = all_points
        .iter()
        .map(|p| p.1)
        .fold(f64::NEG_INFINITY, f64::max);

    let x_min = config.x_min.unwrap_or(data_x_min.min(0.0));
    let x_max = config.x_max.unwrap_or(nice_number(data_x_max));
    let y_min = config.y_min.unwrap_or(data_y_min.min(0.0));
    let y_max = config.y_max.unwrap_or(nice_number(data_y_max));

    let x_range = (x_max - x_min).max(1.0);
    let y_range = (y_max - y_min).max(1.0);

    // Grid lines (5 ticks each axis)
    let ticks = 5;
    for i in 0..=ticks {
        let frac = i as f64 / ticks as f64;
        // Horizontal grid
        let y = plot_bottom - frac * plot_height;
        primitives.push(ChartPrimitive::Line {
            x1: plot_left,
            y1: y,
            x2: plot_right,
            y2: y,
            stroke: GRID_COLOR,
            width: 0.5,
        });
        // Y label
        let y_val = y_min + frac * y_range;
        primitives.push(ChartPrimitive::Label {
            text: format_number(y_val),
            x: plot_left - LABEL_MARGIN,
            y: y + AXIS_LABEL_FONT * 0.35,
            font_size: AXIS_LABEL_FONT,
            color: LABEL_COLOR,
            anchor: TextAnchor::Right,
        });
        // X label
        let x = plot_left + frac * plot_width;
        let x_val = x_min + frac * x_range;
        primitives.push(ChartPrimitive::Label {
            text: format_number(x_val),
            x,
            y: plot_bottom + AXIS_LABEL_FONT + LABEL_MARGIN,
            font_size: AXIS_LABEL_FONT,
            color: LABEL_COLOR,
            anchor: TextAnchor::Center,
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

    // Dots — slight offset for overlapping groups
    let n_groups = groups.len() as f64;
    for (gi, group) in groups.iter().enumerate() {
        let color = resolve_color(group.color.as_deref(), gi);
        let offset = if n_groups > 1.0 {
            (gi as f64 - (n_groups - 1.0) / 2.0) * config.dot_size * 0.4
        } else {
            0.0
        };

        for &(dx, dy) in &group.data {
            let px = plot_left + ((dx - x_min) / x_range) * plot_width + offset;
            let py = plot_bottom - ((dy - y_min) / y_range) * plot_height;
            primitives.push(ChartPrimitive::Circle {
                cx: px,
                cy: py,
                r: config.dot_size,
                fill: color,
            });
        }
    }

    // Axis labels
    if let Some(ref label) = config.x_label {
        primitives.push(ChartPrimitive::Label {
            text: label.clone(),
            x: plot_left + plot_width / 2.0,
            y: height - 2.0,
            font_size: AXIS_LABEL_FONT,
            color: LABEL_COLOR,
            anchor: TextAnchor::Center,
        });
    }

    // Legend
    if config.show_legend {
        let legend_x = plot_right + LABEL_MARGIN;
        let legend_y_start = plot_top + LABEL_MARGIN;
        let swatch_size = 8.0;
        let line_height = 14.0;

        for (i, group) in groups.iter().enumerate() {
            let ly = legend_y_start + i as f64 * line_height;
            let color = resolve_color(group.color.as_deref(), i);

            primitives.push(ChartPrimitive::Circle {
                cx: legend_x + swatch_size / 2.0,
                cy: ly + swatch_size / 2.0,
                r: swatch_size / 2.0,
                fill: color,
            });
            primitives.push(ChartPrimitive::Label {
                text: group.name.clone(),
                x: legend_x + swatch_size + LABEL_MARGIN,
                y: ly + swatch_size - 1.0,
                font_size: AXIS_LABEL_FONT,
                color: LABEL_COLOR,
                anchor: TextAnchor::Left,
            });
        }
    }

    primitives
}
