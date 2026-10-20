use unicode_normalization::UnicodeNormalization;

/// NFC so decomposed and composed filenames compare as the same name.
pub fn nfc(value: &str) -> String {
    value.nfc().collect()
}

pub fn normalize_search_term(term: &str) -> String {
    let trimmed = term.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let reduced =
        if (trimmed.contains('\\') || trimmed.contains('/')) && !contains_wildcards(trimmed) {
            file_name_segment(trimmed).unwrap_or(trimmed)
        } else {
            trimmed
        };
    nfc(reduced)
}

pub fn file_name_segment(path: &str) -> Option<&str> {
    let trimmed = path.trim().trim_end_matches(['\\', '/']);
    if trimmed.is_empty() {
        return None;
    }
    let name = trimmed
        .rsplit(['\\', '/'])
        .next()
        .filter(|segment| !segment.is_empty())?;
    Some(name)
}

pub fn contains_wildcards(pattern: &str) -> bool {
    let chars: Vec<char> = pattern.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            i += 2;
            continue;
        }
        if chars[i] == '*' || chars[i] == '?' {
            return true;
        }
        i += 1;
    }
    false
}

pub fn escape_like(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        if c == '\\' || c == '%' || c == '_' {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// `*` → `%`, `?` → `_`, `\` escapes the next character. LIKE metacharacters in literals are escaped.
pub fn wildcard_to_like(pattern: &str) -> String {
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = String::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            append_like_literal(&mut out, chars[i + 1]);
            i += 2;
            continue;
        }
        match chars[i] {
            '*' => out.push('%'),
            '?' => out.push('_'),
            other => append_like_literal(&mut out, other),
        }
        i += 1;
    }
    out
}

fn append_like_literal(out: &mut String, c: char) {
    if c == '%' || c == '_' || c == '\\' {
        out.push('\\');
    }
    out.push(c);
}

/// `(exact, prefix LIKE, contains LIKE)` matching the original wildcard score rules.
pub fn wildcard_like_patterns(pattern: &str) -> (Option<String>, String, String) {
    let trimmed = pattern.trim();
    let contains = wildcard_to_like(trimmed);
    if !contains_wildcards(trimmed) {
        let exact = normalize_search_term(trimmed);
        return (Some(exact), contains.clone(), contains);
    }

    let starts_star = trimmed.starts_with('*');
    let ends_star = trimmed.ends_with('*');
    let has_question = trimmed.contains('?');
    if ends_star && !starts_star && !has_question {
        let prefix = trimmed.trim_end_matches('*');
        if !prefix.is_empty() {
            let exact = normalize_search_term(prefix);
            let prefix_like = format!("{}%", escape_like(&exact));
            return (Some(exact), prefix_like, contains);
        }
    }
    (None, contains.clone(), contains)
}

pub fn fold_case(value: &str, case_sensitive: bool) -> String {
    if case_sensitive {
        value.to_string()
    } else {
        value.to_lowercase()
    }
}

/// SQL LIKE against the whole string. `%` is any sequence, `_` is one character, `\` escapes.
pub fn like_match(text: &str, pattern: &str, case_sensitive: bool) -> bool {
    let text: Vec<char> = fold_case(text, case_sensitive).chars().collect();
    let pattern: Vec<char> = fold_case(pattern, case_sensitive).chars().collect();
    like_match_chars(&text, &pattern)
}

fn like_match_chars(text: &[char], pattern: &[char]) -> bool {
    let mut ti = 0;
    let mut pi = 0;
    let mut star_pi: Option<usize> = None;
    let mut star_ti = 0;

    loop {
        if pi < pattern.len() && pattern[pi] == '\\' && pi + 1 < pattern.len() {
            if ti < text.len() && text[ti] == pattern[pi + 1] {
                ti += 1;
                pi += 2;
                continue;
            }
        } else if pi < pattern.len() && pattern[pi] == '%' {
            star_pi = Some(pi);
            star_ti = ti;
            pi += 1;
            continue;
        } else if pi < pattern.len()
            && ti < text.len()
            && (pattern[pi] == '_' || pattern[pi] == text[ti])
        {
            ti += 1;
            pi += 1;
            continue;
        } else if ti >= text.len() && pi >= pattern.len() {
            return true;
        } else if ti >= text.len() && pattern[pi..].iter().all(|c| *c == '%') {
            return true;
        }

        if let Some(saved) = star_pi {
            if star_ti >= text.len() {
                return false;
            }
            star_ti += 1;
            ti = star_ti;
            pi = saved + 1;
            continue;
        }
        return false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use unicode_normalization::UnicodeNormalization;

    #[test]
    fn nfc_equates_decomposed_hangul() {
        let composed = "권수호";
        let decomposed: String = composed.nfd().collect();
        assert_ne!(composed, decomposed);
        assert_eq!(nfc(composed), nfc(&decomposed));
    }

    #[test]
    fn pasted_path_reduces_to_file_name() {
        assert_eq!(
            normalize_search_term(r"C:\Users\me\report.pdf"),
            "report.pdf"
        );
        assert_eq!(normalize_search_term("/home/me/notes.txt"), "notes.txt");
        assert_eq!(normalize_search_term("*.pdf"), "*.pdf");
        assert_eq!(normalize_search_term("   "), "");
    }

    #[test]
    fn like_patterns_cover_literals_and_globs() {
        assert!(like_match("my-report.pdf", "%report%", false));
        assert!(!like_match("repo.txt", "%report%", false));
        assert!(like_match("Report.PDF", "%report%", false));
        assert!(!like_match("Report.PDF", "%report%", true));
        assert!(like_match("file1.txt", "file_.txt", false));
        assert!(!like_match("file12.txt", "file_.txt", false));
        assert!(like_match("a.pdf", "%.pdf", false));
        assert!(!like_match("a.pdf.bak", "%.pdf", false));
        assert!(like_match("100%", r"100\%", false));
        assert!(!like_match("100X", r"100\%", false));
        assert!(like_match("a*", r"a\*", false));
        assert!(!like_match("ab", r"a\*", false));
    }
}
