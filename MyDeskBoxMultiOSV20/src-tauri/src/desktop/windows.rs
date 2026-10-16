// 탐색기 바탕화면 아이콘(SysListView32)의 자리를 읽고 옮긴다 (Electron 판 src/main/desktop/windows.js).
//
// 박스가 깔고 앉은 바탕화면 아이콘을 빈 칸으로 비켜 주고, 끝낼 때 적어 둔 자리로 돌려놓는다.
// 휴지통 같은 셸 항목은 레지스트리로 감추고, 박스 창이 대신 그린다.
//
// 바탕화면 아이콘의 그림을 통째로 날리는 호출은 쓰지 않는다 — LVM_SETWORKAREAS,
// SHCNE_ASSOCCHANGED, 목록 창 크기 바꾸기. 세 가지 모두 계측으로 확인했다.

use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::ffi::c_void;
use std::fs;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use windows::core::{Interface, BOOL, GUID, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, HWND, LPARAM, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, InvalidateRect, ReleaseDC, UpdateWindow, BITMAP, BITMAPINFO,
    BITMAPINFOHEADER, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
};
use windows::Win32::Storage::FileSystem::{GetFileAttributesW, SetFileAttributesW, FILE_FLAGS_AND_ATTRIBUTES};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ};
use windows::Win32::System::Diagnostics::Debug::{ReadProcessMemory, WriteProcessMemory};
use windows::Win32::System::Memory::{VirtualAllocEx, VirtualFreeEx, MEM_COMMIT, MEM_RELEASE, MEM_RESERVE, PAGE_READWRITE};
use windows::Win32::System::Threading::{
    CreateMutexW, GetCurrentProcessId, OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_OPERATION, PROCESS_VM_READ,
    PROCESS_VM_WRITE,
};
use windows::Win32::UI::Controls::{IImageList, ILD_TRANSPARENT};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, GetDoubleClickTime};
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
use windows::Win32::UI::Shell::{
    IShellLinkW, SHChangeNotify, SHEmptyRecycleBinW, SHFileOperationW, SHGetFileInfoW, SHGetImageList, SHParseDisplayName,
    SHQueryRecycleBinW, ShellLink, SHCNE_ID, SHCNF_FLAGS, SHFILEINFOW, SHFILEOPSTRUCTW, SHGFI_DISPLAYNAME, SHGFI_FLAGS,
    SHGFI_PIDL, SHGFI_SYSICONINDEX, SHQUERYRBINFO, SLGP_RAWPATH,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, FindWindowExW, FindWindowW, GetAncestor, GetClassNameW, GetClientRect, GetDesktopWindow,
    GetForegroundWindow, GetIconInfo, GetParent, GetSystemMetrics, GetWindow, GetWindowLongPtrW, GetWindowRect,
    GetWindowThreadProcessId, IsWindowVisible, PostMessageW, PrivateExtractIconsW, SendMessageTimeoutW, SendMessageW,
    SetWindowLongPtrW, SetWindowPos, ShowWindow, WindowFromPoint, GA_ROOT, GWL_EXSTYLE, GWL_STYLE, GW_CHILD, GW_HWNDNEXT,
    HICON, ICONINFO, SMTO_NORMAL, SM_CXDOUBLECLK, SM_CYDOUBLECLK, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOZORDER, SW_HIDE,
    SW_SHOWNA, WM_COMMAND, WM_SETREDRAW,
};

use super::files::{match_desktop_entries, same_name};
use super::{DeskGrid, Desktop, Entry, FileEntry, Link};
use crate::conceal::FileFlags;
use crate::deskgrid::{self, Icon, Lattice, Move};
use crate::deskpick::{self, DragRect, SurfaceFlags};
use crate::geom::{Point, Rect};
use crate::image::Picture;
use crate::js::round;
use crate::pathx::join;
use crate::reg::{self, wide, HKCR, HKCU};
use crate::screen;
use crate::store::Item;

// ── 상수 ────────────────────────────────────────────────────────────────

const WS_EX_TRANSPARENT: u32 = 0x20;
// 바탕화면 보기의 '새로 고침'. 목록만 다시 읽고 아이콘 그림 곳간은 건드리지 않는다.
const DESKTOP_REFRESH: usize = 0x7103;
const LVM_GETITEMCOUNT: u32 = 0x1004;
const LVM_GETITEMSPACING: u32 = 0x1033;
const LVM_GETITEMPOSITION: u32 = 0x1010;
const LVM_SETITEMPOSITION32: u32 = 0x1031;
// 좌표를 lParam 에 담는 옛 메시지. 탐색기의 답을 기다리지 않고 보낼 수 있다.
const LVM_SETITEMPOSITION: u32 = 0x100f;
const LVM_GETITEMTEXTW: u32 = 0x1073;
const LVM_GETNEXTITEM: u32 = 0x100c;
const LVNI_SELECTED: isize = 0x0002;
const LVS_AUTOARRANGE: u32 = 0x0100;
const LVM_GETEXTENDEDLISTVIEWSTYLE: u32 = 0x1037;
const LVM_SETEXTENDEDLISTVIEWSTYLE: u32 = 0x1036;
const LVS_EX_SNAPTOGRID: u32 = 0x0008_0000;

// 바탕화면에 놓을 수 있는, 파일이 아닌 항목들
const SHELL_ITEMS: [&str; 5] = [
    "shell:RecycleBinFolder",
    "shell:MyComputerFolder",
    "shell:NetworkPlacesFolder",
    "shell:UsersFilesFolder",
    "shell:ControlPanelFolder",
];
// 자리만 옮기면 탐색기가 되돌려 놓는 항목이다. 박스에 넣는 동안은 바탕화면에서 숨긴다.
// 이 목록은 src-tauri/windows/hooks.nsh 의 ShowShellIcons 와 같아야 한다.
pub const SHELL_CLSID: [(&str, &str); 5] = [
    ("shell:RecycleBinFolder", "{645FF040-5081-101B-9F08-00AA002F954E}"),
    ("shell:MyComputerFolder", "{20D04FE0-3AEA-1069-A2D8-08002B30309D}"),
    ("shell:NetworkPlacesFolder", "{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}"),
    ("shell:UsersFilesFolder", "{59031A47-3F72-44A7-89C5-5595FE6B30EE}"),
    ("shell:ControlPanelFolder", "{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}"),
];
const HIDE_ICON_KEYS: [&str; 2] = [
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel",
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\ClassicStartMenu",
];
const SHIL_EXTRALARGE: i32 = 2;
const SHIL_LARGE: i32 = 0;
const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
const FILE_ATTRIBUTE_TEMPORARY: u32 = 0x100;
const INVALID_FILE_ATTRIBUTES: u32 = 0xffff_ffff;

// 치워 둔 아이콘을 두는 자리. 음수 좌표는 탐색기가 되돌려 놓는 항목이 있어 오른쪽 멀리로 보낸다.
const PARK_X: f64 = 20000.0;

// 지우되 휴지통에 남긴다. 같은 이름이 있으면 바꾸지 않고 이름을 따로 붙인다.
// FOF_SILENT | FOF_RENAMEONCOLLISION | FOF_NOCONFIRMATION | FOF_ALLOWUNDO | FOF_NOERRORUI
pub const RECYCLE_FLAGS: u16 = 0x0004 | 0x0008 | 0x0010 | 0x0040 | 0x0400;

// 무슨 일이 언제 일어났는지 적어 두는 자리. MYDESKBOX_TRACE 가 있을 때만 쓴다.
fn trace(line: &str) {
    let Ok(file) = std::env::var("MYDESKBOX_TRACE") else { return };
    if file.is_empty() {
        return;
    }
    use std::io::Write;
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(file) {
        let _ = writeln!(f, "{:.0} {line}", crate::js::now_ms());
    }
}

fn tracing() -> bool {
    std::env::var("MYDESKBOX_TRACE").map(|v| !v.is_empty()).unwrap_or(false)
}

// ── 상태 ────────────────────────────────────────────────────────────────

#[derive(Default)]
struct WinState {
    homes: BTreeMap<String, (i32, i32)>,
    // 우리가 숨긴 셸 항목의, 숨기기 전 레지스트리 값.
    shell_prev: BTreeMap<String, u32>,
    file_attrs: BTreeMap<String, u32>,
    home_file: Option<String>,
    prepared: bool,
    warned: bool,
    // 탐색기의 '아이콘 자동 정렬'을 우리가 껐다면 true. 끝낼 때 되돌린다.
    turned_off_auto_arrange: bool,
    // '격자에 맞춤' 도 마찬가지 (예전 판만 껐다).
    turned_off_snap_to_grid: bool,
    // 박스를 끄는 동안에는 방금 읽은 목록을 다시 쓴다.
    list_cache: Option<(Instant, Vec<Icon>)>,
    layer_hidden: bool,
    list_frozen: bool,
    // 이번에 우리가 밀어낸 아이콘의 이름. 끝낼 때 적어 둔 자리로 돌려놓는다.
    nudged: BTreeSet<String>,
    claim: Option<isize>,
}

pub struct WinDesktop {
    st: Mutex<WinState>,
}

thread_local! {
    static COM_READY: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

// 셸 그림은 COM 이 준비돼 있어야 얻을 수 있다. 스레드마다 한 번 부른다.
pub fn prepare_com() {
    COM_READY.with(|ready| {
        if !ready.get() {
            ready.set(true);
            unsafe {
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            }
        }
    });
}

fn hwnd_of(n: u64) -> HWND {
    HWND(n as isize as *mut c_void)
}

fn hwnd_num(h: HWND) -> u64 {
    h.0 as isize as u64
}

pub fn class_name(hwnd: HWND) -> String {
    if hwnd.0.is_null() {
        return String::new();
    }
    let mut buf = [0u16; 256];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) };
    if n <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..n as usize])
}

fn decode_utf16(buf: &[u16]) -> String {
    let end = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn key_of(name: &str) -> String {
    name.trim().to_lowercase()
}

fn is_parked(x: f64, y: f64) -> bool {
    // 예전 판에서 음수 자리에 치워 둔 것도 알아본다.
    x >= PARK_X - 1000.0 || x < -1000.0 || y < -1000.0
}

fn sane_point(point: Option<(i32, i32)>) -> Option<(i32, i32)> {
    let p = point?;
    if is_parked(p.0 as f64, p.1 as f64) {
        return None;
    }
    Some(p)
}

fn find_list_in(parent: HWND) -> Option<HWND> {
    if parent.0.is_null() {
        return None;
    }
    unsafe {
        let def_view = FindWindowExW(Some(parent), None, windows::core::w!("SHELLDLL_DefView"), PCWSTR::null()).ok()?;
        FindWindowExW(Some(def_view), None, windows::core::w!("SysListView32"), windows::core::w!("FolderView"))
            .or_else(|_| FindWindowExW(Some(def_view), None, windows::core::w!("SysListView32"), PCWSTR::null()))
            .ok()
    }
}

fn find_def_view() -> Option<HWND> {
    find_list().and_then(|list| unsafe { GetParent(list).ok() })
}

fn find_list() -> Option<HWND> {
    unsafe {
        let progman = FindWindowW(windows::core::w!("Progman"), windows::core::w!("Program Manager"))
            .or_else(|_| FindWindowW(windows::core::w!("Progman"), PCWSTR::null()))
            .unwrap_or_default();
        if let Some(found) = find_list_in(progman) {
            return Some(found);
        }
        let mut previous: Option<HWND> = None;
        loop {
            let worker = FindWindowExW(None, previous, windows::core::w!("WorkerW"), PCWSTR::null()).ok()?;
            previous = Some(worker);
            if let Some(found) = find_list_in(worker) {
                return Some(found);
            }
        }
    }
}

// 탐색기 목록 하나를 붙잡은 동안. 목록에 메시지를 보내려면 탐색기 안에 자리가 있어야 한다.
struct Session {
    list: HWND,
    proc: HANDLE,
    remote: *mut c_void,
}

impl Session {
    fn open() -> Option<Session> {
        let list = find_list()?;
        let mut pid = 0u32;
        unsafe {
            if GetWindowThreadProcessId(list, Some(&mut pid)) == 0 || pid == 0 {
                return None;
            }
            let rights = PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_QUERY_INFORMATION;
            let proc = OpenProcess(rights, false, pid).ok()?;
            let remote = VirtualAllocEx(proc, None, 1024, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
            if remote.is_null() {
                let _ = CloseHandle(proc);
                return None;
            }
            Some(Session { list, proc, remote })
        }
    }

    fn at(&self, offset: usize) -> *mut c_void {
        (self.remote as usize + offset) as *mut c_void
    }

    fn write(&self, offset: usize, bytes: &[u8]) {
        unsafe {
            let _ = WriteProcessMemory(self.proc, self.at(offset), bytes.as_ptr() as *const c_void, bytes.len(), None);
        }
    }

    fn read(&self, offset: usize, out: &mut [u8]) {
        unsafe {
            let _ = ReadProcessMemory(self.proc, self.at(offset), out.as_mut_ptr() as *mut c_void, out.len(), None);
        }
    }

    fn send(&self, msg: u32, w: usize, l: isize) -> isize {
        unsafe { SendMessageW(self.list, msg, Some(WPARAM(w)), Some(LPARAM(l))).0 }
    }

    fn count(&self) -> usize {
        self.send(LVM_GETITEMCOUNT, 0, 0).max(0) as usize
    }

    fn read_text(&self, index: usize) -> String {
        let text_at = self.remote as u64 + 128;
        let mut item = [0u8; 88];
        item[8..12].copy_from_slice(&0i32.to_le_bytes());
        item[24..32].copy_from_slice(&text_at.to_le_bytes());
        item[32..36].copy_from_slice(&260i32.to_le_bytes());
        self.write(0, &item);
        self.send(LVM_GETITEMTEXTW, index, self.remote as isize);
        let mut buf = [0u8; 520];
        self.read(128, &mut buf);
        let units: Vec<u16> = buf.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        decode_utf16(&units)
    }

    fn read_pos(&self, index: usize) -> (i32, i32) {
        self.write(768, &[0u8; 8]);
        self.send(LVM_GETITEMPOSITION, index, self.at(768) as isize);
        let mut buf = [0u8; 8];
        self.read(768, &mut buf);
        (i32::from_le_bytes(buf[0..4].try_into().unwrap()), i32::from_le_bytes(buf[4..8].try_into().unwrap()))
    }

    fn write_pos(&self, index: i64, x: i32, y: i32) {
        let mut buf = [0u8; 8];
        buf[0..4].copy_from_slice(&x.to_le_bytes());
        buf[4..8].copy_from_slice(&y.to_le_bytes());
        self.write(768, &buf);
        self.send(LVM_SETITEMPOSITION32, index as usize, self.at(768) as isize);
    }

    fn read_all(&self) -> Vec<Icon> {
        let limit = self.count().min(400);
        let mut items = Vec::new();
        for index in 0..limit {
            let name = self.read_text(index);
            let (x, y) = self.read_pos(index);
            if name.is_empty() {
                continue;
            }
            items.push(Icon { index: index as i64, name, x: x as f64, y: y as f64 });
        }
        items
    }

    // 골라 둔 항목의 번호. 고른 것만 이어서 물어보므로 아이콘이 많아도 싸다.
    fn read_picked(&self) -> Vec<i64> {
        let mut out = Vec::new();
        let mut at: i64 = -1;
        for _ in 0..1000 {
            let from = if at < 0 { usize::MAX } else { at as usize };
            let next = self.send(LVM_GETNEXTITEM, from, LVNI_SELECTED) as i64;
            if next < 0 || next <= at {
                break;
            }
            out.push(next);
            at = next;
        }
        out
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            let _ = VirtualFreeEx(self.proc, self.remote, 0, MEM_RELEASE);
            let _ = CloseHandle(self.proc);
        }
    }
}

// 박스를 끄는 동안 쓰는 빠른 길. 좌표를 lParam 에 담으므로 PostMessage 로 던져 두고 갈 수 있다.
fn post_pos(list: HWND, index: i64, x: i32, y: i32) -> bool {
    if !(0..=32767).contains(&x) || !(0..=32767).contains(&y) {
        return false;
    }
    let l = (((y as u32 & 0xffff) << 16) | (x as u32 & 0xffff)) as isize;
    unsafe { PostMessageW(Some(list), LVM_SETITEMPOSITION, WPARAM(index as usize), LPARAM(l)).is_ok() }
}

fn style_of(hwnd: HWND) -> u32 {
    unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) as u32 }
}

fn ex_style_of_list(list: HWND) -> u32 {
    unsafe { SendMessageW(list, LVM_GETEXTENDEDLISTVIEWSTYLE, None, None).0 as u32 }
}

fn win_ex_style(hwnd: HWND) -> u32 {
    unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 }
}

fn read_hide(clsid: &str) -> u32 {
    for key in HIDE_ICON_KEYS {
        if let Some(v) = reg::read_dword(HKCU, key, clsid) {
            return v;
        }
    }
    0
}

fn write_hide(clsid: &str, value: u32) {
    for key in HIDE_ICON_KEYS {
        reg::write_dword(HKCU, key, clsid, value);
    }
}

// 셸 아이콘을 감추거나 되살린 뒤, 바탕화면 보기에 '새로 고침'만 보낸다.
// SHCNE_ASSOCCHANGED 는 쓰지 않는다. 그 알림 하나에 바탕화면 그림이 모두 사라진다.
pub fn refresh_shell_icons() {
    if let Some(view) = find_def_view() {
        unsafe {
            SendMessageTimeoutW(view, WM_COMMAND, WPARAM(DESKTOP_REFRESH), LPARAM(0), SMTO_NORMAL, 200, None);
        }
    }
}

fn notify_item(path: &str) {
    let w = wide(path);
    unsafe { SHChangeNotify(SHCNE_ID(0x0000_2000), SHCNF_FLAGS(0x0005 | 0x1000), Some(w.as_ptr() as *const c_void), None) };
}

fn file_attributes(path: &str) -> u32 {
    let w = wide(path);
    unsafe { GetFileAttributesW(PCWSTR(w.as_ptr())) }
}

fn set_file_attributes(path: &str, attrs: u32) -> bool {
    let w = wide(path);
    unsafe { SetFileAttributesW(PCWSTR(w.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(attrs)).is_ok() }
}

fn normalize_win(path: &str) -> String {
    path.replace('/', "\\")
}

// ── 그림 ────────────────────────────────────────────────────────────────

pub fn bitmap_of(icon: HICON) -> Option<Picture> {
    unsafe {
        let mut info = ICONINFO::default();
        GetIconInfo(icon, &mut info).ok()?;
        let color = info.hbmColor;
        let mask = info.hbmMask;
        let result = (|| {
            let mut shape = BITMAP::default();
            if GetObjectW(HGDIOBJ(color.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut shape as *mut _ as *mut c_void)) == 0 {
                return None;
            }
            let (width, height) = (shape.bmWidth, shape.bmHeight);
            if width <= 0 || height <= 0 {
                return None;
            }
            let mut header = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height,
                    biPlanes: 1,
                    biBitCount: 32,
                    ..Default::default()
                },
                ..Default::default()
            };
            let hdc = GetDC(None);
            let mut data = vec![0u8; (width * height * 4) as usize];
            let got = GetDIBits(hdc, color, 0, height as u32, Some(data.as_mut_ptr() as *mut c_void), &mut header, DIB_RGB_COLORS);
            if got == 0 {
                ReleaseDC(None, hdc);
                return None;
            }
            let has_alpha = data.chunks_exact(4).any(|px| px[3] != 0);
            // 옛 아이콘은 알파가 없다. 이럴 때는 마스크 그림으로 투명한 곳을 정한다.
            if !has_alpha {
                let mut bits = vec![0u8; (width * height * 4) as usize];
                let ok = GetDIBits(hdc, mask, 0, height as u32, Some(bits.as_mut_ptr() as *mut c_void), &mut header, DIB_RGB_COLORS) != 0;
                for i in 0..(width * height) as usize {
                    data[i * 4 + 3] = if ok && bits[i * 4] != 0 { 0 } else { 255 };
                }
            }
            ReleaseDC(None, hdc);
            Picture::from_bgra(width as u32, height as u32, data)
        })();
        if !color.0.is_null() {
            let _ = DeleteObject(HGDIOBJ(color.0));
        }
        if !mask.0.is_null() {
            let _ = DeleteObject(HGDIOBJ(mask.0));
        }
        result
    }
}

fn icon_from_index(index: i32) -> Option<Picture> {
    unsafe {
        let list: IImageList = SHGetImageList(SHIL_EXTRALARGE).or_else(|_| SHGetImageList(SHIL_LARGE)).ok()?;
        let icon = list.GetIcon(index, ILD_TRANSPARENT.0).ok()?;
        let shot = bitmap_of(icon);
        let _ = DestroyIcon(icon);
        shot
    }
}

fn icon_from_file(file: &str, index: i32, size: i32) -> Option<Picture> {
    let mut name = [0u16; 260];
    for (i, u) in file.encode_utf16().take(259).enumerate() {
        name[i] = u;
    }
    let mut icons = [HICON::default()];
    unsafe {
        let got = PrivateExtractIconsW(&name, index, size, size, Some(&mut icons), None, 0);
        if got == 0 || got == u32::MAX || icons[0].0.is_null() {
            return None;
        }
        let shot = bitmap_of(icons[0]);
        let _ = DestroyIcon(icons[0]);
        shot
    }
}

// 레지스트리에 적힌 "imageres.dll,-55" 같은 줄을 파일과 그림 번호로 가른다.
pub fn parse_icon_spec(text: &str) -> Option<(String, i32)> {
    let mut raw = text.trim().to_string();
    // %이름% 을 펼친다. 없는 이름은 그대로 둔다.
    let mut out = String::new();
    let mut rest = raw.as_str();
    while let Some(open) = rest.find('%') {
        let after = &rest[open + 1..];
        let Some(close) = after.find('%') else { break };
        out.push_str(&rest[..open]);
        let name = &after[..close];
        match std::env::var(name) {
            Ok(v) => out.push_str(&v),
            Err(_) => out.push_str(&format!("%{name}%")),
        }
        rest = &after[close + 1..];
    }
    out.push_str(rest);
    raw = out;
    let (mut file, mut index) = (raw.clone(), 0);
    if let Some(stripped) = raw.strip_prefix('"') {
        if let Some(end) = stripped.find('"') {
            if end > 0 {
                file = stripped[..end].to_string();
                let tail = &stripped[end + 1..];
                if let Some(comma) = tail.find(',') {
                    index = tail[comma + 1..].trim().parse::<f64>().map(|n| n as i32).unwrap_or(0);
                }
            }
        }
    } else if let Some(comma) = raw.rfind(',') {
        if comma > 0 {
            file = raw[..comma].trim().to_string();
            if let Ok(n) = raw[comma + 1..].trim().parse::<f64>() {
                index = n as i32;
            }
        }
    }
    (!file.is_empty()).then_some((file, index))
}

fn recycle_icon_spec(full: bool) -> (String, i32) {
    let clsid = "{645FF040-5081-101B-9F08-00AA002F954E}";
    let keys = [
        (HKCU, format!(r"Software\Microsoft\Windows\CurrentVersion\Explorer\CLSID\{clsid}\DefaultIcon")),
        (HKCR, format!(r"CLSID\{clsid}\DefaultIcon")),
    ];
    for (root, key) in keys {
        if let Some(data) = reg::read_string(root, &key, if full { "full" } else { "empty" }) {
            if let Some(spec) = parse_icon_spec(&data) {
                return spec;
            }
        }
    }
    let system = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    (join(&join(&system, "System32"), "imageres.dll"), if full { -54 } else { -55 })
}

fn decode_name(arr: &[u16]) -> String {
    decode_utf16(arr)
}

struct ShellInfo {
    name: String,
    icon_index: i32,
}

// 파일이 아닌 셸 항목의 이름과 그림 번호를 얻는다.
fn shell_info(shell_path: &str) -> Option<ShellInfo> {
    prepare_com();
    let w = wide(shell_path);
    unsafe {
        let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        SHParseDisplayName(PCWSTR(w.as_ptr()), None, &mut pidl, 0, None).ok()?;
        if pidl.is_null() {
            return None;
        }
        let mut info = SHFILEINFOW::default();
        let flags = SHGFI_PIDL | SHGFI_DISPLAYNAME | SHGFI_SYSICONINDEX;
        let got = SHGetFileInfoW(
            PCWSTR(pidl as *const u16),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        );
        CoTaskMemFree(Some(pidl as *const c_void));
        if got == 0 {
            return None;
        }
        Some(ShellInfo { name: decode_name(&info.szDisplayName), icon_index: info.iIcon })
    }
}

fn file_info(path: &str, flags: SHGFI_FLAGS) -> Option<SHFILEINFOW> {
    prepare_com();
    let w = wide(&normalize_win(path));
    let mut info = SHFILEINFOW::default();
    let got = unsafe {
        SHGetFileInfoW(PCWSTR(w.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(0), Some(&mut info), std::mem::size_of::<SHFILEINFOW>() as u32, flags)
    };
    (got != 0).then_some(info)
}

fn shell_name_table() -> Vec<Entry> {
    SHELL_ITEMS
        .iter()
        .filter_map(|p| shell_info(p).filter(|i| !i.name.is_empty()).map(|i| Entry { name: i.name, path: p.to_string() }))
        .collect()
}

// 바로가기가 가리키는 것 (Electron 의 shell.readShortcutLink).
pub fn read_shortcut(path: &str) -> Option<Link> {
    prepare_com();
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = link.cast().ok()?;
        let w = wide(path);
        file.Load(PCWSTR(w.as_ptr()), STGM_READ).ok()?;
        let mut target = [0u16; 1024];
        let _ = link.GetPath(&mut target, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32);
        let mut icon = [0u16; 1024];
        let mut index = 0i32;
        let _ = link.GetIconLocation(&mut icon, &mut index);
        let target = decode_utf16(&target);
        if target.is_empty() {
            return None;
        }
        // 펼치지 않은 %SystemRoot% 같은 것은 펼친다.
        let target = expand(&target);
        Some(Link { target, icon: decode_utf16(&icon), icon_index: index })
    }
}

fn expand(text: &str) -> String {
    use windows::Win32::System::Environment::ExpandEnvironmentStringsW;
    if !text.contains('%') {
        return text.to_string();
    }
    let w = wide(text);
    let mut buf = vec![0u16; 2048];
    let n = unsafe { ExpandEnvironmentStringsW(PCWSTR(w.as_ptr()), Some(&mut buf)) };
    if n == 0 || n as usize > buf.len() {
        return text.to_string();
    }
    decode_utf16(&buf)
}

// ── 창 판단 ─────────────────────────────────────────────────────────────

fn window_pid(hwnd: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid
}

fn rect_has(hwnd: HWND, p: POINT) -> bool {
    let mut r = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut r) }.is_err() {
        return false;
    }
    p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
}

fn is_cloaked(hwnd: HWND) -> bool {
    let mut value: u32 = 0;
    unsafe { DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut value as *mut _ as *mut c_void, 4).is_ok() && value != 0 }
}

// 끄는 그림 창은 항상 커서 위에 있다. 우리 창, 마우스를 통과시키는 창, 숨겨 둔 창은 건너뛴다.
fn visible_top_at(p: POINT, mine: &HashSet<u64>) -> Option<HWND> {
    let me = unsafe { GetCurrentProcessId() };
    let mut cur = unsafe { GetWindow(GetDesktopWindow(), GW_CHILD).ok() };
    for _ in 0..80 {
        let Some(h) = cur else { break };
        let ours = mine.contains(&hwnd_num(h)) || window_pid(h) == me;
        let flags = SurfaceFlags {
            ours,
            visible: unsafe { IsWindowVisible(h).as_bool() },
            cloaked: is_cloaked(h),
            transparent: win_ex_style(h) & WS_EX_TRANSPARENT != 0,
        };
        if deskpick::is_surface_window(&flags) && rect_has(h, p) {
            return Some(h);
        }
        cur = unsafe { GetWindow(h, GW_HWNDNEXT).ok() };
    }
    None
}

// 자식 창이 잡혀도 우리 박스인지 알 수 있게 부모까지 올라간다.
fn top_window(hwnd: HWND, mine: &HashSet<u64>) -> (bool, HWND) {
    let mut cur = hwnd;
    let mut top = hwnd;
    let mut seen = HashSet::new();
    for _ in 0..10 {
        let key = hwnd_num(cur);
        if key == 0 || !seen.insert(key) {
            break;
        }
        top = cur;
        if mine.contains(&key) {
            return (true, cur);
        }
        let mut next = unsafe { GetParent(cur).unwrap_or_default() };
        if next.0.is_null() || hwnd_num(next) == key {
            next = unsafe { GetAncestor(hwnd, GA_ROOT) };
            if next.0.is_null() || hwnd_num(next) == key {
                break;
            }
        }
        cur = next;
    }
    (mine.contains(&hwnd_num(top)), top)
}

struct Surface {
    class_name: String,
    ours: bool,
}

fn surface_at(point: Point, own: &[u64]) -> Option<Surface> {
    if !point.x.is_finite() || !point.y.is_finite() {
        return None;
    }
    let phys = screen::dip_to_phys(point);
    let p = POINT { x: round(phys.x) as i32, y: round(phys.y) as i32 };
    let mine: HashSet<u64> = own.iter().copied().filter(|n| *n != 0).collect();
    let hwnd = visible_top_at(p, &mine).or_else(|| {
        let h = unsafe { WindowFromPoint(p) };
        (!h.0.is_null()).then_some(h)
    })?;
    let (ours, top) = top_window(hwnd, &mine);
    let pid = match window_pid(top) {
        0 => window_pid(hwnd),
        n => n,
    };
    Some(Surface { class_name: class_name(top), ours: ours || (pid != 0 && pid == unsafe { GetCurrentProcessId() }) })
}

fn desktop_at(p: POINT) -> bool {
    let under = unsafe { WindowFromPoint(p) };
    deskpick::is_desktop_target(&class_name(under), &class_name(unsafe { GetForegroundWindow() }))
}

pub fn mouse_down() -> bool {
    unsafe { (GetAsyncKeyState(0x01) as u16 & 0x8000) != 0 }
}

fn cursor_pos() -> Option<POINT> {
    let mut p = POINT::default();
    unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut p).ok()? };
    Some(p)
}

fn to_dip_point(p: POINT) -> Point {
    let dip = screen::phys_to_dip(Point::new(p.x as f64, p.y as f64));
    Point::new(round(dip.x), round(dip.y))
}

fn to_dip_rect(r: &DragRect) -> Rect {
    let tl = screen::phys_to_dip(Point::new(r.x, r.y));
    let br = screen::phys_to_dip(Point::new(r.x + r.width, r.y + r.height));
    Rect::new(round(tl.x), round(tl.y), round(br.x - tl.x), round(br.y - tl.y))
}

// 아이콘을 놓을 수 있는 넓이. 작업 표시줄을 뺀 자리다 (물리 픽셀).
fn desktop_area() -> Rect {
    match screen::primary() {
        Some(m) => screen::dip_rect_to_phys(m.dip_work),
        None => Rect::new(0.0, 0.0, 1920.0, 1080.0),
    }
}

fn default_spot(index: usize) -> (i32, i32) {
    let col = (index % 12) as f64;
    let row = (index / 12) as f64;
    match screen::primary() {
        Some(m) => {
            let phys = screen::dip_to_phys(Point::new(m.dip_work.x + 24.0 + col * 90.0, m.dip_work.y + 24.0 + row * 100.0));
            (round(phys.x) as i32, round(phys.y) as i32)
        }
        None => (40 + col as i32 * 90, 40 + row as i32 * 100),
    }
}

// ── 구현 ────────────────────────────────────────────────────────────────

impl WinDesktop {
    pub fn new() -> Self {
        Self { st: Mutex::new(WinState::default()) }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, WinState> {
        self.st.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn guard<T: Default>(&self, what: &str, f: impl FnOnce() -> Option<T>) -> T {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
            Ok(v) => v.unwrap_or_default(),
            Err(_) => {
                let mut st = self.lock();
                if !st.warned {
                    st.warned = true;
                    eprintln!("바탕화면 아이콘 자리를 읽지 못했습니다. ({what})");
                }
                T::default()
            }
        }
    }

    fn persist_homes(st: &WinState) {
        let Some(file) = &st.home_file else { return };
        let homes: serde_json::Map<String, Value> =
            st.homes.iter().map(|(k, (x, y))| (k.clone(), json!({ "x": x, "y": y }))).collect();
        let body = json!({
            "version": 3,
            "autoArrange": st.turned_off_auto_arrange,
            "snapToGrid": st.turned_off_snap_to_grid,
            "homes": homes,
            "nudged": st.nudged.iter().collect::<Vec<_>>(),
            "shellPrev": st.shell_prev,
            "fileAttrs": st.file_attrs,
        });
        if let Some(dir) = std::path::Path::new(file).parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(file, body.to_string());
    }

    fn prepare(st: &mut WinState) {
        if st.prepared {
            return;
        }
        st.prepared = true;
        unsafe {
            if let Ok(progman) = FindWindowW(windows::core::w!("Progman"), PCWSTR::null()) {
                SendMessageTimeoutW(progman, 0x052c, WPARAM(0), LPARAM(0), SMTO_NORMAL, 800, None);
            }
        }
    }

    fn list(&self) -> Option<HWND> {
        Self::prepare(&mut self.lock());
        find_list()
    }

    fn session(&self) -> Option<Session> {
        Self::prepare(&mut self.lock());
        Session::open()
    }

    // 자동 정렬이 켜져 있으면 탐색기가 아이콘 자리를 되돌려 놓는다. 창 스타일에서 지운다.
    // 격자에 맞춤(LVS_EX_SNAPTOGRID)은 건드리지 않는다. 그 비트를 보내면 치운 아이콘이 튀어나온다.
    fn manual_arrange(st: &mut WinState, list: HWND) {
        let style = style_of(list);
        let auto_on = style & LVS_AUTOARRANGE != 0;
        if auto_on && !st.turned_off_auto_arrange {
            st.turned_off_auto_arrange = true;
            Self::persist_homes(st);
        }
        if auto_on {
            unsafe { SetWindowLongPtrW(list, GWL_STYLE, (style & !LVS_AUTOARRANGE) as isize) };
        }
    }

    fn wants_auto_arrange(st: &WinState, list: HWND) -> bool {
        st.turned_off_auto_arrange || style_of(list) & LVS_AUTOARRANGE != 0
    }

    // 예전 판이 넓혀 둔 목록 창만 제자리로 돌려놓는다. 좁히기만 하고, 넓히지는 않는다.
    // LVM_SETWORKAREAS 는 보내지 않는다. 그 메시지 하나에 바탕화면 아이콘 그림이 모두 사라진다.
    fn normalize_list(&self) {
        let Some(list) = self.list() else { return };
        self.show_layer(true);
        self.restore_shell_icons();
        unsafe {
            let Ok(parent) = GetParent(list) else { return };
            let mut rect = RECT::default();
            if GetClientRect(parent, &mut rect).is_err() {
                return;
            }
            let (w, h) = (rect.right - rect.left, rect.bottom - rect.top);
            if w <= 0 || h <= 0 {
                return;
            }
            let mut now = RECT::default();
            if GetClientRect(list, &mut now).is_err() {
                return;
            }
            if now.right - now.left <= w && now.bottom - now.top <= h {
                return;
            }
            trace(&format!("앞선 판이 넓혀 둔 목록 창을 {w}x{h} 로 좁힘"));
            let _ = SetWindowPos(list, None, 0, 0, w, h, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
    }

    fn restore_arrange(&self) {
        self.normalize_list();
        let mut st = self.lock();
        if !st.turned_off_auto_arrange && !st.turned_off_snap_to_grid {
            return;
        }
        let Some(list) = find_list() else { return };
        // 예전 판이 꺼 둔 격자에 맞춤을 한 번만 되돌린다.
        if st.turned_off_snap_to_grid {
            unsafe {
                SendMessageW(
                    list,
                    LVM_SETEXTENDEDLISTVIEWSTYLE,
                    Some(WPARAM(LVS_EX_SNAPTOGRID as usize)),
                    Some(LPARAM(LVS_EX_SNAPTOGRID as isize)),
                )
            };
            if ex_style_of_list(list) & LVS_EX_SNAPTOGRID != 0 {
                st.turned_off_snap_to_grid = false;
            }
        }
        if st.turned_off_auto_arrange {
            let style = style_of(list);
            if style & LVS_AUTOARRANGE == 0 {
                unsafe { SetWindowLongPtrW(list, GWL_STYLE, (style | LVS_AUTOARRANGE) as isize) };
            }
            // 정말 켜졌는지 확인한 뒤에만 기록을 지운다.
            if style_of(list) & LVS_AUTOARRANGE != 0 {
                st.turned_off_auto_arrange = false;
            }
        }
        Self::persist_homes(&st);
    }

    // 바탕화면에 남겨 둘 아이콘이 하나도 없으면 아이콘 층을 통째로 감춘다.
    fn show_layer(&self, on: bool) -> bool {
        let Some(list) = self.list() else { return false };
        let now = unsafe { IsWindowVisible(list).as_bool() };
        let mut st = self.lock();
        if now == on {
            st.layer_hidden = !on;
            return false;
        }
        trace(if on { "아이콘 층을 보인다" } else { "아이콘 층을 감춘다" });
        unsafe {
            let _ = ShowWindow(list, if on { SW_SHOWNA } else { SW_HIDE });
        }
        st.layer_hidden = !on;
        true
    }

    fn list_redraw(&self, on: bool) {
        let Some(list) = self.list() else { return };
        trace(if on { "다시 그리기 켬" } else { "다시 그리기 끔" });
        unsafe {
            SendMessageTimeoutW(list, WM_SETREDRAW, WPARAM(on as usize), LPARAM(0), SMTO_NORMAL, 50, None);
        }
        self.lock().list_frozen = !on;
        if on {
            unsafe {
                let _ = InvalidateRect(Some(list), None, true);
                let _ = UpdateWindow(list);
            }
        }
    }

    // 앱이 숨긴 셸 아이콘을 바탕화면에 다시 나타낸다.
    fn restore_shell_icons(&self) {
        let mut st = self.lock();
        let mut changed = false;
        for (shell_path, clsid) in SHELL_CLSID {
            let prev = if st.shell_prev.get(shell_path) == Some(&1) { 1 } else { 0 };
            if read_hide(clsid) != prev {
                write_hide(clsid, prev);
                changed = true;
            }
            if st.shell_prev.remove(shell_path).is_some() {
                changed = true;
            }
        }
        if !changed {
            return;
        }
        drop(st);
        refresh_shell_icons();
        Self::persist_homes(&self.lock());
    }

    fn reveal(st: &mut WinState, path: &str) -> bool {
        if path.is_empty() || path.starts_with("shell:") {
            return false;
        }
        let saved = st.file_attrs.remove(path);
        let attr = file_attributes(path);
        if attr == INVALID_FILE_ATTRIBUTES {
            return false;
        }
        let next = saved.unwrap_or(attr & !(FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM));
        if next == attr {
            return false;
        }
        set_file_attributes(path, next)
    }

    fn reveal_stored(&self) {
        let mut st = self.lock();
        let paths: Vec<String> = st.file_attrs.keys().cloned().collect();
        let mut changed = false;
        for p in paths {
            if Self::reveal(&mut st, &p) {
                notify_item(&p);
                changed = true;
            }
        }
        if changed {
            Self::persist_homes(&st);
        }
    }

    // 옮길 것이 하나도 없으면 탐색기 설정을 건드리지 않는다.
    fn apply_moves(&self, session: &Session, moves: &[Move], keep_arrange: bool, live: bool) -> bool {
        if moves.is_empty() {
            return false;
        }
        let mut st = self.lock();
        // 자리를 한 번 옮기려고 자동 정렬을 끄면, 그 뒤로는 아이콘을 끌어도 자리가 고정된다.
        if !keep_arrange {
            Self::manual_arrange(&mut st, session.list);
        }
        for m in moves {
            let (x, y) = (m.x as i32, m.y as i32);
            if live && post_pos(session.list, m.index, x, y) {
                continue;
            }
            session.write_pos(m.index, x, y);
        }
        // 옮긴 자리는 읽어 둔 목록에도 반영한다. 끄는 동안 같은 것을 되풀이해 옮기지 않는다.
        if let Some((_, items)) = st.list_cache.as_mut() {
            for m in moves {
                if let Some(found) = items.iter_mut().find(|i| i.index == m.index) {
                    found.x = m.x;
                    found.y = m.y;
                }
            }
        }
        // 자리를 바꾼 뒤에는 바탕화면을 다시 그리게 한다. 끄는 동안에는 알리기만 한다.
        if !st.list_frozen {
            unsafe {
                let _ = InvalidateRect(Some(session.list), None, true);
                if !live {
                    let _ = UpdateWindow(session.list);
                }
            }
        }
        if !live {
            Self::persist_homes(&st);
        }
        true
    }

    fn read_maybe_cached(&self, session: &Session, live: bool) -> Vec<Icon> {
        if live {
            if let Some((at, items)) = &self.lock().list_cache {
                if at.elapsed() < Duration::from_millis(900) {
                    return items.clone();
                }
            }
        }
        let items = session.read_all();
        self.lock().list_cache = Some((Instant::now(), items.clone()));
        items
    }

    // 탐색기가 쓰는 한 칸의 크기. 못 물으면 None.
    fn item_spacing(list: HWND) -> Option<(f64, f64)> {
        let packed = unsafe { SendMessageW(list, LVM_GETITEMSPACING, Some(WPARAM(0)), Some(LPARAM(0))).0 };
        if packed <= 0 {
            return None;
        }
        let packed = packed as u64;
        let cx = (packed & 0xffff) as f64;
        let cy = ((packed >> 16) & 0xffff) as f64;
        if cx < 16.0 || cy < 16.0 {
            return None;
        }
        Some((cx, cy))
    }

    // 박스와 아이콘이 함께 설 격자. 칸 크기는 탐색기에게 묻고, 원점은 위상만 쓴다.
    fn lattice_of(list: HWND, listed: &[Icon]) -> Lattice {
        let points: Vec<Point> = listed.iter().map(|i| Point::new(i.x, i.y)).collect();
        let measured = deskgrid::metrics(&points);
        let (dx, dy) = Self::item_spacing(list).unwrap_or((measured.dx, measured.dy));
        Lattice { dx, dy, x0: deskgrid::wrap(measured.x0, dx), y0: deskgrid::wrap(measured.y0, dy) }
    }

    // 밀어냈던 아이콘을 제자리로 들인다. 박스가 지나간 자리마다 구멍이 남지 않게 한다.
    fn homecoming(st: &mut WinState, icons: &[Icon], walls: &[Rect], grid: &Lattice, moves: &[Move]) -> Vec<Move> {
        if st.nudged.is_empty() {
            return vec![];
        }
        let going: BTreeMap<i64, &Move> = moves.iter().map(|m| (m.index, m)).collect();
        let mut taken: HashSet<(i64, i64)> = HashSet::new();
        for icon in icons {
            let (x, y) = going.get(&icon.index).map(|m| (m.x, m.y)).unwrap_or((icon.x, icon.y));
            taken.insert((x as i64, y as i64));
        }
        let mut back = Vec::new();
        for icon in icons {
            if going.contains_key(&icon.index) {
                continue;
            }
            let key = key_of(&icon.name);
            if !st.nudged.contains(&key) {
                continue;
            }
            let Some(&(hx, hy)) = st.homes.get(&key) else { continue };
            let (hx, hy) = (hx as f64, hy as f64);
            if hx == icon.x && hy == icon.y {
                st.nudged.remove(&key);
                continue;
            }
            if deskgrid::blocked(deskgrid::cell_of(Point::new(hx, hy), grid), grid, walls) {
                continue;
            }
            if taken.contains(&(hx as i64, hy as i64)) {
                continue;
            }
            taken.remove(&(icon.x as i64, icon.y as i64));
            taken.insert((hx as i64, hy as i64));
            st.nudged.remove(&key);
            back.push(Move { index: icon.index, x: hx, y: hy });
        }
        if !back.is_empty() {
            trace(&format!("비켜 줬던 아이콘 {}개를 제자리로 들인다", back.len()));
        }
        back
    }

    // 치워 둔 아이콘을 모두 원래 자리로 돌려놓는다.
    fn home_all(&self) -> bool {
        self.show_layer(true);
        self.guard("home_all", || {
            let session = self.session()?;
            let listed = session.read_all();
            let mut moves = Vec::new();
            let mut spot = 0;
            {
                let mut st = self.lock();
                for icon in &listed {
                    let key = key_of(&icon.name);
                    // 화면 밖에 치워 둔 것은 적어 둔 자리로, 없으면 화면 안 빈 자리로 들인다.
                    if is_parked(icon.x, icon.y) {
                        let home = sane_point(st.homes.get(&key).copied()).unwrap_or_else(|| default_spot(spot));
                        spot += 1;
                        moves.push(Move { index: icon.index, x: home.0 as f64, y: home.1 as f64 });
                        continue;
                    }
                    // 박스가 가려서 우리가 옆으로 밀어낸 것도 제자리로 돌려놓는다.
                    if !st.nudged.contains(&key) {
                        continue;
                    }
                    let Some(home) = sane_point(st.homes.get(&key).copied()) else { continue };
                    if icon.x as i32 == home.0 && icon.y as i32 == home.1 {
                        continue;
                    }
                    moves.push(Move { index: icon.index, x: home.0 as f64, y: home.1 as f64 });
                }
                st.nudged.clear();
            }
            Some(self.apply_moves(&session, &moves, false, false))
        })
    }

    // 아이콘에 적힌 글로 파일을 찾는다. 같은 글이 여럿이면 몇 번째 아이콘인지로 짝짓는다.
    fn item_from_tables(icon: &Icon, shells: &[Entry], files: &[FileEntry], listed: &[Icon]) -> Option<Entry> {
        if icon.name.is_empty() {
            return None;
        }
        if let Some(shell) = shells.iter().find(|s| same_name(&icon.name, &s.name)) {
            return Some(shell.clone());
        }
        let hits = match_desktop_entries(&icon.name, files);
        if hits.is_empty() {
            return None;
        }
        let found = if hits.len() == 1 { Some(hits[0]) } else { same_label_rank(&hits, icon, listed) };
        found.map(|f| Entry { name: f.name.clone(), path: f.path.clone() })
    }

    // 커서 아래의 아이콘과, 그것과 함께 골라 둔 아이콘들.
    fn drag_group(&self, pos: POINT) -> Option<(Icon, Option<Entry>, Vec<Entry>)> {
        let session = self.session()?;
        let listed = session.read_all();
        let icon = deskpick::icon_at(&listed, Point::new(pos.x as f64, pos.y as f64))?.clone();
        let shells = shell_name_table();
        let files = super::files::list_desktop_files(&super::files::desktop_entries(&self.desktop_directories()));
        let item = Self::item_from_tables(&icon, &shells, &files, &listed);
        let picked = session.read_picked();
        let group: Vec<&Icon> = if picked.contains(&icon.index) {
            listed.iter().filter(|one| picked.contains(&one.index)).collect()
        } else {
            vec![&icon]
        };
        let mut items = Vec::new();
        let mut seen = HashSet::new();
        // 커서 아래의 것을 맨 앞에 둔다. 놓는 자리는 그것으로 잰다.
        let mut order: Vec<&Icon> = Vec::new();
        if item.is_some() {
            order.push(&icon);
        }
        order.extend(group);
        for (n, one) in order.iter().enumerate() {
            let found = if n == 0 && item.is_some() { item.clone() } else { Self::item_from_tables(one, &shells, &files, &listed) };
            let Some(found) = found else { continue };
            if !seen.insert(found.path.clone()) {
                continue;
            }
            items.push(found);
        }
        Some((icon, item, items))
    }

    fn item_for_icon(&self, name: &str) -> Option<Entry> {
        let listed = self.session().map(|s| s.read_all()).unwrap_or_default();
        let icon = listed.iter().find(|i| i.name == name).cloned().unwrap_or(Icon { index: -1, name: name.into(), x: 0.0, y: 0.0 });
        let files = super::files::list_desktop_files(&super::files::desktop_entries(&self.desktop_directories()));
        Self::item_from_tables(&icon, &shell_name_table(), &files, &listed)
    }

    fn cursor_on_icon(&self, pos: POINT) -> bool {
        let listed = self.session().map(|s| s.read_all()).unwrap_or_default();
        deskpick::icon_at(&listed, Point::new(pos.x as f64, pos.y as f64)).is_some()
    }

    fn listed(&self) -> Vec<Icon> {
        self.session().map(|s| s.read_all()).unwrap_or_default()
    }

    // 살펴보기용 (tools/icon-check.js 가 --icon-list 로 부른다).
    pub fn debug_list(&self) -> Vec<Icon> {
        self.listed()
    }

    fn recycle_bin_icon(&self) -> Option<Picture> {
        let full = self.recycle_count() > 0;
        let (file, index) = recycle_icon_spec(full);
        [256, 48, 32].iter().find_map(|size| icon_from_file(&file, index, *size))
    }
}

// 같은 글로 보이는 아이콘이 여럿이다. 몇 번째 아이콘인지로 후보를 고른다.
// 아이콘 수와 파일 수가 맞을 때에만 짝지운다. 엉뚱한 파일을 옮기는 것보다 낫다.
fn same_label_rank<'a>(hits: &[&'a FileEntry], icon: &Icon, listed: &[Icon]) -> Option<&'a FileEntry> {
    if listed.is_empty() {
        return None;
    }
    let text = icon.name.trim().to_lowercase();
    let mut same: Vec<&Icon> = listed.iter().filter(|one| one.name.trim().to_lowercase() == text).collect();
    same.sort_by_key(|one| one.index);
    if same.len() != hits.len() {
        return None;
    }
    let rank = same.iter().position(|one| one.index == icon.index)?;
    let mut sorted: Vec<&FileEntry> = hits.to_vec();
    sorted.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    sorted.get(rank).copied()
}

// localeCompare(..., { numeric: true }) 와 비슷하게: 숫자는 값으로, 나머지는 대소문자 없이.
fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, _) => return std::cmp::Ordering::Less,
            (_, None) => return std::cmp::Ordering::Greater,
            (Some(c), Some(d)) if c.is_ascii_digit() && d.is_ascii_digit() => {
                let mut n = String::new();
                while let Some(c) = x.peek().copied().filter(char::is_ascii_digit) {
                    n.push(c);
                    x.next();
                }
                let mut m = String::new();
                while let Some(d) = y.peek().copied().filter(char::is_ascii_digit) {
                    m.push(d);
                    y.next();
                }
                let order = n.parse::<u128>().unwrap_or(0).cmp(&m.parse::<u128>().unwrap_or(0));
                if order != std::cmp::Ordering::Equal {
                    return order;
                }
            }
            (Some(c), Some(d)) => {
                let order = c.to_lowercase().cmp(d.to_lowercase());
                if order != std::cmp::Ordering::Equal {
                    return order;
                }
                x.next();
                y.next();
            }
        }
    }
}

impl Desktop for WinDesktop {
    fn native_icons(&self) -> bool {
        true
    }

    fn init(&self, dir: &str) {
        self.lock().home_file = Some(join(dir, "icon-homes.json"));
        // 앞선 판이 넓혀 둔 채 끝났을 수 있다. 먼저 제자리로 돌려놓는다.
        self.guard("normalize", || {
            self.normalize_list();
            Some(())
        });
        {
            let mut st = self.lock();
            let file = st.home_file.clone().unwrap();
            if let Ok(text) = fs::read_to_string(&file) {
                if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                    let point = |v: &Value| Some((v.get("x")?.as_f64()? as i32, v.get("y")?.as_f64()? as i32));
                    if let Some(homes) = parsed.get("homes").and_then(Value::as_object) {
                        st.homes = homes.iter().filter_map(|(k, v)| point(v).map(|p| (k.clone(), p))).collect();
                        st.turned_off_auto_arrange = parsed.get("autoArrange").map(crate::store::truthy).unwrap_or(false);
                        st.turned_off_snap_to_grid = parsed.get("snapToGrid").map(crate::store::truthy).unwrap_or(false);
                        st.shell_prev = parsed
                            .get("shellPrev")
                            .and_then(Value::as_object)
                            .map(|m| m.iter().map(|(k, v)| (k.clone(), v.as_f64().unwrap_or(0.0) as u32)).collect())
                            .unwrap_or_default();
                        st.file_attrs = parsed
                            .get("fileAttrs")
                            .and_then(Value::as_object)
                            .map(|m| m.iter().map(|(k, v)| (k.clone(), crate::store::js_number(v) as u32)).collect())
                            .unwrap_or_default();
                        // 갑자기 끝났어도 밀어낸 아이콘을 알아보고 제자리로 돌려놓을 수 있게 적어 둔다.
                        for key in parsed.get("nudged").and_then(Value::as_array).cloned().unwrap_or_default() {
                            if let Some(k) = key.as_str() {
                                st.nudged.insert(k.to_string());
                            }
                        }
                    } else if let Some(map) = parsed.as_object() {
                        st.homes = map.iter().filter_map(|(k, v)| point(v).map(|p| (k.clone(), p))).collect();
                    }
                }
            }
        }
        // 예전 판이 꺼 둔 자동 정렬이 남아 있으면 아이콘을 옮겨도 자리가 고정된다.
        self.guard("restore_arrange", || {
            self.restore_arrange();
            Some(())
        });
    }

    fn shutdown(&self) {
        if self.lock().list_frozen {
            self.list_redraw(true);
        }
        // 감춰 둔 파일 속성을 먼저 되돌린다.
        self.guard("reveal", || {
            self.reveal_stored();
            Some(())
        });
        // 박스가 들고 있던 것뿐 아니라, 화면 밖에 남은 아이콘을 모두 되돌린다.
        self.home_all();
        self.restore_shell_icons();
        self.guard("restore_arrange", || {
            self.restore_arrange();
            Some(())
        });
        if let Some(handle) = self.lock().claim.take() {
            unsafe {
                let _ = CloseHandle(HANDLE(handle as *mut c_void));
            }
        }
    }

    // 바탕화면 아이콘은 컴퓨터에 하나뿐이다. 먼저 뜬 쪽만 아이콘을 다룬다.
    fn claim_single_instance(&self) -> bool {
        let mut st = self.lock();
        if st.claim.is_some() {
            return true;
        }
        unsafe {
            let Ok(handle) = CreateMutexW(None, true, windows::core::w!("Local\\MyDeskBox.DesktopOwner")) else { return true };
            if GetLastError() == ERROR_ALREADY_EXISTS {
                let _ = CloseHandle(handle);
                return false;
            }
            st.claim = Some(handle.0 as isize);
        }
        true
    }

    // 바탕화면에 실제로 놓여 있는, 파일이 아닌 항목들.
    fn shell_items(&self) -> Vec<Entry> {
        let listed = self.listed();
        let on_desk: HashSet<String> = listed.iter().map(|i| key_of(&i.name)).collect();
        shell_name_table().into_iter().filter(|e| on_desk.contains(&key_of(&e.name))).collect()
    }

    fn recycle_count(&self) -> i64 {
        let mut info = SHQUERYRBINFO { cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32, ..Default::default() };
        match unsafe { SHQueryRecycleBinW(PCWSTR::null(), &mut info) } {
            Ok(_) => info.i64NumItems,
            Err(_) => -1,
        }
    }

    // 탐색기가 감추는 파일인가.
    fn file_flags(&self, path: &str) -> Option<FileFlags> {
        if path.is_empty() || path.starts_with("shell:") {
            return None;
        }
        let attr = file_attributes(path);
        if attr == INVALID_FILE_ATTRIBUTES {
            return None;
        }
        Some(FileFlags {
            hidden: attr & FILE_ATTRIBUTE_HIDDEN != 0,
            system: attr & FILE_ATTRIBUTE_SYSTEM != 0,
            temporary: attr & FILE_ATTRIBUTE_TEMPORARY != 0,
        })
    }

    // 탐색기가 바탕화면에 그리는 바로 그 그림을 꺼낸다.
    fn file_icon(&self, path: &str) -> Option<Picture> {
        prepare_com();
        if path.to_lowercase() == "shell:recyclebinfolder" {
            if let Some(shot) = self.recycle_bin_icon() {
                return Some(shot);
            }
        }
        if path.starts_with("shell:") {
            return shell_info(path).and_then(|i| icon_from_index(i.icon_index));
        }
        let info = file_info(path, SHGFI_SYSICONINDEX)?;
        icon_from_index(info.iIcon)
    }

    // 프로그램이나 아이콘 파일에서 그림을 바로 꺼낸다. 다시 설치해 바뀐 그림도 늘 지금 것이다.
    fn icon_of_file(&self, file: &str, index: i32) -> Option<Picture> {
        if file.is_empty() {
            return None;
        }
        let file = normalize_win(file);
        [64, 48, 32].iter().find_map(|size| icon_from_file(&file, index, *size))
    }

    fn shortcut_link(&self, path: &str) -> Option<Link> {
        if !path.to_lowercase().ends_with(".lnk") {
            return None;
        }
        read_shortcut(path)
    }

    // 탐색기가 바탕화면에 그리는 이름 그대로 (확장자 감춤, localized 이름까지).
    fn display_name(&self, path: &str) -> String {
        if path.is_empty() {
            return String::new();
        }
        if path.starts_with("shell:") {
            return shell_info(path).map(|i| i.name).unwrap_or_default();
        }
        file_info(path, SHGFI_DISPLAYNAME).map(|i| decode_name(&i.szDisplayName)).unwrap_or_default()
    }

    fn foreign_at(&self, point: Point, own: &[u64]) -> Option<bool> {
        Some(surface_at(point, own).map(|hit| deskpick::is_foreign_target(&hit.class_name, hit.ours)).unwrap_or(false))
    }

    fn on_desktop(&self, point: Point, own: &[u64]) -> Option<bool> {
        Some(match surface_at(point, own) {
            Some(hit) if !hit.ours => deskpick::is_desktop_target(&hit.class_name, ""),
            _ => false,
        })
    }

    // 휴지통으로 보낸다. 같은 이름이 이미 있어도 바꾸지 않고 따로 남긴다.
    fn discard_file(&self, path: &str) -> bool {
        if path.is_empty() || !std::path::Path::new(path).exists() {
            return false;
        }
        let mut from: Vec<u16> = normalize_win(path).encode_utf16().collect();
        from.extend_from_slice(&[0, 0]);
        let mut op = SHFILEOPSTRUCTW {
            wFunc: 3, // FO_DELETE
            pFrom: PCWSTR(from.as_ptr()),
            fFlags: RECYCLE_FLAGS,
            ..Default::default()
        };
        let code = unsafe { SHFileOperationW(&mut op) };
        code == 0 && !std::path::Path::new(path).exists()
    }

    // 휴지통 비우기. 물어보는 창과 진행률은 윈도우가 그대로 보여 준다.
    fn empty_recycle(&self, owner: u64) -> bool {
        prepare_com();
        let owner = (owner != 0).then(|| hwnd_of(owner));
        let ok = unsafe { SHEmptyRecycleBinW(owner, PCWSTR::null(), 0).is_ok() };
        if ok {
            refresh_shell_icons();
        }
        ok
    }

    // 보관함 폴더를 탐색기에서 감춘다.
    fn hide_path(&self, dir: &str) -> Option<bool> {
        if dir.is_empty() {
            return Some(false);
        }
        let attr = file_attributes(dir);
        if attr == INVALID_FILE_ATTRIBUTES {
            return Some(false);
        }
        let next = attr | FILE_ATTRIBUTE_HIDDEN;
        if next == attr {
            return Some(true);
        }
        Some(set_file_attributes(dir, next))
    }

    fn reveal_file(&self, path: &str) -> bool {
        let mut st = self.lock();
        Self::reveal(&mut st, path)
    }

    // 끌어다 놓은 자리에 아이콘을 둔다. 그림이 손 아래에 그대로 있게 왼쪽 위를 조금 당겨 놓는다.
    fn put_at(&self, name: &str, point: Point) -> bool {
        if name.is_empty() || !point.x.is_finite() || !point.y.is_finite() {
            return false;
        }
        let phys = screen::dip_to_phys(Point::new(point.x - 16.0, point.y - 8.0));
        let (x, y) = ((round(phys.x) as i32).max(0), (round(phys.y) as i32).max(0));
        self.guard("put_at", || {
            let session = self.session()?;
            let icon = session.read_all().into_iter().find(|e| same_name(&e.name, name))?;
            self.lock().homes.insert(key_of(&icon.name), (x, y));
            Some(self.apply_moves(&session, &[Move { index: icon.index, x: x as f64, y: y as f64 }], false, false))
        })
    }

    // 바탕화면으로 돌려준 아이콘을 적어 둔 자리에 놓는다. 자리를 모르면 탐색기가 정한 자리에 둔다.
    fn put_home(&self, names: &[String]) -> bool {
        let want: Vec<&String> = names.iter().filter(|n| !n.is_empty()).collect();
        if want.is_empty() {
            return false;
        }
        self.guard("put_home", || {
            let session = self.session()?;
            let mut moves = Vec::new();
            {
                let st = self.lock();
                for icon in session.read_all() {
                    if !want.iter().any(|n| same_name(&icon.name, n)) {
                        continue;
                    }
                    let Some(home) = sane_point(st.homes.get(&key_of(&icon.name)).copied()) else { continue };
                    if home.0 == icon.x as i32 && home.1 == icon.y as i32 {
                        continue;
                    }
                    moves.push(Move { index: icon.index, x: home.0 as f64, y: home.1 as f64 });
                }
            }
            if moves.is_empty() {
                return Some(false);
            }
            trace(&format!("돌려준 아이콘 {}개를 적어 둔 자리에 놓는다", moves.len()));
            Some(self.apply_moves(&session, &moves, false, false))
        })
    }

    fn refresh_folder(&self, dir: &str) {
        if dir.is_empty() {
            return;
        }
        let w = wide(dir);
        unsafe { SHChangeNotify(SHCNE_ID(0x0000_1000), SHCNF_FLAGS(0x0005 | 0x1000), Some(w.as_ptr() as *const c_void), None) };
    }

    fn sync_shell_icons(&self, items: &[Item]) {
        let wanted: HashSet<&str> = items.iter().filter(|i| i.path.starts_with("shell:")).map(|i| i.path.as_str()).collect();
        let mut st = self.lock();
        let mut changed = false;
        for (shell_path, clsid) in SHELL_CLSID {
            let hide = wanted.contains(shell_path);
            let tracked = st.shell_prev.contains_key(shell_path);
            if hide == tracked {
                continue;
            }
            if hide {
                st.shell_prev.insert(shell_path.to_string(), read_hide(clsid));
                write_hide(clsid, 1);
            } else {
                let prev = if st.shell_prev.remove(shell_path) == Some(1) { 1 } else { 0 };
                write_hide(clsid, prev);
            }
            changed = true;
        }
        if !changed {
            return;
        }
        drop(st);
        refresh_shell_icons();
        Self::persist_homes(&self.lock());
    }

    // 예전 판이 바탕화면에 해 둔 것과 밀어낸 아이콘 자리를 되돌린다.
    fn release(&self, items: &[Item]) {
        self.show_layer(true);
        self.restore_shell_icons();
        {
            let mut st = self.lock();
            for item in items {
                if !item.path.is_empty() && !item.path.starts_with("shell:") && Self::reveal(&mut st, &item.path) {
                    notify_item(&item.path);
                }
            }
            let paths: Vec<String> = st.file_attrs.keys().cloned().collect();
            for p in paths {
                if Self::reveal(&mut st, &p) {
                    notify_item(&p);
                }
            }
        }
        self.home_all();
        // 박스를 숨긴 동안에는 자동 정렬을 탐색기에 돌려준다.
        if self.lock().turned_off_auto_arrange {
            self.restore_arrange();
        }
        Self::persist_homes(&self.lock());
    }

    // 박스가 깔고 앉은 바탕화면 아이콘을 빈 칸으로 밀어낸다. 옮기는 자리는 모두 화면 안이다.
    fn nudge(&self, blocks: &[Rect], live: bool) -> bool {
        let walls: Vec<Rect> = blocks.iter().map(|b| screen::dip_rect_to_phys(*b)).collect();
        if walls.is_empty() {
            return false;
        }
        self.guard("nudge", || {
            let session = self.session()?;
            let listed = self.read_maybe_cached(&session, live);
            if listed.is_empty() {
                return Some(false);
            }
            // 화면 밖에 있는 아이콘은 박스에 가린 것처럼 다루어 화면 안으로 들인다.
            let origin = walls[0];
            let visible: Vec<Icon> = listed
                .iter()
                .map(|i| if is_parked(i.x, i.y) { Icon { x: origin.x + 1.0, y: origin.y + 1.0, ..i.clone() } } else { i.clone() })
                .collect();
            let grid = Self::lattice_of(session.list, &visible);
            let area = desktop_area();
            let mut st = self.lock();
            // 자동 정렬을 켜 둔 사람에게는 박스를 비켜 가며 우리가 정렬해 준다.
            let arranging = Self::wants_auto_arrange(&st, session.list);
            let mut moves = if arranging {
                deskgrid::pack(&visible, &walls, &area, &grid)
            } else {
                deskgrid::relocate(&visible, &walls, &area, &grid)
            };
            if !arranging {
                let back = Self::homecoming(&mut st, &visible, &walls, &grid, &moves);
                moves.extend(back);
            }
            if moves.is_empty() {
                return Some(false);
            }
            // 옮기기 전 자리를 적어 둔다. 이미 적힌 것은 그대로 둔다. 처음 자리가 진짜 제자리이다.
            for m in &moves {
                let Some(icon) = listed.iter().find(|i| i.index == m.index) else { continue };
                let key = key_of(&icon.name);
                if !st.homes.contains_key(&key) && !is_parked(icon.x, icon.y) {
                    st.homes.insert(key.clone(), (icon.x as i32, icon.y as i32));
                }
                st.nudged.insert(key);
            }
            drop(st);
            trace(&format!("박스에 가린 아이콘 {}개를 옆으로 옮긴다", moves.len()));
            Some(self.apply_moves(&session, &moves, false, live))
        })
    }

    // 바탕화면 아이콘 격자 (DIP). 아이콘이 없어 잴 수 없으면 None.
    fn grid_info(&self) -> Option<DeskGrid> {
        self.guard("grid_info", || {
            let session = self.session()?;
            let listed: Vec<Icon> = session.read_all().into_iter().filter(|i| !is_parked(i.x, i.y)).collect();
            if listed.is_empty() {
                return Some(None);
            }
            let grid = Self::lattice_of(session.list, &listed);
            let origin = to_dip_rect(&DragRect { x: grid.x0, y: grid.y0, width: grid.dx, height: grid.dy });
            if origin.width < 8.0 || origin.height < 8.0 {
                return Some(None);
            }
            Some(Some(DeskGrid { x0: origin.x, y0: origin.y, dx: origin.width, dy: origin.height }))
        })
    }

    fn mouse_down(&self) -> bool {
        mouse_down()
    }
}

// ── 바탕화면 손짓 감시 ──────────────────────────────────────────────────

pub struct DragHooks {
    pub on_rect: Box<dyn Fn(Rect) + Send>,
    pub on_settle: Box<dyn Fn() + Send>,
    pub on_drop: Box<dyn Fn(Vec<Entry>, Point) + Send>,
    pub on_hover: Box<dyn Fn(Option<(Entry, Point)>) + Send>,
    pub on_press: Box<dyn Fn() + Send>,
}

// 바탕화면 빈 곳에서 왼쪽 단추로 사각형을 끌면 그 자리를 알려 준다.
// 아이콘을 끌어 박스 위에 놓으면 그 아이콘(과 함께 골라 둔 것들)을 알려 준다.
pub fn watch_drag(desk: std::sync::Arc<WinDesktop>, hooks: DragHooks) -> std::sync::Arc<std::sync::atomic::AtomicBool> {
    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = stop.clone();
    std::thread::Builder::new()
        .name("desk-drag".into())
        .spawn(move || {
            prepare_com();
            struct Held {
                x: i32,
                y: i32,
                name: String,
                item: Option<Entry>,
                items: Vec<Entry>,
            }
            let mut start: Option<POINT> = None;
            let mut held: Option<Held> = None;
            let mut was_down = false;
            let mut settle_at: Option<Instant> = None;
            while !flag.load(std::sync::atomic::Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(16));
                if let Some(at) = settle_at {
                    if at.elapsed() >= Duration::from_millis(150) {
                        settle_at = None;
                        (hooks.on_settle)();
                    }
                }
                let down = mouse_down();
                let Some(pos) = cursor_pos() else { continue };
                if down && !was_down {
                    let on_desk = desktop_at(pos);
                    // 바탕화면을 눌렀다. 박스 안에서 골라 둔 표시는 거둔다.
                    if on_desk {
                        (hooks.on_press)();
                    }
                    let found = if on_desk { desk.drag_group(pos) } else { None };
                    held = found.as_ref().map(|(icon, item, items)| Held {
                        x: pos.x,
                        y: pos.y,
                        name: icon.name.clone(),
                        item: item.clone(),
                        items: items.clone(),
                    });
                    // 빈 곳에서 시작한 끌기만 새 박스 후보이다.
                    start = if on_desk && found.is_none() { Some(pos) } else { None };
                } else if down && held.as_ref().map(|h| h.item.is_some()).unwrap_or(false) {
                    // 박스 위로 끌고 오는 동안 넣을 자리를 보여 준다.
                    let item = held.as_ref().unwrap().item.clone().unwrap();
                    (hooks.on_hover)(Some((item, to_dip_point(pos))));
                } else if !down && was_down {
                    (hooks.on_hover)(None);
                    if let Some(dragged) = held.take() {
                        let moved = deskpick::moved_enough(
                            Point::new(dragged.x as f64, dragged.y as f64),
                            Point::new(pos.x as f64, pos.y as f64),
                        );
                        if moved {
                            let items = if !dragged.items.is_empty() {
                                dragged.items
                            } else {
                                dragged.item.or_else(|| desk.item_for_icon(&dragged.name)).into_iter().collect()
                            };
                            if !items.is_empty() {
                                (hooks.on_drop)(items, to_dip_point(pos));
                            }
                        }
                    }
                    if let Some(from) = start.take() {
                        let rect = DragRect {
                            x: from.x.min(pos.x) as f64,
                            y: from.y.min(pos.y) as f64,
                            width: (pos.x - from.x).abs() as f64,
                            height: (pos.y - from.y).abs() as f64,
                        };
                        // 그 안에 아이콘이 있으면 여러 개를 고른 것이지, 박스를 그리는 것이 아니다.
                        if deskpick::should_offer_fence(&rect, &desk.listed()) {
                            (hooks.on_rect)(to_dip_rect(&rect));
                        } else {
                            settle_at = Some(Instant::now());
                        }
                    } else {
                        settle_at = Some(Instant::now());
                    }
                }
                was_down = down;
            }
        })
        .ok();
    stop
}

// 사용자가 정한 두 번 누르기 시간. 너무 짧거나 긴 값은 손본다.
fn double_time() -> f64 {
    let ms = unsafe { GetDoubleClickTime() } as f64;
    if ms <= 0.0 {
        500.0
    } else {
        ms.clamp(200.0, 1000.0)
    }
}

// 빈 바탕화면을 두 번 누르는 데는 아이콘을 여는 만큼의 정확도가 필요 없다. 넉넉하게 잡는다.
const SLOP_FLOOR: f64 = 28.0;

fn double_slop() -> Point {
    let (x, y) = unsafe { (GetSystemMetrics(SM_CXDOUBLECLK), GetSystemMetrics(SM_CYDOUBLECLK)) };
    Point::new(SLOP_FLOOR.max(x as f64 * 4.0), SLOP_FLOOR.max(y as f64 * 4.0))
}

// 바탕화면 빈 곳을 두 번 누르면 박스를 감추고, 다시 두 번 누르면 보여 준다.
// 누름(내려감)을 센다. 16밀리초마다 물어야 빠른 클릭을 놓치지 않는다.
pub fn watch_double_click(desk: std::sync::Arc<WinDesktop>, on_toggle: Box<dyn Fn() + Send>) -> std::sync::Arc<std::sync::atomic::AtomicBool> {
    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = stop.clone();
    std::thread::Builder::new()
        .name("desk-taps".into())
        .spawn(move || {
            prepare_com();
            let mut taps = deskpick::DeskTaps::new();
            let mut was_down = false;
            while !flag.load(std::sync::atomic::Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(16));
                let down = mouse_down();
                if down && !was_down {
                    let pos = cursor_pos();
                    let on_desk = pos.map(desktop_at).unwrap_or(false);
                    let on_icon = on_desk && desk.cursor_on_icon(pos.unwrap());
                    if !on_desk || on_icon {
                        if tracing() {
                            if let Some(p) = pos {
                                let under = class_name(unsafe { WindowFromPoint(p) });
                                let fg = class_name(unsafe { GetForegroundWindow() });
                                trace(&format!("누름 {},{} 밑={under} 앞={fg} 아이콘={on_icon} -> 세지 않는다", p.x, p.y));
                            }
                        }
                        taps.forget();
                    } else {
                        let p = pos.unwrap();
                        let twice = taps.press(crate::js::now_ms(), Point::new(p.x as f64, p.y as f64), double_time(), double_slop());
                        trace(&format!("누름 {},{} 두 번째={twice}", p.x, p.y));
                        if twice {
                            on_toggle();
                        }
                    }
                }
                was_down = down;
            }
        })
        .ok();
    stop
}

#[allow(dead_code)]
fn unused(_: BOOL, _: GUID, _: PWSTR, _: HBITMAP) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_registry_icon_specs() {
        assert_eq!(parse_icon_spec("imageres.dll,-55"), Some(("imageres.dll".into(), -55)));
        assert_eq!(parse_icon_spec("\"C:\\a b\\x.dll\",3"), Some(("C:\\a b\\x.dll".into(), 3)));
        assert_eq!(parse_icon_spec("C:\\x.ico"), Some(("C:\\x.ico".into(), 0)));
        assert_eq!(parse_icon_spec(""), None);
    }

    #[test]
    fn natural_order_matches_locale_compare() {
        let mut names = vec!["보고서 10.docx", "보고서 2.pdf", "Alpha.txt", "alpha.doc"];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(names, vec!["alpha.doc", "Alpha.txt", "보고서 2.pdf", "보고서 10.docx"]);
        assert!(is_parked(20000.0, 0.0));
        assert!(!is_parked(100.0, 100.0));
    }
}
