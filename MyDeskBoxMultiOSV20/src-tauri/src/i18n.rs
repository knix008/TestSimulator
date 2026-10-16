// 화면에 보이는 글. 표는 build.rs 가 src/shared/i18n.js 에서 만든다.
// 창은 그 파일을 <script> 로 읽으므로 두 쪽이 늘 같은 글을 쓴다.

include!(concat!(env!("OUT_DIR"), "/i18n_table.rs"));

pub const DEFAULT_LANG: &str = "ko";

fn table(lang: &str) -> Option<&'static [(&'static str, &'static str)]> {
    TEXT.iter().find(|(id, _)| *id == lang).map(|(_, rows)| *rows)
}

// 모르는 언어는 기본 언어로 둔다.
pub fn lang_of(id: &str) -> &'static str {
    TEXT.iter()
        .find(|(lang, _)| *lang == id)
        .map(|(lang, _)| *lang)
        .unwrap_or(DEFAULT_LANG)
}

// 시스템 언어가 한국어면 한국어로, 아니면 영어로 시작한다.
pub fn guess_lang(locale: &str) -> &'static str {
    let lower = locale.to_ascii_lowercase();
    let rest = lower.strip_prefix("ko");
    match rest {
        Some(rest) if rest.is_empty() || !rest.chars().next().unwrap().is_alphanumeric() => "ko",
        _ => "en",
    }
}

fn lookup(lang: &str, key: &str) -> Option<&'static str> {
    table(lang_of(lang))
        .and_then(|rows| rows.iter().find(|(k, _)| *k == key).map(|(_, v)| *v))
        .or_else(|| table(DEFAULT_LANG).and_then(|rows| rows.iter().find(|(k, _)| *k == key).map(|(_, v)| *v)))
}

pub fn t(lang: &str, key: &str) -> String {
    lookup(lang, key).map(str::to_string).unwrap_or_else(|| key.to_string())
}

// {name} 자리에 값을 넣는다. 없는 이름은 그대로 둔다.
pub fn tv(lang: &str, key: &str, vars: &[(&str, String)]) -> String {
    let Some(text) = lookup(lang, key) else { return key.to_string() };
    let mut out = String::new();
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) if after[..close].chars().all(|c| c.is_alphanumeric() || c == '_') && close > 0 => {
                let name = &after[..close];
                match vars.iter().find(|(k, _)| *k == name) {
                    Some((_, v)) => out.push_str(v),
                    None => {
                        out.push('{');
                        out.push_str(name);
                        out.push('}');
                    }
                }
                rest = &after[close + 1..];
            }
            _ => {
                out.push('{');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

// 이 시스템의 언어. LANG 같은 환경 변수와 Windows 사용자 언어를 본다.
pub fn system_locale() -> String {
    #[cfg(windows)]
    {
        use windows::Win32::Globalization::GetUserDefaultLocaleName;
        let mut buf = [0u16; 85];
        let n = unsafe { GetUserDefaultLocaleName(&mut buf) };
        if n > 1 {
            return String::from_utf16_lossy(&buf[..(n as usize - 1)]);
        }
    }
    for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(value) = std::env::var(key) {
            if !value.is_empty() {
                return value.replace('_', "-");
            }
        }
    }
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_languages_have_the_same_keys() {
        let ko = table("ko").unwrap();
        let en = table("en").unwrap();
        for (key, _) in ko {
            assert!(en.iter().any(|(k, _)| k == key), "en is missing {key}");
        }
        for (key, _) in en {
            assert!(ko.iter().any(|(k, _)| k == key), "ko is missing {key}");
        }
    }

    #[test]
    fn fills_in_values_and_falls_back() {
        assert_eq!(tv("en", "box.nth", &[("n", "3".into())]), "New Box 3");
        assert_eq!(t("xx", "tray.quit"), t("ko", "tray.quit"));
        assert_eq!(t("en", "no.such.key"), "no.such.key");
        assert_eq!(lang_of("fr"), "ko");
        assert_eq!(guess_lang("ko-KR"), "ko");
        assert_eq!(guess_lang("en-US"), "en");
        assert_eq!(guess_lang("kok"), "en");
        assert_eq!(LANGS.len(), 2);
    }
}
