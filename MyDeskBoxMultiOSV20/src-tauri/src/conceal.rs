// 박스 안에서 감춰 둘 파일인가 (src/shared/conceal.js 를 옮긴 것).
//
// 탐색기는 숨김 속성이 붙은 파일을 그리지 않는다. 박스도 그래야 바탕화면과 같아 보인다.
// 임시 파일도 함께 감춘다 (~$문서.docx, .crdownload 따위).

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct FileFlags {
    pub hidden: bool,
    pub system: bool,
    pub temporary: bool,
}

const TEMP_EXT: [&str; 6] = [".tmp", ".temp", ".crdownload", ".partial", ".part", ".download"];
const SYSTEM_NAMES: [&str; 5] = ["desktop.ini", "thumbs.db", "ehthumbs.db", ".ds_store", ".localized"];

pub fn is_temp_name(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    let lower = name.to_lowercase();
    if SYSTEM_NAMES.contains(&lower.as_str()) || name.starts_with("~$") || name.ends_with('~') {
        return true;
    }
    match lower.rfind('.') {
        Some(dot) if dot > 0 => TEMP_EXT.contains(&&lower[dot..]),
        _ => false,
    }
}

pub fn is_dot_name(name: &str) -> bool {
    name.starts_with('.')
}

pub fn is_concealed(name: &str, flags: Option<FileFlags>) -> bool {
    let attrs = flags.unwrap_or_default();
    if attrs.hidden || attrs.system || attrs.temporary {
        return true;
    }
    is_dot_name(name) || is_temp_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hides_temp_system_and_hidden_files() {
        for name in ["~$보고서.docx", "a.tmp", "x.crdownload", "desktop.ini", "Thumbs.db", "백업~", ".env"] {
            assert!(is_concealed(name, None), "{name}");
        }
        for name in ["보고서.docx", "tmp", ".tmp-not-ext-but-dot", "a.temperature"] {
            let expect = name.starts_with('.');
            assert_eq!(is_concealed(name, None), expect, "{name}");
        }
        assert!(is_concealed("a.txt", Some(FileFlags { hidden: true, ..Default::default() })));
        assert!(!is_concealed("a.txt", Some(FileFlags::default())));
    }

    // Electron 판 test/conceal.test.js 의 이름·속성 검사.
    #[test]
    fn same_cases_as_the_electron_version() {
        for name in ["~$보고서.docx", "~WRL0001.tmp", "setup.exe.crdownload", "a.TEMP", "notes.txt~", "Thumbs.db", "desktop.ini", ".hidden"] {
            assert!(is_concealed(name, None), "{name} is not hidden");
        }
        for name in ["보고서.docx", "temp.txt", "part.zip", "~home.txt", "MyDeskBox.lnk"] {
            assert!(!is_concealed(name, None), "{name} is hidden");
        }
        assert!(is_concealed("보고서.docx", Some(FileFlags { hidden: true, ..Default::default() })));
        assert!(is_concealed("보고서.docx", Some(FileFlags { system: true, ..Default::default() })));
        assert!(is_concealed("보고서.docx", Some(FileFlags { temporary: true, ..Default::default() })));
    }
}
