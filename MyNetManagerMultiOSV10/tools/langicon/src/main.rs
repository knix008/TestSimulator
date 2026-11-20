//! langicon <pid>
//!
//! NSIS's language selection dialog (LangDLL) has no icon on its title bar. The installer starts this helper
//! (from $PLUGINSDIR, see src-tauri/windows/hooks.nsh) just before it opens the dialog: the helper waits for
//! that dialog — a visible top-level dialog of process <pid> with a combo box — and gives it the installer's
//! own icon (the program icon), small and large, at the sizes for the dialog's DPI. It then exits; after 15 s,
//! or when the installer is gone, it exits anyway. No console window, no dependencies.
#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(not(windows))]
fn main() {}

#[cfg(windows)]
fn main() {
    win::run();
}

#[cfg(windows)]
mod win {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    type Hwnd = isize;
    type Handle = isize;

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(cb: extern "system" fn(Hwnd, isize) -> i32, lparam: isize) -> i32;
        fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
        fn IsWindowVisible(hwnd: Hwnd) -> i32;
        fn GetClassNameW(hwnd: Hwnd, buf: *mut u16, len: i32) -> i32;
        fn FindWindowExW(parent: Hwnd, after: Hwnd, class: *const u16, title: *const u16) -> Hwnd;
        fn SendMessageW(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize) -> isize;
        fn GetDpiForWindow(hwnd: Hwnd) -> u32;
        fn GetSystemMetricsForDpi(index: i32, dpi: u32) -> i32;
    }
    #[link(name = "shell32")]
    extern "system" {
        fn SHDefExtractIconW(file: *const u16, index: i32, flags: u32, large: *mut isize, small: *mut isize, sizes: u32) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
        fn QueryFullProcessImageNameW(process: Handle, flags: u32, buf: *mut u16, size: *mut u32) -> i32;
        fn GetExitCodeProcess(process: Handle, code: *mut u32) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
        fn Sleep(ms: u32);
    }

    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const STILL_ACTIVE: u32 = 259;
    const WM_SETICON: u32 = 0x0080;
    const ICON_SMALL: usize = 0;
    const ICON_BIG: usize = 1;
    const SM_CXICON: i32 = 11;
    const SM_CXSMICON: i32 = 49;

    struct Search {
        pid: u32,
        found: Hwnd,
    }

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    extern "system" fn each(hwnd: Hwnd, lparam: isize) -> i32 {
        // SAFETY: lparam is the &mut Search passed to EnumWindows below, alive for the whole call.
        let search = unsafe { &mut *(lparam as *mut Search) };
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid != search.pid || unsafe { IsWindowVisible(hwnd) } == 0 {
            return 1;
        }
        let mut class = [0u16; 32];
        let n = unsafe { GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32) };
        if String::from_utf16_lossy(&class[..n.max(0) as usize]) != "#32770" {
            return 1;
        }
        // The language dialog is the dialog with a combo box (message boxes have none).
        let combo = wide("ComboBox");
        if unsafe { FindWindowExW(hwnd, 0, combo.as_ptr(), std::ptr::null()) } == 0 {
            return 1;
        }
        search.found = hwnd;
        0
    }

    pub fn run() {
        let Some(pid) = std::env::args().nth(1).and_then(|a| a.parse::<u32>().ok()) else { return };
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process == 0 {
            return;
        }
        let mut path = vec![0u16; 1024];
        let mut size = path.len() as u32;
        if unsafe { QueryFullProcessImageNameW(process, 0, path.as_mut_ptr(), &mut size) } == 0 {
            unsafe { CloseHandle(process) };
            return;
        }
        path.truncate(size as usize);
        path.push(0);
        let mut search = Search { pid, found: 0 };
        for _ in 0..3000 {
            let mut code = 0u32;
            if unsafe { GetExitCodeProcess(process, &mut code) } == 0 || code != STILL_ACTIVE {
                break;
            }
            unsafe { EnumWindows(each, &mut search as *mut Search as isize) };
            if search.found != 0 {
                let dpi = unsafe { GetDpiForWindow(search.found) }.max(96);
                let big = unsafe { GetSystemMetricsForDpi(SM_CXICON, dpi) }.max(32) as u32;
                let small = unsafe { GetSystemMetricsForDpi(SM_CXSMICON, dpi) }.max(16) as u32;
                let (mut large_icon, mut small_icon) = (0isize, 0isize);
                // The installer's first icon resource is its own icon (MUI_ICON = the program icon).
                let ok = unsafe { SHDefExtractIconW(path.as_ptr(), 0, 0, &mut large_icon, &mut small_icon, big | (small << 16)) };
                if ok == 0 {
                    unsafe {
                        SendMessageW(search.found, WM_SETICON, ICON_SMALL, small_icon);
                        SendMessageW(search.found, WM_SETICON, ICON_BIG, large_icon);
                    }
                }
                break;
            }
            unsafe { Sleep(5) };
        }
        unsafe { CloseHandle(process) };
    }
}
