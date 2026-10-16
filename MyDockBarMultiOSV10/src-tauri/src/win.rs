//! Windows, called directly.
//!
//! The Electron build reached most of this through child processes: a
//! PowerShell for every window lookup, every window raised and every emptying
//! of the bin, `tasklist.exe` every five seconds for the running indicator, a
//! PowerShell every five seconds for the open applications and `whoami.exe`
//! for the user's SID. Each of those is tens of megabytes and a few hundred
//! milliseconds of CPU, which is most of why the old dock was heavy while it
//! sat doing nothing. Here they are the Win32 calls those processes made.

#![allow(clippy::upper_case_acronyms)]

use std::{
  collections::{HashMap, HashSet},
  ffi::c_void,
  os::windows::ffi::OsStrExt,
  path::Path,
};

use windows::{
  core::{Interface, BOOL, PCWSTR, PWSTR},
  Win32::{
    Devices::Display::{
      DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QueryDisplayConfig, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
      DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO, DISPLAYCONFIG_SOURCE_DEVICE_NAME,
      DISPLAYCONFIG_TARGET_DEVICE_NAME, QDC_ONLY_ACTIVE_PATHS,
    },
    Foundation::{CloseHandle, HANDLE, HLOCAL, HWND, LPARAM, LocalFree, POINT, SIZE, WPARAM},
    Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ},
    Security::{Authorization::ConvertSidToStringSidW, GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER},
    System::{
      Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ},
      Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS},
      RemoteDesktop::ProcessIdToSessionId,
      Threading::{
        AttachThreadInput, GetCurrentProcess, GetCurrentProcessId, GetCurrentThreadId, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
        PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
      },
    },
    UI::{
      Shell::{
        Common::ITEMIDLIST, ILCreateFromPathW, ILFree, IShellDispatch, IShellItemImageFactory, IShellLinkW, SHCreateItemFromParsingName,
        SHEmptyRecycleBinW, SHOpenFolderAndSelectItems, Shell, ShellExecuteW, ShellLink, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
      },
      WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, FindWindowW, GetCursorPos, GetForegroundWindow, GetWindow, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW, SetForegroundWindow, ShowWindowAsync, GW_OWNER, SW_RESTORE,
        SW_SHOWNORMAL, WM_COMMAND,
      },
    },
  },
};

pub fn wide(s: &str) -> Vec<u16> {
  std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

fn from_wide(buf: &[u16]) -> String {
  let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
  String::from_utf16_lossy(&buf[..end])
}

/// Run `f` with COM initialised as a single-threaded apartment, which is what
/// the shell objects expect.
pub fn with_com<T>(f: impl FnOnce() -> T) -> T {
  let initialised = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok();
  let out = f();
  if initialised {
    unsafe { CoUninitialize() };
  }
  out
}

fn expand_env(s: &str) -> String {
  // %SystemRoot% and friends, as Electron's readShortcutLink expanded them.
  let mut out = String::new();
  let mut rest = s;
  while let Some(start) = rest.find('%') {
    out.push_str(&rest[..start]);
    let after = &rest[start + 1..];
    match after.find('%') {
      Some(end) => {
        let name = &after[..end];
        match std::env::var(name) {
          Ok(value) if !name.is_empty() => out.push_str(&value),
          _ => {
            out.push('%');
            out.push_str(name);
            out.push('%');
          }
        }
        rest = &after[end + 1..];
      }
      None => {
        out.push_str(&rest[start..]);
        rest = "";
      }
    }
  }
  out.push_str(rest);
  out
}

pub struct Shortcut {
  pub target: String,
  pub args: String,
  pub icon: String,
}

/// What a `.lnk` points at. Fails for shell-namespace shortcuts (Control
/// Panel, Run, …), which have no file target.
pub fn read_shortcut(path: &Path) -> Option<Shortcut> {
  with_com(|| unsafe {
    let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
    let file: IPersistFile = link.cast().ok()?;
    let p = wide(&path.to_string_lossy());
    file.Load(PCWSTR(p.as_ptr()), STGM_READ).ok()?;

    let mut target = vec![0u16; 32768];
    let _ = link.GetPath(&mut target, std::ptr::null_mut(), 0);
    let mut args = vec![0u16; 32768];
    let _ = link.GetArguments(&mut args);
    let mut icon = vec![0u16; 32768];
    let mut index = 0i32;
    let _ = link.GetIconLocation(&mut icon, &mut index);

    let target = expand_env(&from_wide(&target));
    if target.is_empty() {
      return None;
    }
    Some(Shortcut { target, args: from_wide(&args), icon: expand_env(&from_wide(&icon)) })
  })
}

/// The icon the shell shows for `path`, as straight-alpha RGBA.
pub fn shell_icon(path: &str, size: i32) -> Option<(u32, u32, Vec<u8>)> {
  with_com(|| unsafe {
    let p = wide(path);
    let factory: IShellItemImageFactory = SHCreateItemFromParsingName(PCWSTR(p.as_ptr()), None).ok()?;
    let bitmap = factory.GetImage(SIZE { cx: size, cy: size }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK).ok()?;
    let pixels = bitmap_rgba(bitmap);
    let _ = DeleteObject(HGDIOBJ(bitmap.0));
    pixels
  })
}

unsafe fn bitmap_rgba(bitmap: HBITMAP) -> Option<(u32, u32, Vec<u8>)> {
  let mut info = BITMAP::default();
  if GetObjectW(HGDIOBJ(bitmap.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut info as *mut _ as *mut c_void)) == 0 {
    return None;
  }
  let (w, h) = (info.bmWidth, info.bmHeight.abs());
  if w <= 0 || h <= 0 {
    return None;
  }
  let mut header = BITMAPINFO::default();
  header.bmiHeader = BITMAPINFOHEADER {
    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
    biWidth: w,
    biHeight: -h, // top-down
    biPlanes: 1,
    biBitCount: 32,
    biCompression: BI_RGB.0,
    ..Default::default()
  };
  let mut bgra = vec![0u8; (w * h * 4) as usize];
  let dc = GetDC(None);
  let lines = GetDIBits(dc, bitmap, 0, h as u32, Some(bgra.as_mut_ptr() as *mut c_void), &mut header, DIB_RGB_COLORS);
  ReleaseDC(None, dc);
  if lines == 0 {
    return None;
  }

  // The shell hands back premultiplied pixels for icons with soft edges and
  // straight ones for others; a channel brighter than its alpha can only be
  // straight, so only undo the premultiplication when no pixel says otherwise.
  let premultiplied = bgra.chunks(4).all(|p| p[0] <= p[3] && p[1] <= p[3] && p[2] <= p[3]);
  let has_alpha = bgra.chunks(4).any(|p| p[3] != 0);
  let mut rgba = Vec::with_capacity(bgra.len());
  for p in bgra.chunks(4) {
    let (b, g, r, a) = (p[0], p[1], p[2], if has_alpha { p[3] } else { 255 });
    if premultiplied && a > 0 && a < 255 {
      let un = |c: u8| ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8;
      rgba.extend_from_slice(&[un(r), un(g), un(b), a]);
    } else {
      rgba.extend_from_slice(&[r, g, b, a]);
    }
  }
  Some((w as u32, h as u32, rgba))
}

/// Open with the default verb - what Electron's `shell.openPath` does.
pub fn shell_open(path: &str) -> Result<(), String> {
  shell_execute(path, None)
}

fn shell_execute(path: &str, params: Option<&str>) -> Result<(), String> {
  with_com(|| unsafe {
    let file = wide(path);
    let args = params.map(wide);
    let result = ShellExecuteW(
      None,
      PCWSTR::null(),
      PCWSTR(file.as_ptr()),
      args.as_ref().map(|a| PCWSTR(a.as_ptr())).unwrap_or(PCWSTR::null()),
      PCWSTR::null(),
      SW_SHOWNORMAL,
    );
    let code = result.0 as isize;
    if code > 32 {
      Ok(())
    } else {
      Err(format!("Failed to open path ({code})"))
    }
  })
}

/// Open the folder holding `path` with it selected.
pub fn show_in_folder(path: &str) {
  with_com(|| unsafe {
    let p = wide(path);
    let pidl = ILCreateFromPathW(PCWSTR(p.as_ptr()));
    if pidl.is_null() {
      return;
    }
    let _ = SHOpenFolderAndSelectItems(pidl as *const ITEMIDLIST, None, 0);
    ILFree(Some(pidl as *const ITEMIDLIST));
  })
}

/// The shell's "minimize all" - what `Shell.Application.MinimizeAll()` does.
pub fn minimize_all() {
  let done = with_com(|| unsafe {
    let shell: windows::core::Result<IShellDispatch> = CoCreateInstance(&Shell, None, CLSCTX_INPROC_SERVER);
    shell.and_then(|s| s.MinimizeAll()).is_ok()
  });
  if !done {
    // The taskbar's own command for it.
    unsafe {
      let class = wide("Shell_TrayWnd");
      if let Ok(tray) = FindWindowW(PCWSTR(class.as_ptr()), PCWSTR::null()) {
        let _ = PostMessageW(Some(tray), WM_COMMAND, WPARAM(419), LPARAM(0));
      }
    }
  }
}

/// Empty every volume's bin, with Explorer's progress window owned by the dock
/// so it stacks above a dock that is always on top. The menu click is the
/// confirmation, so the shell is not asked to confirm again.
pub fn empty_recycle_bin(owner: Option<isize>) -> Result<(), String> {
  const SHERB_NOCONFIRMATION: u32 = 1;
  const ERROR_CANCELLED: i32 = 0x800704C7u32 as i32;
  with_com(|| unsafe {
    let hwnd = owner.map(|h| HWND(h as *mut c_void));
    match SHEmptyRecycleBinW(hwnd, PCWSTR::null(), SHERB_NOCONFIRMATION) {
      Ok(()) => Ok(()),
      // The progress dialog has a Cancel button; stopping it is not a failure.
      Err(err) if err.code().0 == ERROR_CANCELLED => Ok(()),
      Err(err) => Err(format!("{}", err.code().0)),
    }
  })
}

/// The signed-in user's SID, which names their folder inside each bin.
pub fn current_sid() -> Option<String> {
  unsafe {
    let mut token = HANDLE::default();
    OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).ok()?;
    let mut len = 0u32;
    let _ = GetTokenInformation(token, TokenUser, None, 0, &mut len);
    let mut buf = vec![0u8; len as usize];
    let ok = GetTokenInformation(token, TokenUser, Some(buf.as_mut_ptr() as *mut c_void), len, &mut len).is_ok();
    let _ = CloseHandle(token);
    if !ok {
      return None;
    }
    let user = &*(buf.as_ptr() as *const TOKEN_USER);
    let mut text = PWSTR::null();
    ConvertSidToStringSidW(user.User.Sid, &mut text).ok()?;
    let sid = text.to_string().ok();
    let _ = LocalFree(Some(HLOCAL(text.0 as *mut c_void)));
    sid
  }
}

/// Every running executable's file name, lower-cased.
pub fn process_names() -> Option<HashSet<String>> {
  unsafe {
    let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
    let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
    let mut names = HashSet::new();
    if Process32FirstW(snap, &mut entry).is_ok() {
      loop {
        names.insert(from_wide(&entry.szExeFile).to_lowercase());
        if Process32NextW(snap, &mut entry).is_err() {
          break;
        }
      }
    }
    let _ = CloseHandle(snap);
    Some(names)
  }
}

fn process_path(pid: u32) -> Option<String> {
  unsafe {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buf = vec![0u16; 32768];
    let mut size = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut size).is_ok();
    let _ = CloseHandle(handle);
    ok.then(|| String::from_utf16_lossy(&buf[..size as usize]))
  }
}

fn window_title(hwnd: HWND) -> String {
  unsafe {
    let len = GetWindowTextLengthW(hwnd);
    if len <= 0 {
      return String::new();
    }
    let mut buf = vec![0u16; len as usize + 1];
    let got = GetWindowTextW(hwnd, &mut buf);
    String::from_utf16_lossy(&buf[..got.max(0) as usize])
  }
}

/// One "main window" per process, the way .NET's `Process.MainWindowHandle`
/// picks it: the first visible, unowned top-level window in z-order.
fn main_windows() -> Vec<(u32, HWND)> {
  unsafe extern "system" fn each(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let out = &mut *(lparam.0 as *mut Vec<(u32, HWND)>);
    if IsWindowVisible(hwnd).as_bool() && GetWindow(hwnd, GW_OWNER).map(|o| o.0.is_null()).unwrap_or(true) {
      let mut pid = 0u32;
      GetWindowThreadProcessId(hwnd, Some(&mut pid));
      if pid != 0 && !out.iter().any(|(p, _)| *p == pid) {
        out.push((pid, hwnd));
      }
    }
    BOOL(1)
  }
  let mut out: Vec<(u32, HWND)> = Vec::new();
  unsafe {
    let _ = EnumWindows(Some(each), LPARAM(&mut out as *mut _ as isize));
  }
  out
}

pub struct WindowedApp {
  pub name: String,
  pub path: String,
}

/// Processes in the user's own session that own a top-level window - the
/// "open applications" - sorted by process name the way `Get-Process` lists
/// them. Filtering out the system's own surfaces is the caller's business.
pub fn windowed_apps() -> Vec<WindowedApp> {
  let mut own_session = 0u32;
  unsafe {
    let _ = ProcessIdToSessionId(GetCurrentProcessId(), &mut own_session);
  }
  let mut found: Vec<(String, u32, String)> = Vec::new();
  for (pid, _) in main_windows() {
    let mut session = u32::MAX;
    unsafe {
      let _ = ProcessIdToSessionId(pid, &mut session);
    }
    if session != own_session {
      continue;
    }
    let Some(path) = process_path(pid) else { continue };
    let name = Path::new(&path).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    found.push((name, pid, path));
  }
  found.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()).then(a.1.cmp(&b.1)));
  found.into_iter().map(|(name, _, path)| WindowedApp { name, path }).collect()
}

/// The open windows belonging to the program at `target` (compared without
/// regard to case, as PowerShell's `-eq` did), as (handle, title).
pub fn windows_of(target: &str) -> Vec<(String, String)> {
  let wanted = target.to_lowercase();
  let mut out = Vec::new();
  for (pid, hwnd) in main_windows() {
    let Some(path) = process_path(pid) else { continue };
    if path.to_lowercase() != wanted {
      continue;
    }
    let handle = (hwnd.0 as isize).to_string();
    let title = window_title(hwnd).trim().to_string();
    out.push((handle.clone(), if title.is_empty() { format!("#{handle}") } else { title }));
  }
  out
}

/// Raise someone else's window.
///
/// SetForegroundWindow on its own is refused unless the caller already owns the
/// foreground, so the call is bracketed by AttachThreadInput: while attached to
/// the foreground thread's input queue, the restriction does not apply. The
/// window is un-minimised first, since restoring it afterwards would put it
/// behind whatever is in front.
pub fn focus_window(id: &str) -> bool {
  let Ok(raw) = id.parse::<isize>() else { return false };
  if raw == 0 {
    return false;
  }
  let h = HWND(raw as *mut c_void);
  unsafe {
    if IsIconic(h).as_bool() {
      let _ = ShowWindowAsync(h, SW_RESTORE);
    }
    let foreground = GetWindowThreadProcessId(GetForegroundWindow(), None);
    let own = GetCurrentThreadId();
    let owner = GetWindowThreadProcessId(h, None);

    let _ = AttachThreadInput(own, foreground, true);
    let _ = AttachThreadInput(owner, foreground, true);
    let _ = BringWindowToTop(h);
    let ok = SetForegroundWindow(h).as_bool();
    let _ = AttachThreadInput(owner, foreground, false);
    let _ = AttachThreadInput(own, foreground, false);

    ok || GetForegroundWindow() == h
  }
}

/// The cursor in physical screen pixels. Safe from any thread.
pub fn cursor_pos() -> Option<(i32, i32)> {
  let mut p = POINT::default();
  unsafe { GetCursorPos(&mut p) }.ok()?;
  Some((p.x, p.y))
}

/// Monitor names as the Display settings page shows them, keyed by the GDI
/// device name (`\\.\DISPLAY1`) Tauri reports a monitor by.
pub fn display_names() -> HashMap<String, String> {
  let mut out = HashMap::new();
  unsafe {
    let (mut paths_len, mut modes_len) = (0u32, 0u32);
    if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut paths_len, &mut modes_len).is_err() {
      return out;
    }
    let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); paths_len as usize];
    let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); modes_len as usize];
    if QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &mut paths_len, paths.as_mut_ptr(), &mut modes_len, modes.as_mut_ptr(), None).is_err() {
      return out;
    }
    for path in paths.iter().take(paths_len as usize) {
      let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
      source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
      source.header.size = std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
      source.header.adapterId = path.sourceInfo.adapterId;
      source.header.id = path.sourceInfo.id;
      if DisplayConfigGetDeviceInfo(&mut source.header) != 0 {
        continue;
      }
      let mut target = DISPLAYCONFIG_TARGET_DEVICE_NAME::default();
      target.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
      target.header.size = std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32;
      target.header.adapterId = path.targetInfo.adapterId;
      target.header.id = path.targetInfo.id;
      if DisplayConfigGetDeviceInfo(&mut target.header) != 0 {
        continue;
      }
      let friendly = from_wide(&target.monitorFriendlyDeviceName);
      if !friendly.is_empty() {
        out.insert(from_wide(&source.viewGdiDeviceName), friendly);
      }
    }
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_the_users_sid() {
    let sid = current_sid().expect("no SID");
    assert!(sid.starts_with("S-1-"), "{sid}");
  }

  #[test]
  fn lists_running_processes_including_itself() {
    let names = process_names().unwrap();
    let own = std::env::current_exe().unwrap();
    let own = own.file_name().unwrap().to_string_lossy().to_lowercase();
    assert!(names.contains(&own), "{own} not among {} processes", names.len());
  }

  #[test]
  fn expands_environment_variables_in_shortcut_paths() {
    let root = std::env::var("SystemRoot").unwrap();
    assert_eq!(expand_env("%SystemRoot%\\x.exe"), format!("{root}\\x.exe"));
    assert_eq!(expand_env("100%"), "100%");
    assert_eq!(expand_env("%NO_SUCH_VAR_HOPEFULLY%"), "%NO_SUCH_VAR_HOPEFULLY%");
  }

  #[test]
  fn draws_a_shell_icon_for_a_system_program() {
    let notepad = format!("{}\\System32\\notepad.exe", std::env::var("SystemRoot").unwrap());
    let (w, h, px) = shell_icon(&notepad, 128).expect("no icon for notepad");
    assert!(w >= 32 && h >= 32);
    assert!(px.chunks(4).any(|p| p[3] > 0), "the icon is blank");
  }
}
