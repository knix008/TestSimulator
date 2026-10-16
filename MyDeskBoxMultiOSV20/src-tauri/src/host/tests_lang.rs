// Electron 판 test/lang.test.js 의 호스트 부분 — 언어를 바꾸면 트레이·박스 메뉴·박스 창이 따라온다.

use serde_json::json;

use super::testkit::*;
use crate::ui::{MenuIcon, MenuItem};

fn flatten(items: &[MenuItem]) -> Vec<MenuItem> {
    let mut out = Vec::new();
    for item in items {
        if matches!(item, MenuItem::Separator) {
            continue;
        }
        out.push(item.clone());
        if let MenuItem::Sub { items, .. } = item {
            out.extend(flatten(items));
        }
    }
    out
}

fn labels(items: &[MenuItem]) -> Vec<String> {
    flatten(items).iter().map(|i| i.label().to_string()).collect()
}

fn radio(items: &[MenuItem], label: &str) -> (MenuIcon, bool) {
    match flatten(items).into_iter().find(|i| i.label() == label) {
        Some(MenuItem::Radio { icon, checked, .. }) => (icon, checked),
        other => panic!("'{label}' is not a radio item: {other:?}"),
    }
}

fn open_one(lang: &str) -> Kit {
    let k = kit(base_state(json!({ "settings": { "lang": lang }, "fences": [{ "id": "a" }] })));
    k.open_ready();
    k
}

#[test]
fn tray_menu_shows_the_flag_together_with_the_language_name() {
    let k = open_one("ko");
    let items = k.h().tray_menu();
    let (ko_icon, ko_checked) = radio(&items, "한국어");
    let (en_icon, en_checked) = radio(&items, "English");
    assert_eq!(ko_icon, MenuIcon::Asset("menu/lang-ko.png".into()));
    assert_eq!(en_icon, MenuIcon::Asset("menu/lang-en.png".into()));
    assert!(ko_checked, "current language is checked");
    assert!(!en_checked);
}

#[test]
fn switching_language_changes_tray_text_to_english() {
    let k = open_one("ko");
    assert!(labels(&k.h().tray_menu()).iter().any(|l| l == "박스 그리기"));
    k.h().set_lang("en");
    let items = k.h().tray_menu();
    let all = labels(&items);
    for want in ["New Box", "Settings", "Quit", "Ocean"] {
        assert!(all.iter().any(|l| l == want), "missing '{want}' in {all:?}");
    }
    assert!(radio(&items, "English").1, "check mark moves to the selected language");
    assert!(!radio(&items, "한국어").1);
}

#[test]
fn switching_language_also_changes_the_box_menu() {
    let k = open_one("en");
    let en = labels(&k.h().fence_menu("a", Some("C:/x/a.lnk"), &[]).unwrap());
    for want in ["Open", "Move to Desktop", "Delete Box"] {
        assert!(en.iter().any(|l| l == want), "missing '{want}' in {en:?}");
    }
    k.h().set_lang("ko");
    let ko = labels(&k.h().fence_menu("a", Some("C:/x/a.lnk"), &[]).unwrap());
    assert!(ko.iter().any(|l| l == "열기"));
    assert!(ko.iter().any(|l| l == "박스 삭제"));
}

#[test]
fn new_box_names_follow_the_selected_language() {
    let k = kit(base_state(json!({ "settings": { "lang": "en" } })));
    let title = |k: &Kit| {
        let id = k.h().finish_draw(0.0, 0.0, 300.0, 240.0).unwrap();
        k.state().fences.iter().find(|f| f.id == id).unwrap().title.clone()
    };
    assert_eq!(title(&k), "New Box");
    assert_eq!(title(&k), "New Box 2");
    k.h().set_lang("ko");
    assert_eq!(title(&k), "새 박스 3");
}

#[test]
fn setting_the_same_language_again_does_nothing() {
    let k = open_one("ko");
    let before = k.ui.st().announced;
    k.h().set_lang("ko");
    assert_eq!(k.ui.st().announced, before);
    k.h().set_lang("en");
    assert_eq!(k.ui.st().announced, before + 1);
}

#[test]
fn switching_language_applies_to_all_boxes() {
    let k = kit(base_state(json!({ "fences": [{ "id": "a" }, { "id": "b" }, { "id": "c" }] })));
    k.open_ready();
    k.h().set_lang("en");
    let boxes = k.ui.fences();
    assert_eq!(boxes.len(), 3);
    for win in boxes {
        let sent = win.messages("fence:state").last().cloned().unwrap();
        assert_eq!(sent["lang"], json!("en"), "a box was left in the old language");
    }
    assert_eq!(k.state().settings.lang, "en");
}
