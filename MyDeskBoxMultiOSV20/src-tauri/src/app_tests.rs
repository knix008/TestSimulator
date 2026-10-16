// Electron 판 test/quit.test.js 와 test/startup.test.js 의 앱 쪽 검사.

use crate::app::{describe, restore_desktop, start};
use crate::host::testkit::*;
use crate::pathx::{dirname, join};
use serde_json::json;
use std::fs;
use std::path::Path;

struct Boxed {
    k: Kit,
    desk: String,
}

fn listing(dir: &str) -> Vec<String> {
    let mut out: Vec<String> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    out.sort();
    out
}

fn boxed_state(desk: &str) -> crate::store::State {
    let made: Vec<serde_json::Value> = ["MyClock.lnk", "노트.txt", "Photos"]
        .iter()
        .map(|n| {
            let at = join(desk, n);
            fs::write(&at, n).unwrap();
            json!({ "name": n, "path": at })
        })
        .collect();
    base_state(json!({ "fences": [
        { "id": "a", "items": [made[0], made[1]] },
        { "id": "b", "x": 600, "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }, made[2]] },
    ] }))
}

fn boxed() -> Boxed {
    let desk = room();
    let k = kit(boxed_state(&desk));
    k.run(start(&k.sh));
    Boxed { k, desk }
}

#[test]
fn on_startup_held_files_move_into_the_box_folders() {
    let b = boxed();
    assert!(listing(&b.desk).is_empty(), "files were left in the desktop folder");
    for item in b.k.h().captured() {
        if !item.path.starts_with("shell:") {
            assert!(Path::new(&item.path).exists());
        }
    }
}

#[test]
fn quitting_returns_every_held_item_and_remembers_the_boxes() {
    let b = boxed();
    restore_desktop(&b.k.sh);
    assert_eq!(listing(&b.desk), vec!["MyClock.lnk", "Photos", "노트.txt"]);
    let names = |at: usize| b.k.fence(at).items.iter().map(|i| i.name.clone()).collect::<Vec<_>>();
    assert_eq!(names(0), vec!["MyClock.lnk", "노트.txt"]);
    assert_eq!(names(1), vec!["휴지통", "Photos"]);
    for item in b.k.h().captured() {
        if item.path.starts_with("shell:") {
            continue;
        }
        assert_eq!(dirname(&item.path), b.desk);
    }
    assert!(!b.k.desk.calls().release.is_empty());
    assert_eq!(b.k.desk.calls().shutdown, 1);
    assert_eq!(fs::read_to_string(join(&b.desk, "노트.txt")).unwrap(), "노트.txt", "the contents changed");
    // 두 번 불러도 한 번만 한다.
    restore_desktop(&b.k.sh);
    assert_eq!(b.k.desk.calls().shutdown, 1);
}

#[test]
fn restarting_refills_boxes_from_the_remembered_settings() {
    let b = boxed();
    restore_desktop(&b.k.sh);
    let k = kit(b.k.state());
    k.run(start(&k.sh));
    assert!(listing(&b.desk).is_empty(), "files were left on the desktop after restarting");
    assert_eq!(k.fence(0).items.iter().map(|i| i.name.clone()).collect::<Vec<_>>(), vec!["MyClock.lnk", "노트.txt"]);
    for item in k.h().captured() {
        if !item.path.starts_with("shell:") {
            assert_ne!(dirname(&item.path), b.desk);
            assert!(Path::new(&item.path).exists());
        }
    }
    assert_eq!((k.fence(0).x, k.fence(1).x), (100.0, 600.0));
}

#[test]
fn files_return_even_when_hidden_and_with_no_boxes() {
    let desk = room();
    let mut state = boxed_state(&desk);
    state.hidden = true;
    let k = kit(state);
    k.run(start(&k.sh));
    restore_desktop(&k.sh);
    assert_eq!(listing(&desk).len(), 3);

    let k = kit(base_state(json!({})));
    k.run(start(&k.sh));
    restore_desktop(&k.sh);
    assert!(k.desk.calls().release.last().unwrap().is_empty());
    assert_eq!(k.desk.calls().shutdown, 1);
}

#[test]
fn files_left_by_a_previous_run_are_restored_on_startup() {
    let desk = room();
    let root = room();
    let bx = join(&root, "지난 박스");
    fs::create_dir_all(&bx).unwrap();
    let stray = join(&bx, "남은.txt");
    fs::write(&stray, "남은 것").unwrap();
    fs::write(join(&root, "restore.json"), json!({ "version": 1, "items": [{ "path": stray, "home": desk }] }).to_string()).unwrap();
    let k = kit(base_state(json!({ "settings": { "root": root } })));
    k.run(start(&k.sh));
    assert!(!Path::new(&stray).exists());
    assert!(Path::new(&join(&desk, "남은.txt")).exists());
}

#[test]
fn files_still_held_by_a_box_are_not_touched_on_startup() {
    let b = boxed();
    let kept: Vec<String> = b.k.h().captured().into_iter().filter(|i| !i.path.starts_with("shell:")).map(|i| i.path).collect();
    let k = kit(b.k.state());
    k.run(start(&k.sh));
    for at in kept {
        assert!(Path::new(&at).exists(), "{at} was sent back without reason");
    }
}

#[test]
fn first_run_asks_before_sorting_and_starts_drawing_when_declined() {
    let desk = room();
    fs::write(join(&desk, "보고서.docx"), "").unwrap();
    fs::create_dir(join(&desk, "폴더")).unwrap();
    let k = kit(base_state(json!({ "didWelcome": false })));
    k.desk.use_desktop(&[&desk]);
    k.answer(false);
    k.run(start(&k.sh));
    let asks = k.ui.st().asks.clone();
    assert_eq!(asks.len(), 1);
    assert!(k.state().fences.is_empty());
    assert!(k.state().did_welcome);
    assert_eq!(k.ui.pages("draw.html").len(), 1, "should start in draw mode");
    assert!(Path::new(&join(&desk, "보고서.docx")).exists(), "declined but files moved");

    let k = kit(base_state(json!({ "didWelcome": false })));
    k.desk.use_desktop(&[&desk]);
    k.desk.st().shell.clear();
    k.answer(true);
    k.run(start(&k.sh));
    let ids: Vec<String> = k.state().fences.iter().map(|f| f.id.clone()).collect();
    assert_eq!(ids, vec!["start-folder", "start-document"]);
    assert!(!Path::new(&join(&desk, "보고서.docx")).exists(), "sorted files go into the box folders");
    assert!(k.ui.pages("draw.html").is_empty());
}

#[test]
fn registers_as_a_startup_app_per_settings() {
    let k = kit(base_state(json!({ "settings": { "openAtLogin": true } })));
    k.run(start(&k.sh));
    assert!(k.h().autostart.enabled("MyDeskBox"));
    let k = kit(base_state(json!({ "settings": { "openAtLogin": false } })));
    k.run(start(&k.sh));
    assert!(!k.h().autostart.enabled("MyDeskBox"));
    k.h().set_login(true);
    assert!(k.state().settings.open_at_login);
    assert!(k.h().autostart.enabled("MyDeskBox"));
    k.h().set_login(false);
    assert!(!k.state().settings.open_at_login);
    assert!(!k.h().autostart.enabled("MyDeskBox"));
    // 개발 빌드는 등록하지 않지만 고른 값은 남긴다.
    k.h().autostart.packaged = false;
    k.h().set_login(true);
    assert!(k.state().settings.open_at_login);
    assert!(!k.h().autostart.enabled("MyDeskBox"));
}

#[test]
fn positions_settings_and_states_are_recorded() {
    let k = kit(base_state(json!({ "fences": [{ "x": 300, "y": 200 }] })));
    k.open_ready();
    let saved = || crate::store::load(Path::new(&k.ui.user_dir), "ko");
    k.h().apply_bounds("a", 400.0, 260.0, 400.0, 300.0, false);
    assert_ne!(saved().fences.first().map(|f| f.x), Some(400.0), "wrote while dragging");
    k.h().apply_bounds("a", 400.0, 260.0, 400.0, 300.0, true);
    assert_eq!(saved().fences[0].x, 400.0);
    k.h().set_lang("en");
    k.h().set_shadow(true);
    k.h().set_collapsed("a", true);
    k.h().toggle_hidden();
    k.h().rename("a", "새 이름");
    k.h().restyle("a", &json!({ "theme": "night" }));
    let s = saved();
    assert_eq!(s.settings.lang, "en");
    assert!(s.settings.shadow);
    assert!(s.fences[0].collapsed);
    assert!(s.hidden);
    assert_eq!(s.fences[0].title, "새 이름");
    assert_eq!(s.fences[0].theme, "night");
}

#[test]
fn describes_errors_with_version_and_platform() {
    let text = describe("Error: 일부러 낸 오류\n    at here", "1.0.0");
    assert!(text.starts_with("MyDeskBox 1.0.0\n"));
    assert!(text.contains("일부러 낸 오류"));
    assert!(text.contains(std::env::consts::OS));
}
