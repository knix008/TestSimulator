//! YARA rules (the common subset) over a document.
//!
//! CONTRACT
//! `scan(src, {rules: "rule text", offset?, length?, limit: 10000}, progress)` →
//!   `{ matches: [{ rule, tags: [..], meta: {k: v}, strings: [{ id: "$a", offset, length, data: "hex of first 32 bytes" }] }],
//!      rules: <count compiled>, errors: [{ line, col, message }] }`
//! `check(args{rules})` → `{ rules, errors }` (compile only).
//!
//! THE SUBSET
//!   `import "pe"` lines are accepted and ignored. `private` / `global rule name : tag1 tag2 { meta: … strings: … condition: … }`.
//!   meta values: "text", numbers, true / false.
//!   strings: `$a = "text"` with nocase, wide, ascii, fullword (escapes \n \t \r \\ \" \xHH);
//!            `$b = { 4D 5A ?? 4? ?F [2] [2-4] [4-] ( 90 | 91 92 ) }`; `$c = /regex/is` (byte regex, flags i s) with nocase / wide.
//!   condition: and or not ( ), true false, numbers (12, 0x1F, 10KB, 2MB), + - * \ % & | ^ ~ << >>, == != < <= > >=,
//!     $a (found), #a (count), @a / @a[i] (offset of the i-th, 1-based), !a / !a[i] (length), $a at expr, $a in (lo..hi),
//!     #a in (lo..hi), any / all / none / N / N% of them | ($a, $b*), for <quantifier> of <set> : ( … $ … ),
//!     for any|all i in (lo..hi) : ( … i … ), filesize, entrypoint (PE / ELF entry point as a file offset, else 0),
//!     uint8 uint16 uint32 int8 int16 int32 (+ be variants) (offset), and other rules by name.
//!   Matches are searched in chunks (overlap: the longest literal string, 64 KiB for jumps and regular expressions);
//!   matches of one string do not overlap. A rule with an error is skipped; the others still run.
use crate::doc::Bytes;
use crate::util::{hex_string, range_of, Args, Progress, CANCELLED};
use regex::bytes::{Regex, RegexBuilder};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

// ───────────── tokens

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Ident(String),
    /// $name, $ (anonymous), $name* (prefix set)
    Str(String),
    Count(String),
    At(String),
    Len(String),
    Num(i64),
    Text(String),
    Hex(String),
    Regex(String, String),
    Punct(&'static str),
    Eof,
}

#[derive(Clone, Debug)]
struct Token {
    tok: Tok,
    line: usize,
    col: usize,
}

#[derive(Debug, Clone)]
pub struct YaraError {
    pub line: usize,
    pub col: usize,
    pub message: String,
}

fn err<T>(t: &Token, message: impl Into<String>) -> Result<T, YaraError> {
    Err(YaraError { line: t.line, col: t.col, message: message.into() })
}

fn lex(text: &str) -> (Vec<Token>, Vec<YaraError>) {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut errors = Vec::new();
    let (mut i, mut line, mut col) = (0usize, 1usize, 1usize);
    // After `=` in a strings section a `{` starts a hex string and a `/` a regular expression.
    let mut after_assign = false;
    macro_rules! adv {
        () => {{
            if chars[i] == '\n' {
                line += 1;
                col = 1;
            } else {
                col += 1;
            }
            i += 1;
        }};
    }
    while i < chars.len() {
        let c = chars[i];
        let (l, co) = (line, col);
        if c.is_whitespace() {
            adv!();
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                adv!();
            }
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            adv!();
            adv!();
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                adv!();
            }
            if i < chars.len() {
                adv!();
                adv!();
            }
            continue;
        }
        let push = |out: &mut Vec<Token>, tok: Tok| out.push(Token { tok, line: l, col: co });
        if after_assign && c == '{' {
            adv!();
            let mut body = String::new();
            while i < chars.len() && chars[i] != '}' {
                body.push(chars[i]);
                adv!();
            }
            if i < chars.len() {
                adv!();
            } else {
                errors.push(YaraError { line: l, col: co, message: "unterminated hex string".into() });
            }
            push(&mut out, Tok::Hex(body));
            after_assign = false;
            continue;
        }
        if after_assign && c == '/' {
            adv!();
            let mut body = String::new();
            while i < chars.len() && chars[i] != '/' {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    body.push('\\');
                    adv!();
                }
                body.push(chars[i]);
                adv!();
            }
            if i < chars.len() {
                adv!();
            } else {
                errors.push(YaraError { line: l, col: co, message: "unterminated regular expression".into() });
            }
            let mut flags = String::new();
            while i < chars.len() && (chars[i] == 'i' || chars[i] == 's') {
                flags.push(chars[i]);
                adv!();
            }
            push(&mut out, Tok::Regex(body, flags));
            after_assign = false;
            continue;
        }
        after_assign = false;
        if c == '"' {
            adv!();
            let mut s = String::new();
            while i < chars.len() && chars[i] != '"' {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    adv!();
                    match chars[i] {
                        'n' => s.push('\n'),
                        't' => s.push('\t'),
                        'r' => s.push('\r'),
                        'x' => {
                            let h: String = chars[i + 1..(i + 3).min(chars.len())].iter().collect();
                            match u8::from_str_radix(&h, 16) {
                                Ok(v) => {
                                    // Keep raw bytes: private-use characters carry them (decoded in `text_bytes`).
                                    s.push(char::from_u32(0xF0000 + v as u32).unwrap());
                                    adv!();
                                    adv!();
                                }
                                Err(_) => errors.push(YaraError { line, col, message: "bad \\x escape".into() }),
                            }
                        }
                        other => s.push(other),
                    }
                    adv!();
                    continue;
                }
                s.push(chars[i]);
                adv!();
            }
            if i < chars.len() {
                adv!();
            } else {
                errors.push(YaraError { line: l, col: co, message: "unterminated string".into() });
            }
            push(&mut out, Tok::Text(s));
            continue;
        }
        if c.is_ascii_digit() {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric()) {
                adv!();
            }
            let word: String = chars[start..i].iter().collect::<String>().to_ascii_lowercase();
            let (digits, mult) = if let Some(d) = word.strip_suffix("kb") { (d.to_string(), 1024) } else if let Some(d) = word.strip_suffix("mb") { (d.to_string(), 1 << 20) } else { (word.clone(), 1) };
            let v = if let Some(h) = digits.strip_prefix("0x") { i64::from_str_radix(h, 16) } else if let Some(o) = digits.strip_prefix("0o") { i64::from_str_radix(o, 8) } else { digits.parse() };
            match v {
                Ok(v) => push(&mut out, Tok::Num(v * mult)),
                Err(_) => errors.push(YaraError { line: l, col: co, message: format!("not a number: {word}") }),
            }
            continue;
        }
        if matches!(c, '$' | '#' | '@' | '!') && (chars.get(i + 1).is_some_and(|n| n.is_ascii_alphanumeric() || *n == '_' || *n == '*') || c == '$') {
            let kind = c;
            adv!();
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_' || chars[i] == '*') {
                adv!();
            }
            let name: String = chars[start..i].iter().collect();
            if kind == '!' && name.is_empty() {
                push(&mut out, Tok::Punct("!"));
                continue;
            }
            push(&mut out, match kind {
                '$' => Tok::Str(name),
                '#' => Tok::Count(name),
                '@' => Tok::At(name),
                _ => Tok::Len(name),
            });
            continue;
        }
        if c.is_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '.') {
                adv!();
            }
            push(&mut out, Tok::Ident(chars[start..i].iter().collect()));
            continue;
        }
        const PUNCT: &[&str] = &["..", "==", "!=", "<=", ">=", "<<", ">>", "{", "}", "(", ")", "[", "]", ":", ",", "=", "<", ">", "+", "-", "*", "\\", "%", "&", "|", "^", "~", "!"];
        let rest: String = chars[i..(i + 2).min(chars.len())].iter().collect();
        match PUNCT.iter().find(|p| rest.starts_with(**p)) {
            Some(p) => {
                for _ in 0..p.len() {
                    adv!();
                }
                if *p == "=" {
                    after_assign = true;
                }
                push(&mut out, Tok::Punct(p));
            }
            None => {
                errors.push(YaraError { line: l, col: co, message: format!("unexpected '{c}'") });
                adv!();
            }
        }
    }
    out.push(Token { tok: Tok::Eof, line, col });
    (out, errors)
}

// ───────────── rules

#[derive(Debug, Clone)]
struct StringDef {
    id: String,
    regex: Regex,
    fullword: bool,
    /// The longest match a literal can have (overlap between chunks); None: unbounded (64 KiB).
    reach: Option<usize>,
}

#[derive(Debug, Clone)]
enum Set {
    Them,
    List(Vec<String>),
}

#[derive(Debug, Clone)]
enum Quant {
    All,
    Any,
    None,
    Num(Box<Expr>),
    Percent(Box<Expr>),
}

#[derive(Debug, Clone)]
enum Expr {
    Num(i64),
    Filesize,
    Entrypoint,
    Var(String),
    Found(String),
    FoundAt(String, Box<Expr>),
    FoundIn(String, Box<Expr>, Box<Expr>),
    Count(String),
    CountIn(String, Box<Expr>, Box<Expr>),
    Offset(String, Box<Expr>),
    Length(String, Box<Expr>),
    Read(String, Box<Expr>),
    Rule(String),
    Not(Box<Expr>),
    Neg(Box<Expr>),
    BitNot(Box<Expr>),
    Bin(&'static str, Box<Expr>, Box<Expr>),
    Of(Quant, Set),
    ForOf(Quant, Set, Box<Expr>),
    ForIn(Quant, String, Box<Expr>, Box<Expr>, Box<Expr>),
}

#[derive(Debug, Clone)]
struct Rule {
    name: String,
    private: bool,
    tags: Vec<String>,
    meta: Map<String, Value>,
    strings: Vec<StringDef>,
    condition: Expr,
}

struct Parser {
    toks: Vec<Token>,
    pos: usize,
    rule_names: Vec<String>,
}

impl Parser {
    fn peek(&self) -> &Token {
        &self.toks[self.pos.min(self.toks.len() - 1)]
    }
    fn next(&mut self) -> Token {
        let t = self.peek().clone();
        if self.pos < self.toks.len() - 1 {
            self.pos += 1;
        }
        t
    }
    fn is_punct(&self, p: &str) -> bool {
        matches!(&self.peek().tok, Tok::Punct(x) if *x == p)
    }
    fn is_ident(&self, word: &str) -> bool {
        matches!(&self.peek().tok, Tok::Ident(x) if x == word)
    }
    fn expect(&mut self, p: &str) -> Result<(), YaraError> {
        if self.is_punct(p) {
            self.next();
            Ok(())
        } else {
            let t = self.peek().clone();
            err(&t, format!("'{p}' expected"))
        }
    }
    fn ident(&mut self) -> Result<String, YaraError> {
        let t = self.next();
        match t.tok {
            Tok::Ident(s) => Ok(s),
            _ => err(&t, "a name is expected"),
        }
    }

    fn rule(&mut self) -> Result<Rule, YaraError> {
        let mut private = false;
        while self.is_ident("private") || self.is_ident("global") {
            if self.is_ident("private") {
                private = true;
            }
            self.next();
        }
        let t = self.next();
        if t.tok != Tok::Ident("rule".into()) {
            return err(&t, "'rule' expected");
        }
        let name = self.ident()?;
        let mut tags = Vec::new();
        if self.is_punct(":") {
            self.next();
            while let Tok::Ident(tag) = &self.peek().tok {
                tags.push(tag.clone());
                self.next();
            }
        }
        self.expect("{")?;
        let mut meta = Map::new();
        let mut strings = Vec::new();
        let mut condition = None;
        loop {
            let t = self.peek().clone();
            match &t.tok {
                Tok::Ident(s) if s == "meta" => {
                    self.next();
                    self.expect(":")?;
                    while let Tok::Ident(key) = self.peek().tok.clone() {
                        if ["strings", "condition"].contains(&key.as_str()) && matches!(self.toks.get(self.pos + 1).map(|x| &x.tok), Some(Tok::Punct(":"))) {
                            break;
                        }
                        self.next();
                        self.expect("=")?;
                        let v = self.next();
                        let value = match v.tok {
                            Tok::Text(s) => json!(s),
                            Tok::Num(n) => json!(n),
                            Tok::Punct("-") => match self.next().tok {
                                Tok::Num(n) => json!(-n),
                                _ => return err(&v, "a meta value is expected"),
                            },
                            Tok::Ident(b) if b == "true" || b == "false" => json!(b == "true"),
                            _ => return err(&v, "a meta value is expected"),
                        };
                        meta.insert(key, value);
                    }
                }
                Tok::Ident(s) if s == "strings" => {
                    self.next();
                    self.expect(":")?;
                    while let Tok::Str(id) = self.peek().tok.clone() {
                        let at = self.next();
                        self.expect("=")?;
                        let def = self.string_def(&id, &at)?;
                        if strings.iter().any(|d: &StringDef| d.id == def.id) {
                            return err(&at, format!("${id} is defined twice"));
                        }
                        strings.push(def);
                    }
                }
                Tok::Ident(s) if s == "condition" => {
                    self.next();
                    self.expect(":")?;
                    condition = Some(self.expr()?);
                }
                Tok::Punct("}") => {
                    self.next();
                    break;
                }
                _ => return err(&t, "meta:, strings:, condition: or '}' expected"),
            }
        }
        let condition = condition.ok_or(YaraError { line: t_line(&self.toks, self.pos), col: 1, message: format!("rule {name} has no condition") })?;
        Ok(Rule { name, private, tags, meta, strings, condition })
    }

    fn string_def(&mut self, id: &str, at: &Token) -> Result<StringDef, YaraError> {
        let t = self.next();
        let mut mods: Vec<String> = Vec::new();
        while let Tok::Ident(m) = &self.peek().tok {
            if !["nocase", "wide", "ascii", "fullword", "private", "xor", "base64"].contains(&m.as_str()) {
                break;
            }
            mods.push(m.clone());
            self.next();
        }
        let regex_i = matches!(&t.tok, Tok::Regex(_, f) if f.contains('i'));
        let has = |m: &str| mods.iter().any(|x| x == m);
        let (pattern, reach) = match t.tok {
            Tok::Text(s) => {
                let bytes = text_bytes(&s);
                let wide = has("wide");
                let ascii = has("ascii") || !wide;
                let lit = |b: &[u8], w: bool| b.iter().map(|&x| if w { format!("\\x{x:02X}\\x00") } else { format!("\\x{x:02X}") }).collect::<String>();
                let mut alts = Vec::new();
                if ascii {
                    alts.push(lit(&bytes, false));
                }
                if wide {
                    alts.push(lit(&bytes, true));
                }
                (format!("(?:{})", alts.join("|")), Some(bytes.len() * if wide { 2 } else { 1 }))
            }
            Tok::Hex(body) => (hex_regex(&body).map_err(|m| YaraError { line: t.line, col: t.col, message: m })?, None),
            Tok::Regex(body, flags) => (format!("(?{}:{})", if flags.contains('s') { "s" } else { "-s" }, body), None),
            _ => return err(&t, "a string, a hex string or a regular expression is expected"),
        };
        let regex = RegexBuilder::new(&pattern)
            .unicode(false)
            .case_insensitive(has("nocase") || regex_i)
            .size_limit(64 << 20)
            .build()
            .map_err(|e| YaraError { line: at.line, col: at.col, message: format!("${id}: {e}") })?;
        Ok(StringDef { id: id.to_string(), regex, fullword: has("fullword"), reach })
    }

    // condition grammar: or < and < not < relational < bitor < xor < bitand < shift < additive < multiplicative < unary
    fn expr(&mut self) -> Result<Expr, YaraError> {
        let mut left = self.and()?;
        while self.is_ident("or") {
            self.next();
            left = Expr::Bin("or", Box::new(left), Box::new(self.and()?));
        }
        Ok(left)
    }
    fn and(&mut self) -> Result<Expr, YaraError> {
        let mut left = self.not()?;
        while self.is_ident("and") {
            self.next();
            left = Expr::Bin("and", Box::new(left), Box::new(self.not()?));
        }
        Ok(left)
    }
    fn not(&mut self) -> Result<Expr, YaraError> {
        if self.is_ident("not") {
            self.next();
            return Ok(Expr::Not(Box::new(self.not()?)));
        }
        self.relational()
    }
    fn relational(&mut self) -> Result<Expr, YaraError> {
        let left = self.binary(0)?;
        for op in ["==", "!=", "<=", ">=", "<", ">"] {
            if self.is_punct(op) {
                self.next();
                let right = self.binary(0)?;
                let op: &'static str = ["==", "!=", "<=", ">=", "<", ">"].into_iter().find(|o| *o == op).unwrap();
                return Ok(Expr::Bin(op, Box::new(left), Box::new(right)));
            }
        }
        Ok(left)
    }
    fn binary(&mut self, level: usize) -> Result<Expr, YaraError> {
        const LEVELS: &[&[&str]] = &[&["|"], &["^"], &["&"], &["<<", ">>"], &["+", "-"], &["*", "\\", "%"]];
        if level == LEVELS.len() {
            return self.unary();
        }
        let mut left = self.binary(level + 1)?;
        'again: loop {
            for op in LEVELS[level] {
                if self.is_punct(op) {
                    // `N of them` is a quantifier, not a product: handled in primary.
                    self.next();
                    let right = self.binary(level + 1)?;
                    left = Expr::Bin(op, Box::new(left), Box::new(right));
                    continue 'again;
                }
            }
            return Ok(left);
        }
    }
    fn unary(&mut self) -> Result<Expr, YaraError> {
        if self.is_punct("-") {
            self.next();
            return Ok(Expr::Neg(Box::new(self.unary()?)));
        }
        if self.is_punct("~") {
            self.next();
            return Ok(Expr::BitNot(Box::new(self.unary()?)));
        }
        self.primary()
    }

    fn range(&mut self) -> Result<(Expr, Expr), YaraError> {
        self.expect("(")?;
        let lo = self.binary(0)?;
        self.expect("..")?;
        let hi = self.binary(0)?;
        self.expect(")")?;
        Ok((lo, hi))
    }

    fn set(&mut self) -> Result<Set, YaraError> {
        if self.is_ident("them") {
            self.next();
            return Ok(Set::Them);
        }
        self.expect("(")?;
        let mut list = Vec::new();
        loop {
            let t = self.next();
            match t.tok {
                Tok::Str(s) => list.push(s),
                _ => return err(&t, "a string ($name or $prefix*) is expected"),
            }
            if self.is_punct(",") {
                self.next();
                continue;
            }
            self.expect(")")?;
            return Ok(Set::List(list));
        }
    }

    fn quantifier_after(&mut self, q: Quant) -> Result<Expr, YaraError> {
        // `of` has been seen.
        let set = self.set()?;
        Ok(Expr::Of(q, set))
    }

    fn primary(&mut self) -> Result<Expr, YaraError> {
        let t = self.next();
        match t.tok.clone() {
            Tok::Num(n) => {
                if self.is_punct("%") && matches!(self.toks.get(self.pos + 1).map(|x| &x.tok), Some(Tok::Ident(w)) if w == "of") {
                    self.next();
                    self.next();
                    return self.quantifier_after(Quant::Percent(Box::new(Expr::Num(n))));
                }
                if self.is_ident("of") {
                    self.next();
                    return self.quantifier_after(Quant::Num(Box::new(Expr::Num(n))));
                }
                Ok(Expr::Num(n))
            }
            Tok::Punct("(") => {
                let e = self.expr()?;
                self.expect(")")?;
                if self.is_ident("of") {
                    self.next();
                    return self.quantifier_after(Quant::Num(Box::new(e)));
                }
                Ok(e)
            }
            Tok::Str(name) => {
                if self.is_ident("at") {
                    self.next();
                    return Ok(Expr::FoundAt(name, Box::new(self.binary(0)?)));
                }
                if self.is_ident("in") {
                    self.next();
                    let (lo, hi) = self.range()?;
                    return Ok(Expr::FoundIn(name, Box::new(lo), Box::new(hi)));
                }
                Ok(Expr::Found(name))
            }
            Tok::Count(name) => {
                if self.is_ident("in") {
                    self.next();
                    let (lo, hi) = self.range()?;
                    return Ok(Expr::CountIn(name, Box::new(lo), Box::new(hi)));
                }
                Ok(Expr::Count(name))
            }
            Tok::At(name) | Tok::Len(name) => {
                let index = if self.is_punct("[") {
                    self.next();
                    let e = self.expr()?;
                    self.expect("]")?;
                    e
                } else {
                    Expr::Num(1)
                };
                Ok(if matches!(t.tok, Tok::At(_)) { Expr::Offset(name, Box::new(index)) } else { Expr::Length(name, Box::new(index)) })
            }
            Tok::Ident(word) => match word.as_str() {
                "true" => Ok(Expr::Num(1)),
                "false" => Ok(Expr::Num(0)),
                "filesize" => Ok(Expr::Filesize),
                "entrypoint" => Ok(Expr::Entrypoint),
                "them" => err(&t, "'them' must follow 'of'"),
                "all" | "any" | "none" => {
                    let q = match word.as_str() { "all" => Quant::All, "any" => Quant::Any, _ => Quant::None };
                    if !self.is_ident("of") {
                        return err(&self.peek().clone(), "'of' expected");
                    }
                    self.next();
                    self.quantifier_after(q)
                }
                "for" => {
                    let q = if self.is_ident("all") {
                        self.next();
                        Quant::All
                    } else if self.is_ident("any") {
                        self.next();
                        Quant::Any
                    } else if self.is_ident("none") {
                        self.next();
                        Quant::None
                    } else {
                        Quant::Num(Box::new(self.binary(0)?))
                    };
                    if self.is_ident("of") {
                        self.next();
                        let set = self.set()?;
                        self.expect(":")?;
                        self.expect("(")?;
                        let body = self.expr()?;
                        self.expect(")")?;
                        return Ok(Expr::ForOf(q, set, Box::new(body)));
                    }
                    let var = self.ident()?;
                    if !self.is_ident("in") {
                        return err(&self.peek().clone(), "'in' or 'of' expected");
                    }
                    self.next();
                    let (lo, hi) = self.range()?;
                    self.expect(":")?;
                    self.expect("(")?;
                    let body = self.expr()?;
                    self.expect(")")?;
                    Ok(Expr::ForIn(q, var, Box::new(lo), Box::new(hi), Box::new(body)))
                }
                f if is_read_fn(f) => {
                    self.expect("(")?;
                    let e = self.expr()?;
                    self.expect(")")?;
                    Ok(Expr::Read(f.to_string(), Box::new(e)))
                }
                name => {
                    if self.rule_names.iter().any(|r| r == name) {
                        Ok(Expr::Rule(name.to_string()))
                    } else {
                        Ok(Expr::Var(name.to_string()))
                    }
                }
            },
            _ => err(&t, "an expression is expected"),
        }
    }
}

fn t_line(toks: &[Token], pos: usize) -> usize {
    toks.get(pos).map(|t| t.line).unwrap_or(0)
}

fn is_read_fn(name: &str) -> bool {
    matches!(name, "uint8" | "uint16" | "uint32" | "int8" | "int16" | "int32" | "uint16be" | "uint32be" | "int16be" | "int32be" | "uint8be" | "int8be")
}

/// Text from the lexer: private-use characters U+F0000..U+F00FF are raw \xHH bytes, the rest UTF-8.
fn text_bytes(s: &str) -> Vec<u8> {
    let mut out = Vec::new();
    for c in s.chars() {
        let n = c as u32;
        if (0xF0000..=0xF00FF).contains(&n) {
            out.push((n - 0xF0000) as u8);
        } else {
            let mut buf = [0u8; 4];
            out.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
        }
    }
    out
}

/// A YARA hex string as a byte regular expression.
fn hex_regex(body: &str) -> Result<String, String> {
    let chars: Vec<char> = body.chars().filter(|c| !c.is_whitespace()).collect();
    let mut out = String::new();
    let mut i = 0;
    let mut depth = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '(' => {
                out.push_str("(?:");
                depth += 1;
                i += 1;
            }
            ')' => {
                if depth == 0 {
                    return Err("')' without '('".into());
                }
                out.push(')');
                depth -= 1;
                i += 1;
            }
            '|' => {
                out.push('|');
                i += 1;
            }
            '[' => {
                let end = chars[i..].iter().position(|&x| x == ']').ok_or("']' is missing")? + i;
                let inner: String = chars[i + 1..end].iter().collect();
                let (lo, hi) = match inner.split_once('-') {
                    None => (inner.clone(), inner.clone()),
                    Some((a, b)) => (if a.is_empty() { "0".into() } else { a.to_string() }, b.to_string()),
                };
                let lo: usize = lo.parse().map_err(|_| format!("bad jump [{inner}]"))?;
                if hi.is_empty() {
                    out.push_str(&format!("(?s:.){{{lo},}}"));
                } else {
                    let hi: usize = hi.parse().map_err(|_| format!("bad jump [{inner}]"))?;
                    if hi < lo {
                        return Err(format!("bad jump [{inner}]"));
                    }
                    out.push_str(&format!("(?s:.){{{lo},{hi}}}"));
                }
                i = end + 1;
            }
            _ => {
                let a = c;
                let b = *chars.get(i + 1).ok_or("a hex byte needs two digits")?;
                let class = |hi: Option<u8>, lo: Option<u8>| -> String {
                    let mut s = String::from("[");
                    for v in 0..=255u8 {
                        if hi.is_none_or(|h| v >> 4 == h) && lo.is_none_or(|l| v & 15 == l) {
                            s.push_str(&format!("\\x{v:02X}"));
                        }
                    }
                    s.push(']');
                    s
                };
                let hv = if a == '?' { None } else { Some(a.to_digit(16).ok_or_else(|| format!("not a hex digit: {a}"))? as u8) };
                let lv = if b == '?' { None } else { Some(b.to_digit(16).ok_or_else(|| format!("not a hex digit: {b}"))? as u8) };
                match (hv, lv) {
                    (Some(h), Some(l)) => out.push_str(&format!("\\x{:02X}", (h << 4) | l)),
                    (None, None) => out.push_str("(?s:.)"),
                    _ => out.push_str(&class(hv, lv)),
                }
                i += 2;
            }
        }
    }
    if depth != 0 {
        return Err("'(' without ')'".into());
    }
    if out.is_empty() {
        return Err("empty hex string".into());
    }
    Ok(out)
}

/// Compiles the rule text: the rules that compiled and the errors.
fn compile(text: &str) -> (Vec<Rule>, Vec<YaraError>) {
    let (toks, mut errors) = lex(text);
    // Rule names first, so conditions can refer to them (also to later rules).
    let mut names = Vec::new();
    for w in toks.windows(2) {
        if w[0].tok == Tok::Ident("rule".into()) {
            if let Tok::Ident(n) = &w[1].tok {
                names.push(n.clone());
            }
        }
    }
    // Drop `import "…"` and `include "…"`.
    let mut kept = Vec::new();
    let mut i = 0;
    while i < toks.len() {
        if matches!(&toks[i].tok, Tok::Ident(w) if w == "import" || w == "include") && matches!(toks.get(i + 1).map(|t| &t.tok), Some(Tok::Text(_))) {
            i += 2;
            continue;
        }
        kept.push(toks[i].clone());
        i += 1;
    }
    let mut p = Parser { toks: kept, pos: 0, rule_names: names };
    let mut rules = Vec::new();
    while p.peek().tok != Tok::Eof {
        let start = p.pos;
        match p.rule() {
            Ok(r) => rules.push(r),
            Err(e) => {
                errors.push(e);
                // Skip to the next rule.
                if p.pos == start {
                    p.next();
                }
                while p.peek().tok != Tok::Eof && !matches!(&p.peek().tok, Tok::Ident(w) if w == "rule" || w == "private" || w == "global") {
                    p.next();
                }
            }
        }
    }
    (rules, errors)
}

// ───────────── matching and evaluation

struct Ctx<'a> {
    src: &'a dyn Bytes,
    /// string id per rule → matches (offset, length)
    found: HashMap<(usize, String), Vec<(u64, u64)>>,
    results: HashMap<String, bool>,
    entry: i64,
    vars: HashMap<String, i64>,
    /// the string `$` stands for inside `for … of`
    current: Option<String>,
}

fn entrypoint(src: &dyn Bytes) -> i64 {
    let read = |o: u64, n: usize| -> Option<Vec<u8>> {
        if o + n as u64 > src.len() {
            return None;
        }
        let mut b = vec![0u8; n];
        src.read(o, &mut b).ok()?;
        Some(b)
    };
    let u16le = |o| read(o, 2).map(|b| u16::from_le_bytes([b[0], b[1]]) as u64);
    let u32le = |o| read(o, 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as u64);
    let head = read(0, 4).unwrap_or_default();
    if head.starts_with(b"MZ") {
        let Some(pe) = u32le(0x3C) else { return 0 };
        if read(pe, 4).as_deref() != Some(b"PE\0\0") {
            return 0;
        }
        let (Some(sections), Some(opt_size), Some(rva)) = (u16le(pe + 6), u16le(pe + 20), u32le(pe + 0x28)) else { return 0 };
        let table = pe + 24 + opt_size;
        for s in 0..sections {
            let at = table + s * 40;
            let (Some(vsize), Some(va), Some(raw_size), Some(raw)) = (u32le(at + 8), u32le(at + 12), u32le(at + 16), u32le(at + 20)) else { break };
            if rva >= va && rva < va + vsize.max(raw_size) {
                return (rva - va + raw) as i64;
            }
        }
        return rva as i64;
    }
    if head == b"\x7FELF" {
        let b = read(0, 64).unwrap_or_default();
        if b.len() < 52 {
            return 0;
        }
        let is64 = b[4] == 2;
        let le = b[5] == 1;
        let rd = |o: usize, n: usize| -> u64 {
            let s = &b[o..o + n];
            let mut v = 0u64;
            for i in 0..n {
                v |= (if le { s[i] } else { s[n - 1 - i] } as u64) << (8 * i);
            }
            v
        };
        let entry = if is64 { rd(24, 8) } else { rd(24, 4) };
        let (phoff, phentsize, phnum) = if is64 { (rd(32, 8), rd(54, 2), rd(56, 2)) } else { (rd(28, 4), rd(42, 2), rd(44, 2)) };
        for i in 0..phnum.min(64) {
            let Some(ph) = read(phoff + i * phentsize, phentsize as usize) else { break };
            let g = |o: usize, n: usize| -> u64 {
                let s = &ph[o..o + n];
                let mut v = 0u64;
                for k in 0..n {
                    v |= (if le { s[k] } else { s[n - 1 - k] } as u64) << (8 * k);
                }
                v
            };
            let (ptype, off, vaddr, filesz) = if is64 { (g(0, 4), g(8, 8), g(16, 8), g(32, 8)) } else { (g(0, 4), g(4, 4), g(8, 4), g(16, 4)) };
            if ptype == 1 && entry >= vaddr && entry < vaddr + filesz {
                return (entry - vaddr + off) as i64;
            }
        }
        return 0;
    }
    0
}

fn is_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

impl<'a> Ctx<'a> {
    fn ids_of(&self, rule: &Rule, set: &Set) -> Vec<String> {
        match set {
            Set::Them => rule.strings.iter().map(|s| s.id.clone()).collect(),
            Set::List(list) => {
                let mut out = Vec::new();
                for item in list {
                    if let Some(prefix) = item.strip_suffix('*') {
                        out.extend(rule.strings.iter().filter(|s| s.id.starts_with(prefix)).map(|s| s.id.clone()));
                    } else {
                        out.push(item.clone());
                    }
                }
                out
            }
        }
    }

    fn string_id(&self, name: &str) -> Result<String, String> {
        if name.is_empty() {
            return self.current.clone().ok_or_else(|| "'$' is only valid inside 'for … of'".to_string());
        }
        Ok(name.to_string())
    }

    fn hits(&self, rule_index: usize, name: &str) -> Result<&[(u64, u64)], String> {
        let id = self.string_id(name)?;
        self.found.get(&(rule_index, id.clone())).map(|v| v.as_slice()).ok_or_else(|| format!("${id} is not defined"))
    }

    fn quant_ok(&mut self, q: &Quant, n_true: usize, total: usize, ri: usize, rule: &Rule) -> Result<bool, String> {
        Ok(match q {
            Quant::All => n_true == total,
            Quant::Any => n_true > 0,
            Quant::None => n_true == 0,
            Quant::Num(e) => n_true as i64 >= self.eval(e, ri, rule)?,
            Quant::Percent(e) => total > 0 && (n_true as i64) * 100 >= self.eval(e, ri, rule)? * total as i64,
        })
    }

    fn eval(&mut self, e: &Expr, ri: usize, rule: &Rule) -> Result<i64, String> {
        let b = |v: bool| v as i64;
        Ok(match e {
            Expr::Num(n) => *n,
            Expr::Filesize => self.src.len() as i64,
            Expr::Entrypoint => self.entry,
            Expr::Var(name) => *self.vars.get(name).ok_or_else(|| format!("unknown name {name}"))?,
            Expr::Found(s) => b(!self.hits(ri, s)?.is_empty()),
            Expr::FoundAt(s, at) => {
                let at = self.eval(at, ri, rule)?;
                b(self.hits(ri, s)?.iter().any(|m| m.0 as i64 == at))
            }
            Expr::FoundIn(s, lo, hi) => {
                let (lo, hi) = (self.eval(lo, ri, rule)?, self.eval(hi, ri, rule)?);
                b(self.hits(ri, s)?.iter().any(|m| (m.0 as i64) >= lo && (m.0 as i64) <= hi))
            }
            Expr::Count(s) => self.hits(ri, s)?.len() as i64,
            Expr::CountIn(s, lo, hi) => {
                let (lo, hi) = (self.eval(lo, ri, rule)?, self.eval(hi, ri, rule)?);
                self.hits(ri, s)?.iter().filter(|m| (m.0 as i64) >= lo && (m.0 as i64) <= hi).count() as i64
            }
            Expr::Offset(s, i) | Expr::Length(s, i) => {
                let i = self.eval(i, ri, rule)?;
                let hits = self.hits(ri, s)?;
                match (i >= 1).then(|| hits.get(i as usize - 1)).flatten() {
                    Some(m) => if matches!(e, Expr::Offset(..)) { m.0 as i64 } else { m.1 as i64 },
                    None => -1,
                }
            }
            Expr::Read(f, at) => {
                let at = self.eval(at, ri, rule)?;
                let width = if f.contains("32") { 4 } else if f.contains("16") { 2 } else { 1 };
                if at < 0 || at as u64 + width > self.src.len() {
                    return Ok(0);
                }
                let mut buf = vec![0u8; width as usize];
                self.src.read(at as u64, &mut buf)?;
                let mut v: u64 = 0;
                for k in 0..width as usize {
                    let byte = if f.ends_with("be") { buf[k] } else { buf[width as usize - 1 - k] };
                    v = (v << 8) | byte as u64;
                }
                if f.starts_with("int") {
                    let shift = 64 - 8 * width;
                    (((v << shift) as i64) >> shift) as i64
                } else {
                    v as i64
                }
            }
            Expr::Rule(name) => b(*self.results.get(name).unwrap_or(&false)),
            Expr::Not(x) => b(self.eval(x, ri, rule)? == 0),
            Expr::Neg(x) => self.eval(x, ri, rule)?.wrapping_neg(),
            Expr::BitNot(x) => !self.eval(x, ri, rule)?,
            Expr::Bin(op, l, r) => {
                if *op == "and" {
                    return Ok(b(self.eval(l, ri, rule)? != 0 && self.eval(r, ri, rule)? != 0));
                }
                if *op == "or" {
                    return Ok(b(self.eval(l, ri, rule)? != 0 || self.eval(r, ri, rule)? != 0));
                }
                let (x, y) = (self.eval(l, ri, rule)?, self.eval(r, ri, rule)?);
                match *op {
                    "+" => x.wrapping_add(y),
                    "-" => x.wrapping_sub(y),
                    "*" => x.wrapping_mul(y),
                    "\\" => if y == 0 { return Err("division by zero".into()) } else { x.wrapping_div(y) },
                    "%" => if y == 0 { return Err("division by zero".into()) } else { x.wrapping_rem(y) },
                    "&" => x & y,
                    "|" => x | y,
                    "^" => x ^ y,
                    "<<" => if (0..64).contains(&y) { x << y } else { 0 },
                    ">>" => if (0..64).contains(&y) { x >> y } else { 0 },
                    "==" => b(x == y),
                    "!=" => b(x != y),
                    "<" => b(x < y),
                    "<=" => b(x <= y),
                    ">" => b(x > y),
                    ">=" => b(x >= y),
                    _ => return Err(format!("unknown operator {op}")),
                }
            }
            Expr::Of(q, set) => {
                let ids = self.ids_of(rule, set);
                let mut n = 0;
                for id in &ids {
                    if !self.hits(ri, id)?.is_empty() {
                        n += 1;
                    }
                }
                b(self.quant_ok(q, n, ids.len(), ri, rule)?)
            }
            Expr::ForOf(q, set, body) => {
                let ids = self.ids_of(rule, set);
                let saved = self.current.clone();
                let mut n = 0;
                for id in &ids {
                    self.current = Some(id.clone());
                    if self.eval(body, ri, rule)? != 0 {
                        n += 1;
                    }
                }
                self.current = saved;
                b(self.quant_ok(q, n, ids.len(), ri, rule)?)
            }
            Expr::ForIn(q, var, lo, hi, body) => {
                let (lo, hi) = (self.eval(lo, ri, rule)?, self.eval(hi, ri, rule)?);
                if hi - lo > 1_000_000 {
                    return Err("the range of 'for … in' is too large".into());
                }
                let saved = self.vars.get(var).copied();
                let mut n = 0;
                let total = (hi - lo + 1).max(0) as usize;
                for i in lo..=hi {
                    self.vars.insert(var.clone(), i);
                    if self.eval(body, ri, rule)? != 0 {
                        n += 1;
                    }
                }
                match saved {
                    Some(v) => self.vars.insert(var.clone(), v),
                    None => self.vars.remove(var),
                };
                b(self.quant_ok(q, n, total, ri, rule)?)
            }
        })
    }
}

/// All matches of every string of every rule over [start, end), in chunks.
fn search(src: &dyn Bytes, rules: &[Rule], start: u64, end: u64, progress: &mut Progress) -> Result<HashMap<(usize, String), Vec<(u64, u64)>>, String> {
    const CHUNK: u64 = 4 << 20;
    const PER_STRING: usize = 100_000;
    let reach = rules.iter().flat_map(|r| r.strings.iter()).map(|s| s.reach.unwrap_or(64 << 10)).max().unwrap_or(0) as u64;
    let mut found: HashMap<(usize, String), Vec<(u64, u64)>> = HashMap::new();
    for (ri, r) in rules.iter().enumerate() {
        for s in &r.strings {
            found.insert((ri, s.id.clone()), Vec::new());
        }
    }
    let mut pos = start;
    let mut buf = Vec::new();
    while pos < end {
        let scan_end = (pos + CHUNK).min(end);
        let read_end = (scan_end + reach).min(end);
        buf.resize((read_end - pos) as usize, 0);
        src.read(pos, &mut buf)?;
        for (ri, r) in rules.iter().enumerate() {
            for s in &r.strings {
                let list = found.get_mut(&(ri, s.id.clone())).unwrap();
                // Continue after the last match (no overlapping matches of one string).
                let mut at = list.last().map(|&(o, l)| (o + l.max(1)).saturating_sub(pos) as usize).unwrap_or(0);
                while at < buf.len() && list.len() < PER_STRING {
                    let Some(m) = s.regex.find_at(&buf, at) else { break };
                    if m.start() as u64 + pos >= scan_end {
                        break;
                    }
                    let ok = !s.fullword || ((m.start() == 0 && pos == start || m.start() > 0 && !is_word(buf[m.start() - 1])) && (m.end() >= buf.len() || !is_word(buf[m.end()])));
                    if ok {
                        list.push((pos + m.start() as u64, m.len() as u64));
                    }
                    at = if m.end() > m.start() { m.end() } else { m.start() + 1 };
                }
            }
        }
        pos = scan_end;
        if !progress(pos - start, end - start) {
            return Err(CANCELLED.into());
        }
    }
    Ok(found)
}

pub fn scan(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let text = args.str_or("rules", "");
    let (rules, mut errors) = compile(text);
    let (offset, length) = range_of(src, args);
    let limit = args.u64_or("limit", 10_000) as usize;
    let found = search(src, &rules, offset, offset + length, progress)?;
    let mut ctx = Ctx { src, found, results: HashMap::new(), entry: entrypoint(src), vars: HashMap::new(), current: None };
    // Rules referring to later rules: evaluate until nothing changes (at most as many rounds as rules).
    let mut outcome: Vec<Option<bool>> = vec![None; rules.len()];
    for _ in 0..rules.len().max(1) {
        let mut changed = false;
        for (ri, r) in rules.iter().enumerate() {
            match ctx.eval(&r.condition, ri, r) {
                Ok(v) => {
                    let v = v != 0;
                    if outcome[ri] != Some(v) {
                        outcome[ri] = Some(v);
                        ctx.results.insert(r.name.clone(), v);
                        changed = true;
                    }
                }
                Err(message) => {
                    if outcome[ri].is_none() {
                        errors.push(YaraError { line: 0, col: 0, message: format!("rule {}: {message}", r.name) });
                        outcome[ri] = Some(false);
                        ctx.results.insert(r.name.clone(), false);
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }
    let mut reported = 0usize;
    let mut matches = Vec::new();
    for (ri, r) in rules.iter().enumerate() {
        if outcome[ri] != Some(true) || r.private {
            continue;
        }
        let mut strings = Vec::new();
        for s in &r.strings {
            for &(o, l) in &ctx.found[&(ri, s.id.clone())] {
                if reported >= limit {
                    break;
                }
                let mut data = vec![0u8; l.min(32) as usize];
                src.read(o, &mut data)?;
                strings.push(json!({ "id": format!("${}", s.id), "offset": o, "length": l, "data": hex_string(&data, true) }));
                reported += 1;
            }
        }
        matches.push(json!({ "rule": r.name, "tags": r.tags, "meta": Value::Object(r.meta.clone()), "strings": strings }));
    }
    let errors: Vec<Value> = errors.iter().map(|e| json!({ "line": e.line, "col": e.col, "message": e.message })).collect();
    Ok(json!({ "matches": matches, "rules": rules.len(), "errors": errors, "truncated": reported >= limit }))
}

pub fn check(args: &Value) -> Result<Value, String> {
    let (rules, errors) = compile(args.str_or("rules", ""));
    let errors: Vec<Value> = errors.iter().map(|e| json!({ "line": e.line, "col": e.col, "message": e.message })).collect();
    Ok(json!({ "rules": rules.len(), "errors": errors }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::no_progress;

    fn sample() -> Vec<u8> {
        let mut d = vec![0u8; 512];
        d[0] = b'M';
        d[1] = b'Z';
        d[0x3C] = 0x80;
        d[0x80..0x84].copy_from_slice(b"PE\0\0");
        d[0x100..0x106].copy_from_slice(&[0xE8, 0x11, 0x22, 0x33, 0x90, 0xC3]);
        d[0x140..0x14B].copy_from_slice(b"Hello World");
        for (i, c) in "secret".bytes().enumerate() {
            d[0x180 + 2 * i] = c;
        }
        d[0x1C0..0x1C3].copy_from_slice(b"abc");
        d[0x1D0..0x1D3].copy_from_slice(b"abc");
        d[0x1E0..0x1E6].copy_from_slice(b"xabcx_");
        d
    }

    fn run(rules: &str) -> Value {
        scan(&sample(), &json!({ "rules": rules }), &mut no_progress()).unwrap()
    }
    fn names(r: &Value) -> Vec<String> {
        r["matches"].as_array().unwrap().iter().map(|m| m["rule"].as_str().unwrap().to_string()).collect()
    }

    #[test]
    fn mz_header_and_meta() {
        let r = run(r#"import "pe"
            rule mz : exe windows { meta: author = "me" score = 5 ok = true
              strings: $mz = "MZ" condition: $mz at 0 and uint16(0) == 0x5A4D and uint32(0x3C) == 0x80 }"#);
        assert_eq!(names(&r), vec!["mz"]);
        let m = &r["matches"][0];
        assert_eq!(m["tags"], json!(["exe", "windows"]));
        assert_eq!(m["meta"]["score"], json!(5));
        assert_eq!(m["strings"][0]["offset"], json!(0));
    }

    #[test]
    fn hex_jumps_and_alternatives() {
        let r = run("rule call { strings: $c = { E8 ?? [1-3] (90 | 91) C3 } $d = { E8 1? 2? } condition: $c and $d and @c[1] == 0x100 and !c[1] == 6 }");
        assert_eq!(names(&r), vec!["call"]);
        let r = run("rule no { strings: $c = { E8 [4] 91 } condition: $c }");
        assert!(names(&r).is_empty());
    }

    #[test]
    fn nocase_wide_fullword_counts() {
        let r = run(r#"rule text { strings: $h = "hello world" nocase $w = "secret" wide $a = "abc" fullword condition: $h and $w and #a == 2 and #a in (0..0x1C5) == 1 }"#);
        assert_eq!(names(&r), vec!["text"], "{r}");
        let r = run(r#"rule rx { strings: $r = /hel+o w[a-z]+/i condition: $r and @r == 0x140 }"#);
        assert_eq!(names(&r), vec!["rx"]);
    }

    #[test]
    fn of_quantifiers_for_and_rule_references() {
        let rules = r#"
            rule two { strings: $a = "MZ" $b = "PE" $c = "nope" condition: 2 of them and not all of them and any of ($a, $b*) and none of ($c) }
            private rule hidden { condition: filesize == 512 and filesize < 1KB }
            rule uses { condition: hidden and two and entrypoint == 0 }
            rule forof { strings: $a1 = "abc" $a2 = "Hello" condition: for all of ($a*) : ( $ in (0x100..0x200) ) and for any i in (1..#a1) : ( @a1[i] == 0x1D0 ) }
        "#;
        let r = run(rules);
        assert_eq!(names(&r), vec!["two", "uses", "forof"], "{r}");
        assert_eq!(r["rules"], json!(4));
    }

    #[test]
    fn errors_skip_only_the_bad_rule() {
        let r = run("rule bad { strings: $a = { 4G } condition: $a }\nrule good { condition: true }\nrule worse { condition: $zz }");
        assert_eq!(names(&r), vec!["good"]);
        let errs = r["errors"].as_array().unwrap();
        assert!(errs.len() >= 2, "{r}");
        assert_eq!(errs[0]["line"], json!(1));
        let c = check(&json!({ "rules": "rule x { condition: ( }" })).unwrap();
        assert_eq!(c["rules"], json!(0));
        assert_eq!(c["errors"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn across_chunks() {
        let mut d = vec![0u8; (4 << 20) + 100];
        d[(4 << 20) - 2..(4 << 20) + 2].copy_from_slice(b"ABCD");
        let r = scan(&d, &json!({ "rules": "rule x { strings: $a = \"ABCD\" condition: #a == 1 and @a == 4194302 }" }), &mut no_progress()).unwrap();
        assert_eq!(names(&r), vec!["x"]);
    }
}
