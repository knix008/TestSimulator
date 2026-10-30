// Files leaving and entering the window, and the shell file clipboard
// (taken from Command Center).
//
// Drag out — `start_file_drag` hands local paths to the OS (the `drag` crate),
// so Explorer, Finder or the desktop can take them. The page starts it when a
// drag of its own rows leaves the window; server rows are downloaded to a
// temporary folder first. Shift held at that moment asks for a move.
//
// Drag in — Tauri's drag-drop events (dragDropEnabled) give the page the
// paths; `drag_keys` says which modifiers are down at the drop, because the
// page gets no key events during an OS drag.
//
// Clipboard — on Windows, Cut and Copy of local items publish a real file
// list (CF_HDROP) plus the drop effect Explorer understands (copy = 1,
// move = 2). Paste reads that list back, including a cut made in Explorer.
use std::path::PathBuf;

#[derive(serde::Serialize)]
pub struct FileClipboard {
    paths: Vec<String>,
    cut: bool,
}

#[derive(serde::Serialize)]
pub struct DragKeys {
    shift: bool,
    ctrl: bool,
    // The left mouse button is still down: a drag that left the window can
    // still be handed to the OS (a server download may have taken a while).
    left: bool,
}

#[tauri::command]
pub fn drag_keys() -> DragKeys {
    #[cfg(windows)]
    {
        // High bit set means the key is down right now — reliable during an OLE drag,
        // when the page itself may not be receiving key events.
        let down = |vk: i32| unsafe { GetAsyncKeyState(vk) < 0 };
        // VK_LBUTTON is the physical left button; with swapped buttons the primary one is VK_RBUTTON.
        let primary = if unsafe { GetSystemMetrics(23) } != 0 { 0x02 } else { 0x01 };
        return DragKeys { shift: down(0x10), ctrl: down(0x11), left: down(primary) };
    }
    #[cfg(not(windows))]
    DragKeys { shift: false, ctrl: false, left: false }
}

#[tauri::command]
pub fn clipboard_write_files(paths: Vec<String>, cut: bool, text: String) -> Result<bool, String> {
    #[cfg(windows)]
    {
        windows::write_files(&paths, cut, &text)?;
        return Ok(true);
    }
    #[cfg(not(windows))]
    {
        let _ = (paths, cut, text);
        Ok(false)
    }
}

#[tauri::command]
pub fn clipboard_read_files() -> Result<FileClipboard, String> {
    #[cfg(windows)]
    {
        return Ok(windows::read_files()?);
    }
    #[cfg(not(windows))]
    Ok(FileClipboard { paths: Vec::new(), cut: false })
}

#[tauri::command]
pub fn clipboard_clear_files() -> Result<(), String> {
    #[cfg(windows)]
    {
        windows::clear()?;
    }
    Ok(())
}

#[tauri::command]
pub fn start_file_drag(window: tauri::WebviewWindow, paths: Vec<String>, move_files: bool) -> Result<(), String> {
    let files: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).filter(|p| p.exists()).collect();
    if files.is_empty() {
        return Err("nothing to drag".into());
    }
    let mut options = drag::Options::default();
    options.mode = if move_files { drag::DragMode::Move } else { drag::DragMode::Copy };
    // A 32px icon rides with the cursor. The bytes are a PNG; the crate decodes them.
    let icon = drag::Image::Raw(include_bytes!("../icons/32x32.png").to_vec());
    let item = drag::DragItem::Files(files);
    // GTK (Linux) and Cocoa (macOS) have to start the drag on the UI thread.
    // Windows can drag from this command's thread, which leaves the window able to highlight a drop.
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        let win = window.clone();
        window
            .run_on_main_thread(move || {
                let result = (|| -> Result<(), String> {
                    #[cfg(target_os = "linux")]
                    {
                        let gtk = win.gtk_window().map_err(|e| e.to_string())?;
                        return drag::start_drag(&gtk, item, icon, |_result, _cursor| {}, options).map_err(|e| e.to_string());
                    }
                    #[cfg(target_os = "macos")]
                    {
                        return drag::start_drag(&win, item, icon, |_result, _cursor| {}, options).map_err(|e| e.to_string());
                    }
                })();
                let _ = tx.send(result);
            })
            .map_err(|e| e.to_string())?;
        return rx.recv().map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    drag::start_drag(&window, item, icon, |_result, _cursor| {}, options).map_err(|e| e.to_string())
}

#[cfg(windows)]
extern "system" {
    fn GetAsyncKeyState(key: i32) -> i16;
    fn GetSystemMetrics(index: i32) -> i32;
}

#[cfg(windows)]
mod windows {
    use super::FileClipboard;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    const CF_UNICODETEXT: u32 = 13;
    const CF_HDROP: u32 = 15;
    const GMEM_MOVEABLE: u32 = 0x0002;
    const GMEM_ZEROINIT: u32 = 0x0040;
    const DROPEFFECT_COPY: u32 = 1;
    const DROPEFFECT_MOVE: u32 = 2;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(hwnd: *mut std::ffi::c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn EmptyClipboard() -> i32;
        fn SetClipboardData(format: u32, mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
        fn GetClipboardData(format: u32) -> *mut std::ffi::c_void;
        fn RegisterClipboardFormatW(name: *const u16) -> u32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalAlloc(flags: u32, bytes: usize) -> *mut std::ffi::c_void;
        fn GlobalLock(mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
        fn GlobalUnlock(mem: *mut std::ffi::c_void) -> i32;
        fn GlobalSize(mem: *mut std::ffi::c_void) -> usize;
        fn GlobalFree(mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
        fn MultiByteToWideChar(cp: u32, flags: u32, src: *const u8, srclen: i32, dst: *mut u16, dstlen: i32) -> i32;
    }

    fn wide(text: &str) -> Vec<u16> {
        OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect()
    }

    fn with_clipboard<T>(body: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        let mut opened = false;
        for _ in 0..15 {
            if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        if !opened {
            return Err("clipboard is busy".into());
        }
        let result = body();
        unsafe { CloseClipboard() };
        result
    }

    fn give(format: u32, mem: *mut std::ffi::c_void) -> Result<(), String> {
        if mem.is_null() {
            return Err("out of memory".into());
        }
        if unsafe { SetClipboardData(format, mem) }.is_null() {
            unsafe { GlobalFree(mem) };
            return Err("SetClipboardData failed".into());
        }
        Ok(())
    }

    fn alloc_copy(bytes: &[u8]) -> *mut std::ffi::c_void {
        let mem = unsafe { GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes.len()) };
        if mem.is_null() {
            return mem;
        }
        unsafe {
            let dest = GlobalLock(mem) as *mut u8;
            if dest.is_null() {
                GlobalFree(mem);
                return std::ptr::null_mut();
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), dest, bytes.len());
            GlobalUnlock(mem);
        }
        mem
    }

    // DROPFILES (20 bytes) + UTF-16 paths, each ending in NUL, and one extra NUL.
    fn hdrop(paths: &[String]) -> *mut std::ffi::c_void {
        let mut chars: Vec<u16> = Vec::new();
        for path in paths {
            chars.extend(OsStr::new(path).encode_wide());
            chars.push(0);
        }
        chars.push(0);
        let mut bytes = vec![0u8; 20 + chars.len() * 2];
        bytes[0] = 20; // pFiles
        bytes[16] = 1; // fWide
        unsafe {
            std::ptr::copy_nonoverlapping(chars.as_ptr() as *const u8, bytes.as_mut_ptr().add(20), chars.len() * 2);
        }
        alloc_copy(&bytes)
    }

    pub fn write_files(paths: &[String], cut: bool, text: &str) -> Result<(), String> {
        if paths.is_empty() {
            return Err("nothing to copy".into());
        }
        with_clipboard(|| {
            if unsafe { EmptyClipboard() } == 0 {
                return Err("EmptyClipboard failed".into());
            }
            give(CF_HDROP, hdrop(paths))?;
            let effect = if cut { DROPEFFECT_MOVE } else { DROPEFFECT_COPY };
            let name = wide("Preferred DropEffect");
            let format = unsafe { RegisterClipboardFormatW(name.as_ptr()) };
            if format != 0 {
                give(format, alloc_copy(&effect.to_le_bytes()))?;
            }
            if !text.is_empty() {
                let chars = wide(text);
                let bytes = unsafe { std::slice::from_raw_parts(chars.as_ptr() as *const u8, chars.len() * 2) };
                let _ = give(CF_UNICODETEXT, alloc_copy(bytes));
            }
            Ok(())
        })
    }

    pub fn clear() -> Result<(), String> {
        with_clipboard(|| {
            if unsafe { EmptyClipboard() } == 0 {
                return Err("EmptyClipboard failed".into());
            }
            Ok(())
        })
    }

    pub fn read_files() -> Result<FileClipboard, String> {
        with_clipboard(|| {
            let hdrop = unsafe { GetClipboardData(CF_HDROP) };
            if hdrop.is_null() {
                return Ok(FileClipboard { paths: Vec::new(), cut: false });
            }
            let paths = parse_hdrop(hdrop);
            let name = wide("Preferred DropEffect");
            let format = unsafe { RegisterClipboardFormatW(name.as_ptr()) };
            let mut effect = DROPEFFECT_COPY;
            if format != 0 {
                let mem = unsafe { GetClipboardData(format) };
                if !mem.is_null() {
                    unsafe {
                        let p = GlobalLock(mem) as *const u32;
                        if !p.is_null() {
                            effect = std::ptr::read_unaligned(p);
                            GlobalUnlock(mem);
                        }
                    }
                }
            }
            // Move, and not also copy. A mixed effect stays a copy so a paste never deletes by surprise.
            let cut = effect & DROPEFFECT_MOVE != 0 && effect & DROPEFFECT_COPY == 0;
            Ok(FileClipboard { paths, cut })
        })
    }

    fn parse_hdrop(mem: *mut std::ffi::c_void) -> Vec<String> {
        unsafe {
            let base = GlobalLock(mem) as *const u8;
            if base.is_null() {
                return Vec::new();
            }
            let size = GlobalSize(mem);
            let offset = std::ptr::read_unaligned(base as *const u32) as usize;
            let wide = size >= 20 && std::ptr::read_unaligned(base.add(16) as *const u32) != 0;
            let paths = if offset >= size {
                Vec::new()
            } else if wide {
                parse_wide(std::slice::from_raw_parts(base.add(offset) as *const u16, (size - offset) / 2))
            } else {
                parse_ansi(std::slice::from_raw_parts(base.add(offset), size - offset))
            };
            GlobalUnlock(mem);
            paths
        }
    }

    fn parse_wide(words: &[u16]) -> Vec<String> {
        let mut paths = Vec::new();
        let mut i = 0;
        while i < words.len() {
            if words[i] == 0 {
                break;
            }
            let start = i;
            while i < words.len() && words[i] != 0 {
                i += 1;
            }
            if let Ok(path) = String::from_utf16(&words[start..i]) {
                if !path.is_empty() {
                    paths.push(path);
                }
            }
            i += 1;
        }
        paths
    }

    fn parse_ansi(bytes: &[u8]) -> Vec<String> {
        let mut paths = Vec::new();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == 0 {
                break;
            }
            let start = i;
            while i < bytes.len() && bytes[i] != 0 {
                i += 1;
            }
            let path = ansi_to_string(&bytes[start..i]);
            if !path.is_empty() {
                paths.push(path);
            }
            i += 1;
        }
        paths
    }

    fn ansi_to_string(bytes: &[u8]) -> String {
        if bytes.is_empty() {
            return String::new();
        }
        unsafe {
            let n = MultiByteToWideChar(0, 0, bytes.as_ptr(), bytes.len() as i32, std::ptr::null_mut(), 0);
            if n <= 0 {
                return String::from_utf8_lossy(bytes).into_owned();
            }
            let mut wide = vec![0u16; n as usize];
            MultiByteToWideChar(0, 0, bytes.as_ptr(), bytes.len() as i32, wide.as_mut_ptr(), n);
            String::from_utf16_lossy(&wide)
        }
    }
}
