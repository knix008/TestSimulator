//! 시험 도우미. 시험에서만 쓰고 배포본에는 들어가지 않는다.
//!
//! 하는 일은 둘이다.
//!
//! 1. C++ 판에서 뽑아 온 `cases.tsv` 를 읽는다.
//! 2. 각 항목의 결과를 `chunjiin-testreport` 가 알아볼 수 있는 한 줄로 찍는다.
//!
//! `cargo test` 는 시험 함수 하나마다 ok/FAIL 만 찍어서, 그 안에서 무엇을
//! 얼마나 보고 있는지 알 수 없다. C++ 판 `test_engine` 은 구역별 집계와 전체
//! 요약을 보여 주었는데 그 편이 훨씬 낫다. 그래서 시험이 [`emit`] 으로
//! 항목마다 한 줄을 남기고, 보고기가 그것을 모아 같은 모양으로 정리한다.

#![forbid(unsafe_code)]

use std::fmt::Write as _;
use std::path::Path;

/// 보고기가 찾아내는 표시다. 보통 글과 섞이지 않을 만한 것을 골랐다.
pub const MARK: &str = "@@CASE";

/// 항목 하나의 결과다.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Pass,
    Fail,
}

impl Status {
    fn tag(self) -> &'static str {
        match self {
            Status::Pass => "ok",
            Status::Fail => "FAIL",
        }
    }
}

/// 항목 하나의 결과를 한 줄로 찍는다.
///
/// ```text
/// @@CASE<탭>ok<탭>묶음<탭>구역<탭>이름<탭>설명
/// ```
///
/// 탭과 줄바꿈은 미리 지운다. 그렇지 않으면 칸이 어긋난다.
pub fn emit(status: Status, group: &str, section: &str, name: &str, detail: &str) {
    let mut line = String::with_capacity(96);
    let _ = write!(
        line,
        "{MARK}\t{}\t{}\t{}\t{}\t{}",
        status.tag(),
        clean(group),
        clean(section),
        clean(name),
        clean(detail),
    );
    println!("{line}");
}

/// 통과한 항목을 남긴다.
pub fn pass(group: &str, section: &str, name: &str, detail: &str) {
    emit(Status::Pass, group, section, name, detail);
}

/// 틀린 항목을 남긴다.
pub fn fail(group: &str, section: &str, name: &str, detail: &str) {
    emit(Status::Fail, group, section, name, detail);
}

/// 조건이 참이면 통과, 아니면 실패로 남기고 참/거짓을 돌려준다.
///
/// 시험 함수가 이것을 모아 세었다가 마지막에 한 번만 `assert!` 하면,
/// 첫 실패에서 멈추지 않고 어디가 몇 개 틀렸는지 다 볼 수 있다.
pub fn check(ok: bool, group: &str, section: &str, name: &str, detail: &str) -> bool {
    emit(
        if ok { Status::Pass } else { Status::Fail },
        group,
        section,
        name,
        detail,
    );
    ok
}

fn clean(s: &str) -> String {
    s.replace('\t', " ").replace('\n', "\\n").replace('\r', "")
}

/// 통과·실패를 세는 그릇이다.
#[derive(Default, Debug)]
pub struct Tally {
    pub passed: usize,
    pub failed: usize,
}

impl Tally {
    pub fn add(&mut self, ok: bool) {
        if ok {
            self.passed += 1;
        } else {
            self.failed += 1;
        }
    }

    pub fn total(&self) -> usize {
        self.passed + self.failed
    }

    /// 시험 함수 끝에서 부른다. 틀린 것이 있으면 그때 멈춘다.
    #[track_caller]
    pub fn assert_clean(&self, what: &str) {
        assert_eq!(
            self.failed,
            0,
            "{what}: {} 항목 중 {} 개가 틀렸다 (위의 FAIL 줄을 보라)",
            self.total(),
            self.failed
        );
    }
}

// ---------------------------------------------------------------------
// C++ 판에서 뽑아 온 시험 자료
// ---------------------------------------------------------------------

/// `cases.tsv` 의 한 줄이다.
#[derive(Clone, Debug)]
pub struct Case {
    /// 비교 축: expect · live · cursor · comp · mode
    pub kind: String,
    pub section: String,
    pub name: String,
    /// 키 시퀀스
    pub seq: String,
    pub want: String,
    pub cursor: Option<usize>,
}

impl Case {
    /// 비교 축을 짧은 이름으로 보여 준다.
    pub fn kind_label(&self) -> &'static str {
        match self.kind.as_str() {
            "expect" => "확정",
            "live" => "조합중",
            "cursor" => "커서",
            "comp" => "상태줄",
            "mode" => "모드",
            _ => "?",
        }
    }

    /// 기대값을 한 줄에 담기 좋게 만든다.
    /// 줄바꿈은 눈에 보이는 `\n` 으로 바꾸고, 빈 값은 빈칸이라고 적는다.
    pub fn show(&self) -> String {
        let mut out = self.want.replace('\n', "\\n");
        if out.is_empty() {
            out = "(빈칸)".to_string();
        }
        if let Some(c) = self.cursor {
            out.push_str(&format!(" @{c}"));
        }
        out
    }
}

/// 뽑아 둔 시험 자료를 읽는다.
///
/// 칸 차례는 `종류 · 구역 · 이름 · 키 시퀀스 · 기대값 · (커서)` 이고,
/// 값은 따옴표로 감싼 문자열 리터럴이다.
pub fn load_cases(path: impl AsRef<Path>) -> Result<Vec<Case>, String> {
    let path = path.as_ref();
    let text = std::fs::read_to_string(path).map_err(|e| {
        format!(
            "시험 자료를 열지 못했다: {} ({e})\n  \
             scripts/gen-testcases 로 다시 만드세요.",
            path.display()
        )
    })?;

    let mut rows = Vec::new();
    for (i, line) in text.lines().enumerate() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let f: Vec<&str> = line.split('\t').collect();
        if f.len() < 5 {
            return Err(format!(
                "{}:{} 칸이 모자라다: {line:?}",
                path.display(),
                i + 1
            ));
        }

        let unq = |s: &str| -> Result<String, String> {
            unquote(s)
                .ok_or_else(|| format!("{}:{} 문자열을 풀지 못했다: {s:?}", path.display(), i + 1))
        };

        let cursor = match f.get(5) {
            Some(v) if !v.is_empty() => Some(v.parse::<usize>().map_err(|_| {
                format!(
                    "{}:{} 커서 위치를 읽지 못했다: {v:?}",
                    path.display(),
                    i + 1
                )
            })?),
            _ => None,
        };

        rows.push(Case {
            kind: f[0].to_string(),
            section: f[1].to_string(),
            name: unq(f[2])?,
            seq: unq(f[3])?,
            want: unq(f[4])?,
            cursor,
        });
    }

    if rows.is_empty() {
        return Err("시험 자료가 비었다".to_string());
    }
    Ok(rows)
}

/// 따옴표로 감싼 문자열 리터럴을 푼다.
///
/// 자료를 뽑아내는 쪽이 Go 문자열 리터럴로 적는데, 쓰이는 이스케이프는
/// Rust 와 같은 `\\ \" \n \t \r` 뿐이라 그대로 읽을 수 있다.
fn unquote(s: &str) -> Option<String> {
    let body = s.strip_prefix('"')?.strip_suffix('"')?;

    let mut out = String::with_capacity(body.len());
    let mut chars = body.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next()? {
            'n' => out.push('\n'),
            't' => out.push('\t'),
            'r' => out.push('\r'),
            '\\' => out.push('\\'),
            '"' => out.push('"'),
            '\'' => out.push('\''),
            other => {
                return Some({
                    // 모르는 이스케이프는 그대로 둔다. 자료가 늘었을 때
                    // 조용히 어긋나느니 눈에 보이는 편이 낫다.
                    out.push('\\');
                    out.push(other);
                    out.extend(chars);
                    out
                });
            }
        }
    }
    Some(out)
}

/// 시험 자료 파일의 자리다. 저장소 루트의 `test/cases.tsv` 다.
pub fn cases_path() -> std::path::PathBuf {
    // crates/testkit -> <루트>/test/cases.tsv
    let shared = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test/cases.tsv");
    if shared.exists() {
        return shared;
    }
    Path::new("test/cases.tsv").to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unquote_handles_escapes() {
        assert_eq!(unquote(r#""가나""#).as_deref(), Some("가나"));
        assert_eq!(unquote(r#""""#).as_deref(), Some(""));
        assert_eq!(unquote(r#""a\nb""#).as_deref(), Some("a\nb"));
        assert_eq!(unquote(r#""\"""#).as_deref(), Some("\""));
        assert_eq!(unquote("따옴표없음"), None);
    }

    #[test]
    fn clean_strips_separators() {
        assert_eq!(clean("a\tb\nc"), "a b\\nc");
    }
}
