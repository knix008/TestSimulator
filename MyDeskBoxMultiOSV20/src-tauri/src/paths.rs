// 사용자 데이터 폴더와 바탕화면 폴더 (Electron 의 app.getPath).
//
// Electron 판과 같은 자리를 쓴다(%APPDATA%\MyDeskBox). 그래야 판을 바꿔도 박스 배치,
// 보관함(boxes), 아이콘 자리(icon-homes.json)가 그대로 이어지고, 설치 프로그램도 그 자리를 안다.
// MYDESKBOX_DATA_DIR 을 주면 그 폴더를 쓴다 (검사용).

use crate::pathx::join;

pub const PRODUCT: &str = "MyDeskBox";

pub fn user_dir() -> String {
    if let Ok(dir) = std::env::var("MYDESKBOX_DATA_DIR") {
        if !dir.is_empty() {
            return dir;
        }
    }
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return join(&appdata, PRODUCT);
        }
    }
    #[cfg(target_os = "macos")]
    {
        return join(&join(&crate::desktop::files::home(), "Library/Application Support"), PRODUCT);
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let base = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| join(&crate::desktop::files::home(), ".config"));
        return join(&base, PRODUCT);
    }
    #[allow(unreachable_code)]
    join(&crate::desktop::files::home(), PRODUCT)
}

// 바탕화면 모듈이 바탕화면 폴더를 모를 때 쓰는 자리.
pub fn desktop_fallback() -> String {
    join(&crate::desktop::files::home(), "Desktop")
}
