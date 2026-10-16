// MyDeskBox — 바탕화면 박스. Tauri 2 판.
//
// 어느 길로 갈지 고른다.
//  --restore-desktop : 창을 띄우지 않고 바탕화면만 되돌리고 끝낸다. 설치·제거 프로그램이 부른다.
//                      하나만 켜기 빗장을 지나지 않는다. 지우는 길에 그 빗장에 걸려서는 안 된다.
//  --icon-list       : 바탕화면 아이콘 목록을 JSON 으로 찍고 끝낸다 (tools/icon-check.js).
//  그 밖             : 박스를 띄운다. 이미 켜져 있으면 먼저 켠 쪽이 박스 그리기를 시작하고 이 쪽은 물러난다.

pub mod app;
#[cfg(test)]
mod app_tests;
pub mod autostart;
pub mod catalog;
pub mod clipfiles;
mod commands;
pub mod conceal;
pub mod deskgrid;
pub mod deskpick;
pub mod desktop;
#[cfg(windows)]
mod dragout;
mod fatal;
pub mod geom;
pub mod hold;
pub mod host;
pub mod i18n;
pub mod image;
pub mod js;
#[cfg(windows)]
mod menu_win;
pub mod paths;
pub mod pathx;
#[cfg(windows)]
pub mod reg;
pub mod restore;
pub mod screen;
mod session;
mod shell;
pub mod store;
mod tauri_ui;
pub mod themes;
mod tray;
pub mod ui;
pub(crate) mod watch;

use std::path::Path;
use std::sync::Arc;

use tauri::{Manager, RunEvent, WindowEvent};

use crate::autostart::Autostart;
use crate::clipfiles::Clipboard;
use crate::desktop::Desktop;
use crate::host::{Host, Shared};
use crate::tauri_ui::TauriUi;

// 바탕화면을 켜기 전 모습으로 돌려놓고 끝낸다. 되돌리지 못한 파일이 있으면 2 로 끝낸다.
fn restore_mode() -> i32 {
    let user = paths::user_dir();
    let state = store::load(Path::new(&user), "");
    let desk = desktop::platform();
    let dir = desk.desktop_directories().into_iter().next().unwrap_or_else(paths::desktop_fallback);
    let report = restore::restore_desktop(desk.as_ref(), &user, &dir, &state.settings.root);
    println!("돌려보낸 파일 {}개, 되돌리지 못한 파일 {}개", report.back.len() + report.strays.len(), report.left.len());
    if report.left.is_empty() {
        0
    } else {
        2
    }
}

#[cfg(windows)]
fn icon_list() -> i32 {
    let desk = desktop::windows::WinDesktop::new();
    let list: Vec<serde_json::Value> =
        desk.debug_list().into_iter().map(|i| serde_json::json!({ "index": i.index, "name": i.name, "x": i.x, "y": i.y })).collect();
    println!("{}", serde_json::Value::Array(list));
    0
}

#[cfg(not(windows))]
fn icon_list() -> i32 {
    println!("[]");
    0
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--restore-desktop") {
        std::process::exit(restore_mode());
    }
    if args.iter().any(|a| a == "--icon-list") {
        std::process::exit(icon_list());
    }
    // Ctrl+C 와 신호. 다른 스레드를 만들기 전에 건다.
    session::watch_console();

    let user = paths::user_dir();
    let state = store::load(Path::new(&user), &i18n::system_locale());
    let lang = state.settings.lang.clone();
    fatal::set_lang(&lang);

    #[cfg(windows)]
    let win_desk = Arc::new(desktop::windows::WinDesktop::new());
    #[cfg(windows)]
    let desk: Arc<dyn Desktop> = win_desk.clone();
    #[cfg(not(windows))]
    let desk: Arc<dyn Desktop> = desktop::platform();

    let builder = tauri::Builder::default()
        // 같은 프로그램을 또 켰다. 먼저 켠 쪽이 박스를 그리므로 이 쪽은 조용히 물러나고, 먼저 켠 쪽이 그리기를 시작한다.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let Some(sh) = app.try_state::<Shared>().map(|s| s.inner().clone()) else { return };
            tauri::async_runtime::spawn(async move {
                host::lock(&sh).begin_draw();
            });
        }))
        .invoke_handler(tauri::generate_handler![
            commands::fence_ready,
            commands::fence_bounds,
            commands::fence_bounds_save,
            commands::fence_scroll,
            commands::fence_picked,
            commands::fence_hover,
            commands::fence_over_foreign,
            commands::fence_drag_out,
            commands::fence_collapse,
            commands::fence_transfer,
            commands::fence_copy,
            commands::fence_cut,
            commands::fence_delete,
            commands::fence_paste,
            commands::fence_drop,
            commands::box_open,
            commands::box_ready,
            commands::box_change,
            commands::box_close,
            commands::box_reset,
            commands::box_size,
            commands::prefs_ready,
            commands::prefs_change,
            commands::prefs_action,
            commands::prefs_close,
            commands::fence_open,
            commands::fence_menu,
            commands::fence_rename,
            commands::fence_rename_item,
            commands::fence_remove,
            commands::draw_finish,
            commands::draw_cancel,
            commands::app_draw,
            commands::app_toggle,
            commands::ask_answer,
            commands::ask_size,
            commands::props_size,
            commands::props_close,
            commands::fatal_copy,
            commands::fatal_close,
            commands::debug_quit,
            commands::debug_action,
        ])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            #[cfg(not(windows))]
            screen::attach(app.handle().clone());
            // 바탕화면 아이콘은 하나뿐이라 두 벌이 함께 다루면 아이콘이 깜빡인다.
            // 설치본과 소스를 같이 켠 경우처럼 설정 폴더가 달라도 여기서 걸러진다.
            if !desk.claim_single_instance() {
                fatal::alone(&lang);
                std::process::exit(0);
            }
            let ui = TauriUi::new(app.handle().clone(), user.clone());
            app.manage(ui.clone());
            let packaged = !tauri::is_dev();
            let sh = Host::new(state.clone(), ui.clone(), desk.clone(), Clipboard::system(), Autostart::system(packaged));
            ui.attach(sh.clone());
            app.manage(sh.clone());
            session::attach(sh.clone());
            *ui.owner.lock().unwrap() = session::owner_window();
            fatal::install(app.handle().clone(), sh.clone());
            tray::install(&ui, &sh);
            #[cfg(windows)]
            let watch_desk = win_desk.clone();
            let started = sh.clone();
            tauri::async_runtime::spawn(async move {
                app::start(&started).await;
                let watch = watch::start(
                    &started,
                    #[cfg(windows)]
                    watch_desk,
                );
                watch::keep(watch);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                if label == "fatal" {
                    std::process::exit(1);
                }
                if let Some(ui) = window.app_handle().try_state::<Arc<TauriUi>>() {
                    ui.closed(&label);
                }
            }
        });

    #[cfg(not(windows))]
    let builder = builder.on_menu_event(|app, event| tray::on_menu_event(app, event.id().as_ref()));

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(err) => {
            eprintln!("MyDeskBox 를 띄우지 못했습니다: {err}");
            std::process::exit(1);
        }
    };
    app.run(|handle, event| match event {
        // 창이 모두 닫혀도 트레이에 남는다. 끝내기는 트레이의 '종료' 로만.
        RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none() && !fatal::dying() {
                api.prevent_exit();
            }
        }
        // 어느 길로 끝나든 바탕화면을 되돌린다. 두 번 불러도 한 번만 한다.
        RunEvent::Exit => {
            if let Some(sh) = handle.try_state::<Shared>() {
                app::restore_desktop(sh.inner());
            }
        }
        _ => {}
    });
}
