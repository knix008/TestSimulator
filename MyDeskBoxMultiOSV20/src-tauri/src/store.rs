// layout.json 읽기·쓰기와 박스 값 정규화 (Electron 판 src/main/store.js 를 옮긴 것).
// 파일 모양은 Electron 판과 같다. 깔아 둔 판을 바꿔도 박스 배치가 그대로 이어진다.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

use crate::{i18n, themes};

pub const VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub lang: String,
    // 설치하고 시스템을 다시 켤 때 스스로 돌아와 있어야 한다. 끄고 싶으면 설정에서 끈다.
    pub open_at_login: bool,
    pub theme: String,
    pub opacity: f64,
    pub corner: i64,
    pub shadow: bool,
    // 숨김·임시 파일을 박스에 보여 줄지. 새 박스는 이 값을 따른다.
    pub show_hidden: bool,
    // 박스 안의 아이콘을 한 번 눌러 열지('single'), 두 번 눌러 열지('double').
    pub open_with: String,
    // 박스들이 쓰는 보관함 폴더. 비워 두면 사용자 데이터 폴더 아래 'boxes' 를 쓴다.
    pub root: String,
    // 모르는 값도 지우지 않고 그대로 다시 적는다.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Custom {
    pub bg: String,
    pub bar: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Item {
    pub name: String,
    pub path: String,
    // 담기 전에 있던 폴더. 끝낼 때 그 자리로 돌려준다.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub home: Option<String>,
}

impl Item {
    pub fn new(name: impl Into<String>, path: impl Into<String>) -> Self {
        Self { name: name.into(), path: path.into(), home: None }
    }
    pub fn home_str(&self) -> &str {
        self.home.as_deref().unwrap_or("")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Fence {
    pub id: String,
    pub title: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub theme: String,
    pub opacity: f64,
    pub corner: i64,
    pub custom: Option<Custom>,
    pub collapsed: bool,
    pub show_hidden: bool,
    pub folder: String,
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub version: u32,
    pub did_welcome: bool,
    pub hidden: bool,
    pub settings: Settings,
    pub fences: Vec<Fence>,
}

pub fn defaults(locale: &str) -> State {
    State {
        version: VERSION,
        did_welcome: false,
        hidden: false,
        settings: Settings {
            lang: i18n::guess_lang(locale).into(),
            open_at_login: true,
            theme: themes::default_theme().into(),
            opacity: themes::default_opacity(),
            corner: themes::default_corner(),
            shadow: false,
            show_hidden: false,
            open_with: "double".into(),
            root: String::new(),
            extra: Map::new(),
        },
        fences: vec![],
    }
}

pub fn file_path(user_dir: &Path) -> PathBuf {
    user_dir.join("layout.json")
}

// 자바스크립트의 !!value
pub fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

// 자바스크립트의 Number(value). 바꿀 수 없으면 NaN 이다.
pub fn js_number(v: &Value) -> f64 {
    match v {
        Value::Null => 0.0,
        Value::Bool(b) => {
            if *b {
                1.0
            } else {
                0.0
            }
        }
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                0.0
            } else {
                t.parse::<f64>().unwrap_or(f64::NAN)
            }
        }
        Value::Array(a) if a.is_empty() => 0.0,
        Value::Array(a) if a.len() == 1 => js_number(&a[0]),
        _ => f64::NAN,
    }
}

// 자바스크립트의 String(value)
pub fn js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(0.0);
            if f.fract() == 0.0 && f.abs() < 1e21 {
                format!("{}", f as i64)
            } else {
                format!("{f}")
            }
        }
        Value::Array(_) | Value::Object(_) => "[object Object]".into(),
    }
}

// Number(x) || fallback
fn number_or(v: &Value, fallback: f64) -> f64 {
    let n = js_number(v);
    if n == 0.0 || n.is_nan() {
        fallback
    } else {
        n
    }
}

pub fn load(user_dir: &Path, locale: &str) -> State {
    let mut data = defaults(locale);
    let Ok(text) = fs::read_to_string(file_path(user_dir)) else { return data };
    // 처음 실행이거나 파일이 깨진 경우 기본값으로 시작한다.
    let Ok(Value::Object(parsed)) = serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) else {
        return data;
    };
    data.did_welcome = parsed.get("didWelcome").map(truthy).unwrap_or(false);
    data.hidden = parsed.get("hidden").map(truthy).unwrap_or(false);
    if let Some(Value::Object(saved)) = parsed.get("settings") {
        apply_settings(&mut data.settings, saved);
    }
    if let Some(Value::Array(list)) = parsed.get("fences") {
        data.fences = list.iter().map(normalize_fence).collect();
    }
    data
}

fn apply_settings(settings: &mut Settings, saved: &Map<String, Value>) {
    for (key, value) in saved {
        match key.as_str() {
            "lang" => settings.lang = js_string(value),
            "openAtLogin" => settings.open_at_login = truthy(value),
            "theme" => settings.theme = js_string(value),
            "opacity" => settings.opacity = number_or(value, themes::default_opacity()),
            "corner" => settings.corner = themes::corner_radius(value),
            "shadow" => settings.shadow = truthy(value),
            "showHidden" => settings.show_hidden = truthy(value),
            "openWith" => settings.open_with = js_string(value),
            "root" => settings.root = value.as_str().unwrap_or("").to_string(),
            _ => {
                settings.extra.insert(key.clone(), value.clone());
            }
        }
    }
    settings.lang = i18n::lang_of(&settings.lang).into();
    settings.open_with = if settings.open_with == "single" { "single" } else { "double" }.into();
}

fn coord(value: Option<&Value>, fallback: f64) -> f64 {
    match value {
        None | Some(Value::Null) | Some(Value::Bool(_)) => fallback,
        Some(Value::String(s)) if s.is_empty() => fallback,
        Some(v) => {
            let n = js_number(v);
            if n.is_finite() {
                n
            } else {
                fallback
            }
        }
    }
}

fn text_or(value: Option<&Value>, fallback: &str) -> String {
    match value {
        Some(v) if truthy(v) => js_string(v),
        _ => fallback.to_string(),
    }
}

pub fn basename(path: &str) -> String {
    let trimmed = path.trim_end_matches(['/', '\\']);
    trimmed.rsplit(['/', '\\']).next().unwrap_or("").to_string()
}

pub fn normalize_fence(raw: &Value) -> Fence {
    let get = |k: &str| raw.get(k);
    let theme_raw = match get("theme") {
        Some(v) if truthy(v) => js_string(v),
        _ => themes::theme_for_color(&get("color").map(js_string).unwrap_or_default()),
    };
    let mut items = Vec::new();
    if let Some(Value::Array(list)) = get("items") {
        for item in list {
            let Some(path) = item.get("path").filter(|p| truthy(p)) else { continue };
            let path = js_string(path);
            let name = text_or(item.get("name"), &basename(&path));
            let home = match item.get("home") {
                Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
                _ => None,
            };
            items.push(Item { name, path, home });
        }
    }
    Fence {
        id: match get("id") {
            Some(v) if truthy(v) => js_string(v),
            _ => String::new(),
        },
        title: text_or(get("title"), "새 박스"),
        x: coord(get("x"), 80.0),
        y: coord(get("y"), 80.0),
        w: number_or(get("w").unwrap_or(&Value::Null), 280.0).max(180.0),
        h: number_or(get("h").unwrap_or(&Value::Null), 320.0).max(160.0),
        theme: themes::theme_of(&theme_raw).id.clone(),
        opacity: number_or(get("opacity").unwrap_or(&Value::Null), themes::default_opacity()).clamp(0.15, 0.9),
        corner: themes::corner_radius(get("corner").unwrap_or(&Value::Null)),
        custom: normalize_custom(get("custom")),
        collapsed: get("collapsed").map(truthy).unwrap_or(false),
        show_hidden: get("showHidden").map(truthy).unwrap_or(false),
        folder: get("folder").and_then(Value::as_str).unwrap_or("").to_string(),
        items,
    }
}

// 직접 고른 색. 잘못된 값은 버린다.
fn normalize_custom(raw: Option<&Value>) -> Option<Custom> {
    let raw = raw?.as_object()?;
    let bg = raw.get("bg").map(js_string).filter(|v| themes::parse_hex(v).is_some())?;
    let bar = raw
        .get("bar")
        .map(js_string)
        .filter(|v| themes::parse_hex(v).is_some())
        .unwrap_or_else(|| themes::darken(&bg, 0.55));
    Some(Custom { bg, bar })
}

// 임시 파일에 쓴 뒤 이름을 바꾼다. 쓰는 도중에 끝나도 앞 파일이 남는다.
pub fn save(user_dir: &Path, data: &State) -> std::io::Result<()> {
    let file = file_path(user_dir);
    fs::create_dir_all(user_dir)?;
    let tmp = user_dir.join("layout.json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(data).unwrap())?;
    fs::rename(&tmp, &file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn room() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn launch_at_login_is_on_when_settings_have_never_been_saved() {
        assert!(defaults("ko-KR").settings.open_at_login);
    }

    #[test]
    fn saved_positions_and_settings_are_read_back_unchanged() {
        let dir = room();
        let mut saved = defaults("ko-KR");
        saved.did_welcome = true;
        saved.hidden = true;
        saved.settings.lang = "en".into();
        saved.settings.open_at_login = false;
        saved.settings.opacity = 0.4;
        saved.settings.open_with = "single".into();
        saved.settings.shadow = true;
        saved.fences = vec![normalize_fence(&json!({
            "id": "a", "title": "일감", "x": 321, "y": 234, "w": 420, "h": 360, "corner": 20, "collapsed": true, "folder": "work"
        }))];
        save(dir.path(), &saved).unwrap();
        let back = load(dir.path(), "ko-KR");
        assert!(back.hidden);
        assert_eq!(back.settings, saved.settings);
        let b = &back.fences[0];
        assert_eq!((b.id.as_str(), b.title.as_str(), b.x, b.y, b.w, b.h, b.collapsed, b.folder.as_str()), ("a", "일감", 321.0, 234.0, 420.0, 360.0, true, "work"));
    }

    #[test]
    fn launch_at_login_stays_off_once_turned_off() {
        let dir = room();
        let mut saved = defaults("ko");
        saved.settings.open_at_login = false;
        save(dir.path(), &saved).unwrap();
        assert!(!load(dir.path(), "ko").settings.open_at_login);
    }

    #[test]
    fn defaults_without_a_file_and_old_saves() {
        let dir = room();
        let back = load(dir.path(), "ko");
        assert!(back.settings.open_at_login && back.fences.is_empty() && !back.did_welcome);
        fs::write(file_path(dir.path()), r#"{"version":1,"didWelcome":true,"settings":{"lang":"ko","theme":"ocean"},"fences":[]}"#).unwrap();
        let back = load(dir.path(), "ko");
        assert!(back.settings.open_at_login);
        assert_eq!(back.settings.theme, "ocean");
    }

    #[test]
    fn non_boolean_values_are_read_as_true_or_false() {
        let dir = room();
        for (written, wanted) in [(json!("yes"), true), (json!(0), false), (Value::Null, false), (json!(1), true)] {
            fs::write(file_path(dir.path()), json!({ "settings": { "openAtLogin": written } }).to_string()).unwrap();
            assert_eq!(load(dir.path(), "ko").settings.open_at_login, wanted, "{written}");
        }
    }

    #[test]
    fn a_corrupted_save_falls_back_to_defaults() {
        let dir = room();
        fs::write(file_path(dir.path()), "{ 여기서 끊겼다").unwrap();
        let back = load(dir.path(), "ko");
        assert!(back.settings.open_at_login);
        assert!(back.fences.is_empty());
    }

    #[test]
    fn saving_leaves_no_temp_files_and_keeps_unknown_settings() {
        let dir = room();
        fs::write(file_path(dir.path()), r#"{"settings":{"future":"x"}}"#).unwrap();
        let mut saved = load(dir.path(), "ko");
        saved.fences = vec![normalize_fence(&json!({ "id": "a", "title": "일감", "x": 10, "y": 20 }))];
        save(dir.path(), &saved).unwrap();
        let left: Vec<_> = fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
        assert_eq!(left, vec!["layout.json"]);
        assert_eq!(load(dir.path(), "ko").settings.extra.get("future"), Some(&json!("x")));
    }

    #[test]
    fn boxes_at_edges_and_on_other_monitors_keep_their_place() {
        let b = normalize_fence(&json!({ "id": "a", "x": 0, "y": 0 }));
        assert_eq!((b.x, b.y), (0.0, 0.0));
        let b = normalize_fence(&json!({ "id": "a", "x": -1920, "y": -300 }));
        assert_eq!((b.x, b.y), (-1920.0, -300.0));
        for (x, y) in [(Value::Null, Value::Null), (json!("abc"), json!({})), (json!(""), json!(""))] {
            let b = normalize_fence(&json!({ "id": "a", "x": x, "y": y }));
            assert_eq!((b.x, b.y), (80.0, 80.0));
        }
        let b = normalize_fence(&json!({ "id": "a" }));
        assert_eq!((b.x, b.y), (80.0, 80.0));
        let b = normalize_fence(&json!({ "id": "a", "x": "0", "y": "12" }));
        assert_eq!((b.x, b.y), (0.0, 12.0));
    }

    #[test]
    fn out_of_range_box_values_respect_limits() {
        let b = normalize_fence(&json!({ "id": "a", "w": 10, "h": 10, "opacity": 9, "corner": -5 }));
        assert!(b.w >= 180.0 && b.h >= 160.0);
        assert!(b.opacity <= 0.9 && b.opacity >= 0.15);
        assert!(b.corner >= 0);
        let legacy = normalize_fence(&json!({ "id": "a", "color": "#2563eb", "items": [{ "path": "C:/x/a.txt" }, { "name": "빈" }] }));
        assert_eq!(legacy.theme, "ocean");
        assert_eq!(legacy.items, vec![Item::new("a.txt", "C:/x/a.txt")]);
    }

    #[test]
    fn writes_the_same_shape_as_the_electron_version() {
        let mut fence = normalize_fence(&json!({ "id": "a", "items": [{ "name": "a", "path": "p", "home": "h" }, { "name": "b", "path": "q" }] }));
        fence.custom = Some(Custom { bg: "#000000".into(), bar: "#111111".into() });
        let text = serde_json::to_value(&fence).unwrap();
        assert_eq!(text["showHidden"], json!(false));
        assert_eq!(text["items"][0]["home"], json!("h"));
        assert!(text["items"][1].get("home").is_none());
        let state = serde_json::to_value(defaults("en")).unwrap();
        assert_eq!(state["didWelcome"], json!(false));
        assert_eq!(state["settings"]["openWith"], json!("double"));
    }
}
