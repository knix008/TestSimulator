// 박스 창 생명주기, 담기·꺼내기, 끌어 옮기기, 설정 창 (Electron 판 src/main/fences.js).
//
// 박스 하나는 창 하나다. 담는다는 것은 그 파일을 박스의 폴더로 옮긴다는 뜻이다.
//
// 이 구조체는 한 자물쇠(Shared) 안에서만 다룬다. 자바스크립트처럼 한 번에 한 일만 하고,
// 사람의 답을 기다리는 동안(묻는 창, 메뉴, 끌어 넘기기)에는 자물쇠를 풀어 둔다 (flows.rs).

mod flows;
mod menus;
mod moves;
#[cfg(test)]
pub(crate) mod testkit;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_deliver;
#[cfg(test)]
mod tests_fresh;
#[cfg(test)]
mod tests_boxes;
#[cfg(test)]
mod tests_menu;
#[cfg(test)]
mod tests_props;
#[cfg(test)]
mod tests_lang;

pub use flows::*;

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use crate::autostart::Autostart;
use crate::clipfiles::Clipboard;
use crate::conceal;
use crate::desktop::{is_shell_item, Desktop, Link};
use crate::geom::{self, is_recycle, is_shortcut, Point, Rect, SHADOW};
use crate::hold::{Config, Hold};
use crate::i18n;
use crate::image::Picture;
use crate::js::{now_ms, round};
use crate::pathx::{self, basename, extname};
use crate::store::{self, Fence, Item, State};
use crate::themes;
use crate::ui::{Ui, WinSpec};

pub type Shared = Arc<Mutex<Host>>;

pub fn lock(shared: &Shared) -> MutexGuard<'_, Host> {
    shared.lock().unwrap_or_else(|e| e.into_inner())
}

// 만든 이. 프로그램 정보 탭과 트레이가 같은 것을 보여 준다.
pub const AUTHOR_NAME: &str = "SHKWON";
pub const AUTHOR_EMAIL: &str = "knix008@naver.com";

#[derive(Debug, Clone)]
pub struct Win {
    pub label: String,
    // 창 자리 (DIP). Electron 의 win.getBounds() 대신 마지막으로 놓은 자리를 적어 둔다.
    pub bounds: Rect,
    pub visible: bool,
    pub loaded: bool,
}

// 창에서 놓은 것. 이름이 함께 오면(바탕화면의 휴지통 같은 셸 항목) 그대로 받는다.
#[derive(Debug, Clone, PartialEq)]
pub struct Incoming {
    pub name: Option<String>,
    pub path: String,
}

impl Incoming {
    pub fn path(path: impl Into<String>) -> Self {
        Self { name: None, path: path.into() }
    }
    pub fn named(name: impl Into<String>, path: impl Into<String>) -> Self {
        Self { name: Some(name.into()), path: path.into() }
    }
}

pub struct Host {
    pub state: State,
    pub ui: Arc<dyn Ui>,
    pub desk: Arc<dyn Desktop>,
    pub hold: Hold,
    pub clip: Clipboard,
    pub autostart: Autostart,
    pub(crate) me: Weak<Mutex<Host>>,
    pub(crate) wins: Vec<(String, Win)>,
    pub(crate) scroll_tops: HashMap<String, f64>,
    pub(crate) setting_wins: HashMap<String, Win>,
    pub(crate) prefs_win: Option<Win>,
    pub(crate) draw_win: Option<String>,
    pub(crate) ghost: Option<Win>,
    // 아직 그리지 못한 끄는 그림 (창을 다 읽기 전에 온 것)
    pub(crate) ghost_pending: Option<(String, f64, f64)>,
    // 물어보는 창이 여러 개 겹치지 않게 한다.
    pub(crate) asking: bool,
    pub(crate) thumbs: HashMap<String, String>,
    pub(crate) drag_icons: HashMap<String, Picture>,
    pub(crate) link_info: HashMap<String, (f64, Option<Link>)>,
    pub(crate) labels: HashMap<String, String>,
    pub(crate) settled: HashMap<String, (f64, f64, f64, f64)>,
    pub(crate) nudged_at: f64,
    pub(crate) nudge_timer: bool,
    pub(crate) closing: bool,
    pub(crate) put_back_done: bool,
    // 끝낼 때 바탕화면을 되돌렸는가 (app::restore_desktop).
    pub restored: bool,
    pub(crate) seen_on_desk: Option<HashSet<String>>,
    pub(crate) fresh_queue: VecDeque<String>,
    pub(crate) draining: bool,
    pub(crate) last_bin: Option<String>,
    pub(crate) next_label: u64,
    pub(crate) seed: u64,
}

impl Host {
    pub fn new(state: State, ui: Arc<dyn Ui>, desk: Arc<dyn Desktop>, clip: Clipboard, autostart: Autostart) -> Shared {
        let host = Host {
            state,
            ui,
            desk,
            hold: Hold::new(),
            clip,
            autostart,
            me: Weak::new(),
            wins: Vec::new(),
            scroll_tops: HashMap::new(),
            setting_wins: HashMap::new(),
            prefs_win: None,
            draw_win: None,
            ghost: None,
            ghost_pending: None,
            asking: false,
            thumbs: HashMap::new(),
            drag_icons: HashMap::new(),
            link_info: HashMap::new(),
            labels: HashMap::new(),
            settled: HashMap::new(),
            nudged_at: 0.0,
            nudge_timer: false,
            closing: false,
            put_back_done: false,
            restored: false,
            seen_on_desk: None,
            fresh_queue: VecDeque::new(),
            draining: false,
            last_bin: None,
            next_label: 0,
            seed: now_ms() as u64 ^ 0x9e37_79b9_7f4a_7c15,
        };
        let shared = Arc::new(Mutex::new(host));
        {
            let mut h = lock(&shared);
            h.me = Arc::downgrade(&shared);
            h.setup_hold();
        }
        shared
    }

    pub(crate) fn shared(&self) -> Option<Shared> {
        self.me.upgrade()
    }

    // 박스는 제 폴더에서 돌아간다. 보관함 자리를 보관함 모듈에 알려 준다.
    pub fn setup_hold(&mut self) -> String {
        let desk = self.desk.clone();
        let config = Config {
            root: self.state.settings.root.clone(),
            desktop_dir: self.desktop_folder(),
            user_dir: self.ui.user_dir(),
            hide: Some(Arc::new(move |dir: &str| desk.hide_path(dir).unwrap_or(false))),
        };
        self.hold.configure(config)
    }

    pub fn box_root(&mut self) -> String {
        self.hold.ensure_root()
    }

    pub fn persist(&self) {
        let _ = store::save(Path::new(&self.ui.user_dir()), &self.state);
    }

    pub(crate) fn say(&self, key: &str) -> String {
        i18n::t(&self.state.settings.lang, key)
    }

    pub(crate) fn sayv(&self, key: &str, vars: &[(&str, String)]) -> String {
        i18n::tv(&self.state.settings.lang, key, vars)
    }

    pub(crate) fn fence_index(&self, id: &str) -> Option<usize> {
        self.state.fences.iter().position(|f| f.id == id)
    }

    pub fn fence(&self, id: &str) -> Option<&Fence> {
        self.state.fences.iter().find(|f| f.id == id)
    }

    pub(crate) fn fence_mut(&mut self, id: &str) -> Option<&mut Fence> {
        self.state.fences.iter_mut().find(|f| f.id == id)
    }

    pub(crate) fn win(&self, id: &str) -> Option<&Win> {
        self.wins.iter().find(|(k, _)| k == id).map(|(_, w)| w)
    }

    pub(crate) fn win_mut(&mut self, id: &str) -> Option<&mut Win> {
        self.wins.iter_mut().find(|(k, _)| k == id).map(|(_, w)| w)
    }

    pub(crate) fn new_label(&mut self, kind: &str) -> String {
        self.next_label += 1;
        format!("{kind}-{}", self.next_label)
    }

    pub(crate) fn random5(&mut self) -> String {
        // xorshift. 박스 번호가 겹치지 않을 만큼이면 된다.
        let mut out = String::new();
        for _ in 0..5 {
            self.seed ^= self.seed << 13;
            self.seed ^= self.seed >> 7;
            self.seed ^= self.seed << 17;
            out.push_str(&crate::js::base36(self.seed % 36));
        }
        out
    }

    // 휴지통은 비었을 때와 찼을 때 그림이 다르다. 바뀌면 박스를 다시 그린다.
    pub(crate) fn bin_state(&self) -> String {
        let left = self.desk.recycle_count();
        if left < 0 {
            return String::new();
        }
        if left > 0 { "full" } else { "empty" }.into()
    }

    pub(crate) fn prune(&mut self, id: &str) -> Vec<Item> {
        let Some(at) = self.fence_index(id) else { return vec![] };
        let items = self.state.fences[at].items.clone();
        let kept: Vec<Item> = items.iter().filter(|i| is_shell_item(&i.path) || Path::new(&i.path).exists()).cloned().collect();
        if kept.len() != items.len() {
            self.state.fences[at].items = kept.clone();
            self.persist();
        }
        kept
    }

    // 탐색기처럼 감춰 둘 파일인가.
    pub(crate) fn concealed(&self, item: &Item) -> bool {
        if item.path.is_empty() || is_shell_item(&item.path) {
            return false;
        }
        conceal::is_concealed(&basename(&item.path), self.desk.file_flags(&item.path))
    }

    // 박스에 그리는 항목. 감춘 파일은 목록과 폴더에 그대로 두고 그리지만 않는다.
    pub(crate) fn shown_items(&self, fence: &Fence, list: Option<&[Item]>) -> Vec<Item> {
        let items = list.unwrap_or(&fence.items);
        if fence.show_hidden {
            return items.to_vec();
        }
        items.iter().filter(|i| !self.concealed(i)).cloned().collect()
    }

    // 창이 말하는 자리(그려진 항목 가운데 몇 번째)를 목록의 자리로 바꾼다.
    pub(crate) fn slot_for(&self, id: &str, index: Option<usize>, skip: &[String]) -> Option<usize> {
        let fence = self.fence(id)?;
        let index = index?;
        if fence.show_hidden {
            return Some(index);
        }
        let rest: Vec<Item> = fence.items.iter().filter(|i| !skip.contains(&i.path)).cloned().collect();
        let visible: HashSet<String> = self.shown_items(fence, Some(&rest)).into_iter().map(|i| i.path).collect();
        let mut seen = 0;
        for (at, item) in rest.iter().enumerate() {
            if !visible.contains(&item.path) {
                continue;
            }
            if seen == index {
                return Some(at);
            }
            seen += 1;
        }
        Some(rest.len())
    }

    // ── 그림 ─────────────────────────────────────────────────────────────

    // .ico 나 .png 는 그림 파일 그대로 읽고, 프로그램 파일은 안에 든 그림을 꺼낸다.
    pub(crate) fn icon_from(&self, source: &str) -> Option<Picture> {
        if source.is_empty() || !Path::new(source).exists() {
            return None;
        }
        let low = source.to_lowercase();
        if low.ends_with(".ico") || low.ends_with(".png") || low.ends_with(".bmp") {
            let image = Picture::from_file(source)?;
            return Some(if image.width > 64 { image.resize(64, 64, true) } else { image });
        }
        self.ui.file_icon(source)
    }

    // 그림 파일은 그림 자체를 작게 줄여 보여 준다. 너무 큰 그림은 종류 그림으로 둔다.
    pub(crate) fn picture_of(&self, path: &str) -> Option<Picture> {
        let low = path.to_lowercase();
        let pictures = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".avif"];
        if !pictures.iter().any(|ext| low.ends_with(ext)) {
            return None;
        }
        if fs::metadata(path).ok()?.len() > 32 * 1024 * 1024 {
            return None;
        }
        let image = Picture::from_file(path)?;
        // 긴 쪽을 64 로 맞춘다. 창에서는 44 로 그리므로 배율이 높은 화면에서도 또렷하다.
        let scale = 64.0 / image.width.max(image.height) as f64;
        if scale >= 1.0 {
            return Some(image);
        }
        let w = (round(image.width as f64 * scale) as u32).max(1);
        let h = (round(image.height as f64 * scale) as u32).max(1);
        Some(image.resize(w, h, false))
    }

    pub(crate) fn icon_of(&mut self, path: &str) -> Option<Picture> {
        if is_shell_item(path) {
            return self.desk.file_icon(path);
        }
        if let Some(p) = self.picture_of(path) {
            return Some(p);
        }
        if let Some(p) = self.link_icon_from_file(path) {
            return Some(p);
        }
        if let Some(p) = self.desk.file_icon(path) {
            return Some(p);
        }
        if cfg!(windows) {
            let ext = extname(path).to_lowercase();
            // 바로가기 파일 자체는 밋밋한 문서 그림만 준다. 지정된 그림이나 가리키는 프로그램에서 가져온다.
            if ext == ".lnk" {
                if let Some(link) = self.shortcut_link(path) {
                    if let Some(found) = self.icon_from(&link.icon).or_else(|| self.icon_from(&link.target)) {
                        return Some(found);
                    }
                }
            }
            if ext == ".url" {
                if let Ok(text) = fs::read_to_string(path) {
                    let line = text.lines().find_map(|l| {
                        let t = l.trim_start();
                        (t.len() > 9 && t[..9].eq_ignore_ascii_case("IconFile=")).then(|| t[9..].trim().to_string())
                    });
                    if let Some(found) = line.and_then(|f| self.icon_from(&f)) {
                        return Some(found);
                    }
                }
            }
        }
        self.ui.file_icon(path)
    }

    // 바로가기가 가리키는 것. 바로가기 파일이 그대로면 다시 읽지 않는다.
    pub(crate) fn link_of(&mut self, path: &str, mtime: f64) -> Option<Link> {
        if let Some((seen, link)) = self.link_info.get(path) {
            if *seen == mtime {
                return link.clone();
            }
        }
        let link = self.shortcut_link(path);
        if link.is_some() {
            self.link_info.insert(path.to_string(), (mtime, link.clone()));
        }
        link
    }

    pub(crate) fn shortcut_link(&self, path: &str) -> Option<Link> {
        if !path.to_lowercase().ends_with(".lnk") {
            return None;
        }
        self.desk.shortcut_link(path).filter(|l| !l.target.is_empty())
    }

    // 바로가기 그림을 꺼낼 파일과 그림 번호. 지정된 그림이 없으면 가리키는 프로그램이다.
    pub(crate) fn link_icon_source(link: &Link) -> Option<(String, i32)> {
        let icon = expand_env(&link.icon);
        if !icon.is_empty() {
            return Some((icon, link.icon_index));
        }
        (!link.target.is_empty()).then(|| (link.target.clone(), 0))
    }

    // 그림을 다시 읽어야 하는지 가리는 열쇠. 바로가기는 가리키는 것의 고친 때도 함께 본다.
    pub(crate) fn thumb_key(&mut self, path: &str) -> Option<String> {
        if is_shell_item(path) {
            return Some(format!("{path}:{}", self.bin_state()));
        }
        let mtime = mtime_ms(path)?;
        let link = if path.to_lowercase().ends_with(".lnk") { self.link_of(path, mtime) } else { None };
        let Some(link) = link else { return Some(format!("{path}:{mtime}")) };
        let source = Self::link_icon_source(&link);
        Some(format!("{path}:{mtime}:{}:{}", stamp_of(&link.target), stamp_of(source.map(|s| s.0).as_deref().unwrap_or(""))))
    }

    // 프로그램을 가리키는 바로가기는 그 프로그램 파일에서 그림을 바로 꺼낸다.
    pub(crate) fn link_icon_from_file(&mut self, path: &str) -> Option<Picture> {
        if !path.to_lowercase().ends_with(".lnk") {
            return None;
        }
        let mtime = mtime_ms(path)?;
        let link = self.link_of(path, mtime)?;
        let (file, index) = Self::link_icon_source(&link)?;
        let low = file.to_lowercase();
        if ![".exe", ".dll", ".ico", ".icl", ".cpl"].iter().any(|e| low.ends_with(e)) {
            return None;
        }
        self.desk.icon_of_file(&file, index)
    }

    // 그림이 바뀐 바로가기가 있는가. 다시 설치한 프로그램을 알아챈다.
    pub(crate) fn icons_stale(&mut self) -> bool {
        let paths: Vec<String> =
            self.state.fences.iter().flat_map(|f| f.items.iter()).filter(|i| i.path.to_lowercase().ends_with(".lnk")).map(|i| i.path.clone()).collect();
        for path in paths {
            if let Some(key) = self.thumb_key(&path) {
                if !self.thumbs.contains_key(&key) {
                    return true;
                }
            }
        }
        false
    }

    pub(crate) fn thumb(&mut self, path: &str) -> String {
        let Some(key) = self.thumb_key(path) else { return String::new() };
        if let Some(url) = self.thumbs.get(&key) {
            return url.clone();
        }
        let image = self.icon_of(path);
        let url = match &image {
            Some(img) => {
                self.drag_icons.insert(path.to_string(), img.clone());
                img.data_url()
            }
            None => String::new(),
        };
        self.thumbs.insert(key, url.clone());
        url
    }

    // 박스에 적을 이름. 탐색기가 바탕화면에 그리는 글과 같아야 한다.
    pub(crate) fn label_for(&mut self, item: &Item) -> String {
        if let Some(found) = self.labels.get(&item.path) {
            return found.clone();
        }
        let mut shown = self.desk.display_name(&item.path);
        if shown.is_empty() {
            shown = self.desk.label_of(&item.name);
        }
        self.labels.insert(item.path.clone(), shown.clone());
        shown
    }

    pub(crate) fn payload(&mut self, id: &str) -> Option<Value> {
        let pruned = self.prune(id);
        let fence = self.fence(id)?.clone();
        let mut items = Vec::new();
        for item in self.shown_items(&fence, Some(&pruned)) {
            let concealed = fence.show_hidden && self.concealed(&item);
            items.push(json!({
                "name": item.name,
                "path": item.path,
                "label": self.label_for(&item),
                "icon": self.thumb(&item.path),
                "shortcut": is_shortcut(&item.path),
                "folder": is_directory(&item.path),
                "recycle": is_recycle(&item.path),
                // 숨김·임시 파일. 보여 줄 때도 탐색기처럼 흐리게 그려 보통 파일과 가른다.
                "concealed": concealed,
                // 끌어다 놓은 것을 받아 줄 수 있는가.
                "receives": self.can_receive(&item.path),
            }));
        }
        Some(json!({
            "fence": fence,
            "theme": resolve_theme(&fence),
            "corner": { "radius": fence.corner },
            "lang": self.state.settings.lang,
            "shadow": self.state.settings.shadow,
            "openWith": if self.state.settings.open_with == "single" { "single" } else { "double" },
            "items": items,
        }))
    }

    pub fn push(&mut self, id: &str) {
        self.push_settings(id);
        let Some(shown) = self.payload(id) else { return };
        if let Some(win) = self.win(id) {
            self.ui.send(&win.label, "fence:state", shown);
        }
    }

    pub fn push_all(&mut self) {
        let ids: Vec<String> = self.state.fences.iter().map(|f| f.id.clone()).collect();
        for id in ids {
            self.push(&id);
        }
    }

    // 고른 표시를 거둔다. except 는 방금 고르기를 시작한 박스다.
    pub fn clear_picks(&self, except: Option<&str>) {
        for (id, win) in &self.wins {
            if Some(id.as_str()) == except {
                continue;
            }
            self.ui.send(&win.label, "fence:unpick", Value::Null);
        }
    }

    // ── 창 ───────────────────────────────────────────────────────────────

    pub(crate) fn show_fence(&mut self, id: &str) {
        let ui = self.ui.clone();
        if let Some(win) = self.win_mut(id) {
            win.visible = true;
            ui.show(&win.label, false);
        }
    }

    pub fn open_fence(&mut self, id: &str) -> Option<String> {
        if let Some(win) = self.win(id) {
            return Some(win.label.clone());
        }
        // 켤 때는 박스를 옮기지 않는다. 화면 밖으로 나간 경우만 안으로 들인다.
        self.clamp_to_screen(id);
        let fence = self.fence(id)?.clone();
        let outer = geom::window_rect(fence.x, fence.y, fence.w, fence.collapsed, fence.h, self.state.settings.shadow);
        let label = self.new_label("fence");
        self.ui.open(WinSpec {
            label: label.clone(),
            page: "renderer/fence.html",
            query: format!("?id={}", encode_query(id)),
            bounds: outer,
            focusable: true,
            always_on_top: false,
            ignore_mouse: false,
            fence: true,
        });
        self.wins.push((id.to_string(), Win { label: label.clone(), bounds: outer, visible: false, loaded: false }));
        Some(label)
    }

    pub fn open_all(&mut self) {
        let ids: Vec<String> = self.state.fences.iter().map(|f| f.id.clone()).collect();
        for id in ids {
            self.open_fence(&id);
        }
        self.refresh_icons();
        self.ensure_ghost();
    }

    // 창이 화면을 다 읽었다 (Electron 의 ready-to-show).
    pub fn window_loaded(&mut self, label: &str) {
        if let Some(id) = self.wins.iter().find(|(_, w)| w.label == label).map(|(id, _)| id.clone()) {
            if let Some(win) = self.win_mut(&id) {
                win.loaded = true;
            }
            if !self.state.hidden {
                self.show_fence(&id);
            }
            return;
        }
        if self.ghost.as_ref().map(|g| g.label == label).unwrap_or(false) {
            if let Some(g) = self.ghost.as_mut() {
                g.loaded = true;
            }
            if let Some((icon, x, y)) = self.ghost_pending.take() {
                self.show_ghost(&icon, x, y);
            }
            return;
        }
        let setting = self.setting_wins.iter().find(|(_, w)| w.label == label).map(|(id, _)| id.clone());
        if let Some(id) = setting {
            if let Some(w) = self.setting_wins.get_mut(&id) {
                w.loaded = true;
                w.visible = true;
            }
            self.ui.show(label, true);
            return;
        }
        if self.prefs_win.as_ref().map(|w| w.label == label).unwrap_or(false) {
            if let Some(w) = self.prefs_win.as_mut() {
                w.loaded = true;
                w.visible = true;
            }
            self.ui.show(label, true);
            return;
        }
        if self.draw_win.as_deref() == Some(label) {
            self.ui.show(label, true);
        }
    }

    // 창이 닫혔다 (사람이 Alt+F4 로 닫았거나 우리가 닫았다).
    pub fn window_closed(&mut self, label: &str) {
        self.wins.retain(|(_, w)| w.label != label);
        self.setting_wins.retain(|_, w| w.label != label);
        if self.prefs_win.as_ref().map(|w| w.label == label).unwrap_or(false) {
            self.prefs_win = None;
        }
        if self.draw_win.as_deref() == Some(label) {
            self.draw_win = None;
        }
        if self.ghost.as_ref().map(|w| w.label == label).unwrap_or(false) {
            self.ghost = None;
        }
    }

    // 끌고 있는 동안 손을 따라다니는 그림. 박스 밖으로 끌고 나가면 그 아이콘을 그릴 창이 없다.
    pub(crate) fn ensure_ghost(&mut self) -> String {
        if let Some(g) = &self.ghost {
            return g.label.clone();
        }
        let label = "ghost".to_string();
        let bounds = Rect::new(0.0, 0.0, 76.0, 88.0);
        self.ui.open(WinSpec {
            label: label.clone(),
            page: "renderer/ghost.html",
            query: String::new(),
            bounds,
            focusable: false,
            always_on_top: true,
            // 그림만 보여 주는 창이다. 마우스를 받으면 커서 아래의 다른 프로그램을 가린다.
            ignore_mouse: true,
            fence: false,
        });
        self.ghost = Some(Win { label: label.clone(), bounds, visible: false, loaded: false });
        label
    }

    pub(crate) fn show_ghost(&mut self, icon: &str, x: f64, y: f64) {
        self.ensure_ghost();
        let ui = self.ui.clone();
        let Some(g) = self.ghost.as_mut() else { return };
        if !g.loaded {
            self.ghost_pending = Some((icon.to_string(), x, y));
            return;
        }
        let bounds = Rect::new(round(x - 24.0), round(y - 18.0), 76.0, 88.0);
        g.bounds = bounds;
        ui.set_bounds(&g.label, bounds);
        if !g.visible {
            g.visible = true;
            ui.show(&g.label, false);
        }
        ui.send(&g.label, "ghost:icon", json!(icon));
    }

    pub(crate) fn hide_ghost(&mut self) {
        self.ghost_pending = None;
        let ui = self.ui.clone();
        if let Some(g) = self.ghost.as_mut() {
            if g.visible {
                g.visible = false;
                ui.hide(&g.label);
            }
        }
    }

    pub(crate) fn owner_of(&self, path: &str) -> Option<String> {
        self.state.fences.iter().find(|f| f.items.iter().any(|i| i.path == path)).map(|f| f.id.clone())
    }

    // 이 항목이 끌어다 놓은 것을 받아 줄 수 있는가. 폴더, 폴더를 가리키는 바로가기, 휴지통뿐이다.
    pub(crate) fn can_receive(&self, path: &str) -> bool {
        if path.is_empty() {
            return false;
        }
        let link = if is_shortcut(path) { self.shortcut_link(path) } else { None };
        let aimed = link.filter(|l| is_directory(&l.target)).map(|l| l.target).unwrap_or_default();
        !geom::receive_kind(path, is_directory(path), &aimed).is_empty()
    }

    pub(crate) fn receiver_at(&self, id: &str, sx: f64, sy: f64, except: &str) -> Option<String> {
        let fence = self.fence(id)?;
        if fence.collapsed {
            return None;
        }
        let bounds = self.bounds_of(id)?;
        let grid = geom::grid_of(bounds.width, bounds.height, false);
        let local_x = sx - bounds.x;
        let local_y = sy - bounds.y + self.scroll_tops.get(id).copied().unwrap_or(0.0);
        let shown: Vec<Item> = self.shown_items(fence, None).into_iter().filter(|i| i.path != except).collect();
        for (n, item) in shown.iter().enumerate() {
            let point = geom::slot_point(n, &grid);
            if !geom::on_picture(local_x - point.x, local_y - point.y) {
                continue;
            }
            return self.can_receive(&item.path).then(|| item.path.clone());
        }
        None
    }

    pub fn hover(&mut self, path: &str, sx: f64, sy: f64, icon: &str, incoming: bool) {
        let target = self.hit(sx, sy);
        let ids: Vec<String> = self.state.fences.iter().map(|f| f.id.clone()).collect();
        for id in ids {
            let Some(label) = self.win(&id).map(|w| w.label.clone()) else { continue };
            if target.as_deref() == Some(id.as_str()) {
                let Some(bounds) = self.bounds_of(&id) else { continue };
                let into = self.receiver_at(&id, sx, sy, path);
                self.ui.send(&label, "fence:hover", json!({
                    "filePath": path,
                    "localX": sx - bounds.x,
                    "localY": sy - bounds.y,
                    // 어느 항목 위인지 창에게 함께 알려 준다. 창은 그 항목을 밝혀 보여 준다.
                    "into": into,
                }));
            } else {
                self.ui.send(&label, "fence:hover", Value::Null);
            }
        }
        // 바탕화면에서 끌어 오는 동안에는 탐색기가 그림을 들고 있다. 우리 창을 겹치지 않는다.
        if incoming {
            self.hide_ghost();
            return;
        }
        // 원래 있던 박스 위에서는 그 박스가 직접 그리므로 따라다니는 그림을 숨긴다.
        let owner = self.owner_of(path);
        if target.is_some() && owner.is_some() && target == owner {
            self.hide_ghost();
        } else {
            self.show_ghost(icon, sx, sy);
        }
    }

    // 바탕화면 아이콘을 박스 위로 끌고 오는 동안. 넣을 자리만 보여 준다.
    pub fn hover_incoming(&mut self, path: &str, sx: f64, sy: f64) {
        if path.is_empty() {
            self.clear_hover();
            return;
        }
        self.hover(path, sx, sy, "", true);
    }

    pub fn clear_hover(&mut self) {
        self.hide_ghost();
        for (_, win) in &self.wins {
            self.ui.send(&win.label, "fence:hover", Value::Null);
        }
    }

    pub fn over_foreign(&self, sx: f64, sy: f64) -> bool {
        self.desk.foreign_at(Point::new(sx, sy), &self.ui.handles()).unwrap_or(false)
    }

    // 커서 아래가 바탕화면인가. 알 수 없으면 박스 밖을 바탕화면으로 본다.
    pub(crate) fn release_on_desktop(&self, sx: f64, sy: f64) -> bool {
        self.desk.on_desktop(Point::new(sx, sy), &self.ui.handles()).unwrap_or(true)
    }

    pub(crate) fn cursor_dip(&self) -> Option<Point> {
        self.ui.cursor().filter(|p| p.x.is_finite() && p.y.is_finite())
    }

    // 손을 뗀 곳이 바탕화면인가. 모르면 다른 프로그램에 놓은 것으로 둔다.
    pub(crate) fn dropped_on_desktop(&self) -> bool {
        let Some(pos) = self.cursor_dip() else { return false };
        self.desk.on_desktop(pos, &self.ui.handles()).unwrap_or(false)
    }

    pub(crate) fn bounds_of(&self, id: &str) -> Option<Rect> {
        let win = self.win(id)?;
        Some(geom::panel_rect(win.bounds, self.state.settings.shadow))
    }

    pub(crate) fn hit(&self, sx: f64, sy: f64) -> Option<String> {
        for fence in self.state.fences.iter().rev() {
            if fence.collapsed {
                continue;
            }
            let Some(b) = self.bounds_of(&fence.id) else { continue };
            if sx >= b.x && sx <= b.x + b.width && sy >= b.y && sy <= b.y + b.height {
                return Some(fence.id.clone());
            }
        }
        None
    }

    pub(crate) fn set_bounds(&mut self, id: &str, rect: Rect) {
        let ui = self.ui.clone();
        if let Some(win) = self.win_mut(id) {
            win.bounds = rect;
            ui.set_bounds(&win.label, rect);
        }
    }

    // 창 번호. 시스템이 띄우는 창의 주인으로 넘겨 박스 뒤로 숨지 않게 한다.
    pub(crate) fn handle_of(&self, id: &str) -> u64 {
        self.win(id).map(|w| self.ui.handle(&w.label)).unwrap_or(0)
    }

    pub fn user_folder(&self) -> String {
        self.ui.user_dir()
    }

    // 진짜 바탕화면 폴더. 꺼낸 파일이 돌아갈 곳이다.
    pub fn desktop_folder(&self) -> String {
        match self.desk.desktop_directories().into_iter().next() {
            Some(found) => found,
            None => self.ui.desktop_dir(),
        }
    }

    pub fn captured(&self) -> Vec<Item> {
        self.state.fences.iter().flat_map(|f| f.items.iter().cloned()).collect()
    }

    pub fn announce(&mut self) {
        self.push_prefs();
        self.ui.announce();
    }

}

pub fn resolve_theme(fence: &Fence) -> themes::Theme {
    if fence.theme == "custom" {
        if let Some(custom) = &fence.custom {
            return themes::custom_theme(Some(&custom.bg), Some(&custom.bar));
        }
    }
    themes::theme_of(&fence.theme).clone()
}

pub(crate) fn is_directory(path: &str) -> bool {
    if path.is_empty() || is_shortcut(path) || is_recycle(path) {
        return false;
    }
    Path::new(path).is_dir()
}

pub(crate) fn mtime_ms(path: &str) -> Option<f64> {
    let meta = fs::metadata(path).ok()?;
    let t = meta.modified().ok()?;
    Some(t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0))
}

fn stamp_of(source: &str) -> String {
    if source.is_empty() {
        return "-".into();
    }
    match (mtime_ms(source), fs::metadata(source)) {
        (Some(m), Ok(meta)) => format!("{m}/{}", meta.len()),
        _ => "-".into(),
    }
}

pub(crate) fn expand_env(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(open) = rest.find('%') {
        let after = &rest[open + 1..];
        let Some(close) = after.find('%') else { break };
        let name = &after[..close];
        if name.is_empty() {
            out.push_str(&rest[..open + 1]);
            rest = after;
            continue;
        }
        out.push_str(&rest[..open]);
        match std::env::var(name) {
            Ok(v) => out.push_str(&v),
            Err(_) => out.push_str(&rest[open..open + close + 2]),
        }
        rest = &after[close + 1..];
    }
    out.push_str(rest);
    out
}

pub(crate) fn encode_query(text: &str) -> String {
    let mut out = String::new();
    for b in text.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub(crate) fn same_path(a: &str, b: &str) -> bool {
    pathx::same(a, b)
}

pub(crate) fn names_in(dir: &str) -> Option<HashSet<String>> {
    if dir.is_empty() {
        return None;
    }
    let list = fs::read_dir(dir).ok()?;
    Some(list.flatten().map(|e| e.file_name().to_string_lossy().to_lowercase()).collect())
}

pub(crate) fn shadow_pad(shadow: bool) -> f64 {
    if shadow {
        SHADOW
    } else {
        0.0
    }
}

