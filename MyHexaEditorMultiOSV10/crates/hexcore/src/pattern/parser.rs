//! The template language's syntax tree and parser.
use super::lexer::{lex, PErr, Tok, Token};
use std::collections::HashMap;

pub type Pos = (u32, u32);

#[derive(Clone, Debug)]
pub struct Expr {
    pub k: E,
    pub pos: Pos,
}

#[derive(Clone, Debug)]
pub enum E {
    Int(i128),
    Float(f64),
    Str(String),
    Dollar,
    Ident(String),
    /// `Enum::Member`
    Scope(String, String),
    Unary(&'static str, Box<Expr>),
    Binary(&'static str, Box<Expr>, Box<Expr>),
    Ternary(Box<Expr>, Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
    Member(Box<Expr>, String),
    Index(Box<Expr>, Box<Expr>),
}

#[derive(Clone, Debug)]
pub struct TypeRef {
    pub name: String,
    /// Some(true): `be`, Some(false): `le`.
    pub endian: Option<bool>,
}

#[derive(Clone, Debug)]
pub enum ArrayLen {
    None,
    Count(Expr),
    While(Expr),
    /// `[]`: a text up to (and with) its terminating zero.
    Open,
}

#[derive(Clone, Debug)]
pub struct Attr {
    pub name: String,
    pub arg: Option<Expr>,
}

#[derive(Clone, Debug)]
pub struct Decl {
    pub ty: TypeRef,
    pub name: String,
    pub array: ArrayLen,
    /// Further dimensions of `T a[n][m]…` (each `ArrayLen::Count`); `array` is the outermost.
    pub dims: Vec<ArrayLen>,
    pub at: Option<Expr>,
    pub attrs: Vec<Attr>,
}

/// `fn name(a, b) { … return expr; }`
#[derive(Clone, Debug)]
pub struct FnDef {
    pub name: String,
    pub params: Vec<String>,
    pub body: Vec<Stmt>,
}

#[derive(Clone, Debug)]
pub struct Stmt {
    pub k: S,
    pub pos: Pos,
}

#[derive(Clone, Debug)]
pub enum S {
    Decl(Decl),
    If(Expr, Box<Stmt>, Option<Box<Stmt>>),
    While(Expr, Box<Stmt>),
    For(Option<Box<Stmt>>, Option<Expr>, Option<Box<Stmt>>, Box<Stmt>),
    Let(String, Expr),
    Assign(String, &'static str, Expr),
    Expr(Expr),
    Break,
    Continue,
    Return(Option<Expr>),
    Block(Vec<Stmt>),
    Endian(bool),
    Nop,
}

#[derive(Clone, Debug)]
pub struct StructDef {
    pub name: String,
    pub body: Vec<Stmt>,
    pub union: bool,
    pub attrs: Vec<Attr>,
}

#[derive(Clone, Debug)]
pub struct EnumDef {
    pub name: String,
    pub base: TypeRef,
    pub members: Vec<(String, i128)>,
}

#[derive(Clone, Debug)]
pub struct BitfieldDef {
    pub name: String,
    pub fields: Vec<(String, Expr)>,
    pub attrs: Vec<Attr>,
}

#[derive(Default, Debug)]
pub struct Program {
    pub structs: HashMap<String, StructDef>,
    pub enums: HashMap<String, EnumDef>,
    pub bitfields: HashMap<String, BitfieldDef>,
    pub aliases: HashMap<String, TypeRef>,
    pub functions: HashMap<String, FnDef>,
    pub body: Vec<Stmt>,
}

const KEYWORDS: &[&str] = &[
    "if", "else", "while", "for", "let", "local", "break", "continue", "return", "struct", "union", "enum", "bitfield", "using", "typedef", "endian",
    "be", "le", "true", "false",
];

struct P {
    t: Vec<Token>,
    i: usize,
    prog: Program,
}

type R<T> = Result<T, PErr>;

impl P {
    fn peek(&self, n: usize) -> &Tok {
        &self.t[(self.i + n).min(self.t.len() - 1)].tok
    }
    fn pos(&self) -> Pos {
        let t = &self.t[self.i.min(self.t.len() - 1)];
        (t.line, t.col)
    }
    fn err<T>(&self, message: impl Into<String>) -> R<T> {
        let (line, col) = self.pos();
        Err(PErr { line, col, message: message.into() })
    }
    fn is(&self, p: &str) -> bool {
        matches!(self.peek(0), Tok::Punct(x) if *x == p)
    }
    fn is_at(&self, n: usize, p: &str) -> bool {
        matches!(self.peek(n), Tok::Punct(x) if *x == p)
    }
    fn is_kw(&self, k: &str) -> bool {
        matches!(self.peek(0), Tok::Ident(x) if x == k)
    }
    fn eat(&mut self, p: &str) -> bool {
        if self.is(p) {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn expect(&mut self, p: &str) -> R<()> {
        if self.eat(p) {
            Ok(())
        } else {
            let found = describe(self.peek(0));
            self.err(format!("expected '{p}', found {found}"))
        }
    }
    fn ident(&mut self) -> R<String> {
        match self.peek(0).clone() {
            Tok::Ident(s) => {
                self.i += 1;
                Ok(s)
            }
            other => self.err(format!("expected a name, found {}", describe(&other))),
        }
    }
    fn is_plain_ident(&self, n: usize) -> bool {
        matches!(self.peek(n), Tok::Ident(x) if !KEYWORDS.contains(&x.as_str()))
    }

    // ── statements

    fn program(&mut self) -> R<()> {
        while !matches!(self.peek(0), Tok::Eof) {
            if let Some(stmt) = self.item()? {
                self.prog.body.push(stmt);
            }
        }
        Ok(())
    }

    /// A definition (registered, returns None) or a statement.
    fn item(&mut self) -> R<Option<Stmt>> {
        let pos = self.pos();
        if (self.is_kw("struct") || self.is_kw("union")) && self.is_plain_ident(1) && self.is_at(2, "{") {
            let union = self.is_kw("union");
            self.i += 1;
            let name = self.ident()?;
            let body = self.block_body()?;
            let attrs = self.attrs_any()?;
            self.eat(";");
            self.prog.structs.insert(name.clone(), StructDef { name, body, union, attrs });
            return Ok(None);
        }
        if self.is_kw("enum") {
            self.i += 1;
            let mut base = TypeRef { name: "u32".into(), endian: None };
            if self.eat("<") {
                base = self.type_ref()?;
                self.expect(">")?;
            }
            let name = self.ident()?;
            if self.eat(":") {
                base = self.type_ref()?;
            }
            self.expect("{")?;
            let mut members = Vec::new();
            let mut next: i128 = 0;
            while !self.eat("}") {
                let member = self.ident()?;
                if self.eat("=") {
                    let e = self.expr()?;
                    next = const_eval(&e, &members).ok_or_else(|| PErr { line: e.pos.0, col: e.pos.1, message: "an enum value must be a constant".into() })?;
                }
                members.push((member, next));
                next += 1;
                if !self.eat(",") {
                    self.expect("}")?;
                    break;
                }
            }
            self.eat(";");
            self.prog.enums.insert(name.clone(), EnumDef { name, base, members });
            return Ok(None);
        }
        if self.is_kw("bitfield") {
            self.i += 1;
            let name = self.ident()?;
            self.expect("{")?;
            let mut fields = Vec::new();
            while !self.eat("}") {
                let field = self.ident()?;
                self.expect(":")?;
                let width = self.expr()?;
                self.expect(";")?;
                fields.push((field, width));
            }
            let attrs = self.attrs_any()?;
            self.eat(";");
            self.prog.bitfields.insert(name.clone(), BitfieldDef { name, fields, attrs });
            return Ok(None);
        }
        if self.is_kw("fn") && self.is_plain_ident(1) && self.is_at(2, "(") {
            self.i += 1;
            let name = self.ident()?;
            self.expect("(")?;
            let mut params = Vec::new();
            while !self.eat(")") {
                // `fn f(u32 a)`: a type before the name is allowed and ignored.
                if self.is_plain_ident(0) && self.is_plain_ident(1) {
                    self.i += 1;
                }
                params.push(self.ident()?);
                if !self.eat(",") {
                    self.expect(")")?;
                    break;
                }
            }
            let body = self.block_body()?;
            self.eat(";");
            self.prog.functions.insert(name.clone(), FnDef { name, params, body });
            return Ok(None);
        }
        if self.is_kw("using") {
            self.i += 1;
            let name = self.ident()?;
            self.expect("=")?;
            let ty = self.type_ref()?;
            self.expect(";")?;
            self.prog.aliases.insert(name, ty);
            return Ok(None);
        }
        if self.is_kw("typedef") {
            self.i += 1;
            let ty = self.type_ref()?;
            let name = self.ident()?;
            self.expect(";")?;
            self.prog.aliases.insert(name, ty);
            return Ok(None);
        }
        let _ = pos;
        self.stmt().map(Some)
    }

    fn block_body(&mut self) -> R<Vec<Stmt>> {
        self.expect("{")?;
        let mut body = Vec::new();
        while !self.eat("}") {
            if matches!(self.peek(0), Tok::Eof) {
                return self.err("missing '}'");
            }
            if let Some(s) = self.item()? {
                body.push(s);
            }
        }
        Ok(body)
    }

    fn body(&mut self) -> R<Stmt> {
        let pos = self.pos();
        if self.is("{") {
            Ok(Stmt { k: S::Block(self.block_body()?), pos })
        } else {
            match self.item()? {
                Some(s) => Ok(s),
                None => Ok(Stmt { k: S::Nop, pos }),
            }
        }
    }

    fn stmt(&mut self) -> R<Stmt> {
        let pos = self.pos();
        let k = match self.peek(0).clone() {
            Tok::Pragma(text) => {
                self.i += 1;
                let words: Vec<&str> = text.split_whitespace().collect();
                if words.first() == Some(&"pragma") && words.get(1) == Some(&"endian") {
                    match words.get(2) {
                        Some(&"big") => S::Endian(true),
                        Some(&"little") => S::Endian(false),
                        _ => S::Nop,
                    }
                } else {
                    S::Nop
                }
            }
            Tok::Punct(";") => {
                self.i += 1;
                S::Nop
            }
            Tok::Punct("{") => S::Block(self.block_body()?),
            Tok::Punct("[") if self.is_at(1, "[") => self.decl_list()?,
            Tok::Punct("<") => self.decl_list()?,
            Tok::Ident(word) => match word.as_str() {
                "if" => {
                    self.i += 1;
                    self.expect("(")?;
                    let cond = self.expr()?;
                    self.expect(")")?;
                    let then = self.body()?;
                    let other = if self.is_kw("else") {
                        self.i += 1;
                        Some(Box::new(self.body()?))
                    } else {
                        None
                    };
                    S::If(cond, Box::new(then), other)
                }
                "while" => {
                    self.i += 1;
                    self.expect("(")?;
                    let cond = self.expr()?;
                    self.expect(")")?;
                    S::While(cond, Box::new(self.body()?))
                }
                "for" => {
                    self.i += 1;
                    self.expect("(")?;
                    let init = if self.is(";") { None } else { Some(Box::new(self.simple()?)) };
                    self.expect(";")?;
                    let cond = if self.is(";") { None } else { Some(self.expr()?) };
                    self.expect(";")?;
                    let step = if self.is(")") { None } else { Some(Box::new(self.simple()?)) };
                    self.expect(")")?;
                    S::For(init, cond, step, Box::new(self.body()?))
                }
                "break" => {
                    self.i += 1;
                    self.expect(";")?;
                    S::Break
                }
                "continue" => {
                    self.i += 1;
                    self.expect(";")?;
                    S::Continue
                }
                "return" => {
                    self.i += 1;
                    let value = if self.is(";") { None } else { Some(self.expr()?) };
                    self.expect(";")?;
                    S::Return(value)
                }
                "endian" => {
                    self.i += 1;
                    let which = self.ident()?;
                    self.expect(";")?;
                    match which.as_str() {
                        "big" => S::Endian(true),
                        "little" => S::Endian(false),
                        _ => return self.err("endian big or endian little"),
                    }
                }
                "let" | "local" | "be" | "le" | "struct" | "union" | "enum" | "unsigned" | "signed" => {
                    if word == "let" || word == "local" {
                        let s = self.simple()?;
                        self.expect(";")?;
                        return Ok(s);
                    }
                    self.decl_list()?
                }
                _ if self.is_plain_ident(1) => self.decl_list()?,
                _ => {
                    let s = self.simple()?;
                    self.expect(";")?;
                    return Ok(s);
                }
            },
            _ => {
                let s = self.simple()?;
                self.expect(";")?;
                return Ok(s);
            }
        };
        Ok(Stmt { k, pos })
    }

    /// let / assignment / increment / expression, without the ';'.
    fn simple(&mut self) -> R<Stmt> {
        let pos = self.pos();
        if self.is_kw("let") || self.is_kw("local") {
            self.i += 1;
            // `local int i = 0;`: a type before the name is allowed and ignored.
            if self.is_plain_ident(0) && self.is_plain_ident(1) {
                self.i += 1;
            }
            let name = self.ident()?;
            let value = if self.eat("=") { self.expr()? } else { Expr { k: E::Int(0), pos } };
            return Ok(Stmt { k: S::Let(name, value), pos });
        }
        if self.is("++") || self.is("--") {
            let op = if self.is("++") { "+" } else { "-" };
            self.i += 1;
            let name = self.ident()?;
            return Ok(Stmt { k: S::Assign(name, op, Expr { k: E::Int(1), pos }), pos });
        }
        if self.is_plain_ident(0) {
            let ops = ["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="];
            if let Tok::Punct(p) = self.peek(1).clone() {
                if let Some(op) = ops.iter().find(|o| **o == p) {
                    let name = self.ident()?;
                    self.i += 1;
                    let value = self.expr()?;
                    let bin: &'static str = match *op { "=" => "=", "+=" => "+", "-=" => "-", "*=" => "*", "/=" => "/", "%=" => "%", "&=" => "&", "|=" => "|", "^=" => "^", "<<=" => "<<", _ => ">>" };
                    return Ok(Stmt { k: S::Assign(name, bin, value), pos });
                }
                if p == "++" || p == "--" {
                    let name = self.ident()?;
                    self.i += 1;
                    return Ok(Stmt { k: S::Assign(name, if p == "++" { "+" } else { "-" }, Expr { k: E::Int(1), pos }), pos });
                }
            }
        }
        Ok(Stmt { k: S::Expr(self.expr()?), pos })
    }

    fn type_ref(&mut self) -> R<TypeRef> {
        let mut endian = None;
        if self.is_kw("be") {
            endian = Some(true);
            self.i += 1;
        } else if self.is_kw("le") {
            endian = Some(false);
            self.i += 1;
        }
        if self.is_kw("struct") || self.is_kw("union") || self.is_kw("enum") {
            self.i += 1;
        }
        let mut name = self.ident()?;
        if name == "unsigned" || name == "signed" {
            let signed = name == "signed";
            let next = if self.is_plain_ident(0) && !self.is_plain_ident(1) { String::new() } else if self.is_plain_ident(0) { self.ident()? } else { String::new() };
            let mut next = next;
            if next == "long" && self.is_kw("long") {
                self.i += 1;
                next = "longlong".into();
            }
            name = match (signed, next.as_str()) {
                (false, "char") => "u8",
                (true, "char") => "s8",
                (false, "short") => "u16",
                (true, "short") => "s16",
                (false, "longlong") => "u64",
                (true, "longlong") => "s64",
                (false, _) => "u32",
                (true, _) => "s32",
            }
            .into();
        }
        Ok(TypeRef { name, endian })
    }

    fn attrs_any(&mut self) -> R<Vec<Attr>> {
        let mut attrs = Vec::new();
        loop {
            if self.is("[") && self.is_at(1, "[") {
                self.i += 2;
                while !self.is("]") {
                    let name = self.ident()?;
                    let arg = if self.eat("(") {
                        let e = self.expr()?;
                        self.expect(")")?;
                        Some(e)
                    } else {
                        None
                    };
                    attrs.push(Attr { name, arg });
                    if !self.eat(",") {
                        break;
                    }
                }
                self.expect("]")?;
                self.expect("]")?;
            } else if self.is("<") {
                self.i += 1;
                while !self.is(">") {
                    let name = self.ident()?;
                    let arg = if self.eat("=") { Some(self.unary()?) } else { None };
                    let name = match name.as_str() { "bgcolor" | "fgcolor" => "color".to_string(), _ => name };
                    attrs.push(Attr { name, arg });
                    if !self.eat(",") {
                        break;
                    }
                }
                self.expect(">")?;
            } else {
                return Ok(attrs);
            }
        }
    }

    fn decl_list(&mut self) -> R<S> {
        // Several names (`u8 a, b;`) become a block of declarations.
        let lead = self.attrs_any()?;
        let ty = self.type_ref()?;
        let mut decls = Vec::new();
        loop {
            let name = self.ident()?;
            let mut array = ArrayLen::None;
            if self.is("[") && !self.is_at(1, "[") {
                self.i += 1;
                if self.eat("]") {
                    array = ArrayLen::Open;
                } else if self.is_kw("while") {
                    self.i += 1;
                    self.expect("(")?;
                    let cond = self.expr()?;
                    self.expect(")")?;
                    self.expect("]")?;
                    array = ArrayLen::While(cond);
                } else {
                    let n = self.expr()?;
                    self.expect("]")?;
                    array = ArrayLen::Count(n);
                }
            }
            let mut dims = Vec::new();
            while !matches!(array, ArrayLen::None) && self.is("[") && !self.is_at(1, "[") {
                self.i += 1;
                if self.is("]") || self.is_kw("while") {
                    return self.err("an inner array dimension needs a size: a[n][m]");
                }
                let n = self.expr()?;
                self.expect("]")?;
                dims.push(ArrayLen::Count(n));
            }
            let mut attrs = lead.clone();
            attrs.extend(self.attrs_any()?);
            let at = if self.eat("@") { Some(self.expr()?) } else { None };
            attrs.extend(self.attrs_any()?);
            decls.push(Decl { ty: ty.clone(), name, array, dims, at, attrs });
            if !self.eat(",") {
                break;
            }
        }
        self.expect(";")?;
        if decls.len() == 1 {
            return Ok(S::Decl(decls.pop().unwrap()));
        }
        // `u8 a, b;`: a block of declarations (blocks run in the same scope).
        let pos = self.pos();
        Ok(S::Block(decls.into_iter().map(|d| Stmt { k: S::Decl(d), pos }).collect()))
    }

    // ── expressions

    fn expr(&mut self) -> R<Expr> {
        let pos = self.pos();
        let cond = self.binary(1)?;
        if self.eat("?") {
            let a = self.expr()?;
            self.expect(":")?;
            let b = self.expr()?;
            return Ok(Expr { k: E::Ternary(Box::new(cond), Box::new(a), Box::new(b)), pos });
        }
        Ok(cond)
    }

    fn binary(&mut self, min: u8) -> R<Expr> {
        let mut left = self.unary()?;
        loop {
            let (op, prec) = match self.peek(0) {
                Tok::Punct(p) => match *p {
                    "||" => ("||", 1),
                    "&&" => ("&&", 2),
                    "|" => ("|", 3),
                    "^" => ("^", 4),
                    "&" => ("&", 5),
                    "==" => ("==", 6),
                    "!=" => ("!=", 6),
                    "<" => ("<", 7),
                    "<=" => ("<=", 7),
                    ">" => (">", 7),
                    ">=" => (">=", 7),
                    "<<" => ("<<", 8),
                    ">>" => (">>", 8),
                    "+" => ("+", 9),
                    "-" => ("-", 9),
                    "*" => ("*", 10),
                    "/" => ("/", 10),
                    "%" => ("%", 10),
                    _ => return Ok(left),
                },
                _ => return Ok(left),
            };
            if prec < min {
                return Ok(left);
            }
            let pos = self.pos();
            self.i += 1;
            let right = self.binary(prec + 1)?;
            left = Expr { k: E::Binary(op, Box::new(left), Box::new(right)), pos };
        }
    }

    fn unary(&mut self) -> R<Expr> {
        let pos = self.pos();
        for op in ["-", "!", "~", "+"] {
            if self.eat(op) {
                let inner = self.unary()?;
                return Ok(if op == "+" { inner } else { Expr { k: E::Unary(op, Box::new(inner)), pos } });
            }
        }
        self.postfix()
    }

    fn postfix(&mut self) -> R<Expr> {
        let mut e = self.primary()?;
        loop {
            let pos = self.pos();
            if self.eat(".") || self.eat("->") {
                let name = self.ident()?;
                e = Expr { k: E::Member(Box::new(e), name), pos };
            } else if self.is("[") && !self.is_at(1, "[") {
                self.i += 1;
                let index = self.expr()?;
                self.expect("]")?;
                e = Expr { k: E::Index(Box::new(e), Box::new(index)), pos };
            } else {
                return Ok(e);
            }
        }
    }

    fn primary(&mut self) -> R<Expr> {
        let pos = self.pos();
        let tok = self.peek(0).clone();
        self.i += 1;
        let k = match tok {
            Tok::Int(v) => E::Int(v as i128),
            Tok::Char(v) => E::Int(v as i128),
            Tok::Float(v) => E::Float(v),
            Tok::Str(s) => E::Str(s),
            Tok::Punct("$") => E::Dollar,
            Tok::Punct("(") => {
                let e = self.expr()?;
                self.expect(")")?;
                return Ok(e);
            }
            Tok::Ident(name) => match name.as_str() {
                "true" => E::Int(1),
                "false" => E::Int(0),
                _ if self.is("(") => {
                    self.i += 1;
                    let mut args = Vec::new();
                    while !self.eat(")") {
                        args.push(self.expr()?);
                        if !self.eat(",") {
                            self.expect(")")?;
                            break;
                        }
                    }
                    E::Call(name, args)
                }
                _ if self.is("::") => {
                    self.i += 1;
                    let member = self.ident()?;
                    E::Scope(name, member)
                }
                _ => E::Ident(name),
            },
            other => {
                self.i -= 1;
                return self.err(format!("unexpected {}", describe(&other)));
            }
        };
        Ok(Expr { k, pos })
    }
}

fn describe(tok: &Tok) -> String {
    match tok {
        Tok::Ident(s) => format!("'{s}'"),
        Tok::Int(v) => v.to_string(),
        Tok::Float(v) => v.to_string(),
        Tok::Str(s) => format!("\"{s}\""),
        Tok::Char(_) => "a character".into(),
        Tok::Punct(p) => format!("'{p}'"),
        Tok::Pragma(_) => "#…".into(),
        Tok::Eof => "the end".into(),
    }
}

/// Constant integer expressions (enum values).
fn const_eval(e: &Expr, members: &[(String, i128)]) -> Option<i128> {
    Some(match &e.k {
        E::Int(v) => *v,
        E::Ident(name) => members.iter().rev().find(|(n, _)| n == name)?.1,
        E::Unary("-", a) => -const_eval(a, members)?,
        E::Unary("~", a) => !const_eval(a, members)?,
        E::Binary(op, a, b) => {
            let (a, b) = (const_eval(a, members)?, const_eval(b, members)?);
            match *op {
                "+" => a + b,
                "-" => a - b,
                "*" => a * b,
                "/" if b != 0 => a / b,
                "<<" => a << (b & 127),
                ">>" => a >> (b & 127),
                "|" => a | b,
                "&" => a & b,
                "^" => a ^ b,
                _ => return None,
            }
        }
        _ => return None,
    })
}

pub fn parse(src: &str) -> Result<Program, PErr> {
    let t = lex(src)?;
    let mut p = P { t, i: 0, prog: Program::default() };
    p.program()?;
    Ok(p.prog)
}
