//! Runs a parsed template over the data and builds the node tree.
use super::parser::{ArrayLen, Attr, Decl, Expr, FnDef, Pos, Program, Stmt, TypeRef, E, S};
use crate::doc::Bytes;
use crate::util::Progress;
use serde_json::{json, Value};
use std::collections::HashMap;

const MAX_ITERATIONS: u64 = 1_000_000;
/// Children kept per array (the rest are summed up in one "…" node).
const MAX_ELEMENTS: usize = 10_000;
/// Numeric arrays up to this many elements get a node per element; longer ones (and byte arrays) one node.
const SMALL_ARRAY: u64 = 64;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Prim {
    U(u8),
    S(u8),
    F16,
    F32,
    F64,
    Bool,
    Char,
    WChar,
    Uleb,
    Sleb,
}

impl Prim {
    fn size(self) -> u64 {
        match self {
            Prim::U(n) | Prim::S(n) => n as u64,
            Prim::F16 | Prim::WChar => 2,
            Prim::F32 => 4,
            Prim::F64 => 8,
            Prim::Bool | Prim::Char => 1,
            Prim::Uleb | Prim::Sleb => 0,
        }
    }
}

pub fn prim_of(name: &str) -> Option<Prim> {
    Some(match name {
        "u8" | "uint8" | "uint8_t" | "uchar" | "byte" | "ubyte" | "UCHAR" | "BYTE" => Prim::U(1),
        "s8" | "i8" | "int8" | "int8_t" | "schar" | "sbyte" => Prim::S(1),
        "char" | "CHAR" => Prim::Char,
        "u16" | "uint16" | "uint16_t" | "ushort" | "word" | "WORD" | "USHORT" => Prim::U(2),
        "s16" | "i16" | "int16" | "int16_t" | "short" | "SHORT" => Prim::S(2),
        "u24" | "uint24" => Prim::U(3),
        "s24" | "i24" | "int24" => Prim::S(3),
        "u32" | "uint32" | "uint32_t" | "uint" | "ulong" | "dword" | "DWORD" | "UINT" | "ULONG" => Prim::U(4),
        "s32" | "i32" | "int32" | "int32_t" | "int" | "long" | "INT" | "LONG" => Prim::S(4),
        "u48" => Prim::U(6),
        "s48" => Prim::S(6),
        "u64" | "uint64" | "uint64_t" | "uquad" | "qword" | "QWORD" | "UINT64" => Prim::U(8),
        "s64" | "i64" | "int64" | "int64_t" | "quad" | "INT64" => Prim::S(8),
        "f16" | "half" | "hfloat" => Prim::F16,
        "f32" | "float" | "FLOAT" => Prim::F32,
        "f64" | "double" | "DOUBLE" => Prim::F64,
        "bool" | "BOOL" => Prim::Bool,
        "wchar" | "wchar_t" | "char16" | "WCHAR" => Prim::WChar,
        "uleb128" | "uLEB128" => Prim::Uleb,
        "sleb128" | "sLEB128" => Prim::Sleb,
        _ => return None,
    })
}

#[derive(Clone, Debug)]
pub enum Val {
    Int(i128),
    Float(f64),
    Str(String),
    Node(usize),
    Void,
}

#[derive(Clone, Debug)]
enum NK {
    Int(i128),
    Float(f64),
    Bool(bool),
    Char(u32),
    Str(String),
    Enum(Option<String>, i128),
    /// One node for a run of numbers: the element type and a preview of the first bytes.
    Bytes { elem: Prim, big: bool, preview: String },
    Struct,
    Array,
    More(usize),
}

#[derive(Clone, Debug)]
struct RNode {
    /// The name lookups use (the declared one).
    key: String,
    /// The name shown (`[[name(...)]]` may change it).
    name: String,
    ty: String,
    offset: u64,
    size: u64,
    kind: NK,
    color: Option<String>,
    comment: Option<String>,
    children: Vec<usize>,
    hidden: bool,
}

enum Binding {
    Node(usize),
    Local(Val),
}

struct Frame {
    names: HashMap<String, Binding>,
    children: Vec<usize>,
    union_start: Option<u64>,
    union_end: u64,
}

impl Frame {
    fn new(union_start: Option<u64>) -> Self {
        Frame { names: HashMap::new(), children: Vec::new(), union_start, union_end: union_start.unwrap_or(0) }
    }
}

pub enum Fail {
    Err(Pos, String),
    Cancelled,
}

enum Flow {
    Normal,
    Break,
    Continue,
    Return,
}

enum Kind<'p> {
    Prim(Prim),
    Struct(&'p super::parser::StructDef),
    Enum(&'p super::parser::EnumDef),
    Bitfield(&'p super::parser::BitfieldDef),
}

pub struct Ctx<'a, 'p> {
    src: &'a dyn Bytes,
    len: u64,
    prog: &'a Program,
    nodes: Vec<RNode>,
    frames: Vec<Frame>,
    cursor: u64,
    big: bool,
    iterations: u64,
    max_nodes: usize,
    progress: &'a mut Progress<'p>,
    pending: Option<Fail>,
    pub warnings: Vec<(Pos, String)>,
    /// The value of the last `return expr;` (taken by the function call).
    ret: Option<Val>,
    /// Depth of user function calls.
    depth: usize,
    /// The struct bodies being read, outermost first: (frame index, struct node); the root is (0, None).
    scopes: Vec<(usize, Option<usize>)>,
}

/// How deep user functions may call each other.
const MAX_CALL_DEPTH: usize = 64;

type R<T> = Result<T, Fail>;

fn fail<T>(pos: Pos, message: impl Into<String>) -> R<T> {
    Err(Fail::Err(pos, message.into()))
}

const COLOR_NAMES: &[(&str, &str)] = &[
    ("red", "#e5484d"), ("green", "#30a46c"), ("blue", "#3b82f6"), ("yellow", "#eab308"), ("orange", "#f97316"), ("purple", "#8b5cf6"),
    ("violet", "#8b5cf6"), ("cyan", "#06b6d4"), ("aqua", "#06b6d4"), ("magenta", "#d946ef"), ("pink", "#ec4899"), ("brown", "#a16207"),
    ("gray", "#888888"), ("grey", "#888888"), ("white", "#ffffff"), ("black", "#000000"), ("teal", "#14b8a6"), ("lime", "#84cc16"),
    ("cRed", "#e5484d"), ("cGreen", "#30a46c"), ("cBlue", "#3b82f6"), ("cYellow", "#eab308"), ("cPurple", "#8b5cf6"), ("cAqua", "#06b6d4"),
];

fn color_text(v: &Val) -> Option<String> {
    match v {
        Val::Int(n) => Some(format!("#{:06x}", (*n as u64) & 0xFF_FFFF)),
        Val::Str(s) => {
            let t = s.trim();
            if let Some((_, hex)) = COLOR_NAMES.iter().find(|(n, _)| n.eq_ignore_ascii_case(t)) {
                return Some(hex.to_string());
            }
            let h = t.trim_start_matches('#').trim_start_matches("0x");
            if (h.len() == 6 || h.len() == 8) && h.chars().all(|c| c.is_ascii_hexdigit()) {
                Some(format!("#{}", h[..6].to_ascii_lowercase()))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn quote(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 || (0x7F..0xA0).contains(&(c as u32)) => out.push_str(&format!("\\x{:02X}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn int_text(v: i128, size: u64) -> String {
    let bits = (size.clamp(1, 16) * 8) as u32;
    let mask: u128 = if bits >= 128 { u128::MAX } else { (1u128 << bits) - 1 };
    format!("{v} (0x{:X})", (v as u128) & mask)
}

fn type_size(prog: &Program, name: &str) -> Option<u64> {
    let mut n = name.to_string();
    for _ in 0..16 {
        if let Some(p) = prim_of(&n) {
            return Some(p.size()).filter(|s| *s > 0);
        }
        if let Some(e) = prog.enums.get(&n) {
            n = e.base.name.clone();
            continue;
        }
        if let Some(a) = prog.aliases.get(&n) {
            n = a.name.clone();
            continue;
        }
        return None;
    }
    None
}

/// A constant integer expression (array sizes in `sizeof(Type)`).
fn const_int(e: &Expr) -> Option<i128> {
    match &e.k {
        E::Int(v) => Some(*v),
        E::Unary("-", a) => const_int(a).map(|v| -v),
        E::Unary("~", a) => const_int(a).map(|v| !v),
        E::Binary(op, a, b) => {
            let (x, y) = (const_int(a)?, const_int(b)?);
            Some(match *op {
                "+" => x.checked_add(y)?,
                "-" => x.checked_sub(y)?,
                "*" => x.checked_mul(y)?,
                "/" => x.checked_div(y)?,
                "%" => x.checked_rem(y)?,
                "<<" if (0..64).contains(&y) => x << y,
                ">>" if (0..127).contains(&y) => x >> y,
                "&" => x & y,
                "|" => x | y,
                "^" => x ^ y,
                _ => return None,
            })
        }
        _ => None,
    }
}

/// The size of a type known without reading: numbers, enums, bit fields with constant widths, and structs whose
/// fields all have such types and constant array sizes (unions: the largest member). Err says why not.
fn static_size(prog: &Program, name: &str, depth: u32) -> Result<u64, String> {
    if depth > 32 {
        return Err(format!("'{name}' contains itself"));
    }
    if let Some(s) = type_size(prog, name) {
        return Ok(s);
    }
    let mut n = name.to_string();
    for _ in 0..16 {
        match prog.aliases.get(&n) {
            Some(a) => n = a.name.clone(),
            None => break,
        }
    }
    if let Some(p) = prim_of(&n) {
        return if p.size() > 0 { Ok(p.size()) } else { Err(format!("'{n}' has a variable length")) };
    }
    if let Some(b) = prog.bitfields.get(&n) {
        let mut bits: i128 = 0;
        for (f, w) in &b.fields {
            bits += const_int(w).ok_or_else(|| format!("the width of bit field '{f}' is not a constant"))?.clamp(0, 64);
        }
        return Ok(((bits as u64).div_ceil(8)).clamp(1, 8));
    }
    if let Some(s) = prog.structs.get(&n) {
        let mut acc = 0u64;
        body_size(prog, &s.body, depth, s.union, &mut acc)?;
        return Ok(acc);
    }
    if prog.enums.contains_key(&n) {
        return type_size(prog, &n).ok_or_else(|| format!("'{n}' has a variable length"));
    }
    Err(format!("unknown type '{name}'"))
}

fn body_size(prog: &Program, body: &[Stmt], depth: u32, union: bool, acc: &mut u64) -> Result<(), String> {
    for st in body {
        match &st.k {
            S::Decl(d) => {
                if d.at.is_some() {
                    continue;
                }
                let elem = static_size(prog, &d.ty.name, depth + 1).map_err(|why| format!("field '{}': {why}", d.name))?;
                let mut count: u64 = 1;
                for dim in std::iter::once(&d.array).chain(d.dims.iter()) {
                    match dim {
                        ArrayLen::None => {}
                        ArrayLen::Count(e) => {
                            let n = const_int(e).filter(|n| *n >= 0).ok_or_else(|| format!("the array '{}' is sized by a value read from the data", d.name))?;
                            count = count.saturating_mul(n as u64);
                        }
                        _ => return Err(format!("the array '{}' ends where the data says", d.name)),
                    }
                }
                let size = elem.saturating_mul(count);
                *acc = if union { (*acc).max(size) } else { acc.saturating_add(size) };
            }
            S::Block(list) => body_size(prog, list, depth, union, acc)?,
            S::If(..) | S::While(..) | S::For(..) => return Err("it has fields that depend on conditions or loops".into()),
            _ => {}
        }
    }
    Ok(())
}

impl<'a, 'p> Ctx<'a, 'p> {
    pub fn new(src: &'a dyn Bytes, prog: &'a Program, offset: u64, max_nodes: usize, progress: &'a mut Progress<'p>) -> Self {
        Ctx {
            src,
            len: src.len(),
            prog,
            nodes: Vec::new(),
            frames: vec![Frame::new(None)],
            cursor: offset,
            big: false,
            iterations: 0,
            max_nodes,
            progress,
            pending: None,
            warnings: Vec::new(),
            ret: None,
            depth: 0,
            scopes: vec![(0, None)],
        }
    }

    pub fn count(&self) -> usize {
        self.nodes.len()
    }

    /// Runs the program; returns the error that stopped it, if any.
    pub fn run(&mut self) -> Option<Fail> {
        let body = &self.prog.body;
        match self.exec_list(body) {
            Ok(_) => None,
            Err(f) => Some(f),
        }
    }

    pub fn roots_json(&self) -> Value {
        let roots = &self.frames[0].children;
        Value::Array(roots.iter().filter(|i| !self.nodes[**i].hidden).map(|i| self.node_json(*i, 0)).collect())
    }

    fn node_json(&self, i: usize, depth: usize) -> Value {
        let n = &self.nodes[i];
        let value = match &n.kind {
            NK::Int(v) => int_text(*v, n.size),
            NK::Float(v) => format!("{v}"),
            NK::Bool(b) => b.to_string(),
            NK::Char(c) => {
                let ch = char::from_u32(*c).unwrap_or('?');
                if *c < 0x20 || *c == 0x7F { format!("{c} (0x{c:02X})") } else { format!("'{ch}' ({c})") }
            }
            NK::Str(s) => quote(s),
            NK::Enum(Some(name), v) => format!("{name} ({v})"),
            NK::Enum(None, v) => format!("? ({v})"),
            NK::Bytes { preview, .. } => preview.clone(),
            NK::Struct | NK::Array => String::new(),
            NK::More(n) => format!("{n} more"),
        };
        let children: Vec<Value> = if depth < 64 { n.children.iter().filter(|c| !self.nodes[**c].hidden).map(|c| self.node_json(*c, depth + 1)).collect() } else { Vec::new() };
        json!({
            "name": n.name, "type": n.ty, "offset": n.offset, "size": n.size, "value": value,
            "color": n.color, "comment": n.comment,
            "children": if children.is_empty() && !matches!(n.kind, NK::Struct | NK::Array) { Value::Null } else { Value::Array(children) },
        })
    }

    // ── reading

    fn need(&self, offset: u64, n: u64, pos: Pos) -> R<()> {
        if offset.checked_add(n).is_none_or(|end| end > self.len) {
            return fail(pos, format!("end of data (reading {n} bytes at 0x{offset:X}, size 0x{:X})", self.len));
        }
        Ok(())
    }

    fn read_bytes(&self, offset: u64, n: u64, pos: Pos) -> R<Vec<u8>> {
        self.need(offset, n, pos)?;
        let mut buf = vec![0u8; n as usize];
        self.src.read(offset, &mut buf).map_err(|e| Fail::Err(pos, e))?;
        Ok(buf)
    }

    fn read_uint(&self, offset: u64, n: u64, big: bool, pos: Pos) -> R<u64> {
        let b = self.read_bytes(offset, n, pos)?;
        let mut v = 0u64;
        for i in 0..n as usize {
            let byte = if big { b[i] } else { b[n as usize - 1 - i] };
            v = (v << 8) | byte as u64;
        }
        Ok(v)
    }

    /// Reads a primitive at `offset`: (value, size).
    fn read_prim(&self, p: Prim, offset: u64, big: bool, pos: Pos) -> R<(NK, u64)> {
        Ok(match p {
            Prim::U(n) => (NK::Int(self.read_uint(offset, n as u64, big, pos)? as i128), n as u64),
            Prim::S(n) => {
                let v = self.read_uint(offset, n as u64, big, pos)?;
                let shift = 64 - 8 * n as u32;
                (NK::Int((((v << shift) as i64) >> shift) as i128), n as u64)
            }
            Prim::F16 => (NK::Float(crate::inspect::f16_to_f32(self.read_uint(offset, 2, big, pos)? as u16) as f64), 2),
            Prim::F32 => (NK::Float(f32::from_bits(self.read_uint(offset, 4, big, pos)? as u32) as f64), 4),
            Prim::F64 => (NK::Float(f64::from_bits(self.read_uint(offset, 8, big, pos)?)), 8),
            Prim::Bool => (NK::Bool(self.read_uint(offset, 1, big, pos)? != 0), 1),
            Prim::Char => (NK::Char(self.read_uint(offset, 1, big, pos)? as u32), 1),
            Prim::WChar => (NK::Char(self.read_uint(offset, 2, big, pos)? as u32), 2),
            Prim::Uleb | Prim::Sleb => {
                let mut v: i128 = 0;
                let mut shift = 0u32;
                let mut i = 0u64;
                loop {
                    let b = self.read_uint(offset + i, 1, false, pos)? as u8;
                    i += 1;
                    if shift < 120 {
                        v |= ((b & 0x7F) as i128) << shift;
                    }
                    shift += 7;
                    if b & 0x80 == 0 {
                        if p == Prim::Sleb && shift < 128 && b & 0x40 != 0 {
                            v |= -1i128 << shift;
                        }
                        break;
                    }
                    if i >= 19 {
                        return fail(pos, "LEB128 number too long");
                    }
                }
                (NK::Int(v), i)
            }
        })
    }

    // ── names

    fn lookup(&self, name: &str) -> Option<&Binding> {
        self.frames.iter().rev().find_map(|f| f.names.get(name))
    }

    fn child_by_key(&self, node: usize, key: &str) -> Option<usize> {
        self.nodes[node].children.iter().rev().copied().find(|c| self.nodes[*c].key == key)
    }

    fn resolve(&self, ty: &TypeRef, pos: Pos) -> R<(Kind<'a>, Option<bool>, String)> {
        let prog: &'a Program = self.prog;
        let mut name = ty.name.clone();
        let mut endian = ty.endian;
        for _ in 0..32 {
            if let Some(p) = prim_of(&name) {
                return Ok((Kind::Prim(p), endian, name));
            }
            if let Some(s) = prog.structs.get(&name) {
                return Ok((Kind::Struct(s), endian, name));
            }
            if let Some(e) = prog.enums.get(&name) {
                return Ok((Kind::Enum(e), endian, name));
            }
            if let Some(b) = prog.bitfields.get(&name) {
                return Ok((Kind::Bitfield(b), endian, name));
            }
            if let Some(a) = prog.aliases.get(&name) {
                endian = endian.or(a.endian);
                name = a.name.clone();
                continue;
            }
            return fail(pos, format!("unknown type '{}'", ty.name));
        }
        fail(pos, format!("type alias loop at '{}'", ty.name))
    }

    // ── statements

    fn tick(&mut self, pos: Pos) -> R<()> {
        self.iterations += 1;
        if self.iterations > MAX_ITERATIONS {
            return fail(pos, format!("stopped after {MAX_ITERATIONS} loop iterations (endless loop?)"));
        }
        if self.iterations % 4096 == 0 && !(self.progress)(self.cursor.min(self.len), self.len) {
            return Err(Fail::Cancelled);
        }
        Ok(())
    }

    fn exec_list(&mut self, list: &'a [Stmt]) -> R<Flow> {
        for s in list {
            match self.exec(s)? {
                Flow::Normal => {}
                other => return Ok(other),
            }
        }
        Ok(Flow::Normal)
    }

    fn exec(&mut self, s: &'a Stmt) -> R<Flow> {
        match &s.k {
            S::Nop => {}
            S::Decl(d) => self.exec_decl(d, s.pos)?,
            S::Block(list) => return self.exec_list(list),
            S::If(cond, then, other) => {
                if self.truthy(cond)? {
                    return self.exec(then);
                } else if let Some(o) = other {
                    return self.exec(o);
                }
            }
            S::While(cond, body) => {
                while self.truthy(cond)? {
                    self.tick(s.pos)?;
                    match self.exec(body)? {
                        Flow::Break => break,
                        Flow::Return => return Ok(Flow::Return),
                        _ => {}
                    }
                }
            }
            S::For(init, cond, step, body) => {
                if let Some(i) = init {
                    self.exec(i)?;
                }
                loop {
                    if let Some(c) = cond {
                        if !self.truthy(c)? {
                            break;
                        }
                    }
                    self.tick(s.pos)?;
                    match self.exec(body)? {
                        Flow::Break => break,
                        Flow::Return => return Ok(Flow::Return),
                        _ => {}
                    }
                    if let Some(st) = step {
                        self.exec(st)?;
                    }
                }
            }
            S::Let(name, e) => {
                let v = self.eval(e)?;
                let v = self.deref(v);
                self.frames.last_mut().unwrap().names.insert(name.clone(), Binding::Local(v));
            }
            S::Assign(name, op, e) => {
                let rhs = self.eval(e)?;
                let rhs = self.deref(rhs);
                let value = if *op == "=" {
                    rhs
                } else {
                    let cur = match self.lookup(name) {
                        Some(Binding::Local(v)) => v.clone(),
                        Some(Binding::Node(i)) => self.deref(Val::Node(*i)),
                        None => return fail(s.pos, format!("unknown name '{name}'")),
                    };
                    self.binop(op, cur, rhs, s.pos)?
                };
                let frame = self.frames.iter_mut().rev().find(|f| matches!(f.names.get(name), Some(Binding::Local(_))));
                match frame {
                    Some(f) => {
                        f.names.insert(name.clone(), Binding::Local(value));
                    }
                    None => {
                        if self.lookup(name).is_some() {
                            return fail(s.pos, format!("'{name}' is a field of the data and cannot be assigned"));
                        }
                        self.frames.last_mut().unwrap().names.insert(name.clone(), Binding::Local(value));
                    }
                }
            }
            S::Expr(e) => {
                self.eval(e)?;
            }
            S::Break => return Ok(Flow::Break),
            S::Continue => return Ok(Flow::Continue),
            S::Return(value) => {
                self.ret = match value {
                    Some(e) => {
                        let v = self.eval(e)?;
                        Some(self.deref(v))
                    }
                    None => None,
                };
                return Ok(Flow::Return);
            }
            S::Endian(big) => self.big = *big,
        }
        Ok(Flow::Normal)
    }

    fn new_node(&mut self, node: RNode, pos: Pos) -> R<usize> {
        if self.nodes.len() >= self.max_nodes {
            return fail(pos, format!("too many nodes (limit {})", self.max_nodes));
        }
        if self.nodes.len() % 256 == 255 && !(self.progress)(self.cursor.min(self.len), self.len) {
            return Err(Fail::Cancelled);
        }
        self.nodes.push(node);
        Ok(self.nodes.len() - 1)
    }

    fn blank(&self, key: &str, ty: String, offset: u64, kind: NK) -> RNode {
        RNode { key: key.into(), name: key.into(), ty, offset, size: 0, kind, color: None, comment: None, children: Vec::new(), hidden: false }
    }

    fn apply_attrs(&mut self, idx: usize, attrs: &'a [Attr]) -> R<()> {
        for a in attrs {
            let raw = match &a.arg {
                Some(e) => self.eval(e)?,
                None => Val::Void,
            };
            // An enum names itself by its member.
            let member = match &raw {
                Val::Node(i) => match &self.nodes[*i].kind {
                    NK::Enum(Some(n), _) => Some(n.clone()),
                    _ => None,
                },
                _ => None,
            };
            let v = self.deref(raw);
            match a.name.as_str() {
                "color" => self.nodes[idx].color = color_text(&v).or_else(|| self.nodes[idx].color.clone()),
                "comment" => self.nodes[idx].comment = Some(self.text_of(&v)),
                "name" => self.nodes[idx].name = member.unwrap_or_else(|| self.text_of(&v)),
                "hidden" => self.nodes[idx].hidden = true,
                _ => {}
            }
        }
        Ok(())
    }

    fn text_of(&self, v: &Val) -> String {
        match v {
            Val::Str(s) => s.clone(),
            Val::Int(i) => i.to_string(),
            Val::Float(f) => f.to_string(),
            Val::Node(i) => self.nodes[*i].name.clone(),
            Val::Void => String::new(),
        }
    }

    fn exec_decl(&mut self, d: &'a Decl, pos: Pos) -> R<()> {
        let start = match &d.at {
            Some(e) => self.eval_u64(e)?,
            None => self.cursor,
        };
        let saved = self.cursor;
        self.cursor = start;
        let result = self.instantiate(d, pos);
        let idx = match result {
            Ok(i) => i,
            Err(f) => {
                if d.at.is_some() {
                    self.cursor = saved;
                }
                return Err(f);
            }
        };
        if d.at.is_some() {
            self.cursor = saved;
        }
        let frame = self.frames.last_mut().unwrap();
        frame.names.insert(d.name.clone(), Binding::Node(idx));
        frame.children.push(idx);
        // After binding: `[[name(chunk.type)]]` may name the node by its own fields.
        if let Err(f) = self.apply_attrs(idx, &d.attrs) {
            self.pending.take();
            return Err(f);
        }
        let frame = self.frames.last_mut().unwrap();
        if let Some(u) = frame.union_start {
            frame.union_end = frame.union_end.max(self.cursor);
            self.cursor = u;
        }
        match self.pending.take() {
            Some(f) => Err(f),
            None => Ok(()),
        }
    }

    fn instantiate(&mut self, d: &'a Decl, pos: Pos) -> R<usize> {
        let (kind, endian, tname) = self.resolve(&d.ty, pos)?;
        let big = endian.unwrap_or(self.big);
        let mut dims: Vec<&'a ArrayLen> = vec![&d.array];
        dims.extend(d.dims.iter());
        self.build(&kind, big, &tname, &d.name, &dims, pos)
    }

    /// `T a[n][m]…`: a node per outer dimension (elements `[i]`), the innermost dimension as a plain array.
    fn build(&mut self, kind: &Kind<'a>, big: bool, tname: &str, key: &str, dims: &[&'a ArrayLen], pos: Pos) -> R<usize> {
        if dims.len() == 1 {
            return self.build_one(kind, big, tname, key, dims[0], pos);
        }
        let start = self.cursor;
        let n = match dims[0] {
            ArrayLen::Count(e) => Some(self.count_of(e, pos)?),
            ArrayLen::While(_) => None,
            _ => return fail(pos, "a multi-dimensional array needs sizes: a[n][m]"),
        };
        let idx = self.new_node(self.blank(key, format!("{tname}[]"), start, NK::Array), pos)?;
        let (mut i, mut dropped) = (0u64, 0usize);
        let mut inner_ty = String::new();
        loop {
            match (n, dims[0]) {
                (Some(n), _) if i >= n => break,
                (None, ArrayLen::While(cond)) if !self.truthy(cond)? => break,
                _ => {}
            }
            self.tick(pos)?;
            let child = match self.build(kind, big, tname, &format!("[{i}]"), &dims[1..], pos) {
                Ok(c) => c,
                Err(f) => {
                    self.pending = Some(f);
                    break;
                }
            };
            if inner_ty.is_empty() {
                inner_ty = self.nodes[child].ty.strip_prefix(tname).unwrap_or("").to_string();
            }
            if self.nodes[idx].children.len() < MAX_ELEMENTS {
                self.nodes[idx].children.push(child);
            } else {
                dropped += 1;
            }
            i += 1;
            if self.pending.is_some() {
                break;
            }
        }
        self.finish_array(idx, start, i, dropped, tname);
        self.nodes[idx].ty.push_str(&inner_ty);
        Ok(idx)
    }

    fn build_one(&mut self, kind: &Kind<'a>, big: bool, tname: &str, key: &str, array: &'a ArrayLen, pos: Pos) -> R<usize> {
        let start = self.cursor;
        let kind = match kind {
            Kind::Prim(p) => Kind::Prim(*p),
            Kind::Struct(s) => Kind::Struct(s),
            Kind::Enum(e) => Kind::Enum(e),
            Kind::Bitfield(b) => Kind::Bitfield(b),
        };
        let tname = tname.to_string();
        match (array, &kind) {
            (ArrayLen::None, _) => self.single(&kind, big, key, &tname, pos),
            // Text: char / wchar arrays.
            (len, Kind::Prim(p @ (Prim::Char | Prim::WChar))) => {
                let unit = p.size();
                let mut units: Vec<u32> = Vec::new();
                match len {
                    ArrayLen::Open => loop {
                        let v = self.read_uint(self.cursor, unit, big, pos)? as u32;
                        self.cursor += unit;
                        if v == 0 {
                            break;
                        }
                        units.push(v);
                        self.tick(pos)?;
                    },
                    ArrayLen::Count(e) => {
                        let n = self.count_of(e, pos)?;
                        let bytes = self.read_bytes(start, n * unit, pos)?;
                        units = bytes
                            .chunks(unit as usize)
                            .map(|c| if unit == 1 { c[0] as u32 } else if big { u16::from_be_bytes([c[0], c[1]]) as u32 } else { u16::from_le_bytes([c[0], c[1]]) as u32 })
                            .collect();
                        self.cursor = start + n * unit;
                    }
                    ArrayLen::While(cond) => {
                        while self.truthy(cond)? {
                            self.tick(pos)?;
                            units.push(self.read_uint(self.cursor, unit, big, pos)? as u32);
                            self.cursor += unit;
                        }
                    }
                    ArrayLen::None => unreachable!(),
                }
                let count = units.len();
                while units.last() == Some(&0) {
                    units.pop();
                }
                let text: String = if unit == 2 {
                    char::decode_utf16(units.iter().map(|u| *u as u16)).map(|c| c.unwrap_or('\u{fffd}')).collect()
                } else {
                    units.iter().map(|u| char::from_u32(*u).unwrap_or('?')).collect()
                };
                let mut node = self.blank(key, format!("{tname}[{count}]"), start, NK::Str(text));
                node.size = self.cursor - start;
                self.new_node(node, pos)
            }
            // A run of numbers: one node (bytes, long arrays), or a node per element (short arrays, LEB128).
            (len, Kind::Prim(p)) => {
                let esize = p.size();
                let fixed_n = match len {
                    ArrayLen::Count(e) => Some(self.count_of(e, pos)?),
                    ArrayLen::Open => return fail(pos, "[] is only for char / wchar text"),
                    _ => None,
                };
                let one_node = esize > 0 && (esize == 1 || fixed_n.is_none_or(|n| n > SMALL_ARRAY));
                if one_node {
                    let n = match (fixed_n, len) {
                        (Some(n), _) => {
                            self.need(start, n * esize, pos)?;
                            n
                        }
                        (None, ArrayLen::While(cond)) => {
                            let mut n = 0u64;
                            while self.truthy(cond)? {
                                self.tick(pos)?;
                                n += 1;
                                self.cursor += esize;
                            }
                            self.need(start, n * esize, pos)?;
                            n
                        }
                        _ => 0,
                    };
                    let shown = (n * esize).min(16);
                    let head = self.read_bytes(start, shown, pos)?;
                    let mut preview = head.iter().map(|b| format!("{b:02X}")).collect::<Vec<_>>().join(" ");
                    if n * esize > shown {
                        preview.push_str(" …");
                    }
                    let mut node = self.blank(key, format!("{tname}[{n}]"), start, NK::Bytes { elem: *p, big, preview });
                    node.size = n * esize;
                    self.cursor = start + n * esize;
                    return self.new_node(node, pos);
                }
                self.element_array(key, array, &kind, big, &tname, fixed_n, pos)
            }
            (_, _) => {
                let fixed_n = match array {
                    ArrayLen::Count(e) => Some(self.count_of(e, pos)?),
                    ArrayLen::Open => return fail(pos, "[] is only for char / wchar text"),
                    _ => None,
                };
                self.element_array(key, array, &kind, big, &tname, fixed_n, pos)
            }
        }
    }

    fn element_array(&mut self, key: &str, array: &'a ArrayLen, kind: &Kind<'a>, big: bool, tname: &str, fixed_n: Option<u64>, pos: Pos) -> R<usize> {
        let start = self.cursor;
        let idx = self.new_node(self.blank(key, format!("{tname}[]"), start, NK::Array), pos)?;
        let mut i = 0u64;
        let mut dropped = 0usize;
        loop {
            match (fixed_n, array) {
                (Some(n), _) => {
                    if i >= n {
                        break;
                    }
                }
                (None, ArrayLen::While(cond)) => {
                    if !self.truthy(cond)? {
                        break;
                    }
                }
                _ => break,
            }
            self.tick(pos)?;
            let key = format!("[{i}]");
            let child = match self.single(kind, big, &key, tname, pos) {
                Ok(c) => c,
                Err(f) => {
                    self.finish_array(idx, start, i, dropped, tname);
                    self.pending = Some(f);
                    return Ok(idx);
                }
            };
            if self.nodes[idx].children.len() < MAX_ELEMENTS {
                self.nodes[idx].children.push(child);
            } else {
                dropped += 1;
            }
            i += 1;
            if self.pending.is_some() {
                break;
            }
        }
        self.finish_array(idx, start, i, dropped, tname);
        Ok(idx)
    }

    fn finish_array(&mut self, idx: usize, start: u64, count: u64, dropped: usize, tname: &str) {
        if dropped > 0 {
            let at = self.cursor;
            let more = self.blank("…", String::new(), at, NK::More(dropped));
            self.nodes.push(more);
            let m = self.nodes.len() - 1;
            self.nodes[idx].children.push(m);
        }
        self.nodes[idx].size = self.cursor.saturating_sub(start);
        self.nodes[idx].ty = format!("{tname}[{count}]");
    }

    fn count_of(&mut self, e: &'a Expr, pos: Pos) -> R<u64> {
        let v = self.eval(e)?;
        match self.deref(v) {
            Val::Int(n) if n >= 0 => Ok(n as u64),
            Val::Int(n) => fail(pos, format!("negative array length {n}")),
            Val::Float(f) if f >= 0.0 => Ok(f as u64),
            _ => fail(pos, "an array length must be a number"),
        }
    }

    /// One value of a type at the cursor.
    fn single(&mut self, kind: &Kind<'a>, big: bool, key: &str, tname: &str, pos: Pos) -> R<usize> {
        let start = self.cursor;
        match kind {
            Kind::Prim(p) => {
                let (nk, size) = self.read_prim(*p, start, big, pos)?;
                let mut node = self.blank(key, tname.to_string(), start, nk);
                node.size = size;
                self.cursor = start + size;
                self.new_node(node, pos)
            }
            Kind::Enum(e) => {
                let base = prim_of(&e.base.name).or_else(|| self.prog.aliases.get(&e.base.name).and_then(|a| prim_of(&a.name))).unwrap_or(Prim::U(4));
                let big = e.base.endian.map_or(big, |b| b);
                let (nk, size) = self.read_prim(base, start, big, pos)?;
                let v = match nk {
                    NK::Int(v) => v,
                    NK::Char(c) => c as i128,
                    NK::Bool(b) => b as i128,
                    _ => 0,
                };
                let name = e.members.iter().find(|(_, m)| *m == v).map(|(n, _)| n.clone());
                let mut node = self.blank(key, format!("enum {}", e.name), start, NK::Enum(name, v));
                node.size = size;
                self.cursor = start + size;
                self.new_node(node, pos)
            }
            Kind::Bitfield(b) => {
                let mut widths = Vec::new();
                for (name, w) in &b.fields {
                    let n = self.count_of(w, pos)?;
                    widths.push((name.clone(), n.min(64) as u32));
                }
                let bits: u32 = widths.iter().map(|w| w.1).sum();
                let nbytes = bits.div_ceil(8).clamp(1, 8) as u64;
                let raw = self.read_uint(start, nbytes, big, pos)?;
                let idx = self.new_node(self.blank(key, format!("bitfield {}", b.name), start, NK::Struct), pos)?;
                let mut shift = 0u32;
                for (name, w) in widths {
                    let v = if w == 0 || shift >= 64 { 0 } else { (raw >> shift) & if w >= 64 { u64::MAX } else { (1u64 << w) - 1 } };
                    shift += w;
                    let mut child = self.blank(&name, format!("bits {w}"), start, NK::Int(v as i128));
                    child.size = nbytes;
                    let c = self.new_node(child, pos)?;
                    self.nodes[idx].children.push(c);
                }
                self.nodes[idx].size = nbytes;
                self.cursor = start + nbytes;
                self.apply_attrs(idx, &b.attrs)?;
                Ok(idx)
            }
            Kind::Struct(def) => {
                let ty = format!("{} {}", if def.union { "union" } else { "struct" }, def.name);
                let idx = self.new_node(self.blank(key, ty, start, NK::Struct), pos)?;
                self.frames.push(Frame::new(if def.union { Some(start) } else { None }));
                self.scopes.push((self.frames.len() - 1, Some(idx)));
                let saved_big = self.big;
                let result = self.exec_list(&def.body);
                self.scopes.pop();
                let frame = self.frames.pop().unwrap();
                self.big = saved_big;
                if def.union {
                    self.cursor = frame.union_end.max(self.cursor);
                }
                self.nodes[idx].children = frame.children;
                self.nodes[idx].size = self.cursor.saturating_sub(start);
                self.apply_attrs(idx, &def.attrs)?;
                if let Err(f) = result {
                    self.pending = Some(f);
                }
                Ok(idx)
            }
        }
    }

    // ── expressions

    fn deref(&self, v: Val) -> Val {
        match v {
            Val::Node(i) => match &self.nodes[i].kind {
                NK::Int(n) => Val::Int(*n),
                NK::Float(f) => Val::Float(*f),
                NK::Bool(b) => Val::Int(*b as i128),
                NK::Char(c) => Val::Int(*c as i128),
                NK::Str(s) => Val::Str(s.clone()),
                NK::Enum(_, n) => Val::Int(*n),
                _ => Val::Node(i),
            },
            other => other,
        }
    }

    fn truthy(&mut self, e: &'a Expr) -> R<bool> {
        let v = self.eval(e)?;
        Ok(match self.deref(v) {
            Val::Int(n) => n != 0,
            Val::Float(f) => f != 0.0,
            Val::Str(s) => !s.is_empty(),
            Val::Node(_) => true,
            Val::Void => false,
        })
    }

    fn eval_u64(&mut self, e: &'a Expr) -> R<u64> {
        let v = self.eval(e)?;
        match self.deref(v) {
            Val::Int(n) if n >= 0 => Ok(n as u64),
            Val::Float(f) if f >= 0.0 => Ok(f as u64),
            _ => fail(e.pos, "an offset must be a number of at least 0"),
        }
    }

    fn eval_int(&mut self, e: &'a Expr) -> R<i128> {
        let v = self.eval(e)?;
        match self.deref(v) {
            Val::Int(n) => Ok(n),
            Val::Float(f) => Ok(f as i128),
            _ => fail(e.pos, "a number is needed here"),
        }
    }

    fn binop(&self, op: &str, a: Val, b: Val, pos: Pos) -> R<Val> {
        let bool_v = |b: bool| Val::Int(b as i128);
        match (&a, &b) {
            (Val::Str(x), Val::Str(y)) => {
                return Ok(match op {
                    "==" => bool_v(x == y),
                    "!=" => bool_v(x != y),
                    "<" => bool_v(x < y),
                    ">" => bool_v(x > y),
                    "+" => Val::Str(format!("{x}{y}")),
                    _ => return fail(pos, format!("'{op}' does not work on text")),
                })
            }
            (Val::Str(x), Val::Int(n)) | (Val::Int(n), Val::Str(x)) if op == "+" => {
                return Ok(Val::Str(if matches!(a, Val::Str(_)) { format!("{x}{n}") } else { format!("{n}{x}") }))
            }
            (Val::Str(_), _) | (_, Val::Str(_)) => {
                return match op {
                    "==" => Ok(bool_v(false)),
                    "!=" => Ok(bool_v(true)),
                    _ => fail(pos, format!("'{op}' does not work on text")),
                }
            }
            _ => {}
        }
        let as_f = |v: &Val| match v {
            Val::Int(n) => Some(*n as f64),
            Val::Float(f) => Some(*f),
            _ => None,
        };
        if matches!(a, Val::Float(_)) || matches!(b, Val::Float(_)) {
            let (x, y) = match (as_f(&a), as_f(&b)) {
                (Some(x), Some(y)) => (x, y),
                _ => return fail(pos, "a number is needed"),
            };
            return Ok(match op {
                "+" => Val::Float(x + y),
                "-" => Val::Float(x - y),
                "*" => Val::Float(x * y),
                "/" => Val::Float(x / y),
                "%" => Val::Float(x % y),
                "==" => bool_v(x == y),
                "!=" => bool_v(x != y),
                "<" => bool_v(x < y),
                "<=" => bool_v(x <= y),
                ">" => bool_v(x > y),
                ">=" => bool_v(x >= y),
                _ => return fail(pos, format!("'{op}' needs whole numbers")),
            });
        }
        let (x, y) = match (&a, &b) {
            (Val::Int(x), Val::Int(y)) => (*x, *y),
            _ => return fail(pos, format!("'{op}' needs numbers, not a structure")),
        };
        Ok(match op {
            "+" => Val::Int(x.wrapping_add(y)),
            "-" => Val::Int(x.wrapping_sub(y)),
            "*" => Val::Int(x.wrapping_mul(y)),
            "/" => {
                if y == 0 {
                    return fail(pos, "division by zero");
                }
                Val::Int(x / y)
            }
            "%" => {
                if y == 0 {
                    return fail(pos, "division by zero");
                }
                Val::Int(x % y)
            }
            "&" => Val::Int(x & y),
            "|" => Val::Int(x | y),
            "^" => Val::Int(x ^ y),
            "<<" => Val::Int(if (0..127).contains(&y) { x << y } else { 0 }),
            ">>" => Val::Int(if (0..127).contains(&y) { x >> y } else { 0 }),
            "==" => bool_v(x == y),
            "!=" => bool_v(x != y),
            "<" => bool_v(x < y),
            "<=" => bool_v(x <= y),
            ">" => bool_v(x > y),
            ">=" => bool_v(x >= y),
            _ => return fail(pos, format!("unknown operator '{op}'")),
        })
    }

    fn eval(&mut self, e: &'a Expr) -> R<Val> {
        let pos = e.pos;
        Ok(match &e.k {
            E::Int(v) => Val::Int(*v),
            E::Float(v) => Val::Float(*v),
            E::Str(s) => Val::Str(s.clone()),
            E::Dollar => Val::Int(self.cursor as i128),
            E::Ident(name) => match self.lookup(name) {
                Some(Binding::Local(v)) => v.clone(),
                Some(Binding::Node(i)) => Val::Node(*i),
                None if name == "parent" || name == "this" => match self.scope_index(e) {
                    Some(k) => self.scope_value(k, pos)?,
                    None => return fail(pos, "'parent' is only inside a struct"),
                },
                None => {
                    // A bare enum member.
                    match self.prog.enums.values().find_map(|en| en.members.iter().find(|(m, _)| m == name).map(|(_, v)| *v)) {
                        Some(v) => Val::Int(v),
                        None => return fail(pos, format!("unknown name '{name}'")),
                    }
                }
            },
            E::Scope(en, member) => match self.prog.enums.get(en).and_then(|d| d.members.iter().find(|(m, _)| m == member)) {
                Some((_, v)) => Val::Int(*v),
                None => return fail(pos, format!("unknown {en}::{member}")),
            },
            E::Unary(op, a) => {
                let v = self.eval(a)?;
                match (*op, self.deref(v)) {
                    ("-", Val::Int(n)) => Val::Int(n.wrapping_neg()),
                    ("-", Val::Float(f)) => Val::Float(-f),
                    ("~", Val::Int(n)) => Val::Int(!n),
                    ("!", v) => Val::Int(match v {
                        Val::Int(n) => n == 0,
                        Val::Float(f) => f == 0.0,
                        Val::Str(s) => s.is_empty(),
                        Val::Node(_) => false,
                        Val::Void => true,
                    } as i128),
                    _ => return fail(pos, format!("'{op}' needs a number")),
                }
            }
            E::Binary(op, a, b) => {
                if *op == "&&" {
                    return Ok(Val::Int((self.truthy(a)? && self.truthy(b)?) as i128));
                }
                if *op == "||" {
                    return Ok(Val::Int((self.truthy(a)? || self.truthy(b)?) as i128));
                }
                let x = self.eval(a)?;
                let x = self.deref(x);
                let y = self.eval(b)?;
                let y = self.deref(y);
                self.binop(op, x, y, pos)?
            }
            E::Ternary(c, a, b) => {
                if self.truthy(c)? {
                    self.eval(a)?
                } else {
                    self.eval(b)?
                }
            }
            E::Member(base, name) => {
                if let Some(k) = self.scope_index(e) {
                    return self.scope_value(k, pos);
                }
                if let Some(k) = self.scope_index(base) {
                    // The enclosing struct is still being read: its fields so far are in its frame.
                    let f = self.scopes[k].0;
                    return match self.frames[f].names.get(name) {
                        Some(Binding::Local(v)) => Ok(v.clone()),
                        Some(Binding::Node(i)) => Ok(Val::Node(*i)),
                        None => fail(pos, format!("the parent has no field '{name}' (yet)")),
                    };
                }
                let v = self.eval(base)?;
                match v {
                    Val::Node(i) => match self.child_by_key(i, name) {
                        Some(c) => Val::Node(c),
                        None => return fail(pos, format!("'{}' has no field '{name}'", self.nodes[i].key)),
                    },
                    _ => return fail(pos, format!("'.{name}' needs a structure")),
                }
            }
            E::Index(base, index) => {
                let v = self.eval(base)?;
                let k = self.eval_int(index)?;
                if k < 0 {
                    return fail(pos, format!("negative index {k}"));
                }
                let k = k as u64;
                match v {
                    Val::Node(i) => {
                        let node = self.nodes[i].clone();
                        match node.kind {
                            NK::Bytes { elem, big, .. } => {
                                let es = elem.size();
                                if (k + 1) * es > node.size {
                                    return fail(pos, format!("index {k} is outside '{}'", node.key));
                                }
                                let (nk, _) = self.read_prim(elem, node.offset + k * es, big, pos)?;
                                match nk {
                                    NK::Int(n) => Val::Int(n),
                                    NK::Float(f) => Val::Float(f),
                                    NK::Bool(b) => Val::Int(b as i128),
                                    NK::Char(c) => Val::Int(c as i128),
                                    _ => Val::Void,
                                }
                            }
                            NK::Str(s) => match s.chars().nth(k as usize) {
                                Some(c) => Val::Int(c as i128),
                                None => Val::Int(0),
                            },
                            _ => match node.children.get(k as usize) {
                                Some(c) => Val::Node(*c),
                                None => return fail(pos, format!("index {k} is outside '{}'", node.key)),
                            },
                        }
                    }
                    Val::Str(s) => Val::Int(s.chars().nth(k as usize).map_or(0, |c| c as i128)),
                    _ => return fail(pos, "only arrays and text can be indexed"),
                }
            }
            E::Call(name, args) => self.call(name, args, pos)?,
        })
    }

    fn arg(&mut self, args: &'a [Expr], i: usize, pos: Pos) -> R<Val> {
        match args.get(i) {
            Some(e) => {
                let v = self.eval(e)?;
                Ok(self.deref(v))
            }
            None => fail(pos, "an argument is missing"),
        }
    }

    fn arg_u64(&mut self, args: &'a [Expr], i: usize, pos: Pos) -> R<u64> {
        match self.arg(args, i, pos)? {
            Val::Int(n) if n >= 0 => Ok(n as u64),
            Val::Float(f) if f >= 0.0 => Ok(f as u64),
            _ => fail(pos, "a number of at least 0 is needed"),
        }
    }

    /// A user function: arguments by value, its own locals, `return expr;` gives the value. Fields it declares
    /// belong to the struct (or top level) that called it.
    fn call_user(&mut self, f: &'a FnDef, args: &'a [Expr], pos: Pos) -> R<Val> {
        if args.len() != f.params.len() {
            return fail(pos, format!("'{}' takes {} argument(s), not {}", f.name, f.params.len(), args.len()));
        }
        if self.depth >= MAX_CALL_DEPTH {
            return fail(pos, format!("function calls nested deeper than {MAX_CALL_DEPTH} (endless recursion in '{}'?)", f.name));
        }
        let mut frame = Frame::new(None);
        for (p, a) in f.params.iter().zip(args) {
            let v = self.eval(a)?;
            let v = self.deref(v);
            frame.names.insert(p.clone(), Binding::Local(v));
        }
        self.frames.push(frame);
        self.depth += 1;
        let saved_ret = self.ret.take();
        let result = self.exec_list(&f.body);
        self.depth -= 1;
        let frame = self.frames.pop().unwrap();
        let value = std::mem::replace(&mut self.ret, saved_ret);
        let caller = self.frames.last_mut().unwrap();
        caller.children.extend(frame.children);
        for (k, b) in frame.names {
            if let Binding::Node(i) = b {
                caller.names.insert(k, Binding::Node(i));
            }
        }
        result?;
        Ok(value.unwrap_or(Val::Void))
    }

    /// `parent`, `this`, `parent.parent`…: the index in `scopes` such an expression names.
    fn scope_index(&self, e: &Expr) -> Option<usize> {
        match &e.k {
            E::Ident(n) if n == "parent" && self.lookup(n).is_none() => self.scopes.len().checked_sub(2),
            E::Ident(n) if n == "this" && self.lookup(n).is_none() => self.scopes.len().checked_sub(1),
            E::Member(b, n) if n == "parent" => self.scope_index(b).and_then(|k| k.checked_sub(1)),
            _ => None,
        }
    }

    fn scope_value(&self, k: usize, pos: Pos) -> R<Val> {
        match self.scopes[k].1 {
            Some(node) => Ok(Val::Node(node)),
            None => fail(pos, "'parent' here is the top level, which is not a value (use parent.field)"),
        }
    }

    fn call(&mut self, name: &str, args: &'a [Expr], pos: Pos) -> R<Val> {
        let prog: &'a Program = self.prog;
        match prog.functions.get(name) {
            Some(f) => self.call_user(f, args, pos),
            None => self.builtin(name, args, pos),
        }
    }

    /// Kept out of line: its large frame must not sit on every level of a recursive user function.
    #[inline(never)]
    fn builtin(&mut self, name: &str, args: &'a [Expr], pos: Pos) -> R<Val> {
        let read_at = |me: &mut Self, args: &'a [Expr]| -> R<u64> { if args.is_empty() { Ok(me.cursor) } else { me.arg_u64(args, 0, pos) } };
        let int_read = |me: &mut Self, args: &'a [Expr], p: Prim, big: Option<bool>| -> R<Val> {
            let off = read_at(me, args)?;
            let (nk, _) = me.read_prim(p, off, big.unwrap_or(me.big), pos)?;
            Ok(match nk {
                NK::Int(n) => Val::Int(n),
                NK::Float(f) => Val::Float(f),
                NK::Char(c) => Val::Int(c as i128),
                NK::Bool(b) => Val::Int(b as i128),
                _ => Val::Void,
            })
        };
        Ok(match name {
            "sizeof" => {
                if let Some(Expr { k: E::Ident(t), .. }) = args.first() {
                    if self.lookup(t).is_none() && !matches!(t.as_str(), "parent" | "this") {
                        return match static_size(self.prog, t, 0) {
                            Ok(s) if s > 0 => Ok(Val::Int(s as i128)),
                            Ok(_) => fail(pos, format!("sizeof({t}): '{t}' has no bytes")),
                            Err(why) => fail(pos, format!("sizeof({t}): '{t}' has no fixed size: {why}")),
                        };
                    }
                }
                match args.first() {
                    Some(e) => match self.eval(e)? {
                        Val::Node(i) => Val::Int(self.nodes[i].size as i128),
                        Val::Str(s) => Val::Int(s.len() as i128),
                        _ => return fail(pos, "sizeof needs a field or a type"),
                    },
                    None => return fail(pos, "sizeof needs a field or a type"),
                }
            }
            "addressof" | "offsetof" | "startof" => match args.first() {
                Some(e) => match self.eval(e)? {
                    Val::Node(i) => Val::Int(self.nodes[i].offset as i128),
                    _ => return fail(pos, "addressof needs a field"),
                },
                None => return fail(pos, "addressof needs a field"),
            },
            "endof" => match args.first() {
                Some(e) => match self.eval(e)? {
                    Val::Node(i) => Val::Int((self.nodes[i].offset + self.nodes[i].size) as i128),
                    _ => return fail(pos, "endof needs a field"),
                },
                None => return fail(pos, "endof needs a field"),
            },
            "FileSize" | "size" | "filesize" | "data_size" => Val::Int(self.len as i128),
            "FEof" | "eof" => Val::Int((self.cursor >= self.len) as i128),
            "FTell" | "pos" | "ftell" => Val::Int(self.cursor as i128),
            "FSeek" | "seek" | "fseek" => {
                let to = self.arg_u64(args, 0, pos)?;
                if to > self.len {
                    return fail(pos, format!("seek past the end: 0x{to:X}"));
                }
                self.cursor = to;
                Val::Void
            }
            "FSkip" | "skip" => {
                let n = self.arg_u64(args, 0, pos)?;
                self.cursor = self.cursor.saturating_add(n).min(self.len);
                Val::Void
            }
            "ReadU8" | "ReadUByte" | "ReadUChar" => int_read(self, args, Prim::U(1), None)?,
            "ReadS8" | "ReadByte" | "ReadChar" => int_read(self, args, Prim::S(1), None)?,
            "ReadU16" | "ReadUShort" => int_read(self, args, Prim::U(2), None)?,
            "ReadS16" | "ReadShort" => int_read(self, args, Prim::S(2), None)?,
            "ReadU24" => int_read(self, args, Prim::U(3), None)?,
            "ReadU32" | "ReadUInt" => int_read(self, args, Prim::U(4), None)?,
            "ReadS32" | "ReadInt" => int_read(self, args, Prim::S(4), None)?,
            "ReadU64" | "ReadUInt64" | "ReadUQuad" => int_read(self, args, Prim::U(8), None)?,
            "ReadS64" | "ReadInt64" | "ReadQuad" => int_read(self, args, Prim::S(8), None)?,
            "ReadU16BE" => int_read(self, args, Prim::U(2), Some(true))?,
            "ReadU32BE" => int_read(self, args, Prim::U(4), Some(true))?,
            "ReadU64BE" => int_read(self, args, Prim::U(8), Some(true))?,
            "ReadU16LE" => int_read(self, args, Prim::U(2), Some(false))?,
            "ReadU32LE" => int_read(self, args, Prim::U(4), Some(false))?,
            "ReadU64LE" => int_read(self, args, Prim::U(8), Some(false))?,
            "ReadFloat" => int_read(self, args, Prim::F32, None)?,
            "ReadDouble" => int_read(self, args, Prim::F64, None)?,
            "ReadString" => {
                let off = read_at(self, args)?;
                let mut out = String::new();
                if args.len() >= 2 {
                    let n = self.arg_u64(args, 1, pos)?;
                    let bytes = self.read_bytes(off, n, pos)?;
                    out = bytes.iter().map(|b| *b as char).collect();
                    while out.ends_with('\0') {
                        out.pop();
                    }
                } else {
                    let mut i = off;
                    while i < self.len && out.len() < 4096 {
                        let b = self.read_uint(i, 1, false, pos)? as u8;
                        if b == 0 {
                            break;
                        }
                        out.push(b as char);
                        i += 1;
                    }
                }
                Val::Str(out)
            }
            "find" | "FindFirst" => {
                let from = self.arg_u64(args, 0, pos)?;
                let pattern = match self.arg(args, 1, pos)? {
                    Val::Str(s) => crate::util::parse_hex(&s).map_err(|e| Fail::Err(pos, e))?,
                    Val::Int(n) => vec![n as u8],
                    _ => return fail(pos, "find(offset, \"hex bytes\")"),
                };
                Val::Int(self.find(from, &pattern, pos)?)
            }
            "ParseInt" | "atoi" | "parse_int" => {
                let text = match self.arg(args, 0, pos)? {
                    Val::Str(s) => s,
                    Val::Int(n) => return Ok(Val::Int(n)),
                    _ => return fail(pos, "ParseInt needs text"),
                };
                let base = if args.len() > 1 { self.arg_u64(args, 1, pos)? as u32 } else { 10 };
                let t: String = text.trim_matches(|c: char| c == '\0' || c.is_whitespace()).chars().take_while(|c| c.is_digit(base.clamp(2, 36))).collect();
                Val::Int(i128::from_str_radix(&t, base.clamp(2, 36)).unwrap_or(0))
            }
            "strlen" => match self.arg(args, 0, pos)? {
                Val::Str(s) => Val::Int(s.chars().count() as i128),
                _ => Val::Int(0),
            },
            "min" | "max" => {
                let a = self.arg(args, 0, pos)?;
                let b = self.arg(args, 1, pos)?;
                let less = matches!(self.binop("<", a.clone(), b.clone(), pos)?, Val::Int(1));
                if (name == "min") == less { a } else { b }
            }
            "abs" => match self.arg(args, 0, pos)? {
                Val::Int(n) => Val::Int(n.abs()),
                Val::Float(f) => Val::Float(f.abs()),
                _ => return fail(pos, "abs needs a number"),
            },
            "str" | "to_string" => {
                let v = self.arg(args, 0, pos)?;
                Val::Str(self.text_of(&v))
            }
            "hex" => match self.arg(args, 0, pos)? {
                Val::Int(n) => Val::Str(format!("0x{:X}", n as u128)),
                _ => return fail(pos, "hex needs a number"),
            },
            "Printf" | "print" | "printf" => Val::Void,
            "Warning" | "warning" | "Error" | "error" => {
                let v = self.arg(args, 0, pos)?;
                let text = self.text_of(&v);
                if name.eq_ignore_ascii_case("error") {
                    return fail(pos, text);
                }
                self.warnings.push((pos, text));
                Val::Void
            }
            "BigEndian" => {
                self.big = true;
                Val::Void
            }
            "LittleEndian" => {
                self.big = false;
                Val::Void
            }
            _ => return fail(pos, format!("unknown function '{name}'")),
        })
    }

    fn find(&mut self, from: u64, pattern: &[u8], pos: Pos) -> R<i128> {
        if pattern.is_empty() {
            return Ok(from as i128);
        }
        let mut at = from;
        let chunk = 1 << 16;
        while at < self.len {
            let n = ((self.len - at) as usize).min(chunk + pattern.len());
            let buf = self.read_bytes(at, n as u64, pos)?;
            if let Some(i) = buf.windows(pattern.len()).position(|w| w == pattern) {
                return Ok((at + i as u64) as i128);
            }
            if n < pattern.len() + 1 {
                break;
            }
            at += (n - pattern.len() + 1) as u64;
            if !(self.progress)(at, self.len) {
                return Err(Fail::Cancelled);
            }
        }
        Ok(-1)
    }
}
