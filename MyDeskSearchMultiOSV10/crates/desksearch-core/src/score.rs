use crate::model::FileEntry;
use crate::query::{ResolvedQuery, SearchTerm, TermKind};
use crate::text::{fold_case, like_match, wildcard_like_patterns};

pub const SCORE_EXACT: i32 = 100;
pub const SCORE_PREFIX: i32 = 80;
pub const SCORE_CONTAINS: i32 = 60;

#[derive(Clone, Debug)]
pub struct ScoredEntry {
    pub entry: FileEntry,
    pub score: i32,
}

pub fn score_query(entry: &FileEntry, query: &ResolvedQuery, case_sensitive: bool) -> i32 {
    let mut best = 0;
    for group in &query.or_groups {
        let group_score = score_and_group(entry, group, case_sensitive);
        if group_score > best {
            best = group_score;
        }
    }
    best
}

fn score_and_group(entry: &FileEntry, terms: &[SearchTerm], case_sensitive: bool) -> i32 {
    if terms.is_empty() {
        return 0;
    }
    let mut min_score = i32::MAX;
    for term in terms {
        let score = score_term(&entry.search_file_name, term, case_sensitive);
        if score == 0 {
            return 0;
        }
        min_score = min_score.min(score);
    }
    min_score
}

pub fn score_term(name: &str, term: &SearchTerm, case_sensitive: bool) -> i32 {
    if name.is_empty() {
        return 0;
    }
    match &term.kind {
        TermKind::Literal => score_literal(name, &term.normalized, case_sensitive),
        TermKind::Wildcard => score_wildcard(name, &term.text, case_sensitive),
        TermKind::Regex(regex) => score_regex(name, regex),
    }
}

pub fn score_literal(name: &str, term: &str, case_sensitive: bool) -> i32 {
    let term = term.trim();
    if term.is_empty() || name.is_empty() {
        return 0;
    }
    let name_cmp = fold_case(name, case_sensitive);
    let term_cmp = fold_case(term, case_sensitive);
    if name_cmp == term_cmp {
        SCORE_EXACT
    } else if name_cmp.starts_with(&term_cmp) {
        SCORE_PREFIX
    } else if name_cmp.contains(&term_cmp) {
        SCORE_CONTAINS
    } else {
        0
    }
}

fn score_wildcard(name: &str, pattern: &str, case_sensitive: bool) -> i32 {
    let (exact, prefix_like, contains_like) = wildcard_like_patterns(pattern);
    if let Some(exact) = exact.filter(|value| !value.is_empty()) {
        if fold_case(name, case_sensitive) == fold_case(&exact, case_sensitive) {
            return SCORE_EXACT;
        }
    }
    if like_match(name, &prefix_like, case_sensitive) {
        return SCORE_PREFIX;
    }
    if like_match(name, &contains_like, case_sensitive) {
        return SCORE_CONTAINS;
    }
    0
}

fn score_regex(name: &str, regex: &regex::Regex) -> i32 {
    let Some(found) = regex.find(name) else {
        return 0;
    };
    if found.start() == 0 && found.end() == name.len() {
        SCORE_EXACT
    } else if found.start() == 0 {
        SCORE_PREFIX
    } else {
        SCORE_CONTAINS
    }
}
