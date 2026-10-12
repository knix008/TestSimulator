// One running copy. A second launch shows a message and exits; it does not
// steal focus from the copy that is already open.

fn message(korean: bool) -> &'static str {
    if korean {
        "CaptureMaster가 이미 실행 중입니다.\n한 번에 하나의 프로그램만 실행할 수 있습니다.\n확인을 누르면 이 프로그램은 종료됩니다."
    } else {
        "CaptureMaster is already running.\nOnly one copy of the program can run at a time.\nClick OK to close this copy."
    }
}

fn mutex_name() -> String {
    let suffix = std::env::var("CM_USER_DATA").unwrap_or_default();
    if suffix.is_empty() {
        "Local\\SHKWON.CaptureMaster.SingleInstance".to_string()
    } else {
        let mut hash: u64 = 0xcbf29ce484222325;
        for b in suffix.as_bytes() {
            hash ^= *b as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        format!("Local\\SHKWON.CaptureMaster.SingleInstance.{hash:x}")
    }
}

#[cfg(windows)]
pub fn ensure() -> bool {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;

    let name = HSTRING::from(mutex_name());
    match unsafe { CreateMutexW(None, true, &name) } {
        Ok(_handle) => {
            if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
                show_already_running();
                return false;
            }
            true
        }
        Err(_) => true,
    }
}

#[cfg(windows)]
fn show_already_running() {
    use windows::core::HSTRING;
    use windows::Win32::Globalization::GetUserDefaultUILanguage;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK, MB_SETFOREGROUND};

    let korean = unsafe { GetUserDefaultUILanguage() } & 0x3FF == 0x12;
    let text = HSTRING::from(message(korean));
    let title = HSTRING::from("CaptureMaster");
    unsafe {
        MessageBoxW(None, &text, &title, MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND);
    }
}

#[cfg(not(windows))]
pub fn ensure() -> bool {
    use std::fs::OpenOptions;
    use std::io::Write;

    let korean = std::env::var("LANG").unwrap_or_default().to_lowercase().starts_with("ko");
    let dir = std::env::var("CM_USER_DATA").ok().filter(|p| !p.is_empty()).map(std::path::PathBuf::from)
        .or_else(|| dirs_fallback())
        .unwrap_or_else(|| std::env::temp_dir().join("CaptureMaster"));
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("instance.lock");
    let file = match OpenOptions::new().create(true).read(true).write(true).open(&path) {
        Ok(f) => f,
        Err(_) => return true,
    };
    if fs2::FileExt::try_lock_exclusive(&file).is_err() {
        rfd::MessageDialog::new()
            .set_title("CaptureMaster")
            .set_description(message(korean))
            .set_level(rfd::MessageLevel::Info)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();
        return false;
    }
    let mut kept = file;
    let _ = writeln!(kept, "{}", std::process::id());
    // The lock is released when the file is dropped, so leak it.
    std::mem::forget(kept);
    true
}

#[cfg(not(windows))]
fn dirs_fallback() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME").ok()?;
    Some(std::path::PathBuf::from(home).join(".config").join("CaptureMaster"))
}
