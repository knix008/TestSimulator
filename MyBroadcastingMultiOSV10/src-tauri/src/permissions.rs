//! Microphone and camera for the app's own page.
//!
//! WebView2 asks "… wants to use your microphone / camera" at every start, because it keeps no answer for
//! the app's page. The app loads only its own page, and the user adds the microphone and camera sources
//! themselves, so requests from that page are granted here (as a desktop broadcasting program would never
//! ask). Pages from anywhere else are left to WebView2's own prompt. The operating system's privacy switch
//! (Settings → Privacy → Microphone / Camera) still applies.

/// Whether a page address is the app's own page (the bundled one, or the dev server on this computer).
pub fn own_page(uri: &str) -> bool {
    let lower = uri.to_ascii_lowercase();
    let Some((scheme, rest)) = lower.split_once("://") else { return false };
    // The host ends at the first '/', '?' or '#'; a port is allowed only on this computer's dev server.
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let (host, port) = authority.split_once(':').map_or((authority, None), |(h, p)| (h, Some(p)));
    match (scheme, host) {
        ("http" | "https", "tauri.localhost") | ("tauri", "localhost") => port.is_none(),
        ("http", "127.0.0.1" | "localhost") => port.is_some_and(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit())),
        _ => false,
    }
}

#[cfg(windows)]
pub fn allow_media(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;
    use windows::core::PWSTR;

    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
            if let Some(args) = args {
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                let mut uri = PWSTR::null();
                args.Uri(&mut uri)?;
                let page = if uri.is_null() { String::new() } else { uri.to_string().unwrap_or_default() };
                if (kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE || kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA) && own_page(&page) {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_PermissionRequested(&handler, &mut token);
    });
}

/// macOS and Linux ask through the operating system itself (and remember the answer).
#[cfg(not(windows))]
pub fn allow_media(_window: &tauri::WebviewWindow) {}

#[cfg(test)]
mod tests {
    use super::own_page;

    #[test]
    fn only_the_apps_own_page_is_granted() {
        assert!(own_page("http://tauri.localhost/index.html"));
        assert!(own_page("http://127.0.0.1:5660/"));
        assert!(own_page("http://localhost:5660/?x"));
        assert!(!own_page("https://example.com/"));
        assert!(!own_page("http://tauri.localhost.example.com/"));
        assert!(!own_page(""));
    }
}
