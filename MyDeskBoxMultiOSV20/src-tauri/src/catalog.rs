// 처음 실행할 때 바탕화면 항목을 종류별로 나눈다 (src/shared/catalog.js 를 옮긴 것).
// 빈 종류는 박스를 만들지 않는다.

use crate::geom::Rect;
use crate::js::round;

pub const ORDER: [&str; 6] = ["folder", "shortcut", "document", "media", "system", "other"];

fn theme(kind: &str) -> &'static str {
    match kind {
        "folder" => "teal",
        "shortcut" => "ocean",
        "document" => "gold",
        "media" => "sunset",
        "system" => "night",
        _ => "steel",
    }
}

const DOCS: [&str; 15] = [
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".csv", ".md", ".hwp", ".hwpx", ".odt",
    ".ods",
];
const MEDIA: [&str; 14] = [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".mp4", ".mov", ".mkv", ".avi", ".mp3", ".wav", ".flac",
];

#[derive(Debug, Clone)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub directory: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone)]
pub struct Planned {
    pub id: String,
    pub title: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub theme: String,
    pub items: Vec<Item>,
}

pub fn ext_of(name: &str) -> String {
    match name.rfind('.') {
        Some(dot) => name[dot..].to_lowercase(),
        None => String::new(),
    }
}

pub fn kind_of(file: &Entry) -> &'static str {
    if file.path.starts_with("shell:") {
        return "system";
    }
    if file.directory {
        return "folder";
    }
    let ext = ext_of(if file.name.is_empty() { &file.path } else { &file.name });
    if ext == ".lnk" || ext == ".url" || ext == ".desktop" {
        return "shortcut";
    }
    if DOCS.contains(&ext.as_str()) {
        return "document";
    }
    if MEDIA.contains(&ext.as_str()) {
        return "media";
    }
    "other"
}

// area 는 작업 표시줄을 뺀 화면. 박스는 오른쪽부터 아래로 쌓고, 넘치면 왼쪽으로 한 칸 간다.
pub fn plan_fences(files: &[Entry], shell: &[Item], area: Rect, title_of: impl Fn(&str) -> String) -> Vec<Planned> {
    let mut groups: Vec<(&str, Vec<Item>)> = ORDER.iter().map(|k| (*k, Vec::new())).collect();
    for file in files {
        let kind = kind_of(file);
        groups.iter_mut().find(|(k, _)| *k == kind).unwrap().1.push(Item { name: file.name.clone(), path: file.path.clone() });
    }
    for item in shell {
        groups.iter_mut().find(|(k, _)| *k == "system").unwrap().1.push(item.clone());
    }
    let width = 280.0;
    let gap = 16.0;
    let margin = 24.0;
    let mut x = area.x + area.width - width - margin;
    let mut y = area.y + margin;
    let mut made: Vec<Planned> = Vec::new();
    for (kind, items) in groups {
        if items.is_empty() {
            continue;
        }
        let rows = (items.len() as f64 / 2.0).ceil();
        let height = (48.0 + rows * 96.0).clamp(200.0, 560.0);
        if y + height > area.y + area.height - margin && !made.is_empty() {
            x -= width + gap;
            y = area.y + margin;
        }
        made.push(Planned {
            id: format!("start-{kind}"),
            title: title_of(kind),
            x: round(x),
            y: round(y),
            w: width,
            h: height,
            theme: theme(kind).into(),
            items,
        });
        y += height + gap;
    }
    made
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, directory: bool) -> Entry {
        Entry { name: name.into(), path: format!("C:/Desk/{name}"), directory }
    }

    #[test]
    fn sorts_desktop_items_by_kind_and_skips_empty_kinds() {
        let files = vec![entry("사진.png", false), entry("폴더", true), entry("앱.lnk", false), entry("a.hwp", false), entry("x.bin", false)];
        let shell = vec![Item { name: "휴지통".into(), path: "shell:RecycleBinFolder".into() }];
        let plan = plan_fences(&files, &shell, Rect::new(0.0, 0.0, 1920.0, 1040.0), |k| k.to_string());
        let ids: Vec<&str> = plan.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["start-folder", "start-shortcut", "start-document", "start-media", "start-system", "start-other"]);
        assert_eq!(plan[0].x, 1920.0 - 280.0 - 24.0);
        assert_eq!(plan[0].h, 200.0);
        assert_eq!(plan[4].theme, "night");
        // 높이를 넘으면 왼쪽 열로 간다.
        assert!(plan.iter().any(|p| p.x < plan[0].x));
        assert!(plan_fences(&[], &[], Rect::new(0.0, 0.0, 800.0, 600.0), |k| k.into()).is_empty());
    }
}
