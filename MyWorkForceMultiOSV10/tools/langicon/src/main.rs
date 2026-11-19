//! langicon <installer pid> <installer exe> <dialog title>
//!
//! The installer's language dialog (NSIS LangDLL) is a modal-frame dialog, which Windows draws without a
//! title-bar icon, and the plugin gives no way to change that. The installer starts this helper just before
//! the dialog: it waits for the dialog (that process, that title), lets its frame show an icon and gives it the
//! installer's own icon. It stays until the dialog closes, because the icon belongs to this process.
#![windows_subsystem = "windows"]

use std::ffi::c_void;

type Hwnd = *mut c_void;
type Hicon = *mut c_void;

const GWL_EXSTYLE: i32 = -20;
const WS_EX_DLGMODALFRAME: isize = 0x0000_0001;
const WM_SETICON: u32 = 0x0080;
const ICON_SMALL: usize = 0;
const ICON_BIG: usize = 1;
const SWP_FLAGS: u32 = 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020; // NOSIZE NOMOVE NOZORDER NOACTIVATE FRAMECHANGED

#[link(name = "user32")]
extern "system" {
    fn EnumWindows(callback: extern "system" fn(Hwnd, isize) -> i32, param: isize) -> i32;
    fn GetWindowTextW(hwnd: Hwnd, text: *mut u16, max: i32) -> i32;
    fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
    fn IsWindow(hwnd: Hwnd) -> i32;
    fn IsWindowVisible(hwnd: Hwnd) -> i32;
    fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
    fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, value: isize) -> isize;
    fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
    fn SendMessageW(hwnd: Hwnd, message: u32, wparam: usize, lparam: isize) -> isize;
}

#[link(name = "shell32")]
extern "system" {
    fn ExtractIconExW(file: *const u16, index: i32, large: *mut Hicon, small: *mut Hicon, count: u32) -> u32;
}

#[link(name = "kernel32")]
extern "system" {
    fn Sleep(milliseconds: u32);
}

struct Search {
    pid: u32,
    title: Vec<u16>,
    found: Hwnd,
}

extern "system" fn visit(hwnd: Hwnd, param: isize) -> i32 {
    // SAFETY: `param` is the address of the Search that `find` keeps alive during EnumWindows.
    let search = unsafe { &mut *(param as *mut Search) };
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid != search.pid || unsafe { IsWindowVisible(hwnd) } == 0 {
        return 1;
    }
    let mut text = [0u16; 512];
    let n = unsafe { GetWindowTextW(hwnd, text.as_mut_ptr(), text.len() as i32) };
    if n > 0 && text[..n as usize] == search.title[..] {
        search.found = hwnd;
        return 0;
    }
    1
}

fn find(pid: u32, title: &[u16]) -> Hwnd {
    let mut search = Search { pid, title: title.to_vec(), found: std::ptr::null_mut() };
    unsafe { EnumWindows(visit, &mut search as *mut Search as isize) };
    search.found
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        return;
    }
    let Ok(pid) = args[1].parse::<u32>() else { return };
    let exe: Vec<u16> = wide(&args[2]).into_iter().chain(std::iter::once(0)).collect();
    let title = wide(&args[3]);

    // The dialog comes up within moments; give up after ten seconds.
    let mut dialog: Hwnd = std::ptr::null_mut();
    for _ in 0..1000 {
        dialog = find(pid, &title);
        if !dialog.is_null() {
            break;
        }
        unsafe { Sleep(10) };
    }
    if dialog.is_null() {
        return;
    }

    let mut large: Hicon = std::ptr::null_mut();
    let mut small: Hicon = std::ptr::null_mut();
    unsafe {
        ExtractIconExW(exe.as_ptr(), 0, &mut large, &mut small, 1);
        let style = GetWindowLongPtrW(dialog, GWL_EXSTYLE);
        SetWindowLongPtrW(dialog, GWL_EXSTYLE, style & !WS_EX_DLGMODALFRAME);
        if !small.is_null() {
            SendMessageW(dialog, WM_SETICON, ICON_SMALL, small as isize);
        }
        if !large.is_null() {
            SendMessageW(dialog, WM_SETICON, ICON_BIG, large as isize);
        }
        SetWindowPos(dialog, std::ptr::null_mut(), 0, 0, 0, 0, SWP_FLAGS);
    }

    // The icons are this process's: stay until the dialog is gone.
    while unsafe { IsWindow(dialog) } != 0 {
        unsafe { Sleep(150) };
    }
}
