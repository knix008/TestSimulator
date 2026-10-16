// 검사에서 쓰는 가짜 바탕화면 (Electron 판 test/helpers/fakes.js 의 makeDesktop).
// 운영체제를 부르지 않고 무엇이 불렸는지만 적어 둔다.

use std::collections::HashSet;
use std::fs;
use std::sync::Mutex;

use super::{Desktop, DeskGrid, Entry, Link};
use crate::conceal::FileFlags;
use crate::geom::{Point, Rect};
use crate::image::Picture;
use crate::pathx::join;
use crate::store::Item;

#[derive(Default, Debug, Clone)]
pub struct Calls {
    pub init: Vec<String>,
    pub release: Vec<Vec<String>>,
    pub shutdown: usize,
    pub shell: Vec<Vec<String>>,
    pub revealed: Vec<String>,
    pub nudged: Vec<Vec<Rect>>,
    pub homed: Vec<Vec<String>>,
    pub refreshed: Vec<String>,
    pub concealed_dirs: Vec<String>,
    pub placed_at: Vec<(String, Point)>,
    pub emptied: usize,
    pub bin_owners: Vec<u64>,
    pub discarded: Vec<String>,
}

#[derive(Default)]
pub struct State {
    pub calls: Calls,
    pub desk_dirs: Vec<String>,
    pub grid: Option<DeskGrid>,
    pub concealed: HashSet<String>,
    pub links: Vec<(String, Link)>,
    pub flags: Vec<(String, FileFlags)>,
    pub recycle: i64,
    pub names: Vec<(String, String)>,
    pub foreign: Option<bool>,
    pub on_desk: Option<bool>,
    pub icon: Option<Picture>,
    pub shell: Vec<Entry>,
    pub mouse: bool,
    // 따로 버리는 길(같은 이름이 휴지통에 있어도 버린다)이 있는 것처럼 군다.
    pub discard: bool,
    // 이름이 이것으로 시작하는 파일은 숨김 속성이 붙은 것처럼 군다.
    pub hidden_prefix: Option<String>,
}

pub struct FakeDesktop {
    pub state: Mutex<State>,
}

impl FakeDesktop {
    pub fn new() -> Self {
        let mut state = State::default();
        state.shell = vec![Entry { name: "휴지통".into(), path: "shell:RecycleBinFolder".into() }];
        Self { state: Mutex::new(state) }
    }
    pub fn st(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap()
    }
    pub fn calls(&self) -> Calls {
        self.st().calls.clone()
    }
    pub fn use_desktop(&self, dirs: &[&str]) {
        self.st().desk_dirs = dirs.iter().filter(|d| !d.is_empty()).map(|d| d.to_string()).collect();
    }
    pub fn use_grid(&self, grid: Option<DeskGrid>) {
        self.st().grid = grid;
    }
    pub fn link(&self, path: &str, target: &str) {
        self.st().links.push((path.to_string(), Link { target: target.to_string(), ..Default::default() }));
    }
}

impl Desktop for FakeDesktop {
    fn native_icons(&self) -> bool {
        true
    }
    fn init(&self, user_dir: &str) {
        self.st().calls.init.push(user_dir.to_string());
    }
    fn shutdown(&self) {
        self.st().calls.shutdown += 1;
    }
    fn desktop_directories(&self) -> Vec<String> {
        self.st().desk_dirs.clone()
    }
    // 시험 바탕화면 폴더를 그대로 읽는다. 진짜 모듈처럼 점으로 시작하는 이름은 뺀다.
    fn desktop_entries(&self) -> Vec<Entry> {
        let dirs = self.st().desk_dirs.clone();
        let mut out = Vec::new();
        for dir in dirs {
            let Ok(list) = fs::read_dir(&dir) else { continue };
            for entry in list.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') {
                    continue;
                }
                out.push(Entry { path: join(&dir, &name), name });
            }
        }
        out
    }
    fn shell_items(&self) -> Vec<Entry> {
        self.st().shell.clone()
    }
    fn recycle_count(&self) -> i64 {
        self.st().recycle
    }
    fn file_flags(&self, path: &str) -> Option<FileFlags> {
        let st = self.st();
        if let Some(prefix) = &st.hidden_prefix {
            let hidden = crate::pathx::basename(path).starts_with(prefix.as_str());
            return Some(FileFlags { hidden, system: false, temporary: false });
        }
        st.flags.iter().find(|(p, _)| p == path).map(|(_, f)| *f)
    }
    fn file_icon(&self, _path: &str) -> Option<Picture> {
        self.st().icon.clone()
    }
    fn shortcut_link(&self, path: &str) -> Option<Link> {
        self.st().links.iter().find(|(p, _)| p == path).map(|(_, l)| l.clone())
    }
    fn display_name(&self, path: &str) -> String {
        self.st().names.iter().find(|(p, _)| p == path).map(|(_, n)| n.clone()).unwrap_or_default()
    }
    fn foreign_at(&self, _point: Point, _own: &[u64]) -> Option<bool> {
        self.st().foreign
    }
    fn on_desktop(&self, _point: Point, _own: &[u64]) -> Option<bool> {
        self.st().on_desk
    }
    // 가짜는 따로 버리는 길이 없다. 박스는 보통 길(셸 휴지통)로 보낸다.
    fn discard_file(&self, path: &str) -> bool {
        let mut st = self.st();
        if !st.discard {
            return false;
        }
        st.calls.discarded.push(path.to_string());
        let _ = crate::hold::remove_tree(std::path::Path::new(path));
        true
    }
    fn empty_recycle(&self, owner: u64) -> bool {
        let mut st = self.st();
        st.calls.emptied += 1;
        st.calls.bin_owners.push(owner);
        true
    }
    fn hide_path(&self, dir: &str) -> Option<bool> {
        self.st().calls.concealed_dirs.push(dir.to_string());
        Some(true)
    }
    fn reveal_file(&self, path: &str) -> bool {
        let mut st = self.st();
        if !st.concealed.remove(path) {
            return false;
        }
        st.calls.revealed.push(path.to_string());
        true
    }
    fn put_at(&self, name: &str, point: Point) -> bool {
        self.st().calls.placed_at.push((name.to_string(), point));
        true
    }
    fn put_home(&self, names: &[String]) -> bool {
        self.st().calls.homed.push(names.to_vec());
        true
    }
    fn refresh_folder(&self, dir: &str) {
        self.st().calls.refreshed.push(dir.to_string());
    }
    fn sync_shell_icons(&self, items: &[Item]) {
        let shell = items.iter().filter(|i| i.path.starts_with("shell:")).map(|i| i.path.clone()).collect();
        self.st().calls.shell.push(shell);
    }
    fn release(&self, items: &[Item]) {
        self.st().calls.release.push(items.iter().map(|i| i.path.clone()).collect());
    }
    fn nudge(&self, blocks: &[Rect], _live: bool) -> bool {
        self.st().calls.nudged.push(blocks.to_vec());
        true
    }
    fn grid_info(&self) -> Option<DeskGrid> {
        self.st().grid
    }
    fn mouse_down(&self) -> bool {
        self.st().mouse
    }
}
