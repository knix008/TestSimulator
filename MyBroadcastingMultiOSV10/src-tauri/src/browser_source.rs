//! Browser sources as real web pages (scripts run: chat boxes, alerts, widgets). Each source gets a WebView2
//! window of its own, kept off the screen and out of captures, muted. The page's picture comes over
//! DevTools' screencast as PNG frames with transparency (the page background is made transparent), and each
//! frame goes to the main window as the `browser-frame` event `{ id, data }` (base64 PNG). Pointer and keys
//! (Interact) go back as DevTools input events. Windows only (WebView2): elsewhere the page draws the
//! source itself (bc/engine/sources.js, scripts do not run there).
use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub url: String,
    pub width: u32,
    pub height: u32,
    pub css: String,
    pub fps: u32,
}

#[derive(Clone, Serialize)]
pub struct Frame {
    pub id: String,
    pub data: String,
}

/// `browser-<id>`: only letters, digits, '-' and '_' make a window label.
pub fn label_of(id: &str) -> String {
    format!("browser-{}", id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect::<String>())
}

/// The style a source adds (its CSS box), put in every document the page loads.
pub fn style_script(css: &str) -> String {
    let css = serde_json::to_string(css).unwrap_or_else(|_| "\"\"".into());
    format!("(() => {{ const add = () => {{ const s = document.createElement('style'); s.textContent = {css}; (document.head || document.documentElement).appendChild(s); }}; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add(); }})();")
}

#[cfg(windows)]
pub use platform::{close, input, open, reload};

#[cfg(windows)]
mod platform {
    use super::*;
    use crate::BROWSER_ARGS;
    use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, DevToolsProtocolEventReceivedEventHandler};
    use windows::core::{Interface, HSTRING, PCWSTR, PWSTR};

    unsafe fn call(core: &ICoreWebView2, method: &str, params: &str) -> windows::core::Result<()> {
        let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(())));
        core.CallDevToolsProtocolMethod(PCWSTR(HSTRING::from(method).as_ptr()), PCWSTR(HSTRING::from(params).as_ptr()), &handler)
    }

    /// Opens (or re-opens) the page of source `id` and starts its frames.
    pub async fn open(app: AppHandle, page: Page) -> Result<(), String> {
        let label = label_of(&page.id);
        if let Some(old) = app.get_webview_window(&label) {
            let _ = old.destroy();
        }
        let url = page.url.parse().map_err(|e| format!("url: {e}"))?;
        let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
            .title("MyBroadcasting browser source")
            .decorations(false)
            .skip_taskbar(true)
            .focused(false)
            .resizable(false)
            .shadow(false)
            // Off the screen but "visible", so the page keeps drawing (occlusion checks are off: BROWSER_ARGS).
            .position(-32000.0, -32000.0)
            .inner_size(f64::from(page.width.max(1)), f64::from(page.height.max(1)))
            .initialization_script(&style_script(&page.css))
            .additional_browser_args(BROWSER_ARGS)
            .build()
            .map_err(|e| e.to_string())?;
        let _ = window.set_content_protected(true);
        let main = app.clone();
        let id = page.id.clone();
        let (w, h, fps) = (page.width.max(1), page.height.max(1), page.fps.clamp(1, 60));
        window
            .with_webview(move |webview| unsafe {
                let started = (|| -> windows::core::Result<()> {
                    let core = webview.controller().CoreWebView2()?;
                    if let Ok(core8) = core.cast::<ICoreWebView2_8>() {
                        let _ = core8.SetIsMuted(true); // its sound would play on the speakers
                    }
                    if let Ok(controller2) = webview.controller().cast::<ICoreWebView2Controller2>() {
                        let _ = controller2.SetDefaultBackgroundColor(COREWEBVIEW2_COLOR { A: 0, R: 0, G: 0, B: 0 });
                    }
                    let receiver = core.GetDevToolsProtocolEventReceiver(PCWSTR(HSTRING::from("Page.screencastFrame").as_ptr()))?;
                    let ack_core = core.clone();
                    let handler = DevToolsProtocolEventReceivedEventHandler::create(Box::new(move |_, args| {
                        let Some(args) = args else { return Ok(()) };
                        let mut json = PWSTR::null();
                        args.ParameterObjectAsJson(&mut json)?;
                        let text = json.to_string().unwrap_or_default();
                        windows::Win32::System::Com::CoTaskMemFree(Some(json.0 as *const _));
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(session) = value.get("sessionId").and_then(|s| s.as_i64()) {
                                let _ = call(&ack_core, "Page.screencastFrameAck", &format!("{{\"sessionId\":{session}}}"));
                            }
                            if let Some(data) = value.get("data").and_then(|d| d.as_str()) {
                                let _ = main.emit_to("main", "browser-frame", Frame { id: id.clone(), data: data.to_string() });
                            }
                        }
                        Ok(())
                    }));
                    let mut token = 0i64;
                    receiver.add_DevToolsProtocolEventReceived(&handler, &mut token)?;
                    call(&core, "Page.enable", "{}")?;
                    call(&core, "Emulation.setDefaultBackgroundColorOverride", r#"{"color":{"r":0,"g":0,"b":0,"a":0}}"#)?;
                    call(&core, "Emulation.setDeviceMetricsOverride", &format!(r#"{{"width":{w},"height":{h},"deviceScaleFactor":1,"mobile":false}}"#))?;
                    // Every frame the page draws: a page sends one only when it changes, so "everyNthFrame" (which
                    // counts drawn frames, not time) stays 1; only a page that redraws without end is thinned to the rate.
                    let nth = if fps >= 30 { 1 } else { (30 / fps).max(1) };
                    call(&core, "Page.startScreencast", &format!(r#"{{"format":"png","maxWidth":{w},"maxHeight":{h},"everyNthFrame":{nth}}}"#))?;
                    Ok(())
                })();
                if let Err(error) = started {
                    eprintln!("browser source: {error}");
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn close(app: &AppHandle, id: &str) {
        if let Some(window) = app.get_webview_window(&label_of(id)) {
            let _ = window.destroy();
        }
    }

    pub fn reload(app: &AppHandle, id: &str) -> Result<(), String> {
        let window = app.get_webview_window(&label_of(id)).ok_or("no page")?;
        window.eval("location.reload()").map_err(|e| e.to_string())
    }

    /// Interact: one DevTools input event ("Input.dispatchMouseEvent" / "Input.dispatchKeyEvent" / ...).
    pub fn input(app: &AppHandle, id: &str, method: &str, params: &str) -> Result<(), String> {
        if !method.starts_with("Input.") {
            return Err("only input".into());
        }
        let window = app.get_webview_window(&label_of(id)).ok_or("no page")?;
        let (method, params) = (method.to_string(), params.to_string());
        window
            .with_webview(move |webview| unsafe {
                if let Ok(core) = webview.controller().CoreWebView2() {
                    let _ = call(&core, &method, &params);
                }
            })
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_and_styles() {
        assert_eq!(label_of("src_1-a"), "browser-src_1-a");
        assert_eq!(label_of("a/b c"), "browser-abc");
        let script = style_script("body { color: \"red\" }");
        assert!(script.contains(r#""body { color: \"red\" }""#), "{script}");
    }
}
