//! 시험 결과를 모아 구역별로 정리한다.
//!
//! 모으는 일과 보여 주는 일을 여기 두고, `main.rs` 는 `cargo test` 를 돌려
//! 줄을 넘겨 주기만 한다. 그래야 보고기 자체를 시험할 수 있다.
//!
//! 칸은 **눈에 보이는 폭**으로 맞춘다. 한글은 터미널에서 두 칸을 차지하므로
//! 글자 수로 채우면 세로로 어긋난다. 폭은 묶음 전체를 한꺼번에 재므로 묶음이
//! 달라도 숫자 열이 같은 자리에 선다.

#![forbid(unsafe_code)]

use std::fmt::Write as _;
use std::io::{self, IsTerminal, Write as IoWrite};

/// 시험이 남긴 줄에서 뽑아낸 항목 하나다.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Case {
    pub passed: bool,
    /// 큰 묶음. `"조합 엔진 · C++ 원본에서 뽑아 온 자료"` 같은 것
    pub group: String,
    /// 구역. `"모음 전이표 전수"` 같은 것
    pub section: String,
    pub name: String,
    /// 무엇을 눌러 무엇이 나와야 하는지
    pub detail: String,
}

/// 시험이 남긴 한 줄을 푼다. 우리 줄이 아니면 `None` 이다.
///
/// ```text
/// @@CASE<탭>ok<탭>묶음<탭>구역<탭>이름<탭>설명
/// ```
///
/// `cargo test` 는 여러 시험을 한꺼번에 돌리므로 다른 줄이 앞에 붙어 나올
/// 수 있다. 그래서 줄 처음이 아니라 표시가 나오는 자리부터 읽는다.
pub fn parse_line(line: &str) -> Option<Case> {
    const MARK: &str = "@@CASE";

    let at = line.find(MARK)?;
    let rest = &line[at + MARK.len()..];

    let f: Vec<&str> = rest.split('\t').collect();
    // 맨 앞은 표시 바로 뒤의 빈 칸이다.
    if f.len() < 6 {
        return None;
    }

    Some(Case {
        passed: f[1] == "ok",
        group: f[2].to_string(),
        section: f[3].to_string(),
        name: f[4].to_string(),
        detail: f[5].to_string(),
    })
}

// ---------------------------------------------------------------------
// 칸 맞추기
//
// 한글은 터미널에서 두 칸을 차지한다. `"{:<28}"` 처럼 글자 수로 채우면
// 세로로 어긋난다. 눈에 보이는 폭으로 세어 직접 채운다.
// ---------------------------------------------------------------------

/// 터미널에서 차지하는 칸 수다.
pub fn display_width(text: &str) -> usize {
    text.chars().map(|c| if is_wide(c) { 2 } else { 1 }).sum()
}

/// 두 칸을 차지하는 글자인지 본다 (한글 · 한자 · 가나 · 전각 기호).
fn is_wide(c: char) -> bool {
    matches!(c,
        '\u{1100}'..='\u{115F}' | // 한글 자모
        '\u{2E80}'..='\u{A4CF}' | // 한자 · 가나 · 호환 자모
        '\u{AC00}'..='\u{D7A3}' | // 한글 음절
        '\u{F900}'..='\u{FAFF}' | // 한자 호환
        '\u{FE30}'..='\u{FE6F}' |
        '\u{FF00}'..='\u{FF60}' | // 전각
        '\u{FFE0}'..='\u{FFE6}'
    )
}

/// `cols` 칸이 되도록 빈칸을 채운다. 넘치면 그대로 둔다.
pub fn pad(text: &str, cols: usize) -> String {
    pad_align(text, cols, false)
}

fn pad_align(text: &str, cols: usize, right: bool) -> String {
    let room = cols.saturating_sub(display_width(text));
    if right {
        format!("{}{text}", " ".repeat(room))
    } else {
        format!("{text}{}", " ".repeat(room))
    }
}

// ---------------------------------------------------------------------
// 색
// ---------------------------------------------------------------------

/// ANSI 색이다. 켤 수 없으면 모두 빈 문자열이 된다.
#[derive(Clone, Copy)]
struct Ink {
    on: bool,
}

impl Ink {
    fn paint(self, code: &str, text: &str) -> String {
        if self.on {
            format!("\x1b[{code}m{text}\x1b[0m")
        } else {
            text.to_string()
        }
    }

    fn bold(self, t: &str) -> String {
        self.paint("1", t)
    }
    fn dim(self, t: &str) -> String {
        self.paint("2", t)
    }
    fn green(self, t: &str) -> String {
        self.paint("32", t)
    }
    fn red(self, t: &str) -> String {
        self.paint("1;31", t)
    }
    fn cyan(self, t: &str) -> String {
        self.paint("1;36", t)
    }
    fn yellow(self, t: &str) -> String {
        self.paint("33", t)
    }
    fn magenta(self, t: &str) -> String {
        self.paint("35", t)
    }
}

/// 색을 켤지 정한다.
///
/// `NO_COLOR` 가 있으면 끄고, `FORCE_COLOR` / `CLICOLOR_FORCE` 가 있으면
/// 켠다. 아무 말이 없으면 화면으로 나갈 때만 켠다. 파일이나 파이프로
/// 흘려보낼 때 색 부호가 섞이면 읽기 나쁘기 때문이다.
pub fn color_enabled() -> bool {
    if std::env::var_os("NO_COLOR").is_some() {
        return false;
    }
    if std::env::var_os("FORCE_COLOR").is_some() || std::env::var_os("CLICOLOR_FORCE").is_some()
    {
        return true;
    }
    io::stdout().is_terminal()
}

// ---------------------------------------------------------------------
// 보고서
// ---------------------------------------------------------------------

/// 모은 항목들이다. 나온 차례를 그대로 지킨다.
#[derive(Default, Debug)]
pub struct Report {
    cases: Vec<Case>,
}

/// 구역 이름 칸의 최소 폭이다. 이름이 짧아도 숫자 열이 들쭉날쭉하지
/// 않게 바닥을 깔아 둔다.
const NAME_MIN: usize = 26;
/// 합계 줄에 쓰는 이름이다. 칸 폭을 잴 때 함께 센다.
const TOTAL_LABEL: &str = "묶음 합계";

impl Report {
    pub fn add(&mut self, c: Case) {
        self.cases.push(c);
    }

    pub fn total(&self) -> usize {
        self.cases.len()
    }

    pub fn failed(&self) -> usize {
        self.cases.iter().filter(|c| !c.passed).count()
    }

    pub fn passed(&self) -> usize {
        self.cases.iter().filter(|c| c.passed).count()
    }

    pub fn cases(&self) -> &[Case] {
        &self.cases
    }

    /// 이름 · 구역 · 묶음에 낱말이 들어간 것만 남긴다.
    pub fn retain(&mut self, word: &str) {
        self.cases.retain(|c| {
            c.name.contains(word) || c.section.contains(word) || c.group.contains(word)
        });
    }

    /// 묶음과 구역을 나온 차례대로 돌려준다.
    fn groups(&self) -> Vec<(String, Vec<String>)> {
        let mut out: Vec<(String, Vec<String>)> = Vec::new();
        for c in &self.cases {
            match out.iter_mut().find(|(g, _)| *g == c.group) {
                Some((_, sections)) => {
                    if !sections.contains(&c.section) {
                        sections.push(c.section.clone());
                    }
                }
                None => out.push((c.group.clone(), vec![c.section.clone()])),
            }
        }
        out
    }

    fn in_section(&self, group: &str, section: &str) -> Vec<&Case> {
        self.cases
            .iter()
            .filter(|c| c.group == group && c.section == section)
            .collect()
    }

    /// 이름 칸과 숫자 칸의 폭을 미리 잰다.
    ///
    /// **모든 묶음을 한꺼번에 재서** 묶음이 달라도 숫자 열이 같은 자리에
    /// 서게 한다. 묶음마다 따로 재면 위아래로 어긋난다.
    fn columns(&self) -> (usize, usize, usize) {
        let mut names: Vec<&str> = self.cases.iter().map(|c| c.section.as_str()).collect();
        names.push(TOTAL_LABEL);
        let name_w = names
            .iter()
            .map(|n| display_width(n))
            .max()
            .unwrap_or(0)
            .max(NAME_MIN);

        let case_w = self
            .cases
            .iter()
            .map(|c| display_width(&c.name))
            .max()
            .unwrap_or(0)
            .max(NAME_MIN);

        let mut totals = Vec::new();
        for (group, sections) in self.groups() {
            let mut g_total = 0usize;
            for section in sections {
                let n = self.in_section(&group, &section).len();
                totals.push(n);
                g_total += n;
            }
            totals.push(g_total);
        }
        let num_w = totals
            .iter()
            .map(|t| t.to_string().len())
            .max()
            .unwrap_or(1)
            .max(3);
        (name_w, case_w, num_w)
    }

    /// 구역별 집계와 요약을 찍는다. 색은 화면으로 나갈 때만 켠다.
    pub fn print(&self, verbose: bool) {
        self.print_colored(verbose, color_enabled());
    }

    /// 색을 켤지 직접 정해서 찍는다.
    pub fn print_colored(&self, verbose: bool, color: bool) {
        let _ = write_report(&self.render(verbose, color), &mut io::stdout().lock());
    }

    /// 색 없는 전체 보고서를 파일로 남긴다. 콘솔이 뒤를 잘라도 요약을 볼 수 있다.
    pub fn write_plain_file(&self, path: &std::path::Path) -> io::Result<()> {
        let text = self.render(false, false);
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(text.as_bytes());
        std::fs::write(path, bytes)
    }

    /// 구역별 집계와 Summary 를 문자열로 만든다.
    pub fn render(&self, verbose: bool, color: bool) -> String {
        if self.cases.is_empty() {
            return String::new();
        }

        let ink = Ink { on: color };
        let (name_w, case_w, num_w) = self.columns();
        // 표 한 줄의 폭. 가르는 줄을 여기에 맞춘다.
        //   2 + 4 + 2 + name + 2 + num + 1 + num + 2 + 4(통과)
        let rule = (2 + 4 + 2 + name_w + 2 + num_w + 1 + num_w + 2 + 4).max(64);

        let mut out = String::new();
        let _ = writeln!(out);
        let _ = writeln!(out, "{}", ink.bold("  천지인 한글 입력기 - 시험"));
        let _ = writeln!(out, "{}", ink.cyan(&"═".repeat(rule)));

        let groups = self.groups();
        let mut section_count = 0usize;

        for (group, sections) in &groups {
            let mut g_pass = 0usize;
            let mut g_total = 0usize;

            let _ = writeln!(out);
            let _ = writeln!(out, "  {}", ink.cyan(&format!("[ {group} ]")));

            for section in sections {
                let rows = self.in_section(group, section);
                let pass = rows.iter().filter(|c| c.passed).count();
                g_pass += pass;
                g_total += rows.len();
                section_count += 1;
                let ok = pass == rows.len();

                let mark = if ok {
                    ink.green(" ok ")
                } else {
                    ink.red("FAIL")
                };
                let count = format!(
                    "{}/{}",
                    pad_align(&pass.to_string(), num_w, true),
                    pad_align(&rows.len().to_string(), num_w, false)
                );
                let count = if ok { ink.dim(&count) } else { ink.red(&count) };
                let status = if ok {
                    ink.green("통과")
                } else {
                    ink.red("실패")
                };
                let _ = writeln!(
                    out,
                    "  {mark}  {}  {count}  {status}",
                    pad(section, name_w)
                );

                if verbose {
                    for c in rows {
                        let m = if c.passed {
                            ink.green("·")
                        } else {
                            ink.red("✗")
                        };
                        let _ = writeln!(
                            out,
                            "          {m}  {}  {}",
                            pad(&c.name, case_w),
                            ink.dim(&c.detail)
                        );
                    }
                }
            }

            let sub = format!(
                "{}/{}",
                pad_align(&g_pass.to_string(), num_w, true),
                pad_align(&g_total.to_string(), num_w, false)
            );
            let _ = writeln!(
                out,
                "  {}  {}  {}",
                ink.dim("    "),
                ink.dim(&pad(TOTAL_LABEL, name_w)),
                ink.bold(&sub)
            );
        }

        let bad: Vec<&Case> = self.cases.iter().filter(|c| !c.passed).collect();
        if !bad.is_empty() {
            let _ = writeln!(out);
            let _ = writeln!(out, "{}", ink.dim(&"─".repeat(rule)));
            let _ = writeln!(out, "  {}", ink.red(&format!("틀린 항목 {}", bad.len())));
            for c in &bad {
                let _ = writeln!(
                    out,
                    "    {}",
                    ink.yellow(&format!("{} · {} · {}", c.group, c.section, c.name))
                );
                let _ = writeln!(out, "        {}", ink.dim(&c.detail));
            }
        }

        // Summary — 숫자 열을 세로로 맞춘다.
        let clean = self.failed() == 0;
        let total = self.total();
        let pass = self.passed();
        let fail = self.failed();
        let rate = if total > 0 { pass * 100 / total } else { 0 };
        let label_w = display_width("전체 시험 항목");
        let sum_num_w = total.to_string().len().max(3);
        let num = |n: usize| pad_align(&n.to_string(), sum_num_w, true);
        let lab = |s: &str| pad(s, label_w);

        let _ = writeln!(out);
        let _ = writeln!(out, "{}", ink.dim(&"─".repeat(rule)));
        let _ = writeln!(out, "  {}", ink.bold(&ink.magenta("Summary")));
        let _ = writeln!(out, "{}", ink.dim(&"─".repeat(rule)));
        let _ = writeln!(
            out,
            "    {}   {} 개    (구역 {} 개 · 묶음 {} 개)",
            lab("전체 시험 항목"),
            num(total),
            section_count,
            groups.len()
        );
        let _ = writeln!(
            out,
            "    {}   {} 개    ({}%)",
            lab("통과"),
            ink.green(&num(pass)),
            rate
        );
        let fail_s = if fail > 0 {
            ink.red(&num(fail))
        } else {
            ink.dim(&num(fail))
        };
        let _ = writeln!(out, "    {}   {} 개", lab("실패"), fail_s);

        let _ = writeln!(out, "{}", ink.dim(&"─".repeat(rule)));
        if clean {
            let _ = writeln!(
                out,
                "    {}   {}    {}개 항목 모두 통과",
                lab("결과"),
                ink.bold(&ink.green("PASS")),
                total
            );
        } else {
            let _ = writeln!(
                out,
                "    {}   {}    {}개 중 {}개 실패",
                lab("결과"),
                ink.bold(&ink.red("FAIL")),
                total,
                fail
            );
        }
        let _ = writeln!(out, "{}", ink.cyan(&"═".repeat(rule)));
        let _ = writeln!(out);
        out
    }
}

/// 보고서를 줄마다 보낸다.
///
/// Windows 콘솔(코드 페이지 65001)은 한 번에 대략 8KB 넘게 쓰면
/// 뒤를 잘라 버린다. Summary 가 맨 뒤에 있어서, 한 덩어리로 찍으면
/// 전체 요약이 안 보인다. 줄마다 보내고 바로 비운다.
pub fn write_report(text: &str, w: &mut impl IoWrite) -> io::Result<()> {
    for chunk in text.split_inclusive('\n') {
        w.write_all(chunk.as_bytes())?;
        w.flush()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(status: &str, group: &str, section: &str, name: &str) -> String {
        format!("@@CASE\t{status}\t{group}\t{section}\t{name}\t설명")
    }

    #[test]
    fn parses_our_lines_only() {
        let c = parse_line(&line("ok", "엔진", "모음", "빈칸+ㅣ")).unwrap();
        assert!(c.passed);
        assert_eq!(c.section, "모음");
        assert_eq!(c.name, "빈칸+ㅣ");

        assert!(parse_line("test foo ... ok").is_none());
        assert!(parse_line("").is_none());
        // 칸이 모자라면 우리 줄이 아니다.
        assert!(parse_line("@@CASE\tok\t엔진").is_none());
    }

    #[test]
    fn reads_lines_with_a_prefix() {
        // cargo test 는 여러 시험을 함께 돌리므로 앞에 다른 글이 붙을 수 있다.
        let c = parse_line("test engine ... @@CASE\tFAIL\tA\tB\tC\tD").unwrap();
        assert!(!c.passed);
        assert_eq!(c.group, "A");
    }

    #[test]
    fn counts_and_groups() {
        let mut r = Report::default();
        r.add(parse_line(&line("ok", "엔진", "모음", "가")).unwrap());
        r.add(parse_line(&line("ok", "엔진", "모음", "나")).unwrap());
        r.add(parse_line(&line("FAIL", "엔진", "자음", "다")).unwrap());
        r.add(parse_line(&line("ok", "화면", "테마", "라")).unwrap());

        assert_eq!(r.total(), 4);
        assert_eq!(r.passed(), 3);
        assert_eq!(r.failed(), 1);

        let g = r.groups();
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].0, "엔진");
        // 구역은 나온 차례를 지킨다.
        assert_eq!(g[0].1, vec!["모음", "자음"]);
        assert_eq!(r.in_section("엔진", "모음").len(), 2);
    }

    #[test]
    fn retain_filters_by_word() {
        let mut r = Report::default();
        r.add(parse_line(&line("ok", "엔진", "모음", "가")).unwrap());
        r.add(parse_line(&line("ok", "화면", "테마", "나")).unwrap());

        r.retain("테마");
        assert_eq!(r.total(), 1);
        assert_eq!(r.cases()[0].name, "나");
    }

    /// 빈 보고서가 "0개 중 0개 통과" 로 조용히 넘어가지 않는지 본다.
    /// 그것을 보고 다 잘 돌아간다고 믿게 되기 때문이다.
    #[test]
    fn empty_report_is_visible() {
        let r = Report::default();
        assert_eq!(r.total(), 0);
        // 찍을 것이 없으면 아무것도 찍지 않는다. 부르는 쪽이 그것을 보고
        // 잘못되었다고 알린다(main.rs).
        assert!(r.render(false, false).is_empty());
        r.print(false);
    }

    #[test]
    fn hangul_takes_two_cells() {
        assert_eq!(display_width("가"), 2);
        assert_eq!(display_width("ok"), 2);
        assert_eq!(display_width("ㄱ"), 2);
        assert_eq!(display_width("자료 검사"), 9);
        assert_eq!(display_width(&pad("가", 6)), 6);
        assert_eq!(display_width(&pad_align("7", 3, true)), 3);
    }

    fn sample_report() -> Report {
        let mut r = Report::default();
        r.add(parse_line(&line("ok", "엔진", "모음 전이표 전수", "가")).unwrap());
        r.add(parse_line(&line("ok", "엔진", "ㄱ + 모음 21자", "나")).unwrap());
        r.add(parse_line(&line("ok", "화면", "테마", "라")).unwrap());
        r
    }

    #[test]
    fn render_has_summary() {
        let text = sample_report().render(false, false);
        assert!(text.contains("Summary"), "{text}");
        assert!(text.contains("전체 시험 항목"), "{text}");
        assert!(text.contains("통과"), "{text}");
        assert!(text.contains("실패"), "{text}");
        assert!(text.contains("결과"), "{text}");
        assert!(text.contains("PASS"), "{text}");
        assert!(text.contains("3개 항목 모두 통과"), "{text}");
    }

    #[test]
    fn columns_line_up_vertically() {
        // 한글 폭이 다른 구역 이름이어도 '/' 가 같은 칸에 서야 한다.
        let text = sample_report().render(false, false);
        let slashes: Vec<usize> = text
            .lines()
            .filter(|l| l.contains('/') && (l.contains("ok") || l.contains("묶음 합계")))
            .map(|l| display_width(l.split_once('/').unwrap().0))
            .collect();
        assert!(
            slashes.len() >= 4,
            "숫자 줄이 모자란다: {slashes:?}\n{text}"
        );
        assert!(
            slashes.windows(2).all(|w| w[0] == w[1]),
            "숫자 열이 세로로 어긋난다: {slashes:?}\n{text}"
        );
    }

    #[test]
    fn write_report_keeps_the_summary() {
        // 한 덩어리로 보내면 Windows 콘솔이 뒤를 자를 수 있다.
        // 줄마다 보내도 Summary 가 그대로 남는지 본다.
        let text = sample_report().render(false, false);
        let mut buf = Vec::new();
        write_report(&text, &mut buf).unwrap();
        let out = String::from_utf8(buf).unwrap();
        assert_eq!(out, text);
        assert!(out.contains("Summary"), "{out}");
        assert!(out.contains("전체 시험 항목"), "{out}");
        assert!(out.contains("결과"), "{out}");
    }

    #[test]
    fn failed_report_shows_fail_summary() {
        let mut r = Report::default();
        r.add(parse_line(&line("ok", "엔진", "모음", "가")).unwrap());
        r.add(parse_line(&line("FAIL", "엔진", "자음", "다")).unwrap());
        let text = r.render(false, false);
        assert!(text.contains("FAIL"), "{text}");
        assert!(text.contains("틀린 항목 1"), "{text}");
        assert!(text.contains("2개 중 1개 실패"), "{text}");
    }
}
