//! The M language's lexer and parser: MATLAB's statements, operators,
//! matrix and cell literals (whitespace separates elements inside brackets),
//! command syntax (`hold on`), comments (`%`, `%{ … %}`) and continuation (`...`).

use std::rc::Rc;

#[derive(Clone, Debug, PartialEq)]
pub enum Tok {
    Num(f64),
    Imag(f64),
    Str(String),
    DStr(String),
    Ident(String),
    Kw(&'static str),
    Op(&'static str),
    Newline,
    Semi,
    Comma,
    Eof,
}

const KEYWORDS: &[&str] = &["if", "elseif", "else", "end", "for", "parfor", "while", "switch", "case", "otherwise", "function", "return", "break", "continue", "try", "catch", "global", "persistent", "do", "until"];
const OPS: &[&str] = &[".^", ".*", "./", ".\\", ".'", "==", "~=", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "\\", "^", "'", "<", ">", "&", "|", "~", "!", "=", "(", ")", "[", "]", "{", "}", ":", ".", "@"];
/// Words that take command syntax when followed by a bare word (`hold on`, `format long`).
const COMMANDS: &[&str] = &["hold", "grid", "format", "close", "clc", "clear", "figure", "axis", "warning", "more", "disp", "box", "drawnow", "pkg", "clearvars", "echo", "rng"];

#[derive(Clone, Debug)]
pub struct Token {
    pub tok: Tok,
    pub line: usize,
    /// Whitespace came right before this token.
    pub space_before: bool,
}

fn ends_value(t: &Tok) -> bool {
    matches!(t, Tok::Num(_) | Tok::Imag(_) | Tok::Str(_) | Tok::DStr(_) | Tok::Ident(_) | Tok::Kw("end")) || matches!(t, Tok::Op(")") | Tok::Op("]") | Tok::Op("}") | Tok::Op("'") | Tok::Op(".'"))
}

pub fn lex(src: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = src.chars().collect();
    let mut out: Vec<Token> = Vec::new();
    let mut i = 0;
    let mut line = 1;
    // Bracket stack: '[', '{' or '('.
    let mut stack: Vec<char> = Vec::new();
    let mut space = false;
    let mut stmt_start = true;
    let n = chars.len();
    let push = |out: &mut Vec<Token>, tok: Tok, line: usize, space: bool| out.push(Token { tok, line, space_before: space });
    while i < n {
        let c = chars[i];
        // Block comments: %{ on its own line … %}
        if c == '%' && chars.get(i + 1) == Some(&'{') && rest_blank(&chars, i + 2) && line_blank_before(&chars, i) {
            let mut depth = 0;
            loop {
                // Advance line by line.
                let ls = i;
                while i < n && chars[i] != '\n' {
                    i += 1;
                }
                let l: String = chars[ls..i].iter().collect();
                let t = l.trim();
                if t == "%{" {
                    depth += 1;
                } else if t == "%}" {
                    depth -= 1;
                }
                if i < n {
                    i += 1;
                    line += 1;
                }
                if depth == 0 || i >= n {
                    break;
                }
            }
            push(&mut out, Tok::Newline, line - 1, false);
            stmt_start = true;
            continue;
        }
        if c == '%' || (c == '#' && stack.is_empty()) {
            while i < n && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '.' && chars.get(i + 1) == Some(&'.') && chars.get(i + 2) == Some(&'.') {
            // Continuation: skip to the next line.
            while i < n && chars[i] != '\n' {
                i += 1;
            }
            i += 1;
            line += 1;
            space = true;
            continue;
        }
        if c == ' ' || c == '\t' || c == '\r' {
            i += 1;
            space = true;
            continue;
        }
        if c == '\n' {
            i += 1;
            line += 1;
            if matches!(stack.last(), Some('[') | Some('{')) {
                // A new line inside brackets ends a row.
                if !matches!(out.last().map(|t| &t.tok), Some(Tok::Semi) | Some(Tok::Comma) | Some(Tok::Op("[")) | Some(Tok::Op("{"))) {
                    push(&mut out, Tok::Semi, line - 1, false);
                }
            } else if stack.is_empty() {
                push(&mut out, Tok::Newline, line - 1, false);
                stmt_start = true;
            }
            space = true;
            continue;
        }
        // Command syntax at the start of a statement.
        if stmt_start && stack.is_empty() && (c.is_alphabetic()) {
            let s = i;
            let mut j = i;
            while j < n && (chars[j].is_alphanumeric() || chars[j] == '_') {
                j += 1;
            }
            let word: String = chars[s..j].iter().collect();
            if COMMANDS.contains(&word.as_str()) && j < n && (chars[j] == ' ' || chars[j] == '\t') {
                let mut k = j;
                while k < n && (chars[k] == ' ' || chars[k] == '\t') {
                    k += 1;
                }
                if k < n && (chars[k].is_alphanumeric() || chars[k] == '-') && !next_is_assign_or_op(&chars, k) {
                    let e = (k..n).find(|&q| matches!(chars[q], '\n' | ';' | ',' | '%')).unwrap_or(n);
                    let args: Vec<String> = chars[k..e].iter().collect::<String>().split_whitespace().map(String::from).collect();
                    push(&mut out, Tok::Ident(word), line, space);
                    push(&mut out, Tok::Op("("), line, false);
                    for (q, a) in args.iter().enumerate() {
                        if q > 0 {
                            push(&mut out, Tok::Comma, line, false);
                        }
                        push(&mut out, Tok::Str(a.clone()), line, false);
                    }
                    push(&mut out, Tok::Op(")"), line, false);
                    i = e;
                    space = false;
                    stmt_start = false;
                    continue;
                }
            }
        }
        // Inside [ ] or { }: whitespace between two values separates elements.
        if space && matches!(stack.last(), Some('[') | Some('{')) {
            if let Some(prev) = out.last() {
                if ends_value(&prev.tok) {
                    let next_space = chars.get(i + 1).is_some_and(|d| *d == ' ' || *d == '\t');
                    let starts = c.is_alphanumeric() || c == '_' || c == '.' && chars.get(i + 1).is_some_and(|d| d.is_ascii_digit()) || c == '(' || c == '[' || c == '{' || c == '@' || c == '"' || c == '\''
                        || ((c == '-' || c == '+') && !next_space && chars.get(i + 1) != Some(&'='))
                        || ((c == '~' || c == '!') && chars.get(i + 1) != Some(&'='));
                    if starts {
                        push(&mut out, Tok::Comma, line, false);
                    }
                }
            }
        }
        stmt_start = false;
        let sp = space;
        space = false;
        // Numbers.
        if c.is_ascii_digit() || (c == '.' && chars.get(i + 1).is_some_and(|d| d.is_ascii_digit())) {
            let s = i;
            while i < n && chars[i].is_ascii_digit() {
                i += 1;
            }
            if i < n && chars[i] == '.' && !matches!(chars.get(i + 1), Some('*') | Some('/') | Some('\\') | Some('^') | Some('\'')) && !(chars.get(i + 1) == Some(&'.') && chars.get(i + 2) == Some(&'.')) {
                i += 1;
                while i < n && chars[i].is_ascii_digit() {
                    i += 1;
                }
            }
            if i < n && (chars[i] == 'e' || chars[i] == 'E') && (chars.get(i + 1).is_some_and(|d| d.is_ascii_digit()) || (matches!(chars.get(i + 1), Some('+') | Some('-')) && chars.get(i + 2).is_some_and(|d| d.is_ascii_digit()))) {
                i += 2;
                while i < n && chars[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let text: String = chars[s..i].iter().collect();
            let v: f64 = text.parse().map_err(|_| format!("line {line}: bad number \"{text}\""))?;
            if i < n && (chars[i] == 'i' || chars[i] == 'j') && !chars.get(i + 1).is_some_and(|d| d.is_alphanumeric() || *d == '_') {
                i += 1;
                push(&mut out, Tok::Imag(v), line, sp);
            } else {
                push(&mut out, Tok::Num(v), line, sp);
            }
            continue;
        }
        if c.is_alphabetic() || c == '_' {
            let s = i;
            while i < n && (chars[i].is_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            let word: String = chars[s..i].iter().collect();
            // A keyword unless it is a field name (s.end) — fields follow a '.'.
            let after_dot = matches!(out.last().map(|t| &t.tok), Some(Tok::Op(".")));
            match KEYWORDS.iter().find(|k| **k == word) {
                Some(k) if !after_dot => push(&mut out, Tok::Kw(k), line, sp),
                _ => push(&mut out, Tok::Ident(word), line, sp),
            }
            continue;
        }
        if c == '"' || (c == '\'' && !(out.last().is_some_and(|t| ends_value(&t.tok)) && !(sp && matches!(stack.last(), Some('[') | Some('{'))))) {
            // A string ('' or "" escape the quote).
            let q = c;
            i += 1;
            let mut s = String::new();
            loop {
                if i >= n || chars[i] == '\n' {
                    return Err(format!("line {line}: the string is not closed"));
                }
                if chars[i] == q {
                    if chars.get(i + 1) == Some(&q) {
                        s.push(q);
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                s.push(chars[i]);
                i += 1;
            }
            push(&mut out, if q == '"' { Tok::DStr(s) } else { Tok::Str(s) }, line, sp);
            continue;
        }
        if c == ';' {
            push(&mut out, Tok::Semi, line, sp);
            i += 1;
            if stack.is_empty() {
                stmt_start = true;
            }
            continue;
        }
        if c == ',' {
            push(&mut out, Tok::Comma, line, sp);
            i += 1;
            if stack.is_empty() {
                stmt_start = true;
            }
            continue;
        }
        let op = OPS.iter().find(|o| {
            let oc: Vec<char> = o.chars().collect();
            chars[i..].starts_with(&oc)
        });
        match op {
            Some(o) => {
                match *o {
                    "(" | "[" | "{" => stack.push(o.chars().next().unwrap()),
                    ")" | "]" | "}" => {
                        stack.pop();
                    }
                    _ => {}
                }
                // Inside brackets "[1 , 2]" may leave a separator before the closing bracket.
                if matches!(*o, "]" | "}") && matches!(out.last().map(|t| &t.tok), Some(Tok::Comma)) {
                    out.pop();
                }
                push(&mut out, Tok::Op(o), line, sp);
                i += o.chars().count();
            }
            None => return Err(format!("line {line}: unexpected character '{c}'")),
        }
    }
    out.push(Token { tok: Tok::Newline, line, space_before: false });
    out.push(Token { tok: Tok::Eof, line, space_before: false });
    Ok(out)
}

fn rest_blank(chars: &[char], from: usize) -> bool {
    chars[from..].iter().take_while(|c| **c != '\n').all(|c| c.is_whitespace())
}

fn line_blank_before(chars: &[char], at: usize) -> bool {
    chars[..at].iter().rev().take_while(|c| **c != '\n').all(|c| c.is_whitespace())
}

/// After a command word: "x = 1" or "x(2)" or "x + 1" are not command syntax.
fn next_is_assign_or_op(chars: &[char], k: usize) -> bool {
    let mut j = k;
    while j < chars.len() && (chars[j].is_alphanumeric() || chars[j] == '_') {
        j += 1;
    }
    while j < chars.len() && chars[j] == ' ' {
        j += 1;
    }
    matches!(chars.get(j), Some('=') | Some('(')) && chars.get(j + 1) != Some(&'=')
}

// ───────────────────────── syntax tree

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Bin {
    Add,
    Sub,
    Mul,
    Div,
    LDiv,
    Pow,
    EMul,
    EDiv,
    ELDiv,
    EPow,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    And,
    Or,
    AndAnd,
    OrOr,
}

#[derive(Clone, Debug)]
pub enum Expr {
    Num(f64),
    Imag(f64),
    Str(String),
    Colon,
    End,
    Ident(String),
    Matrix(Vec<Vec<Expr>>),
    Cell(Vec<Vec<Expr>>),
    Range(Box<Expr>, Option<Box<Expr>>, Box<Expr>),
    Bin(Bin, Box<Expr>, Box<Expr>),
    Neg(Box<Expr>),
    Not(Box<Expr>),
    Transpose(Box<Expr>, bool),
    Index(Box<Expr>, Vec<Expr>),
    CellIndex(Box<Expr>, Vec<Expr>),
    Field(Box<Expr>, String),
    DynField(Box<Expr>, Box<Expr>),
    Anon(Rc<Vec<String>>, Rc<Expr>),
    Handle(String),
}

#[derive(Clone, Debug)]
pub enum Stmt {
    Expr(Expr, bool, usize),
    Assign(Vec<Option<Expr>>, Expr, bool, usize),
    If(Vec<(Expr, Vec<Stmt>)>, Vec<Stmt>),
    For(Expr, Expr, Vec<Stmt>, usize),
    While(Expr, Vec<Stmt>),
    Switch(Expr, Vec<(Expr, Vec<Stmt>)>, Vec<Stmt>),
    Try(Vec<Stmt>, Option<String>, Vec<Stmt>),
    Break,
    Continue,
    Return,
    Global(Vec<String>),
}

#[derive(Clone, Debug)]
pub struct Function {
    pub name: String,
    pub params: Vec<String>,
    pub outputs: Vec<String>,
    pub body: Vec<Stmt>,
}

pub struct Program {
    pub body: Vec<Stmt>,
    pub functions: Vec<Rc<Function>>,
}

struct Parser {
    t: Vec<Token>,
    p: usize,
    /// Depth of index brackets (where `end` means the last index).
    index_depth: usize,
    /// Inside [ ] or { }.
    in_matrix: usize,
}

impl Parser {
    fn peek(&self) -> &Tok {
        &self.t[self.p].tok
    }
    fn peek_at(&self, k: usize) -> &Tok {
        &self.t[(self.p + k).min(self.t.len() - 1)].tok
    }
    fn line(&self) -> usize {
        self.t[self.p].line
    }
    fn next(&mut self) -> Tok {
        let t = self.t[self.p].tok.clone();
        if self.p < self.t.len() - 1 {
            self.p += 1;
        }
        t
    }
    fn is_op(&self, o: &str) -> bool {
        matches!(self.peek(), Tok::Op(x) if *x == o)
    }
    fn eat_op(&mut self, o: &str) -> bool {
        if self.is_op(o) {
            self.p += 1;
            true
        } else {
            false
        }
    }
    fn expect_op(&mut self, o: &str) -> Result<(), String> {
        if self.eat_op(o) {
            Ok(())
        } else {
            Err(format!("line {}: expected '{o}' but found {}", self.line(), describe(self.peek())))
        }
    }
    fn is_kw(&self, k: &str) -> bool {
        matches!(self.peek(), Tok::Kw(x) if *x == k)
    }
    fn skip_newlines(&mut self) {
        while matches!(self.peek(), Tok::Newline | Tok::Semi | Tok::Comma) {
            self.p += 1;
        }
    }

    fn block(&mut self, stops: &[&str]) -> Result<Vec<Stmt>, String> {
        let mut out = Vec::new();
        loop {
            self.skip_newlines();
            match self.peek() {
                Tok::Eof => return Ok(out),
                Tok::Kw(k) if stops.contains(k) => return Ok(out),
                _ => out.push(self.statement()?),
            }
        }
    }

    fn end_of_statement(&mut self) -> bool {
        // true = print (no semicolon).
        match self.peek() {
            Tok::Semi => {
                self.p += 1;
                false
            }
            Tok::Comma | Tok::Newline => {
                self.p += 1;
                true
            }
            _ => true,
        }
    }

    fn statement(&mut self) -> Result<Stmt, String> {
        let line = self.line();
        match self.peek().clone() {
            Tok::Kw("if") => {
                self.next();
                let mut arms = Vec::new();
                let cond = self.expr()?;
                let body = self.block(&["elseif", "else", "end"])?;
                arms.push((cond, body));
                let mut otherwise = Vec::new();
                loop {
                    match self.next() {
                        Tok::Kw("elseif") => {
                            let c = self.expr()?;
                            let b = self.block(&["elseif", "else", "end"])?;
                            arms.push((c, b));
                        }
                        Tok::Kw("else") => {
                            otherwise = self.block(&["end"])?;
                        }
                        Tok::Kw("end") => break,
                        t => return Err(format!("line {line}: \"if\" is not closed by \"end\" (found {})", describe(&t))),
                    }
                }
                Ok(Stmt::If(arms, otherwise))
            }
            Tok::Kw("for") | Tok::Kw("parfor") => {
                self.next();
                let paren = self.eat_op("(");
                let var = self.postfix()?;
                self.expect_op("=")?;
                let range = self.expr()?;
                if paren {
                    self.expect_op(")")?;
                }
                let body = self.block(&["end"])?;
                self.next();
                Ok(Stmt::For(var, range, body, line))
            }
            Tok::Kw("while") => {
                self.next();
                let cond = self.expr()?;
                let body = self.block(&["end"])?;
                self.next();
                Ok(Stmt::While(cond, body))
            }
            Tok::Kw("do") => {
                // Octave's do … until cond
                self.next();
                let body = self.block(&["until"])?;
                self.next();
                let cond = self.expr()?;
                let mut b = body.clone();
                b.push(Stmt::If(vec![(cond, vec![Stmt::Break])], Vec::new()));
                Ok(Stmt::While(Expr::Num(1.0), b))
            }
            Tok::Kw("switch") => {
                self.next();
                let subject = self.expr()?;
                self.skip_newlines();
                let mut cases = Vec::new();
                let mut otherwise = Vec::new();
                loop {
                    match self.next() {
                        Tok::Kw("case") => {
                            let v = self.expr()?;
                            let b = self.block(&["case", "otherwise", "end"])?;
                            cases.push((v, b));
                        }
                        Tok::Kw("otherwise") => otherwise = self.block(&["case", "otherwise", "end"])?,
                        Tok::Kw("end") => break,
                        t => return Err(format!("line {line}: \"switch\" is not closed by \"end\" (found {})", describe(&t))),
                    }
                }
                Ok(Stmt::Switch(subject, cases, otherwise))
            }
            Tok::Kw("try") => {
                self.next();
                let body = self.block(&["catch", "end"])?;
                let mut var = None;
                let mut handler = Vec::new();
                if self.is_kw("catch") {
                    self.next();
                    if let Tok::Ident(name) = self.peek().clone() {
                        if !matches!(self.peek_at(1), Tok::Op("=") | Tok::Op("(")) {
                            self.next();
                            var = Some(name);
                        }
                    }
                    handler = self.block(&["end"])?;
                }
                self.next();
                Ok(Stmt::Try(body, var, handler))
            }
            Tok::Kw("break") => {
                self.next();
                self.end_of_statement();
                Ok(Stmt::Break)
            }
            Tok::Kw("continue") => {
                self.next();
                self.end_of_statement();
                Ok(Stmt::Continue)
            }
            Tok::Kw("return") => {
                self.next();
                self.end_of_statement();
                Ok(Stmt::Return)
            }
            Tok::Kw("global") | Tok::Kw("persistent") => {
                self.next();
                let mut names = Vec::new();
                while let Tok::Ident(n) = self.peek().clone() {
                    self.next();
                    names.push(n);
                }
                self.end_of_statement();
                Ok(Stmt::Global(names))
            }
            Tok::Kw("function") => Err(format!("line {line}: a function definition cannot be nested here")),
            Tok::Op("[") if self.is_multi_assign() => {
                self.next();
                let mut targets = Vec::new();
                while !self.is_op("]") {
                    if self.eat_op("~") {
                        targets.push(None);
                    } else {
                        targets.push(Some(self.postfix()?));
                    }
                    if matches!(self.peek(), Tok::Comma) {
                        self.next();
                    }
                }
                self.expect_op("]")?;
                self.expect_op("=")?;
                let rhs = self.expr()?;
                let print = self.end_of_statement();
                Ok(Stmt::Assign(targets, rhs, print, line))
            }
            _ => {
                let e = self.expr()?;
                if self.is_op("=") {
                    self.next();
                    if !is_lvalue(&e) {
                        return Err(format!("line {line}: the left side of = cannot be assigned"));
                    }
                    let rhs = self.expr()?;
                    let print = self.end_of_statement();
                    return Ok(Stmt::Assign(vec![Some(e)], rhs, print, line));
                }
                let print = self.end_of_statement();
                if !matches!(self.t[self.p.saturating_sub(1)].tok, Tok::Newline | Tok::Semi | Tok::Comma | Tok::Eof) && !matches!(self.peek(), Tok::Eof | Tok::Kw(_)) {
                    return Err(format!("line {line}: unexpected {} after the expression", describe(self.peek())));
                }
                Ok(Stmt::Expr(e, print, line))
            }
        }
    }

    /// "[a, b] = …": a bracket closed and followed by a single '='.
    fn is_multi_assign(&self) -> bool {
        let mut depth = 0;
        let mut k = self.p;
        while k < self.t.len() {
            match &self.t[k].tok {
                Tok::Op("[") | Tok::Op("(") | Tok::Op("{") => depth += 1,
                Tok::Op("]") | Tok::Op(")") | Tok::Op("}") => {
                    depth -= 1;
                    if depth == 0 {
                        return matches!(self.t.get(k + 1).map(|t| &t.tok), Some(Tok::Op("=")));
                    }
                }
                Tok::Newline | Tok::Eof => return false,
                _ => {}
            }
            k += 1;
        }
        false
    }

    fn expr(&mut self) -> Result<Expr, String> {
        self.oror()
    }
    fn oror(&mut self) -> Result<Expr, String> {
        let mut l = self.andand()?;
        while self.eat_op("||") {
            l = Expr::Bin(Bin::OrOr, Box::new(l), Box::new(self.andand()?));
        }
        Ok(l)
    }
    fn andand(&mut self) -> Result<Expr, String> {
        let mut l = self.or()?;
        while self.eat_op("&&") {
            l = Expr::Bin(Bin::AndAnd, Box::new(l), Box::new(self.or()?));
        }
        Ok(l)
    }
    fn or(&mut self) -> Result<Expr, String> {
        let mut l = self.and()?;
        while self.eat_op("|") {
            l = Expr::Bin(Bin::Or, Box::new(l), Box::new(self.and()?));
        }
        Ok(l)
    }
    fn and(&mut self) -> Result<Expr, String> {
        let mut l = self.cmp()?;
        while self.eat_op("&") {
            l = Expr::Bin(Bin::And, Box::new(l), Box::new(self.cmp()?));
        }
        Ok(l)
    }
    fn cmp(&mut self) -> Result<Expr, String> {
        let mut l = self.range()?;
        loop {
            let op = match self.peek() {
                Tok::Op("==") => Bin::Eq,
                Tok::Op("~=") | Tok::Op("!=") => Bin::Ne,
                Tok::Op("<") => Bin::Lt,
                Tok::Op("<=") => Bin::Le,
                Tok::Op(">") => Bin::Gt,
                Tok::Op(">=") => Bin::Ge,
                _ => return Ok(l),
            };
            self.next();
            l = Expr::Bin(op, Box::new(l), Box::new(self.range()?));
        }
    }
    fn range(&mut self) -> Result<Expr, String> {
        // A bare ':' as an index.
        if self.index_depth > 0 && self.is_op(":") && matches!(self.peek_at(1), Tok::Comma | Tok::Op(")") | Tok::Op("}")) {
            self.next();
            return Ok(Expr::Colon);
        }
        let a = self.add()?;
        if !self.is_op(":") {
            return Ok(a);
        }
        self.next();
        let b = self.add()?;
        if self.eat_op(":") {
            let c = self.add()?;
            return Ok(Expr::Range(Box::new(a), Some(Box::new(b)), Box::new(c)));
        }
        Ok(Expr::Range(Box::new(a), None, Box::new(b)))
    }
    fn add(&mut self) -> Result<Expr, String> {
        let mut l = self.mul()?;
        loop {
            // Inside brackets "a -b" was split by the lexer already.
            let op = match self.peek() {
                Tok::Op("+") => Bin::Add,
                Tok::Op("-") => Bin::Sub,
                _ => return Ok(l),
            };
            self.next();
            l = Expr::Bin(op, Box::new(l), Box::new(self.mul()?));
        }
    }
    fn mul(&mut self) -> Result<Expr, String> {
        let mut l = self.unary()?;
        loop {
            let op = match self.peek() {
                Tok::Op("*") => Bin::Mul,
                Tok::Op("/") => Bin::Div,
                Tok::Op("\\") => Bin::LDiv,
                Tok::Op(".*") => Bin::EMul,
                Tok::Op("./") => Bin::EDiv,
                Tok::Op(".\\") => Bin::ELDiv,
                _ => return Ok(l),
            };
            self.next();
            l = Expr::Bin(op, Box::new(l), Box::new(self.unary()?));
        }
    }
    fn unary(&mut self) -> Result<Expr, String> {
        match self.peek() {
            Tok::Op("-") => {
                self.next();
                Ok(Expr::Neg(Box::new(self.unary()?)))
            }
            Tok::Op("+") => {
                self.next();
                self.unary()
            }
            Tok::Op("~") | Tok::Op("!") => {
                self.next();
                Ok(Expr::Not(Box::new(self.unary()?)))
            }
            _ => self.pow(),
        }
    }
    fn pow(&mut self) -> Result<Expr, String> {
        let mut l = self.postfix()?;
        loop {
            let op = match self.peek() {
                Tok::Op("^") => Bin::Pow,
                Tok::Op(".^") => Bin::EPow,
                _ => return Ok(l),
            };
            self.next();
            // The exponent may carry a sign: 2^-1.
            let r = match self.peek() {
                Tok::Op("-") => {
                    self.next();
                    Expr::Neg(Box::new(self.postfix()?))
                }
                Tok::Op("+") => {
                    self.next();
                    self.postfix()?
                }
                Tok::Op("~") | Tok::Op("!") => {
                    self.next();
                    Expr::Not(Box::new(self.postfix()?))
                }
                _ => self.postfix()?,
            };
            l = Expr::Bin(op, Box::new(l), Box::new(r));
        }
    }
    fn args(&mut self, close: &str) -> Result<Vec<Expr>, String> {
        let mut out = Vec::new();
        self.index_depth += 1;
        let saved = self.in_matrix;
        self.in_matrix = 0;
        if self.eat_op(close) {
            self.index_depth -= 1;
            self.in_matrix = saved;
            return Ok(out);
        }
        loop {
            out.push(self.expr()?);
            match self.peek() {
                Tok::Comma => {
                    self.next();
                }
                Tok::Op(o) if *o == close => {
                    self.next();
                    break;
                }
                t => return Err(format!("line {}: expected ',' or '{close}' but found {}", self.line(), describe(t))),
            }
        }
        self.index_depth -= 1;
        self.in_matrix = saved;
        Ok(out)
    }
    fn postfix(&mut self) -> Result<Expr, String> {
        let mut e = self.primary()?;
        loop {
            // Inside brackets a space before '(' starts a new element: [a (1)] is two.
            let spaced = self.t[self.p].space_before && self.in_matrix > 0;
            match self.peek() {
                Tok::Op("(") if !spaced => {
                    self.next();
                    let a = self.args(")")?;
                    e = Expr::Index(Box::new(e), a);
                }
                Tok::Op("{") if !spaced => {
                    self.next();
                    let a = self.args("}")?;
                    e = Expr::CellIndex(Box::new(e), a);
                }
                Tok::Op(".") if !matches!(self.peek_at(1), Tok::Op(_)) || matches!(self.peek_at(1), Tok::Op("(")) => {
                    self.next();
                    match self.next() {
                        Tok::Ident(f) => e = Expr::Field(Box::new(e), f),
                        Tok::Kw(k) => e = Expr::Field(Box::new(e), k.to_string()),
                        Tok::Op("(") => {
                            let f = self.expr()?;
                            self.expect_op(")")?;
                            e = Expr::DynField(Box::new(e), Box::new(f));
                        }
                        t => return Err(format!("line {}: expected a field name after '.', found {}", self.line(), describe(&t))),
                    }
                }
                Tok::Op("'") => {
                    self.next();
                    e = Expr::Transpose(Box::new(e), true);
                }
                Tok::Op(".'") => {
                    self.next();
                    e = Expr::Transpose(Box::new(e), false);
                }
                _ => return Ok(e),
            }
        }
    }
    fn rows(&mut self, close: &str) -> Result<Vec<Vec<Expr>>, String> {
        self.in_matrix += 1;
        let saved = self.index_depth;
        let mut rows = Vec::new();
        let mut row = Vec::new();
        loop {
            match self.peek() {
                Tok::Op(o) if *o == close => {
                    self.next();
                    break;
                }
                Tok::Semi | Tok::Newline => {
                    self.next();
                    if !row.is_empty() {
                        rows.push(std::mem::take(&mut row));
                    }
                }
                Tok::Comma => {
                    self.next();
                }
                Tok::Eof => return Err(format!("line {}: '{close}' is missing", self.line())),
                _ => row.push(self.expr()?),
            }
        }
        if !row.is_empty() {
            rows.push(row);
        }
        self.in_matrix -= 1;
        self.index_depth = saved;
        Ok(rows)
    }
    fn primary(&mut self) -> Result<Expr, String> {
        let line = self.line();
        match self.next() {
            Tok::Num(v) => Ok(Expr::Num(v)),
            Tok::Imag(v) => Ok(Expr::Imag(v)),
            Tok::Str(s) | Tok::DStr(s) => Ok(Expr::Str(s)),
            Tok::Ident(n) => Ok(Expr::Ident(n)),
            Tok::Kw("end") if self.index_depth > 0 => Ok(Expr::End),
            Tok::Op("(") => {
                let saved = (self.index_depth, self.in_matrix);
                self.in_matrix = 0;
                let e = self.expr()?;
                self.expect_op(")")?;
                self.index_depth = saved.0;
                self.in_matrix = saved.1;
                // (expr) loses comma-list expansion: wrap as a one-element index-free value.
                Ok(e)
            }
            Tok::Op("[") => Ok(Expr::Matrix(self.rows("]")?)),
            Tok::Op("{") => Ok(Expr::Cell(self.rows("}")?)),
            Tok::Op(":") => Ok(Expr::Colon),
            Tok::Op("@") => {
                if self.eat_op("(") {
                    let mut params = Vec::new();
                    while !self.is_op(")") {
                        match self.next() {
                            Tok::Ident(n) => params.push(n),
                            Tok::Op("~") => params.push("~".into()),
                            Tok::Comma => {}
                            t => return Err(format!("line {line}: bad parameter {} in @( … )", describe(&t))),
                        }
                    }
                    self.next();
                    let saved = (self.index_depth, self.in_matrix);
                    self.index_depth = 0;
                    self.in_matrix = 0;
                    let body = self.expr()?;
                    self.index_depth = saved.0;
                    self.in_matrix = saved.1;
                    Ok(Expr::Anon(Rc::new(params), Rc::new(body)))
                } else {
                    match self.next() {
                        Tok::Ident(n) => {
                            let mut name = n;
                            while self.is_op(".") {
                                if let Tok::Ident(m) = self.peek_at(1).clone() {
                                    self.p += 2;
                                    name = format!("{name}.{m}");
                                } else {
                                    break;
                                }
                            }
                            Ok(Expr::Handle(name))
                        }
                        t => Err(format!("line {line}: expected a function name after @, found {}", describe(&t))),
                    }
                }
            }
            t => Err(format!("line {line}: unexpected {}", describe(&t))),
        }
    }

    fn function(&mut self) -> Result<Function, String> {
        // function [a, b] = name(x, y)  |  function a = name(x)  |  function name(x)
        let line = self.line();
        self.next();
        let mut outputs = Vec::new();
        let name;
        if self.is_op("[") {
            self.next();
            while !self.is_op("]") {
                match self.next() {
                    Tok::Ident(n) => outputs.push(n),
                    Tok::Comma => {}
                    t => return Err(format!("line {line}: bad output {}", describe(&t))),
                }
            }
            self.next();
            self.expect_op("=")?;
            name = match self.next() {
                Tok::Ident(n) => n,
                t => return Err(format!("line {line}: expected the function name, found {}", describe(&t))),
            };
        } else {
            let first = match self.next() {
                Tok::Ident(n) => n,
                t => return Err(format!("line {line}: expected the function name, found {}", describe(&t))),
            };
            if self.eat_op("=") {
                outputs.push(first);
                name = match self.next() {
                    Tok::Ident(n) => n,
                    t => return Err(format!("line {line}: expected the function name, found {}", describe(&t))),
                };
            } else {
                name = first;
            }
        }
        let mut params = Vec::new();
        if self.eat_op("(") {
            while !self.is_op(")") {
                match self.next() {
                    Tok::Ident(n) => params.push(n),
                    Tok::Op("~") => params.push("~".into()),
                    Tok::Comma => {}
                    t => return Err(format!("line {line}: bad parameter {}", describe(&t))),
                }
            }
            self.next();
        }
        let body = self.block(&["end", "function"])?;
        if self.is_kw("end") {
            self.next();
        }
        Ok(Function { name, params, outputs, body })
    }
}

fn is_lvalue(e: &Expr) -> bool {
    match e {
        Expr::Ident(_) => true,
        Expr::Index(b, _) | Expr::CellIndex(b, _) | Expr::Field(b, _) | Expr::DynField(b, _) => is_lvalue(b),
        _ => false,
    }
}

fn describe(t: &Tok) -> String {
    match t {
        Tok::Num(v) => format!("the number {v}"),
        Tok::Imag(v) => format!("the number {v}i"),
        Tok::Str(s) | Tok::DStr(s) => format!("the text '{s}'"),
        Tok::Ident(n) => format!("\"{n}\""),
        Tok::Kw(k) => format!("\"{k}\""),
        Tok::Op(o) => format!("'{o}'"),
        Tok::Newline => "the end of the line".into(),
        Tok::Semi => "';'".into(),
        Tok::Comma => "','".into(),
        Tok::Eof => "the end of the script".into(),
    }
}

/// Parses a script: statements, then (anywhere) function definitions.
pub fn parse(src: &str) -> Result<Program, String> {
    let tokens = lex(src)?;
    let mut p = Parser { t: tokens, p: 0, index_depth: 0, in_matrix: 0 };
    let mut body = Vec::new();
    let mut functions = Vec::new();
    loop {
        p.skip_newlines();
        match p.peek() {
            Tok::Eof => break,
            Tok::Kw("function") => functions.push(Rc::new(p.function()?)),
            Tok::Kw(k @ ("end" | "else" | "elseif" | "case" | "otherwise" | "catch" | "until")) => return Err(format!("line {}: \"{k}\" without an opening statement", p.line())),
            _ => body.push(p.statement()?),
        }
    }
    Ok(Program { body, functions })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn toks(s: &str) -> Vec<Tok> {
        lex(s).unwrap().into_iter().map(|t| t.tok).filter(|t| !matches!(t, Tok::Newline | Tok::Eof)).collect()
    }

    #[test]
    fn brackets_split_on_spaces() {
        assert_eq!(toks("[1 -2]"), vec![Tok::Op("["), Tok::Num(1.0), Tok::Comma, Tok::Op("-"), Tok::Num(2.0), Tok::Op("]")]);
        assert_eq!(toks("[1 - 2]"), vec![Tok::Op("["), Tok::Num(1.0), Tok::Op("-"), Tok::Num(2.0), Tok::Op("]")]);
        assert_eq!(toks("[a' b']").len(), 7);
        assert_eq!(toks("x = 'it''s'"), vec![Tok::Ident("x".into()), Tok::Op("="), Tok::Str("it's".into())]);
        assert_eq!(toks("a.' + 1./x"), vec![Tok::Ident("a".into()), Tok::Op(".'"), Tok::Op("+"), Tok::Num(1.0), Tok::Op("./"), Tok::Ident("x".into())]);
        assert_eq!(toks("hold on"), vec![Tok::Ident("hold".into()), Tok::Op("("), Tok::Str("on".into()), Tok::Op(")")]);
        assert_eq!(toks("z = 3i"), vec![Tok::Ident("z".into()), Tok::Op("="), Tok::Imag(3.0)]);
    }

    #[test]
    fn parses_a_script_with_functions() {
        let p = parse("x = [1 2; 3 4];\nfor k = 1:numel(x)\n  if x(k) > 2, disp(k), end\nend\n[m, i] = max(x(:));\nfunction y = sq(v)\n  y = v.^2;\nend\n").unwrap();
        assert_eq!(p.body.len(), 3);
        assert_eq!(p.functions[0].name, "sq");
        assert!(parse("y = (1 + 2").is_err());
    }
}
