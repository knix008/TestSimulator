/// Square MyDeskSearch icon: a blue rounded tile with a white magnifying glass.
pub fn render(size: u32) -> Vec<u8> {
    let samples: u32 = if size >= 128 { 2 } else { 4 };
    let mut rgba = vec![0_u8; (size * size * 4) as usize];
    let span = size as f32;
    let sample_count = (samples * samples) as f32;
    for y in 0..size {
        for x in 0..size {
            let mut acc = [0.0_f32; 4];
            for sy in 0..samples {
                for sx in 0..samples {
                    let px = x as f32 + (sx as f32 + 0.5) / samples as f32;
                    let py = y as f32 + (sy as f32 + 0.5) / samples as f32;
                    let color = pixel(px, py, span);
                    for channel in 0..4 {
                        acc[channel] += color[channel];
                    }
                }
            }
            let index = ((y * size + x) * 4) as usize;
            for channel in 0..4 {
                rgba[index + channel] = (acc[channel] / sample_count).round() as u8;
            }
        }
    }
    rgba
}

fn pixel(x: f32, y: f32, size: f32) -> [f32; 4] {
    let margin = size * 0.04;
    let radius = size * 0.22;
    if !in_round_rect(x, y, margin, margin, size - margin, size - margin, radius) {
        return [0.0, 0.0, 0.0, 0.0];
    }
    let blue = if y < size * 0.46 {
        [59.0, 130.0, 246.0]
    } else {
        [29.0, 78.0, 216.0]
    };
    if magnifier(x, y, size) {
        [255.0, 255.0, 255.0, 255.0]
    } else {
        [blue[0], blue[1], blue[2], 255.0]
    }
}

fn magnifier(x: f32, y: f32, size: f32) -> bool {
    let center_x = size * 0.42;
    let center_y = size * 0.42;
    let outer = size * 0.20;
    let thickness = (size * 0.055).max(1.0);
    let inner = (outer - thickness).max(0.0);
    let dx = x - center_x;
    let dy = y - center_y;
    let distance = (dx * dx + dy * dy).sqrt();
    if distance <= outer && distance >= inner {
        return true;
    }
    let along = (dx + dy) * std::f32::consts::FRAC_1_SQRT_2;
    let across = (dx - dy) * std::f32::consts::FRAC_1_SQRT_2;
    let start = outer * 0.62;
    let length = size * 0.20;
    along >= start && along <= start + length && across.abs() <= thickness * 0.55
}

fn in_round_rect(x: f32, y: f32, left: f32, top: f32, right: f32, bottom: f32, radius: f32) -> bool {
    let clamped_x = x.clamp(left + radius, right - radius);
    let clamped_y = y.clamp(top + radius, bottom - radius);
    let dx = x - clamped_x;
    let dy = y - clamped_y;
    dx * dx + dy * dy <= radius * radius
}
