//! settings.rs - 설정 저장.
//!
//! C++ 판은 `HKCU\Software\Chunjiin` 에 DWORD 로 넣었다. 레지스트리는
//! Windows 에만 있으므로 여기서는 JSON 파일 하나로 바꾼다.
//!
//! ```text
//! Windows  %AppData%\Chunjiin\settings.json
//! macOS    ~/Library/Application Support/Chunjiin/settings.json
//! Linux    ~/.config/Chunjiin/settings.json
//! ```

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::lang::{detect_lang, Lang, LANGS};
use crate::theme::PALETTES;

/// 설정 창에서 바꿀 수 있는 값들이다.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// `PALETTES` 의 번호
    pub theme: usize,
    /// 편집 영역 글꼴 크기
    #[serde(rename = "fontSize")]
    pub font_size: u32,
    /// 연타 순환이 유지되는 시간(밀리초)
    #[serde(rename = "multitapMs")]
    pub multitap_ms: u64,
    /// 시작할 때의 입력 모드
    #[serde(rename = "startMode")]
    pub start_mode: usize,
    #[serde(rename = "showToolbar")]
    pub show_toolbar: bool,
    #[serde(rename = "showStatus")]
    pub show_status: bool,
    /// 화면 언어 (`"ko"` 또는 `"en"`)
    pub language: String,
}

/// 처음 실행하거나 "기본값" 을 눌렀을 때의 설정이다.
pub const DEFAULT_THEME: usize = 0;
pub const DEFAULT_FONT_SIZE: u32 = 21;
pub const DEFAULT_MULTITAP_MS: u64 = 800;

/// 설정 창에 나오는 글꼴 크기 목록이다.
pub const FONT_CHOICES: [u32; 6] = [16, 18, 21, 24, 28, 32];

/// 연타 유지 시간 목록이다(밀리초).
pub const TAP_CHOICES: [u64; 6] = [400, 600, 800, 1000, 1500, 2000];

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: DEFAULT_THEME,
            font_size: DEFAULT_FONT_SIZE,
            multitap_ms: DEFAULT_MULTITAP_MS,
            start_mode: 0,
            show_toolbar: true,
            show_status: true,
            language: Lang::Ko.code().to_string(),
        }
    }
}

impl Settings {
    /// 지금 언어다.
    pub fn lang(&self) -> Lang {
        Lang::from_code(&self.language)
    }

    /// 파일이 손상되었거나 손으로 고쳐졌을 때를 대비해 값을 다듬는다.
    pub fn normalize(&mut self) {
        self.theme = self.theme.min(PALETTES.len() - 1);
        self.font_size = self
            .font_size
            .clamp(FONT_CHOICES[0], FONT_CHOICES[FONT_CHOICES.len() - 1]);
        self.multitap_ms = self
            .multitap_ms
            .clamp(TAP_CHOICES[0], TAP_CHOICES[TAP_CHOICES.len() - 1]);
        self.start_mode = self.start_mode.min(chunjiin_engine::MODE_COUNT - 1);

        if !LANGS.iter().any(|l| l.code() == self.language) {
            self.language = Lang::Ko.code().to_string();
        }
    }

    /// 설정을 파일에 쓴다. 실패해도 프로그램은 그대로 돌아간다.
    pub fn save(&self) -> std::io::Result<()> {
        let path =
            settings_path().ok_or_else(|| std::io::Error::other("설정 폴더를 찾지 못했습니다"))?;
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut data = serde_json::to_string_pretty(self)?;
        data.push('\n');
        std::fs::write(path, data)
    }
}

/// 설정을 읽는다.
///
/// 파일이 없거나 읽을 수 없으면 기본값을 주되, 언어만은 운영체제 설정을 따른다.
pub fn load_settings() -> Settings {
    // 파일이 없을 때의 값. 언어만은 운영체제 설정을 따른다.
    let fallback = Settings {
        language: detect_lang().code().to_string(),
        ..Settings::default()
    };

    let Some(path) = settings_path() else {
        return fallback;
    };
    let Ok(data) = std::fs::read_to_string(&path) else {
        return fallback;
    };
    match serde_json::from_str::<Settings>(&data) {
        Ok(mut s) => {
            s.normalize();
            s
        }
        Err(_) => fallback,
    }
}

// ---------------------------------------------------------------------
// 설정 파일의 자리
// ---------------------------------------------------------------------

/// 시험이 갈아 끼울 수 있게 덮어쓸 수 있는 자리로 둔다.
///
/// 환경 변수를 건드리는 것만으로는 운영체제마다 다른 설정 폴더를 확실히
/// 돌려세울 수 없어, 실제 사용자 설정을 덮어쓸 위험이 있다.
static OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// 설정 파일의 자리를 바꾼다. 시험에서만 쓴다.
pub fn set_settings_path(path: Option<PathBuf>) {
    *OVERRIDE.lock().unwrap() = path;
}

/// 설정 파일의 자리다.
pub fn settings_path() -> Option<PathBuf> {
    if let Some(p) = OVERRIDE.lock().unwrap().clone() {
        return Some(p);
    }
    Some(config_dir()?.join("Chunjiin").join("settings.json"))
}

/// 프로그램 정보 창에 보여 줄 설정 파일 경로다.
pub fn settings_location() -> String {
    settings_path()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "(알 수 없음)".to_string())
}

/// 운영체제의 설정 폴더다. `dirs` 같은 꾸러미를 쓰지 않고 직접 찾는다.
fn config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from)
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|h| h.join("Library").join("Application Support"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        if let Some(x) = std::env::var_os("XDG_CONFIG_HOME") {
            if !x.is_empty() {
                return Some(PathBuf::from(x));
            }
        }
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|h| h.join(".config"))
    }
}

/// `"21 px  (기본)"` 같은 목록을 만든다.
pub fn unit_labels(list: &[u32], def: u32, unit: &str, mark: &str) -> Vec<String> {
    list.iter()
        .map(|v| {
            let mut s = format!("{v} {unit}");
            if *v == def {
                s.push_str("  ");
                s.push_str(mark);
            }
            s
        })
        .collect()
}

/// `"0.8 초  (기본)"` 같은 목록을 만든다.
pub fn tap_labels(unit: &str, mark: &str) -> Vec<String> {
    TAP_CHOICES
        .iter()
        .map(|v| {
            let mut s = format!("{:.1} {unit}", *v as f64 / 1000.0);
            if *v == DEFAULT_MULTITAP_MS {
                s.push_str("  ");
                s.push_str(mark);
            }
            s
        })
        .collect()
}

/// 목록에서 값의 자리를 찾는다. 없으면 0 이다.
pub fn index_in<T: PartialEq>(list: &[T], v: &T) -> usize {
    list.iter().position(|x| x == v).unwrap_or(0)
}
