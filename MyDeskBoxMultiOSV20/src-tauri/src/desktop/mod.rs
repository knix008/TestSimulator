// 운영체제별 바탕화면 (Electron 판 src/main/desktop/*).
//
// Windows 는 탐색기 바탕화면 목록(SysListView32)을 직접 다룬다. macOS 와 Linux 는 아이콘 좌표를
// 바꾸는 공개 길이 없어, 박스는 바탕화면 위의 창이고 안의 아이콘은 Desktop 폴더의 파일이다.
//
// 박스 쪽(host.rs)은 이 트레이트만 본다. 검사는 가짜를 끼운다(fake.rs).

pub mod files;
#[cfg(windows)]
pub mod windows;
#[cfg(not(windows))]
pub mod other;
#[cfg(test)]
pub mod fake;

use crate::conceal::FileFlags;
use crate::geom::{Point, Rect};
use crate::image::Picture;
use crate::store::Item;

#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub directory: bool,
}

// 바로가기(.lnk)가 가리키는 것.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Link {
    pub target: String,
    pub icon: String,
    pub icon_index: i32,
}

// 바탕화면 아이콘 격자 (DIP).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DeskGrid {
    pub x0: f64,
    pub y0: f64,
    pub dx: f64,
    pub dy: f64,
}

pub trait Desktop: Send + Sync {
    // 바탕화면 아이콘을 다루는 판(Windows)인가.
    fn native_icons(&self) -> bool {
        false
    }
    fn init(&self, _user_dir: &str) {}
    fn shutdown(&self) {}
    fn claim_single_instance(&self) -> bool {
        true
    }

    fn desktop_directories(&self) -> Vec<String> {
        files::desktop_directories()
    }
    fn desktop_entries(&self) -> Vec<Entry> {
        files::desktop_entries(&self.desktop_directories())
    }
    fn list_desktop_files(&self) -> Vec<FileEntry> {
        files::list_desktop_files(&self.desktop_entries())
    }
    fn label_of(&self, name: &str) -> String {
        files::label_of(name)
    }

    // 휴지통 같은 셸 항목 가운데 바탕화면에 실제로 놓인 것.
    fn shell_items(&self) -> Vec<Entry> {
        vec![]
    }
    // 휴지통에 든 항목 수. 물어보지 못했으면 -1.
    fn recycle_count(&self) -> i64 {
        -1
    }
    fn file_flags(&self, _path: &str) -> Option<FileFlags> {
        None
    }
    fn file_icon(&self, _path: &str) -> Option<Picture> {
        None
    }
    fn icon_of_file(&self, _file: &str, _index: i32) -> Option<Picture> {
        None
    }
    fn shortcut_link(&self, _path: &str) -> Option<Link> {
        None
    }
    fn display_name(&self, _path: &str) -> String {
        String::new()
    }
    // 커서 아래가 다른 프로그램인가 / 바탕화면인가. 알 수 없는 판은 None.
    fn foreign_at(&self, _point: Point, _own: &[u64]) -> Option<bool> {
        None
    }
    fn on_desktop(&self, _point: Point, _own: &[u64]) -> Option<bool> {
        None
    }
    // 같은 이름이 휴지통에 있어도 묻지 않고 버린다. 하지 못하면 false.
    fn discard_file(&self, _path: &str) -> bool {
        false
    }
    // 휴지통 비우기. 시스템이 묻고 진행률을 보여 준다. 돌아올 때까지 멈춘다.
    fn empty_recycle(&self, _owner: u64) -> bool {
        false
    }
    fn hide_path(&self, _dir: &str) -> Option<bool> {
        None
    }
    fn reveal_file(&self, _path: &str) -> bool {
        false
    }
    fn put_at(&self, _name: &str, _point: Point) -> bool {
        false
    }
    fn put_home(&self, _names: &[String]) -> bool {
        false
    }
    fn refresh_folder(&self, _dir: &str) {}
    fn sync_shell_icons(&self, _items: &[Item]) {}
    fn release(&self, _items: &[Item]) {}
    fn nudge(&self, _blocks: &[Rect], _live: bool) -> bool {
        false
    }
    fn grid_info(&self) -> Option<DeskGrid> {
        None
    }
    fn mouse_down(&self) -> bool {
        false
    }
}

pub fn is_shell_item(path: &str) -> bool {
    path.starts_with("shell:")
}

#[cfg(windows)]
pub fn platform() -> std::sync::Arc<dyn Desktop> {
    std::sync::Arc::new(windows::WinDesktop::new())
}

#[cfg(not(windows))]
pub fn platform() -> std::sync::Arc<dyn Desktop> {
    std::sync::Arc::new(other::OtherDesktop)
}
