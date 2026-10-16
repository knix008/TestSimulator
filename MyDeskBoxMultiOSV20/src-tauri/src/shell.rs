// 셸에 맡기는 일 (Electron 의 shell.openPath, shell.trashItem, app.getFileIcon).

use crate::image::Picture;

// 파일·폴더를 연다. 휴지통 같은 셸 항목(shell:…)도 셸이 연다.
pub fn open(path: &str) {
    if path.is_empty() {
        return;
    }
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let verb = crate::reg::wide("open");
        let file = crate::reg::wide(path);
        unsafe {
            ShellExecuteW(None, PCWSTR(verb.as_ptr()), PCWSTR(file.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(path).spawn();
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(path).spawn();
    }
}

// 휴지통으로 보낸다. 보냈으면 참.
pub fn trash(path: &str) -> bool {
    if path.is_empty() || !std::path::Path::new(path).exists() {
        return false;
    }
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::{SHFileOperationW, SHFILEOPSTRUCTW};
        // FOF_SILENT | FOF_NOCONFIRMATION | FOF_ALLOWUNDO | FOF_NOERRORUI
        let mut from: Vec<u16> = path.replace('/', "\\").encode_utf16().collect();
        from.extend_from_slice(&[0, 0]);
        let mut op = SHFILEOPSTRUCTW { wFunc: 3, pFrom: PCWSTR(from.as_ptr()), fFlags: 0x0004 | 0x0010 | 0x0040 | 0x0400, ..Default::default() };
        let code = unsafe { SHFileOperationW(&mut op) };
        return code == 0 && !std::path::Path::new(path).exists();
    }
    #[cfg(not(windows))]
    {
        return trash::delete(path).is_ok();
    }
}

// 운영체제가 주는 파일 그림 (Electron 의 app.getFileIcon, 큰 그림).
pub fn file_icon(path: &str, asset: impl Fn(&str) -> Option<Picture>) -> Option<Picture> {
    #[cfg(windows)]
    {
        let _ = &asset;
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
        use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
        use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;
        crate::desktop::windows::prepare_com();
        let w = crate::reg::wide(&path.replace('/', "\\"));
        let mut info = SHFILEINFOW::default();
        let got = unsafe {
            SHGetFileInfoW(PCWSTR(w.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(0), Some(&mut info), std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON)
        };
        if got == 0 || info.hIcon.0.is_null() {
            return None;
        }
        let shot = crate::desktop::windows::bitmap_of(info.hIcon);
        unsafe {
            let _ = DestroyIcon(info.hIcon);
        }
        return shot;
    }
    #[cfg(not(windows))]
    {
        // 운영체제 그림을 꺼내는 공개 길이 없다. 폴더와 파일을 가르는 그림만 보여 준다.
        if std::path::Path::new(path).is_dir() {
            return asset("menu/folder@2x.png");
        }
        return asset("icon.png");
    }
}

// 다른 운영체제에서 다른 프로그램으로 끌어 넘긴다.
#[cfg(not(windows))]
pub fn start_drag(win: &tauri::WebviewWindow, files: &[String], icon: Option<&Picture>) -> bool {
    let items = drag::DragItem::Files(files.iter().map(std::path::PathBuf::from).collect());
    let image = drag::Image::Raw(icon.map(|p| p.png()).unwrap_or_default());
    #[cfg(target_os = "linux")]
    let target = match win.gtk_window() {
        Ok(w) => w,
        Err(_) => return false,
    };
    #[cfg(target_os = "linux")]
    return drag::start_drag(&target, items, image, |_, _| {}, drag::Options::default()).is_ok();
    #[cfg(target_os = "macos")]
    return drag::start_drag(win, items, image, |_, _| {}, drag::Options::default()).is_ok();
}
