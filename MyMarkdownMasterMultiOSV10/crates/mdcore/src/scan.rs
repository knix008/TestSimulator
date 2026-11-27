//! Line scanning shared by the parser, the renderer's preprocessor and search: which lines are inside fenced
//! code, $$ math or %% comments, and blanking of inline code / comments so that columns stay right.
use regex::Regex;
use std::sync::OnceLock;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LineKind {
    /// Front matter (between the opening and closing ---).
    Frontmatter,
    /// A fence line (``` or ~~~) or a line inside a fenced code block.
    Code,
    /// A $$ line or a line inside a math block.
    Math,
    /// A line wholly inside a %% comment block.
    Comment,
    /// Ordinary Markdown.
    Text,
}

fn fence_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^\s{0,3}(`{3,}|~{3,})(.*)$").unwrap())
}

/// The front matter's line span: (first body line). 0 when the note has none.
pub fn frontmatter_end(lines: &[&str]) -> usize {
    if lines.first().map(|l| l.trim_end() == "---").unwrap_or(false) {
        for (i, line) in lines.iter().enumerate().skip(1) {
            let t = line.trim_end();
            if t == "---" || t == "..." {
                return i + 1;
            }
        }
    }
    0
}

/// The kind of every line, plus for Text lines the line with inline code and %% %% comments blanked
/// (same length in chars as the original).
pub fn classify(lines: &[&str]) -> Vec<(LineKind, String)> {
    let body = frontmatter_end(lines);
    let mut out = Vec::with_capacity(lines.len());
    let mut fence: Option<(char, usize)> = None;
    let mut math = false;
    let mut comment = false;
    for (i, line) in lines.iter().enumerate() {
        if i < body {
            out.push((LineKind::Frontmatter, String::new()));
            continue;
        }
        if let Some((ch, len)) = fence {
            if let Some(c) = fence_re().captures(line) {
                let mark = c.get(1).unwrap().as_str();
                if mark.starts_with(ch) && mark.chars().count() >= len && c.get(2).unwrap().as_str().trim().is_empty() {
                    fence = None;
                }
            }
            out.push((LineKind::Code, String::new()));
            continue;
        }
        if comment {
            if let Some(at) = line.find("%%") {
                comment = false;
                let rest = &line[at + 2..];
                let blanked = format!("{}{}", " ".repeat(line[..at + 2].chars().count()), rest);
                let (text, open) = blank_inline(&blanked);
                if open { comment = true; }
                out.push((LineKind::Text, text));
            } else {
                out.push((LineKind::Comment, String::new()));
            }
            continue;
        }
        if !math {
            if let Some(c) = fence_re().captures(line) {
                let mark = c.get(1).unwrap().as_str();
                fence = Some((mark.chars().next().unwrap(), mark.chars().count()));
                out.push((LineKind::Code, String::new()));
                continue;
            }
        }
        let trimmed = line.trim();
        if trimmed.starts_with("$$") {
            let single = trimmed.len() > 4 && trimmed.ends_with("$$");
            if !single { math = !math; }
            out.push((LineKind::Math, String::new()));
            continue;
        }
        if math {
            out.push((LineKind::Math, String::new()));
            continue;
        }
        let (text, open) = blank_inline(line);
        if open { comment = true; }
        out.push((LineKind::Text, text));
    }
    out
}

/// Blanks `code spans` and %% comments %% (an unclosed %% blanks to the end and reports `true`).
pub fn blank_inline(line: &str) -> (String, bool) {
    let chars: Vec<char> = line.chars().collect();
    let mut out = chars.clone();
    let mut i = 0;
    let mut open_comment = false;
    while i < chars.len() {
        if chars[i] == '`' {
            let mut n = 0;
            while i + n < chars.len() && chars[i + n] == '`' { n += 1; }
            // find the closing run of the same length
            let mut j = i + n;
            let mut found = None;
            while j < chars.len() {
                if chars[j] == '`' {
                    let mut m = 0;
                    while j + m < chars.len() && chars[j + m] == '`' { m += 1; }
                    if m == n { found = Some(j + m); break; }
                    j += m;
                } else { j += 1; }
            }
            if let Some(end) = found {
                for c in out.iter_mut().take(end).skip(i) { *c = ' '; }
                i = end;
                continue;
            }
            i += n;
            continue;
        }
        if chars[i] == '%' && i + 1 < chars.len() && chars[i + 1] == '%' {
            let mut j = i + 2;
            let mut end = None;
            while j + 1 < chars.len() {
                if chars[j] == '%' && chars[j + 1] == '%' { end = Some(j + 2); break; }
                j += 1;
            }
            match end {
                Some(e) => { for c in out.iter_mut().take(e).skip(i) { *c = ' '; } i = e; }
                None => { for c in out.iter_mut().skip(i) { *c = ' '; } open_comment = true; break; }
            }
            continue;
        }
        i += 1;
    }
    (out.into_iter().collect(), open_comment)
}

/// Char index → byte index in `s`.
pub fn byte_at(s: &str, char_index: usize) -> usize {
    s.char_indices().nth(char_index).map(|(b, _)| b).unwrap_or(s.len())
}

/// Byte index → char index (columns reported to the UI are in UTF-16 code units; see `utf16_col`).
pub fn utf16_col(s: &str, byte_index: usize) -> usize {
    s[..byte_index.min(s.len())].encode_utf16().count()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fences_and_comments() {
        let text = "---\na: 1\n---\n# H\n```js\n#nottag\n```\nx `#no` %%hidden%% #yes\n%%\nblock\n%%\n$$\nx\n$$";
        let lines: Vec<&str> = text.lines().collect();
        let k = classify(&lines);
        assert_eq!(k[0].0, LineKind::Frontmatter);
        assert_eq!(k[3].0, LineKind::Text);
        assert_eq!(k[5].0, LineKind::Code);
        assert!(k[7].1.contains("#yes") && !k[7].1.contains("#no") && !k[7].1.contains("hidden"));
        assert_eq!(k[9].0, LineKind::Comment);
        assert_eq!(k[12].0, LineKind::Math);
    }
}
