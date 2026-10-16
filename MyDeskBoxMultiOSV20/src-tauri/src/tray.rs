// 트레이 아이콘 (Electron 판 src/main/tray.js). 프로그램을 다루는 자리는 이것 하나뿐이다.
//
// 왼쪽 단추는 박스 그리기, 오른쪽 단추는 메뉴. 메뉴는 누를 때마다 지금 값으로 새로 만든다.
// Windows 는 그림이 든 라디오 항목을 보여야 해서 직접 그리는 메뉴(menu_win.rs)를 띄운다.

use std::sync::Arc;

use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

use crate::host::{self, Shared};
use crate::tauri_ui::TauriUi;

pub const TRAY_ID: &str = "main";

fn tray_image(ui: &TauriUi) -> Option<tauri::image::Image<'static>> {
    let asset = ui.app.asset_resolver().get("assets/tray@2x.png".into()).or_else(|| ui.app.asset_resolver().get("assets/tray.png".into()))?;
    tauri::image::Image::from_bytes(&asset.bytes).ok().map(|i| i.to_owned())
}

pub fn install(ui: &Arc<TauriUi>, sh: &Shared) -> Option<TrayIcon> {
    let tip = host::lock(sh).tray_tip();
    let mut builder = TrayIconBuilder::with_id(TRAY_ID).tooltip(tip).show_menu_on_left_click(false);
    if let Some(icon) = tray_image(ui) {
        builder = builder.icon(icon);
    }
    let shared = sh.clone();
    let handler_ui = ui.clone();
    builder = builder.on_tray_icon_event(move |_tray, event| {
        let TrayIconEvent::Click { button, button_state: MouseButtonState::Up, .. } = event else { return };
        let sh = shared.clone();
        let ui = handler_ui.clone();
        match button {
            MouseButton::Left => {
                tauri::async_runtime::spawn(async move {
                    host::lock(&sh).begin_draw();
                });
            }
            MouseButton::Right => {
                #[cfg(windows)]
                tauri::async_runtime::spawn(async move {
                    let items = host::lock(&sh).tray_menu();
                    let picked = crate::ui::Ui::menu(ui.as_ref(), "tray", items).await;
                    if let Some(action) = picked {
                        host::run_action(&sh, action).await;
                    }
                });
                #[cfg(not(windows))]
                let _ = (sh, ui);
            }
            _ => {}
        }
    });
    let tray = builder.build(&ui.app).ok()?;
    #[cfg(not(windows))]
    refresh_menu(ui, sh, &tray);
    Some(tray)
}

// 언어나 숨김이 바뀌었다. 풍선 글과 (다른 운영체제는) 메뉴를 다시 만든다.
pub fn refresh(ui: &Arc<TauriUi>) {
    let Some(sh) = ui.app.try_state::<Shared>().map(|s| s.inner().clone()) else { return };
    let Some(tray) = ui.app.tray_by_id(TRAY_ID) else { return };
    let tip = host::lock(&sh).tray_tip();
    let _ = tray.set_tooltip(Some(tip));
    #[cfg(not(windows))]
    refresh_menu(ui, &sh, &tray);
}

// ── Windows 가 아닌 운영체제: Tauri 메뉴 ──────────────────────────────────

#[cfg(not(windows))]
mod other {
    use super::*;
    use crate::ui::{Action, MenuItem as Item};
    use std::collections::HashMap;
    use std::sync::Mutex;
    use tauri::menu::{CheckMenuItem, IconMenuItem, Menu, MenuItemKind, PredefinedMenuItem, Submenu};

    pub static ACTIONS: Mutex<Option<HashMap<String, Action>>> = Mutex::new(None);

    fn icon(ui: &TauriUi, item: &crate::ui::MenuIcon) -> Option<tauri::image::Image<'static>> {
        let pic = ui.resolve_menu_icon(item, 32)?;
        Some(tauri::image::Image::new_owned(pic.rgba, pic.width, pic.height))
    }

    pub fn build(ui: &TauriUi, items: &[Item], prefix: &str, table: &mut HashMap<String, Action>) -> Vec<MenuItemKind<tauri::Wry>> {
        let app = &ui.app;
        let mut out = Vec::new();
        for (n, item) in items.iter().enumerate() {
            let id = format!("{prefix}{n}");
            match item {
                Item::Separator => {
                    if let Ok(sep) = PredefinedMenuItem::separator(app) {
                        out.push(MenuItemKind::Predefined(sep));
                    }
                }
                Item::Action { label, icon: ic, enabled, accel, action } => {
                    table.insert(id.clone(), action.clone());
                    let accel = (!accel.is_empty()).then(|| accel.replace("Ctrl", "CmdOrCtrl"));
                    if let Ok(entry) = IconMenuItem::with_id(app, &id, label, *enabled, icon(ui, ic), accel.as_deref()) {
                        out.push(MenuItemKind::Icon(entry));
                    }
                }
                Item::Check { label, checked, action, .. } | Item::Radio { label, checked, action, .. } => {
                    table.insert(id.clone(), action.clone());
                    if let Ok(entry) = CheckMenuItem::with_id(app, &id, label, true, *checked, None::<&str>) {
                        out.push(MenuItemKind::Check(entry));
                    }
                }
                Item::Sub { label, items, .. } => {
                    let kids = build(ui, items, &format!("{id}-"), table);
                    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = kids.iter().map(|k| k as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
                    if let Ok(sub) = Submenu::with_id_and_items(app, &id, label, true, &refs) {
                        out.push(MenuItemKind::Submenu(sub));
                    }
                }
            }
        }
        out
    }

    pub fn menu(ui: &TauriUi, items: &[Item], prefix: &str) -> Option<Menu<tauri::Wry>> {
        let mut table = HashMap::new();
        let kids = build(ui, items, prefix, &mut table);
        ACTIONS.lock().unwrap().get_or_insert_with(HashMap::new).extend(table);
        let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = kids.iter().map(|k| k as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
        Menu::with_items(&ui.app, &refs).ok()
    }
}

#[cfg(not(windows))]
fn refresh_menu(ui: &Arc<TauriUi>, sh: &Shared, tray: &TrayIcon) {
    let items = host::lock(sh).tray_menu();
    if let Some(menu) = other::menu(ui, &items, "tray-") {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_show_menu_on_left_click(cfg!(target_os = "macos"));
    }
}

// 박스 메뉴 (Windows 가 아닌 운영체제). 고른 일은 메뉴 사건으로 따로 온다.
#[cfg(not(windows))]
pub fn popup_other(ui: &TauriUi, owner: &str, items: &[crate::ui::MenuItem]) -> Option<crate::ui::Action> {
    let menu = other::menu(ui, items, "box-")?;
    if let Some(win) = ui.app.get_webview_window(owner) {
        let _ = win.popup_menu(&menu);
    }
    None
}

// 메뉴 사건 (Windows 가 아닌 운영체제).
#[cfg(not(windows))]
pub fn on_menu_event(app: &tauri::AppHandle, id: &str) {
    let action = other::ACTIONS.lock().unwrap().as_ref().and_then(|t| t.get(id).cloned());
    let Some(action) = action else { return };
    let Some(sh) = app.try_state::<Shared>().map(|s| s.inner().clone()) else { return };
    tauri::async_runtime::spawn(async move {
        host::run_action(&sh, action).await;
    });
}
