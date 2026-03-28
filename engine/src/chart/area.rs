//! Area chart builder — like line chart but with filled regions under each series.

use super::*;
use crate::model::ChartSeries;

/// Configuration for area chart rendering.
pub struct AreaChartConfig {
    pub show_grid: bool,
    pub title: Option<String>,
}

/// Build area chart primitives from series data.
pub fn build(
    width: f64,
    height: f64,
    series: &[ChartSeries],
    labels: &[String],
    config: &AreaChartConfig,
) -> Vec<ChartPrimitive> {
    if series.is_empty() || labels.is_empty() {
        return vec![];
    }

    let mut primitives = Vec::new();

    let title_offset = if config.title.is_some() {
        TITLE_HEIGHT
    } else {
        0.0
    };

    let plot_left = Y_AXIS_WIDTH;
    let plot_top = title_offset;
    let plot_right = width - LABEL_MARGIN;
    let plot_bottom = height - X_AXIS_HEIGHT;
    let plot_width = plot_right - plot_left;
    let plot_height = plot_bottom - plot_top;

    if plot_width <= 0.0 || plot_height <= 0.0 {
        return vec![];
    }

    let max_value = series
        .iter()
        .flat_map(|s| s.data.iter())
        .copied()
        .fold(0.0_f64, f64::max);
    let y_max = nice_number(max_value);
    let y_ticks = 5;
    let n_points = labels.len();

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
        primitives.push(ChartPrimitive::Label {
            text: format_number(value),
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

    // X-axis labels
    for (i, label) in labels.iter().enumerate() {
        let x = if n_points > 1 {
            plot_left + (i as f64 / (n_points - 1) as f64) * plot_width
        } else {
            plot_left + plot_width / 2.0
        };
        primitives.push(ChartPrimitive::Label {
            text: label.clone(),
            x,
            y: plot_bottom + AXIS_LABEL_FONT + LABEL_MARGIN,
            font_size: AXIS_LABEL_FONT,
            color: LABEL_COLOR,
            anchor: TextAnchor::Center,
        });
    }

    // Filled areas + line overlays (paint in reverse order so first series is on top)
    for (si, s) in series.iter().enumerate().rev() {
        let color = resolve_color(s.color.as_deref(), si);
        let mut line_points = Vec::new();

        for (i, &value) in s.data.iter().enumerate() {
            if i >= n_points {
                break;
            }
            let x = if n_points > 1 {
                plot_left + (i as f64 / (n_points - 1) as f64) * plot_width
            } else {
                plot_left + plot_width / 2.0
            };
            let y = if y_max > 0.0 {
                plot_bottom - (value / y_max) * plot_height
            } else {
                plot_bottom
            };
            line_points.push((x, y));
        }

        if line_points.len() >= 2 {
            // Build closed polygon: line points + bottom edge
            let mut fill_points = line_points.clone();
            // Close to baseline
            fill_points.push((line_points.last().unwrap().0, plot_bottom));
            fill_points.push((line_points[0].0, plot_bottom));

            primitives.push(ChartPrimitive::FilledPath {
                points: fill_points,
                fill: color,
                opacity: 0.3,
            });

            primitives.push(ChartPrimitive::Polyline {
                points: line_points,
                stroke: color,
                width: 2.0,
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
