// 박스 쪽(host.rs)이 창·메뉴·묻는 창을 다루는 길. 진짜는 Tauri(tauri_ui.rs), 검사는 가짜(host_tests).
//
// Electron 판에서 BrowserWindow, Menu, screen, shell, ask.js, props.js 가 하던 일이다.

use serde::Serialize;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

use crate::desktop::Entry;
use crate::geom::{Display, Point, Rect};
use crate::image::Picture;

pub type BoxFut<T> = Pin<Box<dyn Future<Output = T> + Send + 'static>>;

#[derive(Debug, Clone, PartialEq)]
pub struct WinSpec {
    pub label: String,
    // src 아래의 화면 (renderer/fence.html 따위)
    pub page: &'static str,
    // 화면이 location.search 대신 읽는 값 (?id=…)
    pub query: String,
    pub bounds: Rect,
    pub focusable: bool,
    pub always_on_top: bool,
    // 마우스를 흘려보내는 창 (끄는 그림)
    pub ignore_mouse: bool,
    // 박스 창: 모든 작업 공간에 보이고 늘 다른 창 아래에 둔다
    pub fence: bool,
}

// 묻는 창 (Electron 판 ask.js 의 confirm/notice).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Ask {
    pub title: String,
    pub detail: String,
    pub confirm: String,
    pub cancel: String,
    pub danger: bool,
    // 단추가 하나뿐인 알림
    pub lone: bool,
    // 그림. assets 아래 이름(menu/remove.png) 이나 앱 그림('app').
    pub icon: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Row {
    pub label: String,
    pub value: String,
    pub wide: bool,
}

// 항목 속성 창 (Electron 판 props.js).
#[derive(Debug, Clone, PartialEq)]
pub struct Props {
    pub key: String,
    pub title: String,
    pub kind: String,
    pub rows: Vec<Row>,
    pub close: String,
    pub icon: Option<Picture>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MenuIcon {
    None,
    // src/assets 아래 이름 ("menu/open.png")
    Asset(String),
    Pic(Picture),
}

#[derive(Debug, Clone, PartialEq)]
pub enum MenuItem {
    Action { label: String, icon: MenuIcon, enabled: bool, accel: String, action: Action },
    // 누르면 값이 바뀐다. action 에는 바뀐 뒤의 값을 담아 둔다.
    Check { label: String, icon: MenuIcon, checked: bool, action: Action },
    Radio { label: String, icon: MenuIcon, checked: bool, action: Action },
    Sub { label: String, icon: MenuIcon, items: Vec<MenuItem> },
    Separator,
}

impl MenuItem {
    pub fn label(&self) -> &str {
        match self {
            MenuItem::Action { label, .. } | MenuItem::Check { label, .. } | MenuItem::Radio { label, .. } | MenuItem::Sub { label, .. } => label,
            MenuItem::Separator => "",
        }
    }
}

// 메뉴에서 고를 수 있는 일. 박스 메뉴와 트레이 메뉴가 함께 쓴다.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Open(String),
    EmptyBin(String),
    Copy(String, Vec<String>),
    Cut(String, Vec<String>),
    Paste(String),
    RenameItem(String, String),
    Eject(String, String),
    Delete(String, Vec<String>),
    Props(String, String, Vec<String>),
    RenameBox(String),
    Collapse(String, bool),
    ShowHidden(String, bool),
    Settings(String),
    Theme(String, String),
    Corner(String, i64),
    Opacity(String, f64),
    Special(String, Entry),
    NewBox,
    Remove(String),
    // 트레이
    Draw,
    ToggleHidden,
    Lang(String),
    Prefs,
    Startup(bool),
    DefaultTheme(String),
    DefaultCorner(i64),
    DefaultOpacity(f64),
    OpenWith(String),
    Shadow(bool),
    ShowHiddenAll(bool),
    ReturnAll,
    OpenBoxRoot,
    OpenDataDir,
    About,
    Quit,
}

pub trait Ui: Send + Sync {
    // 창. 처음에는 숨겨 둔다. 화면을 다 읽으면 host.window_loaded 가 불린다.
    fn open(&self, spec: WinSpec);
    fn close(&self, label: &str);
    fn show(&self, label: &str, activate: bool);
    fn hide(&self, label: &str);
    fn set_bounds(&self, label: &str, rect: Rect);
    fn send(&self, label: &str, event: &str, payload: Value);
    // 창 번호. 시스템 창의 주인으로 넘기거나 커서 아래가 우리 것인지 가릴 때 쓴다.
    fn handle(&self, label: &str) -> u64;
    fn handles(&self) -> Vec<u64>;

    // 화면
    fn cursor(&self) -> Option<Point>;
    fn display_nearest(&self, p: Point) -> Option<Display>;
    fn primary_work_area(&self) -> Rect;

    // 묻는 창과 알림. 알림의 답은 늘 참이다.
    fn confirm(&self, ask: Ask) -> BoxFut<bool>;
    fn props(&self, props: Props);
    // owner 창 위에 메뉴를 띄우고 고른 일을 돌려준다.
    fn menu(&self, owner: &str, items: Vec<MenuItem>) -> BoxFut<Option<Action>>;
    // 다른 프로그램으로 파일을 끌어 넘긴다. 손을 뗄 때까지 기다린다.
    fn drag_out(&self, owner: &str, files: Vec<String>, icon: Option<Picture>) -> BoxFut<bool>;
    // 시스템 창이 뜨는 동안 멈추는 일을 따로 돌린다.
    fn blocking(&self, work: Box<dyn FnOnce() -> bool + Send>) -> BoxFut<bool>;
    fn spawn(&self, fut: BoxFut<()>);
    fn later(&self, ms: u64, fut: BoxFut<()>);

    // 셸
    fn open_path(&self, path: &str);
    fn trash(&self, path: &str) -> bool;
    fn file_icon(&self, _path: &str) -> Option<Picture> {
        None
    }
    fn asset(&self, name: &str) -> Option<Picture>;

    // 앱
    fn app_name(&self) -> String {
        "MyDeskBox".into()
    }
    fn app_version(&self) -> String {
        env!("CARGO_PKG_VERSION").into()
    }
    fn user_dir(&self) -> String;
    // 바탕화면 모듈이 바탕화면 폴더를 모를 때 쓰는 자리 (Electron 의 app.getPath('desktop')).
    fn desktop_dir(&self) -> String;
    // 트레이 메뉴를 다시 만든다 (언어·숨김이 바뀌었을 때).
    fn announce(&self);
    fn quit(&self);
}
