// 박스의 보관함 폴더 (Electron 판 src/main/hold.js 를 옮긴 것).
//
// 박스에 담는다는 것은 그 파일을 박스의 폴더로 옮긴다는 뜻이다.
// 옮기고 나면 바탕화면 폴더에서 빠지므로 탐색기가 그 아이콘을 그리지 않는다.
//
// 보관함은 사용자 데이터 폴더 아래 'boxes' 다. 앞선 판이 바탕화면에 만들어 둔 보관함
// (.MyDeskBox)은 처음 켤 때 이리로 옮겨 온다.
//
// 이 모듈은 운영체제 모듈을 부르지 않는다. 폴더 자리와 숨김 처리는 configure 로 받는다.

use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use crate::pathx::{self, basename, dirname, extname, join, resolve, stem};
use crate::store::{Fence, Item};

pub const BOXES: &str = "boxes";
pub const FOLDER: &str = ".MyDeskBox";
pub const MANIFEST: &str = "restore.json";

pub type HideFn = Arc<dyn Fn(&str) -> bool + Send + Sync>;

#[derive(Clone, Default)]
pub struct Config {
    pub root: String,
    pub desktop_dir: String,
    pub user_dir: String,
    pub hide: Option<HideFn>,
}

// 담은 결과. stuck 이면 다른 프로그램이 붙잡고 있어 옮기지 못했다.
#[derive(Debug, Clone, PartialEq)]
pub struct Took {
    pub name: String,
    pub path: String,
    pub home: String,
    pub stuck: bool,
}

impl Took {
    pub fn item(&self) -> Item {
        Item { name: self.name.clone(), path: self.path.clone(), home: Some(self.home.clone()).filter(|h| !h.is_empty()) }
    }
}

#[derive(Default)]
pub struct Hold {
    config: Config,
    // 무엇이 어디서 왔는지. 열쇠는 path.resolve 한 경로다. 적은 차례를 지킨다.
    notes: Option<Vec<(String, String)>>,
}

impl Hold {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn configure(&mut self, config: Config) -> String {
        self.config = Config { root: config.root.trim().to_string(), ..config };
        self.notes = None;
        self.root_dir()
    }

    pub fn desktop_dir(&self) -> &str {
        &self.config.desktop_dir
    }

    // 보관함 폴더. 설정에 적어 둔 것이 있으면 그것을, 없으면 사용자 데이터 폴더 아래를 쓴다.
    pub fn root_dir(&self) -> String {
        if !self.config.root.is_empty() {
            return self.config.root.clone();
        }
        if self.config.user_dir.is_empty() {
            return String::new();
        }
        join(&self.config.user_dir, BOXES)
    }

    pub fn legacy_dir(&self) -> String {
        if self.config.desktop_dir.is_empty() {
            return String::new();
        }
        join(&self.config.desktop_dir, FOLDER)
    }

    fn under_desktop(&self, dir: &str) -> bool {
        !self.config.desktop_dir.is_empty() && !dir.is_empty() && pathx::within(&self.config.desktop_dir, dir)
    }

    // 바탕화면에 남아 있는 앞선 판의 보관함을 지금 자리로 옮겨 온다.
    fn adopt_legacy(&mut self, dir: &str) -> bool {
        let legacy = self.legacy_dir();
        if legacy.is_empty() || resolve(&legacy) == resolve(dir) {
            return false;
        }
        let Ok(entries) = fs::read_dir(&legacy) else { return false };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let to = join(dir, &name);
            if Path::new(&to).exists() {
                continue;
            }
            move_file(&join(&legacy, &name), &to);
        }
        if fs::read_dir(&legacy).map(|mut d| d.next().is_none()).unwrap_or(false) {
            let _ = fs::remove_dir(&legacy);
        }
        true
    }

    pub fn ensure_root(&mut self) -> String {
        let dir = self.root_dir();
        if dir.is_empty() {
            return String::new();
        }
        if fs::create_dir_all(&dir).is_err() {
            return String::new();
        }
        self.adopt_legacy(&dir);
        // 설정에서 보관함을 바탕화면 아래로 정한 경우에만 감춘다.
        if let Some(hide) = self.config.hide.clone() {
            if self.under_desktop(&dir) {
                hide(&dir);
            }
        }
        dir
    }

    // 이 박스가 쓸 폴더 이름을 정한다. 한 번 정하면 layout.json 에 남아 바뀌지 않는다.
    pub fn folder_name(&self, fence: &mut Fence) -> String {
        if !fence.folder.is_empty() {
            return fence.folder.clone();
        }
        let root = self.root_dir();
        let base = safe_name(&fence.title, &fence.id);
        let mut name = base.clone();
        let mut n = 2;
        while !root.is_empty() && Path::new(&join(&root, &name)).exists() {
            name = format!("{base} ({n})");
            n += 1;
        }
        fence.folder = name.clone();
        name
    }

    // 박스의 폴더. 없으면 만든다.
    pub fn dir_for(&mut self, fence: &mut Fence) -> String {
        let root = self.ensure_root();
        if root.is_empty() {
            return String::new();
        }
        let dir = join(&root, &self.folder_name(fence));
        if fs::create_dir_all(&dir).is_err() {
            return String::new();
        }
        dir
    }

    // 담는다. 옮기지 못하면 온 자리를 그대로 돌려주고 stuck 을 붙인다.
    pub fn take(&mut self, fence: &mut Fence, item: &Item) -> Option<Took> {
        if item.path.is_empty() {
            return None;
        }
        let from = item.path.clone();
        let dir = self.dir_for(fence);
        if dir.is_empty() {
            return Some(Took { name: item.name.clone(), path: from, home: item.home_str().into(), stuck: true });
        }
        let home = self.home_for(item, &from);
        // 이미 이 박스 폴더에 있는 것은 그대로 둔다.
        if resolve(&dirname(&from)) == resolve(&dir) {
            return Some(Took { name: basename(&from), path: from, home, stuck: false });
        }
        if !Path::new(&from).exists() {
            return None;
        }
        let dest = spare_name(&dir, &basename(&from));
        if !move_file(&from, &dest) {
            return Some(Took { name: item.name.clone(), path: from, home: item.home_str().into(), stuck: true });
        }
        self.forget(&from);
        self.remember(&dest, &home);
        Some(Took { name: basename(&dest), path: dest, home, stuck: false })
    }

    // 이 파일을 담으면 박스 폴더의 무엇과 이름이 부딪히는가.
    pub fn clash(&self, fence: &Fence, file: &str) -> String {
        let root = self.root_dir();
        if root.is_empty() || fence.folder.is_empty() || file.is_empty() {
            return String::new();
        }
        let dir = join(&root, &fence.folder);
        if resolve(&dirname(file)) == resolve(&dir) {
            return String::new();
        }
        let dest = join(&dir, &basename(file));
        if Path::new(&dest).exists() {
            dest
        } else {
            String::new()
        }
    }

    // 박스 안의 파일 이름을 바꾼다. 어디서 왔는지 적어 둔 기록도 새 이름으로 옮긴다.
    pub fn relabel(&mut self, item: &Item, base: &str) -> Option<Took> {
        if item.path.is_empty() || base.is_empty() {
            return None;
        }
        let from = item.path.clone();
        let to = join(&dirname(&from), base);
        let home = match item.home.as_deref() {
            Some(h) if !h.is_empty() => h.to_string(),
            _ => self.noted(&from),
        };
        if from == to {
            return Some(Took { name: basename(&from), path: from, home, stuck: false });
        }
        fs::rename(&from, &to).ok()?;
        self.forget(&from);
        if !home.is_empty() {
            self.remember(&to, &home);
        }
        Some(Took { name: basename(&to), path: to, home, stuck: false })
    }

    // 이 파일이 담기 전에 있던 폴더. 보관함 안에서 온 것은 적어 둔 기록을, 그것도 없으면 바탕화면을 본다.
    fn home_for(&mut self, item: &Item, from: &str) -> String {
        if let Some(h) = item.home.as_deref().filter(|h| !h.is_empty()) {
            return h.to_string();
        }
        let noted = self.noted(from);
        if !noted.is_empty() {
            return noted;
        }
        if self.inside(from) {
            return self.config.desktop_dir.clone();
        }
        dirname(from)
    }

    // 꺼낸다. 담기 전에 있던 폴더로 돌려보낸다. 그 폴더가 없어졌으면 바탕화면으로 간다.
    pub fn give(&mut self, item: &Item) -> String {
        if item.path.is_empty() {
            return String::new();
        }
        let from = item.path.clone();
        if !Path::new(&from).exists() {
            self.forget(&from);
            return String::new();
        }
        let home = self.pick_home(item);
        if home.is_empty() {
            return from;
        }
        if resolve(&dirname(&from)) == resolve(&home) {
            self.forget(&from);
            return from;
        }
        let dest = spare_name(&home, &basename(&from));
        if move_file(&from, &dest) {
            self.forget(&from);
            return dest;
        }
        // 그 자리에 쓸 수 없으면 바탕화면으로 보낸다 (공용 바탕화면은 관리자만 쓸 수 있다).
        let spare = self.config.desktop_dir.clone();
        if !spare.is_empty() && resolve(&spare) != resolve(&home) {
            let other = spare_name(&spare, &basename(&from));
            if move_file(&from, &other) {
                self.forget(&from);
                return other;
            }
        }
        from
    }

    fn pick_home(&mut self, item: &Item) -> String {
        let noted = self.noted(&item.path);
        let wanted = [item.home_str().to_string(), noted, self.config.desktop_dir.clone()];
        wanted.into_iter().find(|dir| !dir.is_empty() && Path::new(dir).is_dir()).unwrap_or_default()
    }

    // 박스 폴더 안의 파일 이름.
    pub fn names(&self, fence: &Fence) -> Vec<String> {
        let root = self.root_dir();
        if root.is_empty() || fence.folder.is_empty() {
            return vec![];
        }
        let Ok(entries) = fs::read_dir(join(&root, &fence.folder)) else { return vec![] };
        // readdirSync 와 같이 운영체제가 주는 차례 그대로 둔다.
        entries
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| !n.starts_with('.') && n.to_lowercase() != "desktop.ini")
            .collect()
    }

    // 박스를 지울 때. 남은 것이 없으면 폴더도 치운다.
    pub fn drop_box(&self, fence: &Fence) -> bool {
        let root = self.root_dir();
        if root.is_empty() || fence.folder.is_empty() {
            return false;
        }
        let dir = join(&root, &fence.folder);
        let empty = fs::read_dir(&dir).map(|mut d| d.next().is_none()).unwrap_or(false);
        empty && fs::remove_dir(&dir).is_ok()
    }

    // ── 어디서 왔는지 적어 두기 ─────────────────────────────────────────

    fn manifest_path(&self) -> String {
        let root = self.root_dir();
        if root.is_empty() {
            String::new()
        } else {
            join(&root, MANIFEST)
        }
    }

    fn load(&mut self) -> &mut Vec<(String, String)> {
        if self.notes.is_none() {
            let mut notes: Vec<(String, String)> = Vec::new();
            let file = self.manifest_path();
            if !file.is_empty() {
                if let Ok(text) = fs::read_to_string(&file) {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                        for row in parsed.get("items").and_then(Value::as_array).cloned().unwrap_or_default() {
                            let path = row.get("path").and_then(Value::as_str).unwrap_or("");
                            let home = row.get("home").and_then(Value::as_str).unwrap_or("");
                            if !path.is_empty() && !home.is_empty() {
                                let key = resolve(path);
                                notes.retain(|(k, _)| *k != key);
                                notes.push((key, home.to_string()));
                            }
                        }
                    }
                }
            }
            self.notes = Some(notes);
        }
        self.notes.as_mut().unwrap()
    }

    fn flush(&mut self) -> bool {
        let file = self.manifest_path();
        if file.is_empty() {
            return false;
        }
        let items: Vec<Value> = self.load().iter().map(|(p, h)| json!({ "path": p, "home": h })).collect();
        let body = serde_json::to_string_pretty(&json!({ "version": 1, "items": items })).unwrap();
        let _ = fs::create_dir_all(dirname(&file));
        let tmp = format!("{file}.tmp");
        fs::write(&tmp, body).and_then(|_| fs::rename(&tmp, &file)).is_ok()
    }

    fn remember(&mut self, at: &str, home: &str) {
        let key = resolve(at);
        let notes = self.load();
        if let Some(row) = notes.iter_mut().find(|(k, _)| *k == key) {
            row.1 = home.to_string();
        } else {
            notes.push((key, home.to_string()));
        }
        self.flush();
    }

    fn forget(&mut self, at: &str) {
        let key = resolve(at);
        let notes = self.load();
        let before = notes.len();
        notes.retain(|(k, _)| *k != key);
        if notes.len() != before {
            self.flush();
        }
    }

    pub fn noted(&mut self, at: &str) -> String {
        if at.is_empty() {
            return String::new();
        }
        let key = resolve(at);
        self.load().iter().find(|(k, _)| *k == key).map(|(_, h)| h.clone()).unwrap_or_default()
    }

    // 앱이 갑자기 끝나 보관함에 남은 파일을 되돌린다. keep 에 든 것은 그대로 둔다.
    pub fn recover(&mut self, keep: &[String]) -> Vec<String> {
        if self.root_dir().is_empty() {
            return vec![];
        }
        let held: Vec<String> = keep.iter().map(|p| resolve(p)).collect();
        let mut back = Vec::new();
        let rows: Vec<(String, String)> = self.load().clone();
        for (at, home) in rows {
            if held.contains(&at) {
                continue;
            }
            let moved = self.give(&Item { name: basename(&at), path: at.clone(), home: Some(home) });
            if !moved.is_empty() && moved != at {
                back.push(moved);
            } else {
                self.forget(&at);
            }
        }
        back
    }

    // 보관함에 있는 파일인가.
    pub fn inside(&self, file: &str) -> bool {
        let root = self.root_dir();
        !root.is_empty() && !file.is_empty() && pathx::inside(&root, file)
    }

    // 모든 기록 (검사용)
    #[cfg(test)]
    pub fn manifest(&mut self) -> std::collections::BTreeMap<String, String> {
        self.load().iter().cloned().collect()
    }
}

// 폴더 이름으로 쓸 수 없는 글자를 걷어 낸다. 남는 것이 없으면 박스 번호를 쓴다.
pub fn safe_name(title: &str, id: &str) -> String {
    let replaced: String = title
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || (c as u32) < 0x20 { ' ' } else { c })
        .collect();
    let collapsed = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = collapsed.trim_end_matches(['.', ' ']).to_string();
    let cut: String = cleaned.chars().take(60).collect();
    if !cut.is_empty() {
        return cut;
    }
    let short: String = id.chars().take(8).collect();
    format!("box-{}", if short.is_empty() { "x".to_string() } else { short })
}

// 같은 이름이 이미 있으면 뒤에 번호를 붙인다. 덮어쓰지 않는다.
pub fn spare_name(dir: &str, base: &str) -> String {
    let ext = extname(base);
    let st = stem(base);
    let mut dest = join(dir, base);
    let mut n = 2;
    while Path::new(&dest).exists() {
        dest = join(dir, &format!("{st} ({n}){ext}"));
        n += 1;
    }
    dest
}

fn is_busy(err: &std::io::Error) -> bool {
    use std::io::ErrorKind;
    if matches!(err.kind(), ErrorKind::PermissionDenied) {
        return true;
    }
    // ERROR_SHARING_VIOLATION(32), ERROR_LOCK_VIOLATION(33) 은 EBUSY 로 온다.
    matches!(err.raw_os_error(), Some(32) | Some(33) | Some(16))
}

fn is_cross_device(err: &std::io::Error) -> bool {
    // ERROR_NOT_SAME_DEVICE(17), EXDEV(18)
    if cfg!(windows) {
        err.raw_os_error() == Some(17)
    } else {
        err.raw_os_error() == Some(18)
    }
}

// 파일 하나를 옮긴다. 드라이브가 다르면 복사한 뒤 지운다. 붙잡혀 있으면 몇 번 더 해 본다.
pub fn move_file(from: &str, to: &str) -> bool {
    const TRIES: usize = 4;
    let mut cross = false;
    for turn in 0..TRIES {
        match fs::rename(from, to) {
            Ok(_) => return true,
            Err(err) => {
                if is_cross_device(&err) {
                    cross = true;
                    break;
                }
                if !is_busy(&err) || turn == TRIES - 1 {
                    return false;
                }
                std::thread::sleep(Duration::from_millis(70));
            }
        }
    }
    if !cross {
        return false;
    }
    if copy_tree(Path::new(from), Path::new(to)).is_ok() && remove_tree(Path::new(from)).is_ok() {
        return true;
    }
    false
}

pub fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    let meta = fs::symlink_metadata(from)?;
    if meta.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ())
    }
}

pub fn remove_tree(at: &Path) -> std::io::Result<()> {
    match fs::symlink_metadata(at) {
        Ok(meta) if meta.is_dir() => fs::remove_dir_all(at),
        Ok(_) => fs::remove_file(at),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pathx::s;
    use std::sync::Mutex;

    fn room() -> String {
        let dir = tempfile::tempdir().unwrap();
        s(dir.keep())
    }

    struct Fresh {
        hold: Hold,
        root: String,
        desk: String,
    }

    fn fresh() -> Fresh {
        let (root, desk, user) = (room(), room(), room());
        let mut hold = Hold::new();
        hold.configure(Config { root: root.clone(), desktop_dir: desk.clone(), user_dir: user, hide: None });
        Fresh { hold, root, desk }
    }

    fn file_in(dir: &str, name: &str, body: &str) -> Item {
        let at = join(dir, name);
        fs::write(&at, body).unwrap();
        Item::new(name, at)
    }

    fn fence(id: &str, title: &str) -> Fence {
        let mut f = crate::store::normalize_fence(&json!({ "id": id, "title": title }));
        f.folder = String::new();
        f
    }

    #[test]
    fn storage_lives_under_the_user_data_folder() {
        let (user, desk) = (room(), room());
        let mut hold = Hold::new();
        hold.configure(Config { root: String::new(), desktop_dir: desk.clone(), user_dir: user.clone(), hide: None });
        assert_eq!(hold.root_dir(), join(&user, "boxes"));
        assert!(!hold.root_dir().starts_with(&desk));
    }

    #[test]
    fn hides_storage_only_when_it_is_on_the_desktop() {
        let asked = Arc::new(Mutex::new(Vec::<String>::new()));
        let rec = asked.clone();
        let hide: HideFn = Arc::new(move |d: &str| {
            rec.lock().unwrap().push(d.to_string());
            true
        });
        let (user, desk) = (room(), room());
        let mut hold = Hold::new();
        hold.configure(Config { root: String::new(), desktop_dir: desk.clone(), user_dir: user, hide: Some(hide.clone()) });
        hold.ensure_root();
        assert!(asked.lock().unwrap().is_empty());
        let on_desk = join(&desk, "boxes");
        hold.configure(Config { root: on_desk.clone(), desktop_dir: desk, user_dir: String::new(), hide: Some(hide) });
        assert_eq!(hold.ensure_root(), on_desk);
        assert_eq!(*asked.lock().unwrap(), vec![on_desk]);
    }

    #[test]
    fn migrates_leftover_storage_from_the_desktop() {
        let (desk, user) = (room(), room());
        let legacy = join(&desk, ".MyDeskBox");
        fs::create_dir_all(join(&legacy, "지난 박스")).unwrap();
        fs::write(join(&join(&legacy, "지난 박스"), "담긴.txt"), "내용").unwrap();
        fs::write(join(&legacy, "restore.json"), r#"{"version":1,"items":[]}"#).unwrap();
        let mut hold = Hold::new();
        hold.configure(Config { root: String::new(), desktop_dir: desk.clone(), user_dir: user, hide: None });
        let root = hold.ensure_root();
        assert_eq!(fs::read_to_string(join(&join(&root, "지난 박스"), "담긴.txt")).unwrap(), "내용");
        assert!(!Path::new(&legacy).exists());
        let mut empty = Hold::new();
        let desk2 = room();
        empty.configure(Config { root: String::new(), desktop_dir: desk2.clone(), user_dir: room(), hide: None });
        empty.ensure_root();
        assert_eq!(fs::read_dir(&desk2).unwrap().count(), 0);
        let mut none = Hold::new();
        none.configure(Config::default());
        assert_eq!(none.root_dir(), "");
        assert_eq!(none.ensure_root(), "");
    }

    #[test]
    fn take_and_give_move_files_and_remember_home() {
        let Fresh { mut hold, root, desk } = fresh();
        let one = file_in(&desk, "보고서.txt", "내용");
        let mut f = fence("a", "일감");
        let moved = hold.take(&mut f, &one).unwrap();
        assert_eq!(moved.path, join(&join(&root, "일감"), "보고서.txt"));
        assert!(!Path::new(&one.path).exists());
        assert_eq!(fs::read_to_string(&moved.path).unwrap(), "내용");
        assert_eq!(moved.home, desk);
        assert!(!moved.stuck);
        let back = hold.give(&moved.item());
        assert_eq!(back, join(&desk, "보고서.txt"));
        assert!(!Path::new(&moved.path).exists());
    }

    #[test]
    fn goes_to_the_desktop_if_home_is_gone() {
        let Fresh { mut hold, desk, .. } = fresh();
        let gone = room();
        let one = file_in(&gone, "떠돌이.txt", "");
        let moved = hold.take(&mut fence("a", "일감"), &one).unwrap();
        fs::remove_dir_all(&gone).unwrap();
        assert_eq!(dirname(&hold.give(&moved.item())), desk);
    }

    #[test]
    fn numbers_instead_of_overwriting_and_keeps_in_place() {
        let Fresh { mut hold, root, desk } = fresh();
        let mut f = fence("a", "일감");
        let first = hold.take(&mut f, &file_in(&desk, "같은이름.txt", "먼저")).unwrap();
        let moved = hold.take(&mut f, &file_in(&room(), "같은이름.txt", "나중")).unwrap();
        assert_eq!(moved.path, join(&join(&root, "일감"), "같은이름 (2).txt"));
        assert_eq!(fs::read_to_string(&first.path).unwrap(), "먼저");
        let again = hold.take(&mut f, &first.item()).unwrap();
        assert_eq!(again.path, first.path);
        assert_eq!(again.home, first.home);
    }

    #[test]
    fn folder_names() {
        assert_eq!(safe_name("보고서", "id1"), "보고서");
        assert_eq!(safe_name("a/b\\c:d*e?f\"g<h>i|j", "id1"), "a b c d e f g h i j");
        assert_eq!(safe_name("   ", "abcdefghij"), "box-abcdefgh");
        assert_eq!(safe_name("끝에 점.", "id1"), "끝에 점");
        let Fresh { mut hold, root, .. } = fresh();
        let (mut a, mut b) = (fence("a", "일감"), fence("b", "일감"));
        hold.dir_for(&mut a);
        hold.dir_for(&mut b);
        assert_ne!(a.folder, b.folder);
        assert!(Path::new(&join(&root, &b.folder)).exists());
        let kept = a.folder.clone();
        a.title = "다른 이름".into();
        hold.dir_for(&mut a);
        assert_eq!(a.folder, kept);
    }

    #[test]
    fn lists_and_drops_box_folders() {
        let Fresh { mut hold, root, desk } = fresh();
        let mut f = fence("a", "일감");
        hold.take(&mut f, &file_in(&desk, "a.txt", ""));
        let moved = hold.take(&mut f, &file_in(&desk, "b.txt", "")).unwrap();
        let mut names = hold.names(&f);
        names.sort();
        assert_eq!(names, vec!["a.txt", "b.txt"]);
        assert!(!hold.drop_box(&f));
        hold.give(&Item::new("a.txt", join(&join(&root, "일감"), "a.txt")));
        hold.give(&moved.item());
        assert!(hold.drop_box(&f));
        assert!(!Path::new(&join(&root, &f.folder)).exists());
    }

    #[test]
    fn recovers_from_the_record_but_keeps_what_boxes_hold() {
        let Fresh { mut hold, root, desk } = fresh();
        let mut f = fence("a", "일감");
        let kept = hold.take(&mut f, &file_in(&desk, "담긴.txt", "")).unwrap();
        hold.take(&mut f, &file_in(&desk, "남은.txt", "남은 것")).unwrap();
        let noted: Value = serde_json::from_str(&fs::read_to_string(join(&root, "restore.json")).unwrap()).unwrap();
        assert_eq!(noted["items"].as_array().unwrap().len(), 2);
        let mut next = Hold::new();
        next.configure(Config { root: root.clone(), desktop_dir: desk.clone(), ..Default::default() });
        let back = next.recover(&[kept.path.clone()]);
        assert_eq!(back, vec![join(&desk, "남은.txt")]);
        assert!(Path::new(&kept.path).exists());
        let noted: Value = serde_json::from_str(&fs::read_to_string(join(&root, "restore.json")).unwrap()).unwrap();
        assert_eq!(noted["items"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn inside_and_missing_files() {
        let Fresh { mut hold, root, desk } = fresh();
        assert!(hold.inside(&join(&join(&root, "일감"), "a.txt")));
        assert!(!hold.inside(&join(&desk, "a.txt")));
        assert!(!hold.inside(""));
        assert_eq!(hold.give(&Item::new("x", join(&join(&root, "없는"), "x.txt"))), "");
        assert_eq!(hold.take(&mut fence("a", "b"), &Item::new("", "")), None);
    }

    #[test]
    fn moving_between_boxes_keeps_the_real_home() {
        let Fresh { mut hold, desk, .. } = fresh();
        let (mut a, mut b) = (fence("a", "첫 박스"), fence("b", "둘째 박스"));
        let moved = hold.take(&mut a, &file_in(&desk, "옮길.txt", "글")).unwrap();
        let again = hold.take(&mut b, &Item::new(moved.name.clone(), moved.path.clone())).unwrap();
        assert_eq!(dirname(&again.path), join(&hold.root_dir(), "둘째 박스"));
        assert_eq!(again.home, desk);
        assert_eq!(hold.manifest().keys().cloned().collect::<Vec<_>>(), vec![resolve(&again.path)]);
        assert_eq!(hold.give(&again.item()), join(&desk, "옮길.txt"));
    }

    #[test]
    fn reports_clashes_and_relabels() {
        let Fresh { mut hold, root, desk } = fresh();
        let mut f = fence("a", "일감");
        hold.take(&mut f, &file_in(&desk, "겹치는이름.txt", "먼저"));
        let other = room();
        let coming = file_in(&other, "겹치는이름.txt", "나중");
        let inbox = join(&join(&root, "일감"), "겹치는이름.txt");
        assert_eq!(hold.clash(&f, &coming.path), inbox);
        assert_eq!(hold.clash(&f, &file_in(&other, "딴이름.txt", "").path), "");
        assert_eq!(hold.clash(&f, &inbox), "");
        assert_eq!(hold.clash(&fence("b", "x"), &coming.path), "");

        let moved = hold.take(&mut f, &file_in(&desk, "처음.txt", "글")).unwrap();
        let next = hold.relabel(&moved.item(), "나중.txt").unwrap();
        assert_eq!(next.path, join(&join(&root, "일감"), "나중.txt"));
        assert_eq!(next.home, desk);
        assert_eq!(hold.noted(&next.path), desk);
        assert_eq!(hold.noted(&moved.path), "");
        assert!(hold.relabel(&next.item(), "").is_none());
        assert_eq!(hold.give(&next.item()), join(&desk, "나중.txt"));
    }

    #[test]
    fn marks_stuck_when_the_move_fails() {
        let (desk, user) = (room(), room());
        let root = join(&room(), "boxes");
        fs::create_dir_all(&root).unwrap();
        fs::write(join(&root, "일감"), "폴더가 아니다").unwrap();
        let mut hold = Hold::new();
        hold.configure(Config { root, desktop_dir: desk.clone(), user_dir: user, hide: None });
        let one = file_in(&desk, "메모.txt", "하나뿐");
        let mut f = fence("a", "일감");
        f.folder = "일감".into();
        let got = hold.take(&mut f, &one).unwrap();
        assert!(got.stuck);
        assert_eq!(got.path, one.path);
        assert!(Path::new(&one.path).exists());
    }
}
