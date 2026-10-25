//! Digital logic simulation (the Proteus / logic-analyser way): an event-driven
//! gate-level simulator with propagation delays, flip-flops, counters and shift
//! registers, giving a timing diagram, bus values and a truth table.
//!
//! ```text
//! clock clk: period = 10
//! input reset: 1@0, 0@12
//! inputs a b c: binary, step = 20
//! sum = a ^ b ^ c
//! carry = a & b | c & (a ^ b), delay = 2
//! q, qn = dff(sum, clk, reset)
//! cnt[4] = counter(clk, reset)
//! sr[4] = shift(q, clk)
//! bus count = cnt
//! ```
//!
//! Operators: ~ or ! (not), & or * (and), ^ (xor), | or + (or), and the
//! functions and(), or(), xor(), nand(), nor(), xnor(), not(), buf(),
//! mux(sel, a, b). Sequential parts: dff(d, clk[, reset]), jkff(j, k, clk[, reset]),
//! tff(t, clk[, reset]), latch(d, enable), srlatch(s, r),
//! name[n] = counter(clk[, reset[, enable]]) (bits name0 = LSB … ), name[n] = shift(din, clk[, reset]).
//! A microcontroller runs firmware on its own clock (see mcu.rs for the instructions):
//! ```text
//! mcu u1: period = 1, out = led0 led1 led2, in = button
//! program u1:
//!   loop: tgl 0
//!         delay 10
//!         jmp loop
//! end
//! ```

use crate::data::{Column, Dataset, Table};
use crate::rng::Rng;
use crate::Ctx;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};

#[derive(Debug, Clone)]
enum B {
    Sig(usize),
    Const(bool),
    Not(Box<B>),
    And(Vec<B>),
    Or(Vec<B>),
    Xor(Vec<B>),
    Mux(Box<B>, Box<B>, Box<B>),
}

impl B {
    fn eval(&self, v: &[bool]) -> bool {
        match self {
            B::Sig(i) => v[*i],
            B::Const(c) => *c,
            B::Not(a) => !a.eval(v),
            B::And(xs) => xs.iter().all(|x| x.eval(v)),
            B::Or(xs) => xs.iter().any(|x| x.eval(v)),
            B::Xor(xs) => xs.iter().fold(false, |acc, x| acc ^ x.eval(v)),
            B::Mux(s, a, b) => {
                if s.eval(v) {
                    b.eval(v)
                } else {
                    a.eval(v)
                }
            }
        }
    }

    fn signals(&self, out: &mut Vec<usize>) {
        match self {
            B::Sig(i) => out.push(*i),
            B::Const(_) => {}
            B::Not(a) => a.signals(out),
            B::And(xs) | B::Or(xs) | B::Xor(xs) => xs.iter().for_each(|x| x.signals(out)),
            B::Mux(s, a, b) => {
                s.signals(out);
                a.signals(out);
                b.signals(out);
            }
        }
    }
}

/// Signal names, found or added.
struct Names {
    list: Vec<String>,
}

impl Names {
    fn id(&mut self, name: &str) -> usize {
        match self.list.iter().position(|n| n == name) {
            Some(i) => i,
            None => {
                self.list.push(name.to_string());
                self.list.len() - 1
            }
        }
    }
}

fn valid(name: &str) -> bool {
    let mut c = name.chars();
    c.next().is_some_and(|f| f.is_ascii_alphabetic() || f == '_') && c.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

// ───────────────────────── boolean expressions

struct Parser<'a> {
    toks: Vec<String>,
    pos: usize,
    names: &'a mut Names,
}

fn lex(text: &str) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
        } else if c.is_ascii_alphanumeric() || c == '_' {
            let s = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            out.push(chars[s..i].iter().collect());
        } else if "~!&*^|+(),'".contains(c) {
            out.push(c.to_string());
            i += 1;
        } else {
            return Err(format!("unexpected \"{c}\""));
        }
    }
    Ok(out)
}

impl Parser<'_> {
    fn peek(&self) -> Option<&str> {
        self.toks.get(self.pos).map(|s| s.as_str())
    }

    fn next(&mut self) -> Option<String> {
        let t = self.toks.get(self.pos).cloned();
        self.pos += 1;
        t
    }

    fn expect(&mut self, s: &str) -> Result<(), String> {
        match self.next() {
            Some(t) if t == s => Ok(()),
            Some(t) => Err(format!("expected \"{s}\", found \"{t}\"")),
            None => Err(format!("expected \"{s}\"")),
        }
    }

    fn or(&mut self) -> Result<B, String> {
        let mut xs = vec![self.xor()?];
        while matches!(self.peek(), Some("|") | Some("+")) {
            self.pos += 1;
            xs.push(self.xor()?);
        }
        Ok(if xs.len() == 1 { xs.pop().unwrap() } else { B::Or(xs) })
    }

    fn xor(&mut self) -> Result<B, String> {
        let mut xs = vec![self.and()?];
        while self.peek() == Some("^") {
            self.pos += 1;
            xs.push(self.and()?);
        }
        Ok(if xs.len() == 1 { xs.pop().unwrap() } else { B::Xor(xs) })
    }

    fn and(&mut self) -> Result<B, String> {
        let mut xs = vec![self.unary()?];
        loop {
            match self.peek() {
                Some("&") | Some("*") => {
                    self.pos += 1;
                    xs.push(self.unary()?);
                }
                // Juxtaposition is not allowed: "a b" is an error, so typos are caught.
                _ => break,
            }
        }
        Ok(if xs.len() == 1 { xs.pop().unwrap() } else { B::And(xs) })
    }

    fn unary(&mut self) -> Result<B, String> {
        if matches!(self.peek(), Some("~") | Some("!")) {
            self.pos += 1;
            return Ok(B::Not(Box::new(self.unary()?)));
        }
        let mut b = self.atom()?;
        // a' (postfix not, as in textbooks)
        while self.peek() == Some("'") {
            self.pos += 1;
            b = B::Not(Box::new(b));
        }
        Ok(b)
    }

    fn atom(&mut self) -> Result<B, String> {
        let t = self.next().ok_or("expression ends too early")?;
        if t == "(" {
            let b = self.or()?;
            self.expect(")")?;
            return Ok(b);
        }
        if t == "0" || t == "1" {
            return Ok(B::Const(t == "1"));
        }
        if !valid(&t) {
            return Err(format!("unexpected \"{t}\""));
        }
        if self.peek() == Some("(") {
            self.pos += 1;
            let mut args = Vec::new();
            if self.peek() != Some(")") {
                loop {
                    args.push(self.or()?);
                    if self.peek() == Some(",") {
                        self.pos += 1;
                    } else {
                        break;
                    }
                }
            }
            self.expect(")")?;
            let f = t.to_ascii_lowercase();
            let need = |n: usize| if args.len() < n { Err(format!("{f}() needs {n} argument{}", if n > 1 { "s" } else { "" })) } else { Ok(()) };
            return Ok(match f.as_str() {
                "and" => { need(1)?; B::And(args) }
                "or" => { need(1)?; B::Or(args) }
                "xor" => { need(1)?; B::Xor(args) }
                "nand" => { need(1)?; B::Not(Box::new(B::And(args))) }
                "nor" => { need(1)?; B::Not(Box::new(B::Or(args))) }
                "xnor" => { need(1)?; B::Not(Box::new(B::Xor(args))) }
                "not" | "inv" => {
                    if args.len() != 1 {
                        return Err("not() takes one argument".into());
                    }
                    B::Not(Box::new(args.pop().unwrap()))
                }
                "buf" => {
                    if args.len() != 1 {
                        return Err("buf() takes one argument".into());
                    }
                    args.pop().unwrap()
                }
                "mux" => {
                    if args.len() != 3 {
                        return Err("mux(sel, a, b) takes three arguments".into());
                    }
                    let b = args.pop().unwrap();
                    let a = args.pop().unwrap();
                    let s = args.pop().unwrap();
                    B::Mux(Box::new(s), Box::new(a), Box::new(b))
                }
                _ => return Err(format!("unknown gate \"{t}\" (sequential parts such as dff() go alone on the right of =)")),
            });
        }
        Ok(B::Sig(self.names.id(&t)))
    }
}

fn parse_bool(text: &str, names: &mut Names) -> Result<B, String> {
    let toks = lex(text)?;
    let mut p = Parser { toks, pos: 0, names };
    let b = p.or()?;
    if let Some(t) = p.peek() {
        return Err(format!("unexpected \"{t}\""));
    }
    Ok(b)
}

// ───────────────────────── the circuit

#[derive(Debug, Clone)]
enum Part {
    Gate { out: usize, f: B },
    Dff { q: usize, qn: Option<usize>, d: usize, clk: usize, rst: Option<usize> },
    Jk { q: usize, qn: Option<usize>, j: usize, k: usize, clk: usize, rst: Option<usize> },
    Tff { q: usize, qn: Option<usize>, t: usize, clk: usize, rst: Option<usize> },
    Latch { q: usize, qn: Option<usize>, d: usize, en: usize },
    Sr { q: usize, qn: Option<usize>, s: usize, r: usize },
    Counter { bits: Vec<usize>, clk: usize, rst: Option<usize>, en: Option<usize>, modulo: u64, down: bool, value: u64 },
    Shift { bits: Vec<usize>, din: usize, clk: usize, rst: Option<usize> },
    /// A microcontroller: its (hidden) clock, output and input pins, the CPU, a run-time error.
    Mcu { name: String, clk: usize, outs: Vec<usize>, ins: Vec<usize>, cpu: Box<super::mcu::Cpu>, error: Option<String> },
}

#[derive(Debug, Clone)]
enum Stim {
    Clock { period: f64, duty: f64, delay: f64 },
    Events(Vec<(f64, bool)>),
}

struct Circuit {
    names: Names,
    parts: Vec<(Part, f64)>,
    stims: Vec<(usize, Stim)>,
    buses: Vec<(String, Vec<usize>)>,
    /// Signals given as inputs, in order (for the truth table).
    inputs: Vec<usize>,
}

/// Splits "a, b = c" style text at top-level commas.
fn split_top(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0;
    let mut cur = String::new();
    for c in text.chars() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                out.push(std::mem::take(&mut cur).trim().to_string());
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    if !cur.trim().is_empty() {
        out.push(cur.trim().to_string());
    }
    out
}

fn options(parts: &[String]) -> Result<HashMap<String, String>, String> {
    let mut m = HashMap::new();
    for p in parts {
        let (k, v) = p.split_once('=').ok_or_else(|| format!("\"{p}\" is not key = value"))?;
        m.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
    }
    Ok(m)
}

fn number(m: &HashMap<String, String>, key: &str, default: f64) -> Result<f64, String> {
    match m.get(key) {
        None => Ok(default),
        Some(v) => crate::expr::Expr::with_names(v, &[]).map(|e| e.value(&[])).map_err(|e| format!("{key}: {e}")),
    }
}

/// The name list of a vector "cnt" (cnt0 … cntN-1) or a single signal.
fn expand(name: &str, names: &Names) -> Vec<String> {
    if names.list.iter().any(|n| n == name) {
        return vec![name.to_string()];
    }
    let mut bits = Vec::new();
    for k in 0.. {
        let b = format!("{name}{k}");
        if names.list.iter().any(|n| *n == b) {
            bits.push(b);
        } else {
            break;
        }
    }
    bits.reverse(); // MSB first
    bits
}

fn parse(text: &str, delay: f64, ctx: &Ctx, seed: u64) -> Result<Circuit, String> {
    let mut c = Circuit { names: Names { list: Vec::new() }, parts: Vec::new(), stims: Vec::new(), buses: Vec::new(), inputs: Vec::new() };
    let mut rng = Rng::new(seed);
    let mut bus_lines = Vec::new();
    // Firmware blocks ("program name:" … "end") are taken out first.
    let mut programs: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut lines: Vec<(usize, String)> = Vec::new();
    let mut in_program: Option<(String, String)> = None;
    for (no, raw) in text.lines().enumerate() {
        let t = raw.trim();
        if let Some((name, body)) = in_program.as_mut() {
            if t.eq_ignore_ascii_case("end") {
                programs.insert(name.clone(), std::mem::take(body));
                in_program = None;
            } else {
                body.push_str(raw);
                body.push('\n');
            }
            continue;
        }
        let lower = t.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("program ") {
            let name = rest.trim_end_matches(':').trim().to_string();
            in_program = Some((name, String::new()));
            continue;
        }
        lines.push((no, raw.to_string()));
    }
    if let Some((name, _)) = in_program {
        return Err(format!("program {name}: no \"end\" line"));
    }
    let mut mcu_lines = Vec::new();
    for (no, raw) in lines.iter().map(|(n, r)| (*n, r.as_str())) {
        let line = raw.split('#').next().unwrap().split("//").next().unwrap().trim();
        if line.is_empty() || line.starts_with('*') {
            continue;
        }
        if line.to_ascii_lowercase().starts_with("mcu ") {
            mcu_lines.push((no, line.to_string()));
            continue;
        }
        let err = |e: String| format!("line {}: {e}", no + 1);
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("clock ") {
            let rest = &line[line.len() - rest.len()..];
            let (name, opts) = rest.split_once(':').unwrap_or((rest, ""));
            let name = name.trim();
            if !valid(name) {
                return Err(err(format!("\"{name}\" is not a signal name")));
            }
            let m = options(&split_top(opts)).map_err(err)?;
            let period = number(&m, "period", 10.0).map_err(err)?;
            if !(period > 0.0) {
                return Err(err("period must be positive".into()));
            }
            let duty = number(&m, "duty", 0.5).map_err(err)?.clamp(0.01, 0.99);
            let id = c.names.id(name);
            c.stims.push((id, Stim::Clock { period, duty, delay: number(&m, "delay", 0.0).map_err(err)? }));
        } else if lower.starts_with("inputs ") || lower.starts_with("input ") {
            let rest = line.split_once(' ').unwrap().1;
            let (names, spec) = rest.split_once(':').ok_or_else(|| err("input name: pattern".into()))?;
            let names: Vec<&str> = names.split_whitespace().collect();
            if names.is_empty() || names.iter().any(|n| !valid(n)) {
                return Err(err("input names must be letters, digits and _".into()));
            }
            let items = split_top(spec);
            let opts: Vec<String> = items.iter().filter(|s| s.contains('=') && !s.contains('@')).cloned().collect();
            let m = options(&opts).map_err(err)?;
            let step = number(&m, "step", 10.0).map_err(err)?;
            let pattern: Vec<&String> = items.iter().filter(|s| !(s.contains('=') && !s.contains('@'))).collect();
            let first = pattern.first().map(|s| s.to_ascii_lowercase()).unwrap_or_default();
            if first == "binary" || first == "count" {
                // All combinations: the first name is the most significant bit.
                let n = names.len();
                for (k, nm) in names.iter().enumerate() {
                    let bit = n - 1 - k;
                    let ev: Vec<(f64, bool)> = (0..(1u64 << n)).map(|v| (v as f64 * step, (v >> bit) & 1 == 1)).collect();
                    let id = c.names.id(nm);
                    c.inputs.push(id);
                    c.stims.push((id, Stim::Events(ev)));
                }
                continue;
            }
            for nm in &names {
                let id = c.names.id(nm);
                c.inputs.push(id);
                let ev: Vec<(f64, bool)> = if first == "random" {
                    let count = number(&m, "count", 32.0).map_err(err)? as usize;
                    (0..count).map(|k| (k as f64 * step, rng.uniform() < 0.5)).collect()
                } else if first.starts_with("input(") {
                    let col = pattern[0][6..pattern[0].len() - 1].trim().to_string();
                    let table = super::input_table(ctx, "in").map_err(|_| err(format!("INPUT({col}) needs a table on the input")))?;
                    let x = table.pick_x(&ctx.str("x", ""));
                    let y = table.pick(&col).map_err(err)?;
                    let th = number(&m, "threshold", 0.5).map_err(err)?;
                    x.values.iter().zip(&y.values).filter(|(a, b)| a.is_finite() && b.is_finite()).map(|(t, v)| (*t, *v > th)).collect()
                } else if pattern.iter().any(|s| s.contains('@')) {
                    let mut ev = Vec::new();
                    for item in pattern.iter().flat_map(|s| s.split_whitespace()) {
                        let (v, t) = item.split_once('@').ok_or_else(|| err(format!("\"{item}\" is not value@time")))?;
                        let t: f64 = crate::expr::Expr::with_names(t, &[]).map(|e| e.value(&[])).map_err(|e| err(e))?;
                        ev.push((t, v.trim() == "1"));
                    }
                    ev.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(Ordering::Equal));
                    ev
                } else {
                    let bits: String = pattern.iter().map(|s| s.as_str()).collect::<Vec<_>>().join("").chars().filter(|c| !c.is_whitespace()).collect();
                    if bits.is_empty() || bits.chars().any(|c| c != '0' && c != '1') {
                        return Err(err("a pattern is 0/1 bits (0110 …), value@time pairs, binary, random or INPUT(column)".into()));
                    }
                    bits.chars().enumerate().map(|(k, ch)| (k as f64 * step, ch == '1')).collect()
                };
                c.stims.push((id, Stim::Events(ev)));
            }
        } else if let Some(rest) = lower.strip_prefix("bus ") {
            let rest = &line[line.len() - rest.len()..];
            let (name, sigs) = rest.split_once('=').ok_or_else(|| err("bus name = signals (MSB first)".into()))?;
            bus_lines.push((no, name.trim().to_string(), sigs.trim().to_string()));
        } else {
            let (lhs, rhs) = line.split_once('=').ok_or_else(|| err("expected \"name = expression\"".into()))?;
            let mut items = split_top(rhs);
            let body = items.remove(0);
            let m = options(&items).map_err(err)?;
            let dly = number(&m, "delay", delay).map_err(err)?.max(0.0);
            let outs: Vec<String> = lhs.split(',').map(|s| s.trim().to_string()).collect();
            // name[n] for vectors
            let mut width = 1usize;
            let mut base = outs[0].clone();
            if let Some(open) = base.find('[') {
                width = base[open + 1..base.len() - 1].trim().parse().map_err(|_| err(format!("\"{base}\": width must be a number")))?;
                base = base[..open].trim().to_string();
                if !(1..=32).contains(&width) {
                    return Err(err("vectors are 1 … 32 bits".into()));
                }
            }
            for o in std::iter::once(&base).chain(outs.iter().skip(1)) {
                if !valid(o) {
                    return Err(err(format!("\"{o}\" is not a signal name")));
                }
            }
            let call = body.find('(').map(|i| body[..i].trim().to_ascii_lowercase());
            let args = |c: &mut Circuit| -> Result<Vec<usize>, String> {
                let open = body.find('(').unwrap();
                if !body.ends_with(')') {
                    return Err("missing )".into());
                }
                let mut ids = Vec::new();
                for a in split_top(&body[open + 1..body.len() - 1]) {
                    // A constant input: a hidden signal driven by a constant gate.
                    if a == "0" || a == "1" {
                        let name = format!("_const{a}");
                        if !c.names.list.contains(&name) {
                            let id = c.names.id(&name);
                            c.parts.push((Part::Gate { out: id, f: B::Const(a == "1") }, 0.0));
                        }
                        ids.push(c.names.id(&name));
                        continue;
                    }
                    if !valid(&a) {
                        return Err(format!("\"{a}\": the inputs of a flip-flop are signal names"));
                    }
                    ids.push(c.names.id(&a));
                }
                Ok(ids)
            };
            let q = c.names.id(&base);
            let qn = outs.get(1).map(|n| c.names.id(n));
            let part = match call.as_deref() {
                Some("dff") => {
                    let a = args(&mut c).map_err(err)?;
                    if a.len() < 2 {
                        return Err(err("dff(d, clk[, reset])".into()));
                    }
                    Part::Dff { q, qn, d: a[0], clk: a[1], rst: a.get(2).copied() }
                }
                Some("jkff") => {
                    let a = args(&mut c).map_err(err)?;
                    if a.len() < 3 {
                        return Err(err("jkff(j, k, clk[, reset])".into()));
                    }
                    Part::Jk { q, qn, j: a[0], k: a[1], clk: a[2], rst: a.get(3).copied() }
                }
                Some("tff") => {
                    let a = args(&mut c).map_err(err)?;
                    if a.len() < 2 {
                        return Err(err("tff(t, clk[, reset])".into()));
                    }
                    Part::Tff { q, qn, t: a[0], clk: a[1], rst: a.get(2).copied() }
                }
                Some("latch") => {
                    let a = args(&mut c).map_err(err)?;
                    if a.len() != 2 {
                        return Err(err("latch(d, enable)".into()));
                    }
                    Part::Latch { q, qn, d: a[0], en: a[1] }
                }
                Some("srlatch") => {
                    let a = args(&mut c).map_err(err)?;
                    if a.len() != 2 {
                        return Err(err("srlatch(s, r)".into()));
                    }
                    Part::Sr { q, qn, s: a[0], r: a[1] }
                }
                Some("counter") | Some("shift") => {
                    let a = args(&mut c).map_err(err)?;
                    let is_counter = call.as_deref() == Some("counter");
                    // The vector's bits: base0 (LSB) … base{n-1}; the base name itself is unused.
                    c.names.list[q] = format!("{base}0");
                    let mut bits = vec![q];
                    for k in 1..width {
                        bits.push(c.names.id(&format!("{base}{k}")));
                    }
                    if is_counter {
                        if a.is_empty() {
                            return Err(err("counter(clk[, reset[, enable]])".into()));
                        }
                        let modulo = number(&m, "modulo", (1u64 << width) as f64).map_err(err)?.round().max(1.0) as u64;
                        let down = m.get("down").is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));
                        Part::Counter { bits, clk: a[0], rst: a.get(1).copied(), en: a.get(2).copied(), modulo, down, value: 0 }
                    } else {
                        if a.len() < 2 {
                            return Err(err("shift(din, clk[, reset])".into()));
                        }
                        Part::Shift { bits, din: a[0], clk: a[1], rst: a.get(2).copied() }
                    }
                }
                _ => {
                    if width > 1 {
                        return Err(err("only counter() and shift() make vectors".into()));
                    }
                    let f = parse_bool(&body, &mut c.names).map_err(err)?;
                    if let Some(n) = qn {
                        c.parts.push((Part::Gate { out: n, f: B::Not(Box::new(f.clone())) }, dly));
                    }
                    Part::Gate { out: q, f }
                }
            };
            c.parts.push((part, dly));
        }
    }
    for (no, line) in mcu_lines {
        let err = |e: String| format!("line {}: {e}", no + 1);
        let rest = &line[4..];
        let (name, opts) = rest.split_once(':').ok_or_else(|| err("mcu name: period = 1, out = pins…, in = pins…".into()))?;
        let name = name.trim().to_string();
        let m = options(&split_top(opts)).map_err(err)?;
        let period = number(&m, "period", 1.0).map_err(err)?;
        if !(period > 0.0) {
            return Err(err("period must be positive".into()));
        }
        let program = programs.remove(&name).ok_or_else(|| err(format!("no \"program {name}:\" … \"end\" block")))?;
        let cpu = super::mcu::Cpu::assemble(&program).map_err(|e| format!("mcu {name}: {e}"))?;
        let pins = |key: &str, c: &mut Circuit| -> Result<Vec<usize>, String> {
            let list: Vec<String> = m.get(key).map(|v| v.split_whitespace().map(|s| s.to_string()).collect()).unwrap_or_default();
            if list.len() > 8 {
                return Err(format!("{key}: at most 8 pins"));
            }
            for p in &list {
                if !valid(p) {
                    return Err(format!("\"{p}\" is not a signal name"));
                }
            }
            Ok(list.iter().map(|p| c.names.id(p)).collect())
        };
        let outs = pins("out", &mut c).map_err(err)?;
        let ins = pins("in", &mut c).map_err(err)?;
        let clk = c.names.id(&format!("_clk_{name}"));
        c.stims.push((clk, Stim::Clock { period, duty: 0.5, delay: 0.0 }));
        c.parts.push((Part::Mcu { name, clk, outs, ins, cpu: Box::new(cpu), error: None }, 0.0));
    }
    if let Some(name) = programs.keys().next() {
        return Err(format!("program {name}: no \"mcu {name}: …\" line uses it"));
    }
    // Every signal is driven by exactly one part or stimulus.
    let mut driver = vec![0usize; c.names.list.len()];
    for (p, _) in &c.parts {
        for o in outputs(p) {
            driver[o] += 1;
        }
    }
    for (s, _) in &c.stims {
        driver[*s] += 1;
    }
    let multi: Vec<&str> = (0..driver.len()).filter(|&i| driver[i] > 1).map(|i| c.names.list[i].as_str()).collect();
    if !multi.is_empty() {
        return Err(format!("driven more than once: {}", multi.join(", ")));
    }
    let undriven: Vec<String> = (0..driver.len()).filter(|&i| driver[i] == 0).map(|i| c.names.list[i].clone()).collect();
    if !undriven.is_empty() {
        return Err(format!("not driven by anything: {} (add an input, a clock or an equation)", undriven.join(", ")));
    }
    for (no, name, sigs) in bus_lines {
        let mut ids = Vec::new();
        for s in sigs.split(|c: char| c.is_whitespace() || c == ',').filter(|s| !s.is_empty()) {
            let list = expand(s, &c.names);
            if list.is_empty() {
                return Err(format!("line {}: bus {name}: no signal \"{s}\"", no + 1));
            }
            ids.extend(list.iter().map(|n| c.names.list.iter().position(|x| x == n).unwrap()));
        }
        c.buses.push((name, ids));
    }
    Ok(c)
}

fn outputs(p: &Part) -> Vec<usize> {
    match p {
        Part::Gate { out, .. } => vec![*out],
        Part::Dff { q, qn, .. } | Part::Jk { q, qn, .. } | Part::Tff { q, qn, .. } | Part::Latch { q, qn, .. } | Part::Sr { q, qn, .. } => {
            let mut v = vec![*q];
            v.extend(qn);
            v
        }
        Part::Counter { bits, .. } | Part::Shift { bits, .. } => bits.clone(),
        Part::Mcu { outs, .. } => outs.clone(),
    }
}

fn inputs_of(p: &Part) -> Vec<usize> {
    let mut v = Vec::new();
    match p {
        Part::Gate { f, .. } => f.signals(&mut v),
        Part::Dff { d, clk, rst, .. } => v.extend([*d, *clk].into_iter().chain(*rst)),
        Part::Jk { j, k, clk, rst, .. } => v.extend([*j, *k, *clk].into_iter().chain(*rst)),
        Part::Tff { t, clk, rst, .. } => v.extend([*t, *clk].into_iter().chain(*rst)),
        Part::Latch { d, en, .. } => v.extend([*d, *en]),
        Part::Sr { s, r, .. } => v.extend([*s, *r]),
        Part::Counter { clk, rst, en, .. } => v.extend([*clk].into_iter().chain(*rst).chain(*en)),
        Part::Shift { din, clk, rst, .. } => v.extend([*din, *clk].into_iter().chain(*rst)),
        // The pins are read at the clock edge; only the clock wakes it.
        Part::Mcu { clk, .. } => v.push(*clk),
    }
    v.sort_unstable();
    v.dedup();
    v
}

#[derive(PartialEq)]
struct Event {
    t: f64,
    seq: u64,
    sig: usize,
    val: bool,
}

impl Eq for Event {}

impl Ord for Event {
    fn cmp(&self, o: &Self) -> Ordering {
        o.t.partial_cmp(&self.t).unwrap_or(Ordering::Equal).then(o.seq.cmp(&self.seq))
    }
}

impl PartialOrd for Event {
    fn partial_cmp(&self, o: &Self) -> Option<Ordering> {
        Some(self.cmp(o))
    }
}

struct Sim {
    v: Vec<bool>,
    heap: BinaryHeap<Event>,
    seq: u64,
    /// The value each signal will have once its pending events land (for "no change" checks).
    pending: Vec<bool>,
    /// Events still queued per signal.
    inflight: Vec<usize>,
}

impl Sim {
    fn schedule(&mut self, t: f64, sig: usize, val: bool) {
        if self.pending[sig] == val {
            return;
        }
        self.pending[sig] = val;
        self.push(t, sig, val);
    }

    fn push(&mut self, t: f64, sig: usize, val: bool) {
        self.seq += 1;
        self.inflight[sig] += 1;
        self.heap.push(Event { t, seq: self.seq, sig, val });
    }
}

/// Reacts to a change of `sig` (old value `was`) at time t: new outputs of the part.
fn react(part: &mut Part, sig: usize, was: bool, v: &[bool]) -> Vec<(usize, bool)> {
    let rising = |s: usize| sig == s && !was && v[s];
    let both = |q: usize, qn: Option<usize>, val: bool| {
        let mut o = vec![(q, val)];
        if let Some(n) = qn {
            o.push((n, !val));
        }
        o
    };
    match part {
        Part::Gate { out, f } => vec![(*out, f.eval(v))],
        Part::Dff { q, qn, d, clk, rst } => {
            if rst.is_some_and(|r| v[r]) {
                both(*q, *qn, false)
            } else if rising(*clk) {
                both(*q, *qn, v[*d])
            } else {
                vec![]
            }
        }
        Part::Jk { q, qn, j, k, clk, rst } => {
            if rst.is_some_and(|r| v[r]) {
                both(*q, *qn, false)
            } else if rising(*clk) {
                let now = v[*q];
                let next = match (v[*j], v[*k]) {
                    (false, false) => now,
                    (true, false) => true,
                    (false, true) => false,
                    (true, true) => !now,
                };
                both(*q, *qn, next)
            } else {
                vec![]
            }
        }
        Part::Tff { q, qn, t, clk, rst } => {
            if rst.is_some_and(|r| v[r]) {
                both(*q, *qn, false)
            } else if rising(*clk) {
                both(*q, *qn, v[*q] ^ v[*t])
            } else {
                vec![]
            }
        }
        Part::Latch { q, qn, d, en } => {
            if v[*en] {
                both(*q, *qn, v[*d])
            } else {
                vec![]
            }
        }
        Part::Sr { q, qn, s, r } => match (v[*s], v[*r]) {
            (true, false) => both(*q, *qn, true),
            (false, true) | (true, true) => both(*q, *qn, false),
            _ => vec![],
        },
        Part::Counter { bits, clk, rst, en, modulo, down, value } => {
            if rst.is_some_and(|r| v[r]) {
                *value = 0;
            } else if rising(*clk) && en.map_or(true, |e| v[e]) {
                *value = if *down { (*value + *modulo - 1) % *modulo } else { (*value + 1) % *modulo };
            } else {
                return vec![];
            }
            bits.iter().enumerate().map(|(k, b)| (*b, (*value >> k) & 1 == 1)).collect()
        }
        Part::Mcu { clk, outs, ins, cpu, error, .. } => {
            if !rising(*clk) || error.is_some() {
                return vec![];
            }
            let pins = ins.iter().enumerate().fold(0u8, |acc, (k, &p)| acc | ((v[p] as u8) << k));
            match cpu.cycle(pins) {
                Ok(port) => outs.iter().enumerate().map(|(k, &o)| (o, (port >> k) & 1 == 1)).collect(),
                Err(e) => {
                    *error = Some(e);
                    vec![]
                }
            }
        }
        Part::Shift { bits, din, clk, rst } => {
            if rst.is_some_and(|r| v[r]) {
                bits.iter().map(|b| (*b, false)).collect()
            } else if rising(*clk) {
                // bit0 takes din, each bit takes its lower neighbour.
                let mut o = vec![(bits[0], v[*din])];
                for k in 1..bits.len() {
                    o.push((bits[k], v[bits[k - 1]]));
                }
                o
            } else {
                vec![]
            }
        }
    }
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let delay = ctx.num("delay", 1.0)?.max(0.0);
    let seed = ctx.int("seed", 1)? as u64;
    let mut c = parse(&ctx.str("circuit", ""), delay, ctx, seed)?;
    if c.parts.is_empty() && c.stims.is_empty() {
        return Err("the circuit is empty".into());
    }
    let n = c.names.list.len();
    let mut d = Dataset::default();
    let mode = ctx.str("mode", "timing");

    if mode == "truth" {
        // Combinational truth table over the inputs (clocks held at 0, sequential parts at reset).
        let ins = c.inputs.clone();
        if ins.is_empty() || ins.len() > 16 {
            return Err("a truth table needs 1 … 16 inputs".into());
        }
        let outs: Vec<usize> = (0..n).filter(|i| !ins.contains(i) && !c.stims.iter().any(|(s, _)| s == i)).collect();
        let mut cols: Vec<Vec<f64>> = vec![Vec::new(); ins.len() + outs.len()];
        for combo in 0..(1u64 << ins.len()) {
            let mut v = vec![false; n];
            for (k, &i) in ins.iter().enumerate() {
                v[i] = (combo >> (ins.len() - 1 - k)) & 1 == 1;
            }
            // Settle: repeat until nothing changes (or report oscillation).
            let mut settled = false;
            for _ in 0..(4 * c.parts.len() + 4) {
                let mut changed = false;
                for (p, _) in c.parts.iter_mut() {
                    if let Part::Gate { out, f } = p {
                        let nv = f.eval(&v);
                        if v[*out] != nv {
                            v[*out] = nv;
                            changed = true;
                        }
                    }
                }
                if !changed {
                    settled = true;
                    break;
                }
            }
            if !settled {
                ctx.warn(format!("the outputs oscillate for input {combo:0w$b}", w = ins.len()));
            }
            for (k, &i) in ins.iter().chain(&outs).enumerate() {
                cols[k].push(if v[i] { 1.0 } else { 0.0 });
            }
        }
        let mut t = Table::new("truth table");
        for (k, &i) in ins.iter().chain(&outs).enumerate() {
            t.push(Column::new(&c.names.list[i], "", std::mem::take(&mut cols[k])));
        }
        for (name, ids) in &c.buses {
            let rows = t.rows();
            let vals: Vec<f64> = (0..rows).map(|r| ids.iter().fold(0u64, |acc, &i| (acc << 1) | (t.column(&c.names.list[i]).unwrap().values[r] as u64)) as f64).collect();
            t.push(Column::new(name, "", vals));
        }
        // Minterms of each output (sum of products).
        let mut text = String::new();
        for &o in &outs {
            let col = &t.column(&c.names.list[o]).unwrap().values;
            let ones: Vec<String> = (0..col.len()).filter(|&r| col[r] > 0.5).map(|r| r.to_string()).collect();
            text.push_str(&format!("{} = Σm({})\n", c.names.list[o], ones.join(", ")));
            d.scalar(&format!("{} ones", c.names.list[o]), ones.len() as f64, "");
        }
        d.text = text;
        d.scalar("inputs", ins.len() as f64, "");
        d.scalar("rows", (1u64 << ins.len()) as f64, "");
        d.tables.push(t);
        return Ok(d);
    }

    let t_end = ctx.positive("tEnd", 200.0)?;
    let max_rows = ctx.count("maxRows", 20000, 10, 2_000_000)?;
    let mut listeners: Vec<Vec<usize>> = vec![Vec::new(); n];
    for (k, (p, _)) in c.parts.iter().enumerate() {
        for i in inputs_of(p) {
            listeners[i].push(k);
        }
    }
    let mut sim = Sim { v: vec![false; n], heap: BinaryHeap::new(), seq: 0, pending: vec![false; n], inflight: vec![0; n] };
    // Stimuli as events.
    for (sig, stim) in &c.stims {
        match stim {
            Stim::Clock { period, duty, delay } => {
                let mut t = *delay;
                let mut k = 0u64;
                while t <= t_end {
                    sim.push(t, *sig, true);
                    sim.push(t + period * duty, *sig, false);
                    k += 1;
                    t = delay + k as f64 * period;
                    if k > 5_000_000 {
                        return Err("the clock has too many periods for the run length".into());
                    }
                }
            }
            Stim::Events(ev) => {
                for &(t, val) in ev {
                    if t <= t_end {
                        sim.push(t, *sig, val);
                    }
                }
            }
        }
    }
    // Initial evaluation of the gates (all signals start at 0).
    for k in 0..c.parts.len() {
        let dly = c.parts[k].1;
        if let Part::Gate { out, f } = &c.parts[k].0 {
            let val = f.eval(&sim.v);
            let out = *out;
            sim.schedule(dly, out, val);
        }
        if let Part::Dff { qn: Some(qn), .. } | Part::Jk { qn: Some(qn), .. } | Part::Tff { qn: Some(qn), .. } | Part::Latch { qn: Some(qn), .. } | Part::Sr { qn: Some(qn), .. } = &c.parts[k].0 {
            let qn = *qn;
            sim.schedule(dly, qn, true);
        }
    }
    let mut times = vec![0.0];
    let mut rows: Vec<Vec<bool>> = vec![sim.v.clone()];
    let mut transitions = vec![0usize; n];
    let mut high_time = vec![0.0f64; n];
    let mut rises: Vec<Vec<f64>> = vec![Vec::new(); n];
    let mut last_t = 0.0;
    let mut events = 0u64;
    let mut truncated = false;
    // Narrowest pulse per signal (glitches).
    let mut last_change = vec![f64::NEG_INFINITY; n];
    let mut min_pulse = vec![f64::INFINITY; n];
    while let Some(top) = sim.heap.peek() {
        if top.t > t_end {
            break;
        }
        let t = top.t;
        for i in 0..n {
            if sim.v[i] {
                high_time[i] += t - last_t;
            }
        }
        last_t = t;
        // All events at this instant.
        let mut changed = Vec::new();
        while sim.heap.peek().is_some_and(|e| e.t == t) {
            let e = sim.heap.pop().unwrap();
            events += 1;
            if sim.v[e.sig] != e.val {
                changed.push((e.sig, sim.v[e.sig]));
                sim.v[e.sig] = e.val;
                transitions[e.sig] += 1;
                if t > last_change[e.sig] && last_change[e.sig].is_finite() {
                    min_pulse[e.sig] = min_pulse[e.sig].min(t - last_change[e.sig]);
                }
                last_change[e.sig] = t;
                if e.val {
                    rises[e.sig].push(t);
                }
            }
            // An event from a stimulus may land on a value a gate also scheduled; keep pending in step.
            sim.inflight[e.sig] -= 1;
            if sim.inflight[e.sig] == 0 {
                sim.pending[e.sig] = sim.v[e.sig];
            }
        }
        if events > 50_000_000 {
            return Err("too many events (an oscillating loop?)".into());
        }
        for (sig, was) in changed {
            for &k in &listeners[sig] {
                let dly = c.parts[k].1;
                let outs = react(&mut c.parts[k].0, sig, was, &sim.v);
                for (o, val) in outs {
                    sim.schedule(t + dly, o, val);
                }
            }
        }
        if rows.len() < max_rows {
            if times.last() == Some(&t) {
                *rows.last_mut().unwrap() = sim.v.clone();
            } else {
                times.push(t);
                rows.push(sim.v.clone());
            }
        } else {
            truncated = true;
        }
        if events % 4096 == 0 {
            ctx.check()?;
        }
    }
    for i in 0..n {
        if sim.v[i] {
            high_time[i] += t_end - last_t;
        }
    }
    if truncated {
        ctx.warn(format!("the timing table keeps the first {max_rows} changes"));
    }
    // The end of the run as a last row, so step charts reach tEnd.
    if times.last().is_some_and(|&t| t < t_end) {
        times.push(t_end);
        rows.push(sim.v.clone());
    }
    let order: Vec<usize> = {
        let shown: Vec<String> = ctx.str("show", "").split(|c: char| c == ',' || c.is_whitespace()).filter(|s| !s.is_empty()).map(|s| s.to_string()).collect();
        if shown.is_empty() {
            (0..n).filter(|&i| !c.names.list[i].starts_with('_')).collect()
        } else {
            let mut o = Vec::new();
            for s in &shown {
                let list = expand(s, &c.names);
                if list.is_empty() {
                    return Err(format!("show: no signal \"{s}\""));
                }
                o.extend(list.iter().map(|nm| c.names.list.iter().position(|x| x == nm).unwrap()));
            }
            o
        }
    };
    let unit = ctx.str("unit", "ns");
    let x = Column::new("t", &unit, times.clone());
    let mut timing = Table::new("timing").with_x(x.clone());
    for &i in &order {
        timing.push(Column::new(&c.names.list[i], "", rows.iter().map(|r| if r[i] { 1.0 } else { 0.0 }).collect()));
    }
    // The timing diagram: each signal on its own lane, the first at the top.
    let mut lanes = Table::new("timing diagram").with_x(x.clone());
    let m = order.len();
    for (lane, &i) in order.iter().enumerate() {
        let base = 1.5 * (m - 1 - lane) as f64;
        lanes.push(Column::new(&c.names.list[i], "", rows.iter().map(|r| base + if r[i] { 1.0 } else { 0.0 }).collect()));
    }
    let mut buses = Table::new("buses").with_x(x);
    for (name, ids) in &c.buses {
        let vals: Vec<f64> = rows.iter().map(|r| ids.iter().fold(0u64, |acc, &i| (acc << 1) | r[i] as u64) as f64).collect();
        d.scalar(&format!("{name} (end)"), *vals.last().unwrap_or(&0.0), "");
        buses.push(Column::new(name, "", vals));
    }
    let mut stats = Table::new("signals");
    stats.push(Column::text("signal", order.iter().map(|&i| c.names.list[i].clone()).collect()));
    stats.push(Column::new("transitions", "", order.iter().map(|&i| transitions[i] as f64).collect()));
    stats.push(Column::new("high", "%", order.iter().map(|&i| 100.0 * high_time[i] / t_end).collect()));
    let freq = |i: usize| {
        let r = &rises[i];
        if r.len() >= 2 {
            (r.len() - 1) as f64 / (r[r.len() - 1] - r[0])
        } else {
            0.0
        }
    };
    stats.push(Column::new("frequency", &format!("1/{unit}"), order.iter().map(|&i| freq(i)).collect()));
    stats.push(Column::new("narrowest pulse", &unit, order.iter().map(|&i| if min_pulse[i].is_finite() { min_pulse[i] } else { f64::NAN }).collect()));
    stats.push(Column::new("final", "", order.iter().map(|&i| if sim.v[i] { 1.0 } else { 0.0 }).collect()));
    // Glitches: pulses shorter than a clock-free threshold.
    let glitch = ctx.num("glitch", 0.0)?;
    if glitch > 0.0 {
        let g: Vec<&str> = order.iter().filter(|&&i| min_pulse[i] < glitch).map(|&i| c.names.list[i].as_str()).collect();
        if !g.is_empty() {
            ctx.warn(format!("glitches (pulses under {glitch} {unit}) on {}", g.join(", ")));
        }
        d.scalar("glitchy signals", g.len() as f64, "");
    }
    for &i in &order {
        d.scalar(&format!("{} (end)", c.names.list[i]), if sim.v[i] { 1.0 } else { 0.0 }, "");
    }
    for (p, _) in &c.parts {
        if let Part::Mcu { name, cpu, error, .. } = p {
            if let Some(e) = error {
                return Err(format!("mcu {name}: {e} (at instruction {})", cpu.pc));
            }
            d.scalar(&format!("{name} instructions"), cpu.executed as f64, "");
            d.scalar(&format!("{name} port (end)"), cpu.port as f64, "");
            for k in 0..4 {
                d.scalar(&format!("{name} r{k}"), cpu.r[k] as f64, "");
            }
        }
    }
    d.scalar("events", events as f64, "");
    d.scalar("signals", n as f64, "");
    d.scalar("parts", c.parts.len() as f64, "");
    d.tables.push(lanes);
    d.tables.push(timing);
    if !c.buses.is_empty() {
        d.tables.push(buses);
    }
    d.tables.push(stats);
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boolean_expressions() {
        let mut names = Names { list: Vec::new() };
        let b = parse_bool("a & ~b | (c ^ a)'", &mut names).unwrap();
        let ia = 0;
        let ib = 1;
        let ic = 2;
        let mut v = vec![false; 3];
        v[ia] = true;
        v[ib] = false;
        v[ic] = true;
        assert!(b.eval(&v));
        v[ib] = true;
        // a&~b = 0; c^a = 0 → (0)' = 1
        assert!(b.eval(&v));
        v[ic] = false;
        // c^a = 1 → 0
        assert!(!b.eval(&v));
        assert!(parse_bool("a b", &mut names).is_err());
        assert!(parse_bool("nand(a, b, c)", &mut names).is_ok());
    }
}
