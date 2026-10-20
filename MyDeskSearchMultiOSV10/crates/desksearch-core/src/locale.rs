use std::collections::BTreeMap;
use std::sync::LazyLock;

static KO: LazyLock<BTreeMap<String, String>> =
    LazyLock::new(|| serde_json::from_str(include_str!("../locales/ko.json")).expect("ko locale"));
static EN: LazyLock<BTreeMap<String, String>> =
    LazyLock::new(|| serde_json::from_str(include_str!("../locales/en.json")).expect("en locale"));

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Language {
    Korean,
    English,
}

impl Language {
    pub fn code(self) -> &'static str {
        match self {
            Self::Korean => "ko",
            Self::English => "en",
        }
    }

    pub fn parse(value: &str) -> Self {
        if value.eq_ignore_ascii_case("en") {
            Self::English
        } else {
            Self::Korean
        }
    }
}

pub fn translate(language: Language, key: &str) -> String {
    let table = match language {
        Language::Korean => &KO,
        Language::English => &EN,
    };
    table
        .get(key)
        .cloned()
        .or_else(|| EN.get(key).cloned())
        .unwrap_or_else(|| key.to_string())
}

pub fn format_template(template: &str, args: &[&str]) -> String {
    let mut output = template.to_string();
    for (index, arg) in args.iter().enumerate() {
        output = output.replace(&format!("{{{index}}}"), arg);
    }
    output
}

pub fn format_count(value: u64) -> String {
    let digits = value.to_string();
    let mut out = String::new();
    for (index, ch) in digits.chars().rev().enumerate() {
        if index > 0 && index % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    out.chars().rev().collect()
}

pub fn format_elapsed(language: Language, seconds: f64) -> String {
    if seconds < 60.0 {
        format_template(
            &translate(language, "Duration_Seconds"),
            &[&format!("{seconds:.1}")],
        )
    } else {
        let whole = seconds.round() as u64;
        format_template(
            &translate(language, "Duration_MinutesSeconds"),
            &[&(whole / 60).to_string(), &(whole % 60).to_string()],
        )
    }
}

pub fn t(language: &str, key: &str) -> String {
    translate(Language::parse(language), key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_languages_have_the_same_keys() {
        assert_eq!(KO.len(), EN.len());
        for key in KO.keys() {
            assert!(EN.contains_key(key), "missing english key {key}");
        }
        assert_ne!(t("ko", "Search_NoResults"), t("en", "Search_NoResults"));
        assert_eq!(t("en", "App_Title"), "MyDeskSearch");
        assert!(t("ko", "About_Description").contains("Linux"));
    }

    #[test]
    fn templates_and_counts() {
        assert_eq!(format_count(2000), "2,000");
        assert_eq!(
            format_template(&t("en", "Settings_Resync_Hours"), &["8"]),
            "Every 8 hours"
        );
        assert_eq!(format_elapsed(Language::English, 12.0), "12.0s");
        assert_eq!(format_elapsed(Language::Korean, 90.0), "1분 30초");
    }
}
