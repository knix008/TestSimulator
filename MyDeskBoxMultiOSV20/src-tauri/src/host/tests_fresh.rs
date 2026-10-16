// Electron 판 test/fresh.test.js — 바탕화면에 같은 이름을 새로 만들었을 때 묻는 일.

use serde_json::json;
use std::fs;
use std::path::Path;

use super::testkit::*;
use super::*;
use crate::pathx::join;

struct Held {
    k: Kit,
    desk: String,
    held: String,
}

// 바탕화면 폴더를 쓰는 박스 하나를 열고 파일 하나를 담는다.
fn with_held(name: &str, text: &str) -> Held {
    let desk = room();
    let k = kit(base_state(json!({ "fences": [{}] })));
    k.desk.use_desktop(&[&desk]);
    k.open_all();
    let on_desk = join(&desk, name);
    fs::write(&on_desk, text).unwrap();
    // 담기 전에 한 번 본다. 이것이 '이미 있던 것' 이 된다.
    k.refresh();
    k.h().drop_files("a", &[Incoming::path(on_desk.clone())], Some(0), None);
    k.settle();
    assert_eq!(k.fence(0).items.len(), 1);
    assert!(!Path::new(&on_desk).exists());
    let held = k.fence(0).items[0].path.clone();
    Held { k, desk, held }
}

#[test]
fn asks_whether_to_replace_a_new_item_with_a_held_name() {
    let r = with_held("메모.txt", "묵은 것");
    fs::write(join(&r.desk, "메모.txt"), "새로 만든 것").unwrap();
    r.k.answer(false);
    r.k.refresh();
    let asks = r.k.ui.st().asks.clone();
    assert_eq!(asks.len(), 1);
    assert!(asks[0].title.contains("메모.txt"));
    assert!(asks[0].detail.contains(&r.k.fence(0).title));
    assert_eq!(asks[0].cancel, "새로 만들기");
}

#[test]
fn replacing_moves_the_new_item_in_and_trashes_the_old_one() {
    let r = with_held("메모.txt", "묵은 것");
    let again = join(&r.desk, "메모.txt");
    fs::write(&again, "새로 만든 것").unwrap();
    r.k.answer(true);
    r.k.refresh();
    assert_eq!(r.k.ui.st().trashed, vec![r.held.clone()]);
    assert_eq!(r.k.fence(0).items.len(), 1);
    let now = r.k.fence(0).items[0].path.clone();
    assert_eq!(fs::read_to_string(&now).unwrap(), "새로 만든 것");
    assert!(!Path::new(&again).exists());
}

#[test]
fn creating_anew_leaves_it_on_the_desktop() {
    let r = with_held("메모.txt", "묵은 것");
    let again = join(&r.desk, "메모.txt");
    fs::write(&again, "새로 만든 것").unwrap();
    r.k.answer(false);
    r.k.refresh();
    assert!(r.k.ui.st().trashed.is_empty());
    assert!(Path::new(&again).exists());
    assert_eq!(r.k.fence(0).items.iter().map(|i| i.path.clone()).collect::<Vec<_>>(), vec![r.held.clone()]);
    assert_eq!(fs::read_to_string(&r.held).unwrap(), "묵은 것");
    // 한 번 물은 것은 다시 묻지 않는다.
    r.k.refresh();
    r.k.refresh();
    assert_eq!(r.k.ui.st().asks.len(), 1);
}

#[test]
fn does_not_ask_without_a_collision_or_at_startup() {
    let r = with_held("메모.txt", "묵은 것");
    fs::write(join(&r.desk, "다른 것.txt"), "새로").unwrap();
    r.k.answer(true);
    r.k.refresh();
    assert!(r.k.ui.st().asks.is_empty());

    let desk = room();
    let at = join(&desk, "메모.txt");
    fs::write(&at, "처음부터 있던 것").unwrap();
    let k = kit(base_state(json!({ "fences": [{ "items": [{ "name": "메모.txt", "path": at }] }] })));
    k.desk.use_desktop(&[&desk]);
    k.answer(true);
    k.open_all();
    assert!(k.ui.st().asks.is_empty(), "asked right at startup");
}

#[test]
fn replacing_keeps_the_same_position_and_asks_one_at_a_time() {
    let desk = room();
    let k = kit(base_state(json!({ "fences": [{}] })));
    k.desk.use_desktop(&[&desk]);
    k.open_all();
    let names = ["하나.txt", "둘.txt", "셋.txt"];
    for n in names {
        fs::write(join(&desk, n), n).unwrap();
    }
    k.refresh();
    let entries: Vec<Incoming> = names.iter().map(|n| Incoming::path(join(&desk, n))).collect();
    k.h().drop_files("a", &entries, Some(0), None);
    assert_eq!(k.fence(0).items.iter().map(|i| i.name.clone()).collect::<Vec<_>>(), names);
    fs::write(join(&desk, "둘.txt"), "새로 만든 것").unwrap();
    fs::write(join(&desk, "셋.txt"), "새로 만든 것").unwrap();
    k.answer(true);
    k.refresh();
    assert_eq!(k.ui.st().asks.len(), 2);
    assert_eq!(k.ui.st().trashed.len(), 2);
    assert_eq!(k.fence(0).items.iter().map(|i| i.name.clone()).collect::<Vec<_>>(), names, "the replaced item was pushed to the end");
    assert_eq!(fs::read_to_string(&k.fence(0).items[1].path).unwrap(), "새로 만든 것");
    let titles: std::collections::HashSet<String> = k.ui.st().asks.iter().map(|a| a.title.clone()).collect();
    assert_eq!(titles.len(), 2);
}

#[test]
fn defers_while_another_prompt_is_open() {
    let r = with_held("메모.txt", "묵은 것");
    fs::write(join(&r.desk, "메모.txt"), "새로 만든 것").unwrap();
    // 다른 물음이 떠 있는 동안 (offer_fence 가 답을 기다리는 동안과 같다).
    r.k.h().asking = true;
    r.k.refresh();
    assert!(r.k.ui.st().asks.is_empty(), "asked on top of the previous prompt");
    r.k.h().asking = false;
    r.k.answer(false);
    r.k.refresh();
    let asks = r.k.ui.st().asks.clone();
    assert_eq!(asks.len(), 1, "the deferred prompt was lost");
    assert!(asks[0].title.contains("메모.txt"));
}

#[test]
fn a_box_holding_the_recycle_bin_does_not_collide_by_display_name() {
    let desk = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }] }] })));
    k.desk.use_desktop(&[&desk]);
    k.open_all();
    for n in ["휴지통", "RecycleBinFolder"] {
        fs::write(join(&desk, n), "새로").unwrap();
    }
    k.answer(true);
    k.refresh();
    assert!(k.ui.st().asks.is_empty());
    assert!(k.ui.st().trashed.is_empty());
    assert_eq!(k.fence(0).items[0].path, "shell:RecycleBinFolder");
}

#[test]
fn changes_nothing_if_trashing_fails_or_the_new_item_vanishes() {
    let r = with_held("메모.txt", "묵은 것");
    let again = join(&r.desk, "메모.txt");
    fs::write(&again, "새로 만든 것").unwrap();
    r.k.ui.st().trash_fails = true;
    r.k.answer(true);
    r.k.refresh();
    assert_eq!(r.k.ui.st().asks.len(), 1);
    assert!(Path::new(&again).exists());
    assert_eq!(r.k.fence(0).items[0].path, r.held);
    assert_eq!(fs::read_to_string(&r.held).unwrap(), "묵은 것");

    let r = with_held("메모.txt", "묵은 것");
    let again = join(&r.desk, "메모.txt");
    fs::write(&again, "새로 만든 것").unwrap();
    let gone = again.clone();
    r.k.ui.st().before_ask = Some(Box::new(move |_| {
        let _ = fs::remove_file(&gone);
    }));
    r.k.answer(true);
    r.k.refresh();
    assert!(r.k.ui.st().trashed.is_empty(), "trashed the old item with nothing to replace it");
    assert_eq!(r.k.fence(0).items[0].path, r.held);
}

#[test]
fn does_not_ask_about_items_it_returned_or_moved_itself() {
    let r = with_held("메모.txt", "묵은 것");
    r.k.h().eject("a", &r.held, None);
    r.k.refresh();
    assert!(r.k.ui.st().asks.is_empty());
    assert!(Path::new(&join(&r.desk, "메모.txt")).exists());

    let r = with_held("메모.txt", "하나뿐인 것");
    let back = join(&r.desk, "메모.txt");
    fs::rename(&r.held, &back).unwrap();
    r.k.refresh();
    assert!(r.k.ui.st().asks.is_empty(), "asked to replace the only copy");
    assert!(r.k.fence(0).items.is_empty());
    r.k.h().drop_files("a", &[Incoming::path(back)], Some(0), None);
    r.k.settle();
    assert!(r.k.ui.st().asks.is_empty());
    assert_eq!(r.k.fence(0).items.len(), 1);

    let r = with_held("메모.txt", "묵은 것");
    fs::remove_file(&r.held).unwrap();
    fs::write(join(&r.desk, "메모.txt"), "새로").unwrap();
    r.k.refresh();
    assert!(r.k.ui.st().asks.is_empty(), "asked to replace with nothing to discard");
}

#[cfg(windows)]
#[test]
fn names_differing_only_in_case_are_the_same_on_windows() {
    let r = with_held("Memo.txt", "묵은 것");
    fs::write(join(&r.desk, "MEMO.TXT"), "새로").unwrap();
    r.k.answer(false);
    r.k.refresh();
    assert_eq!(r.k.ui.st().asks.len(), 1);
}
