// 검사용 가짜 창과 묻는 창 (Electron 판 test/helpers/fakes.js 의 makeElectron).

use serde_json::{json, Value};
use std::collections::VecDeque;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use super::{lock, Host, Shared};
use crate::autostart::{Autostart, Backend};
use crate::clipfiles::Clipboard;
use crate::desktop::fake::FakeDesktop;
use crate::geom::{Display, Point, Rect};
use crate::image::Picture;
use crate::pathx::{join, s};
use crate::store::{self, normalize_fence, Fence, State};
use crate::ui::{Action, Ask, BoxFut, MenuItem, Props, Ui, WinSpec};

#[derive(Debug, Clone)]
pub struct FakeWin {
    pub spec: WinSpec,
    pub visible: bool,
    pub bounds: Rect,
    pub sent: Vec<(String, Value)>,
    pub closed: bool,
    pub handle: u64,
}

impl FakeWin {
    pub fn messages(&self, event: &str) -> Vec<Value> {
        self.sent.iter().filter(|(e, _)| e == event).map(|(_, p)| p.clone()).collect()
    }
}

type DragHook = Box<dyn Fn(&[String]) + Send + Sync>;
type AskHook = Box<dyn Fn(&Ask) + Send + Sync>;

#[derive(Default)]
pub struct UiState {
    pub wins: Vec<FakeWin>,
    pub reply: bool,
    pub asks: Vec<Ask>,
    pub before_ask: Option<AskHook>,
    pub menus: Vec<Vec<MenuItem>>,
    pub props: Vec<Props>,
    pub dragged: Vec<(Vec<String>, bool)>,
    pub drag_hook: Option<DragHook>,
    pub opened: Vec<String>,
    pub trashed: Vec<String>,
    pub trash_fails: bool,
    pub tasks: VecDeque<BoxFut<()>>,
    pub cursor: Option<Point>,
    pub announced: usize,
    pub quit: bool,
    pub next_handle: u64,
}

pub struct FakeUi {
    pub st: Mutex<UiState>,
    pub user_dir: String,
}

impl FakeUi {
    pub fn st(&self) -> std::sync::MutexGuard<'_, UiState> {
        self.st.lock().unwrap()
    }
    pub fn win(&self, label: &str) -> Option<FakeWin> {
        self.st().wins.iter().rev().find(|w| w.spec.label == label).cloned()
    }
    pub fn pages(&self, page: &str) -> Vec<FakeWin> {
        self.st().wins.iter().filter(|w| w.spec.page.ends_with(page) && !w.closed).cloned().collect()
    }
    pub fn fences(&self) -> Vec<FakeWin> {
        self.pages("fence.html")
    }
}

impl Ui for FakeUi {
    fn open(&self, spec: WinSpec) {
        let mut st = self.st();
        st.next_handle += 1;
        let handle = 0x10000 + st.next_handle;
        let bounds = spec.bounds;
        st.wins.push(FakeWin { spec, visible: false, bounds, sent: vec![], closed: false, handle });
    }
    fn close(&self, label: &str) {
        let mut st = self.st();
        for w in st.wins.iter_mut().filter(|w| w.spec.label == label) {
            w.closed = true;
            w.visible = false;
        }
    }
    fn show(&self, label: &str, _activate: bool) {
        if let Some(w) = self.st().wins.iter_mut().rev().find(|w| w.spec.label == label && !w.closed) {
            w.visible = true;
        }
    }
    fn hide(&self, label: &str) {
        if let Some(w) = self.st().wins.iter_mut().rev().find(|w| w.spec.label == label && !w.closed) {
            w.visible = false;
        }
    }
    fn set_bounds(&self, label: &str, rect: Rect) {
        if let Some(w) = self.st().wins.iter_mut().rev().find(|w| w.spec.label == label && !w.closed) {
            w.bounds = rect;
        }
    }
    fn send(&self, label: &str, event: &str, payload: Value) {
        if let Some(w) = self.st().wins.iter_mut().rev().find(|w| w.spec.label == label && !w.closed) {
            w.sent.push((event.to_string(), payload));
        }
    }
    fn handle(&self, label: &str) -> u64 {
        self.win(label).map(|w| w.handle).unwrap_or(0)
    }
    fn handles(&self) -> Vec<u64> {
        self.st().wins.iter().filter(|w| !w.closed).map(|w| w.handle).collect()
    }
    fn cursor(&self) -> Option<Point> {
        Some(self.st().cursor.unwrap_or_default())
    }
    // 작업 영역이 들어 있어야 화면 안으로 들이기와 가장자리 붙이기가 검사된다.
    fn display_nearest(&self, _p: Point) -> Option<Display> {
        Some(Display { bounds: Rect::new(0.0, 0.0, 1920.0, 1080.0), work_area: Rect::new(0.0, 0.0, 1920.0, 1040.0) })
    }
    fn primary_work_area(&self) -> Rect {
        Rect::new(0.0, 0.0, 1920.0, 1080.0)
    }
    // 답은 풀 때 읽는다. 검사가 창이 떠 있는 동안 답을 바꿀 수 있게.
    fn confirm(&self, ask: Ask) -> BoxFut<bool> {
        let reply = {
            let mut st = self.st();
            st.asks.push(ask.clone());
            if let Some(hook) = &st.before_ask {
                hook(&ask);
            }
            st.reply
        };
        Box::pin(async move { reply || ask.lone })
    }
    fn props(&self, props: Props) {
        self.st().props.push(props);
    }
    fn menu(&self, _owner: &str, items: Vec<MenuItem>) -> BoxFut<Option<Action>> {
        self.st().menus.push(items);
        Box::pin(async { None })
    }
    fn drag_out(&self, _owner: &str, files: Vec<String>, icon: Option<Picture>) -> BoxFut<bool> {
        {
            let mut st = self.st();
            st.dragged.push((files.clone(), icon.is_some()));
            if let Some(hook) = &st.drag_hook {
                hook(&files);
            }
        }
        Box::pin(async { true })
    }
    fn blocking(&self, work: Box<dyn FnOnce() -> bool + Send>) -> BoxFut<bool> {
        let done = work();
        Box::pin(async move { done })
    }
    fn spawn(&self, fut: BoxFut<()>) {
        self.st().tasks.push_back(fut);
    }
    fn later(&self, _ms: u64, fut: BoxFut<()>) {
        self.st().tasks.push_back(fut);
    }
    fn open_path(&self, path: &str) {
        self.st().opened.push(path.to_string());
    }
    // 진짜 휴지통처럼 그 자리에서 없어진다.
    fn trash(&self, path: &str) -> bool {
        if self.st().trash_fails {
            return false;
        }
        self.st().trashed.push(path.to_string());
        let _ = crate::hold::remove_tree(Path::new(path));
        true
    }
    fn asset(&self, _name: &str) -> Option<Picture> {
        Some(Picture::solid(16, 16, 0x80))
    }
    fn user_dir(&self) -> String {
        self.user_dir.clone()
    }
    fn desktop_dir(&self) -> String {
        self.user_dir.clone()
    }
    fn announce(&self) {
        self.st().announced += 1;
    }
    fn quit(&self) {
        self.st().quit = true;
    }
}

pub struct Kit {
    pub sh: Shared,
    pub ui: Arc<FakeUi>,
    pub desk: Arc<FakeDesktop>,
    // 사용자 데이터 폴더. 검사가 직접 들여다볼 때 쓴다.
    #[allow(dead_code)]
    pub user: String,
}

impl Kit {
    pub fn h(&self) -> std::sync::MutexGuard<'_, Host> {
        lock(&self.sh)
    }
    pub fn state(&self) -> State {
        self.h().state.clone()
    }
    pub fn fence(&self, at: usize) -> Fence {
        self.h().state.fences[at].clone()
    }
    pub fn answer(&self, yes: bool) {
        self.ui.st().reply = yes;
    }
    // 미뤄 둔 일을 모두 푼다.
    pub fn settle(&self) {
        loop {
            let next = self.ui.st().tasks.pop_front();
            let Some(task) = next else { break };
            tauri::async_runtime::block_on(task);
        }
    }
    pub fn run<T>(&self, fut: impl std::future::Future<Output = T>) -> T {
        let out = tauri::async_runtime::block_on(fut);
        self.settle();
        out
    }
    pub fn open_all(&self) {
        self.h().open_all();
        self.settle();
    }
    // 창이 그리기를 마친 것처럼 (Electron 의 ready-to-show)
    pub fn ready_all(&self) {
        let labels: Vec<String> = self.ui.st().wins.iter().filter(|w| !w.closed).map(|w| w.spec.label.clone()).collect();
        for label in labels {
            self.h().window_loaded(&label);
        }
        self.settle();
    }
    pub fn open_ready(&self) {
        self.open_all();
        self.ready_all();
    }
    pub fn refresh(&self) {
        self.h().refresh_icons();
        self.settle();
    }
    pub fn fence_win(&self, at: usize) -> FakeWin {
        self.ui.fences()[at].clone()
    }
    pub fn root(&self) -> String {
        self.h().state.settings.root.clone()
    }
}

pub fn room() -> String {
    s(tempfile::tempdir().unwrap().keep())
}

// 박스는 제 폴더에서 돌아간다. 검사마다 빈 보관함을 따로 준다.
pub fn base_state(extra: Value) -> State {
    let mut state = store::defaults("ko-KR");
    state.did_welcome = true;
    state.settings.lang = "ko".into();
    state.settings.open_at_login = false;
    state.settings.root = room();
    if let Some(h) = extra.get("hidden").and_then(Value::as_bool) {
        state.hidden = h;
    }
    if let Some(w) = extra.get("didWelcome").and_then(Value::as_bool) {
        state.did_welcome = w;
    }
    if let Some(settings) = extra.get("settings").and_then(Value::as_object) {
        let mut base = serde_json::to_value(&state.settings).unwrap();
        for (k, v) in settings {
            base[k] = v.clone();
        }
        state.settings = serde_json::from_value(base).unwrap();
    }
    if let Some(list) = extra.get("fences").and_then(Value::as_array) {
        state.fences = list.iter().map(|raw| fence(raw.clone())).collect();
    }
    state
}

pub fn fence(extra: Value) -> Fence {
    let mut raw = json!({ "id": "a", "title": "박스", "x": 100, "y": 100, "w": 400, "h": 300, "theme": "ocean", "opacity": 0.52, "collapsed": false, "items": [] });
    if let Some(map) = extra.as_object() {
        for (k, v) in map {
            raw[k] = v.clone();
        }
    }
    normalize_fence(&raw)
}

pub fn kit(state: State) -> Kit {
    let user = room();
    let ui = Arc::new(FakeUi { st: Mutex::new(UiState::default()), user_dir: user.clone() });
    let desk = Arc::new(FakeDesktop::new());
    // 시작프로그램 등록은 설치본에서만 한다. 검사는 설치본처럼 군다.
    let auto = Autostart { packaged: true, exe: "C:/Apps/MyDeskBox.exe".into(), backend: Backend::Memory(Mutex::new(None)) };
    let sh = Host::new(state, ui.clone(), desk.clone(), Clipboard::memory(), auto);
    Kit { sh, ui, desk, user }
}

// 박스에서 빠지지 않도록 진짜 파일을 쓴다.
pub fn real_item(dir: &str, name: &str) -> Value {
    let full = join(dir, name);
    fs::write(&full, "").unwrap();
    json!({ "name": name, "path": full })
}
