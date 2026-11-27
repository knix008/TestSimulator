//! Script mode (`pattern::run_script`): builtins that change the document and print. Every change goes into an
//! overlay over the source (a piece table), so later reads in the same script see it, and into a list of edits
//! the app applies afterwards as one undo step.
use super::*;
use crate::util::{b64, parse_hex, CANCELLED};

/// The bytes all edits may carry together (written, inserted).
pub const MAX_EDIT_BYTES: u64 = 64 << 20;
/// The text `Printf` / `Print` may produce.
const MAX_OUTPUT: usize = 16 << 20;
/// The script builtins besides Write<number>.
const SCRIPT_FUNCTIONS: &[&str] = &[
    "WriteBytes", "WriteString", "InsertBytes", "DeleteBytes", "Printf", "printf", "Print", "print", "println", "Selection",
    "SelectionStart", "GetSelStart", "SelectionLength", "GetSelSize", "Cursor", "GetCursorPos", "Exit", "Assert", "Hash",
    "Checksum", "FindAll", "FindAt",
];
/// Offsets `FindAll` keeps.
const MAX_HITS: usize = 1_000_000;

// ── the overlay

enum Piece {
    /// Bytes of the source from this offset.
    Orig(u64),
    /// Bytes the script wrote or inserted.
    Data(Vec<u8>),
}

struct Seg {
    start: u64,
    len: u64,
    piece: Piece,
}

/// The source as the script has changed it so far.
pub struct Overlay<'a> {
    src: &'a dyn Bytes,
    segs: Vec<Seg>,
    len: u64,
}

impl<'a> Overlay<'a> {
    pub fn new(src: &'a dyn Bytes) -> Self {
        let len = src.len();
        let segs = if len > 0 { vec![Seg { start: 0, len, piece: Piece::Orig(0) }] } else { Vec::new() };
        Overlay { src, segs, len }
    }

    /// The segment holding `off` (`off < len`).
    fn index(&self, off: u64) -> usize {
        self.segs.partition_point(|s| s.start <= off).saturating_sub(1)
    }

    /// Makes a segment start at `off` (`off <= len`); returns its index (`segs.len()` at the end).
    fn split(&mut self, off: u64) -> usize {
        if off >= self.len {
            return self.segs.len();
        }
        let i = self.index(off);
        let s = &mut self.segs[i];
        if s.start == off {
            return i;
        }
        let cut = off - s.start;
        let tail = match &mut s.piece {
            Piece::Orig(o) => Piece::Orig(*o + cut),
            Piece::Data(d) => Piece::Data(d.split_off(cut as usize)),
        };
        let tail_len = s.len - cut;
        s.len = cut;
        self.segs.insert(i + 1, Seg { start: off, len: tail_len, piece: tail });
        i + 1
    }

    /// Joins segment `i` with Data neighbours.
    fn merge_around(&mut self, i: usize) {
        let is_data = |s: &Seg| matches!(s.piece, Piece::Data(_));
        if i + 1 < self.segs.len() && is_data(&self.segs[i]) && is_data(&self.segs[i + 1]) {
            let next = self.segs.remove(i + 1);
            if let (Piece::Data(d), Piece::Data(n)) = (&mut self.segs[i].piece, next.piece) {
                d.extend_from_slice(&n);
            }
            self.segs[i].len += next.len;
        }
        if i > 0 && i < self.segs.len() && is_data(&self.segs[i - 1]) && is_data(&self.segs[i]) {
            let cur = self.segs.remove(i);
            if let (Piece::Data(d), Piece::Data(c)) = (&mut self.segs[i - 1].piece, cur.piece) {
                d.extend_from_slice(&c);
            }
            self.segs[i - 1].len += cur.len;
        }
    }

    /// Overwrites `[off, off + data.len())`, which lies within the data.
    fn write(&mut self, off: u64, data: &[u8]) {
        let n = data.len() as u64;
        if n == 0 {
            return;
        }
        let i = self.index(off);
        // Inside bytes already written: in place.
        {
            let s = &mut self.segs[i];
            if let Piece::Data(d) = &mut s.piece {
                let w = (off - s.start) as usize;
                if w + data.len() <= d.len() {
                    d[w..w + data.len()].copy_from_slice(data);
                    return;
                }
            }
        }
        // Right after bytes already written (a loop going forwards): grow them.
        if i > 0 && self.segs[i].start == off && self.segs[i].len > n && matches!(self.segs[i].piece, Piece::Orig(_)) && matches!(self.segs[i - 1].piece, Piece::Data(_)) {
            let s = &mut self.segs[i];
            if let Piece::Orig(o) = &mut s.piece {
                *o += n;
            }
            s.start += n;
            s.len -= n;
            let p = &mut self.segs[i - 1];
            if let Piece::Data(d) = &mut p.piece {
                d.extend_from_slice(data);
            }
            p.len += n;
            return;
        }
        let a = self.split(off);
        let b = self.split(off + n);
        self.segs.splice(a..b, [Seg { start: off, len: n, piece: Piece::Data(data.to_vec()) }]);
        self.merge_around(a);
    }

    fn insert(&mut self, off: u64, data: Vec<u8>) {
        let n = data.len() as u64;
        if n == 0 {
            return;
        }
        let a = self.split(off);
        self.segs.insert(a, Seg { start: off, len: n, piece: Piece::Data(data) });
        for s in &mut self.segs[a + 1..] {
            s.start += n;
        }
        self.len += n;
        self.merge_around(a);
    }

    fn delete(&mut self, off: u64, n: u64) {
        if n == 0 {
            return;
        }
        let a = self.split(off);
        let b = self.split(off + n);
        self.segs.drain(a..b);
        for s in &mut self.segs[a..] {
            s.start -= n;
        }
        self.len -= n;
        if a > 0 && a < self.segs.len() {
            self.merge_around(a);
        }
    }
}

impl Bytes for Overlay<'_> {
    fn len(&self) -> u64 {
        self.len
    }
    fn read(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        let mut done = 0usize;
        if !buf.is_empty() && offset < self.len {
            let mut i = self.index(offset);
            while done < buf.len() && i < self.segs.len() {
                let s = &self.segs[i];
                let within = offset + done as u64 - s.start;
                let n = ((s.len - within) as usize).min(buf.len() - done);
                match &s.piece {
                    Piece::Orig(o) => self.src.read(o + within, &mut buf[done..done + n])?,
                    Piece::Data(d) => buf[done..done + n].copy_from_slice(&d[within as usize..within as usize + n]),
                }
                done += n;
                i += 1;
            }
        }
        for b in &mut buf[done..] {
            *b = 0;
        }
        Ok(())
    }
}

// ── the script state

struct Edit {
    op: &'static str,
    offset: u64,
    data: Vec<u8>,
    /// Bytes deleted (write / insert: `data.len()`).
    length: u64,
}

pub struct Script<'a> {
    pub overlay: Overlay<'a>,
    edits: Vec<Edit>,
    edit_bytes: u64,
    output: String,
    sel_start: u64,
    sel_length: u64,
    cursor: u64,
    hits: Vec<u64>,
}

/// What a script produced.
pub struct ScriptResult {
    pub edits: Value,
    pub output: String,
    pub returned: Value,
    pub size: u64,
}

/// Hex text ("DE AD", "4d5a") rather than plain text: only hex digits, spaces and commas, an even count of digits.
fn looks_hex(s: &str) -> bool {
    let digits = s.chars().filter(|c| c.is_ascii_hexdigit()).count();
    digits > 0 && digits % 2 == 0 && s.chars().all(|c| c.is_ascii_hexdigit() || c.is_whitespace() || c == ',')
}

/// C's exponent form: 1.500000e+02.
fn c_exp(f: f64, prec: usize, upper: bool) -> String {
    let s = format!("{:.*e}", prec, f);
    let (mant, exp) = s.split_once('e').unwrap_or((&s, "0"));
    let e: i32 = exp.parse().unwrap_or(0);
    let out = format!("{mant}e{}{:02}", if e < 0 { '-' } else { '+' }, e.abs());
    if upper { out.to_uppercase() } else { out }
}

fn strip_zeros(s: String) -> String {
    if !s.contains('.') {
        return s;
    }
    let (mant, exp) = match s.find(['e', 'E']) {
        Some(i) => (s[..i].to_string(), s[i..].to_string()),
        None => (s.clone(), String::new()),
    };
    let mant = mant.trim_end_matches('0').trim_end_matches('.').to_string();
    mant + &exp
}

/// C's %g.
fn c_general(f: f64, prec: usize, upper: bool, alt: bool) -> String {
    let p = if prec == 0 { 1 } else { prec };
    if f == 0.0 || !f.is_finite() {
        let s = if f.is_finite() { format!("{:.*}", p - 1, f) } else { format!("{f}") };
        return if alt { s } else { strip_zeros(s) };
    }
    let x = f.abs().log10().floor() as i32;
    // The exponent after rounding to p digits.
    let x = {
        let e = c_exp(f, p - 1, false);
        e.split_once('e').and_then(|(_, e)| e.parse::<i32>().ok()).unwrap_or(x)
    };
    let s = if (x as i64) < p as i64 && x >= -4 { format!("{:.*}", (p as i64 - 1 - x as i64).max(0) as usize, f) } else { c_exp(f, p - 1, upper) };
    if alt { s } else { strip_zeros(s) }
}

impl<'a, 'p> Ctx<'a, 'p> {
    /// Turns on script mode: writes, output, the selection and cursor from `args`.
    pub fn enable_script(&mut self, args: &Value) {
        let len = self.src.len();
        let sel_start = args.get("selStart").and_then(Value::as_u64).unwrap_or(0).min(len);
        let sel_length = args.get("selLength").and_then(Value::as_u64).unwrap_or(0).min(len - sel_start);
        let cursor = args.get("cursor").and_then(Value::as_u64).unwrap_or(sel_start).min(len);
        self.script = Some(Box::new(Script {
            overlay: Overlay::new(self.src),
            edits: Vec::new(),
            edit_bytes: 0,
            output: String::new(),
            sel_start,
            sel_length,
            cursor,
            hits: Vec::new(),
        }));
    }

    pub fn script_result(&self) -> ScriptResult {
        let s = self.script.as_ref().expect("script mode");
        let edits = s
            .edits
            .iter()
            .map(|e| json!({ "op": e.op, "offset": e.offset, "data": b64(&e.data), "length": e.length }))
            .collect();
        let returned = match &self.ret {
            Some(v) => self.val_json(v),
            None => Value::Null,
        };
        ScriptResult { edits: Value::Array(edits), output: s.output.clone(), returned, size: s.overlay.len }
    }

    fn val_json(&self, v: &Val) -> Value {
        match v {
            Val::Int(n) => match (i64::try_from(*n), u64::try_from(*n)) {
                (Ok(x), _) => json!(x),
                (_, Ok(x)) => json!(x),
                _ => json!(n.to_string()),
            },
            Val::Float(f) if f.is_finite() => json!(f),
            Val::Float(f) => json!(f.to_string()),
            Val::Str(s) => json!(s),
            Val::Node(i) => match self.deref(Val::Node(*i)) {
                Val::Node(i) => self.node_json(i, 0),
                other => self.val_json(&other),
            },
            Val::Void => Value::Null,
        }
    }

    fn sc(&mut self) -> &mut Script<'a> {
        self.script.as_mut().expect("script mode")
    }

    /// Keeps an edit (joined to the one before when it continues it) and applies it to the overlay.
    fn edit(&mut self, op: &'static str, offset: u64, data: Vec<u8>, length: u64, pos: Pos) -> R<()> {
        let s = self.sc();
        let n = data.len() as u64;
        let mut joined = false;
        if let Some(last) = s.edits.last_mut() {
            let last_end = last.offset + last.data.len() as u64;
            match (op, last.op) {
                // Inside bytes the previous write or insert put there: change them.
                ("write", "write" | "insert") if offset >= last.offset && offset + n <= last_end => {
                    let w = (offset - last.offset) as usize;
                    last.data[w..w + n as usize].copy_from_slice(&data);
                    joined = true;
                }
                ("write", "write") | ("insert", "insert") if offset == last_end => {
                    if s.edit_bytes + n > MAX_EDIT_BYTES {
                        return fail(pos, format!("the script's edits exceed {} MiB", MAX_EDIT_BYTES >> 20));
                    }
                    last.data.extend_from_slice(&data);
                    last.length += n;
                    s.edit_bytes += n;
                    joined = true;
                }
                ("delete", "delete") if offset == last.offset => {
                    last.length += length;
                    joined = true;
                }
                _ => {}
            }
        }
        if !joined {
            if s.edit_bytes + n > MAX_EDIT_BYTES {
                return fail(pos, format!("the script's edits exceed {} MiB", MAX_EDIT_BYTES >> 20));
            }
            s.edit_bytes += n;
            s.edits.push(Edit { op, offset, data: data.clone(), length });
        }
        match op {
            "write" => s.overlay.write(offset, &data),
            "insert" => s.overlay.insert(offset, data),
            _ => s.overlay.delete(offset, length),
        }
        self.len = self.sc().overlay.len;
        self.cursor = self.cursor.min(self.len);
        Ok(())
    }

    fn write_at(&mut self, offset: u64, data: Vec<u8>, pos: Pos) -> R<Val> {
        let n = data.len() as u64;
        if offset.checked_add(n).is_none_or(|end| end > self.len) {
            return fail(pos, format!("writing {n} bytes at 0x{offset:X} goes past the end (size 0x{:X}); InsertBytes adds bytes", self.len));
        }
        if n > 0 {
            self.edit("write", offset, data, n, pos)?;
        }
        Ok(Val::Void)
    }

    fn write_num(&mut self, args: &'a [Expr], size: usize, float: bool, big: Option<bool>, pos: Pos) -> R<Val> {
        if args.len() != 2 {
            return fail(pos, "Write…(offset, value)");
        }
        let off = self.arg_u64(args, 0, pos)?;
        let v = self.arg(args, 1, pos)?;
        let bits: u128 = match (v, float) {
            (Val::Int(n), false) => n as u128,
            (Val::Float(f), false) => (f as i128) as u128,
            (Val::Int(n), true) if size == 4 => (n as f32).to_bits() as u128,
            (Val::Float(f), true) if size == 4 => (f as f32).to_bits() as u128,
            (Val::Int(n), true) => (n as f64).to_bits() as u128,
            (Val::Float(f), true) => f.to_bits() as u128,
            _ => return fail(pos, "a number is needed for the value"),
        };
        let mut bytes: Vec<u8> = (0..size).map(|i| (bits >> (8 * i)) as u8).collect();
        if big.unwrap_or(self.big) {
            bytes.reverse();
        }
        self.write_at(off, bytes, pos)
    }

    fn out(&mut self, text: &str, pos: Pos) -> R<()> {
        let s = self.sc();
        if s.output.len() + text.len() > MAX_OUTPUT {
            return fail(pos, format!("too much output (more than {} MiB)", MAX_OUTPUT >> 20));
        }
        s.output.push_str(text);
        Ok(())
    }

    /// C printf: flags - 0 + space #, width, .precision, length letters ignored; d i u x X o b c s f F e E g G %.
    fn printf(&mut self, fmt: &str, vals: &[Val], pos: Pos) -> R<String> {
        let chars: Vec<char> = fmt.chars().collect();
        let mut out = String::new();
        let mut next = 0usize;
        let mut i = 0usize;
        while i < chars.len() {
            let c = chars[i];
            i += 1;
            if c != '%' {
                out.push(c);
                continue;
            }
            if i < chars.len() && chars[i] == '%' {
                out.push('%');
                i += 1;
                continue;
            }
            let (mut left, mut zero, mut plus, mut space, mut alt) = (false, false, false, false, false);
            while i < chars.len() {
                match chars[i] {
                    '-' => left = true,
                    '0' => zero = true,
                    '+' => plus = true,
                    ' ' => space = true,
                    '#' => alt = true,
                    _ => break,
                }
                i += 1;
            }
            let mut width = 0usize;
            while i < chars.len() && chars[i].is_ascii_digit() {
                width = width * 10 + chars[i].to_digit(10).unwrap() as usize;
                i += 1;
            }
            let mut prec: Option<usize> = None;
            if i < chars.len() && chars[i] == '.' {
                i += 1;
                let mut p = 0usize;
                while i < chars.len() && chars[i].is_ascii_digit() {
                    p = p * 10 + chars[i].to_digit(10).unwrap() as usize;
                    i += 1;
                }
                prec = Some(p);
            }
            while i < chars.len() && matches!(chars[i], 'h' | 'l' | 'L' | 'q' | 'j' | 'z' | 't' | 'I' | '6' | '4' | '3' | '2') {
                i += 1;
            }
            let Some(&conv) = chars.get(i) else {
                return fail(pos, "Printf: the format ends inside a %");
            };
            i += 1;
            let Some(v) = vals.get(next).cloned() else {
                return fail(pos, format!("Printf: no value for %{conv} (value {} of {})", next + 1, vals.len()));
            };
            next += 1;
            let as_int = |v: &Val| -> Option<i128> {
                match v {
                    Val::Int(n) => Some(*n),
                    Val::Float(f) => Some(*f as i128),
                    Val::Str(s) => s.chars().next().map(|c| c as i128),
                    _ => None,
                }
            };
            let as_float = |v: &Val| -> Option<f64> {
                match v {
                    Val::Int(n) => Some(*n as f64),
                    Val::Float(f) => Some(*f),
                    _ => None,
                }
            };
            // (sign or prefix, digits, numeric: zero padding allowed)
            let (prefix, body, numeric): (String, String, bool) = match conv {
                'd' | 'i' | 'u' | 'x' | 'X' | 'o' | 'b' => {
                    let Some(n) = as_int(&v) else {
                        return fail(pos, format!("Printf: %{conv} needs a number"));
                    };
                    let unsigned: u128 = if n < 0 { (n as i64 as u64) as u128 } else { n as u128 };
                    let (sign, mut digits) = match conv {
                        'd' | 'i' => (if n < 0 { "-" } else if plus { "+" } else if space { " " } else { "" }, n.unsigned_abs().to_string()),
                        'u' => ("", unsigned.to_string()),
                        'x' => (if alt && n != 0 { "0x" } else { "" }, format!("{unsigned:x}")),
                        'X' => (if alt && n != 0 { "0X" } else { "" }, format!("{unsigned:X}")),
                        'o' => (if alt && n != 0 { "0" } else { "" }, format!("{unsigned:o}")),
                        _ => (if alt && n != 0 { "0b" } else { "" }, format!("{unsigned:b}")),
                    };
                    if let Some(p) = prec {
                        if p == 0 && n == 0 {
                            digits.clear();
                        }
                        while digits.len() < p {
                            digits.insert(0, '0');
                        }
                    }
                    (sign.to_string(), digits, prec.is_none())
                }
                'f' | 'F' | 'e' | 'E' | 'g' | 'G' => {
                    let Some(f) = as_float(&v) else {
                        return fail(pos, format!("Printf: %{conv} needs a number"));
                    };
                    let p = prec.unwrap_or(6);
                    let a = f.abs();
                    let digits = if !a.is_finite() {
                        if a.is_nan() { "nan".to_string() } else { "inf".to_string() }
                    } else {
                        match conv {
                            'f' | 'F' => format!("{:.*}", p, a),
                            'e' | 'E' => c_exp(a, p, conv == 'E'),
                            _ => c_general(a, p, conv == 'G', alt),
                        }
                    };
                    let sign = if f.is_sign_negative() && !f.is_nan() { "-" } else if plus { "+" } else if space { " " } else { "" };
                    (sign.to_string(), digits, a.is_finite())
                }
                'c' => {
                    let ch = as_int(&v).and_then(|n| u32::try_from(n).ok()).and_then(char::from_u32).unwrap_or('?');
                    (String::new(), ch.to_string(), false)
                }
                's' => {
                    let mut t = self.text_of(&v);
                    if let Some(p) = prec {
                        t = t.chars().take(p).collect();
                    }
                    (String::new(), t, false)
                }
                'p' => {
                    let n = as_int(&v).unwrap_or(0);
                    ("0x".to_string(), format!("{:X}", n as u128), false)
                }
                other => return fail(pos, format!("Printf: unknown conversion %{other}")),
            };
            let used = prefix.chars().count() + body.chars().count();
            let pad = width.saturating_sub(used);
            if left {
                out.push_str(&prefix);
                out.push_str(&body);
                out.extend(std::iter::repeat_n(' ', pad));
            } else if zero && numeric {
                out.push_str(&prefix);
                out.extend(std::iter::repeat_n('0', pad));
                out.push_str(&body);
            } else {
                out.extend(std::iter::repeat_n(' ', pad));
                out.push_str(&prefix);
                out.push_str(&body);
            }
        }
        Ok(out)
    }

    /// `Hash(id, offset, length)` over the data as changed so far: lower-case hex.
    fn digest(&mut self, args: &'a [Expr], pos: Pos) -> R<String> {
        let id = match self.arg(args, 0, pos)? {
            Val::Str(s) => s.to_ascii_lowercase().replace(['-', ' '], ""),
            _ => return fail(pos, "Hash(\"sha256\", offset, length): the algorithm is text"),
        };
        let off = if args.len() > 1 { self.arg_u64(args, 1, pos)? } else { 0 };
        if off > self.len {
            return fail(pos, format!("offset 0x{off:X} is past the end (size 0x{:X})", self.len));
        }
        let length = if args.len() > 2 { self.arg_u64(args, 2, pos)? } else { self.len - off };
        if length > self.len - off {
            return fail(pos, format!("{length} bytes at 0x{off:X} go past the end (size 0x{:X})", self.len));
        }
        let script = self.script.as_ref().expect("script mode");
        let out = crate::hash::hash(&script.overlay, &json!({ "offset": off, "length": length, "algorithms": [id] }), &mut *self.progress);
        match out {
            Ok(v) => Ok(v["results"][0]["value"].as_str().unwrap_or("").to_string()),
            Err(e) if e == CANCELLED => Err(Fail::Cancelled),
            Err(e) => fail(pos, e),
        }
    }

    /// Every (non-overlapping) place of `pattern` in the data as changed so far.
    fn find_all(&mut self, pattern: &[u8], pos: Pos) -> R<usize> {
        let mut hits = Vec::new();
        let plen = pattern.len() as u64;
        if plen > 0 {
            let chunk: u64 = 1 << 16;
            let mut at = 0u64;
            while at + plen <= self.len {
                let n = (self.len - at).min(chunk + plen - 1);
                let buf = self.read_bytes(at, n, pos)?;
                let mut i = 0usize;
                while i + pattern.len() <= buf.len() {
                    if buf[i] == pattern[0] && &buf[i..i + pattern.len()] == pattern {
                        if hits.len() >= MAX_HITS {
                            self.warnings.push((pos, format!("FindAll stopped at {MAX_HITS} matches")));
                            self.sc().hits = hits;
                            return Ok(MAX_HITS);
                        }
                        hits.push(at + i as u64);
                        i += pattern.len();
                    } else {
                        i += 1;
                    }
                }
                if at + n >= self.len {
                    break;
                }
                at += i as u64;
                if !(self.progress)(at, self.len) {
                    return Err(Fail::Cancelled);
                }
            }
        }
        let count = hits.len();
        self.sc().hits = hits;
        Ok(count)
    }

    fn truth(v: &Val) -> bool {
        match v {
            Val::Int(n) => *n != 0,
            Val::Float(f) => *f != 0.0,
            Val::Str(s) => !s.is_empty(),
            Val::Node(_) => true,
            Val::Void => false,
        }
    }

    /// The script builtins; None: not one of them (the template builtins go on).
    #[inline(never)]
    pub(super) fn script_builtin(&mut self, name: &str, args: &'a [Expr], pos: Pos) -> Option<R<Val>> {
        let num = |size: usize, float: bool, big: Option<bool>| Some((size, float, big));
        let write = match name {
            "WriteU8" | "WriteUByte" | "WriteUChar" | "WriteS8" | "WriteByte" | "WriteChar" => num(1, false, None),
            "WriteU16" | "WriteUShort" | "WriteS16" | "WriteShort" => num(2, false, None),
            "WriteU24" | "WriteS24" => num(3, false, None),
            "WriteU32" | "WriteUInt" | "WriteS32" | "WriteInt" => num(4, false, None),
            "WriteU64" | "WriteUInt64" | "WriteUQuad" | "WriteS64" | "WriteInt64" | "WriteQuad" => num(8, false, None),
            "WriteU16BE" | "WriteS16BE" => num(2, false, Some(true)),
            "WriteU32BE" | "WriteS32BE" => num(4, false, Some(true)),
            "WriteU64BE" | "WriteS64BE" => num(8, false, Some(true)),
            "WriteU16LE" | "WriteS16LE" => num(2, false, Some(false)),
            "WriteU32LE" | "WriteS32LE" => num(4, false, Some(false)),
            "WriteU64LE" | "WriteS64LE" => num(8, false, Some(false)),
            "WriteFloat" => num(4, true, None),
            "WriteDouble" => num(8, true, None),
            _ => None,
        };
        if let Some((size, float, big)) = write {
            return Some(self.write_num(args, size, float, big, pos));
        }
        if !SCRIPT_FUNCTIONS.contains(&name) {
            return None;
        }
        Some(self.script_call(name, args, pos))
    }

    #[inline(never)]
    fn script_call(&mut self, name: &str, args: &'a [Expr], pos: Pos) -> R<Val> {
        Ok(match name {
                "WriteBytes" => {
                    let off = self.arg_u64(args, 0, pos)?;
                    let data = match self.arg(args, 1, pos)? {
                        Val::Str(s) => parse_hex(&s).map_err(|e| Fail::Err(pos, format!("WriteBytes: {e}")))?,
                        Val::Int(n) => vec![n as u8],
                        _ => return fail(pos, "WriteBytes(offset, \"DE AD\")"),
                    };
                    self.write_at(off, data, pos)?
                }
                "WriteString" => {
                    let off = self.arg_u64(args, 0, pos)?;
                    let v = self.arg(args, 1, pos)?;
                    let mut data = self.text_of(&v).into_bytes();
                    // WriteString(o, text, true): with a terminating 0.
                    if args.len() > 2 && Self::truth(&self.arg(args, 2, pos)?) {
                        data.push(0);
                    }
                    self.write_at(off, data, pos)?
                }
                "InsertBytes" => {
                    let off = self.arg_u64(args, 0, pos)?;
                    let count = self.arg_u64(args, 1, pos)?;
                    let fill = if args.len() > 2 {
                        match self.arg(args, 2, pos)? {
                            Val::Int(n) => n as u8,
                            Val::Float(f) => f as u8,
                            _ => return fail(pos, "InsertBytes(offset, count, fill): the fill is a byte value"),
                        }
                    } else {
                        0
                    };
                    if off > self.len {
                        return fail(pos, format!("inserting at 0x{off:X}, past the end (size 0x{:X})", self.len));
                    }
                    let used = self.sc().edit_bytes;
                    if count > MAX_EDIT_BYTES.saturating_sub(used) {
                        return fail(pos, format!("the script's edits exceed {} MiB", MAX_EDIT_BYTES >> 20));
                    }
                    if count > 0 {
                        self.edit("insert", off, vec![fill; count as usize], count, pos)?;
                    }
                    Val::Void
                }
                "DeleteBytes" => {
                    let off = self.arg_u64(args, 0, pos)?;
                    let count = self.arg_u64(args, 1, pos)?;
                    if off.checked_add(count).is_none_or(|end| end > self.len) {
                        return fail(pos, format!("deleting {count} bytes at 0x{off:X} goes past the end (size 0x{:X})", self.len));
                    }
                    if count > 0 {
                        self.edit("delete", off, Vec::new(), count, pos)?;
                    }
                    Val::Void
                }
                "Printf" | "printf" => {
                    let fmt = match self.arg(args, 0, pos)? {
                        Val::Str(s) => s,
                        other => self.text_of(&other),
                    };
                    let mut vals = Vec::with_capacity(args.len().saturating_sub(1));
                    for k in 1..args.len() {
                        vals.push(self.arg(args, k, pos)?);
                    }
                    let text = self.printf(&fmt, &vals, pos)?;
                    self.out(&text, pos)?;
                    Val::Void
                }
                "Print" | "print" | "println" => {
                    let mut parts = Vec::with_capacity(args.len());
                    for k in 0..args.len() {
                        let v = self.arg(args, k, pos)?;
                        parts.push(self.text_of(&v));
                    }
                    let text = parts.join(" ") + "\n";
                    self.out(&text, pos)?;
                    Val::Void
                }
                "Selection" => {
                    let (start, length) = {
                        let s = self.sc();
                        (s.sel_start, s.sel_length)
                    };
                    let mut node = self.blank("selection", "selection".into(), start, NK::Struct);
                    node.size = length;
                    node.hidden = true;
                    let idx = self.new_node(node, pos)?;
                    for (key, v) in [("start", start), ("length", length), ("end", start + length)] {
                        let mut child = self.blank(key, "u64".into(), start, NK::Int(v as i128));
                        child.hidden = true;
                        let c = self.new_node(child, pos)?;
                        self.nodes[idx].children.push(c);
                    }
                    Val::Node(idx)
                }
                "SelectionStart" | "GetSelStart" => Val::Int(self.sc().sel_start as i128),
                "SelectionLength" | "GetSelSize" => Val::Int(self.sc().sel_length as i128),
                "Cursor" | "GetCursorPos" => Val::Int(self.sc().cursor as i128),
                "Exit" => {
                    if !args.is_empty() {
                        let v = self.arg(args, 0, pos)?;
                        self.ret = Some(v);
                    }
                    return Err(Fail::Exit);
                }
                "Assert" => {
                    let v = self.arg(args, 0, pos)?;
                    if !Self::truth(&v) {
                        let msg = if args.len() > 1 {
                            let m = self.arg(args, 1, pos)?;
                            self.text_of(&m)
                        } else {
                            "the condition is false".to_string()
                        };
                        return fail(pos, format!("Assert failed: {msg}"));
                    }
                    Val::Void
                }
                "Hash" => Val::Str(self.digest(args, pos)?),
                "Checksum" => {
                    let hex = self.digest(args, pos)?;
                    match u128::from_str_radix(&hex, 16) {
                        Ok(v) if hex.len() <= 31 => Val::Int(v as i128),
                        _ => Val::Str(hex),
                    }
                }
                "FindAll" => {
                    let force_text = args.len() > 1 && Self::truth(&self.arg(args, 1, pos)?);
                    let pattern = match self.arg(args, 0, pos)? {
                        Val::Str(s) if !force_text && looks_hex(&s) => parse_hex(&s).map_err(|e| Fail::Err(pos, e))?,
                        Val::Str(s) => s.into_bytes(),
                        Val::Int(n) => vec![n as u8],
                        _ => return fail(pos, "FindAll(\"hex bytes\" or \"text\")"),
                    };
                    if pattern.is_empty() {
                        return fail(pos, "FindAll: nothing to look for");
                    }
                    Val::Int(self.find_all(&pattern, pos)? as i128)
                }
                "FindAt" => {
                    let k = self.arg_u64(args, 0, pos)? as usize;
                    Val::Int(self.sc().hits.get(k).map_or(-1, |o| *o as i128))
                }
                _ => return fail(pos, format!("unknown function '{name}'")),
            })
    }
}
