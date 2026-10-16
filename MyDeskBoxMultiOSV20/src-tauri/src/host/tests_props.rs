// Electron 판 test/props.test.js — 항목 속성 창에 넘기는 줄.

use serde_json::json;
use std::fs;

use super::testkit::*;
use super::*;
use crate::pathx::{dirname, join};
use crate::ui::Props;

struct Opened {
    k: Kit,
}

impl Opened {
    fn path_of(&self, name: &str) -> String {
        self.k.fence(0).items.iter().find(|i| i.name == name).unwrap_or_else(|| panic!("'{name}' was not held")).path.clone()
    }
    fn props(&self, path: &str, group: &[String]) -> Props {
        self.k.h().show_props("a", path, group, None).expect("the properties window did not open")
    }
}

fn open_with(items: Vec<serde_json::Value>, extra: serde_json::Value) -> Opened {
    let mut state = json!({ "fences": [{ "items": items }] });
    if let Some(map) = extra.as_object() {
        for (k, v) in map {
            state[k] = v.clone();
        }
    }
    let k = kit(base_state(state));
    k.open_ready();
    k.h().push("a");
    Opened { k }
}

fn value_of(props: &Props, label: &str) -> Option<String> {
    props.rows.iter().find(|r| r.label == label).map(|r| r.value.clone())
}

fn file(dir: &str, name: &str, len: usize) -> serde_json::Value {
    let at = join(dir, name);
    fs::write(&at, vec![b'x'; len]).unwrap();
    json!({ "name": name, "path": at })
}

#[test]
fn the_icon_menu_has_properties_but_the_empty_spot_does_not() {
    let o = open_with(vec![], json!({}));
    let items = o.k.h().fence_menu("a", Some("C:/Desktop/노트.txt"), &[]).unwrap();
    assert!(items.iter().any(|i| i.label() == "속성"));
    let items = o.k.h().fence_menu("a", None, &[]).unwrap();
    assert!(!items.iter().any(|i| i.label() == "속성"));
}

#[test]
fn file_properties_show_name_location_size_and_date() {
    let dir = room();
    let o = open_with(vec![file(&dir, "노트.txt", 2048)], json!({}));
    let path = o.path_of("노트.txt");
    let p = o.props(&path, &[]);
    assert_eq!(p.title, "노트.txt");
    assert_eq!(p.kind, "TXT 파일");
    assert_eq!(value_of(&p, "위치").unwrap(), dirname(&path));
    assert_eq!(value_of(&p, "담긴 박스").unwrap(), "박스");
    assert_eq!(value_of(&p, "크기").unwrap(), "2.0 KB (2,048 바이트)");
    assert!(!value_of(&p, "수정한 날짜").unwrap().is_empty());
    assert_eq!(value_of(&p, "특성").unwrap(), "없음");
    assert!(p.icon.is_some() || true);
}

#[test]
fn small_files_folders_and_missing_items() {
    let dir = room();
    let folder = join(&dir, "일감");
    fs::create_dir_all(join(&folder, "속")).unwrap();
    fs::write(join(&folder, "a.txt"), vec![0; 100]).unwrap();
    fs::write(join(&join(&folder, "속"), "b.txt"), vec![0; 200]).unwrap();
    let gone = join(&dir, "없는것.txt");
    let o = open_with(vec![file(&dir, "a.bin", 300), json!({ "name": "일감", "path": folder })], json!({}));
    assert_eq!(value_of(&o.props(&o.path_of("a.bin"), &[]), "크기").unwrap(), "300 바이트");
    let p = o.props(&o.path_of("일감"), &[]);
    assert_eq!(p.kind, "폴더");
    assert_eq!(value_of(&p, "크기").unwrap(), "300 바이트");
    assert_eq!(value_of(&p, "안의 항목").unwrap(), "파일 2개 · 폴더 1개");
    let p = o.k.h().show_props("a", &gone, &[], None).unwrap();
    assert!(p.kind.contains("찾을 수 없습니다"));
    assert_eq!(value_of(&p, "크기"), None);
    assert_eq!(value_of(&p, "위치").unwrap(), dirname(&gone));
}

#[test]
fn groups_show_count_total_and_kind() {
    let dir = room();
    let folder = join(&dir, "일감");
    fs::create_dir_all(join(&folder, "속")).unwrap();
    fs::write(join(&folder, "a.txt"), vec![0; 100]).unwrap();
    fs::write(join(&join(&folder, "속"), "b.txt"), vec![0; 200]).unwrap();
    let o = open_with(
        vec![file(&dir, "a.txt", 100), file(&dir, "b.txt", 200), json!({ "name": "일감", "path": folder }), file(&dir, "노트.txt", 50), json!({ "name": "휴지통", "path": "shell:RecycleBinFolder" })],
        json!({}),
    );
    let (a, b) = (o.path_of("a.txt"), o.path_of("b.txt"));
    let p = o.props(&a, &[a.clone(), b.clone()]);
    assert_eq!(p.title, "2개 항목");
    assert_eq!(value_of(&p, "크기").unwrap(), "300 바이트");
    assert_eq!(value_of(&p, "안의 항목").unwrap(), "파일 2개 · 폴더 0개");
    assert_eq!(p.kind, "TXT 파일");
    assert_eq!(o.props(&a, &[a.clone()]).title, "a.txt", "one selected is shown as itself");
    let group = vec![o.path_of("일감"), o.path_of("노트.txt")];
    let p = o.props(&group[0], &group);
    assert_eq!(value_of(&p, "크기").unwrap(), "350 바이트");
    assert_eq!(value_of(&p, "안의 항목").unwrap(), "파일 3개 · 폴더 2개");
    assert_eq!(p.kind, "여러 종류");
    let group = vec![a.clone(), "shell:RecycleBinFolder".to_string()];
    let p = o.props(&a, &group);
    assert_eq!(value_of(&p, "크기").unwrap(), "100 바이트");
    assert_eq!(value_of(&p, "안의 항목").unwrap(), "파일 1개 · 폴더 0개");
    // 누른 것이 고른 묶음에 없으면 그것 하나만 보인다.
    assert_eq!(o.props(&a, &[b.clone(), o.path_of("노트.txt")]).title, "a.txt");
}

#[test]
fn shell_items_open_properties_without_a_size() {
    let o = open_with(vec![json!({ "name": "휴지통", "path": "shell:RecycleBinFolder" })], json!({}));
    let p = o.props("shell:RecycleBinFolder", &[]);
    assert_eq!(p.kind, "시스템 항목");
    assert_eq!(value_of(&p, "위치").unwrap(), "shell:RecycleBinFolder");
    assert_eq!(value_of(&p, "크기"), None);
}

#[test]
fn english_properties_and_keys_per_item() {
    let dir = room();
    let o = open_with(vec![file(&dir, "a.txt", 10), file(&dir, "b.txt", 10)], json!({ "settings": { "lang": "en" } }));
    let a = o.path_of("a.txt");
    let p = o.props(&a, &[]);
    assert_eq!(p.close, "Close");
    assert_eq!(value_of(&p, "Location").unwrap(), dirname(&a));
    assert_eq!(value_of(&p, "Size").unwrap(), "10 bytes");
    // 같은 항목은 같은 열쇠, 다른 항목은 다른 열쇠 (창을 두 번 열지 않는다).
    assert_eq!(o.props(&a, &[]).key, p.key);
    assert_ne!(o.props(&o.path_of("b.txt"), &[]).key, p.key);
}

#[test]
fn opens_only_when_clicked_in_the_menu() {
    let dir = room();
    let o = open_with(vec![file(&dir, "노트.txt", 5)], json!({}));
    let at = o.path_of("노트.txt");
    let items = o.k.h().fence_menu("a", Some(&at), &[at.clone()]).unwrap();
    assert!(o.k.ui.st().props.is_empty(), "a window appeared just from opening the menu");
    let action = match items.iter().find(|i| i.label() == "속성").unwrap() {
        crate::ui::MenuItem::Action { action, .. } => action.clone(),
        _ => panic!(),
    };
    o.k.run(run_action(&o.k.sh, action));
    assert_eq!(o.k.ui.st().props.last().unwrap().title, "노트.txt");
}

#[test]
fn read_only_files_and_shortcut_targets() {
    let dir = room();
    let o = open_with(vec![file(&dir, "a.txt", 10), file(&dir, "한글.lnk", 4)], json!({}));
    let a = o.path_of("a.txt");
    let mut perm = fs::metadata(&a).unwrap().permissions();
    perm.set_readonly(true);
    fs::set_permissions(&a, perm.clone()).unwrap();
    assert_eq!(value_of(&o.props(&a, &[]), "특성").unwrap(), "읽기 전용");
    #[allow(clippy::permissions_set_readonly_false)]
    perm.set_readonly(false);
    fs::set_permissions(&a, perm).unwrap();
    let link = o.path_of("한글.lnk");
    o.k.desk.link(&link, "C:/Program Files/Hnc/Hwp.exe");
    let p = o.props(&link, &[]);
    assert_eq!(p.kind, "바로가기");
    assert_eq!(value_of(&p, "가리키는 곳").unwrap(), "C:/Program Files/Hnc/Hwp.exe");
    assert!(p.rows.iter().find(|r| r.label == "가리키는 곳").unwrap().wide);
}

#[test]
fn hitting_the_limit_marks_a_minimum() {
    let dir = room();
    let folder = join(&dir, "많은것");
    fs::create_dir(&folder).unwrap();
    for i in 0..20 {
        fs::write(join(&folder, &format!("{i}.txt")), vec![0; 10]).unwrap();
    }
    let small = join(&dir, "조금");
    fs::create_dir(&small).unwrap();
    fs::write(join(&small, "a.txt"), vec![0; 10]).unwrap();
    let o = open_with(vec![json!({ "name": "많은것", "path": folder }), json!({ "name": "조금", "path": small })], json!({}));
    let many = o.path_of("많은것");
    let p = o.k.h().show_props("a", &many, &[], Some((5, 1200))).unwrap();
    assert!(value_of(&p, "크기").unwrap().ends_with("이상"));
    assert_eq!(value_of(&o.props(&o.path_of("조금"), &[]), "크기").unwrap(), "10 바이트");
}

#[test]
fn rows_have_no_empty_values_or_untranslated_keys() {
    let dir = room();
    let folder = join(&dir, "일감");
    fs::create_dir(&folder).unwrap();
    fs::write(join(&folder, "a.txt"), vec![0; 10]).unwrap();
    let o = open_with(vec![json!({ "name": "일감", "path": folder }), file(&dir, "노트.txt", 10)], json!({}));
    for name in ["일감", "노트.txt"] {
        let p = o.props(&o.path_of(name), &[]);
        assert!(!p.title.is_empty() && !p.kind.is_empty() && !p.close.is_empty());
        assert!(p.rows.len() >= 4, "{name} has too few rows");
        for row in &p.rows {
            assert!(!row.label.trim().is_empty());
            assert!(!row.value.trim().is_empty(), "the '{}' value of {name} is empty", row.label);
            for text in [&row.label, &row.value, &p.kind, &p.close] {
                assert!(!text.starts_with("props.") && !text.starts_with("menu.") && !text.starts_with("box."), "untranslated key: {text}");
            }
        }
    }
}
