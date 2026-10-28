//! What Tauri has no API for: whole-window opacity (Electron's BrowserWindow.setOpacity)
//! and the taskbar's big icon on Windows.

use tauri::WebviewWindow;

/// 0.2 – 1.0, the same range the Electron build allowed.
pub fn clamp_opacity(value: f64) -> f64 {
  if value.is_finite() {
    value.clamp(0.2, 1.0)
  } else {
    1.0
  }
}

/// Sets the opacity of the whole window, chrome and page together.
pub fn set_opacity(window: &WebviewWindow, value: f64) {
  let value = clamp_opacity(value);
  let w = window.clone();
  let _ = window.run_on_main_thread(move || apply_opacity(&w, value));
}

#[cfg(windows)]
fn apply_opacity(window: &WebviewWindow, value: f64) {
  #[link(name = "user32")]
  extern "system" {
    fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
    fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
    fn SetLayeredWindowAttributes(hwnd: isize, key: u32, alpha: u8, flags: u32) -> i32;
  }
  const GWL_EXSTYLE: i32 = -20;
  const WS_EX_LAYERED: isize = 0x0008_0000;
  const LWA_ALPHA: u32 = 0x2;
  let Ok(hwnd) = window.hwnd() else { return };
  let hwnd = hwnd.0 as isize;
  unsafe {
    let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if value >= 1.0 {
      // Fully opaque: drop the layered style so the window composes as usual.
      if style & WS_EX_LAYERED != 0 {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style & !WS_EX_LAYERED);
      }
      return;
    }
    if style & WS_EX_LAYERED == 0 {
      SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED);
    }
    SetLayeredWindowAttributes(hwnd, 0, (value * 255.0).round() as u8, LWA_ALPHA);
  }
}

#[cfg(target_os = "macos")]
fn apply_opacity(window: &WebviewWindow, value: f64) {
  use objc2::msg_send;
  use objc2::runtime::AnyObject;
  let Ok(ns_window) = window.ns_window() else { return };
  if ns_window.is_null() {
    return;
  }
  unsafe {
    let ns_window = &*(ns_window as *const AnyObject);
    let _: () = msg_send![ns_window, setAlphaValue: value];
  }
}

#[cfg(target_os = "linux")]
fn apply_opacity(window: &WebviewWindow, value: f64) {
  use gtk::prelude::WidgetExt;
  if let Ok(gtk_window) = window.gtk_window() {
    gtk_window.set_opacity(value);
  }
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn apply_opacity(_window: &WebviewWindow, _value: f64) {}

/// The taskbar and Alt+Tab show a window's big icon, but Tauri only gives the window a small
/// one. Both are set here from the program's own icon at the sizes this screen uses.
pub fn apply_window_icon(window: &WebviewWindow) {
  #[cfg(windows)]
  {
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
    // The resource id tauri-build gives the program icon.
    const PROGRAM_ICON: usize = 32512;
    const SM_CXICON: i32 = 11;
    const SM_CXSMICON: i32 = 49;
    const IMAGE_ICON: u32 = 1;
    // Loaded once per size and kept by Windows, so nothing leaks per window.
    const LR_SHARED: u32 = 0x8000;
    const WM_SETICON: u32 = 0x0080;
    let Ok(hwnd) = window.hwnd() else { return };
    let hwnd = hwnd.0 as isize;
    unsafe {
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
  }
  #[cfg(not(windows))]
  let _ = window;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn opacity_range_matches_electron() {
    assert_eq!(clamp_opacity(0.0), 0.2);
    assert_eq!(clamp_opacity(0.5), 0.5);
    assert_eq!(clamp_opacity(3.0), 1.0);
    assert_eq!(clamp_opacity(f64::NAN), 1.0);
  }
}
