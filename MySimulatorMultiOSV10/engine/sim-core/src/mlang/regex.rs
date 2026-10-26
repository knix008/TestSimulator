//! Regular expressions for regexp, regexpi and regexprep: a backtracking
//! matcher with MATLAB's (PCRE-like) syntax — literals and escapes, `.`,
//! classes `[a-z]` `[^…]` `\d \w \s` (and negations), anchors `^ $ \< \> \b`,
//! groups `( )` `(?: )` `(?<name> )`, alternation, quantifiers `* + ? {m,n}`
//! (lazy `?`, possessive `+`), backreferences `\1` `\k<name>`, lookaround
//! `(?= )` `(?! )` `(?<= )` `(?<! )`, inline `(?i)` / `(?-i)` and `(?# )`.

#[derive(Clone, Debug)]
enum Item {
    Char(char),
    Range(char, char),
    Digit(bool),
    Word(bool),
    Space(bool),
}

#[derive(Clone, Debug)]
enum Node {
    Empty,
    Char(char),
    Any,
    Class(Vec<Item>, bool),
    Start,
    End,
    WordBoundary(bool),
    WordStart,
    WordEnd,
    Seq(Vec<Node>),
    Alt(Vec<Node>),
    Group(Box<Node>, Option<usize>),
    Repeat(Box<Node>, usize, usize, u8), // 0 greedy, 1 lazy, 2 possessive
    Backref(usize),
    Look(Box<Node>, bool, bool), // ahead, negate
}

pub struct Regex {
    root: Node,
    pub groups: usize,
    pub names: Vec<(String, usize)>,
    ci: bool,
    line_anchors: bool,
    dot_all: bool,
}

struct Parser<'a> {
    c: &'a [char],
    p: usize,
    groups: usize,
    names: Vec<(String, usize)>,
    ci: bool,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<char> {
        self.c.get(self.p).copied()
    }

    fn alt(&mut self) -> Result<Node, String> {
        let mut alts = vec![self.seq()?];
        while self.peek() == Some('|') {
            self.p += 1;
            alts.push(self.seq()?);
        }
        Ok(if alts.len() == 1 { alts.pop().unwrap() } else { Node::Alt(alts) })
    }

    fn seq(&mut self) -> Result<Node, String> {
        let mut items = Vec::new();
        while let Some(c) = self.peek() {
            if c == '|' || c == ')' {
                break;
            }
            let atom = self.atom()?;
            let atom = self.quant(atom)?;
            items.push(atom);
        }
        Ok(if items.len() == 1 { items.pop().unwrap() } else { Node::Seq(items) })
    }

    fn number(&mut self) -> Option<usize> {
        let s = self.p;
        while self.peek().is_some_and(|c| c.is_ascii_digit()) {
            self.p += 1;
        }
        if self.p == s {
            None
        } else {
            self.c[s..self.p].iter().collect::<String>().parse().ok()
        }
    }

    fn quant(&mut self, atom: Node) -> Result<Node, String> {
        let (min, max) = match self.peek() {
            Some('*') => {
                self.p += 1;
                (0, usize::MAX)
            }
            Some('+') => {
                self.p += 1;
                (1, usize::MAX)
            }
            Some('?') => {
                self.p += 1;
                (0, 1)
            }
            Some('{') => {
                let save = self.p;
                self.p += 1;
                let Some(m) = self.number() else {
                    self.p = save;
                    return Ok(atom);
                };
                let n = if self.peek() == Some(',') {
                    self.p += 1;
                    self.number().unwrap_or(usize::MAX)
                } else {
                    m
                };
                if self.peek() != Some('}') {
                    self.p = save;
                    return Ok(atom);
                }
                self.p += 1;
                (m, n)
            }
            _ => return Ok(atom),
        };
        let mode = match self.peek() {
            Some('?') => {
                self.p += 1;
                1
            }
            Some('+') => {
                self.p += 1;
                2
            }
            _ => 0,
        };
        if matches!(atom, Node::Start | Node::End | Node::Empty) {
            return Err("nothing to repeat".into());
        }
        Ok(Node::Repeat(Box::new(atom), min, max, mode))
    }

    fn escape(&mut self, in_class: bool) -> Result<Item, String> {
        let c = self.peek().ok_or("the expression ends with \\")?;
        self.p += 1;
        Ok(match c {
            'd' => Item::Digit(true),
            'D' => Item::Digit(false),
            'w' => Item::Word(true),
            'W' => Item::Word(false),
            's' => Item::Space(true),
            'S' => Item::Space(false),
            'n' => Item::Char('\n'),
            't' => Item::Char('\t'),
            'r' => Item::Char('\r'),
            'f' => Item::Char('\x0c'),
            'v' => Item::Char('\x0b'),
            'a' => Item::Char('\x07'),
            'e' => Item::Char('\x1b'),
            'x' => {
                let braced = self.peek() == Some('{');
                if braced {
                    self.p += 1;
                }
                let s = self.p;
                while self.peek().is_some_and(|c| c.is_ascii_hexdigit()) && (braced || self.p - s < 2) {
                    self.p += 1;
                }
                let hex: String = self.c[s..self.p].iter().collect();
                if braced && self.peek() == Some('}') {
                    self.p += 1;
                }
                Item::Char(char::from_u32(u32::from_str_radix(&hex, 16).map_err(|_| format!("bad \\x{hex}"))?).unwrap_or('?'))
            }
            other => {
                let _ = in_class;
                Item::Char(other)
            }
        })
    }

    fn class(&mut self) -> Result<Node, String> {
        let negate = self.peek() == Some('^');
        if negate {
            self.p += 1;
        }
        let mut items = Vec::new();
        let mut first = true;
        loop {
            let c = self.peek().ok_or("a [ is not closed")?;
            if c == ']' && !first {
                self.p += 1;
                break;
            }
            first = false;
            self.p += 1;
            let item = if c == '\\' { self.escape(true)? } else { Item::Char(c) };
            if let Item::Char(lo) = item {
                if self.peek() == Some('-') && self.c.get(self.p + 1).is_some_and(|d| *d != ']') {
                    self.p += 1;
                    let hc = self.peek().unwrap();
                    self.p += 1;
                    let hi = if hc == '\\' {
                        match self.escape(true)? {
                            Item::Char(h) => h,
                            _ => return Err("a class range ends with a class".into()),
                        }
                    } else {
                        hc
                    };
                    items.push(Item::Range(lo, hi));
                    continue;
                }
            }
            items.push(item);
        }
        Ok(Node::Class(items, negate))
    }

    fn atom(&mut self) -> Result<Node, String> {
        let c = self.peek().unwrap();
        self.p += 1;
        Ok(match c {
            '.' => Node::Any,
            '^' => Node::Start,
            '$' => Node::End,
            '[' => self.class()?,
            '(' => {
                if self.peek() == Some('?') {
                    self.p += 1;
                    match self.peek() {
                        Some(':') => {
                            self.p += 1;
                            let inner = self.alt()?;
                            self.close()?;
                            Node::Group(Box::new(inner), None)
                        }
                        Some('=') | Some('!') => {
                            let neg = self.peek() == Some('!');
                            self.p += 1;
                            let inner = self.alt()?;
                            self.close()?;
                            Node::Look(Box::new(inner), true, neg)
                        }
                        Some('#') => {
                            while self.peek().is_some_and(|c| c != ')') {
                                self.p += 1;
                            }
                            self.close()?;
                            Node::Empty
                        }
                        Some('<') if matches!(self.c.get(self.p + 1), Some('=') | Some('!')) => {
                            let neg = self.c[self.p + 1] == '!';
                            self.p += 2;
                            let inner = self.alt()?;
                            self.close()?;
                            Node::Look(Box::new(inner), false, neg)
                        }
                        Some('<') | Some('P') => {
                            if self.peek() == Some('P') {
                                self.p += 1;
                            }
                            self.p += 1;
                            let s = self.p;
                            while self.peek().is_some_and(|c| c != '>') {
                                self.p += 1;
                            }
                            let name: String = self.c[s..self.p].iter().collect();
                            self.p += 1;
                            self.groups += 1;
                            let idx = self.groups;
                            self.names.push((name, idx));
                            let inner = self.alt()?;
                            self.close()?;
                            Node::Group(Box::new(inner), Some(idx))
                        }
                        Some('i') | Some('-') => {
                            let on = self.peek() == Some('i');
                            while self.peek().is_some_and(|c| c != ')') {
                                self.p += 1;
                            }
                            self.close()?;
                            self.ci = on;
                            Node::Empty
                        }
                        _ => return Err("unknown (? group".into()),
                    }
                } else {
                    self.groups += 1;
                    let idx = self.groups;
                    let inner = self.alt()?;
                    self.close()?;
                    Node::Group(Box::new(inner), Some(idx))
                }
            }
            ')' => return Err("unbalanced )".into()),
            '\\' => match self.peek() {
                Some('b') => {
                    self.p += 1;
                    Node::WordBoundary(true)
                }
                Some('B') => {
                    self.p += 1;
                    Node::WordBoundary(false)
                }
                Some('<') => {
                    self.p += 1;
                    Node::WordStart
                }
                Some('>') => {
                    self.p += 1;
                    Node::WordEnd
                }
                Some(d) if d.is_ascii_digit() && d != '0' => {
                    let n = self.number().unwrap_or(0);
                    Node::Backref(n)
                }
                Some('k') if self.c.get(self.p + 1) == Some(&'<') => {
                    self.p += 2;
                    let s = self.p;
                    while self.peek().is_some_and(|c| c != '>') {
                        self.p += 1;
                    }
                    let name: String = self.c[s..self.p].iter().collect();
                    self.p += 1;
                    let idx = self.names.iter().find(|n| n.0 == name).map(|n| n.1).ok_or_else(|| format!("no group named {name}"))?;
                    Node::Backref(idx)
                }
                _ => match self.escape(false)? {
                    Item::Char(ch) => Node::Char(ch),
                    other => Node::Class(vec![other], false),
                },
            },
            other => Node::Char(other),
        })
    }

    fn close(&mut self) -> Result<(), String> {
        if self.peek() == Some(')') {
            self.p += 1;
            Ok(())
        } else {
            Err("a ( is not closed".into())
        }
    }
}

type Caps = Vec<Option<(usize, usize)>>;

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

impl Regex {
    pub fn new(pattern: &str, ignore_case: bool) -> Result<Regex, String> {
        let chars: Vec<char> = pattern.chars().collect();
        let mut p = Parser { c: &chars, p: 0, groups: 0, names: Vec::new(), ci: ignore_case };
        let root = p.alt()?;
        if p.p < chars.len() {
            return Err("unbalanced )".into());
        }
        Ok(Regex { root, groups: p.groups, names: p.names, ci: p.ci, line_anchors: false, dot_all: true })
    }

    pub fn options(mut self, line_anchors: bool, dot_all: bool) -> Self {
        self.line_anchors = line_anchors;
        self.dot_all = dot_all;
        self
    }

    fn eq(&self, a: char, b: char) -> bool {
        a == b || (self.ci && a.to_lowercase().eq(b.to_lowercase()))
    }

    fn class_has(&self, items: &[Item], c: char) -> bool {
        items.iter().any(|it| match *it {
            Item::Char(x) => self.eq(x, c),
            Item::Range(lo, hi) => (lo..=hi).contains(&c) || (self.ci && ((lo..=hi).contains(&c.to_ascii_lowercase()) || (lo..=hi).contains(&c.to_ascii_uppercase()))),
            Item::Digit(p) => c.is_ascii_digit() == p,
            Item::Word(p) => is_word(c) == p,
            Item::Space(p) => c.is_whitespace() == p,
        })
    }

    fn m(&self, n: &Node, s: &[char], pos: usize, caps: &mut Caps, depth: usize, k: &mut dyn FnMut(usize, &mut Caps) -> bool) -> bool {
        if depth > 20_000 {
            return false;
        }
        match n {
            Node::Empty => k(pos, caps),
            Node::Char(c) => pos < s.len() && self.eq(*c, s[pos]) && k(pos + 1, caps),
            Node::Any => pos < s.len() && (self.dot_all || s[pos] != '\n') && k(pos + 1, caps),
            Node::Class(items, neg) => pos < s.len() && self.class_has(items, s[pos]) != *neg && k(pos + 1, caps),
            Node::Start => (pos == 0 || (self.line_anchors && s[pos - 1] == '\n')) && k(pos, caps),
            Node::End => (pos == s.len() || (self.line_anchors && s[pos] == '\n')) && k(pos, caps),
            Node::WordBoundary(want) => {
                let a = pos > 0 && is_word(s[pos - 1]);
                let b = pos < s.len() && is_word(s[pos]);
                ((a != b) == *want) && k(pos, caps)
            }
            Node::WordStart => (pos < s.len() && is_word(s[pos]) && (pos == 0 || !is_word(s[pos - 1]))) && k(pos, caps),
            Node::WordEnd => (pos > 0 && is_word(s[pos - 1]) && (pos == s.len() || !is_word(s[pos]))) && k(pos, caps),
            Node::Seq(items) => self.seq(items, 0, s, pos, caps, depth, k),
            Node::Alt(alts) => alts.iter().any(|a| self.m(a, s, pos, caps, depth + 1, k)),
            Node::Group(inner, idx) => match idx {
                None => self.m(inner, s, pos, caps, depth + 1, k),
                Some(i) => {
                    let i = *i;
                    self.m(inner, s, pos, caps, depth + 1, &mut |p, caps| {
                        let old = caps[i];
                        caps[i] = Some((pos, p));
                        if k(p, caps) {
                            true
                        } else {
                            caps[i] = old;
                            false
                        }
                    })
                }
            },
            Node::Repeat(inner, min, max, mode) => {
                if *mode == 2 {
                    // Possessive: as many as possible, no giving back.
                    let mut p = pos;
                    let mut count = 0;
                    while count < *max {
                        let mut next = None;
                        if !self.m(inner, s, p, caps, depth + 1, &mut |q, _| {
                            next = Some(q);
                            true
                        }) {
                            break;
                        }
                        let q = next.unwrap();
                        if q == p {
                            break;
                        }
                        p = q;
                        count += 1;
                    }
                    return count >= *min && k(p, caps);
                }
                self.rep(inner, *min, *max, *mode == 1, 0, s, pos, caps, depth, k)
            }
            Node::Backref(i) => match caps.get(*i).copied().flatten() {
                Some((a, b)) => {
                    let len = b - a;
                    pos + len <= s.len() && (0..len).all(|j| self.eq(s[a + j], s[pos + j])) && k(pos + len, caps)
                }
                None => k(pos, caps),
            },
            Node::Look(inner, ahead, neg) => {
                let found = if *ahead {
                    let mut c2 = caps.clone();
                    self.m(inner, s, pos, &mut c2, depth + 1, &mut |_, _| true)
                } else {
                    (0..=pos).rev().any(|start| {
                        let mut c2 = caps.clone();
                        self.m(inner, s, start, &mut c2, depth + 1, &mut |q, _| q == pos)
                    })
                };
                (found != *neg) && k(pos, caps)
            }
        }
    }

    fn seq(&self, items: &[Node], i: usize, s: &[char], pos: usize, caps: &mut Caps, depth: usize, k: &mut dyn FnMut(usize, &mut Caps) -> bool) -> bool {
        if i == items.len() {
            return k(pos, caps);
        }
        self.m(&items[i], s, pos, caps, depth + 1, &mut |p, caps| self.seq(items, i + 1, s, p, caps, depth + 1, k))
    }

    #[allow(clippy::too_many_arguments)]
    fn rep(&self, inner: &Node, min: usize, max: usize, lazy: bool, count: usize, s: &[char], pos: usize, caps: &mut Caps, depth: usize, k: &mut dyn FnMut(usize, &mut Caps) -> bool) -> bool {
        if lazy && count >= min && k(pos, caps) {
            return true;
        }
        if count < max {
            let more = self.m(inner, s, pos, caps, depth + 1, &mut |p, caps| {
                // An empty iteration past the minimum would loop forever.
                if p == pos && count >= min {
                    return false;
                }
                self.rep(inner, min, max, lazy, count + 1, s, p, caps, depth + 1, k)
            });
            if more {
                return true;
            }
        }
        !lazy && count >= min && k(pos, caps)
    }

    /// The first match at or after `from`: (start, end, group spans).
    pub fn find_at(&self, s: &[char], from: usize) -> Option<(usize, usize, Caps)> {
        for start in from..=s.len() {
            let mut caps: Caps = vec![None; self.groups + 1];
            let mut end = None;
            let mut found: Caps = Vec::new();
            if self.m(&self.root, s, start, &mut caps, 0, &mut |p, c| {
                end = Some(p);
                found = c.clone();
                true
            }) {
                return Some((start, end.unwrap(), found));
            }
        }
        None
    }

    /// Every non-overlapping match.
    pub fn find_all(&self, s: &[char], once: bool) -> Vec<(usize, usize, Caps)> {
        let mut out = Vec::new();
        let mut from = 0;
        while from <= s.len() {
            let Some((a, b, caps)) = self.find_at(s, from) else { break };
            out.push((a, b, caps));
            if once {
                break;
            }
            from = if b == a { b + 1 } else { b };
        }
        out
    }
}

/// regexprep's replacement text: $0 … $N, ${name}, \n \t and \$.
pub fn expand(rep: &str, s: &[char], m: &(usize, usize, Caps), re: &Regex) -> String {
    let r: Vec<char> = rep.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    let text = |span: Option<(usize, usize)>| span.map(|(a, b)| s[a..b].iter().collect::<String>()).unwrap_or_default();
    while i < r.len() {
        match r[i] {
            '$' if r.get(i + 1).is_some_and(|c| c.is_ascii_digit()) => {
                let mut j = i + 1;
                while j < r.len() && r[j].is_ascii_digit() {
                    j += 1;
                }
                let n: usize = r[i + 1..j].iter().collect::<String>().parse().unwrap_or(0);
                out.push_str(&if n == 0 { s[m.0..m.1].iter().collect() } else { text(m.2.get(n).copied().flatten()) });
                i = j;
            }
            '$' if r.get(i + 1) == Some(&'{') => {
                let j = (i + 2..r.len()).find(|&j| r[j] == '}').unwrap_or(r.len());
                let name: String = r[i + 2..j].iter().collect();
                if let Some((_, idx)) = re.names.iter().find(|n| n.0 == name) {
                    out.push_str(&text(m.2.get(*idx).copied().flatten()));
                }
                i = j + 1;
            }
            '\\' if i + 1 < r.len() => {
                out.push(match r[i + 1] {
                    'n' => '\n',
                    't' => '\t',
                    'r' => '\r',
                    other => other,
                });
                i += 2;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all(p: &str, s: &str) -> Vec<String> {
        let re = Regex::new(p, false).unwrap();
        let c: Vec<char> = s.chars().collect();
        re.find_all(&c, false).iter().map(|m| c[m.0..m.1].iter().collect()).collect()
    }

    #[test]
    fn matches_like_pcre() {
        assert_eq!(all(r"\d+", "a12b345c"), vec!["12", "345"]);
        assert_eq!(all(r"[A-Z][a-z]*", "Hello World foo Bar"), vec!["Hello", "World", "Bar"]);
        assert_eq!(all(r"a.*?b", "aXbaYYb"), vec!["aXb", "aYYb"]);
        assert_eq!(all(r"a.*b", "aXbaYYb"), vec!["aXbaYYb"]);
        assert_eq!(all(r"(\w)\1", "aabbcd"), vec!["aa", "bb"]);
        assert_eq!(all(r"\bcat\b", "cat concat cat."), vec!["cat", "cat"]);
        assert_eq!(all(r"\d+(?= kg)", "5 kg 7 lb 9 kg"), vec!["5", "9"]);
        assert_eq!(all(r"(?<=\$)\d+", "cost $40 and 50"), vec!["40"]);
        assert_eq!(all(r"colou?r|grey|gray", "color colour gray"), vec!["color", "colour", "gray"]);
        assert_eq!(all(r"x{2,3}", "x xx xxxx"), vec!["xx", "xxx"]);
        assert_eq!(all(r"^\s*$", "   "), vec!["   "]);
        assert_eq!(all(r"[^,]+", "a,b,,c"), vec!["a", "b", "c"]);
        let re = Regex::new(r"(?<year>\d{4})-(?<month>\d\d)", false).unwrap();
        let s: Vec<char> = "on 2026-10-26".chars().collect();
        let m = re.find_at(&s, 0).unwrap();
        assert_eq!(expand("${month}/$1", &s, &m, &re), "10/2026");
        assert_eq!(Regex::new("abc", true).unwrap().find_at(&"xABC".chars().collect::<Vec<_>>(), 0).map(|m| m.0), Some(1));
        assert!(Regex::new("(ab", false).is_err());
    }
}
