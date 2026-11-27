//! Writing tools (iA Writer / Ulysses / Bear style): statistics (words, characters, sentences, paragraphs,
//! reading and speaking time, goal progress) and a style check in Korean and English — filler words,
//! redundant phrases, clichés, weak hedges, very long sentences, doubled words, double spaces, passive voice
//! (English) — plus iA Writer's "syntax highlight" kinds for English (adverbs, conjunctions).
use crate::scan::{classify, utf16_col, LineKind};
use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub words: usize,
    pub chars: usize,
    pub chars_no_spaces: usize,
    pub sentences: usize,
    pub paragraphs: usize,
    pub lines: usize,
    pub headings: usize,
    pub links: usize,
    pub tasks: usize,
    pub tasks_done: usize,
    /// Minutes at 230 words (English) / 500 Korean characters per minute.
    pub reading_minutes: f64,
    pub speaking_minutes: f64,
    pub longest_sentence_words: usize,
    pub average_sentence_words: f64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub line: usize,
    pub col: usize,
    pub len: usize,
    /// filler | redundancy | cliche | hedge | long-sentence | repeated-word | double-space | passive
    pub kind: &'static str,
    pub text: String,
    pub suggestion: String,
}

const EN_FILLER: &[&str] = &["very", "really", "just", "actually", "basically", "literally", "totally", "quite", "rather", "somewhat", "simply", "definitely", "certainly", "probably", "obviously", "clearly", "honestly", "kind of", "sort of", "a bit", "a little", "in order to"];
const EN_REDUNDANT: &[(&str, &str)] = &[("absolutely essential", "essential"), ("advance planning", "planning"), ("added bonus", "bonus"), ("basic fundamentals", "fundamentals"), ("close proximity", "proximity"), ("completely finished", "finished"), ("each and every", "each"), ("end result", "result"), ("final outcome", "outcome"), ("free gift", "gift"), ("future plans", "plans"), ("past history", "history"), ("personal opinion", "opinion"), ("repeat again", "repeat"), ("revert back", "revert"), ("unexpected surprise", "surprise"), ("whether or not", "whether"), ("at this point in time", "now"), ("due to the fact that", "because"), ("in spite of the fact that", "although"), ("for the purpose of", "to"), ("in the event that", "if"), ("on a daily basis", "daily"), ("a large number of", "many"), ("the majority of", "most")];
const EN_CLICHE: &[&str] = &["at the end of the day", "think outside the box", "low-hanging fruit", "game changer", "move the needle", "circle back", "touch base", "best of both worlds", "in a nutshell", "only time will tell", "the bottom line", "needle in a haystack", "avoid like the plague", "last but not least", "few and far between", "level playing field", "paradigm shift", "synergy"];
const EN_HEDGE: &[&str] = &["i think", "i believe", "i feel", "it seems", "maybe", "perhaps", "might be", "could be", "in my opinion", "it appears"];
const EN_CONJ: &[&str] = &["and", "but", "or", "nor", "so", "yet", "because", "although", "though", "while", "whereas", "unless", "since", "if"];
const KO_FILLER: &[&str] = &["정말", "진짜", "너무", "매우", "아주", "굉장히", "엄청", "되게", "그냥", "사실", "솔직히", "약간", "좀", "일단", "아무튼", "어쨌든", "뭐랄까"];
const KO_REDUNDANT: &[(&str, &str)] = &[("미리 예약", "예약"), ("다시 재발", "재발"), ("과반수 이상", "과반수"), ("남은 여생", "여생"), ("함께 동행", "동행"), ("가장 최선", "최선"), ("가까운 측근", "측근"), ("미리 예습", "예습"), ("서로 상의", "상의"), ("이미 기존", "기존"), ("다시 반복", "반복"), ("새로 신설", "신설"), ("간단히 요약", "요약"), ("둘로 양분", "양분"), ("돌이켜 회고", "회고"), ("떨어지는 낙엽", "낙엽"), ("결론적으로 말하자면", "결론적으로"), ("~하는 것이 가능하다", "~할 수 있다"), ("에 있어서", "에서"), ("것으로 보여진다", "것으로 보인다")];
const KO_HEDGE: &[&str] = &["것 같다", "것 같습니다", "듯하다", "듯합니다", "생각된다", "생각됩니다", "아닐까", "인 것 같", "할 수도 있"];

fn word_re() -> &'static Regex { static R: OnceLock<Regex> = OnceLock::new(); R.get_or_init(|| Regex::new(r"[\p{L}\p{N}][\p{L}\p{N}'’_-]*").unwrap()) }
fn sentence_end() -> &'static Regex { static R: OnceLock<Regex> = OnceLock::new(); R.get_or_init(|| Regex::new(r"[.!?。！？]+(\s|$)|다\.\s?|요\.\s?").unwrap()) }
fn passive_re() -> &'static Regex { static R: OnceLock<Regex> = OnceLock::new(); R.get_or_init(|| Regex::new(r"(?i)\b(am|is|are|was|were|be|been|being)\s+(\w+ed|written|done|made|given|taken|seen|known|shown|found|built|told|sent|held|kept|left|lost|paid|set)\b").unwrap()) }

/// Lines that are prose (not code, math, comments, front matter, tables).
fn prose(text: &str) -> Vec<(usize, String)> {
    let lines: Vec<&str> = text.lines().collect();
    classify(&lines).into_iter().enumerate().filter(|(i, (k, _))| *k == LineKind::Text && !lines[*i].trim_start().starts_with('|')).map(|(i, (_, clean))| (i, clean)).collect()
}

pub fn stats(text: &str) -> Stats {
    let meta = crate::note::parse_note(text);
    let body = prose(text);
    let joined: String = body.iter().map(|(_, l)| l.as_str()).collect::<Vec<_>>().join("\n");
    let mut s = Stats { words: meta.words, chars: meta.chars, lines: meta.lines, headings: meta.headings.len(), links: meta.links.len(), tasks: meta.tasks.len(), tasks_done: meta.tasks.iter().filter(|t| t.status != " ").count(), ..Default::default() };
    s.chars_no_spaces = crate::note::body_of(text).chars().filter(|c| !c.is_whitespace()).count();
    s.paragraphs = joined.split("\n\n").filter(|p| !p.trim().is_empty()).count();
    let sentences: Vec<&str> = sentence_end().split(&joined).filter(|x| !x.trim().is_empty()).collect();
    s.sentences = sentences.len();
    let lens: Vec<usize> = sentences.iter().map(|x| crate::note::count_words(x)).collect();
    s.longest_sentence_words = lens.iter().copied().max().unwrap_or(0);
    s.average_sentence_words = if lens.is_empty() { 0.0 } else { lens.iter().sum::<usize>() as f64 / lens.len() as f64 };
    let hangul = joined.chars().filter(|c| ('\u{ac00}'..='\u{d7af}').contains(c)).count();
    let latin_words = s.words.saturating_sub(joined.split_whitespace().filter(|w| w.chars().any(|c| ('\u{ac00}'..='\u{d7af}').contains(&c))).count());
    s.reading_minutes = latin_words as f64 / 230.0 + hangul as f64 / 500.0;
    s.speaking_minutes = latin_words as f64 / 150.0 + hangul as f64 / 300.0;
    s
}

fn find_phrases(line: &str, lower: &str, n: usize, list: &[&str], kind: &'static str, out: &mut Vec<Issue>, word_bound: bool) {
    for p in list {
        let mut from = 0;
        while let Some(at) = lower[from..].find(p) {
            let start = from + at;
            let end = start + p.len();
            let ok = !word_bound || ((start == 0 || !lower[..start].chars().last().map(|c| c.is_alphanumeric()).unwrap_or(false)) && (end >= lower.len() || !lower[end..].chars().next().map(|c| c.is_alphanumeric()).unwrap_or(false)));
            if ok && line.is_char_boundary(start) && line.is_char_boundary(end) {
                out.push(Issue { line: n, col: utf16_col(line, start), len: line[start..end].encode_utf16().count(), kind, text: line[start..end].to_string(), suggestion: String::new() });
            }
            from = end;
        }
    }
}

/// The style check. `lang`: "ko" | "en" | "auto" (both lists).
pub fn check(text: &str, lang: &str, long_sentence: usize) -> Vec<Issue> {
    let mut out = vec![];
    let en = lang != "ko";
    let ko = lang != "en";
    for (n, line) in prose(text) {
        let lower = line.to_lowercase();
        if lower.len() != line.len() { continue; }
        if en {
            find_phrases(&line, &lower, n, EN_FILLER, "filler", &mut out, true);
            find_phrases(&line, &lower, n, EN_CLICHE, "cliche", &mut out, true);
            find_phrases(&line, &lower, n, EN_HEDGE, "hedge", &mut out, true);
            for (p, s) in EN_REDUNDANT { let before = out.len(); find_phrases(&line, &lower, n, &[p], "redundancy", &mut out, true); for i in &mut out[before..] { i.suggestion = s.to_string(); } }
            for m in passive_re().find_iter(&line) { out.push(Issue { line: n, col: utf16_col(&line, m.start()), len: m.as_str().encode_utf16().count(), kind: "passive", text: m.as_str().to_string(), suggestion: String::new() }); }
        }
        if ko {
            find_phrases(&line, &lower, n, KO_FILLER, "filler", &mut out, true);
            find_phrases(&line, &lower, n, KO_HEDGE, "hedge", &mut out, false);
            for (p, s) in KO_REDUNDANT { let before = out.len(); find_phrases(&line, &lower, n, &[p], "redundancy", &mut out, false); for i in &mut out[before..] { i.suggestion = s.to_string(); } }
        }
        // the the / 그 그
        let words: Vec<regex::Match> = word_re().find_iter(&line).collect();
        for w in words.windows(2) {
            if w[0].as_str().to_lowercase() == w[1].as_str().to_lowercase() && line[w[0].end()..w[1].start()].trim().is_empty() && !w[0].as_str().chars().all(|c| c.is_numeric()) {
                out.push(Issue { line: n, col: utf16_col(&line, w[0].start()), len: line[w[0].start()..w[1].end()].encode_utf16().count(), kind: "repeated-word", text: line[w[0].start()..w[1].end()].to_string(), suggestion: w[0].as_str().to_string() });
            }
        }
        let trimmed_start = line.len() - line.trim_start().len();
        let mut from = trimmed_start;
        while let Some(at) = line[from..].find("  ") {
            let start = from + at;
            if line[start..].trim().is_empty() { break; }
            out.push(Issue { line: n, col: utf16_col(&line, start), len: 2, kind: "double-space", text: "  ".into(), suggestion: " ".into() });
            from = start + 2;
        }
        // Very long sentences (in words).
        let mut start = 0;
        for m in sentence_end().find_iter(&line).map(|m| m.end()).chain(std::iter::once(line.len())) {
            if m <= start { continue; }
            let sentence = &line[start..m];
            if crate::note::count_words(sentence) > long_sentence && long_sentence > 0 {
                let lead = sentence.len() - sentence.trim_start().len();
                out.push(Issue { line: n, col: utf16_col(&line, start + lead), len: sentence.trim().encode_utf16().count(), kind: "long-sentence", text: sentence.trim().chars().take(60).collect(), suggestion: String::new() });
            }
            start = m;
        }
    }
    out.sort_by(|a, b| a.line.cmp(&b.line).then(a.col.cmp(&b.col)));
    out
}

#[derive(Serialize, Debug, Clone)]
pub struct Span { pub line: usize, pub col: usize, pub len: usize, pub kind: &'static str }

/// iA Writer's syntax highlight (English): adverbs (-ly words) and conjunctions.
pub fn parts_of_speech(text: &str) -> Vec<Span> {
    let mut out = vec![];
    for (n, line) in prose(text) {
        for w in word_re().find_iter(&line) {
            let lw = w.as_str().to_lowercase();
            let kind = if EN_CONJ.contains(&lw.as_str()) { "conjunction" } else if lw.len() > 4 && lw.ends_with("ly") && !["only", "family", "reply", "supply", "apply", "early", "holy", "july", "italy", "fly"].contains(&lw.as_str()) { "adverb" } else { continue };
            out.push(Span { line: n, col: utf16_col(&line, w.start()), len: w.as_str().encode_utf16().count(), kind });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checks() {
        let t = "# T\nThis is really the the end result.  It was written quickly.\n\n그냥 미리 예약했던 것 같다.\n```\nreally\n```";
        let i = check(t, "auto", 40);
        let kinds: Vec<&str> = i.iter().map(|x| x.kind).collect();
        for k in ["filler", "repeated-word", "redundancy", "double-space", "passive", "hedge"] { assert!(kinds.contains(&k), "{k} in {kinds:?}"); }
        assert!(!i.iter().any(|x| x.line == 5));
        let s = stats(t);
        assert!(s.words > 10 && s.sentences >= 3 && s.reading_minutes > 0.0);
        let p = parts_of_speech("He quickly ran and she slowly walked.");
        assert_eq!(p.iter().filter(|x| x.kind == "adverb").count(), 2);
    }
}
