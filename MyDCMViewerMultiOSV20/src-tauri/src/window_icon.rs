// The taskbar and Alt+Tab show a window's big icon. Tauri only gives the
// window a small one, so Windows was left to stretch that or fall back to a
// stock icon. Both are set here from the icon built into the program itself,
// the one its shortcuts and the installer show, at the sizes this screen uses.

use tauri::WebviewWindow;

// The resource id tauri-build gives the program icon.
#[cfg(windows)]
const PROGRAM_ICON: usize = 32512;

pub fn apply(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        let Ok(handle) = window.window_handle() else {
            return;
        };
        let RawWindowHandle::Win32(raw) = handle.as_raw() else {
            return;
        };
        unsafe { set_icons(raw.hwnd.get() as isize) };
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
unsafe fn set_icons(hwnd: isize) {
    #[link(name = "user32")]
    extern "system" {
        fn GetDpiForWindow(hwnd: isize) -> u32;
        fn GetSystemMetricsForDpi(index: i32, dpi: u32) -> i32;
        fn LoadImageW(module: isize, name: usize, kind: u32, cx: i32, cy: i32, flags: u32) -> isize;
        fn SendMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> isize;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> isize;
    }
    const SM_CXICON: i32 = 11;
    const SM_CXSMICON: i32 = 49;
    const IMAGE_ICON: u32 = 1;
    // Loaded once per size and kept by Windows, so nothing is leaked per window.
    const LR_SHARED: u32 = 0x8000;
    const WM_SETICON: u32 = 0x0080;
    let module = GetModuleHandleW(std::ptr::null());
    let mut dpi = GetDpiForWindow(hwnd);
    if dpi == 0 {
        dpi = 96;
    }
    for (which, metric) in [(1usize, SM_CXICON), (0usize, SM_CXSMICON)] {
        let size = GetSystemMetricsForDpi(metric, dpi);
        let icon = LoadImageW(module, PROGRAM_ICON, IMAGE_ICON, size, size, LR_SHARED);
        if icon != 0 {
            SendMessageW(hwnd, WM_SETICON, which, icon);
        }
    }
}
