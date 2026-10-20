#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ThemePalette {
    pub text_color: String,
    pub sub_text_color: String,
    pub border_color: String,
}

pub const DEFAULT_LIGHT_ICON: &str = "#141414";
pub const DEFAULT_DARK_ICON: &str = "#F5F5F5";

pub const BACKGROUND_SWATCHES: &[&str] = &[
    "#FFB3BA", "#FFC5A8", "#FFD8B1", "#FFE8B3", "#FFF5BA", "#F1F0A8", "#DCEDC1", "#C1F0C1",
    "#B4F8C8", "#A8E6CF", "#A0E7E5", "#B5E2FA", "#B3D4FF", "#C7CEEA", "#C3B1E1", "#D8BFD8",
    "#E0BBE4", "#F5C6E0", "#FFC8DD", "#FFB6C1", "#D7C4A3", "#CBD5D8", "#FFFFFF", "#1E1E1E",
];

pub const TEXT_SWATCHES: &[&str] = &[
    "#212121", "#37474F", "#455A64", "#5D4037", "#33691E", "#1565C0", "#4527A0", "#C62828",
    "#FFFFFF", "#F5F5F5", "#ECEFF1", "#CFD8DC", "#B0BEC5", "#90CAF9", "#80DEEA", "#A5D6A7",
    "#FFE082", "#FFAB91", "#CE93D8", "#BCAAA4",
];

pub fn parse_color(hex: &str) -> Rgb {
    let value = hex.trim().trim_start_matches('#');
    let (digits, alpha) = match value.len() {
        8 => (&value[2..8], u8_from_hex(&value[0..2]).unwrap_or(255)),
        6 => (value, 255),
        3 => {
            let expanded: String = value.chars().flat_map(|c| [c, c]).collect();
            return parse_color(&expanded);
        }
        _ => {
            return Rgb {
                r: 255,
                g: 255,
                b: 255,
                a: 255,
            }
        }
    };
    Rgb {
        r: u8_from_hex(&digits[0..2]).unwrap_or(255),
        g: u8_from_hex(&digits[2..4]).unwrap_or(255),
        b: u8_from_hex(&digits[4..6]).unwrap_or(255),
        a: alpha,
    }
}

fn u8_from_hex(text: &str) -> Option<u8> {
    u8::from_str_radix(text, 16).ok()
}

pub fn is_dark(hex: &str) -> bool {
    let color = parse_color(hex);
    let linear = |channel: u8| {
        let value = channel as f64 / 255.0;
        if value <= 0.03928 {
            value / 12.92
        } else {
            ((value + 0.055) / 1.055).powf(2.4)
        }
    };
    let luminance = 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    luminance < 0.45
}

pub fn palette_for_background(background: &str) -> ThemePalette {
    if is_dark(background) {
        ThemePalette {
            text_color: "#F5F5F5".to_string(),
            sub_text_color: "#B0BEC5".to_string(),
            border_color: "#44FFFFFF".to_string(),
        }
    } else {
        ThemePalette {
            text_color: "#222222".to_string(),
            sub_text_color: "#888888".to_string(),
            border_color: "#33000000".to_string(),
        }
    }
}

pub fn default_icon_color(background: &str) -> &'static str {
    if is_dark(background) {
        DEFAULT_DARK_ICON
    } else {
        DEFAULT_LIGHT_ICON
    }
}

pub fn resolve_display_colors(settings: &crate::model::AppSettings) -> ThemePalette {
    if is_dark(&settings.background_color) {
        ThemePalette {
            text_color: if is_dark(&settings.text_color) {
                "#F5F5F5".to_string()
            } else {
                settings.text_color.clone()
            },
            sub_text_color: if is_dark(&settings.sub_text_color) {
                "#B0BEC5".to_string()
            } else {
                settings.sub_text_color.clone()
            },
            border_color: if is_low_contrast_border_on_dark(&settings.border_color) {
                "#44FFFFFF".to_string()
            } else {
                settings.border_color.clone()
            },
        }
    } else {
        ThemePalette {
            text_color: if !is_dark(&settings.text_color) {
                settings.text_color.clone()
            } else {
                "#222222".to_string()
            },
            sub_text_color: if !is_dark(&settings.sub_text_color) {
                settings.sub_text_color.clone()
            } else {
                "#888888".to_string()
            },
            border_color: settings.border_color.clone(),
        }
    }
}

fn is_low_contrast_border_on_dark(border: &str) -> bool {
    let color = parse_color(border);
    is_dark(border) || color.a < 64
}

pub fn sync_theme_text_colors(settings: &mut crate::model::AppSettings) {
    let palette = palette_for_background(&settings.background_color);
    settings.text_color = palette.text_color;
    settings.sub_text_color = palette.sub_text_color;
    settings.border_color = palette.border_color;
    settings.icon_color = default_icon_color(&settings.background_color).to_string();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dark_background_switches_palette() {
        assert!(!is_dark("#FFFFFF"));
        assert!(is_dark("#1E1E1E"));
        let dark = palette_for_background("#1E1E1E");
        assert_eq!(dark.text_color, "#F5F5F5");
        assert_eq!(default_icon_color("#1E1E1E"), DEFAULT_DARK_ICON);
        let light = palette_for_background("#FFFFFF");
        assert_eq!(light.text_color, "#222222");
    }

    #[test]
    fn parses_rgb_and_argb() {
        let rgb = parse_color("#112233");
        assert_eq!((rgb.r, rgb.g, rgb.b, rgb.a), (0x11, 0x22, 0x33, 255));
        let argb = parse_color("#80112233");
        assert_eq!(argb.a, 0x80);
    }
}
