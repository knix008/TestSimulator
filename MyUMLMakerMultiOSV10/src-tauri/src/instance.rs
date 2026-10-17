//! One MyUMLMaker per user. A second start finds the lock held, tells the user
//! in a message box that the program is already running, and ends.
//!
//! The lock is an OS file lock on `myumlmaker-<user>.lock` in the temporary
//! folder: it is released by the OS when the first copy ends, even after a
//! crash, so a stale file never blocks a later start.
use std::fs::{File, OpenOptions};
use std::path::PathBuf;

pub struct InstanceLock {
    _file: File,
}

fn lock_path() -> PathBuf {
    let dir = std::env::var_os("MYUMLMAKER_LOCK_DIR").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_else(|_| "user".into());
    let user: String = user.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
    dir.join(format!("myumlmaker-{user}.lock"))
}

/// Takes the lock, or returns `None` when another copy holds it.
pub fn acquire() -> Option<InstanceLock> {
    acquire_at(&lock_path())
}

pub fn acquire_at(path: &std::path::Path) -> Option<InstanceLock> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let file = OpenOptions::new().create(true).truncate(false).read(true).write(true).open(path).ok()?;
    match file.try_lock() {
        Ok(()) => Some(InstanceLock { _file: file }),
        Err(_) => None,
    }
}

/// The message shown to the second copy, in the system language.
pub fn already_running_text() -> (String, String) {
    let korean = system_is_korean();
    if korean {
        (
            "MyUMLMaker — 실행 오류".into(),
            "MyUMLMaker 이 이미 실행 중입니다.\n\n같은 프로그램을 두 번 실행할 수 없습니다. 이미 열려 있는 MyUMLMaker 창을 사용하세요.\n(작업 표시줄에서 MyUMLMaker 을 찾을 수 있습니다.)\n\n이 실행은 종료됩니다.".into(),
        )
    } else {
        (
            "MyUMLMaker — Start error".into(),
            "MyUMLMaker is already running.\n\nThe program cannot run twice. Please use the MyUMLMaker window that is already open\n(look for MyUMLMaker on the taskbar).\n\nThis copy will now close.".into(),
        )
    }
}

fn system_is_korean() -> bool {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(value) = std::env::var(key) {
            if !value.is_empty() {
                return value.to_lowercase().starts_with("ko");
            }
        }
    }
    #[cfg(windows)]
    {
        // GetUserDefaultUILanguage: primary language 0x12 = Korean.
        extern "system" {
            fn GetUserDefaultUILanguage() -> u16;
        }
        // SAFETY: a plain Win32 call without arguments.
        let lang = unsafe { GetUserDefaultUILanguage() };
        return lang & 0x3ff == 0x12;
    }
    #[allow(unreachable_code)]
    false
}

/// Shows the "already running" error. Tests set `MYUMLMAKER_ALREADY_RUNNING_FILE`
/// to get the text written to a file instead of a blocking message box.
pub fn report_already_running() {
    let (title, text) = already_running_text();
    if let Some(file) = std::env::var_os("MYUMLMAKER_ALREADY_RUNNING_FILE") {
        let _ = std::fs::write(file, format!("{title}\n{text}"));
        return;
    }
    show_error_box(&title, &text);
}

/// Windows: the system message box, topmost and brought to the front. A plain
/// dialog could open behind the running MyUMLMaker window, so the second start
/// looked like it did nothing.
#[cfg(windows)]
fn show_error_box(title: &str, text: &str) {
    extern "system" {
        fn MessageBoxW(hwnd: *mut core::ffi::c_void, text: *const u16, caption: *const u16, kind: u32) -> i32;
    }
    const MB_OK: u32 = 0x0;
    const MB_ICONERROR: u32 = 0x10;
    const MB_SETFOREGROUND: u32 = 0x1_0000;
    const MB_TOPMOST: u32 = 0x4_0000;
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (text, title) = (wide(text), wide(title));
    // SAFETY: both strings are NUL-terminated UTF-16 that outlive the call; no owner window.
    unsafe {
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST);
    }
}

#[cfg(not(windows))]
fn show_error_box(title: &str, text: &str) {
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title(title)
        .set_description(text)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_lock_fails_until_the_first_is_released() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.lock");
        let first = acquire_at(&path).expect("first copy gets the lock");
        assert!(acquire_at(&path).is_none(), "a second copy is refused");
        drop(first);
        assert!(acquire_at(&path).is_some(), "the lock is free again once the first copy ends");
    }

    #[test]
    fn message_names_the_program_and_says_it_closes() {
        let (title, text) = already_running_text();
        assert!(title.contains("MyUMLMaker"));
        assert!(text.contains("MyUMLMaker"));
        assert!(text.len() > 40);
    }
}
