//! Turning files dropped on a page back into paths, on Windows.
//!
//! Tauri's own file-drop support replaces the webview's drop target outright,
//! which stops every HTML5 drag inside the page - and the dock reorders its
//! icons, and takes one off by dragging it away, with exactly those. So on
//! Windows that support stays off and the page keeps its own drag and drop,
//! the way it worked under Electron.
//!
//! What the page then cannot do is learn where a dropped file lives. WebView2
//! can tell: the page posts the dropped `File` objects with
//! `chrome.webview.postMessageWithAdditionalObjects`, and the host reads each
//! one's path. The answer goes back as a `dock:file-paths` notification.
//! (macOS and Linux keep Tauri's drop support, which reports paths itself; see
//! `src/bridge.js`.)

use tauri::{Manager, Runtime, WebviewWindow};

pub const PREFIX: &str = "mydockbar-files:";

#[cfg(windows)]
pub fn attach<R: Runtime>(win: &WebviewWindow<R>) {
  use crate::bridge;
  use webview2_com::{
    take_pwstr,
    Microsoft::Web::WebView2::Win32::{ICoreWebView2File, ICoreWebView2WebMessageReceivedEventArgs2},
    WebMessageReceivedEventHandler,
  };
  use windows::core::{Interface, PWSTR};

  let label = win.label().to_string();
  let app = win.app_handle().clone();
  let _ = win.with_webview(move |platform| unsafe {
    let Ok(core) = platform.controller().CoreWebView2() else { return };
    let handler = WebMessageReceivedEventHandler::create(Box::new(move |_sender, args| {
      let Some(args) = args else { return Ok(()) };
      let mut raw = PWSTR::null();
      if args.TryGetWebMessageAsString(&mut raw).is_err() {
        return Ok(());
      }
      let message = take_pwstr(raw);
      let Some(token) = message.strip_prefix(PREFIX) else { return Ok(()) };

      let mut paths = Vec::new();
      if let Ok(args2) = args.cast::<ICoreWebView2WebMessageReceivedEventArgs2>() {
        if let Ok(objects) = args2.AdditionalObjects() {
          let mut count = 0u32;
          let _ = objects.Count(&mut count);
          for i in 0..count {
            let Ok(object) = objects.GetValueAtIndex(i) else { continue };
            let Ok(file) = object.cast::<ICoreWebView2File>() else { continue };
            let mut path = PWSTR::null();
            if file.Path(&mut path).is_ok() {
              let path = take_pwstr(path);
              if !path.is_empty() {
                paths.push(path);
              }
            }
          }
        }
      }
      bridge::post(&app, &label, "dock:file-paths", serde_json::json!({ "token": token, "paths": paths }));
      Ok(())
    }));
    let mut token = Default::default();
    let _ = core.add_WebMessageReceived(&handler, &mut token);
  });
}

#[cfg(not(windows))]
pub fn attach<R: Runtime>(_win: &WebviewWindow<R>) {}
