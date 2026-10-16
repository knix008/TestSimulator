// 빌드할 때 두 가지를 한다.
//
//  1. tauri-build — 창 권한과 아이콘을 묶는다.
//  2. 화면과 메인이 함께 쓰는 문장표(src/shared/i18n.js)를 Rust 표로 옮긴다.
//     문장은 그 파일 한 곳에만 둔다. 창은 <script> 로 읽고, 메인은 여기서 만든 표를 읽는다.

use std::{env, fs, path::Path};

fn main() {
    let source = Path::new("../src/shared/i18n.js");
    println!("cargo:rerun-if-changed={}", source.display());
    let text = fs::read_to_string(source).expect("src/shared/i18n.js 를 읽지 못했습니다");
    let (langs, tables) = parse_i18n(&text);
    assert!(!tables.is_empty(), "i18n.js 에서 문장표를 찾지 못했습니다");

    let mut out = String::new();
    out.push_str("// build.rs 가 src/shared/i18n.js 에서 만든다. 고치지 말 것.\n");
    out.push_str("pub static LANGS: &[(&str, &str)] = &[\n");
    for (id, label) in &langs {
        out.push_str(&format!("    ({id:?}, {label:?}),\n"));
    }
    out.push_str("];\n");
    out.push_str("pub static TEXT: &[(&str, &[(&str, &str)])] = &[\n");
    for (lang, rows) in &tables {
        out.push_str(&format!("    ({lang:?}, &[\n"));
        for (key, value) in rows {
            out.push_str(&format!("        ({key:?}, {value:?}),\n"));
        }
        out.push_str("    ]),\n");
    }
    out.push_str("];\n");
    let dest = Path::new(&env::var("OUT_DIR").unwrap()).join("i18n_table.rs");
    fs::write(dest, out).unwrap();

    tauri_build::build();
}

type Rows = Vec<(String, String)>;

// i18n.js 의 LANGS 와 TEXT 를 읽는다. 자바스크립트를 다 읽을 까닭은 없다.
// 한 줄에 하나씩 적힌 'key': '문장', 꼴과 언어를 여는 `ko: {` 줄만 본다.
fn parse_i18n(text: &str) -> (Vec<(String, String)>, Vec<(String, Rows)>) {
    let mut langs = Vec::new();
    let mut tables: Vec<(String, Rows)> = Vec::new();
    let mut in_text = false;
    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with("{ id:") {
            let id = between(line, "id: '", "'");
            let label = between(line, "label: '", "'");
            if let (Some(id), Some(label)) = (id, label) {
                langs.push((id.to_string(), label.to_string()));
            }
            continue;
        }
        if line.starts_with("const TEXT = {") {
            in_text = true;
            continue;
        }
        if !in_text {
            continue;
        }
        if line == "};" {
            in_text = false;
            continue;
        }
        if let Some(lang) = line.strip_suffix(": {") {
            if lang.chars().all(|c| c.is_ascii_alphabetic()) {
                tables.push((lang.to_string(), Vec::new()));
                continue;
            }
        }
        if line.starts_with('\'') {
            let (key, rest) = js_string(line).expect(raw);
            let rest = rest.trim_start();
            let rest = rest.strip_prefix(':').expect(raw).trim_start();
            let (value, _) = js_string(rest).expect(raw);
            tables.last_mut().expect(raw).1.push((key, value));
        }
    }
    (langs, tables)
}

fn between<'a>(line: &'a str, open: &str, close: &str) -> Option<&'a str> {
    let at = line.find(open)? + open.len();
    let end = line[at..].find(close)? + at;
    Some(&line[at..end])
}

// 따옴표로 시작하는 자바스크립트 글을 하나 읽고, 그 뒤에 남은 것을 함께 돌려준다.
fn js_string(text: &str) -> Option<(String, &str)> {
    let mut chars = text.char_indices();
    let (_, quote) = chars.next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    let mut out = String::new();
    while let Some((at, c)) = chars.next() {
        if c == quote {
            return Some((out, &text[at + c.len_utf8()..]));
        }
        if c != '\\' {
            out.push(c);
            continue;
        }
        let (_, next) = chars.next()?;
        match next {
            'n' => out.push('\n'),
            't' => out.push('\t'),
            'r' => out.push('\r'),
            'u' => {
                let hex: String = (0..4).filter_map(|_| chars.next().map(|(_, h)| h)).collect();
                out.push(char::from_u32(u32::from_str_radix(&hex, 16).ok()?)?);
            }
            other => out.push(other),
        }
    }
    None
}
