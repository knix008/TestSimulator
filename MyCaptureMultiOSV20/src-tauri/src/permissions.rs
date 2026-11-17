//! Microphone access for MyCapture's own pages.
//!
//! WebView2 would otherwise show a browser-style "localhost wants to use your
//! microphone" prompt. The app only ever loads its own bundled pages and the
//! user turns the microphone on explicitly, so the request is granted here.
//! The OS-level privacy switch (Settings → Privacy → Microphone) still applies.

#[cfg(windows)]
pub fn allow_microphone(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
            if let Some(args) = args {
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_PermissionRequested(&handler, &mut token);
    });
}

/// macOS and Linux ask through the OS itself (TCC prompt / portal).
#[cfg(not(windows))]
pub fn allow_microphone(_window: &tauri::WebviewWindow) {}
