use serde::{Deserialize, Serialize};

use crate::text::nfc;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileEntry {
    pub full_path: String,
    pub file_name: String,
    pub directory: String,
    pub is_directory: bool,
    pub modified_utc: i64,
    pub search_file_name: String,
}

impl FileEntry {
    pub fn new(
        full_path: impl Into<String>,
        file_name: impl Into<String>,
        directory: impl Into<String>,
        is_directory: bool,
        modified_utc: i64,
    ) -> Self {
        let file_name = nfc(&file_name.into());
        let full_path = full_path.into();
        let directory = directory.into();
        Self {
            search_file_name: file_name.clone(),
            full_path,
            file_name,
            directory,
            is_directory,
            modified_utc,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AppSettings {
    #[serde(default = "default_background")]
    pub background_color: String,
    #[serde(default = "default_background_opacity")]
    pub background_opacity: i32,
    #[serde(default = "default_border")]
    pub border_color: String,
    #[serde(default = "default_border_thickness")]
    pub border_thickness: f64,
    #[serde(default = "default_text")]
    pub text_color: String,
    #[serde(default = "default_subtext")]
    pub sub_text_color: String,
    #[serde(default = "default_icon")]
    pub icon_color: String,
    #[serde(default = "default_true")]
    pub always_on_top: bool,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_window_opacity")]
    pub window_opacity: i32,
    #[serde(default)]
    pub window_left: Option<f64>,
    #[serde(default)]
    pub window_top: Option<f64>,
    #[serde(default)]
    pub window_width: Option<f64>,
    #[serde(default)]
    pub window_height: Option<f64>,
    #[serde(default)]
    pub case_sensitive_search: bool,
    #[serde(default)]
    pub use_regex_search: bool,
    #[serde(default)]
    pub search_result_sort: crate::sort::SearchResultSortOrder,
    #[serde(default = "default_true")]
    pub run_at_startup: bool,
    #[serde(default = "default_true")]
    pub show_tray_icon: bool,
    #[serde(default)]
    pub included_drives: Vec<String>,
    #[serde(default)]
    pub included_directories: Vec<String>,
    #[serde(default)]
    pub excluded_directories: Vec<String>,
    #[serde(default)]
    pub last_included_directory_browse_path: Option<String>,
    /// `0` disables scheduled full rescans. A missing value migrates to 8 hours.
    #[serde(default)]
    pub resync_interval_hours: u32,
}

fn default_background() -> String {
    "#FFFFFF".to_string()
}
fn default_background_opacity() -> i32 {
    95
}
fn default_border() -> String {
    "#33000000".to_string()
}
fn default_border_thickness() -> f64 {
    1.0
}
fn default_text() -> String {
    "#222222".to_string()
}
fn default_subtext() -> String {
    "#888888".to_string()
}
fn default_icon() -> String {
    "#141414".to_string()
}
fn default_true() -> bool {
    true
}
fn default_language() -> String {
    "ko".to_string()
}
fn default_window_opacity() -> i32 {
    100
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            background_color: default_background(),
            background_opacity: default_background_opacity(),
            border_color: default_border(),
            border_thickness: default_border_thickness(),
            text_color: default_text(),
            sub_text_color: default_subtext(),
            icon_color: default_icon(),
            always_on_top: true,
            language: default_language(),
            window_opacity: default_window_opacity(),
            window_left: None,
            window_top: None,
            window_width: None,
            window_height: None,
            case_sensitive_search: false,
            use_regex_search: false,
            search_result_sort: crate::sort::SearchResultSortOrder::MatchQuality,
            run_at_startup: true,
            show_tray_icon: true,
            included_drives: Vec::new(),
            included_directories: Vec::new(),
            excluded_directories: Vec::new(),
            last_included_directory_browse_path: None,
            resync_interval_hours: 8,
        }
    }
}

impl AppSettings {
    pub fn clone_settings(&self) -> Self {
        self.clone()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IndexPhase {
    Scanning,
    Analyzing,
    Applying,
}

impl IndexPhase {
    pub fn label_key(self) -> &'static str {
        match self {
            Self::Scanning => "Settings_IndexPhaseName_Scanning",
            Self::Analyzing => "Settings_IndexPhaseName_Analyzing",
            Self::Applying => "Settings_IndexPhaseName_Applying",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IndexProgress {
    pub phase: IndexPhase,
    pub indexed: u64,
    pub updated: u64,
    pub percent: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum IndexOutcome {
    Promoted {
        indexed: u64,
    },
    Cancelled {
        indexed: u64,
    },
    Incomplete {
        indexed: u64,
        failed_roots: Vec<String>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResetScope {
    IndexOnly,
    IndexAndSettings,
}
