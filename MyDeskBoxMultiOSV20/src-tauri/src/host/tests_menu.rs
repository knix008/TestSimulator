// Electron 판 test/menu.test.js — 박스 메뉴와 트레이 메뉴.

use serde_json::json;
use std::path::Path;

use super::testkit::*;
use super::*;
use crate::ui::{Action, MenuIcon, MenuItem};

#[derive(Debug, Clone)]
struct Flat {
    item: MenuItem,
    where_: String,
}

// 나눔줄을 빼고 아래 메뉴까지 펼친다.
fn flatten(items: &[MenuItem], trail: &str) -> Vec<Flat> {
    let mut out = Vec::new();
    for item in items {
        if matches!(item, MenuItem::Separator) {
            continue;
        }
        let where_ = format!("{trail}{}", item.label());
        out.push(Flat { item: item.clone(), where_: where_.clone() });
        if let MenuItem::Sub { items, .. } = item {
            out.extend(flatten(items, &format!("{where_} > ")));
        }
    }
    out
}

fn icon_of(item: &MenuItem) -> MenuIcon {
    match item {
        MenuItem::Action { icon, .. } | MenuItem::Check { icon, .. } | MenuItem::Radio { icon, .. } | MenuItem::Sub { icon, .. } => icon.clone(),
        MenuItem::Separator => MenuIcon::None,
    }
}

fn action_of(item: &MenuItem) -> Action {
    match item {
        MenuItem::Action { action, .. } | MenuItem::Check { action, .. } | MenuItem::Radio { action, .. } => action.clone(),
        _ => panic!("no action"),
    }
}

fn enabled(item: &MenuItem) -> bool {
    match item {
        MenuItem::Action { enabled, .. } => *enabled,
        _ => true,
    }
}

fn find(items: &[MenuItem], label: &str) -> Option<Flat> {
    flatten(items, "").into_iter().find(|f| f.item.label() == label)
}

// 메뉴 그림 파일이 실제로 있어야 한다.
fn assert_icons(items: &[MenuItem]) {
    let flat = flatten(items, "");
    assert!(flat.len() >= 5);
    for f in flat {
        match icon_of(&f.item) {
            MenuIcon::Asset(name) => {
                let file = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/assets").join(&name);
                assert!(file.exists(), "icon file for '{}' is missing: {}", f.where_, name);
            }
            MenuIcon::Pic(_) => {}
            MenuIcon::None => panic!("'{}' has no icon", f.where_),
        }
    }
}

fn open_one() -> Kit {
    let k = kit(base_state(json!({ "fences": [{}] })));
    k.open_ready();
    k
}

#[test]
fn every_box_menu_item_has_an_icon() {
    let k = open_one();
    assert_icons(&k.h().fence_menu("a", None, &[]).unwrap());
    let items = k.h().fence_menu("a", Some("C:/Users/me/Desktop/a.lnk"), &[]).unwrap();
    assert!(find(&items, "열기").is_some());
    assert!(find(&items, "바탕화면으로 꺼내기").is_some());
    assert_icons(&items);
}

#[test]
fn right_clicking_the_recycle_bin_offers_empty_without_our_own_question() {
    let k = kit(base_state(json!({ "fences": [{ "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }] }] })));
    k.open_ready();
    let items = k.h().fence_menu("a", Some("shell:RecycleBinFolder"), &[]).unwrap();
    let empty = find(&items, "휴지통 비우기").expect("no Empty item");
    assert_ne!(icon_of(&empty.item), MenuIcon::None);
    let plain = k.h().fence_menu("a", Some("C:/Desktop/노트.txt"), &[]).unwrap();
    assert!(find(&plain, "휴지통 비우기").is_none());
    k.answer(false);
    k.run(run_action(&k.sh, action_of(&empty.item)));
    assert!(k.ui.st().asks.is_empty(), "we asked again");
    let calls = k.desk.calls();
    assert_eq!(calls.emptied, 1);
    assert!(calls.bin_owners[0] > 0, "did not pass the owner window handle");
}

#[test]
fn label_and_icon_follow_the_collapsed_state() {
    let k = open_one();
    let items = k.h().fence_menu("a", None, &[]).unwrap();
    let open = find(&items, "접기").unwrap();
    assert_eq!(icon_of(&open.item), MenuIcon::Asset("menu/collapse.png".into()));
    k.h().set_collapsed("a", true);
    let items = k.h().fence_menu("a", None, &[]).unwrap();
    let closed = find(&items, "펼치기").unwrap();
    assert_eq!(icon_of(&closed.item), MenuIcon::Asset("menu/expand.png".into()));
}

#[test]
fn the_tray_menu_has_settings_quick_settings_and_about() {
    let k = open_one();
    let items = k.h().tray_menu();
    assert_icons(&items);
    let settings = find(&items, "설정").unwrap();
    assert!(matches!(settings.item, MenuItem::Action { action: Action::Prefs, .. }), "clicking Settings does not open a window");
    let quick = find(&items, "빠른 설정").unwrap();
    assert!(matches!(&quick.item, MenuItem::Sub { items, .. } if !items.is_empty()));
    let about = find(&items, "프로그램 정보").unwrap();
    assert_eq!(icon_of(&about.item), MenuIcon::Asset("menu/info.png".into()));
    assert_eq!(action_of(&about.item), Action::About);
    // 누르면 설정 창이 하나만 뜬다.
    k.run(run_action(&k.sh, Action::Prefs));
    k.ready_all();
    k.run(run_action(&k.sh, Action::Prefs));
    let opened = k.ui.pages("prefs.html");
    assert_eq!(opened.len(), 1);
    assert!(opened[0].visible);
}

#[test]
fn new_box_defaults_apply_to_the_next_box() {
    let k = kit(base_state(json!({})));
    k.h().set_default_theme("sunset");
    k.h().set_default_opacity(0.66);
    let id = k.h().finish_draw(0.0, 0.0, 300.0, 240.0).unwrap();
    let f = k.h().fence(&id).unwrap().clone();
    assert_eq!(f.theme, "sunset");
    assert_eq!(f.opacity, 0.66);
}

#[test]
fn tray_label_and_icon_follow_the_hidden_state() {
    let k = open_one();
    let before = find(&k.h().tray_menu(), "박스 숨기기").unwrap();
    assert_eq!(icon_of(&before.item), MenuIcon::Asset("menu/hide.png".into()));
    k.h().toggle_hidden();
    let after = find(&k.h().tray_menu(), "박스 보이기").unwrap();
    assert_eq!(icon_of(&after.item), MenuIcon::Asset("menu/show.png".into()));
}

#[test]
fn deleting_from_the_menu_asks_then_trashes() {
    let dir = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&dir, "지울 것.txt")] }] })));
    k.open_ready();
    k.refresh();
    let at = k.fence(0).items[0].path.clone();
    let items = k.h().fence_menu("a", Some(&at), &[]).unwrap();
    let del = find(&items, "삭제").unwrap();
    k.answer(true);
    k.run(run_action(&k.sh, action_of(&del.item)));
    let asks = k.ui.st().asks.clone();
    assert_eq!(asks.len(), 1);
    assert!(asks[0].title.contains("삭제할까요"));
    assert_eq!(asks[0].confirm, "삭제");
    assert_eq!(k.ui.st().trashed, vec![at]);
    assert!(k.fence(0).items.is_empty());
}

#[test]
fn cancelling_delete_keeps_the_file() {
    let dir = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&dir, "남길 것.txt")] }] })));
    k.open_ready();
    k.refresh();
    let at = k.fence(0).items[0].path.clone();
    k.answer(false);
    k.run(trash_items(&k.sh, "a", &[at.clone()]));
    assert!(k.ui.st().trashed.is_empty());
    assert!(Path::new(&at).exists());
    assert_eq!(k.fence(0).items.len(), 1);
}

#[test]
fn shell_items_cannot_be_deleted_or_renamed() {
    let k = kit(base_state(json!({ "fences": [{ "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }] }] })));
    k.open_ready();
    let items = k.h().fence_menu("a", Some("shell:RecycleBinFolder"), &[]).unwrap();
    assert!(!enabled(&find(&items, "삭제").unwrap().item));
    assert!(!enabled(&find(&items, "이름 바꾸기").unwrap().item));
}

#[test]
fn item_rename_and_box_rename_are_separate() {
    let dir = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&dir, "바꿀 것.txt")] }] })));
    k.open_ready();
    k.refresh();
    let at = k.fence(0).items[0].path.clone();
    let items = k.h().fence_menu("a", Some(&at), &[]).unwrap();
    let one = find(&items, "이름 바꾸기").unwrap();
    let bx = find(&items, "박스 이름 바꾸기").unwrap();
    k.run(run_action(&k.sh, action_of(&one.item)));
    assert_eq!(k.fence_win(0).messages("fence:rename-item"), vec![json!(at)]);
    k.run(run_action(&k.sh, action_of(&bx.item)));
    assert_eq!(k.fence_win(0).messages("fence:rename").len(), 1);
    let empty = k.h().fence_menu("a", None, &[]).unwrap();
    assert!(find(&empty, "이름 바꾸기").is_none());
    assert!(find(&empty, "박스 이름 바꾸기").is_some());
}

#[test]
fn show_hidden_switches_in_the_tray_and_in_one_box() {
    let k = kit(base_state(json!({ "fences": [{}, { "id": "b", "x": 600 }] })));
    k.open_all();
    let item = find(&k.h().tray_menu(), "숨김·임시 파일 보이기 (모든 박스)").unwrap();
    assert!(item.where_.starts_with("빠른 설정 > "));
    assert!(matches!(item.item, MenuItem::Check { checked: false, .. }));
    k.run(run_action(&k.sh, action_of(&item.item)));
    assert!(k.state().settings.show_hidden);
    assert!(k.state().fences.iter().all(|f| f.show_hidden));
    let after = find(&k.h().tray_menu(), "숨김·임시 파일 보이기 (모든 박스)").unwrap();
    assert!(matches!(after.item, MenuItem::Check { checked: true, .. }));

    let k = kit(base_state(json!({ "fences": [{}, { "id": "b", "x": 600 }] })));
    k.open_all();
    let item = find(&k.h().fence_menu("a", None, &[]).unwrap(), "숨김·임시 파일 보이기").unwrap();
    assert!(matches!(item.item, MenuItem::Check { checked: false, .. }));
    k.run(run_action(&k.sh, action_of(&item.item)));
    assert_eq!(k.state().fences.iter().map(|f| f.show_hidden).collect::<Vec<_>>(), vec![true, false]);
    assert!(!k.state().settings.show_hidden);
    let again = find(&k.h().fence_menu("a", None, &[]).unwrap(), "숨김·임시 파일 보이기").unwrap();
    assert!(matches!(again.item, MenuItem::Check { checked: true, .. }));
}

#[test]
fn the_author_is_listed_as_shkwon() {
    assert_eq!(AUTHOR_NAME, "SHKWON");
    assert_eq!(AUTHOR_EMAIL, "knix008@naver.com");
}
