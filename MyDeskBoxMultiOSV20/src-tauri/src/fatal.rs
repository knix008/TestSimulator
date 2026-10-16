// 큰 오류로 더 갈 수 없을 때 (Electron 판 main.js 의 fatal, tell, openReport, tellSystem).
//
// 먼저 바탕화면을 원래대로 돌려놓고, 그 다음에 무슨 일이었는지 알려 준다.
// 알림 창에서 손이 멈춰 있는 동안에도 담아 둔 파일은 이미 바탕화면에 돌아와 있어야 한다.
// 우리 창이 떠 있으면 그 창이 닫힐 때 끝낸다. 창을 띄우지 못하면 시스템 창으로 알린다.

use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::host::{self, Shared};
use crate::i18n;

static DYING: AtomicBool = AtomicBool::new(false);
static REPORT: OnceLock<Mutex<(String, String)>> = OnceLock::new();
static LANG: Mutex<String> = Mutex::new(String::new());

fn lang() -> String {
    let l = LANG.lock().unwrap().clone();
    if l.is_empty() {
        i18n::DEFAULT_LANG.into()
    } else {
        l
    }
}

pub fn set_lang(lang: &str) {
    *LANG.lock().unwrap() = lang.to_string();
}

pub fn install(app: AppHandle, sh: Shared) {
    let main_thread = std::thread::current().id();
    std::panic::set_hook(Box::new(move |info| {
        let body = format!("{info}\n\n{}", std::backtrace::Backtrace::force_capture());
        let version = app.package_info().version.to_string();
        fatal(&app, &sh, &crate::app::describe(&body, &version), std::thread::current().id() == main_thread);
    }));
}

fn fatal(app: &AppHandle, sh: &Shared, text: &str, on_main: bool) {
    // 두 번째 오류는 다시 알리지 않는다.
    if DYING.swap(true, Ordering::SeqCst) {
        return;
    }
    eprintln!("{text}");
    crate::app::restore_desktop(sh);
    if !on_main && open_report(app, text) {
        return;
    }
    tell_system(text);
    std::process::exit(1);
}

fn open_report(app: &AppHandle, text: &str) -> bool {
    let lang = lang();
    let report = json!({
        "title": i18n::t(&lang, "fatal.title"),
        "detail": i18n::t(&lang, "fatal.detail"),
        "copied": i18n::t(&lang, "fatal.copied"),
        "copy": i18n::t(&lang, "fatal.copy"),
        "close": i18n::t(&lang, "fatal.close"),
        "text": text,
    });
    let _ = REPORT.set(Mutex::new((text.to_string(), i18n::t(&lang, "fatal.copied"))));
    let query = format!("?report={}", host::encode_query(&report.to_string()));
    let (w, h) = (520.0, 420.0);
    let at = crate::screen::cursor_dip().unwrap_or_default();
    let area = crate::screen::display_nearest(at).map(|d| d.work_area).unwrap_or(crate::geom::Rect::new(0.0, 0.0, 1280.0, 800.0));
    let x = crate::js::round(area.x + (area.width - w) / 2.0);
    let y = crate::js::round(area.y + (area.height - h) / 2.4);
    let built = WebviewWindowBuilder::new(app, "fatal", WebviewUrl::App("renderer/fatal.html".into()))
        .title(i18n::t(&lang, "fatal.title"))
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .inner_size(w, h)
        .position(x, y)
        .disable_drag_drop_handler()
        .additional_browser_args(crate::tauri_ui::BROWSER_ARGS)
        .initialization_script(format!("window.__DESK_QUERY__ = {};", serde_json::to_string(&query).unwrap()))
        .build();
    let Ok(win) = built else { return false };
    let shown = win.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        let _ = shown.show();
        let _ = shown.set_always_on_top(true);
        let _ = shown.set_focus();
    });
    true
}

// '복사' — 오류 글 전체를 클립보드로.
pub fn copy(app: &AppHandle) {
    let Some(report) = REPORT.get() else { return };
    let (text, copied) = report.lock().unwrap().clone();
    if !crate::clipfiles::write_text(&text) {
        return;
    }
    let _ = app.emit_to(tauri::EventTarget::webview_window("fatal"), "fatal:copied", copied);
}

pub fn close(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("fatal") {
        let _ = win.destroy();
    }
    std::process::exit(1);
}

pub fn dying() -> bool {
    DYING.load(Ordering::SeqCst)
}

// 우리 창을 띄우지 못했을 때의 알림. '복사'를 고르면 오류 글이 클립보드로 간다.
fn tell_system(text: &str) {
    let lang = lang();
    for turn in 0..3 {
        let detail = format!("{}\n\n{text}", i18n::t(&lang, if turn > 0 { "fatal.copied" } else { "fatal.detail" }));
        if !ask_copy(&i18n::t(&lang, "fatal.title"), &detail, &i18n::t(&lang, "fatal.copy"), &i18n::t(&lang, "fatal.close")) {
            return;
        }
        if !crate::clipfiles::write_text(text) {
            return;
        }
    }
}

// 시스템 창으로 묻는다. '복사' 를 골랐으면 참.
#[cfg(windows)]
fn ask_copy(title: &str, detail: &str, copy: &str, close: &str) -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Controls::{TaskDialogIndirect, TASKDIALOGCONFIG, TASKDIALOG_BUTTON, TDF_ALLOW_DIALOG_CANCELLATION, TD_ERROR_ICON};
    let t = crate::reg::wide(title);
    let d = crate::reg::wide(detail);
    let c1 = crate::reg::wide(copy);
    let c2 = crate::reg::wide(close);
    let buttons = [
        TASKDIALOG_BUTTON { nButtonID: 100, pszButtonText: PCWSTR(c1.as_ptr()) },
        TASKDIALOG_BUTTON { nButtonID: 101, pszButtonText: PCWSTR(c2.as_ptr()) },
    ];
    let mut config = TASKDIALOGCONFIG {
        cbSize: std::mem::size_of::<TASKDIALOGCONFIG>() as u32,
        dwFlags: TDF_ALLOW_DIALOG_CANCELLATION,
        pszWindowTitle: PCWSTR(t.as_ptr()),
        pszMainInstruction: PCWSTR(t.as_ptr()),
        pszContent: PCWSTR(d.as_ptr()),
        cButtons: 2,
        pButtons: buttons.as_ptr(),
        nDefaultButton: 100,
        ..Default::default()
    };
    config.Anonymous1.pszMainIcon = TD_ERROR_ICON;
    let mut picked = 0i32;
    unsafe {
        if TaskDialogIndirect(&config, Some(&mut picked), None, None).is_err() {
            return false;
        }
    }
    picked == 100
}

#[cfg(not(windows))]
fn ask_copy(title: &str, detail: &str, copy: &str, close: &str) -> bool {
    let picked = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title(title)
        .set_description(detail)
        .set_buttons(rfd::MessageButtons::OkCancelCustom(copy.to_string(), close.to_string()))
        .show();
    matches!(picked, rfd::MessageDialogResult::Custom(ref s) if s == copy) || matches!(picked, rfd::MessageDialogResult::Ok)
}

// 이미 켜져 있다고 알린다 (바탕화면 아이콘을 다른 판이 다루고 있다).
pub fn alone(lang: &str) {
    let title = i18n::t(lang, "alone.title");
    let detail = i18n::t(lang, "alone.detail");
    eprintln!("{title}\n{detail}");
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let t = crate::reg::wide(&title);
        let d = crate::reg::wide(&detail);
        unsafe {
            MessageBoxW(None, PCWSTR(d.as_ptr()), PCWSTR(t.as_ptr()), MB_OK | MB_ICONERROR);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = rfd::MessageDialog::new().set_level(rfd::MessageLevel::Error).set_title(&title).set_description(&detail).show();
    }
}
