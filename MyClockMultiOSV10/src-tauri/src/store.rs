//! 설정 저장소 — MyClockWinV10/Models/SettingsManager.cs 와 AppSettings.cs 의 이식.
//!
//! 저장 위치: <설정 폴더>/settings.json, <설정 폴더>/calendar_events.json
//! (설정 폴더는 Electron 판과 같은 %AppData%\MyClockMultiOS — lib.rs 의 config_dir)
//!
//! 값은 JSON 그대로 다룬다. 렌더러가 보내는 패치를 받아 합친 뒤, 아래 normalize_* 가
//! 형식·범위를 바로잡아 저장한다. 읽을 때도 같은 규칙을 한 번 더 거친다.

use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

pub const SETTINGS_FILE: &str = "settings.json";
pub const EVENTS_FILE: &str = "calendar_events.json";

/// 세계 시간 기본 도시 목록 — 사용자가 고친 적이 없으면 이 목록을 쓴다.
pub fn default_world_cities() -> Value {
  json!([
    { "city": "서울", "region": "대한민국", "zone": "Asia/Seoul" },
    { "city": "도쿄", "region": "일본", "zone": "Asia/Tokyo" },
    { "city": "베이징", "region": "중국", "zone": "Asia/Shanghai" },
    { "city": "싱가포르", "region": "싱가포르", "zone": "Asia/Singapore" },
    { "city": "두바이", "region": "UAE", "zone": "Asia/Dubai" },
    { "city": "모스크바", "region": "러시아", "zone": "Europe/Moscow" },
    { "city": "파리", "region": "프랑스", "zone": "Europe/Paris" },
    { "city": "런던", "region": "영국", "zone": "Europe/London" },
    { "city": "뉴욕", "region": "미국 동부", "zone": "America/New_York" },
    { "city": "시카고", "region": "미국 중부", "zone": "America/Chicago" },
    { "city": "로스앤젤레스", "region": "미국 서부", "zone": "America/Los_Angeles" },
    { "city": "시드니", "region": "호주", "zone": "Australia/Sydney" },
    { "city": "호놀룰루", "region": "미국 하와이", "zone": "Pacific/Honolulu" }
  ])
}

/// 시계마다 정하는 표시 우선순위.
///   low     — 일반 창처럼 다른 창에 가려진다 (트레이의 "항상 위에 표시"를 따르지 않는다)
///   normal  — 트레이의 "항상 위에 표시"를 따른다
///   high    — 언제나 다른 창 위
///   highest — 언제나 다른 창 위, 시계끼리 겹치면 이 시계가 위
pub const DISPLAY_PRIORITIES: [&str; 4] = ["low", "normal", "high", "highest"];

const DEFAULT_THEME: &str = "DarkTheme";
const DEFAULT_CUSTOM_COLOR: &str = "#89B4FA";
const DEFAULT_DIGIT_COLOR: &str = "#58A6FF";
const DEFAULT_AMPM_COLOR: &str = "#89B4FA";
const DEFAULT_DIGITAL_STYLE: &str = "SevenSegment";
const DEFAULT_ANALOG_STYLE: &str = "Classic";
const DEFAULT_BRIGHTNESS: f64 = 50.0;
const DEFAULT_WINDOW_WIDTH: f64 = 300.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 300.0;
const DEFAULT_ALARM_SOUND: &str = "Marimba";
const DEFAULT_ALARM_VOLUME: f64 = 50.0;
const DEFAULT_EVENT_COLOR: &str = "#4A90D9";

// ── 값 다듬기 helpers ───────────────────────────────────────────────────

/// JavaScript 의 Number(value) 와 같은 규칙으로 숫자를 읽는다. 없는 값(None)·null 은 숫자가 아니다.
fn js_number(value: Option<&Value>) -> Option<f64> {
  let n = match value? {
    Value::Null => return None,
    Value::Bool(b) => {
      if *b {
        1.0
      } else {
        0.0
      }
    }
    Value::Number(n) => n.as_f64()?,
    Value::String(s) => {
      let t = s.trim();
      if t.is_empty() {
        0.0
      } else {
        t.parse::<f64>().ok()?
      }
    }
    _ => return None,
  };
  n.is_finite().then_some(n)
}

fn num(value: Option<&Value>, fallback: f64) -> f64 {
  js_number(value).unwrap_or(fallback)
}

/// 정수면 정수로 적는다 (3 이 3.0 으로 저장되지 않도록).
pub fn jnum(n: f64) -> Value {
  if n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0 {
    Value::from(n as i64)
  } else {
    Value::from(n)
  }
}

fn nullable_num(value: Option<&Value>) -> Value {
  js_number(value).map(jnum).unwrap_or(Value::Null)
}

/// 크기 값 전용 — 0 이하는 저장되지 않은 것으로 본다.
fn nullable_positive(value: Option<&Value>) -> Value {
  match js_number(value) {
    Some(n) if n > 0.0 => jnum(n),
    _ => Value::Null,
  }
}

fn nullable_unit(value: Option<&Value>) -> Value {
  js_number(value).map(|n| jnum(clamp(n, 0.0, 1.0))).unwrap_or(Value::Null)
}

fn clamp(value: f64, lo: f64, hi: f64) -> f64 {
  value.max(lo).min(hi)
}

fn hex(value: Option<&Value>, fallback: &str) -> Value {
  if let Some(Value::String(s)) = value {
    if s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit()) {
      return Value::String(s.to_uppercase());
    }
  }
  Value::String(fallback.to_string())
}

fn string_or(value: Option<&Value>, fallback: &str) -> Value {
  match value {
    Some(Value::String(s)) => Value::String(s.clone()),
    _ => Value::String(fallback.to_string()),
  }
}

/// 비어 있지 않은 문자열이면 그대로, 아니면 기본값.
fn nonempty_or(value: Option<&Value>, fallback: &str) -> Value {
  match value {
    Some(Value::String(s)) if !s.is_empty() => Value::String(s.clone()),
    _ => Value::String(fallback.to_string()),
  }
}

fn nonempty(value: Option<&Value>) -> Option<String> {
  match value {
    Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
    _ => None,
  }
}

fn is_true(value: Option<&Value>) -> bool {
  matches!(value, Some(Value::Bool(true)))
}

fn is_not_false(value: Option<&Value>) -> bool {
  !matches!(value, Some(Value::Bool(false)))
}

fn display_priority(value: Option<&Value>) -> Value {
  match value {
    Some(Value::String(s)) if DISPLAY_PRIORITIES.contains(&s.as_str()) => Value::String(s.clone()),
    _ => Value::String("normal".into()),
  }
}

/// 이름표에 붙일 짧은 무작위 글자 (Math.random().toString(36).slice(2, 10) 과 같은 꼴).
pub fn random_suffix() -> String {
  static SEED: OnceLock<u64> = OnceLock::new();
  static COUNTER: AtomicU64 = AtomicU64::new(0);
  let seed = *SEED.get_or_init(|| {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0);
    nanos ^ ((std::process::id() as u64) << 32)
  });
  let mut x = seed.wrapping_add(COUNTER.fetch_add(1, Ordering::Relaxed).wrapping_mul(0x9E37_79B9_7F4A_7C15));
  // splitmix64
  x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
  x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
  x ^= x >> 31;
  const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
  (0..8)
    .map(|_| {
      let d = DIGITS[(x % 36) as usize] as char;
      x /= 36;
      d
    })
    .collect()
}

fn obj(value: &Value) -> Option<&Map<String, Value>> {
  value.as_object()
}

fn empty() -> &'static Map<String, Value> {
  static EMPTY: OnceLock<Map<String, Value>> = OnceLock::new();
  EMPTY.get_or_init(Map::new)
}

// ── 항목별 다듬기 ───────────────────────────────────────────────────────

fn valid_hhmm(s: &str) -> Option<(f64, f64)> {
  let (h, m) = s.split_once(':')?;
  let ok = (1..=2).contains(&h.len()) && m.len() == 2 && h.chars().all(|c| c.is_ascii_digit()) && m.chars().all(|c| c.is_ascii_digit());
  ok.then(|| (h.parse().unwrap_or(0.0), m.parse().unwrap_or(0.0)))
}

pub fn normalize_alarm(raw: &Value) -> Value {
  let src = obj(raw).unwrap_or(empty());
  let (h, m) = src.get("time").and_then(Value::as_str).and_then(valid_hhmm).unwrap_or((7.0, 0.0));
  let id = nonempty(src.get("id")).unwrap_or_else(|| format!("alarm-{}", random_suffix()));
  json!({
    "id": id,
    "time": format!("{:02}:{:02}", clamp(h, 0.0, 23.0) as i64, clamp(m, 0.0, 59.0) as i64),
    "label": string_or(src.get("label"), ""),
    "isEnabled": is_not_false(src.get("isEnabled")),
    "isRepeat": is_true(src.get("isRepeat")),
    // 비트 0 = 일요일 … 비트 6 = 토요일 (JS Date.getDay 순서)
    "repeatDays": jnum(clamp(num(src.get("repeatDays"), 127.0), 0.0, 127.0))
  })
}

pub fn normalize_timer(raw: &Value) -> Value {
  let src = obj(raw).unwrap_or(empty());
  json!({
    "label": string_or(src.get("label"), ""),
    "hours": jnum(clamp(num(src.get("hours"), 0.0), 0.0, 99.0)),
    "minutes": jnum(clamp(num(src.get("minutes"), 5.0), 0.0, 59.0)),
    "seconds": jnum(clamp(num(src.get("seconds"), 0.0), 0.0, 59.0))
  })
}

pub fn normalize_city(raw: &Value) -> Option<Value> {
  let src = obj(raw)?;
  let zone = nonempty(src.get("zone"))?;
  Some(json!({
    "city": string_or(src.get("city"), ""),
    "region": string_or(src.get("region"), ""),
    "zone": zone
  }))
}

/// 추가 시계 하나.
///
/// 시계마다 따로 갖는 것: 시간대(도시), 테마, 디지털/아날로그, 스타일, 시간 형식,
/// 밝기, 색, 창 위치·크기. 알람·타이머·스톱워치·일정은 앱이 하나로 들고 있으므로
/// 여기에는 없다.
pub fn normalize_extra_clock(raw: &Value) -> Option<Value> {
  let src = obj(raw)?;
  let zone = nonempty(src.get("zone"))?;
  let id = nonempty(src.get("id")).unwrap_or_else(|| format!("clock-{}", random_suffix()));
  Some(json!({
    "id": id,
    "city": string_or(src.get("city"), ""),
    "region": string_or(src.get("region"), ""),
    "zone": zone,
    "showCity": is_not_false(src.get("showCity")),
    "displayPriority": display_priority(src.get("displayPriority")),
    "theme": nonempty_or(src.get("theme"), DEFAULT_THEME),
    "customThemeColor": hex(src.get("customThemeColor"), DEFAULT_CUSTOM_COLOR),
    "customThemeLight": is_true(src.get("customThemeLight")),
    "isDigital": is_not_false(src.get("isDigital")),
    "digitalStyle": string_or(src.get("digitalStyle"), DEFAULT_DIGITAL_STYLE),
    "analogStyle": string_or(src.get("analogStyle"), DEFAULT_ANALOG_STYLE),
    "use24h": is_true(src.get("use24h")),
    "brightness": jnum(clamp(num(src.get("brightness"), DEFAULT_BRIGHTNESS), 10.0, 100.0)),
    "digitColor": hex(src.get("digitColor"), DEFAULT_DIGIT_COLOR),
    "amPmColor": hex(src.get("amPmColor"), DEFAULT_AMPM_COLOR),
    "windowWidth": jnum(clamp(num(src.get("windowWidth"), 260.0), 140.0, 4000.0)),
    "windowHeight": jnum(clamp(num(src.get("windowHeight"), 180.0), 50.0, 4000.0)),
    "windowLeft": nullable_num(src.get("windowLeft")),
    "windowTop": nullable_num(src.get("windowTop"))
  }))
}

/// 분리한 탭 창의 위치·크기. 탭 이름 → {x, y, width, height}
fn normalize_tool_windows(raw: Option<&Value>) -> Value {
  let mut out = Map::new();
  if let Some(Value::Object(src)) = raw {
    for (tab, value) in src {
      let Some(v) = value.as_object() else { continue };
      out.insert(
        tab.clone(),
        json!({
          "x": nullable_num(v.get("x")),
          "y": nullable_num(v.get("y")),
          "width": jnum(clamp(num(v.get("width"), 420.0), 280.0, 4000.0)),
          "height": jnum(clamp(num(v.get("height"), 560.0), 200.0, 4000.0))
        }),
      );
    }
  }
  Value::Object(out)
}

fn default_timers() -> Value {
  json!([normalize_timer(&json!({ "label": "", "hours": 0, "minutes": 5, "seconds": 0 }))])
}

pub fn normalize_settings(raw: &Value) -> Value {
  let src = obj(raw).unwrap_or(empty());
  let cities: Vec<Value> = match src.get("worldCities") {
    Some(Value::Array(list)) => list.iter().filter_map(normalize_city).collect(),
    _ => Vec::new(),
  };
  let alarms: Vec<Value> = match src.get("alarms") {
    Some(Value::Array(list)) => list.iter().map(normalize_alarm).collect(),
    _ => Vec::new(),
  };
  let extra: Vec<Value> = match src.get("extraClocks") {
    Some(Value::Array(list)) => list.iter().filter_map(normalize_extra_clock).collect(),
    _ => Vec::new(),
  };
  let timers = match src.get("timers") {
    Some(Value::Array(list)) if !list.is_empty() => Value::Array(list.iter().map(normalize_timer).collect()),
    _ => default_timers(),
  };
  json!({
    "alwaysOnTop": is_true(src.get("alwaysOnTop")),
    // 메인 시계의 표시 우선순위 (추가 시계는 extraClocks[] 에 저마다 둔다)
    "displayPriority": display_priority(src.get("displayPriority")),
    "use24h": is_true(src.get("use24h")),
    "worldUse24h": is_true(src.get("worldUse24h")),
    "theme": nonempty_or(src.get("theme"), DEFAULT_THEME),
    // 메인 시계도 도시를 고를 수 있다 — 비워 두면 이 컴퓨터의 시각.
    "zone": nonempty(src.get("zone")).map(Value::String).unwrap_or(Value::Null),
    "city": string_or(src.get("city"), ""),
    "showCity": is_not_false(src.get("showCity")),
    // 사용자 정의 테마(CustomTheme)를 만들 색과 바탕 밝기.
    "customThemeColor": hex(src.get("customThemeColor"), DEFAULT_CUSTOM_COLOR),
    "customThemeLight": is_true(src.get("customThemeLight")),
    "brightness": jnum(clamp(num(src.get("brightness"), DEFAULT_BRIGHTNESS), 0.0, 100.0)),
    "digitColor": hex(src.get("digitColor"), DEFAULT_DIGIT_COLOR),
    "amPmColor": hex(src.get("amPmColor"), DEFAULT_AMPM_COLOR),
    "isDigital": is_not_false(src.get("isDigital")),
    "digitalStyle": string_or(src.get("digitalStyle"), DEFAULT_DIGITAL_STYLE),
    "analogStyle": string_or(src.get("analogStyle"), DEFAULT_ANALOG_STYLE),
    "windowLeft": nullable_num(src.get("windowLeft")),
    "windowTop": nullable_num(src.get("windowTop")),
    "windowWidth": jnum(clamp(num(src.get("windowWidth"), DEFAULT_WINDOW_WIDTH), 140.0, 4000.0)),
    "windowHeight": jnum(clamp(num(src.get("windowHeight"), DEFAULT_WINDOW_HEIGHT), 50.0, 4000.0)),
    // 작업 영역에서 창이 움직일 수 있는 여유 공간 대비 비율 (0=왼쪽/위, 1=오른쪽/아래).
    "windowRelX": nullable_unit(src.get("windowRelX")),
    "windowRelY": nullable_unit(src.get("windowRelY")),
    "windowRelDisplayId": nullable_num(src.get("windowRelDisplayId")),
    "digitalWindowWidth": nullable_positive(src.get("digitalWindowWidth")),
    "digitalWindowHeight": nullable_positive(src.get("digitalWindowHeight")),
    "digitalWindowLeft": nullable_num(src.get("digitalWindowLeft")),
    "digitalWindowTop": nullable_num(src.get("digitalWindowTop")),
    "analogWindowWidth": nullable_positive(src.get("analogWindowWidth")),
    "analogWindowHeight": nullable_positive(src.get("analogWindowHeight")),
    "analogWindowLeft": nullable_num(src.get("analogWindowLeft")),
    "analogWindowTop": nullable_num(src.get("analogWindowTop")),
    "alarms": alarms,
    "worldCities": if cities.is_empty() { Value::Null } else { Value::Array(cities) },
    // 추가 시계 — 시간대·테마·모양을 저마다 따로 갖는 시계 창들.
    // 알람·타이머·스톱워치·캘린더는 앱 전체가 함께 쓰므로 여기에 들어가지 않는다.
    "extraClocks": extra,
    // 별도 창으로 분리한 탭들의 위치·크기 (tab 이름 → bounds)
    "toolWindows": normalize_tool_windows(src.get("toolWindows")),
    "timers": timers,
    "alarmSoundId": string_or(src.get("alarmSoundId"), DEFAULT_ALARM_SOUND),
    "alarmVolume": jnum(clamp(num(src.get("alarmVolume"), DEFAULT_ALARM_VOLUME), 0.0, 100.0)),
    "startWithSystem": is_true(src.get("startWithSystem"))
  })
}

pub fn defaults() -> Value {
  normalize_settings(&Value::Null)
}

fn valid_date(s: &str) -> bool {
  let b = s.as_bytes();
  b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

pub fn normalize_event(raw: &Value) -> Option<Value> {
  let src = obj(raw)?;
  let date = src.get("date").and_then(Value::as_str).filter(|d| valid_date(d))?.to_string();
  let id = nonempty(src.get("id")).unwrap_or_else(|| format!("evt-{}", random_suffix()));
  let end_date = src.get("endDate").and_then(Value::as_str).filter(|d| valid_date(d)).map(|d| Value::String(d.into())).unwrap_or(Value::Null);
  let recurrence = match src.get("recurrence").and_then(Value::as_str) {
    Some(r @ ("None" | "Daily" | "Weekly" | "Monthly" | "Yearly")) => r,
    _ => "None",
  };
  Some(json!({
    "id": id,
    "title": string_or(src.get("title"), ""),
    "date": date,
    "endDate": end_date,
    "startTime": string_or(src.get("startTime"), "09:00"),
    "endTime": string_or(src.get("endTime"), "10:00"),
    "isAllDay": is_true(src.get("isAllDay")),
    "description": string_or(src.get("description"), ""),
    "reminderMinutes": js_number(src.get("reminderMinutes")).map(jnum).unwrap_or(Value::Null),
    "recurrence": recurrence,
    "color": hex(src.get("color"), DEFAULT_EVENT_COLOR)
  }))
}

// ── 파일 ────────────────────────────────────────────────────────────────

fn read_json(file: &Path) -> Value {
  std::fs::read_to_string(file).ok().and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()).unwrap_or(Value::Null)
}

fn write_json(file: &Path, value: &Value) -> Result<(), String> {
  if let Some(dir) = file.parent() {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
  let tmp = file.with_extension("json.tmp");
  std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
  std::fs::rename(&tmp, file).map_err(|e| e.to_string())
}

/// 한 설정 폴더의 settings.json 과 calendar_events.json.
///
/// `legacy_dir` 은 WPF 판(MyClockWinV10)이 쓰던 %AppData%\MyClock — 처음 실행할 때 한 번만 읽는다.
#[derive(Clone, Debug)]
pub struct Store {
  pub dir: PathBuf,
  pub legacy_dir: PathBuf,
}

impl Store {
  pub fn new(dir: PathBuf, legacy_dir: PathBuf) -> Self {
    Self { dir, legacy_dir }
  }

  pub fn settings_file(&self) -> PathBuf {
    self.dir.join(SETTINGS_FILE)
  }

  pub fn events_file(&self) -> PathBuf {
    self.dir.join(EVENTS_FILE)
  }

  pub fn load_settings(&self) -> Value {
    normalize_settings(&read_json(&self.settings_file()))
  }

  /// 지금 설정 위에 patch 의 항목만 덮어 쓰고 다듬어 저장한다.
  pub fn save_settings(&self, patch: &Value) -> Value {
    let mut merged = match self.load_settings() {
      Value::Object(map) => map,
      _ => Map::new(),
    };
    if let Some(patch) = patch.as_object() {
      for (key, value) in patch {
        merged.insert(key.clone(), value.clone());
      }
    }
    let next = normalize_settings(&Value::Object(merged));
    if let Err(error) = write_json(&self.settings_file(), &next) {
      eprintln!("[MyClock] 설정을 저장하지 못했습니다: {error}");
    }
    next
  }

  /// 기본값으로 되돌린다. 추가한 시계와 창 자리는 "설정 기본값"이 아니다 — 지우지 않는다.
  pub fn reset_settings(&self) -> Value {
    let current = self.load_settings();
    let mut fresh = defaults();
    fresh["extraClocks"] = current["extraClocks"].clone();
    fresh["toolWindows"] = current["toolWindows"].clone();
    self.save_settings(&fresh)
  }

  pub fn load_events(&self) -> Value {
    match read_json(&self.events_file()) {
      Value::Array(list) => Value::Array(list.iter().filter_map(normalize_event).collect()),
      _ => json!([]),
    }
  }

  pub fn save_events(&self, events: &Value) -> Value {
    let list = match events {
      Value::Array(list) => Value::Array(list.iter().filter_map(normalize_event).collect()),
      _ => json!([]),
    };
    if let Err(error) = write_json(&self.events_file(), &list) {
      eprintln!("[MyClock] 일정을 저장하지 못했습니다: {error}");
    }
    list
  }

  /// 설정 파일이 아직 없을 때 한 번만 실행 — (설정을 가져왔는지, 가져온 일정 수).
  ///
  /// 두 앱은 저장 폴더가 다르다. 처음 실행할 때 옛 폴더가 있으면 한 번만 읽어오고,
  /// 원본은 건드리지 않는다 (WPF 판을 계속 쓰더라도 설정이 그대로 남도록).
  pub fn migrate_from_wpf_if_needed(&self) -> Option<(bool, usize)> {
    if self.settings_file().exists() {
      return None;
    }
    let legacy_settings = read_legacy(&self.legacy_dir.join("settings.json"));
    let legacy_events = read_legacy(&self.legacy_dir.join("calendar.json"));
    if legacy_settings.is_none() && legacy_events.is_none() {
      return None;
    }
    let mut result = (false, 0);
    if let Some(raw) = legacy_settings {
      self.save_settings(&convert_legacy_settings(&raw));
      result.0 = true;
    }
    if let Some(raw) = legacy_events {
      if !self.events_file().exists() {
        result.1 = self.save_events(&convert_legacy_events(&raw)).as_array().map(Vec::len).unwrap_or(0);
      }
    }
    Some(result)
  }
}

// ── WPF 판(MyClockWinV10) 설정 가져오기 ────────────────────────────────

fn read_legacy(file: &Path) -> Option<Value> {
  match read_json(file) {
    Value::Null => None,
    value => Some(value),
  }
}

/// Windows 시간대 ID → IANA 시간대 (WPF 판은 Windows 이름으로 저장했다).
pub fn win_to_iana() -> &'static Map<String, Value> {
  static MAP: OnceLock<Map<String, Value>> = OnceLock::new();
  MAP.get_or_init(|| serde_json::from_str(include_str!("../data/win-timezones.json")).unwrap_or_default())
}

/// "HH:MM:SS" 또는 .NET TimeSpan 문자열 → "HH:MM"
fn legacy_time(value: Option<&Value>) -> String {
  let text = match value {
    Some(Value::String(s)) => s.clone(),
    Some(Value::Null) | None => String::new(),
    Some(other) => other.to_string(),
  };
  let digits_h: String = text.chars().take_while(|c| c.is_ascii_digit()).collect();
  let rest = &text[digits_h.len()..];
  let ok = (1..=2).contains(&digits_h.len()) && rest.len() >= 3 && rest.starts_with(':') && rest[1..3].chars().all(|c| c.is_ascii_digit());
  if !ok {
    return "07:00".into();
  }
  let h: u32 = digits_h.parse().unwrap_or(0);
  format!("{:02}:{}", h % 24, &rest[1..3])
}

/// 첫 번째로 정의된(키가 있는) 값 — JS 의 `a ?? b` 처럼 null 도 건너뛴다.
fn first<'a>(src: &'a Map<String, Value>, names: &[&str]) -> Option<&'a Value> {
  names.iter().find_map(|name| src.get(*name).filter(|v| !v.is_null()))
}

/// WPF 판의 PascalCase 설정을 이 앱의 형식으로 옮긴다.
pub fn convert_legacy_settings(raw: &Value) -> Value {
  let src = obj(raw).unwrap_or(empty());
  // 키가 있으면 null 이라도 그 값 (JS 의 pick 은 undefined 만 건너뛴다).
  let pick = |names: &[&str]| -> Value { names.iter().find_map(|n| src.get(*n)).cloned().unwrap_or(Value::Null) };
  let mut out = Map::new();
  out.insert("alwaysOnTop".into(), Value::Bool(pick(&["AlwaysOnTop"]) == Value::Bool(true)));
  out.insert("use24h".into(), Value::Bool(pick(&["Use24h"]) == Value::Bool(true)));
  out.insert("worldUse24h".into(), Value::Bool(pick(&["WorldUse24h"]) == Value::Bool(true)));
  out.insert("isDigital".into(), Value::Bool(pick(&["IsDigital"]) != Value::Bool(false)));
  for (key, name) in [
    ("theme", "Theme"),
    ("brightness", "Brightness"),
    ("digitColor", "DigitColor"),
    ("amPmColor", "AmPmColor"),
    ("digitalStyle", "DigitalStyleName"),
    ("analogStyle", "AnalogStyleName"),
    ("windowWidth", "WindowWidth"),
    ("windowHeight", "WindowHeight"),
    ("windowLeft", "WindowLeft"),
    ("windowTop", "WindowTop"),
    ("alarmSoundId", "AlarmSoundId"),
    ("alarmVolume", "AlarmVolume"),
  ] {
    let value = pick(&[name]);
    if !value.is_null() {
      out.insert(key.into(), value);
    }
  }

  let alarms: Vec<Value> = match pick(&["Alarms", "alarms"]) {
    Value::Array(list) => list
      .iter()
      .map(|a| {
        let a = obj(a).unwrap_or(empty());
        json!({
          "time": legacy_time(first(a, &["Time", "time"])),
          "label": first(a, &["Label", "label"]).cloned().unwrap_or(json!("")),
          "isEnabled": first(a, &["IsEnabled", "isEnabled"]) != Some(&Value::Bool(false)),
          "isRepeat": first(a, &["IsRepeat", "isRepeat"]) == Some(&Value::Bool(true)),
          "repeatDays": first(a, &["RepeatDays", "repeatDays"]).cloned().unwrap_or(Value::Null)
        })
      })
      .collect(),
    _ => Vec::new(),
  };
  out.insert("alarms".into(), Value::Array(alarms));

  if let Value::Array(list) = pick(&["Timers", "timers"]) {
    let timers: Vec<Value> = list
      .iter()
      .map(|t| {
        let t = obj(t).unwrap_or(empty());
        json!({
          "label": first(t, &["Label", "label"]).cloned().unwrap_or(json!("")),
          "hours": first(t, &["Hours", "hours"]).cloned().unwrap_or(json!(0)),
          "minutes": first(t, &["Minutes", "minutes"]).cloned().unwrap_or(json!(5)),
          "seconds": first(t, &["Seconds", "seconds"]).cloned().unwrap_or(json!(0))
        })
      })
      .collect();
    out.insert("timers".into(), Value::Array(timers));
  }

  if let Value::Array(list) = pick(&["WorldCities", "worldCities"]) {
    let map = win_to_iana();
    let cities: Vec<Value> = list
      .iter()
      .filter_map(|c| {
        let c = obj(c)?;
        let win_zone = first(c, &["TimeZoneId", "timeZoneId", "zone"])?.as_str()?;
        let zone = map.get(win_zone).and_then(Value::as_str).unwrap_or(win_zone);
        if zone.is_empty() || !zone.contains('/') {
          return None;
        }
        Some(json!({
          "city": first(c, &["City", "city"]).cloned().unwrap_or(json!("")),
          "region": first(c, &["Region", "region"]).cloned().unwrap_or(json!("")),
          "zone": zone
        }))
      })
      .collect();
    out.insert("worldCities".into(), Value::Array(cities));
  }
  Value::Object(out)
}

/// WPF 판의 캘린더 일정을 이 앱의 형식으로 옮긴다.
pub fn convert_legacy_events(raw: &Value) -> Value {
  let Value::Array(list) = raw else { return json!([]) };
  let date_of = |v: Option<&Value>| -> String {
    let s = match v {
      Some(Value::String(s)) => s.clone(),
      _ => String::new(),
    };
    s.chars().take(10).collect()
  };
  Value::Array(
    list
      .iter()
      .filter_map(|e| {
        let e = obj(e)?;
        let date = date_of(first(e, &["Date", "date"]));
        if !valid_date(&date) {
          return None;
        }
        let end = date_of(first(e, &["EndDate", "endDate"]));
        let reminder = first(e, &["ReminderMinutes", "reminderMinutes"]);
        Some(json!({
          "title": first(e, &["Title", "title"]).cloned().unwrap_or(json!("")),
          "date": date,
          "endDate": if valid_date(&end) { Value::String(end) } else { Value::Null },
          "startTime": legacy_time(Some(first(e, &["StartTime", "startTime"]).unwrap_or(&json!("09:00")))),
          "endTime": legacy_time(Some(first(e, &["EndTime", "endTime"]).unwrap_or(&json!("10:00")))),
          "isAllDay": first(e, &["IsAllDay", "isAllDay"]) == Some(&Value::Bool(true)),
          "description": first(e, &["Description", "description"]).cloned().unwrap_or(json!("")),
          "reminderMinutes": reminder.and_then(|r| js_number(Some(r))).map(jnum).unwrap_or(Value::Null),
          "recurrence": first(e, &["Recurrence", "recurrence"]).cloned().unwrap_or(json!("None")),
          "color": first(e, &["Color", "color"]).cloned().unwrap_or(json!(DEFAULT_EVENT_COLOR))
        }))
      })
      .collect(),
  )
}

// ── 검사 (test/store.test.js 에서 옮겨 왔다) ────────────────────────────

#[cfg(test)]
mod tests {
  use super::*;

  struct Room {
    _tmp: tempfile::TempDir,
    store: Store,
  }

  /// 검사마다 새 임시 폴더 — 쓰는 사람의 설정은 건드리지 않는다.
  fn room() -> Room {
    let tmp = tempfile::tempdir().unwrap();
    let store = Store::new(tmp.path().join("userData"), tmp.path().join("appData").join("MyClock"));
    Room { _tmp: tmp, store }
  }

  #[test]
  fn defaults_start_as_dark_digital_clock() {
    let s = defaults();
    assert_eq!(s["theme"], "DarkTheme");
    assert_eq!(s["isDigital"], true);
    assert_eq!(s["use24h"], false);
    assert_eq!(s["brightness"], 50);
    assert_eq!(s["digitalStyle"], "SevenSegment");
    assert_eq!(s["analogStyle"], "Classic");
    assert_eq!(s["alarmSoundId"], "Marimba");
    assert_eq!(s["alarmVolume"], 50);
    assert_eq!(s["alarms"], json!([]));
    assert_eq!(s["timers"], json!([{ "label": "", "hours": 0, "minutes": 5, "seconds": 0 }]), "타이머 한 칸은 늘 있다");
  }

  #[test]
  fn defaults_have_custom_theme_color() {
    let s = defaults();
    let color = s["customThemeColor"].as_str().unwrap();
    assert!(color.len() == 7 && color.starts_with('#') && color[1..].chars().all(|c| c.is_ascii_digit() || c.is_ascii_uppercase()));
    assert_eq!(s["customThemeLight"], false);
  }

  #[test]
  fn custom_theme_color_is_uppercase_rrggbb() {
    let r = room();
    assert_eq!(r.store.save_settings(&json!({ "customThemeColor": "#a1b2c3" }))["customThemeColor"], "#A1B2C3");
    // 색 글자가 깨져 있으면 기본 색으로 되돌린다 (다른 색 설정과 같은 규칙).
    assert_eq!(r.store.save_settings(&json!({ "customThemeColor": "green" }))["customThemeColor"], defaults()["customThemeColor"]);
    assert_eq!(r.store.save_settings(&json!({ "customThemeLight": "yes" }))["customThemeLight"], false, "true 가 아니면 거짓");
    assert_eq!(r.store.save_settings(&json!({ "customThemeLight": true }))["customThemeLight"], true);
  }

  #[test]
  fn display_priority_per_clock_unknown_is_normal() {
    let r = room();
    assert_eq!(defaults()["displayPriority"], "normal");
    assert_eq!(r.store.save_settings(&json!({ "displayPriority": "highest" }))["displayPriority"], "highest");
    assert_eq!(r.store.save_settings(&json!({ "displayPriority": "top" }))["displayPriority"], "normal");
    let saved = r.store.save_settings(&json!({
      "extraClocks": [{ "id": "a", "zone": "Asia/Tokyo", "displayPriority": "low" }, { "id": "b", "zone": "Europe/Paris" }]
    }));
    let list: Vec<&Value> = saved["extraClocks"].as_array().unwrap().iter().map(|c| &c["displayPriority"]).collect();
    assert_eq!(list, vec!["low", "normal"]);
  }

  #[test]
  fn out_of_range_values_are_clamped() {
    let r = room();
    let s = r.store.save_settings(&json!({ "brightness": 900, "alarmVolume": -50, "windowWidth": 10, "windowHeight": 99999 }));
    assert_eq!(s["brightness"], 100);
    assert_eq!(s["alarmVolume"], 0);
    assert_eq!(s["windowWidth"], 140, "디지털 최소 너비보다 작게는 저장되지 않는다");
    assert_eq!(s["windowHeight"], 4000);
  }

  #[test]
  fn saved_settings_load_back_the_same() {
    let r = room();
    r.store.save_settings(&json!({ "theme": "CustomTheme", "customThemeColor": "#FF8800", "use24h": true, "brightness": 80 }));
    assert!(r.store.settings_file().exists(), "설정 파일이 만들어진다");
    let loaded = r.store.load_settings();
    assert_eq!(loaded["theme"], "CustomTheme");
    assert_eq!(loaded["customThemeColor"], "#FF8800");
    assert_eq!(loaded["use24h"], true);
    assert_eq!(loaded["brightness"], 80);
  }

  #[test]
  fn broken_settings_file_starts_from_defaults() {
    let r = room();
    std::fs::create_dir_all(&r.store.dir).unwrap();
    std::fs::write(r.store.settings_file(), "{ 이건 JSON 이 아니다").unwrap();
    let loaded = r.store.load_settings();
    assert_eq!(loaded["theme"], "DarkTheme");
    assert_eq!(loaded["brightness"], 50);
  }

  #[test]
  fn alarms_fix_time_and_keep_repeat_bits() {
    let r = room();
    let s = r.store.save_settings(&json!({
      "alarms": [
        { "time": "7:05", "label": "기상" },
        { "time": "엉뚱", "isEnabled": false },
        { "time": "09:30", "isRepeat": true, "repeatDays": 999 }
      ]
    }));
    let alarms = s["alarms"].as_array().unwrap();
    assert_eq!(alarms.len(), 3);
    assert_eq!(alarms[0]["time"], "07:05");
    assert_eq!(alarms[0]["label"], "기상");
    assert_eq!(alarms[0]["isEnabled"], true, "따로 적지 않으면 켜진 알람");
    assert_eq!(alarms[1]["time"], "07:00", "읽을 수 없는 시간은 07:00");
    assert_eq!(alarms[1]["isEnabled"], false);
    assert_eq!(alarms[2]["repeatDays"], 0b1111111, "일~토 일곱 비트를 넘지 않는다");
    let ids: std::collections::HashSet<&str> = alarms.iter().map(|a| a["id"].as_str().unwrap()).collect();
    assert!(ids.iter().all(|id| !id.is_empty()));
    assert_eq!(ids.len(), 3, "알람마다 다른 이름표");
  }

  #[test]
  fn timers_keep_limits() {
    let r = room();
    let s = r.store.save_settings(&json!({ "timers": [{ "hours": 200, "minutes": 90, "seconds": -3, "label": "면" }] }));
    assert_eq!(s["timers"], json!([{ "label": "면", "hours": 99, "minutes": 59, "seconds": 0 }]));
  }

  #[test]
  fn world_cities_without_zone_are_dropped() {
    let r = room();
    let s = r.store.save_settings(&json!({
      "worldCities": [{ "city": "서울", "region": "대한민국", "zone": "Asia/Seoul" }, { "city": "엉뚱" }, null]
    }));
    assert_eq!(s["worldCities"].as_array().unwrap().len(), 1);
    assert_eq!(s["worldCities"][0]["zone"], "Asia/Seoul");
    // 모두 버려져 빈 목록이 되면 null — 그때 기본 도시 목록을 쓴다.
    assert_eq!(r.store.save_settings(&json!({ "worldCities": [] }))["worldCities"], Value::Null);
    assert!(default_world_cities().as_array().unwrap().len() >= 10);
  }

  #[test]
  fn events_drop_dateless_and_fix_recurrence_and_color() {
    let r = room();
    let saved = r.store.save_events(&json!([
      { "title": "회의", "date": "2026-10-02", "startTime": "10:00", "endTime": "11:00" },
      { "title": "날짜 없음" },
      { "title": "생일", "date": "2026-12-25", "recurrence": "매년", "color": "blue", "isAllDay": true }
    ]));
    let saved = saved.as_array().unwrap();
    assert_eq!(saved.len(), 2);
    assert_eq!(saved[0]["title"], "회의");
    assert_eq!(saved[0]["isAllDay"], false);
    assert_eq!(saved[1]["recurrence"], "None", "모르는 되풀이는 없음으로");
    assert_eq!(saved[1]["color"], "#4A90D9", "모르는 색은 기본 색으로");
    assert_eq!(saved[1]["isAllDay"], true);
    let titles: Vec<Value> = r.store.load_events().as_array().unwrap().iter().map(|e| e["title"].clone()).collect();
    assert_eq!(titles, vec![json!("회의"), json!("생일")]);
  }

  #[test]
  fn wpf_settings_import_once_and_leave_original() {
    let r = room();
    std::fs::create_dir_all(&r.store.legacy_dir).unwrap();
    let legacy_file = r.store.legacy_dir.join("settings.json");
    std::fs::write(
      &legacy_file,
      json!({
        "Theme": "OceanTheme", "Use24h": true, "Brightness": 70, "DigitColor": "#64FFDA",
        "Alarms": [{ "Time": "06:30:00", "Label": "출근", "IsEnabled": true }],
        "WorldCities": [{ "City": "서울", "Region": "대한민국", "TimeZoneId": "Korea Standard Time" }]
      })
      .to_string(),
    )
    .unwrap();

    let result = r.store.migrate_from_wpf_if_needed();
    assert_eq!(result.map(|r| r.0), Some(true), "가져왔다고 알려 준다");

    let loaded = r.store.load_settings();
    assert_eq!(loaded["theme"], "OceanTheme");
    assert_eq!(loaded["use24h"], true);
    assert_eq!(loaded["brightness"], 70);
    assert_eq!(loaded["alarms"][0]["time"], "06:30");
    assert_eq!(loaded["alarms"][0]["label"], "출근");
    assert_eq!(loaded["worldCities"][0]["zone"], "Asia/Seoul", "Windows 시간대 이름을 IANA 로 바꾼다");

    assert!(legacy_file.exists(), "WPF 판 설정은 건드리지 않는다");
    assert!(r.store.settings_file().exists());
    assert_eq!(r.store.migrate_from_wpf_if_needed(), None, "두 번째부터는 가져오지 않는다");
  }

  #[test]
  fn extra_clock_without_zone_is_dropped_and_rest_filled() {
    let r = room();
    let s = r.store.save_settings(&json!({
      "extraClocks": [
        { "zone": "Asia/Tokyo", "city": "도쿄", "theme": "OceanTheme", "isDigital": false, "brightness": 300 },
        { "city": "시간대 없음" },
        null
      ]
    }));
    let list = s["extraClocks"].as_array().unwrap();
    assert_eq!(list.len(), 1);
    let clock = &list[0];
    assert_eq!(clock["zone"], "Asia/Tokyo");
    assert_eq!(clock["city"], "도쿄");
    assert_eq!(clock["theme"], "OceanTheme");
    assert_eq!(clock["isDigital"], false);
    assert_eq!(clock["brightness"], 100, "밝기는 10~100 으로 자른다");
    assert_eq!(clock["showCity"], true, "창에 도시 이름을 보이는 것이 기본");
    assert!(clock["id"].as_str().unwrap().starts_with("clock-"), "시계마다 이름표를 갖는다");
    for key in ["digitalStyle", "analogStyle", "use24h", "digitColor", "amPmColor", "customThemeColor"] {
      assert!(clock.get(key).is_some(), "{key} 가 없다");
    }
  }

  #[test]
  fn extra_clocks_keep_their_own_settings() {
    let r = room();
    let saved = r.store.save_settings(&json!({
      "extraClocks": [
        { "id": "c1", "zone": "Asia/Seoul", "city": "서울", "theme": "ForestTheme", "isDigital": true, "use24h": true },
        { "id": "c2", "zone": "America/New_York", "city": "뉴욕", "theme": "SepiaTheme", "isDigital": false, "use24h": false }
      ]
    }));
    let themes: Vec<&Value> = saved["extraClocks"].as_array().unwrap().iter().map(|c| &c["theme"]).collect();
    assert_eq!(themes, vec!["ForestTheme", "SepiaTheme"]);
    let use24: Vec<&Value> = saved["extraClocks"].as_array().unwrap().iter().map(|c| &c["use24h"]).collect();
    assert_eq!(use24, vec![true, false]);
    // 메인 시계의 설정은 그대로다.
    assert_eq!(saved["theme"], "DarkTheme");

    let loaded = r.store.load_settings();
    let ids: Vec<&Value> = loaded["extraClocks"].as_array().unwrap().iter().map(|c| &c["id"]).collect();
    assert_eq!(ids, vec!["c1", "c2"]);
    assert_eq!(loaded["extraClocks"][1]["city"], "뉴욕");
  }

  #[test]
  fn extra_clocks_do_not_own_alarms_or_timers() {
    let r = room();
    let saved = r.store.save_settings(&json!({
      "extraClocks": [{ "zone": "Asia/Seoul", "alarms": [{ "time": "07:00" }], "timers": [{ "minutes": 3 }], "worldCities": [] }]
    }));
    let clock = &saved["extraClocks"][0];
    for key in ["alarms", "timers", "worldCities", "alarmSoundId"] {
      assert!(clock.get(key).is_none(), "{key} 는 시계별 설정이 아니다");
    }
  }

  #[test]
  fn tool_window_bounds_are_remembered() {
    let r = room();
    let saved = r.store.save_settings(&json!({
      "toolWindows": { "alarm": { "x": 100, "y": 200, "width": 420, "height": 600 }, "엉뚱": "x" }
    }));
    assert_eq!(saved["toolWindows"]["alarm"], json!({ "x": 100, "y": 200, "width": 420, "height": 600 }));
    assert!(saved["toolWindows"].get("엉뚱").is_none());
  }

  #[test]
  fn defaults_have_no_extra_clocks() {
    assert_eq!(defaults()["extraClocks"], json!([]));
    assert_eq!(defaults()["toolWindows"], json!({}));
  }

  #[test]
  fn main_clock_city_empty_means_local_time() {
    let r = room();
    let d = defaults();
    assert_eq!(d["zone"], Value::Null);
    assert_eq!(d["city"], "");
    assert_eq!(d["showCity"], true);
    let saved = r.store.save_settings(&json!({ "zone": "Asia/Tokyo", "city": "도쿄" }));
    assert_eq!(saved["zone"], "Asia/Tokyo");
    assert_eq!(saved["city"], "도쿄");
    assert_eq!(r.store.save_settings(&json!({ "zone": "" }))["zone"], Value::Null, "빈 값은 이 컴퓨터 시간");
  }

  #[test]
  fn reset_keeps_extra_clocks_and_window_places() {
    let r = room();
    r.store.save_settings(&json!({
      "theme": "SunsetTheme",
      "extraClocks": [{ "id": "c1", "zone": "Asia/Tokyo", "city": "도쿄", "theme": "ForestTheme" }],
      "toolWindows": { "alarm": { "x": 10, "y": 20, "width": 420, "height": 600 } }
    }));
    let after = r.store.reset_settings();
    assert_eq!(after["theme"], "DarkTheme", "설정은 처음 상태로");
    assert_eq!(after["extraClocks"].as_array().unwrap().len(), 1, "추가한 시계는 그대로");
    assert_eq!(after["extraClocks"][0]["theme"], "ForestTheme");
    assert_eq!(after["toolWindows"]["alarm"], json!({ "x": 10, "y": 20, "width": 420, "height": 600 }));
  }

  #[test]
  fn saved_window_positions_survive_a_reload() {
    // null 로 저장된 창 위치는 다시 읽어도 null 이다 (0,0 으로 바뀌지 않는다).
    let r = room();
    r.store.save_settings(&json!({ "extraClocks": [{ "id": "c1", "zone": "Asia/Tokyo" }] }));
    let loaded = r.store.load_settings();
    assert_eq!(loaded["windowLeft"], Value::Null);
    assert_eq!(loaded["extraClocks"][0]["windowLeft"], Value::Null);
  }

  #[test]
  fn win_timezone_map_is_complete() {
    let map = win_to_iana();
    assert_eq!(map["Korea Standard Time"], "Asia/Seoul");
    assert_eq!(map["Tokyo Standard Time"], "Asia/Tokyo");
    assert_eq!(map["Eastern Standard Time"], "America/New_York");
    assert!(map.len() >= 30);
  }
}
