// 박스 테마. 색 조합마다 이름을 붙여 두고 메뉴에서 고른다.
// bg 는 박스 바탕, bar 는 제목 줄, text 는 글씨 색이다.
// 값은 src/shared/themes.json 한 곳에 있다. tools/make-icons.js 도 그것으로 테마 그림을 그린다.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;

use crate::js::round;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Label {
    pub ko: String,
    pub en: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Theme {
    pub id: String,
    pub label: Label,
    pub bg: String,
    pub bar: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Corner {
    pub id: String,
    pub label: Label,
    pub radius: i64,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct Data {
    THEMES: Vec<Theme>,
    CORNERS: Vec<Corner>,
    DEFAULT_THEME: String,
    DEFAULT_OPACITY: f64,
    DEFAULT_CORNER: i64,
    MIN_CORNER: i64,
    MAX_CORNER: i64,
    OPACITIES: Vec<f64>,
}

fn data() -> &'static Data {
    static DATA: OnceLock<Data> = OnceLock::new();
    DATA.get_or_init(|| serde_json::from_str(include_str!("../../src/shared/themes.json")).expect("themes.json"))
}

pub fn themes() -> &'static [Theme] {
    &data().THEMES
}
pub fn corners() -> &'static [Corner] {
    &data().CORNERS
}
pub fn opacities() -> &'static [f64] {
    &data().OPACITIES
}
pub fn default_theme() -> &'static str {
    &data().DEFAULT_THEME
}
pub fn default_opacity() -> f64 {
    data().DEFAULT_OPACITY
}
pub fn default_corner() -> i64 {
    data().DEFAULT_CORNER
}
pub fn min_corner() -> i64 {
    data().MIN_CORNER
}
pub fn max_corner() -> i64 {
    data().MAX_CORNER
}

// 모서리는 픽셀 수로 저장한다. 예전 저장본은 이름으로 적혀 있어 숫자로 옮긴다.
pub fn corner_radius(value: &Value) -> i64 {
    if let Some(n) = value.as_f64() {
        if n.is_finite() {
            return (round(n) as i64).clamp(min_corner(), max_corner());
        }
    }
    if let Some(name) = value.as_str() {
        if let Some(found) = corners().iter().find(|c| c.id == name) {
            return found.radius;
        }
    }
    default_corner()
}

pub fn corner_radius_of(value: f64) -> i64 {
    corner_radius(&serde_json::json!(value))
}

// 지금 값에 가장 가까운 이름. 메뉴 그림을 고를 때 쓴다.
pub fn corner_name(value: &Value) -> &'static str {
    let radius = corner_radius(value);
    let mut best = &corners()[0];
    for corner in corners() {
        if (corner.radius - radius).abs() < (best.radius - radius).abs() {
            best = corner;
        }
    }
    &best.id
}

pub fn theme_of(id: &str) -> &'static Theme {
    themes()
        .iter()
        .find(|t| t.id == id)
        .or_else(|| themes().iter().find(|t| t.id == default_theme()))
        .unwrap()
}

// 예전 저장본은 테마 대신 색 하나만 갖고 있다. 가장 가까운 테마로 옮긴다.
pub fn theme_for_color(hex: &str) -> String {
    let value = hex.to_ascii_lowercase();
    if let Some(exact) = themes().iter().find(|t| t.bg.to_ascii_lowercase() == value) {
        return exact.id.clone();
    }
    let Some(target) = parse_hex(&value) else { return default_theme().to_string() };
    let mut best = default_theme().to_string();
    let mut gap_best = f64::INFINITY;
    for theme in themes() {
        let rgb = parse_hex(&theme.bg).unwrap();
        let gap: f64 = (0..3).map(|i| (rgb[i] as f64 - target[i] as f64).powi(2)).sum();
        if gap < gap_best {
            gap_best = gap;
            best = theme.id.clone();
        }
    }
    best
}

pub fn parse_hex(hex: &str) -> Option<[u8; 3]> {
    let body = hex.strip_prefix('#').unwrap_or(hex);
    if body.len() != 6 || !body.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let value = u32::from_str_radix(body, 16).ok()?;
    Some([(value >> 16) as u8, (value >> 8) as u8, value as u8])
}

// 밝기. 글씨를 희게 둘지 검게 둘지 정할 때 쓴다.
pub fn brightness(hex: &str) -> f64 {
    let rgb = parse_hex(hex).unwrap_or([0, 0, 0]);
    (rgb[0] as f64 * 0.299 + rgb[1] as f64 * 0.587 + rgb[2] as f64 * 0.114) / 255.0
}

pub fn darken(hex: &str, keep: f64) -> String {
    let rgb = parse_hex(hex).unwrap_or([37, 99, 235]);
    let part = |v: u8| {
        let scaled = (v as f64 * keep / 255.0).clamp(0.0, 1.0) * 255.0;
        format!("{:02x}", round(scaled) as u8)
    };
    format!("#{}{}{}", part(rgb[0]), part(rgb[1]), part(rgb[2]))
}

pub fn auto_text(bg: &str) -> &'static str {
    if brightness(bg) > 0.62 {
        "#0f172a"
    } else {
        "#ffffff"
    }
}

// 직접 고른 색도 테마처럼 다룬다.
pub fn custom_theme(bg: Option<&str>, bar: Option<&str>) -> Theme {
    let bg = match bg {
        Some(v) if parse_hex(v).is_some() => v.to_string(),
        _ => themes()[0].bg.clone(),
    };
    let bar = match bar {
        Some(v) if parse_hex(v).is_some() => v.to_string(),
        _ => darken(&bg, 0.55),
    };
    Theme {
        id: "custom".into(),
        label: Label { ko: "직접 고른 색".into(), en: "Custom".into() },
        text: auto_text(&bg).into(),
        bg,
        bar,
    }
}

// 메뉴에 보여 줄 이름. 테마 이름은 언어마다 다르다.
pub fn label<'a>(label: &'a Label, lang: &str) -> &'a str {
    if lang == "en" {
        &label.en
    } else {
        &label.ko
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn corner_radius_is_clamped_to_pixels_within_the_allowed_range() {
        assert_eq!(corner_radius(&json!(9.6)), 10);
        assert_eq!(corner_radius(&json!(-4)), 0);
        assert_eq!(corner_radius(&json!(80)), max_corner());
        assert_eq!(corner_radius(&json!("soft")), 9);
        assert_eq!(corner_radius(&json!("없는이름")), default_corner());
        assert_eq!(corner_radius(&Value::Null), default_corner());
    }

    #[test]
    fn picks_the_corner_name_closest_to_a_pixel_value() {
        assert_eq!(corner_name(&json!(0)), "square");
        assert_eq!(corner_name(&json!(8)), "soft");
        assert_eq!(corner_name(&json!(20)), "round");
    }

    #[test]
    fn a_single_legacy_color_migrates_to_the_closest_theme() {
        assert_eq!(theme_for_color("#2563eb"), "ocean");
        assert_eq!(theme_for_color("#2563EC"), "ocean");
        assert_eq!(theme_for_color(""), default_theme());
        assert_eq!(theme_for_color("not-a-color"), default_theme());
        let near = theme_for_color("#102030");
        assert_eq!(theme_of(&near).id, near);
    }

    #[test]
    fn an_unknown_theme_name_falls_back_to_the_default_theme() {
        assert_eq!(theme_of("없는테마").id, default_theme());
        assert_eq!(theme_of("night").id, "night");
    }

    #[test]
    fn text_color_follows_background_brightness() {
        assert_eq!(auto_text("#ffffff"), "#0f172a");
        assert_eq!(auto_text("#020617"), "#ffffff");
        assert_eq!(brightness("#000000"), 0.0);
    }

    #[test]
    fn custom_colors_and_derived_bar() {
        let picked = custom_theme(Some("#112233"), Some("#001122"));
        assert_eq!(picked.bg, "#112233");
        assert_eq!(picked.bar, "#001122");
        assert_eq!(picked.text, "#ffffff");
        let derived = custom_theme(Some("#ffffff"), None);
        assert_eq!(derived.bar, darken("#ffffff", 0.55));
        assert_ne!(derived.bar, "#ffffff");
        assert_eq!(parse_hex("#abc"), None);
        assert_eq!(parse_hex("#aabbcc"), Some([170, 187, 204]));
    }

    #[test]
    fn theme_labels_follow_the_selected_language() {
        let ocean = theme_of("ocean");
        assert_eq!(label(&ocean.label, "ko"), "바다");
        assert_eq!(label(&ocean.label, "en"), "Ocean");
        assert_eq!(label(&ocean.label, "fr"), "바다");
        assert_eq!(themes().len(), 30);
    }
}
