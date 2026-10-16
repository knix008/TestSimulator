// Electron 판 test/fences.test.js 를 옮긴 것. 가짜 창과 가짜 바탕화면으로 박스 로직만 본다.
// 파일은 운영체제 임시 폴더에 만든 진짜 파일이다. 사용자 바탕화면은 건드리지 않는다.

use serde_json::json;
use std::fs;
use std::path::Path;

use super::testkit::*;
use super::*;
use crate::desktop::DeskGrid;
use crate::pathx::{basename, dirname, join};

fn grid(x0: f64, y0: f64, dx: f64, dy: f64) -> Option<DeskGrid> {
    Some(DeskGrid { x0, y0, dx, dy })
}

fn open_one(extra: serde_json::Value) -> Kit {
    let k = kit(base_state(json!({ "fences": [extra] })));
    k.open_ready();
    k
}

#[test]
fn drawing_a_box_while_hidden_makes_boxes_visible_again() {
    let k = kit(base_state(json!({ "hidden": true, "fences": [{}] })));
    k.open_ready();
    assert_eq!(k.ui.fences().len(), 1);
    assert!(k.ui.fences().iter().all(|w| !w.visible), "boxes must not be visible while hidden");
    k.h().finish_draw(10.0, 10.0, 300.0, 240.0);
    k.ready_all();
    assert!(!k.state().hidden, "drawing a box must unhide");
    assert_eq!(k.state().fences.len(), 2);
    let shown = k.ui.fences();
    assert_eq!(shown.len(), 2, "a new box window must be created");
    assert!(shown.iter().all(|w| w.visible), "existing boxes must become visible too");
}

#[test]
fn drawing_too_small_creates_no_box() {
    let k = kit(base_state(json!({ "hidden": true })));
    assert_eq!(k.h().finish_draw(0.0, 0.0, 20.0, 20.0), None);
    assert!(k.state().fences.is_empty());
    assert!(k.state().hidden);
}

#[test]
fn hiding_removes_windows_and_showing_brings_them_back() {
    let k = open_one(json!({}));
    assert!(k.fence_win(0).visible);
    k.h().toggle_hidden();
    assert!(!k.fence_win(0).visible);
    k.h().toggle_hidden();
    assert!(k.fence_win(0).visible);
    let before = k.fence_win(0).sent.len();
    k.h().set_hidden(false);
    assert_eq!(k.fence_win(0).sent.len(), before, "setting hidden to its current value does nothing");
}

#[test]
fn notifies_the_tray_when_hidden_state_changes() {
    let k = open_one(json!({}));
    let base = k.ui.st().announced;
    k.h().toggle_hidden();
    assert_eq!(k.ui.st().announced, base + 1);
    k.h().toggle_hidden();
    assert_eq!(k.ui.st().announced, base + 2);
}

#[test]
fn adding_a_file_to_a_box_moves_it_into_the_box_folder() {
    let sand = room();
    let one = real_item(&sand, "into-a.lnk");
    let from = one["path"].as_str().unwrap().to_string();
    let k = kit(base_state(json!({ "fences": [{ "title": "일감", "items": [one] }] })));
    k.open_all();
    k.refresh();
    let f = k.fence(0);
    assert!(!Path::new(&from).exists(), "file was added but is still at its original location");
    assert_eq!(f.items.len(), 1);
    assert_eq!(dirname(&f.items[0].path), join(&k.root(), &f.folder));
    assert!(Path::new(&f.items[0].path).exists());
    assert_eq!(f.items[0].home.as_deref(), Some(dirname(&from).as_str()));
}

#[test]
fn box_folder_name_comes_from_the_title_without_invalid_characters() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "title": "보고서 모음", "items": [real_item(&sand, "doc-a.txt")] }] })));
    k.open_all();
    k.refresh();
    assert_eq!(k.fence(0).folder, "보고서 모음");
    let k = kit(base_state(json!({ "fences": [{ "title": "a/b:c*d", "items": [real_item(&sand, "odd-a.txt")] }] })));
    k.open_all();
    k.refresh();
    let folder = k.fence(0).folder;
    assert!(!folder.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']));
    assert!(Path::new(&join(&k.root(), &folder)).exists());
}

#[test]
fn deleting_a_contained_file_in_explorer_removes_it_from_the_box() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&sand, "gone-a.lnk")] }] })));
    k.open_all();
    k.refresh();
    fs::remove_file(&k.fence(0).items[0].path).unwrap();
    k.refresh();
    assert!(k.fence(0).items.is_empty());
}

#[test]
fn files_put_into_the_box_folder_via_explorer_appear_in_the_box() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "title": "일감", "items": [real_item(&sand, "seed-a.txt")] }] })));
    k.open_all();
    k.refresh();
    let dir = join(&k.root(), &k.fence(0).folder);
    fs::write(join(&dir, "바깥에서.txt"), "").unwrap();
    k.refresh();
    let mut names: Vec<String> = k.fence(0).items.iter().map(|i| i.name.clone()).collect();
    names.sort();
    assert_eq!(names, vec!["seed-a.txt", "바깥에서.txt"]);
}

#[test]
fn renaming_a_box_keeps_its_folder_and_files() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "title": "처음", "items": [real_item(&sand, "rename-a.lnk")] }] })));
    k.open_all();
    k.refresh();
    let (folder, kept) = (k.fence(0).folder, k.fence(0).items[0].path.clone());
    k.h().rename("a", "나중");
    assert_eq!(k.fence(0).title, "나중");
    assert_eq!(k.fence(0).folder, folder);
    assert_eq!(k.fence(0).items[0].path, kept);
    assert!(Path::new(&kept).exists());
}

#[test]
fn hiding_boxes_leaves_contained_files_in_their_folder() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&sand, "hide-a.lnk")] }] })));
    k.open_all();
    k.refresh();
    let kept = k.fence(0).items[0].path.clone();
    k.h().toggle_hidden();
    assert!(Path::new(&kept).exists());
    k.h().toggle_hidden();
    assert_eq!(k.fence(0).items[0].path, kept);
}

#[test]
fn a_dragged_rectangle_becomes_a_box_only_after_confirming() {
    let k = kit(base_state(json!({})));
    k.answer(false);
    assert_eq!(k.run(offer_fence(&k.sh, 10.0, 10.0, 300.0, 240.0)), None);
    assert!(k.state().fences.is_empty());
    k.answer(true);
    assert!(k.run(offer_fence(&k.sh, 10.0, 10.0, 300.0, 240.0)).is_some());
    assert_eq!(k.state().fences.len(), 1);
    assert_eq!((k.fence(0).x, k.fence(0).y), (10.0, 10.0));
    // 너무 작으면 묻지도 않는다.
    let asked = k.ui.st().asks.len();
    assert_eq!(k.run(offer_fence(&k.sh, 0.0, 0.0, 40.0, 30.0)), None);
    assert_eq!(k.ui.st().asks.len(), asked);
}

#[test]
fn drag_creating_a_box_while_hidden_unhides() {
    let k = kit(base_state(json!({ "hidden": true, "fences": [{}] })));
    k.open_ready();
    k.answer(true);
    k.run(offer_fence(&k.sh, 10.0, 10.0, 300.0, 240.0));
    assert!(!k.state().hidden);
}

#[test]
fn adding_the_recycle_bin_hides_it_on_the_desktop() {
    let k = kit(base_state(json!({ "fences": [{ "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }] }] })));
    k.open_all();
    k.refresh();
    assert_eq!(k.desk.calls().shell.last().unwrap(), &vec!["shell:RecycleBinFolder".to_string()]);
    assert_eq!(k.fence(0).items[0].path, "shell:RecycleBinFolder");
    // 숨기면 바탕화면에 되살린다.
    k.h().toggle_hidden();
    assert!(k.desk.calls().shell.last().unwrap().is_empty());
}

#[test]
fn shell_items_not_in_a_box_stay_on_the_desktop() {
    let k = kit(base_state(json!({ "fences": [{}] })));
    k.open_all();
    k.refresh();
    assert!(k.desk.calls().shell.last().unwrap().is_empty());
}

#[test]
fn ejecting_the_recycle_bin_restores_it_on_the_desktop() {
    let k = kit(base_state(json!({ "fences": [{ "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }] }] })));
    k.open_all();
    k.refresh();
    k.h().eject("a", "shell:RecycleBinFolder", None);
    assert!(k.fence(0).items.is_empty());
    assert!(k.desk.calls().shell.last().unwrap().is_empty());
}

#[test]
fn ejecting_a_file_returns_it_to_its_original_folder() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "title": "일감", "items": [real_item(&sand, "out-a.lnk")] }] })));
    k.open_all();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    assert_ne!(dirname(&held), sand);
    k.h().eject("a", &held, None);
    assert!(k.fence(0).items.is_empty());
    assert!(!Path::new(&held).exists());
    assert!(Path::new(&join(&sand, "out-a.lnk")).exists());
    assert_eq!(k.desk.calls().homed.last().unwrap(), &vec!["out-a.lnk".to_string()]);
}

#[test]
fn a_file_that_cannot_be_moved_is_not_added_and_the_user_is_told() {
    let sand = room();
    let one = real_item(&sand, "busy-a.txt");
    let blocked = join(&sand, "busy-root");
    fs::write(&blocked, "폴더가 아니다").unwrap();
    let k = kit(base_state(json!({ "settings": { "root": blocked }, "fences": [{ "title": "일감" }] })));
    k.open_all();
    let path = one["path"].as_str().unwrap().to_string();
    k.h().drop_files("a", &[Incoming::path(path.clone())], Some(0), None);
    k.settle();
    assert!(k.fence(0).items.is_empty());
    assert!(Path::new(&path).exists());
    let asks = k.ui.st().asks.clone();
    assert_eq!(asks.len(), 1);
    assert!(asks[0].title.contains("busy-a.txt"));
    assert!(asks[0].detail.contains("다른 프로그램"));
}

#[test]
fn ejected_items_have_the_hidden_attribute_cleared() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "title": "일감", "items": [real_item(&sand, "reveal-a.lnk")] }] })));
    k.open_all();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    k.desk.st().concealed.insert(held.clone());
    k.h().eject("a", &held, None);
    assert!(k.desk.calls().revealed.contains(&held));
    assert!(k.fence(0).items.is_empty());
}

#[test]
fn deleting_a_box_returns_all_files_and_removes_its_folder() {
    let sand = room();
    let items = vec![real_item(&sand, "del-a.txt"), real_item(&sand, "del-b.txt")];
    let k = kit(base_state(json!({ "fences": [{ "title": "지울 것", "items": items }] })));
    k.open_all();
    k.refresh();
    let folder = join(&k.root(), &k.fence(0).folder);
    assert_eq!(fs::read_dir(&folder).unwrap().count(), 2);
    k.answer(true);
    k.run(remove_fence(&k.sh, "a"));
    assert!(k.state().fences.is_empty());
    for name in ["del-a.txt", "del-b.txt"] {
        assert!(Path::new(&join(&sand, name)).exists(), "{name} was not returned");
    }
    assert!(!Path::new(&folder).exists());
}

#[test]
fn cancelling_box_deletion_leaves_files_in_place() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&sand, "keep-a.txt")] }] })));
    k.open_all();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    k.answer(false);
    k.run(remove_fence(&k.sh, "a"));
    assert_eq!(k.state().fences.len(), 1);
    assert!(Path::new(&held).exists());
}

#[test]
fn returning_all_keeps_boxes_and_sends_only_files_to_the_desktop() {
    let sand = room();
    let (a, b) = (real_item(&sand, "back-a.txt"), real_item(&sand, "back-b.txt"));
    let k = kit(base_state(json!({ "fences": [{ "items": [a] }, { "id": "b", "x": 600, "items": [b] }] })));
    k.open_all();
    k.refresh();
    assert_eq!(k.h().return_all(), 2);
    assert_eq!(k.state().fences.len(), 2);
    assert!(k.state().fences.iter().all(|f| f.items.is_empty()));
    assert!(Path::new(&join(&sand, "back-a.txt")).exists() && Path::new(&join(&sand, "back-b.txt")).exists());
}

#[test]
fn pushes_desktop_icons_out_from_under_a_box() {
    let k = open_one(json!({ "x": 100, "y": 100, "w": 400, "h": 300 }));
    k.refresh();
    let walls = k.desk.calls().nudged.last().unwrap().clone();
    assert_eq!(walls.len(), 1);
    assert_eq!((walls[0].x, walls[0].y), (100.0, 100.0));
    k.h().toggle_hidden();
    assert!(k.desk.calls().release.last().unwrap().is_empty(), "icons were not released on hide");
}

#[test]
fn a_box_drawn_near_grid_lines_snaps_to_them() {
    let k = kit(base_state(json!({})));
    k.desk.use_grid(grid(20.0, 30.0, 80.0, 100.0));
    let id = k.h().finish_draw(105.0, 135.0, 316.0, 292.0).unwrap();
    let f = k.h().fence(&id).unwrap().clone();
    assert_eq!((f.x, f.y), (100.0, 130.0));
    assert_eq!((f.w, f.h), (320.0, 300.0));
    let id = k.h().finish_draw(1140.0, 580.0, 360.0, 340.0).unwrap();
    let f = k.h().fence(&id).unwrap().clone();
    assert_eq!((f.x, f.y, f.w, f.h), (1140.0, 580.0, 360.0, 340.0), "between grid lines keeps the drawn bounds");
}

#[test]
fn uses_the_drawn_bounds_when_the_grid_cannot_be_measured() {
    let k = kit(base_state(json!({})));
    let id = k.h().finish_draw(105.0, 135.0, 300.0, 240.0).unwrap();
    let f = k.h().fence(&id).unwrap().clone();
    assert_eq!((f.x, f.y), (105.0, 135.0));
}

#[test]
fn moving_between_boxes_also_changes_the_folder() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "id": "a", "title": "첫 박스", "items": [real_item(&sand, "move-a.txt")] }, { "id": "b", "title": "둘째 박스", "x": 700 }] })));
    k.open_ready();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    let target = k.fence_win(1).bounds;
    k.h().transfer("a", &held, target.x + 30.0, target.y + 60.0, &[]);
    assert!(k.fence(0).items.is_empty());
    assert_eq!(k.fence(1).items.len(), 1);
    let moved = k.fence(1).items[0].clone();
    assert_eq!(dirname(&moved.path), join(&k.root(), &k.fence(1).folder));
    assert!(Path::new(&moved.path).exists());
    assert!(!Path::new(&held).exists());
    k.h().eject("b", &moved.path, None);
    assert!(Path::new(&join(&sand, "move-a.txt")).exists(), "did not return to its original location");
}

#[test]
fn dropping_outside_any_box_returns_the_file_to_the_desktop() {
    let sand = room();
    let k = open_one(json!({ "items": [real_item(&sand, "outside-a.txt")] }));
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    k.h().transfer("a", &held, 1800.0, 1000.0, &[]);
    assert!(k.fence(0).items.is_empty());
    assert!(Path::new(&join(&sand, "outside-a.txt")).exists());
}

#[test]
fn dragging_onto_the_desktop_ejects_at_the_drop_point() {
    let sand = room();
    let k = open_one(json!({ "items": [real_item(&sand, "deskdrop-a.txt"), real_item(&sand, "deskdrop-b.lnk")] }));
    k.refresh();
    let first = k.fence(0).items[0].path.clone();
    k.h().transfer("a", &first, 1200.0, 360.0, &[]);
    let second = k.fence(0).items[0].path.clone();
    k.h().transfer("a", &second, 1400.0, 240.0, &[]);
    assert!(k.fence(0).items.is_empty());
    assert!(Path::new(&join(&sand, "deskdrop-a.txt")).exists());
    assert!(Path::new(&join(&sand, "deskdrop-b.lnk")).exists());
    let points: Vec<_> = k.desk.calls().placed_at.iter().map(|(_, p)| (p.x, p.y)).collect();
    assert_eq!(points, vec![(1200.0, 360.0), (1400.0, 240.0)]);
}

#[test]
fn dragging_the_recycle_bin_onto_the_desktop_removes_it_from_the_box() {
    let k = open_one(json!({ "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }] }));
    k.h().transfer("a", "shell:RecycleBinFolder", 1400.0, 220.0, &[]);
    assert!(k.fence(0).items.is_empty());
    let last = k.desk.calls().placed_at.last().unwrap().clone();
    assert_eq!(last.0, "휴지통");
    assert_eq!((last.1.x, last.1.y), (1400.0, 220.0));
}

#[test]
fn dragging_in_from_the_desktop_shows_the_slot_without_a_ghost() {
    let sand = room();
    let one = real_item(&sand, "incoming-a.txt");
    let k = kit(base_state(json!({ "fences": [{ "id": "a" }, { "id": "b", "x": 700 }] })));
    k.open_ready();
    let w = k.fence_win(1).bounds;
    let path = one["path"].as_str().unwrap();
    k.h().hover_incoming(path, w.x + 40.0, w.y + 80.0);
    let ghost = k.ui.pages("ghost.html")[0].clone();
    assert!(!ghost.visible, "our image was overlaid on a desktop drag");
    let hover = k.fence_win(1).messages("fence:hover").last().unwrap().clone();
    assert_eq!(hover["filePath"], json!(path));
    k.h().hover_incoming("", 0.0, 0.0);
    assert!(k.fence_win(1).messages("fence:hover").last().unwrap().is_null());
}

#[test]
fn dragging_from_the_desktop_into_a_box_adds_the_files() {
    let sand = room();
    let many: Vec<_> = ["indrop-1.txt", "indrop-2.txt", "indrop-3.txt"].iter().map(|n| real_item(&sand, n)).collect();
    let k = open_one(json!({ "title": "받는 박스" }));
    let b = k.fence_win(0).bounds;
    let entries: Vec<Incoming> = many.iter().map(|m| Incoming::named(m["name"].as_str().unwrap(), m["path"].as_str().unwrap())).collect();
    k.h().accept_desktop_drop(entries, crate::geom::Point::new(b.x + 20.0, b.y + 50.0));
    assert_eq!(k.fence(0).items.len(), 3, "not all selected items were added");
    for m in &many {
        assert!(!Path::new(m["path"].as_str().unwrap()).exists());
    }
    assert_eq!(dirname(&k.fence(0).items[0].path), join(&k.root(), &k.fence(0).folder));
}

#[test]
fn reports_which_box_is_under_the_cursor_while_dragging() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "id": "a", "items": [real_item(&sand, "drag-a.txt")] }, { "id": "b", "x": 700 }] })));
    k.open_ready();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    let w = k.fence_win(1).bounds;
    k.h().hover(&held, w.x + 40.0, w.y + 50.0, "data:image/png;base64,끌기", false);
    let to_second = k.fence_win(1).messages("fence:hover").last().unwrap().clone();
    assert_eq!(to_second["filePath"], json!(held));
    assert!(k.fence_win(0).messages("fence:hover").last().unwrap().is_null());
    k.h().hover(&held, 1800.0, 1000.0, "data:image/png;base64,끌기", false);
    let ghost = k.ui.pages("ghost.html")[0].clone();
    assert!(ghost.visible, "icon vanished outside the boxes");
    k.h().clear_hover();
    assert!(!k.ui.pages("ghost.html")[0].visible);
    for at in 0..2 {
        assert!(k.fence_win(at).messages("fence:hover").last().unwrap().is_null());
    }
}

fn drag_hook(k: &Kit, hook: impl Fn(&[String]) + Send + Sync + 'static) {
    k.ui.st().drag_hook = Some(Box::new(hook));
}

#[test]
fn files_and_shortcuts_can_be_dragged_out_to_other_programs() {
    let sand = room();
    let k = open_one(json!({ "items": [real_item(&sand, "hand-a.txt"), real_item(&sand, "hand-b.lnk")] }));
    k.refresh();
    let label = k.fence_win(0).spec.label.clone();
    let items = k.fence(0).items.clone();
    for item in &items {
        assert!(k.run(drag_out(&k.sh, &label, &[item.path.clone()])));
    }
    let dragged = k.ui.st().dragged.clone();
    let firsts: Vec<String> = dragged.iter().map(|(files, _)| files[0].clone()).collect();
    assert_eq!(firsts, items.iter().map(|i| crate::pathx::resolve(&i.path)).collect::<Vec<_>>());
    assert!(dragged.iter().all(|(_, icon)| *icon), "drag image is missing");
    assert_eq!(k.fence(0).items.len(), 2, "a file that was only copied was removed from the box");
}

#[test]
fn dragging_a_multi_selection_hands_off_all_at_once() {
    let sand = room();
    let many: Vec<_> = ["hand-many-1.txt", "hand-many-2.txt", "hand-many-3.txt"].iter().map(|n| real_item(&sand, n)).collect();
    let k = open_one(json!({ "items": many }));
    k.refresh();
    let held: Vec<String> = k.fence(0).items.iter().map(|i| i.path.clone()).collect();
    drag_hook(&k, |files| {
        for f in files {
            let _ = fs::remove_file(f);
        }
    });
    let label = k.fence_win(0).spec.label.clone();
    let order = vec![held[1].clone(), held[0].clone(), held[2].clone(), "shell:RecycleBinFolder".into()];
    assert!(k.run(drag_out(&k.sh, &label, &order)));
    let dragged = k.ui.st().dragged.clone();
    assert_eq!(dragged.len(), 1, "not handed off in a single drag");
    assert_eq!(dragged[0].0, [&held[1], &held[0], &held[2]].iter().map(|p| crate::pathx::resolve(p)).collect::<Vec<_>>());
    assert!(k.fence(0).items.is_empty(), "files taken out remained in the box");
}

#[test]
fn the_recycle_bin_cannot_be_dragged_out() {
    let k = open_one(json!({ "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }] }));
    let label = k.fence_win(0).spec.label.clone();
    assert!(!k.run(drag_out(&k.sh, &label, &["shell:RecycleBinFolder".into()])));
    assert!(k.ui.st().dragged.is_empty());
    assert_eq!(k.fence(0).items[0].path, "shell:RecycleBinFolder");
}

#[test]
fn dropping_on_the_desktop_removes_the_file_from_the_box() {
    let sand = room();
    let k = open_one(json!({ "items": [real_item(&sand, "out-desk.txt")] }));
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    k.desk.st().on_desk = Some(true);
    let label = k.fence_win(0).spec.label.clone();
    assert!(k.run(drag_out(&k.sh, &label, &[held.clone()])));
    assert!(k.fence(0).items.is_empty());
    assert!(!Path::new(&held).exists());
    assert!(Path::new(&join(&sand, "out-desk.txt")).exists());
}

#[test]
fn when_the_desktop_copies_the_file_the_box_copy_is_removed() {
    let sand = room();
    let desk_dir = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&sand, "out-copy.txt")] }] })));
    k.desk.use_desktop(&[&desk_dir]);
    k.open_ready();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    k.desk.st().on_desk = Some(true);
    let to = desk_dir.clone();
    drag_hook(&k, move |files| {
        fs::copy(&files[0], join(&to, &basename(&files[0]))).unwrap();
    });
    let label = k.fence_win(0).spec.label.clone();
    assert!(k.run(drag_out(&k.sh, &label, &[held.clone()])));
    assert!(k.fence(0).items.is_empty());
    assert!(!Path::new(&held).exists());
    assert!(Path::new(&join(&desk_dir, "out-copy.txt")).exists());
    assert!(!Path::new(&join(&sand, "out-copy.txt")).exists(), "the same file ended up duplicated");
}

#[test]
fn ejecting_a_shortcut_moves_only_the_shortcut() {
    let sand = room();
    let k = open_one(json!({ "items": [real_item(&sand, "aim-stay.txt"), real_item(&sand, "aim-stay.lnk")] }));
    k.refresh();
    let items = k.fence(0).items.clone();
    let link = items.iter().find(|i| i.name == "aim-stay.lnk").unwrap().clone();
    let file = items.iter().find(|i| i.name == "aim-stay.txt").unwrap().clone();
    k.desk.link(&link.path, &file.path);
    k.h().eject("a", &link.path, None);
    assert!(k.ui.st().asks.is_empty());
    assert_eq!(k.fence(0).items.len(), 1);
    assert_eq!(k.fence(0).items[0].path, file.path);
    assert!(Path::new(&join(&sand, "aim-stay.lnk")).exists());
    assert!(Path::new(&file.path).exists());
}

#[test]
fn if_only_a_shortcut_is_created_the_item_itself_is_moved_out() {
    let sand = room();
    let desk_dir = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&sand, "linked-item.txt")] }] })));
    k.desk.use_desktop(&[&desk_dir]);
    k.desk.st().on_desk = Some(false);
    k.open_ready();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    let lnk = join(&desk_dir, "linked-item.txt.lnk");
    let desk = k.desk.clone();
    let lnk2 = lnk.clone();
    drag_hook(&k, move |files| {
        fs::write(&lnk2, "").unwrap();
        desk.link(&lnk2, &files[0]);
    });
    let label = k.fence_win(0).spec.label.clone();
    assert!(k.run(drag_out(&k.sh, &label, &[held.clone()])));
    assert!(k.ui.st().asks.is_empty());
    assert!(k.fence(0).items.is_empty());
    assert!(!Path::new(&held).exists());
    assert!(Path::new(&join(&sand, "linked-item.txt")).exists());
    assert!(!Path::new(&lnk).exists(), "a bare shortcut was left on the desktop");
}

#[test]
fn when_another_program_takes_the_file_it_is_removed_from_the_box() {
    let sand = room();
    let k = open_one(json!({ "items": [real_item(&sand, "taken-a.txt")] }));
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    drag_hook(&k, |files| {
        fs::remove_file(&files[0]).unwrap();
    });
    let label = k.fence_win(0).spec.label.clone();
    assert!(k.run(drag_out(&k.sh, &label, &[held.clone()])));
    assert!(k.fence(0).items.is_empty());
}

#[test]
fn asks_the_desktop_layer_whether_the_cursor_is_over_another_program() {
    let k = open_one(json!({}));
    assert!(!k.h().over_foreign(3.0, 4.0));
    k.desk.st().foreign = Some(true);
    assert!(k.h().over_foreign(9.0, 8.0));
    assert!(!k.ui.handles().is_empty());
}

#[test]
fn repeatedly_applying_the_same_bounds_does_not_make_the_box_drift() {
    let k = kit(base_state(json!({ "fences": [{ "x": 300, "y": 200, "w": 320, "h": 300 }] })));
    k.desk.use_grid(grid(20.0, 30.0, 80.0, 100.0));
    k.open_ready();
    let f = k.fence(0);
    k.h().apply_bounds("a", f.x, f.y, f.w, f.h, true);
    let settled = k.fence(0);
    for _ in 0..6 {
        let f = k.fence(0);
        k.h().apply_bounds("a", f.x, f.y, f.w, f.h, true);
    }
    let f = k.fence(0);
    assert_eq!((f.x, f.y, f.w, f.h), (settled.x, settled.y, settled.w, settled.h));
}

fn overlap(a: &Fence, b: &Fence) -> bool {
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

#[test]
fn dropping_onto_another_box_shifts_it_aside() {
    let k = kit(base_state(json!({ "fences": [{ "id": "a", "x": 500, "y": 300, "w": 400, "h": 400 }, { "id": "b", "x": 1200, "y": 300, "w": 300, "h": 300 }] })));
    k.desk.use_grid(grid(0.0, 0.0, 80.0, 100.0));
    k.open_ready();
    k.h().apply_bounds("b", 600.0, 350.0, 300.0, 300.0, true);
    assert!(!overlap(&k.fence(0), &k.fence(1)));
}

#[test]
fn startup_does_not_move_boxes_even_when_they_overlap() {
    let k = kit(base_state(json!({ "fences": [{ "x": 613, "y": 297, "w": 321, "h": 243 }] })));
    k.desk.use_grid(grid(14.0, 2.0, 76.0, 98.0));
    k.open_ready();
    let f = k.fence(0);
    assert_eq!((f.x, f.y, f.w, f.h), (613.0, 297.0, 321.0, 243.0));
    let k = kit(base_state(json!({ "fences": [{ "id": "a", "x": 100, "y": 100, "w": 400, "h": 400 }, { "id": "b", "x": 200, "y": 200, "w": 400, "h": 400 }] })));
    k.desk.use_grid(grid(14.0, 2.0, 76.0, 98.0));
    k.open_ready();
    assert_eq!((k.fence(1).x, k.fence(1).y), (200.0, 200.0));
}

#[test]
fn pushing_icons_away_does_not_shift_the_box() {
    let k = kit(base_state(json!({ "fences": [{ "x": 300, "y": 200, "w": 320, "h": 300 }] })));
    k.desk.use_grid(grid(20.0, 30.0, 80.0, 100.0));
    k.open_ready();
    let f = k.fence(0);
    k.h().apply_bounds("a", f.x, f.y, f.w, f.h, true);
    let settled = k.fence(0);
    k.desk.use_grid(grid(100.0, 130.0, 80.0, 100.0));
    let f = k.fence(0);
    k.h().apply_bounds("a", f.x, f.y, f.w, f.h, true);
    let f = k.fence(0);
    assert_eq!((f.x, f.y, f.w, f.h), (settled.x, settled.y, settled.w, settled.h));
}

#[test]
fn resizing_only_keeps_the_box_position() {
    let k = kit(base_state(json!({ "fences": [{ "x": 613, "y": 297, "w": 320, "h": 300 }] })));
    k.desk.use_grid(grid(14.0, 2.0, 76.0, 98.0));
    k.open_ready();
    let f = k.fence(0);
    k.h().apply_bounds("a", f.x, f.y, 420.0, 380.0, true);
    let g = k.fence(0);
    assert_eq!((g.x, g.y), (f.x, f.y));
    assert!(g.w >= 400.0 && g.h >= 360.0, "{}x{}", g.w, g.h);
}

#[test]
fn a_box_docked_to_the_screen_edge_does_not_bounce_back() {
    let k = kit(base_state(json!({ "fences": [{ "x": 600, "y": 300, "w": 320, "h": 300 }] })));
    k.desk.use_grid(grid(14.0, 2.0, 76.0, 98.0));
    k.open_ready();
    k.h().apply_bounds("a", 0.0, 0.0, 320.0, 300.0, true);
    assert_eq!((k.fence(0).x, k.fence(0).y), (0.0, 0.0));
}

#[test]
fn growing_a_box_into_a_neighbor_stops_at_the_neighbor() {
    let k = kit(base_state(json!({ "fences": [{ "id": "a", "x": 200, "y": 200, "w": 300, "h": 300 }, { "id": "b", "x": 700, "y": 200, "w": 300, "h": 300 }] })));
    k.desk.use_grid(grid(14.0, 2.0, 76.0, 98.0));
    k.open_ready();
    let a = k.fence(0);
    k.h().apply_bounds("a", a.x, a.y, 700.0, a.h, true);
    let (na, b) = (k.fence(0), k.fence(1));
    assert_eq!((na.x, na.y), (a.x, a.y));
    assert!(!overlap(&na, &b));
    assert!(na.x + na.w <= b.x);
}

#[test]
fn a_dragged_box_stops_at_another_box_and_lands_where_shown() {
    let k = kit(base_state(json!({ "fences": [{ "id": "a", "x": 100, "y": 300, "w": 200, "h": 200 }, { "id": "b", "x": 500, "y": 300, "w": 300, "h": 300 }] })));
    k.desk.use_grid(grid(14.0, 2.0, 76.0, 98.0));
    k.open_ready();
    k.h().apply_bounds("a", 600.0, 300.0, 200.0, 200.0, false);
    let a = k.fence(0);
    assert_eq!(a.x, 300.0);
    assert!(!overlap(&a, &k.fence(1)));
    k.h().apply_bounds("a", 600.0, 300.0, 200.0, 200.0, true);
    let b = k.fence(0);
    assert!((b.x - a.x).abs() <= 2.0 && (b.y - a.y).abs() <= 2.0, "jumped on release");
}

#[test]
fn image_files_show_a_scaled_preview() {
    let sand = room();
    let png = join(&sand, "사진.png");
    fs::write(&png, crate::image::Picture::solid(200, 100, 0x7f).png()).unwrap();
    let k = kit(base_state(json!({})));
    let pic = k.h().picture_of(&png).unwrap();
    assert_eq!((pic.width, pic.height), (64, 32));
}

#[test]
fn renames_an_item_in_a_box_and_keeps_hidden_extensions() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "title": "일감", "items": [real_item(&sand, "바꿀 것.txt"), real_item(&sand, "바로가기.lnk")] }] })));
    k.open_all();
    k.refresh();
    let before = k.fence(0).items[0].path.clone();
    k.run(rename_item(&k.sh, "a", &before, "새 이름.txt"));
    let item = k.fence(0).items[0].clone();
    assert_eq!(item.name, "새 이름.txt");
    assert_eq!(item.path, join(&dirname(&before), "새 이름.txt"));
    assert!(!Path::new(&before).exists() && Path::new(&item.path).exists());
    let link = k.fence(0).items[1].path.clone();
    k.run(rename_item(&k.sh, "a", &link, "새 바로가기"));
    assert_eq!(k.fence(0).items[1].name, "새 바로가기.lnk");
}

#[test]
fn does_not_rename_shell_items_or_use_invalid_names() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&sand, "그대로.txt"), { "name": "휴지통", "path": "shell:RecycleBinFolder" }] }] })));
    k.open_all();
    k.refresh();
    let at = k.fence(0).items.iter().find(|i| i.name == "그대로.txt").unwrap().path.clone();
    k.run(rename_item(&k.sh, "a", &at, "a/b"));
    k.run(rename_item(&k.sh, "a", &at, "   "));
    assert!(Path::new(&at).exists());
    assert_eq!(k.fence(0).items.iter().find(|i| i.path == at).unwrap().name, "그대로.txt");
    k.run(rename_item(&k.sh, "a", "shell:RecycleBinFolder", "새 휴지통"));
    assert_eq!(k.fence(0).items.iter().find(|i| i.path == "shell:RecycleBinFolder").unwrap().name, "휴지통");
}

#[test]
fn asks_whether_to_replace_when_the_new_name_exists() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "items": [real_item(&sand, "먼저.txt"), real_item(&sand, "나중.txt")] }] })));
    k.open_all();
    k.refresh();
    let paths: Vec<String> = k.fence(0).items.iter().map(|i| i.path.clone()).collect();
    k.run(rename_item(&k.sh, "a", &paths[1], "먼저.txt"));
    assert_eq!(k.ui.st().asks.len(), 1);
    assert!(Path::new(&paths[1]).exists());
    assert_eq!(k.fence(0).items.len(), 2);
    k.answer(true);
    k.run(rename_item(&k.sh, "a", &paths[1], "먼저.txt"));
    assert_eq!(k.ui.st().trashed, vec![paths[0].clone()]);
    assert_eq!(k.fence(0).items.iter().map(|i| i.name.clone()).collect::<Vec<_>>(), vec!["먼저.txt"]);
}

#[test]
fn moving_into_a_box_never_asks_to_replace() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [{ "title": "일감" }] })));
    k.open_all();
    let mine = join(&sand, "clash-먼저");
    fs::create_dir_all(&mine).unwrap();
    let first = join(&mine, "보고서.txt");
    fs::write(&first, "먼저").unwrap();
    k.h().drop_files("a", &[Incoming::path(first)], Some(0), None);
    assert!(k.ui.st().asks.is_empty());
    let other = join(&sand, "clash-나중");
    fs::create_dir_all(&other).unwrap();
    let second = join(&other, "보고서.txt");
    fs::write(&second, "나중").unwrap();
    k.h().drop_files("a", &[Incoming::path(second.clone())], Some(0), None);
    k.settle();
    assert!(k.ui.st().asks.is_empty());
    assert!(k.ui.st().trashed.is_empty());
    assert!(!Path::new(&second).exists());
    let mut names: Vec<String> = k.fence(0).items.iter().map(|i| i.name.clone()).collect();
    names.sort();
    assert_eq!(names, vec!["보고서 (2).txt", "보고서.txt"]);
    let mut texts: Vec<String> = k.fence(0).items.iter().map(|i| fs::read_to_string(&i.path).unwrap()).collect();
    texts.sort();
    assert_eq!(texts, vec!["나중", "먼저"]);
}

#[test]
fn copy_paste_keeps_the_original_and_cut_paste_moves_it() {
    let desk = room();
    let source = join(&desk, "노트.txt");
    fs::write(&source, "남김").unwrap();
    let k = kit(base_state(json!({ "fences": [{ "title": "받는 박스" }] })));
    k.desk.use_desktop(&[&desk]);
    k.open_all();
    k.h().clip.write(&[source.clone()], crate::clipfiles::COPY);
    assert!(k.run(paste_files(&k.sh, "a")));
    assert_eq!(fs::read_to_string(&source).unwrap(), "남김");
    assert_eq!(k.fence(0).items.len(), 1);
    assert_eq!(fs::read_to_string(&k.fence(0).items[0].path).unwrap(), "남김");
    assert_ne!(dirname(&k.fence(0).items[0].path), dirname(&source));
    assert_eq!(k.h().clip.read().paths.len(), 1, "a copy stays on the clipboard");

    let cut = join(&desk, "옮길.txt");
    fs::write(&cut, "이동").unwrap();
    k.h().clip.write(&[cut.clone()], crate::clipfiles::MOVE);
    assert!(k.run(paste_files(&k.sh, "a")));
    assert!(!Path::new(&cut).exists());
    assert_eq!(k.fence(0).items.len(), 2);
    assert!(k.h().clip.read().paths.is_empty(), "still on the clipboard after cut-paste");
}

#[test]
fn copying_and_cutting_from_a_box() {
    let sand = room();
    let desk = room();
    let k = open_one(json!({ "items": [real_item(&sand, "copy-me.txt")] }));
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    assert!(k.h().copy_item("a", &[held.clone()]));
    let clip = k.h().clip.read();
    assert!(!clip.cut);
    assert_eq!(clip.paths, vec![held.clone()]);
    assert!(Path::new(&held).exists());
    assert!(k.h().cut_item("a", &[held.clone()]));
    assert!(k.h().clip.read().cut);
    fs::rename(&held, join(&desk, "copy-me.txt")).unwrap();
    k.refresh();
    assert!(k.fence(0).items.is_empty(), "moved to the desktop but stayed in the box");
}

#[test]
fn copies_a_multi_selection_and_moves_it_to_another_box() {
    let sand = room();
    let k = kit(base_state(json!({ "fences": [
        { "id": "a", "title": "첫 박스", "items": [real_item(&sand, "묶음-가.txt"), real_item(&sand, "묶음-나.txt")] },
        { "id": "b", "title": "둘째 박스", "x": 700 }
    ] })));
    k.open_ready();
    k.refresh();
    let paths: Vec<String> = k.fence(0).items.iter().map(|i| i.path.clone()).collect();
    assert!(k.h().copy_item("a", &paths));
    assert_eq!(k.h().clip.read().paths, paths);
    assert!(k.h().cut_item("a", &paths));
    let t = k.fence_win(1).bounds;
    k.h().transfer("a", &paths[0], t.x + 30.0, t.y + 60.0, &paths);
    assert!(k.fence(0).items.is_empty());
    assert_eq!(k.fence(1).items.len(), 2);
}

#[test]
fn deleting_a_multi_selection_asks_once() {
    let sand = room();
    let k = open_one(json!({ "items": [real_item(&sand, "지움-가.txt"), real_item(&sand, "지움-나.txt")] }));
    k.refresh();
    let paths: Vec<String> = k.fence(0).items.iter().map(|i| i.path.clone()).collect();
    k.answer(true);
    assert!(k.run(trash_items(&k.sh, "a", &paths)));
    let asks = k.ui.st().asks.clone();
    assert_eq!(asks.len(), 1);
    assert!(asks[0].title.contains("2개"));
    assert_eq!(k.ui.st().trashed, paths);
    assert!(k.fence(0).items.is_empty());
}

#[test]
fn the_recycle_bin_cannot_be_copied_and_empty_clipboard_is_not_pasted() {
    let sand = room();
    let k = open_one(json!({ "items": [{ "name": "휴지통", "path": "shell:RecycleBinFolder" }, real_item(&sand, "plain.txt")] }));
    k.refresh();
    let items = k.h().fence_menu("a", Some("shell:RecycleBinFolder"), &[]).unwrap();
    let find = |label: &str| items.iter().find(|i| i.label() == label).cloned().unwrap();
    for label in ["복사", "잘라내기"] {
        match find(label) {
            crate::ui::MenuItem::Action { enabled, .. } => assert!(!enabled, "{label}"),
            _ => panic!(),
        }
    }
    assert!(!k.h().copy_item("a", &["shell:RecycleBinFolder".into()]));
    assert!(!k.run(paste_files(&k.sh, "a")));
    let items = k.h().fence_menu("a", None, &[]).unwrap();
    match items.iter().find(|i| i.label() == "붙여넣기").unwrap() {
        crate::ui::MenuItem::Action { enabled, .. } => assert!(!enabled),
        _ => panic!(),
    }
}
