// 바탕화면을 켜기 전 모습으로 돌려놓는다. 창을 띄우지 않는 길이다 (Electron 판 src/main/restore.js).
//
// 설치 프로그램과 제거 프로그램이 부른다(MyDeskBox.exe --restore-desktop).
// 세 가지를 되돌린다.
//  1. 박스에 담아 둔 파일 : restore.json 에 적힌 자리로 옮긴다(hold.recover).
//     적혀 있지 않거나 그 자리에 옮기지 못한 것은 바탕화면으로 보낸다.
//  2. 감춘 셸 아이콘(휴지통 등) : 레지스트리 값을 앞서 있던 값으로 되돌린다.
//  3. 비켜 둔 아이콘 자리 : icon-homes.json 에 적어 둔 자리로 돌려놓는다.
// 2와 3은 desktop.shutdown 이 맡는다. 앱이 끝날 때 지나는 길과 같은 코드다.

use std::fs;
use std::path::Path;

use crate::desktop::Desktop;
use crate::hold::{self, Config, Hold};
use crate::pathx::{basename, dirname, join};

#[derive(Debug, Default)]
pub struct Report {
    pub back: Vec<String>,
    pub strays: Vec<String>,
    pub left: Vec<String>,
    pub shell: bool,
}

// 보관함에 남은 파일. restore.json 처럼 보관함이 직접 쓰는 파일은 세지 않는다.
pub fn stray_files(root: &str) -> Vec<String> {
    let mut found = Vec::new();
    let Ok(dirs) = fs::read_dir(root) else { return found };
    for dir in dirs.flatten() {
        if !dir.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let bx = join(root, &dir.file_name().to_string_lossy());
        let Ok(names) = fs::read_dir(&bx) else { continue };
        for name in names.flatten() {
            found.push(join(&bx, &name.file_name().to_string_lossy()));
        }
    }
    found
}

// 비어 있는 박스 폴더를 치운다.
pub fn drop_empty(root: &str) {
    let Ok(dirs) = fs::read_dir(root) else { return };
    for dir in dirs.flatten() {
        if !dir.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let bx = dir.path();
        if fs::read_dir(&bx).map(|mut d| d.next().is_none()).unwrap_or(false) {
            let _ = fs::remove_dir(&bx);
        }
    }
}

pub fn restore_desktop(desktop: &dyn Desktop, user_dir: &str, desktop_dir: &str, root: &str) -> Report {
    let mut report = Report::default();
    if desktop_dir.is_empty() {
        return report;
    }
    let mut hold = Hold::new();
    let root = hold.configure(Config {
        root: root.to_string(),
        desktop_dir: desktop_dir.to_string(),
        user_dir: user_dir.to_string(),
        hide: None,
    });
    if root.is_empty() {
        return report;
    }
    // 아이콘 자리와 감춘 기록을 읽어 들인다. shutdown 이 그것으로 되돌린다.
    desktop.init(user_dir);

    // 1) 적혀 있는 것부터 제자리로.
    report.back = hold.recover(&[]);

    // 2) 적혀 있지 않은 것과 옮기지 못한 것은 바탕화면으로.
    for at in stray_files(&root) {
        let dest = hold::spare_name(desktop_dir, &basename(&at));
        if fs::rename(&at, &dest).is_ok() {
            report.strays.push(dest);
            continue;
        }
        if hold::copy_tree(Path::new(&at), Path::new(&dest)).is_ok() && hold::remove_tree(Path::new(&at)).is_ok() {
            report.strays.push(dest);
        } else {
            report.left.push(at);
        }
    }
    drop_empty(&root);

    // 3) 탐색기에 알린다. 파일이 돌아온 폴더를 다시 그려야 아이콘이 보인다.
    let mut dirs = vec![desktop_dir.to_string()];
    for at in report.back.iter().chain(report.strays.iter()) {
        let dir = dirname(at);
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    for dir in dirs {
        desktop.refresh_folder(&dir);
    }

    // 4) 감춘 셸 아이콘과 비켜 둔 아이콘 자리를 되돌린다.
    desktop.shutdown();
    report.shell = true;
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::fake::FakeDesktop;
    use crate::pathx::s;
    use crate::store::{normalize_fence, Item};

    struct Place {
        user: String,
        desk: String,
        root: String,
        folder: String,
        made: Vec<String>,
    }

    fn held(names: &[&str]) -> Place {
        let user = s(tempfile::tempdir().unwrap().keep());
        let desk = s(tempfile::tempdir().unwrap().keep());
        let root = join(&user, "boxes");
        let mut hold = Hold::new();
        hold.configure(Config { root: root.clone(), desktop_dir: desk.clone(), user_dir: user.clone(), hide: None });
        let mut fence = normalize_fence(&serde_json::json!({ "id": "a", "title": "일감" }));
        let mut made = Vec::new();
        for name in names {
            let at = join(&desk, name);
            fs::write(&at, name).unwrap();
            made.push(hold.take(&mut fence, &Item::new(*name, at)).unwrap().path);
        }
        Place { user, desk, root, folder: fence.folder, made }
    }

    fn listing(dir: &str) -> Vec<String> {
        let mut out: Vec<String> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        out.sort();
        out
    }

    #[test]
    fn held_files_return_to_their_recorded_location() {
        let p = held(&["노트.txt", "사진.png"]);
        let desk = FakeDesktop::new();
        let report = restore_desktop(&desk, &p.user, &p.desk, &p.root);
        assert_eq!(report.back.len(), 2);
        assert!(report.left.is_empty());
        assert_eq!(listing(&p.desk), vec!["노트.txt", "사진.png"]);
        for at in &p.made {
            assert!(!Path::new(at).exists());
        }
    }

    #[test]
    fn removes_empty_box_folders_and_notifies() {
        let p = held(&["노트.txt"]);
        let desk = FakeDesktop::new();
        restore_desktop(&desk, &p.user, &p.desk, &p.root);
        assert_eq!(listing(&p.root), vec!["restore.json"]);
        let calls = desk.calls();
        assert_eq!(calls.init, vec![p.user.clone()]);
        assert!(calls.refreshed.contains(&p.desk));
        assert_eq!(calls.shutdown, 1);
    }

    #[test]
    fn unrecorded_files_also_go_to_the_desktop() {
        let p = held(&["노트.txt"]);
        fs::write(join(&join(&p.root, &p.folder), "적히지않은.txt"), "기록 없음").unwrap();
        let desk = FakeDesktop::new();
        let report = restore_desktop(&desk, &p.user, &p.desk, &p.root);
        assert_eq!(report.strays.iter().map(|a| basename(a)).collect::<Vec<_>>(), vec!["적히지않은.txt"]);
        assert!(Path::new(&join(&p.desk, "적히지않은.txt")).exists());
        assert!(report.left.is_empty());
    }

    #[test]
    fn name_clash_keeps_both_files() {
        let p = held(&["노트.txt"]);
        fs::write(join(&p.desk, "노트.txt"), "새로 만든 것").unwrap();
        let report = restore_desktop(&FakeDesktop::new(), &p.user, &p.desk, &p.root);
        assert_eq!(report.back.len(), 1);
        assert_eq!(listing(&p.desk), vec!["노트 (2).txt", "노트.txt"]);
    }

    #[test]
    fn nothing_held_still_restores_shell_icons() {
        let user = s(tempfile::tempdir().unwrap().keep());
        let deskdir = s(tempfile::tempdir().unwrap().keep());
        let desk = FakeDesktop::new();
        let report = restore_desktop(&desk, &user, &deskdir, &join(&user, "boxes"));
        assert!(report.back.is_empty() && report.strays.is_empty() && report.left.is_empty());
        assert_eq!(desk.calls().shutdown, 1);
    }

    #[test]
    fn nothing_is_touched_when_the_desktop_folder_is_unknown() {
        let p = held(&["노트.txt"]);
        let desk = FakeDesktop::new();
        let report = restore_desktop(&desk, &p.user, "", &p.root);
        assert!(report.back.is_empty());
        assert_eq!(desk.calls().shutdown, 0);
        assert!(Path::new(&p.made[0]).exists());
    }

    #[test]
    fn counts_only_leftover_files() {
        let p = held(&["노트.txt"]);
        let found = stray_files(&p.root);
        assert_eq!(found.iter().map(|a| basename(a)).collect::<Vec<_>>(), vec!["노트.txt"]);
    }
}
