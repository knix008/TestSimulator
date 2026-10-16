// Electron 판 test/boxes.test.js 와 test/conceal.test.js 의 박스 쪽 검사.

use serde_json::json;
use std::path::Path;

use super::testkit::*;
use super::*;
use crate::geom::Point;
use crate::pathx::{basename, join};
use crate::ui::{Action, MenuIcon, MenuItem};

fn shown_names(k: &Kit) -> Vec<String> {
    k.h().push("a");
    let last = k.fence_win(0).messages("fence:state").last().unwrap().clone();
    last["items"].as_array().unwrap().iter().map(|i| i["name"].as_str().unwrap().to_string()).collect()
}

#[test]
fn multiple_boxes_each_get_their_own_window() {
    let k = kit(base_state(json!({})));
    k.open_all();
    let a = k.h().finish_draw(10.0, 10.0, 300.0, 240.0).unwrap();
    let b = k.h().finish_draw(400.0, 20.0, 260.0, 200.0).unwrap();
    let c = k.h().finish_draw(80.0, 400.0, 320.0, 280.0).unwrap();
    assert_eq!(k.state().fences.len(), 3);
    assert_eq!([a.clone(), b.clone(), c.clone()].iter().collect::<std::collections::HashSet<_>>().len(), 3);
    assert_eq!(k.ui.fences().len(), 3);
    let titles: std::collections::HashSet<String> = k.state().fences.iter().map(|f| f.title.clone()).collect();
    assert_eq!(titles.len(), 3);
    let at: Vec<(f64, f64)> = k.state().fences.iter().map(|f| (f.x, f.y)).collect();
    assert_eq!(at, vec![(10.0, 10.0), (400.0, 20.0), (80.0, 400.0)]);
}

#[test]
fn deleting_a_box_returns_its_icons_and_closes_the_window() {
    let dir = room();
    let items: Vec<_> = ["a.lnk", "b.lnk"].iter().map(|n| real_item(&dir, n)).collect();
    let k = kit(base_state(json!({ "fences": [{ "items": items }] })));
    k.open_ready();
    k.refresh();
    let label = k.fence_win(0).spec.label.clone();
    k.answer(true);
    k.run(remove_fence(&k.sh, "a"));
    assert!(k.state().fences.is_empty());
    assert_eq!(k.desk.calls().homed.last().unwrap(), &vec!["a.lnk".to_string(), "b.lnk".to_string()]);
    for n in ["a.lnk", "b.lnk"] {
        assert!(Path::new(&join(&dir, n)).exists());
    }
    assert!(k.ui.win(&label).unwrap().closed, "the window is closed too");
}

#[test]
fn each_box_has_its_own_theme_with_limits() {
    let k = kit(base_state(json!({ "fences": [{ "id": "a" }, { "id": "b" }] })));
    k.open_ready();
    k.h().restyle("a", &json!({ "theme": "sunset" }));
    k.h().restyle("b", &json!({ "theme": "night" }));
    assert_eq!(k.fence(0).theme, "sunset");
    assert_eq!(k.fence(1).theme, "night");
    k.h().push("a");
    let sent = k.fence_win(0).messages("fence:state").last().unwrap().clone();
    assert_eq!(sent["theme"]["id"], json!("sunset"));
    assert_eq!(sent["theme"]["bg"], json!(crate::themes::theme_of("sunset").bg));
    k.h().restyle("a", &json!({ "theme": "없는테마" }));
    assert_eq!(k.fence(0).theme, crate::themes::default_theme());
    k.h().restyle("a", &json!({ "opacity": 5 }));
    assert!(k.fence(0).opacity <= 0.9);
    k.h().restyle("a", &json!({ "opacity": -1 }));
    assert!(k.fence(0).opacity >= 0.15);
}

#[test]
fn deletion_and_creation_ask_in_our_window() {
    let k = kit(base_state(json!({ "fences": [{ "title": "일감" }] })));
    k.open_all();
    k.answer(true);
    k.run(remove_fence(&k.sh, "a"));
    let asked = k.ui.st().asks.last().unwrap().clone();
    assert!(asked.title.contains("일감"));
    assert!(!asked.detail.is_empty());
    assert!(asked.danger);
    assert!(!asked.icon.is_empty());
    assert!(!asked.confirm.is_empty() && !asked.cancel.is_empty());

    k.run(offer_fence(&k.sh, 0.0, 0.0, 300.0, 240.0));
    let asked = k.ui.st().asks.last().unwrap().clone();
    assert!(!asked.danger);
    assert!(!asked.icon.is_empty());

    let k = kit(base_state(json!({ "settings": { "lang": "en" } })));
    k.answer(false);
    k.run(offer_fence(&k.sh, 0.0, 0.0, 300.0, 240.0));
    let asked = k.ui.st().asks.last().unwrap().clone();
    assert_eq!(asked.confirm, "Create");
    assert_eq!(asked.cancel, "Cancel");
}

#[test]
fn the_recycle_bin_dragged_from_the_desktop_goes_into_the_box_under_it() {
    let k = kit(base_state(json!({ "fences": [{ "x": 100, "y": 100, "w": 400, "h": 300 }] })));
    k.open_ready();
    k.h().accept_desktop_drop(vec![Incoming::named("휴지통", "shell:RecycleBinFolder")], Point::new(180.0, 180.0));
    assert_eq!(k.fence(0).items.iter().map(|i| i.path.clone()).collect::<Vec<_>>(), vec!["shell:RecycleBinFolder"]);
    let k = kit(base_state(json!({ "fences": [{ "x": 100, "y": 100, "w": 200, "h": 160 }] })));
    k.open_ready();
    k.h().accept_desktop_drop(vec![Incoming::named("휴지통", "shell:RecycleBinFolder")], Point::new(900.0, 900.0));
    assert!(k.fence(0).items.is_empty());
}

#[test]
fn items_that_cannot_be_dragged_in_are_added_via_the_menu() {
    let k = kit(base_state(json!({ "fences": [{}] })));
    k.open_ready();
    let items = k.h().fence_menu("a", None, &[]).unwrap();
    let special = items.iter().find(|i| i.label() == "바탕화면 항목 담기").cloned().expect("menu entry");
    let MenuItem::Sub { icon, items: sub, .. } = special else { panic!() };
    assert_ne!(icon, MenuIcon::None);
    let bin = sub.iter().find(|i| i.label() == "휴지통").cloned().unwrap();
    let MenuItem::Action { icon, action, .. } = bin else { panic!() };
    assert_ne!(icon, MenuIcon::None);
    k.run(run_action(&k.sh, action));
    assert_eq!(k.fence(0).items.iter().map(|i| i.path.clone()).collect::<Vec<_>>(), vec!["shell:RecycleBinFolder"]);
    // 이미 담은 것은 다시 보이지 않는다.
    let items = k.h().fence_menu("a", None, &[]).unwrap();
    assert!(!items.iter().any(|i| i.label() == "바탕화면 항목 담기"));
    // 파일이 없다고 셸 항목을 빼지 않는다.
    k.h().push("a");
    assert_eq!(k.fence(0).items.len(), 1);
    let _ = Action::NewBox;
}

fn open_with(items: Vec<serde_json::Value>, extra: serde_json::Value) -> Kit {
    let mut raw = json!({ "items": items });
    if let Some(map) = extra.as_object() {
        for (k, v) in map {
            raw[k] = v.clone();
        }
    }
    let k = kit(base_state(json!({ "fences": [raw] })));
    k.desk.st().hidden_prefix = Some("secret".into());
    k.open_ready();
    k
}

#[test]
fn a_box_does_not_draw_hidden_or_temporary_files_by_default() {
    let dir = room();
    let items = ["보고서.docx", "~$보고서.docx", "secret.txt", "download.crdownload", "사진.png"].iter().map(|n| real_item(&dir, n)).collect();
    let k = open_with(items, json!({}));
    assert_eq!(shown_names(&k), vec!["보고서.docx", "사진.png"]);
    assert_eq!(k.fence(0).items.len(), 5, "hidden files were dropped from the box");
}

#[test]
fn box_setting_shows_hidden_files_and_defaults_turn_it_off() {
    let dir = room();
    let items = ["a.txt", "~$a.txt", "secret.txt"].iter().map(|n| real_item(&dir, n)).collect();
    let k = open_with(items, json!({}));
    k.h().change_box("a", &json!({ "showHidden": true }));
    assert!(k.fence(0).show_hidden);
    assert_eq!(shown_names(&k), vec!["a.txt", "~$a.txt", "secret.txt"]);
    k.h().change_box("a", &json!({ "showHidden": false }));
    assert_eq!(shown_names(&k), vec!["a.txt"]);
    k.h().change_box("a", &json!({ "showHidden": true }));
    k.h().reset_box("a");
    assert!(!k.fence(0).show_hidden);
}

#[test]
fn dropping_between_icons_lands_next_to_the_visible_ones() {
    let dir = room();
    let items = ["one.txt", "~$one.txt", "two.txt"].iter().map(|n| real_item(&dir, n)).collect();
    let k = open_with(items, json!({}));
    let extra = real_item(&dir, "three.txt");
    k.h().drop_at("a", &[extra["path"].as_str().unwrap().to_string()], Some(1), None);
    let names: Vec<String> = k.fence(0).items.iter().map(|i| basename(&i.path)).collect();
    assert_eq!(names, vec!["one.txt", "~$one.txt", "three.txt", "two.txt"]);
}

#[test]
fn shown_hidden_files_are_marked_dimmed() {
    let dir = room();
    let items = ["e.txt", "~$e.txt", "secret-e.txt"].iter().map(|n| real_item(&dir, n)).collect();
    let k = open_with(items, json!({ "showHidden": true }));
    k.h().push("a");
    let sent = k.fence_win(0).messages("fence:state").last().unwrap().clone();
    let marks: Vec<(String, bool)> = sent["items"].as_array().unwrap().iter().map(|i| (i["name"].as_str().unwrap().to_string(), i["concealed"].as_bool().unwrap())).collect();
    assert_eq!(marks, vec![("e.txt".into(), false), ("~$e.txt".into(), true), ("secret-e.txt".into(), true)]);
}

#[test]
fn app_settings_show_hidden_files_in_every_box_and_new_boxes() {
    let dir = room();
    let items: Vec<_> = ["d.txt", "~$d.txt"].iter().map(|n| real_item(&dir, n)).collect();
    let k = kit(base_state(json!({ "fences": [{ "items": items }, { "id": "b", "x": 600 }] })));
    k.open_ready();
    assert_eq!(shown_names(&k), vec!["d.txt"]);
    k.h().change_prefs(&json!({ "showHidden": true }));
    assert!(k.state().settings.show_hidden);
    assert!(k.state().fences.iter().all(|f| f.show_hidden));
    assert_eq!(shown_names(&k), vec!["d.txt", "~$d.txt"]);
    let id = k.h().finish_draw(10.0, 500.0, 300.0, 240.0).unwrap();
    assert!(k.h().fence(&id).unwrap().show_hidden);
    k.h().change_prefs(&json!({ "showHidden": false }));
    assert!(k.state().fences.iter().all(|f| !f.show_hidden));
}
