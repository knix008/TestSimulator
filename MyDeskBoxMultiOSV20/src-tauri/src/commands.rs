// 창이 부르는 명령 (Electron 판 src/main/ipc.js 와 preload.js 의 짝).
// 창 쪽 이름은 src/renderer/bridge.js 가 window.desk 로 그대로 잇는다.
//
// 모든 명령은 async 다. 동기 명령은 메인 스레드에서 돌아, 창을 만드는 일과 엇갈리면 멈춘다.

use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::host::{self, Shared};
use crate::tauri_ui::TauriUi;

fn sh(app: &AppHandle) -> Shared {
    app.state::<Shared>().inner().clone()
}

fn ui(app: &AppHandle) -> Arc<TauriUi> {
    app.state::<Arc<TauriUi>>().inner().clone()
}

#[derive(Deserialize)]
pub struct Bounds {
    id: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Deserialize)]
pub struct DrawRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

// 하나여도 되고 여러 개여도 된다.
fn paths_of(value: &Value) -> Vec<String> {
    match value {
        Value::String(s) => vec![s.clone()],
        Value::Array(list) => list.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
        _ => vec![],
    }
}

#[tauri::command]
pub async fn fence_ready(app: AppHandle, id: String) {
    host::lock(&sh(&app)).push(&id);
}

#[tauri::command]
pub async fn fence_bounds(app: AppHandle, rect: Bounds) {
    host::lock(&sh(&app)).apply_bounds(&rect.id, rect.x, rect.y, rect.w, rect.h, false);
}

#[tauri::command]
pub async fn fence_bounds_save(app: AppHandle, rect: Bounds) {
    let s = sh(&app);
    let mut h = host::lock(&s);
    h.apply_bounds(&rect.id, rect.x, rect.y, rect.w, rect.h, true);
    h.push(&rect.id);
}

#[tauri::command]
pub async fn fence_scroll(app: AppHandle, id: String, top: f64) {
    host::lock(&sh(&app)).set_scroll(&id, top);
}

// 어느 박스에서 고르기를 시작했다. 다른 박스의 고른 표시는 거둔다.
#[tauri::command]
pub async fn fence_picked(app: AppHandle, id: String) {
    host::lock(&sh(&app)).clear_picks(Some(&id));
}

// 아이콘을 끄는 동안 어디쯤인지 알려 온다.
#[tauri::command]
pub async fn fence_hover(app: AppHandle, payload: Option<Value>) {
    let s = sh(&app);
    let mut h = host::lock(&s);
    let path = payload.as_ref().and_then(|p| p.get("filePath")).and_then(Value::as_str).unwrap_or("");
    if path.is_empty() {
        h.clear_hover();
        return;
    }
    let p = payload.as_ref().unwrap();
    let x = p.get("screenX").and_then(Value::as_f64).unwrap_or(0.0);
    let y = p.get("screenY").and_then(Value::as_f64).unwrap_or(0.0);
    let icon = p.get("icon").and_then(Value::as_str).unwrap_or("").to_string();
    h.hover(path, x, y, &icon, false);
}

// 커서 아래가 다른 프로그램인가. 창은 끄는 도중에 묻는다.
#[tauri::command]
pub async fn fence_over_foreign(app: AppHandle, x: f64, y: f64) -> bool {
    host::lock(&sh(&app)).over_foreign(x, y)
}

// 다른 프로그램으로 파일을 넘긴다. 단추는 아직 눌려 있다.
#[tauri::command]
pub async fn fence_drag_out(app: AppHandle, window: WebviewWindow, paths: Value) -> bool {
    host::drag_out(&sh(&app), window.label(), &paths_of(&paths)).await
}

#[tauri::command]
pub async fn fence_collapse(app: AppHandle, id: String, collapsed: bool) {
    host::lock(&sh(&app)).set_collapsed(&id, collapsed);
}

// 받을 항목은 메인이 손을 뗀 자리에서 다시 잰다. 창은 어디서 뗐는지만 알려 준다.
#[tauri::command]
pub async fn fence_transfer(app: AppHandle, id: String, file_path: String, screen_x: f64, screen_y: f64, paths: Option<Vec<String>>) {
    host::lock(&sh(&app)).transfer(&id, &file_path, screen_x, screen_y, &paths.unwrap_or_default());
}

#[tauri::command]
pub async fn fence_copy(app: AppHandle, id: String, file_path: Value) -> bool {
    host::lock(&sh(&app)).copy_item(&id, &paths_of(&file_path))
}

#[tauri::command]
pub async fn fence_cut(app: AppHandle, id: String, file_path: Value) -> bool {
    host::lock(&sh(&app)).cut_item(&id, &paths_of(&file_path))
}

#[tauri::command]
pub async fn fence_delete(app: AppHandle, id: String, paths: Value) -> bool {
    host::trash_items(&sh(&app), &id, &paths_of(&paths)).await
}

#[tauri::command]
pub async fn fence_paste(app: AppHandle, id: String) -> bool {
    host::paste_files(&sh(&app), &id).await
}

// 창이 주는 자리는 그려진 항목 기준이다. 감춘 항목을 셈에 넣어 목록 자리로 바꾼다.
#[tauri::command]
pub async fn fence_drop(app: AppHandle, id: String, paths: Vec<String>, index: Option<f64>, into: Option<String>) {
    let index = index.filter(|n| n.is_finite() && *n >= 0.0).map(|n| n as usize);
    host::lock(&sh(&app)).drop_at(&id, &paths, index, into.as_deref().filter(|s| !s.is_empty()));
}

#[tauri::command]
pub async fn box_open(app: AppHandle, id: String) {
    host::lock(&sh(&app)).open_settings(&id);
}

#[tauri::command]
pub async fn box_ready(app: AppHandle, id: String) {
    host::lock(&sh(&app)).push_settings(&id);
}

#[tauri::command]
pub async fn box_change(app: AppHandle, id: String, patch: Value) {
    host::lock(&sh(&app)).change_box(&id, &patch);
}

#[tauri::command]
pub async fn box_close(app: AppHandle, id: String) {
    host::lock(&sh(&app)).close_settings(&id);
}

#[tauri::command]
pub async fn box_reset(app: AppHandle, id: String) {
    host::lock(&sh(&app)).reset_box(&id);
}

#[tauri::command]
pub async fn box_size(app: AppHandle, id: String, height: f64) {
    host::lock(&sh(&app)).fit_settings(&id, height);
}

#[tauri::command]
pub async fn prefs_ready(app: AppHandle) {
    host::lock(&sh(&app)).push_prefs();
}

#[tauri::command]
pub async fn prefs_change(app: AppHandle, patch: Value) {
    let s = sh(&app);
    let mut h = host::lock(&s);
    h.change_prefs(&patch);
    crate::fatal::set_lang(&h.state.settings.lang);
}

#[tauri::command]
pub async fn prefs_action(app: AppHandle, what: String) {
    host::lock(&sh(&app)).prefs_action(&what);
}

#[tauri::command]
pub async fn prefs_close(app: AppHandle) {
    host::lock(&sh(&app)).close_prefs();
}

#[tauri::command]
pub async fn fence_open(app: AppHandle, file_path: String) {
    host::lock(&sh(&app)).open_item(&file_path);
}

#[tauri::command]
pub async fn fence_menu(app: AppHandle, id: String, file_path: Option<String>, paths: Option<Vec<String>>) {
    host::show_menu(&sh(&app), &id, file_path.as_deref(), &paths.unwrap_or_default()).await;
}

#[tauri::command]
pub async fn fence_rename(app: AppHandle, id: String, title: String) {
    host::lock(&sh(&app)).rename(&id, &title);
}

// 박스에 담긴 항목 하나의 이름. 박스 폴더 안의 파일 이름이 바뀐다.
#[tauri::command]
pub async fn fence_rename_item(app: AppHandle, id: String, file_path: String, name: String) {
    host::rename_item(&sh(&app), &id, &file_path, &name).await;
}

#[tauri::command]
pub async fn fence_remove(app: AppHandle, id: String) {
    host::remove_fence(&sh(&app), &id).await;
}

#[tauri::command]
pub async fn draw_finish(app: AppHandle, rect: Option<DrawRect>) {
    let s = sh(&app);
    let mut h = host::lock(&s);
    match rect {
        Some(r) => {
            h.finish_draw(r.x, r.y, r.w, r.h);
        }
        None => h.cancel_draw(),
    }
}

#[tauri::command]
pub async fn draw_cancel(app: AppHandle) {
    host::lock(&sh(&app)).cancel_draw();
}

#[tauri::command]
pub async fn app_draw(app: AppHandle) {
    host::lock(&sh(&app)).begin_draw();
}

#[tauri::command]
pub async fn app_toggle(app: AppHandle) {
    host::lock(&sh(&app)).toggle_hidden();
}

#[tauri::command]
pub async fn ask_answer(app: AppHandle, id: String, ok: bool) {
    ui(&app).answer(&id, ok);
}

#[tauri::command]
pub async fn ask_size(app: AppHandle, id: String, height: f64) {
    ui(&app).ask_size(&id, height);
}

#[tauri::command]
pub async fn props_size(app: AppHandle, key: String, height: f64) {
    ui(&app).props_size(&key, height);
}

#[tauri::command]
pub async fn props_close(app: AppHandle, key: String) {
    ui(&app).props_close(&key);
}

#[tauri::command]
pub async fn fatal_copy(app: AppHandle) {
    crate::fatal::copy(&app);
}

#[tauri::command]
pub async fn fatal_close(app: AppHandle) {
    crate::fatal::close(&app);
}

// 검사용 (디버그 빌드만). 트레이의 '종료' 와 같은 길로 끝낸다.
#[tauri::command]
pub async fn debug_quit(app: AppHandle) {
    if cfg!(debug_assertions) {
        crate::ui::Ui::quit(ui(&app).as_ref());
    }
}

// 검사용 (디버그 빌드만). 박스 메뉴·트레이 메뉴에서 고른 것처럼 한다.
#[tauri::command]
pub async fn debug_action(app: AppHandle, name: String, id: Option<String>) {
    if !cfg!(debug_assertions) {
        return;
    }
    use crate::ui::Action;
    let id = id.unwrap_or_default();
    let action = match name.as_str() {
        "prefs" => Action::Prefs,
        "about" => Action::About,
        "draw" => Action::Draw,
        "toggle" => Action::ToggleHidden,
        "settings" => Action::Settings(id),
        "remove" => Action::Remove(id),
        "returnAll" => Action::ReturnAll,
        _ => return,
    };
    host::run_action(&sh(&app), action).await;
}
