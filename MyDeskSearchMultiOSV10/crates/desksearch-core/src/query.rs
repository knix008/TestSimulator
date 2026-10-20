use std::sync::LazyLock;

use regex::Regex;

use crate::text::{contains_wildcards, nfc, normalize_search_term};

static OR_SPLIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+\+\s+").expect("or split"));
static AND_SPLIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+\*\s+").expect("and split"));

#[derive(Clone, Debug)]
pub struct SearchTerm {
    pub text: String,
    pub normalized: String,
    pub kind: TermKind,
}

#[derive(Clone, Debug)]
pub enum TermKind {
    Literal,
    Wildcard,
    Regex(Regex),
}

#[derive(Clone, Debug)]
pub struct ResolvedQuery {
    pub or_groups: Vec<Vec<SearchTerm>>,
    pub is_regex: bool,
}

impl ResolvedQuery {
    pub fn is_empty(&self) -> bool {
        self.or_groups.iter().all(|group| group.is_empty())
    }
}

/// `a * b + c` → `[["a", "b"], ["c"]]`. Operators apply only when surrounded by whitespace.
pub fn parse_or_groups(query: &str) -> Vec<Vec<String>> {
    let normalized = nfc(query.trim());
    if normalized.is_empty() {
        return Vec::new();
    }
    let mut groups = Vec::new();
    for or_part in OR_SPLIT.split(&normalized) {
        let or_part = or_part.trim();
        if or_part.is_empty() {
            continue;
        }
        let and_parts: Vec<String> = if AND_SPLIT.is_match(or_part) {
            AND_SPLIT
                .split(or_part)
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect()
        } else {
            vec![or_part.to_string()]
        };
        if !and_parts.is_empty() {
            groups.push(and_parts);
        }
    }
    groups
}

pub fn parse_query(query: &str, use_regex: bool, case_sensitive: bool) -> Option<ResolvedQuery> {
    if query.trim().is_empty() {
        return None;
    }
    let groups = parse_or_groups(query);
    if groups.is_empty() {
        return None;
    }
    let mut or_groups = Vec::with_capacity(groups.len());
    for and_parts in groups {
        let mut terms = Vec::with_capacity(and_parts.len());
        for part in and_parts {
            let normalized = normalize_search_term(&part);
            let kind = if use_regex {
                match compile_regex(&part, case_sensitive) {
                    Some(regex) => TermKind::Regex(regex),
                    None => return None,
                }
            } else if contains_wildcards(&part) {
                TermKind::Wildcard
            } else {
                TermKind::Literal
            };
            terms.push(SearchTerm {
                text: part,
                normalized,
                kind,
            });
        }
        or_groups.push(terms);
    }
    Some(ResolvedQuery {
        or_groups,
        is_regex: use_regex,
    })
}

pub fn compile_regex(pattern: &str, case_sensitive: bool) -> Option<Regex> {
    if pattern.trim().is_empty() {
        return None;
    }
    regex::RegexBuilder::new(pattern)
        .case_insensitive(!case_sensitive)
        .size_limit(1 << 20)
        .dfa_size_limit(1 << 20)
        .build()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operators_require_whitespace() {
        let groups = parse_or_groups("budget * 2024 + draft");
        assert_eq!(
            groups,
            vec![
                vec!["budget".to_string(), "2024".to_string()],
                vec!["draft".to_string()]
            ]
        );
        assert_eq!(
            parse_or_groups("foo+bar"),
            vec![vec!["foo+bar".to_string()]]
        );
        assert_eq!(parse_or_groups("tax"), vec![vec!["tax".to_string()]]);
        assert_eq!(
            parse_or_groups("*.doc + *.pdf"),
            vec![vec!["*.doc".to_string()], vec!["*.pdf".to_string()]]
        );
    }

    #[test]
    fn invalid_regex_rejects_the_whole_query() {
        assert!(parse_query("(", true, false).is_none());
        assert!(parse_query(r"\.pdf$", true, false).is_some());
        assert!(parse_query("   ", false, false).is_none());
    }

    #[test]
    fn wildcard_term_is_not_literal() {
        let query = parse_query("*.pdf", false, false).unwrap();
        assert!(matches!(query.or_groups[0][0].kind, TermKind::Wildcard));
        let literal = parse_query("report", false, false).unwrap();
        assert!(matches!(literal.or_groups[0][0].kind, TermKind::Literal));
    }
}
