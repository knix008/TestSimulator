// 파일 목록을 클립보드에 올리고 내려 읽는다 (Electron 판 src/main/clipfiles.js).
//
// 탐색기가 복사(Ctrl+C)와 잘라내기(Ctrl+X)에 쓰는 형식 그대로다.
// 파일 목록은 CF_HDROP, 복사인지 옮기기인지는 Preferred DropEffect 다.
// 그래서 박스에서 복사한 것을 바탕화면에서 붙여넣을 수 있고, 그 반대도 된다.
//
// 검사에서는 memory 로 메모리만 쓴다. 쓰는 사람의 클립보드를 건드리지 않으려고다.

use std::sync::Mutex;

pub const COPY: u32 = 1;
pub const MOVE: u32 = 2;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Clip {
    pub paths: Vec<String>,
    pub effect: u32,
    pub cut: bool,
}

pub struct Clipboard {
    memory: Option<Mutex<(Vec<String>, u32)>>,
}

// 잘라내기인가. 탐색기의 복사는 복사와 연결을 함께 켜므로(5), 옮기기만 켜진 것을 자른 것으로 본다.
pub fn is_cut(effect: u32) -> bool {
    effect & MOVE != 0 && effect & COPY == 0
}

// DROPFILES. 넓은 글자(UTF-16)로 적는다.
pub fn encode_drop(paths: &[String]) -> Vec<u8> {
    let mut out = vec![0u8; 20];
    out[0..4].copy_from_slice(&20u32.to_le_bytes());
    out[16..20].copy_from_slice(&1i32.to_le_bytes());
    for path in paths.iter().filter(|p| !p.is_empty()) {
        for unit in path.encode_utf16() {
            out.extend_from_slice(&unit.to_le_bytes());
        }
        out.extend_from_slice(&[0, 0]);
    }
    out.extend_from_slice(&[0, 0]);
    out
}

pub fn decode_drop(buffer: &[u8]) -> Vec<String> {
    if buffer.len() < 20 {
        return vec![];
    }
    let offset = u32::from_le_bytes(buffer[0..4].try_into().unwrap()) as usize;
    if offset >= buffer.len() {
        return vec![];
    }
    let wide = i32::from_le_bytes(buffer[16..20].try_into().unwrap()) != 0;
    let body = &buffer[offset..];
    if !wide {
        return body.split(|b| *b == 0).filter(|s| !s.is_empty()).map(|s| s.iter().map(|b| *b as char).collect()).collect();
    }
    let units: Vec<u16> = body.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    let mut found = Vec::new();
    for part in units.split(|u| *u == 0) {
        if part.is_empty() {
            break;
        }
        found.push(String::from_utf16_lossy(part));
    }
    found
}

impl Clipboard {
    pub fn system() -> Self {
        Self { memory: None }
    }

    pub fn memory() -> Self {
        Self { memory: Some(Mutex::new((vec![], 0))) }
    }

    pub fn read(&self) -> Clip {
        if let Some(mem) = &self.memory {
            let m = mem.lock().unwrap();
            return Clip { paths: m.0.clone(), effect: m.1, cut: is_cut(m.1) };
        }
        #[cfg(windows)]
        {
            let (paths, effect) = win::read();
            return Clip { paths, effect, cut: is_cut(effect) };
        }
        #[allow(unreachable_code)]
        Clip::default()
    }

    pub fn write(&self, paths: &[String], effect: u32) -> bool {
        let list: Vec<String> = paths.iter().filter(|p| !p.is_empty()).cloned().collect();
        if list.is_empty() {
            return false;
        }
        let drop = if effect == MOVE { MOVE } else { COPY };
        if let Some(mem) = &self.memory {
            *mem.lock().unwrap() = (list, drop);
            return true;
        }
        #[cfg(windows)]
        {
            return win::write(&list, drop);
        }
        #[allow(unreachable_code)]
        false
    }

    pub fn clear(&self) -> bool {
        if let Some(mem) = &self.memory {
            *mem.lock().unwrap() = (vec![], 0);
            return true;
        }
        #[cfg(windows)]
        {
            return win::clear();
        }
        #[allow(unreachable_code)]
        false
    }
}

// 큰 오류 글을 클립보드로. 글 하나만 올린다.
pub fn write_text(text: &str) -> bool {
    #[cfg(windows)]
    {
        return win::write_text(text);
    }
    #[cfg(target_os = "macos")]
    {
        return pipe_to("pbcopy", &[], text);
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        return pipe_to("wl-copy", &[], text) || pipe_to("xclip", &["-selection", "clipboard"], text);
    }
}

#[cfg(not(windows))]
fn pipe_to(cmd: &str, args: &[&str], text: &str) -> bool {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let Ok(mut child) = Command::new(cmd).args(args).stdin(Stdio::piped()).spawn() else { return false };
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(text.as_bytes());
    }
    child.wait().map(|s| s.success()).unwrap_or(false)
}

#[cfg(windows)]
mod win {
    use crate::reg::wide;
    use std::time::Duration;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT};
    use windows::Win32::System::Ole::{CF_HDROP, CF_UNICODETEXT};
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

    // 다른 프로그램이 클립보드를 쥐고 있으면 잠깐 기다렸다가 다시 연다.
    fn with_clipboard<T>(f: impl FnOnce() -> T) -> Option<T> {
        for _ in 0..8 {
            if unsafe { OpenClipboard(None) }.is_ok() {
                let out = f();
                unsafe {
                    let _ = CloseClipboard();
                }
                return Some(out);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        None
    }

    fn effect_format() -> u32 {
        let name = wide("Preferred DropEffect");
        unsafe { RegisterClipboardFormatW(PCWSTR(name.as_ptr())) }
    }

    fn give(format: u32, bytes: &[u8]) -> bool {
        unsafe {
            let Ok(mem) = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes.len()) else { return false };
            let locked = GlobalLock(mem);
            if locked.is_null() {
                let _ = GlobalFree(Some(mem));
                return false;
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), locked as *mut u8, bytes.len());
            let _ = GlobalUnlock(mem);
            if SetClipboardData(format, Some(HANDLE(mem.0))).is_ok() {
                return true;
            }
            let _ = GlobalFree(Some(mem));
            false
        }
    }

    pub fn read() -> (Vec<String>, u32) {
        with_clipboard(|| unsafe {
            let mut paths = Vec::new();
            if let Ok(handle) = GetClipboardData(CF_HDROP.0 as u32) {
                let drop = HDROP(handle.0);
                let count = DragQueryFileW(drop, 0xFFFF_FFFF, None);
                for index in 0..count {
                    let chars = DragQueryFileW(drop, index, None);
                    if chars == 0 {
                        continue;
                    }
                    let mut buf = vec![0u16; chars as usize + 1];
                    let wrote = DragQueryFileW(drop, index, Some(&mut buf));
                    if wrote > 0 {
                        paths.push(String::from_utf16_lossy(&buf[..wrote as usize]));
                    }
                }
            }
            let mut effect = 0;
            let format = effect_format();
            if format != 0 {
                if let Ok(handle) = GetClipboardData(format) {
                    let mem = HGLOBAL(handle.0);
                    let locked = GlobalLock(mem);
                    if !locked.is_null() && GlobalSize(mem) >= 4 {
                        effect = std::ptr::read_unaligned(locked as *const u32);
                    }
                    if !locked.is_null() {
                        let _ = GlobalUnlock(mem);
                    }
                }
            }
            (paths, effect)
        })
        .unwrap_or_default()
    }

    pub fn write(paths: &[String], effect: u32) -> bool {
        with_clipboard(|| unsafe {
            if EmptyClipboard().is_err() {
                return false;
            }
            if !give(CF_HDROP.0 as u32, &super::encode_drop(paths)) {
                return false;
            }
            let format = effect_format();
            format != 0 && give(format, &effect.to_le_bytes())
        })
        .unwrap_or(false)
    }

    pub fn clear() -> bool {
        with_clipboard(|| unsafe { EmptyClipboard().is_ok() }).unwrap_or(false)
    }

    pub fn write_text(text: &str) -> bool {
        let units = wide(text);
        let bytes: Vec<u8> = units.iter().flat_map(|u| u.to_le_bytes()).collect();
        with_clipboard(|| unsafe { EmptyClipboard().is_ok() && give(CF_UNICODETEXT.0 as u32, &bytes) }).unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drop_list_round_trips_korean_names() {
        let paths = vec!["C:\\바탕\\노트.txt".to_string(), "D:\\a b\\c".to_string()];
        assert_eq!(decode_drop(&encode_drop(&paths)), paths);
        assert!(decode_drop(&[0; 4]).is_empty());
    }

    #[test]
    fn copy_and_cut_effects() {
        assert!(is_cut(MOVE));
        assert!(!is_cut(COPY | 4));
        assert!(!is_cut(COPY | MOVE));
        let clip = Clipboard::memory();
        assert!(!clip.write(&[], COPY));
        assert!(clip.write(&["a".into()], MOVE));
        assert!(clip.read().cut);
        clip.clear();
        assert!(clip.read().paths.is_empty());
    }
}
