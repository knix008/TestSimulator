use std::sync::Mutex;

use tauri::{AppHandle, Manager, WebviewWindow};

pub struct EditState {
    label: Mutex<String>,
}

impl EditState {
    pub fn new() -> Self {
        Self {
            label: Mutex::new(String::new()),
        }
    }
}

pub fn install(app: &AppHandle) {
    app.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        let Some(state) = app.try_state::<EditState>() else {
            return;
        };
        let label = state.label.lock().expect("edit target").clone();
        let Some(window) = app.get_webview_window(&label) else {
            return;
        };
        if id == "lang-ko" || id == "lang-en" {
            let lang = if id == "lang-en" { "en" } else { "ko" };
            let _ = window.eval(format!(
                "if (typeof chooseLanguage === 'function') chooseLanguage('{lang}')"
            ));
            return;
        }
        let action = match id {
            "edit-undo" => "undo",
            "edit-redo" => "redo",
            "edit-cut" => "cut",
            "edit-copy" => "copy",
            "edit-paste" => "paste",
            "edit-selectAll" => "selectAll",
            _ => return,
        };
        let _ = window.eval(format!("document.execCommand('{action}')"));
    });
}

pub fn hide_builtin_menu(window: &WebviewWindow) {
    // with_webview waits until the UI thread runs the closure. The graph
    // button opens its window from a command that is already on that thread,
    // so calling it here would wait for a turn that can never start.
    let window = window.clone();
    std::thread::spawn(move || {
        for _ in 0..20 {
            let applied = window.with_webview(|platform| {
                #[cfg(windows)]
                unsafe {
                    if let Ok(core) = platform.controller().CoreWebView2() {
                        if let Ok(settings) = core.Settings() {
                            let _ = settings.SetAreDefaultContextMenusEnabled(false);
                        }
                    }
                }
                #[cfg(not(windows))]
                let _ = platform;
            });
            if applied.is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    });
}

#[derive(serde::Deserialize)]
pub struct EditRequest {
    editable: bool,
    #[serde(default)]
    selected: bool,
    lang: String,
}

#[tauri::command]
pub fn edit_menu(app: AppHandle, window: WebviewWindow, request: EditRequest) -> Result<(), String> {
    use muda::{Menu, MenuItem, PredefinedMenuItem};

    let english = request.lang == "en";
    let (undo_label, redo_label, cut_label, copy_label, paste_label, all_label) = if english {
        ("Undo", "Redo", "Cut", "Copy", "Paste", "Select all")
    } else {
        ("실행 취소", "다시 실행", "잘라내기", "복사", "붙여넣기", "모두 선택")
    };
    let menu = Menu::new();
    if request.editable {
        menu.append_items(&[
            &MenuItem::with_id("edit-undo", undo_label, true, None),
            &MenuItem::with_id("edit-redo", redo_label, true, None),
            &PredefinedMenuItem::separator(),
            &MenuItem::with_id("edit-cut", cut_label, true, None),
            &MenuItem::with_id("edit-copy", copy_label, true, None),
            &MenuItem::with_id("edit-paste", paste_label, true, None),
            &PredefinedMenuItem::separator(),
            &MenuItem::with_id("edit-selectAll", all_label, true, None),
        ])
        .map_err(|err| err.to_string())?;
        menu.append(&PredefinedMenuItem::separator())
            .map_err(|err| err.to_string())?;
    } else if request.selected {
        menu.append(&MenuItem::with_id("edit-copy", copy_label, true, None))
            .map_err(|err| err.to_string())?;
        menu.append(&PredefinedMenuItem::separator())
            .map_err(|err| err.to_string())?;
    }
    append_language(&menu, english)?;
    if let Some(state) = app.try_state::<EditState>() {
        *state.label.lock().expect("edit target") = window.label().to_string();
    }
    show_menu(&window, &menu)
}

fn append_language(menu: &muda::Menu, english: bool) -> Result<(), String> {
    use muda::{CheckMenuItem, Submenu};
    let ko = CheckMenuItem::with_id("lang-ko", "한국어", true, !english, None);
    let en = CheckMenuItem::with_id("lang-en", "English", true, english, None);
    let label = if english { "Language" } else { "언어" };
    let submenu = Submenu::with_items(label, true, &[&ko, &en]).map_err(|err| err.to_string())?;
    menu.append(&submenu).map_err(|err| err.to_string())
}

fn show_menu(window: &WebviewWindow, menu: &muda::Menu) -> Result<(), String> {
    #[cfg(windows)]
    {
        use muda::ContextMenu;
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        let handle = window.window_handle().map_err(|err| err.to_string())?;
        let RawWindowHandle::Win32(win) = handle.as_raw() else {
            return Ok(());
        };
        unsafe {
            menu.show_context_menu_for_hwnd(win.hwnd.get() as isize, None);
        }
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        let _ = (window, menu);
        Ok(())
    }
}
