//! gen-testcases - C++ 판의 회귀 시험 자료를 뽑아 온다.
//!
//! 참고하는 원본은 `KoreanChunJiInC++/tests/test_engine.c` 다. 기대값을 손으로
//! 옮겨 적으면 원본이 고쳐졌을 때 조용히 어긋나므로, 그 파일에서 직접 읽어
//! `test/cases.tsv` 로 적어 둔다. `crates/engine/tests/cases.rs` 가 그것을 읽어
//! 돈다. 뽑아낸 결과는 저장소에 함께 두므로, C++ 판이 없는 곳에서도 시험은
//! 그대로 돌아간다.
//!
//! ```sh
//! cargo run -p gen-testcases                        # 기본 경로에서 뽑는다
//! cargo run -p gen-testcases -- --src <경로> --out <경로>
//! ```
//!
//! # 뽑아 오는 것
//!
//! - `expect` / `expect_live` / `expect_cursor` / `expect_comp` / `expect_mode` 호출
//! - 함수 안에 표로 적어 둔 `{ "이름", "키", L"기대" }` 꼴의 줄
//! - 모음 전이표 `{ "이름", "키", L"+ㅣ", L"+·", L"+ㅡ" }` (세 항목으로 편다)
//!
//! # 뽑지 않는 것
//!
//! C 코드에서도 계산으로 만들어지는 것(영문 26자 전수, 라벨-입력 일치)과
//! 원본 함수를 직접 부르는 것은 자료로 옮길 수 없어 `tests/engine.rs` 에
//! Rust 로 적어 둔다.

#![forbid(unsafe_code)]

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use regex::Regex;

/// 종류 이름. `cases.tsv` 의 첫 칸에 들어간다.
const KIND_EXPECT: &str = "expect";
const KIND_LIVE: &str = "live";
const KIND_CURSOR: &str = "cursor";
const KIND_COMP: &str = "comp";
const KIND_MODE: &str = "mode";

/// 모음 전이표를 펼 때 쓰는 키와 이름표. C 쪽 `test_vowel_table()` 과 같다.
const VOWEL_KEYS: [&str; 3] = ["0", "1", "2"];
const VOWEL_MARKS: [&str; 3] = ["+ㅣ", "+·", "+ㅡ"];

struct Case {
    kind: &'static str,
    section: String,
    name: String,
    seq: String,
    want: String,
    cursor: Option<i64>,
}

fn main() {
    let mut src = PathBuf::from("../KoreanChunJiInC++/tests/test_engine.c");
    let mut out = PathBuf::from("test/cases.tsv");

    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-src" | "--src" if i + 1 < args.len() => {
                src = PathBuf::from(&args[i + 1]);
                i += 2;
            }
            "-out" | "--out" if i + 1 < args.len() => {
                out = PathBuf::from(&args[i + 1]);
                i += 2;
            }
            "-h" | "--help" => {
                println!("gen-testcases [--src <test_engine.c>] [--out <cases.tsv>]");
                return;
            }
            other => fatal(&format!("모르는 옵션: {other}")),
        }
    }

    let text = std::fs::read_to_string(&src)
        .unwrap_or_else(|e| fatal(&format!("원본 시험 파일을 읽지 못했습니다: {e}")));

    let (cases, sections) = parse(&text);
    if cases.is_empty() {
        fatal(&format!(
            "뽑아낸 항목이 없습니다. {} 의 모습이 바뀌었는지 보세요.",
            src.display()
        ));
    }

    if let Some(dir) = out.parent() {
        std::fs::create_dir_all(dir)
            .unwrap_or_else(|e| fatal(&format!("폴더를 만들지 못했습니다: {e}")));
    }
    std::fs::write(&out, render(&src, &cases))
        .unwrap_or_else(|e| fatal(&format!("자료를 쓰지 못했습니다: {e}")));

    println!("{}\n  -> {}", src.display(), out.display());
    println!("  {} 구역 {} 항목", sections.len(), cases.len());
    for (name, n) in &sections {
        println!("     {name:<24} {n:>3}");
    }
}

fn fatal(msg: &str) -> ! {
    eprintln!("gen-testcases: {msg}");
    std::process::exit(1);
}

/// C 시험 파일에서 항목을 뽑아낸다.
///
/// 표로 적어 둔 줄은 함수 맨 앞에 오고 `section()` 호출은 그 뒤에 오므로,
/// 먼저 함수마다 구역 이름을 모아 둔 다음 다시 훑으며 항목을 만든다.
fn parse(src: &str) -> (Vec<Case>, Vec<(String, usize)>) {
    let re_func = Regex::new(r"^static void (test_\w+)\(").unwrap();
    let re_section = Regex::new(r#"section\("((?:[^"\\]|\\.)*)"\)"#).unwrap();

    // expect("이름", "키", L"기대")  /  expect_cursor("이름", "키", L"기대", 3)
    let re_call = Regex::new(
        r#"\bexpect(_live|_cursor|_comp|_mode)?\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*L"((?:[^"\\]|\\.)*)"\s*(?:,\s*(-?\d+)\s*)?\)"#,
    )
    .unwrap();

    // { "이름", "키", L"기대" }  또는  { "이름", "키", L"a", L"b", L"c" }
    let re_row = Regex::new(
        r#"\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*((?:L"(?:[^"\\]|\\.)*"\s*,?\s*)+)\}"#,
    )
    .unwrap();
    let re_wide = Regex::new(r#"L"((?:[^"\\]|\\.)*)""#).unwrap();

    // 파일 바깥에 놓인 표.  static const VowelStep VOWEL_STEPS[] = {
    let re_table = Regex::new(r"^static const \w+ (\w+)\[\]").unwrap();
    let re_ident = Regex::new(r"\b([A-Z][A-Z0-9_]{2,})\b").unwrap();

    let lines: Vec<&str> = src.split('\n').collect();

    // 1차: 함수마다 구역 이름과, 그 함수가 이름을 대는 표를 모은다.
    let mut section_of: HashMap<&str, String> = HashMap::new();
    let mut used_by: HashMap<String, &str> = HashMap::new();
    let mut func = "";
    for line in &lines {
        if let Some(m) = re_func.captures(line) {
            func = m.get(1).unwrap().as_str();
            continue;
        }
        if func.is_empty() {
            continue;
        }
        if let Some(m) = re_section.captures(line) {
            section_of
                .entry(func)
                .or_insert_with(|| unquote(m.get(1).unwrap().as_str()));
        }
        for m in re_ident.captures_iter(line) {
            used_by
                .entry(m.get(1).unwrap().as_str().to_string())
                .or_insert(func);
        }
    }

    // 2차: 항목 모으기.
    //
    // 표는 함수 안에도 있고 파일 바깥에도 있다(VOWEL_STEPS).
    // 바깥에 있는 표는 그 표를 쓰는 함수의 구역에 넣는다.
    let mut cases: Vec<Case> = Vec::new();
    let mut func = "";
    let mut table = String::new();

    for line in &lines {
        if let Some(m) = re_func.captures(line) {
            func = m.get(1).unwrap().as_str();
            table.clear();
            continue;
        }
        if let Some(m) = re_table.captures(line) {
            func = "";
            table = m.get(1).unwrap().as_str().to_string();
            continue;
        }

        let section = if !table.is_empty() {
            used_by
                .get(&table)
                .and_then(|f| section_of.get(*f))
                .cloned()
        } else {
            section_of.get(func).cloned()
        };
        let Some(section) = section else { continue };

        for m in re_call.captures_iter(line) {
            let cursor = m.get(5).map(|v| {
                v.as_str()
                    .parse::<i64>()
                    .unwrap_or_else(|_| fatal("커서 위치를 읽지 못했습니다"))
            });
            cases.push(Case {
                kind: kind_of(m.get(1).map(|v| v.as_str()).unwrap_or("")),
                section: section.clone(),
                name: unquote(m.get(2).unwrap().as_str()),
                seq: unquote(m.get(3).unwrap().as_str()),
                want: unquote(m.get(4).unwrap().as_str()),
                cursor,
            });
        }

        for m in re_row.captures_iter(line) {
            let name = unquote(m.get(1).unwrap().as_str());
            let seq = unquote(m.get(2).unwrap().as_str());

            let wants: Vec<String> = re_wide
                .captures_iter(m.get(3).unwrap().as_str())
                .map(|w| unquote(w.get(1).unwrap().as_str()))
                .collect();

            match wants.len() {
                // { "이름", "키", L"기대" }
                1 => cases.push(Case {
                    kind: KIND_EXPECT,
                    section: section.clone(),
                    name,
                    seq,
                    want: wants[0].clone(),
                    cursor: None,
                }),
                // 모음 전이표: 한 줄이 세 항목이 된다
                3 => {
                    for (i, w) in wants.iter().enumerate() {
                        cases.push(Case {
                            kind: KIND_EXPECT,
                            section: section.clone(),
                            name: format!("{name}{}", VOWEL_MARKS[i]),
                            seq: format!("{seq}{}", VOWEL_KEYS[i]),
                            want: w.clone(),
                            cursor: None,
                        });
                    }
                }
                n => fatal(&format!("모르는 표 모양입니다(기대값 {n} 개): {line}")),
            }
        }
    }

    // 구역별 개수 (나온 차례를 지킨다)
    let mut order: Vec<String> = Vec::new();
    let mut count: HashMap<String, usize> = HashMap::new();
    for c in &cases {
        if !count.contains_key(&c.section) {
            order.push(c.section.clone());
        }
        *count.entry(c.section.clone()).or_insert(0) += 1;
    }
    let stats = order.into_iter().map(|s| {
        let n = count[&s];
        (s, n)
    });

    (cases, stats.collect())
}

fn kind_of(suffix: &str) -> &'static str {
    match suffix {
        "_live" => KIND_LIVE,
        "_cursor" => KIND_CURSOR,
        "_comp" => KIND_COMP,
        "_mode" => KIND_MODE,
        _ => KIND_EXPECT,
    }
}

/// C 문자열의 이스케이프를 푼다.
/// 우리가 쓰는 범위에서는 C 와 Rust 의 이스케이프가 같다.
fn unquote(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('r') => out.push('\r'),
            Some('0') => out.push('\0'),
            Some('\\') => out.push('\\'),
            Some('"') => out.push('"'),
            Some('\'') => out.push('\''),
            Some(other) => fatal(&format!("모르는 이스케이프입니다: \\{other}")),
            None => fatal("문자열이 역슬래시로 끝납니다"),
        }
    }
    out
}

/// 문자열을 따옴표로 감싸고 이스케이프한다. `cases.tsv` 에 그대로 적힌다.
fn quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// `cases.tsv` 본문을 만든다.
fn render(src: &Path, cases: &[Case]) -> String {
    let mut b = String::new();

    b.push_str("# 천지인 오토마타 회귀 시험 자료\n");
    b.push_str("#\n");
    b.push_str("# 이 파일은 손으로 고치지 않는다. 아래 명령으로 다시 만든다.\n");
    b.push_str("#   cargo run -p gen-testcases\n");
    b.push_str("#\n");
    b.push_str(&format!(
        "# 뽑아 온 곳: {}\n",
        src.display().to_string().replace('\\', "/")
    ));
    b.push_str("#\n");
    b.push_str("# 칸 차례: 종류 · 구역 · 이름 · 키 시퀀스 · 기대값 · (커서)\n");
    b.push_str("# 값은 따옴표로 감싼 문자열 리터럴로 적는다.\n");
    b.push_str("#\n");
    b.push_str("# 종류\n");
    b.push_str("#   expect  확정한 뒤 버퍼를 비교\n");
    b.push_str("#   live    확정하지 않고 조합 중인 화면을 비교\n");
    b.push_str("#   cursor  버퍼와 커서 위치를 함께 비교\n");
    b.push_str("#   comp    상태줄 조합 문자열을 비교\n");
    b.push_str("#   mode    모드 이름을 비교\n");
    b.push('\n');

    for c in cases {
        b.push_str(c.kind);
        b.push('\t');
        b.push_str(&c.section);
        b.push('\t');
        b.push_str(&quote(&c.name));
        b.push('\t');
        b.push_str(&quote(&c.seq));
        b.push('\t');
        b.push_str(&quote(&c.want));
        if let Some(n) = c.cursor {
            b.push('\t');
            b.push_str(&n.to_string());
        }
        b.push('\n');
    }
    b
}
