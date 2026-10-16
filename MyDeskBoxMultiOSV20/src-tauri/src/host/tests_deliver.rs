// Electron 판 test/deliver.test.js — 박스 안 항목 위에 놓았을 때 어디로 가는가.

use serde_json::json;
use std::fs;
use std::path::Path;

use super::testkit::*;
use super::*;
use crate::geom::{grid_of, slot_point};
use crate::js::round;
use crate::pathx::join;

const BOX: (f64, f64, f64, f64) = (100.0, 100.0, 400.0, 300.0);
const FAR: (f64, f64, f64, f64) = (700.0, 100.0, 400.0, 300.0);

// n 번째 칸 그림의 가운데 (화면 좌표). 끄는 항목은 목록에서 빠지므로 n 은 뺀 뒤의 차례다.
fn on_picture(index: usize, b: (f64, f64, f64, f64)) -> (f64, f64) {
    let spot = slot_point(index, &grid_of(b.2, b.3, false));
    // deliver.js PICTURE: left 15, right 71, top 2, bottom 54
    (b.0 + spot.x + round((15.0 + 71.0) / 2.0), b.1 + spot.y + round((2.0 + 54.0) / 2.0))
}

struct Place {
    root: String,
    folder: String,
    note: String,
    link: String,
}

fn desk() -> Place {
    let root = room();
    let folder = join(&root, "Work");
    fs::create_dir(&folder).unwrap();
    let note = join(&root, "노트.txt");
    fs::write(&note, "hello").unwrap();
    let link = join(&root, "Work.lnk");
    fs::write(&link, "link").unwrap();
    Place { root, folder, note, link }
}

fn item(name: &str, path: &str) -> serde_json::Value {
    json!({ "name": name, "path": path })
}

fn names(k: &Kit, at: usize) -> Vec<String> {
    k.fence(at).items.iter().map(|i| i.name.clone()).collect()
}

fn two_boxes(near: Vec<serde_json::Value>, far: Vec<serde_json::Value>) -> Kit {
    let k = kit(base_state(json!({ "fences": [
        { "id": "a", "x": BOX.0, "y": BOX.1, "w": BOX.2, "h": BOX.3, "items": near },
        { "id": "b", "x": FAR.0, "y": FAR.1, "w": FAR.2, "h": FAR.3, "items": far },
    ] })));
    k.open_all();
    k
}

#[test]
fn dropping_on_a_program_shortcut_moves_the_item_without_launching() {
    let p = desk();
    let app = join(&p.root, "Editor.lnk");
    fs::write(&app, "link").unwrap();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("Editor.lnk", &app), item("노트.txt", &p.note)] }] })));
    k.open_all();
    let link = k.fence(0).items.iter().find(|i| i.name == "Editor.lnk").unwrap().path.clone();
    let note = k.fence(0).items.iter().find(|i| i.name == "노트.txt").unwrap().path.clone();
    k.desk.link(&link, "C:/Program Files/Editor/edit.exe");
    let (x, y) = on_picture(0, BOX);
    k.h().transfer("a", &note, x, y, &[]);
    assert!(k.ui.st().opened.is_empty(), "launched a program during a move");
    assert!(Path::new(&note).exists());
    assert!(k.fence(0).items.iter().any(|i| i.path == note));
    assert_eq!(k.fence(0).items.len(), 2);
}

#[test]
fn reports_the_kind_of_each_held_item() {
    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [
        item("Work", &p.folder), item("Work.lnk", &p.link), item("노트.txt", &p.note), item("휴지통", "shell:RecycleBinFolder")
    ] }] })));
    k.open_ready();
    k.h().push("a");
    let state = k.fence_win(0).messages("fence:state").last().unwrap().clone();
    let shown = state["items"].as_array().unwrap();
    let by = |name: &str| shown.iter().find(|i| i["name"] == json!(name)).unwrap().clone();
    assert_eq!(by("Work")["shortcut"], json!(false));
    assert_eq!(by("Work")["folder"], json!(true));
    assert_eq!(by("Work.lnk")["shortcut"], json!(true));
    assert_eq!(by("노트.txt")["shortcut"], json!(false));
    assert_eq!(by("휴지통")["recycle"], json!(true));
    assert_eq!(by("노트.txt")["recycle"], json!(false));
    assert_eq!(by("Work")["receives"], json!(true));
    assert_eq!(by("휴지통")["receives"], json!(true));
    assert_eq!(by("노트.txt")["receives"], json!(false));
}

#[test]
fn dropping_a_folder_on_a_folder_moves_it_inside() {
    let p = desk();
    let bundle = join(&p.root, "묶음");
    fs::create_dir(&bundle).unwrap();
    fs::write(join(&bundle, "안.txt"), "in").unwrap();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("Work", &p.folder), item("묶음", &bundle)] }] })));
    k.h().drop_files("a", &[Incoming::path(bundle.clone())], Some(0), Some(&p.folder));
    assert_eq!(names(&k, 0), vec!["Work"]);
    let work = k.fence(0).items[0].path.clone();
    assert!(Path::new(&join(&join(&work, "묶음"), "안.txt")).exists());
    assert!(!Path::new(&bundle).exists());
}

#[test]
fn dropping_a_file_on_a_folder_moves_it_inside() {
    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("Work", &p.folder), item("노트.txt", &p.note)] }] })));
    k.h().drop_files("a", &[Incoming::path(p.note.clone())], Some(0), Some(&p.folder));
    assert_eq!(names(&k, 0), vec!["Work"]);
    let work = k.fence(0).items[0].path.clone();
    assert!(Path::new(&join(&work, "노트.txt")).exists());
    assert!(!Path::new(&p.note).exists());
}

#[test]
fn if_the_recycle_bin_refuses_the_file_stays() {
    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("휴지통", "shell:RecycleBinFolder"), item("노트.txt", &p.note)] }] })));
    k.ui.st().trash_fails = true;
    k.h().drop_files("a", &[Incoming::path(p.note.clone())], Some(0), Some("shell:RecycleBinFolder"));
    assert!(Path::new(&p.note).exists());
    assert!(k.fence(0).items.iter().any(|i| i.path == p.note));
}

#[test]
fn dropping_on_a_shortcut_to_a_folder_moves_the_file_into_that_folder() {
    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("Work.lnk", &p.link), item("노트.txt", &p.note)] }] })));
    k.open_all();
    let link = k.fence(0).items.iter().find(|i| i.name == "Work.lnk").unwrap().path.clone();
    let note = k.fence(0).items.iter().find(|i| i.name == "노트.txt").unwrap().path.clone();
    k.desk.link(&link, &p.folder);
    let (x, y) = on_picture(0, BOX);
    k.h().transfer("a", &note, x, y, &[]);
    assert!(Path::new(&join(&p.folder, "노트.txt")).exists());
    assert_eq!(names(&k, 0), vec!["Work.lnk"]);
}

#[test]
fn dropping_on_the_recycle_bin_discards_the_file() {
    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("휴지통", "shell:RecycleBinFolder"), item("노트.txt", &p.note)] }] })));
    k.h().drop_files("a", &[Incoming::path(p.note.clone())], Some(0), Some("shell:RecycleBinFolder"));
    assert_eq!(k.ui.st().trashed, vec![p.note.clone()]);
    assert_eq!(names(&k, 0), vec!["휴지통"]);
    assert!(!Path::new(&p.note).exists());
}

#[test]
fn a_name_clash_in_the_folder_keeps_the_file_in_the_box() {
    let p = desk();
    fs::write(join(&p.folder, "노트.txt"), "old").unwrap();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("노트.txt", &p.note), item("Work", &p.folder)] }] })));
    k.h().drop_files("a", &[Incoming::path(p.note.clone())], Some(0), Some(&p.folder));
    let work = k.fence(0).items.iter().find(|i| i.name == "Work").unwrap().path.clone();
    assert_eq!(fs::read_to_string(join(&work, "노트.txt")).unwrap(), "old");
    let note = k.fence(0).items.iter().find(|i| i.name == "노트.txt").unwrap().path.clone();
    assert!(Path::new(&note).exists());
}

#[test]
fn dropping_an_item_on_itself_leaves_it_alone() {
    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("노트.txt", &p.note)] }] })));
    k.open_all();
    let (x, y) = on_picture(0, BOX);
    let note = k.fence(0).items[0].path.clone();
    k.h().transfer("a", &note, x, y, &[]);
    assert!(k.ui.st().trashed.is_empty());
    assert_eq!(k.fence(0).items.len(), 1);
    assert!(Path::new(&k.fence(0).items[0].path).exists());
}

#[test]
fn programs_and_documents_do_not_accept_drops() {
    let p = desk();
    let tool = join(&p.root, "tool.exe");
    fs::write(&tool, "exe").unwrap();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("tool.exe", &tool), item("노트.txt", &p.note)] }] })));
    k.open_all();
    let note = k.fence(0).items.iter().find(|i| i.name == "노트.txt").unwrap().path.clone();
    let (x, y) = on_picture(0, BOX);
    k.h().transfer("a", &note, x, y, &[]);
    assert!(k.ui.st().opened.is_empty());
    assert!(Path::new(&note).exists());
    // 탐색기에서 프로그램 위에 놓아도 실행하지 않고 박스에 담는다.
    let other = join(&p.root, "또.txt");
    fs::write(&other, "").unwrap();
    let tool_now = k.fence(0).items.iter().find(|i| i.name == "tool.exe").unwrap().path.clone();
    k.h().drop_files("a", &[Incoming::path(other.clone())], Some(0), Some(&tool_now));
    assert!(k.fence(0).items.iter().any(|i| i.name == "또.txt"));
    assert!(!Path::new(&other).exists());
    assert!(k.ui.st().opened.is_empty());
}

#[test]
fn dropping_on_a_folder_or_bin_in_another_box() {
    let p = desk();
    let k = two_boxes(vec![item("노트.txt", &p.note)], vec![item("Work", &p.folder)]);
    let note = k.fence(0).items[0].path.clone();
    let work = k.fence(1).items[0].path.clone();
    let (x, y) = on_picture(0, FAR);
    k.h().transfer("a", &note, x, y, &[]);
    assert!(Path::new(&join(&work, "노트.txt")).exists());
    assert!(k.fence(0).items.is_empty());
    assert_eq!(names(&k, 1), vec!["Work"]);

    let p = desk();
    let k = two_boxes(vec![item("노트.txt", &p.note)], vec![item("휴지통", "shell:RecycleBinFolder")]);
    let note = k.fence(0).items[0].path.clone();
    k.h().transfer("a", &note, x, y, &[]);
    assert_eq!(k.ui.st().trashed, vec![note]);
    assert!(k.fence(0).items.is_empty());
    assert_eq!(names(&k, 1), vec!["휴지통"]);
}

#[test]
fn dragging_out_onto_the_recycle_bin_in_another_box_discards_it() {
    let p = desk();
    let k = two_boxes(vec![item("노트.txt", &p.note)], vec![item("휴지통", "shell:RecycleBinFolder")]);
    k.ready_all();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    let (x, y) = on_picture(0, FAR);
    k.ui.st().cursor = Some(crate::geom::Point::new(x, y));
    let label = k.fence_win(0).spec.label.clone();
    assert!(k.run(drag_out(&k.sh, &label, &[held.clone()])));
    assert_eq!(k.ui.st().trashed, vec![held]);
    assert!(k.fence(0).items.is_empty());
    assert_eq!(names(&k, 1), vec!["휴지통"]);
}

#[test]
fn sends_to_the_bin_as_a_separate_item_even_with_the_same_name() {
    let p = desk();
    let k = two_boxes(vec![item("노트.txt", &p.note)], vec![item("휴지통", "shell:RecycleBinFolder")]);
    k.desk.st().discard = true;
    k.ready_all();
    k.refresh();
    let held = k.fence(0).items[0].path.clone();
    let (x, y) = on_picture(0, FAR);
    k.ui.st().cursor = Some(crate::geom::Point::new(x, y));
    let label = k.fence_win(0).spec.label.clone();
    assert!(k.run(drag_out(&k.sh, &label, &[held.clone()])));
    assert!(k.ui.st().asks.is_empty());
    assert_eq!(k.desk.calls().discarded, vec![held]);
    assert!(k.ui.st().trashed.is_empty(), "took the path that replaces the existing item");
    assert!(k.fence(0).items.is_empty());
    assert!(k.fence(1).items.iter().any(|i| i.path == "shell:RecycleBinFolder"));
}

#[test]
fn empty_spots_and_cell_edges_insert_instead_of_dropping_in() {
    let p = desk();
    let k = two_boxes(vec![item("노트.txt", &p.note)], vec![item("Work", &p.folder)]);
    let note = k.fence(0).items[0].path.clone();
    let work = k.fence(1).items[0].path.clone();
    let (x, y) = on_picture(1, FAR);
    k.h().transfer("a", &note, x, y, &[]);
    assert!(!Path::new(&join(&work, "노트.txt")).exists());
    assert_eq!(names(&k, 1), vec!["Work", "노트.txt"]);

    let p = desk();
    let k = two_boxes(vec![item("노트.txt", &p.note)], vec![item("Work", &p.folder)]);
    let note = k.fence(0).items[0].path.clone();
    let work = k.fence(1).items[0].path.clone();
    let slot = slot_point(0, &grid_of(FAR.2, FAR.3, false));
    k.h().transfer("a", &note, FAR.0 + slot.x + 2.0, FAR.1 + slot.y + 28.0, &[]);
    assert!(!Path::new(&join(&work, "노트.txt")).exists(), "the folder accepted a drop on the edge");
    assert_eq!(k.fence(1).items.len(), 2);
}

#[test]
fn window_and_desktop_drops_on_the_bin_discard_as_separate_items() {
    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("휴지통", "shell:RecycleBinFolder")] }] })));
    k.desk.st().discard = true;
    k.open_all();
    k.h().drop_files("a", &[Incoming::path(p.note.clone())], Some(0), Some("shell:RecycleBinFolder"));
    assert!(k.ui.st().asks.is_empty());
    assert_eq!(k.desk.calls().discarded, vec![p.note.clone()]);
    assert!(k.ui.st().trashed.is_empty());
    assert!(!k.fence(0).items.iter().any(|i| i.name == "노트.txt"));

    let p = desk();
    let (x, y) = on_picture(0, BOX);
    k.h().accept_desktop_drop(vec![Incoming::named("노트.txt", p.note.clone())], crate::geom::Point::new(x, y));
    assert_eq!(k.desk.calls().discarded.len(), 2);
    assert!(k.fence(0).items.iter().any(|i| i.path == "shell:RecycleBinFolder"));
    assert!(!k.fence(0).items.iter().any(|i| i.name == "노트.txt"));
}

#[test]
fn desktop_drags_onto_the_bin_a_folder_or_an_empty_spot() {
    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("휴지통", "shell:RecycleBinFolder")] }] })));
    k.open_all();
    let (x, y) = on_picture(0, BOX);
    k.h().accept_desktop_drop(vec![Incoming::named("노트.txt", p.note.clone())], crate::geom::Point::new(x, y));
    assert_eq!(k.ui.st().trashed, vec![p.note.clone()]);
    assert_eq!(names(&k, 0), vec!["휴지통"]);

    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("Work", &p.folder)] }] })));
    k.open_all();
    let work = k.fence(0).items[0].path.clone();
    k.h().accept_desktop_drop(vec![Incoming::named("노트.txt", p.note.clone())], crate::geom::Point::new(x, y));
    assert!(Path::new(&join(&work, "노트.txt")).exists());
    assert_eq!(names(&k, 0), vec!["Work"]);

    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("Work", &p.folder)] }] })));
    k.open_all();
    let work = k.fence(0).items[0].path.clone();
    let (x1, y1) = on_picture(1, BOX);
    k.h().accept_desktop_drop(vec![Incoming::named("노트.txt", p.note.clone())], crate::geom::Point::new(x1, y1));
    assert!(!Path::new(&join(&work, "노트.txt")).exists());
    assert_eq!(names(&k, 0), vec!["Work", "노트.txt"]);
}

#[test]
fn hover_reports_only_real_receivers() {
    let p = desk();
    let k = two_boxes(vec![item("노트.txt", &p.note)], vec![item("Work", &p.folder)]);
    let note = k.fence(0).items[0].path.clone();
    let work = k.fence(1).items[0].path.clone();
    let (x, y) = on_picture(0, FAR);
    k.h().hover(&note, x, y, "", false);
    assert_eq!(k.fence_win(1).messages("fence:hover").last().unwrap()["into"], json!(work));
    let (x1, y1) = on_picture(1, FAR);
    k.h().hover(&note, x1, y1, "", false);
    assert!(k.fence_win(1).messages("fence:hover").last().unwrap()["into"].is_null());

    let p = desk();
    let other = join(&p.root, "보고서.txt");
    fs::write(&other, "문서").unwrap();
    let k = two_boxes(vec![item("노트.txt", &p.note)], vec![item("보고서.txt", &other)]);
    let note = k.fence(0).items[0].path.clone();
    k.h().hover(&note, x, y, "", false);
    assert!(k.fence_win(1).messages("fence:hover").last().unwrap()["into"].is_null(), "reported a document as a receiver");

    let p = desk();
    let k = kit(base_state(json!({ "fences": [{ "items": [item("Work", &p.folder)] }] })));
    k.open_all();
    let work = k.fence(0).items[0].path.clone();
    let (x0, y0) = on_picture(0, BOX);
    k.h().hover(&work, x0, y0, "", false);
    assert!(k.fence_win(0).messages("fence:hover").last().unwrap()["into"].is_null(), "tried to drop an item into itself");
}

#[test]
fn the_visible_item_receives_the_drop_when_scrolled() {
    let p = desk();
    let fillers: Vec<_> = ["가.txt", "나.txt", "다.txt", "라.txt"]
        .iter()
        .map(|n| {
            let at = join(&p.root, n);
            fs::write(&at, *n).unwrap();
            item(n, &at)
        })
        .collect();
    let mut near = fillers;
    near.push(item("Work", &p.folder));
    let k = two_boxes(near, vec![item("노트.txt", &p.note)]);
    let grid = grid_of(BOX.2, BOX.3, false);
    assert_eq!(grid.cols, 4);
    let work = k.fence(0).items[4].path.clone();
    let note = k.fence(1).items[0].path.clone();
    k.h().set_scroll("a", grid.cell_h);
    let (x, y) = on_picture(0, BOX);
    k.h().transfer("b", &note, x, y, &[]);
    assert!(Path::new(&join(&work, "노트.txt")).exists(), "scroll offset was not accounted for");
}
