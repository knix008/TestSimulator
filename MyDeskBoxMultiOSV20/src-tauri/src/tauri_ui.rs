// host.rs 가 쓰는 창·메뉴·묻는 창을 Tauri 로 만든다 (Electron 판 BrowserWindow, Menu, ask.js, props.js).
//
// 창은 모두 테두리 없이, 투명하게, 작업 표시줄에 올리지 않고 띄운다. 처음에는 숨겨 두고,
// 화면을 다 읽으면(page load) host.window_loaded 가 보여 준다 (Electron 의 ready-to-show).
//
// 이 파일의 함수는 메인 스레드가 아닌 곳(명령, 감시 스레드)에서 불린다. 메인 스레드에서만
// 해야 하는 일(메뉴, 끌어 넘기기)은 run_on_main_thread 로 넘기고 답을 기다린다.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::geom::{Display, Point, Rect, SHADOW};
use crate::host::{self, Shared};
use crate::image::Picture;
use crate::screen;
use crate::ui::{Action, Ask, BoxFut, MenuIcon, MenuItem, Props, Ui, WinSpec};

// 같은 프로필의 웹뷰는 모두 같은 인자를 써야 한다 (다르면 두 번째 창부터 만들어지지 않는다).
// 박스는 늘 다른 창 아래에 있다. 가려졌다고 그리기를 멈추면 창을 치웠을 때 빈 자리가 남는다.
pub const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --process-per-site --renderer-process-limit=1";

const ASK_W: f64 = 330.0;
const ASK_H: f64 = 160.0;
const PROPS_W: f64 = 408.0;
const PROPS_H: f64 = 340.0;

struct AskRec {
    label: String,
    reply: Option<tokio::sync::oneshot::Sender<bool>>,
    shown: bool,
}

struct PropsRec {
    label: String,
    shown: bool,
}

pub struct TauriUi {
    pub app: AppHandle,
    user: String,
    host: OnceLock<Shared>,
    asks: Mutex<HashMap<String, AskRec>>,
    props: Mutex<HashMap<String, PropsRec>>,
    next: AtomicU64,
    // 메뉴의 주인이 될 숨은 창 (트레이 메뉴용). 메인 스레드에서 만든다.
    pub owner: Mutex<u64>,
    // 창 번호. 만들 때 적어 둔다. Tauri 에게 물으면 메인 스레드를 기다리는데,
    // 메인 스레드가 끌어 넘기기나 메뉴 안에 있으면 그것이 끝날 때까지 멈춘다.
    hwnds: Mutex<HashMap<String, u64>>,
}

impl TauriUi {
    pub fn new(app: AppHandle, user: String) -> Arc<Self> {
        Arc::new(Self {
            app,
            user,
            host: OnceLock::new(),
            asks: Mutex::new(HashMap::new()),
            props: Mutex::new(HashMap::new()),
            next: AtomicU64::new(0),
            owner: Mutex::new(0),
            hwnds: Mutex::new(HashMap::new()),
        })
    }

    pub fn attach(&self, sh: Shared) {
        let _ = self.host.set(sh);
    }

    fn host(&self) -> Option<Shared> {
        self.host.get().cloned()
    }

    fn window(&self, label: &str) -> Option<tauri::WebviewWindow> {
        self.app.get_webview_window(label)
    }

    // 창을 만든다. 만든 뒤에 물리 픽셀로 자리를 다시 놓는다 (배율이 다른 화면에서도 정확히).
    fn build(self: &Arc<Self>, spec: &WinSpec, init: String) -> Option<tauri::WebviewWindow> {
        let me = Arc::downgrade(self);
        let label = spec.label.clone();
        let mut builder = WebviewWindowBuilder::new(&self.app, &spec.label, WebviewUrl::App(spec.page.into()))
            .title("MyDeskBox")
            .transparent(true)
            .background_color(tauri::webview::Color(0, 0, 0, 0))
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .skip_taskbar(true)
            .visible(false)
            .focused(false)
            .focusable(spec.focusable)
            .always_on_top(spec.always_on_top)
            .inner_size(spec.bounds.width.max(1.0), spec.bounds.height.max(1.0))
            .position(spec.bounds.x, spec.bounds.y)
            .additional_browser_args(BROWSER_ARGS)
            .initialization_script(init)
            .on_page_load(move |_win, payload| {
                if payload.event() != PageLoadEvent::Finished {
                    return;
                }
                if let Some(ui) = me.upgrade() {
                    ui.loaded(&label);
                }
            });
        // 탐색기에서 끌어다 놓는 길은 박스 창만 받는다. 나머지 창은 웹 페이지처럼 둔다.
        if !spec.fence {
            builder = builder.disable_drag_drop_handler();
        }
        if spec.fence {
            builder = builder.visible_on_all_workspaces(true);
        }
        let win = builder.build().ok()?;
        #[cfg(windows)]
        if let Ok(hwnd) = win.hwnd() {
            win32::prepare(hwnd.0 as isize);
            self.hwnds.lock().unwrap().insert(spec.label.clone(), hwnd.0 as isize as u64);
        }
        self.place(&win, spec.bounds);
        Some(win)
    }

    fn place(&self, win: &tauri::WebviewWindow, rect: Rect) {
        #[cfg(windows)]
        {
            let known = self.hwnds.lock().unwrap().get(win.label()).copied();
            if let Some(hwnd) = known {
                win32::set_bounds(hwnd as isize, screen::dip_rect_to_phys(rect));
                return;
            }
        }
        let _ = win.set_position(tauri::LogicalPosition::new(rect.x, rect.y));
        let _ = win.set_size(tauri::LogicalSize::new(rect.width, rect.height));
    }

    // 화면을 다 읽었다.
    fn loaded(self: &Arc<Self>, label: &str) {
        let label = label.to_string();
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            if label.starts_with("ask-") {
                // 높이를 알려 주지 못하더라도 창은 보여 준다.
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                me.reveal_ask_by_label(&label);
                return;
            }
            if label.starts_with("props-") {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                me.reveal_props_by_label(&label);
                return;
            }
            if label == "fatal" {
                return;
            }
            if let Some(sh) = me.host() {
                host::lock(&sh).window_loaded(&label);
            }
        });
    }

    // 창이 없어졌다 (닫았거나 사람이 Alt+F4 로 닫았다).
    pub fn closed(&self, label: &str) {
        self.hwnds.lock().unwrap().remove(label);
        let mut asks = self.asks.lock().unwrap();
        let ids: Vec<String> = asks.iter().filter(|(_, r)| r.label == label).map(|(id, _)| id.clone()).collect();
        for id in ids {
            if let Some(mut rec) = asks.remove(&id) {
                // 창을 그냥 닫으면 안 하겠다는 뜻이다.
                if let Some(tx) = rec.reply.take() {
                    let _ = tx.send(false);
                }
            }
        }
        drop(asks);
        self.props.lock().unwrap().retain(|_, r| r.label != label);
        if let Some(sh) = self.host() {
            let label = label.to_string();
            tauri::async_runtime::spawn(async move {
                host::lock(&sh).window_closed(&label);
            });
        }
    }

    fn icon_url(&self, name: &str) -> String {
        if name.is_empty() {
            return String::new();
        }
        // 고해상도 그림이 있으면 그것을 쓴다. 창은 CSS 크기로 줄여 그린다.
        let hi = name.replace(".png", "@2x.png");
        self.asset(&hi).or_else(|| self.asset(name)).map(|p| p.data_url()).unwrap_or_default()
    }

    // 커서가 있는 화면 한가운데.
    fn middle(&self, width: f64, height: f64, least: f64) -> Rect {
        let at = screen::cursor_dip().unwrap_or_default();
        let area = screen::display_nearest(at).map(|d| d.work_area).unwrap_or(Rect::new(0.0, 0.0, 1280.0, 800.0));
        let w = width + SHADOW * 2.0;
        let h = height.max(least) + SHADOW * 2.0;
        Rect::new(crate::js::round(area.x + (area.width - w) / 2.0), crate::js::round(area.y + (area.height - h) / 2.4), w, h)
    }

    fn reveal(&self, label: &str) {
        if let Some(win) = self.window(label) {
            let _ = win.show();
            let _ = win.set_always_on_top(true);
            let _ = win.set_focus();
        }
    }

    // ── 묻는 창 ─────────────────────────────────────────────────────────

    pub fn answer(&self, id: &str, ok: bool) {
        let rec = self.asks.lock().unwrap().remove(id);
        if let Some(mut rec) = rec {
            if let Some(tx) = rec.reply.take() {
                let _ = tx.send(ok);
            }
            if let Some(win) = self.window(&rec.label) {
                let _ = win.close();
            }
        }
    }

    pub fn ask_size(&self, id: &str, height: f64) {
        let label = {
            let mut asks = self.asks.lock().unwrap();
            let Some(rec) = asks.get_mut(id) else { return };
            rec.shown = true;
            rec.label.clone()
        };
        if let Some(win) = self.window(&label) {
            if height > 0.0 {
                self.place(&win, self.middle(ASK_W, height, 90.0));
            }
        }
        self.reveal(&label);
    }

    fn reveal_ask_by_label(&self, label: &str) {
        let mut asks = self.asks.lock().unwrap();
        let Some(rec) = asks.values_mut().find(|r| r.label == label) else { return };
        if rec.shown {
            return;
        }
        rec.shown = true;
        drop(asks);
        self.reveal(label);
    }

    // ── 속성 창 ─────────────────────────────────────────────────────────

    pub fn props_size(&self, key: &str, height: f64) {
        let label = {
            let mut props = self.props.lock().unwrap();
            let Some(rec) = props.get_mut(key) else { return };
            rec.shown = true;
            rec.label.clone()
        };
        if let Some(win) = self.window(&label) {
            if height > 0.0 {
                self.place(&win, self.middle(PROPS_W, height, 120.0));
            }
        }
        self.reveal(&label);
    }

    pub fn props_close(&self, key: &str) {
        let label = self.props.lock().unwrap().get(key).map(|r| r.label.clone());
        if let Some(win) = label.and_then(|l| self.window(&l)) {
            let _ = win.close();
        }
    }

    fn reveal_props_by_label(&self, label: &str) {
        let mut props = self.props.lock().unwrap();
        let Some(rec) = props.values_mut().find(|r| r.label == label) else { return };
        if rec.shown {
            return;
        }
        rec.shown = true;
        drop(props);
        self.reveal(label);
    }

    fn query_script(query: &str) -> String {
        format!("window.__DESK_QUERY__ = {};", serde_json::to_string(query).unwrap())
    }

    fn resolve_icon(&self, icon: &MenuIcon, size: u32) -> Option<Picture> {
        let pic = match icon {
            MenuIcon::None => return None,
            MenuIcon::Pic(p) => p.clone(),
            MenuIcon::Asset(name) => {
                let hi = name.replace(".png", "@2x.png");
                if size > 16 {
                    self.asset(&hi).or_else(|| self.asset(name))?
                } else {
                    self.asset(name).or_else(|| self.asset(&hi))?
                }
            }
        };
        Some(if pic.width == size && pic.height == size { pic } else { pic.resize(size, size, true) })
    }

    // 트레이 메뉴처럼 박스 창이 아닌 주인에게 띄운다.
    pub fn menu_owner(&self, owner: &str) -> u64 {
        if owner == "tray" {
            return *self.owner.lock().unwrap();
        }
        self.handle(owner)
    }
}

impl Ui for TauriUi {
    fn open(&self, spec: WinSpec) {
        // self 가 Arc 안에 있다는 것을 안다 (TauriUi::new 가 Arc 로만 만든다).
        let me = self.app.state::<Arc<TauriUi>>().inner().clone();
        let init = Self::query_script(&spec.query);
        me.build(&spec, init);
    }

    fn close(&self, label: &str) {
        if let Some(win) = self.window(label) {
            let _ = win.close();
        }
    }

    fn show(&self, label: &str, activate: bool) {
        let Some(win) = self.window(label) else { return };
        #[cfg(windows)]
        {
            if !activate {
                let known = self.hwnds.lock().unwrap().get(label).copied();
                if let Some(hwnd) = known {
                    win32::show_no_activate(hwnd as isize);
                    let _ = win.set_skip_taskbar(true);
                    return;
                }
            }
        }
        let _ = win.show();
        let _ = win.set_skip_taskbar(true);
        if activate {
            let _ = win.set_focus();
        }
    }

    fn hide(&self, label: &str) {
        if let Some(win) = self.window(label) {
            let _ = win.hide();
        }
    }

    fn set_bounds(&self, label: &str, rect: Rect) {
        if let Some(win) = self.window(label) {
            self.place(&win, rect);
        }
    }

    fn send(&self, label: &str, event: &str, payload: Value) {
        let _ = self.app.emit_to(tauri::EventTarget::webview_window(label), event, payload);
    }

    fn handle(&self, label: &str) -> u64 {
        self.hwnds.lock().unwrap().get(label).copied().unwrap_or(0)
    }

    fn handles(&self) -> Vec<u64> {
        let mut out: Vec<u64> = self.hwnds.lock().unwrap().values().copied().collect();
        let owner = *self.owner.lock().unwrap();
        if owner != 0 {
            out.push(owner);
        }
        out
    }

    fn cursor(&self) -> Option<Point> {
        screen::cursor_dip()
    }

    fn display_nearest(&self, p: Point) -> Option<Display> {
        screen::display_nearest(p)
    }

    fn primary_work_area(&self) -> Rect {
        screen::primary().map(|m| m.dip_work).unwrap_or(Rect::new(0.0, 0.0, 1280.0, 800.0))
    }

    fn confirm(&self, ask: Ask) -> BoxFut<bool> {
        let n = self.next.fetch_add(1, Ordering::SeqCst) + 1;
        let id = format!("ask{n}");
        let label = format!("ask-{n}");
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.asks.lock().unwrap().insert(id.clone(), AskRec { label: label.clone(), reply: Some(tx), shown: false });
        let body = json!({
            "id": id,
            "title": ask.title,
            "detail": ask.detail,
            "confirm": if ask.confirm.is_empty() { "OK".to_string() } else { ask.confirm.clone() },
            "cancel": if ask.cancel.is_empty() { "Cancel".to_string() } else { ask.cancel.clone() },
            "danger": ask.danger,
            "lone": ask.lone,
            "icon": self.icon_url(&ask.icon),
        });
        let query = format!("?ask={}", host::encode_query(&body.to_string()));
        let spec = WinSpec {
            label,
            page: "renderer/ask.html",
            query,
            bounds: self.middle(ASK_W, ASK_H, 90.0),
            focusable: true,
            always_on_top: true,
            ignore_mouse: false,
            fence: false,
        };
        let me = self.app.state::<Arc<TauriUi>>().inner().clone();
        // 창을 만드는 일은 메인 스레드가 아닌 곳에서 한다. 이 함수는 명령 안에서도 불린다.
        tauri::async_runtime::spawn_blocking(move || {
            let init = TauriUi::query_script(&spec.query);
            if me.build(&spec, init).is_none() {
                me.answer(&id, false);
            }
        });
        Box::pin(async move { rx.await.unwrap_or(false) })
    }

    fn props(&self, props: Props) {
        let existing = self.props.lock().unwrap().get(&props.key).map(|r| r.label.clone());
        if let Some(label) = existing {
            if self.window(&label).is_some() {
                self.reveal(&label);
                return;
            }
        }
        let n = self.next.fetch_add(1, Ordering::SeqCst) + 1;
        let label = format!("props-{n}");
        self.props.lock().unwrap().insert(props.key.clone(), PropsRec { label: label.clone(), shown: false });
        let rows: Vec<Value> = props.rows.iter().filter(|r| !r.label.is_empty()).map(|r| json!(r)).collect();
        let body = json!({
            "key": props.key,
            "title": props.title,
            "kind": props.kind,
            "close": props.close,
            "icon": props.icon.map(|p| p.data_url()).unwrap_or_default(),
            "rows": rows,
        });
        let spec = WinSpec {
            label,
            page: "renderer/props.html",
            query: format!("?props={}", host::encode_query(&body.to_string())),
            bounds: self.middle(PROPS_W, PROPS_H, 120.0),
            focusable: true,
            always_on_top: true,
            ignore_mouse: false,
            fence: false,
        };
        let me = self.app.state::<Arc<TauriUi>>().inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let init = TauriUi::query_script(&spec.query);
            me.build(&spec, init);
        });
    }

    fn menu(&self, owner: &str, items: Vec<MenuItem>) -> BoxFut<Option<Action>> {
        let me = self.app.state::<Arc<TauriUi>>().inner().clone();
        let owner_handle = self.menu_owner(owner);
        let owner_label = owner.to_string();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let _ = self.app.run_on_main_thread(move || {
            let picked = me.popup(owner_handle, &owner_label, &items);
            let _ = tx.send(picked);
        });
        Box::pin(async move { rx.await.ok().flatten() })
    }

    fn drag_out(&self, owner: &str, files: Vec<String>, icon: Option<Picture>) -> BoxFut<bool> {
        let me = self.app.state::<Arc<TauriUi>>().inner().clone();
        let owner = owner.to_string();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let _ = self.app.run_on_main_thread(move || {
            let done = me.start_drag(&owner, &files, icon.as_ref());
            let _ = tx.send(done);
        });
        Box::pin(async move { rx.await.unwrap_or(false) })
    }

    fn blocking(&self, work: Box<dyn FnOnce() -> bool + Send>) -> BoxFut<bool> {
        Box::pin(async move { tauri::async_runtime::spawn_blocking(work).await.unwrap_or(false) })
    }

    fn spawn(&self, fut: BoxFut<()>) {
        tauri::async_runtime::spawn(fut);
    }

    fn later(&self, ms: u64, fut: BoxFut<()>) {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
            fut.await;
        });
    }

    fn open_path(&self, path: &str) {
        crate::shell::open(path);
    }

    fn trash(&self, path: &str) -> bool {
        crate::shell::trash(path)
    }

    fn file_icon(&self, path: &str) -> Option<Picture> {
        crate::shell::file_icon(path, |name| self.asset(name))
    }

    fn asset(&self, name: &str) -> Option<Picture> {
        let asset = self.app.asset_resolver().get(format!("assets/{name}"))?;
        Picture::from_bytes(&asset.bytes)
    }

    fn app_name(&self) -> String {
        self.app.package_info().name.clone()
    }

    fn app_version(&self) -> String {
        self.app.package_info().version.to_string()
    }

    fn user_dir(&self) -> String {
        self.user.clone()
    }

    fn desktop_dir(&self) -> String {
        self.app.path().desktop_dir().map(crate::pathx::s).unwrap_or_else(|_| crate::paths::desktop_fallback())
    }

    fn announce(&self) {
        let me = self.app.state::<Arc<TauriUi>>().inner().clone();
        tauri::async_runtime::spawn(async move {
            crate::tray::refresh(&me);
        });
    }

    fn quit(&self) {
        let app = self.app.clone();
        let sh = self.host();
        // 끝내기 전에 바탕화면을 되돌린다 (Electron 의 before-quit). 자물쇠를 기다릴 수 있으니 따로 돈다.
        std::thread::spawn(move || {
            if let Some(sh) = sh {
                crate::app::restore_desktop(&sh);
            }
            app.exit(0);
        });
    }
}

impl TauriUi {
    // 메인 스레드에서 돈다.
    fn popup(&self, owner: u64, owner_label: &str, items: &[MenuItem]) -> Option<Action> {
        #[cfg(windows)]
        {
            let hwnd = windows::Win32::Foundation::HWND(owner as isize as *mut std::ffi::c_void);
            let size = crate::menu_win::icon_size(hwnd);
            let _ = owner_label;
            return crate::menu_win::popup(hwnd, items, &|icon| self.resolve_icon(icon, size));
        }
        #[cfg(not(windows))]
        {
            let _ = owner;
            return crate::tray::popup_other(self, owner_label, items);
        }
    }

    // 메인 스레드에서 돈다.
    fn start_drag(&self, owner: &str, files: &[String], icon: Option<&Picture>) -> bool {
        #[cfg(windows)]
        {
            let hwnd = windows::Win32::Foundation::HWND(self.handle(owner) as isize as *mut std::ffi::c_void);
            return crate::dragout::start(hwnd, files, icon);
        }
        #[cfg(not(windows))]
        {
            let Some(win) = self.window(owner) else { return false };
            return crate::shell::start_drag(&win, files, icon);
        }
    }

    #[allow(dead_code)]
    pub fn resolve_menu_icon(&self, icon: &MenuIcon, size: u32) -> Option<Picture> {
        self.resolve_icon(icon, size)
    }
}

#[cfg(windows)]
pub mod win32 {
    use crate::geom::Rect;
    use std::ffi::c_void;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND};
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, ShowWindow, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOZORDER, SW_SHOWNOACTIVATE,
    };

    fn hwnd(n: isize) -> HWND {
        HWND(n as *mut c_void)
    }

    // 둥근 모서리를 끈다. 그림자를 켠 박스의 바깥 여백이 잘리지 않게.
    pub fn prepare(n: isize) {
        let pref = DWMWCP_DONOTROUND;
        unsafe {
            let _ = DwmSetWindowAttribute(hwnd(n), DWMWA_WINDOW_CORNER_PREFERENCE, &pref as *const _ as *const c_void, 4);
        }
    }

    // 창을 놓는다. 테두리 없는 Tauri 창은 바깥과 안쪽(클라이언트)이 같다.
    // 만든 직후에는 아직 테두리가 남아 있어 그때 재어 보정하면 테두리만큼 커진다.
    pub fn set_bounds(n: isize, rect: Rect) {
        unsafe {
            let _ = SetWindowPos(hwnd(n), None, rect.x as i32, rect.y as i32, rect.width as i32, rect.height as i32, SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        }
    }

    // 포커스를 빼앗지 않고 보인다 (Electron 의 showInactive).
    pub fn show_no_activate(n: isize) {
        unsafe {
            let _ = ShowWindow(hwnd(n), SW_SHOWNOACTIVATE);
        }
    }
}
