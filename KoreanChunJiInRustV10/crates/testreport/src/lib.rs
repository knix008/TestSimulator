//! 시험 결과를 모아 구역별로 정리한다.
//!
//! 모으는 일과 보여 주는 일을 여기 두고, `main.rs` 는 `cargo test` 를 돌려
//! 줄을 넘겨 주기만 한다. 그래야 보고기 자체를 시험할 수 있다.

#![forbid(unsafe_code)]

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

/// 모은 항목들이다. 나온 차례를 그대로 지킨다.
#[derive(Default, Debug)]
pub struct Report {
    cases: Vec<Case>,
}

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

    /// 구역별 집계와 요약을 찍는다.
    pub fn print(&self, verbose: bool) {
        if self.cases.is_empty() {
            return;
        }

        println!();
        println!("천지인 한글 입력기 - 시험");
        println!("{}", "=".repeat(60));

        for (group, sections) in self.groups() {
            let mut g_pass = 0usize;
            let mut g_total = 0usize;

            println!();
            println!("[ {group} ]");

            for section in &sections {
                let rows = self.in_section(&group, section);
                let pass = rows.iter().filter(|c| c.passed).count();
                g_pass += pass;
                g_total += rows.len();

                let mark = if pass == rows.len() { "ok  " } else { "FAIL" };
                println!("  {mark}  {:<28} {:>3}/{:<3}", section, pass, rows.len());

                if verbose {
                    for c in rows {
                        let m = if c.passed { "·" } else { "x" };
                        println!("          {m} {:<24} {}", c.name, c.detail);
                    }
                }
            }

            println!("        {:<28} {:>3}/{:<3}", "묶음 합계", g_pass, g_total);
        }

        // 틀린 것이 있으면 어느 구역의 어느 항목이 왜 틀렸는지 따로 모은다.
        let bad: Vec<&Case> = self.cases.iter().filter(|c| !c.passed).collect();
        if !bad.is_empty() {
            println!();
            println!("{}", "-".repeat(60));
            println!("틀린 항목 {}", bad.len());
            for c in &bad {
                println!("  {} · {} · {}", c.group, c.section, c.name);
                println!("      {}", c.detail);
            }
        }

        println!();
        println!("{}", "=".repeat(60));
        let verdict = if self.failed() == 0 {
            "모두 통과"
        } else {
            "실패"
        };
        println!(
            "{:<10} {} 항목 중 {} 통과, {} 실패",
            verdict,
            self.total(),
            self.passed(),
            self.failed()
        );
        println!();
    }
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
        r.print(false);
    }
}
