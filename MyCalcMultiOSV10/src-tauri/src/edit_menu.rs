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
        let action = match event.id().as_ref() {
            "edit-undo" => "undo",
            "edit-redo" => "redo",
            "edit-cut" => "cut",
            "edit-copy" => "copy",
            "edit-paste" => "paste",
            "edit-selectAll" => "selectAll",
            _ => return,
        };
        let Some(state) = app.try_state::<EditState>() else {
            return;
        };
        let label = state.label.lock().expect("edit target").clone();
        let Some(window) = app.get_webview_window(&label) else {
            return;
        };
        let _ = window.eval(format!("document.execCommand('{action}')"));
    });
}

pub fn hide_builtin_menu(window: &WebviewWindow) {
    let _ = window.with_webview(|platform| {
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
}

#[derive(serde::Deserialize)]
pub struct EditRequest {
    editable: bool,
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
    } else {
        menu.append(&MenuItem::with_id("edit-copy", copy_label, true, None))
            .map_err(|err| err.to_string())?;
    }
    if let Some(state) = app.try_state::<EditState>() {
        *state.label.lock().expect("edit target") = window.label().to_string();
    }
    show_menu(&window, &menu)
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
