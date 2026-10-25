//! Circuit simulation from a SPICE netlist (the LTspice way): modified nodal
//! analysis with Newton–Raphson for nonlinear parts, and the analyses
//! `.op`, `.dc`, `.ac` and `.tran`.
//!
//! Elements: R, C, L, V, I (DC, AC, SIN, PULSE, PWL), D (Shockley diode: IS,
//! N, RS, BV, IBV), Q (Ebers–Moll BJT: NPN/PNP with IS, BF, BR), M (level-1
//! MOSFET: NMOS/PMOS with VTO, KP, LAMBDA, W/L), E and G (voltage-controlled
//! sources), F and H (current-controlled), B (behavioural V= or I= with V(n),
//! V(a,b), I(Vx), time), S (switch: RON, ROFF, VT) and X (subcircuits).
//! Cards: .model, .subckt/.ends, .param ({expr} in values), .op, .dc, .ac,
//! .tran, .end; the first line is a title when it is not an element (the SPICE
//! convention), and ";" starts a comment. Node 0 (or gnd) is ground. Values
//! take SPICE suffixes: f p n u m k meg g t (and µ), trailing unit letters are
//! ignored (10uF, 4.7kOhm). Netlists exported by LTspice-style tools (MyCircuit
//! "Export SPICE") run as they are.

use crate::data::{Column, Dataset, Table};
use crate::expr::Expr;
use crate::fft::C64;
use crate::Ctx;
use std::collections::HashMap;
use std::f64::consts::PI;

const VT: f64 = 0.025852; // thermal voltage at 27 °C

#[derive(Debug, Clone)]
enum Wave {
    Dc(f64),
    Sin { vo: f64, va: f64, f: f64, td: f64, theta: f64, ph: f64 },
    Pulse { v1: f64, v2: f64, td: f64, tr: f64, tf: f64, pw: f64, per: f64 },
    Pwl(Vec<(f64, f64)>),
}

impl Wave {
    fn at(&self, t: f64) -> f64 {
        match self {
            Wave::Dc(v) => *v,
            Wave::Sin { vo, va, f, td, theta, ph } => {
                let ph = ph.to_radians();
                if t < *td {
                    vo + va * ph.sin()
                } else {
                    vo + va * (-(t - td) * theta).exp() * (2.0 * PI * f * (t - td) + ph).sin()
                }
            }
            Wave::Pulse { v1, v2, td, tr, tf, pw, per } => {
                if t < *td {
                    return *v1;
                }
                let mut x = t - td;
                if *per > 0.0 {
                    x = x.rem_euclid(*per);
                }
                if x < *tr {
                    v1 + (v2 - v1) * x / tr.max(1e-30)
                } else if x < tr + pw {
                    *v2
                } else if x < tr + pw + tf {
                    v2 + (v1 - v2) * (x - tr - pw) / tf.max(1e-30)
                } else {
                    *v1
                }
            }
            Wave::Pwl(points) => {
                let xs: Vec<f64> = points.iter().map(|p| p.0).collect();
                let ys: Vec<f64> = points.iter().map(|p| p.1).collect();
                crate::data::interp(&xs, &ys, t)
            }
        }
    }

    fn dc(&self) -> f64 {
        self.at(0.0)
    }
}

#[derive(Debug, Clone)]
enum Kind {
    R(f64),
    C { c: f64, ic: Option<f64> },
    L(f64),
    V { wave: Wave, ac: (f64, f64) },
    I { wave: Wave, ac: (f64, f64) },
    D { is: f64, n: f64, bv: f64, ibv: f64 },
    E { cp: usize, cn: usize, gain: f64 },
    G { cp: usize, cn: usize, gm: f64 },
    S { cp: usize, cn: usize, ron: f64, roff: f64, vt: f64 },
    /// BJT: a = collector, b = emitter; pol +1 NPN, −1 PNP.
    Q { base: usize, is: f64, bf: f64, br: f64, pol: f64 },
    /// MOSFET: a = drain, b = source; pol +1 NMOS, −1 PMOS.
    M { gate: usize, kp: f64, vt: f64, lambda: f64, pol: f64 },
    /// Behavioural source: V = f(…) (with a branch) or I = f(…).
    B { expr: Expr, refs: Vec<Ref>, current: bool },
    /// Current-controlled current source: gain · I(sense) from a to b.
    F { sense: String, gain: f64 },
    /// Current-controlled voltage source: V(a, b) = r · I(sense).
    H { sense: String, r: f64 },
}

/// What a behavioural expression reads: a node voltage or a branch current.
#[derive(Debug, Clone)]
enum Ref {
    Node(usize),
    Branch(String),
}

#[derive(Debug, Clone)]
struct Elem {
    name: String,
    a: usize,
    b: usize,
    kind: Kind,
    /// Index of the branch current unknown (V, L, E, H, B with V=).
    branch: Option<usize>,
}

/// Ebers–Moll transport model: currents into the collector and the base, and their
/// derivatives by (Vc, Vb, Ve).
fn bjt(pol: f64, is: f64, bf: f64, br: f64, vc: f64, vb: f64, ve: f64) -> ([f64; 3], [[f64; 3]; 3]) {
    let lim = 40.0 * VT;
    let junction = |v: f64| {
        let vl = v.min(lim);
        let e = (vl / VT).exp();
        (is * (e - 1.0) + if v > vl { is * e / VT * (v - vl) } else { 0.0 }, is * e / VT + 1e-12)
    };
    let (i_f, gf) = junction(pol * (vb - ve));
    let (i_r, gr) = junction(pol * (vb - vc));
    let ic = pol * (i_f - i_r * (1.0 + 1.0 / br));
    let ib = pol * (i_f / bf + i_r / br);
    let jc = [gr * (1.0 + 1.0 / br), gf - gr * (1.0 + 1.0 / br), -gf];
    let jb = [-gr / br, gf / bf + gr / br, -gf / bf];
    let je = [-(jc[0] + jb[0]), -(jc[1] + jb[1]), -(jc[2] + jb[2])];
    ([ic, ib, -(ic + ib)], [jc, jb, je])
}

/// Level-1 (Shichman–Hodges) MOSFET: currents into drain, gate, source and their
/// derivatives by (Vd, Vg, Vs). Drain and source swap when Vds changes sign.
fn mosfet(pol: f64, kp: f64, vt: f64, lambda: f64, vd: f64, vg: f64, vs: f64) -> ([f64; 3], [[f64; 3]; 3]) {
    let swap = pol * (vd - vs) < 0.0;
    let (vhi, vlo) = if swap { (vs, vd) } else { (vd, vs) };
    let vgs = pol * (vg - vlo);
    let vds = pol * (vhi - vlo);
    let vov = vgs - vt;
    let (id, gm, gds) = if vov <= 0.0 {
        (0.0, 0.0, 0.0)
    } else if vds < vov {
        let a = kp * (vov * vds - vds * vds / 2.0);
        (a * (1.0 + lambda * vds), kp * vds * (1.0 + lambda * vds), kp * (vov - vds) * (1.0 + lambda * vds) + a * lambda)
    } else {
        let a = kp / 2.0 * vov * vov;
        (a * (1.0 + lambda * vds), kp * vov * (1.0 + lambda * vds), a * lambda)
    };
    let i = pol * id;
    // Into the high side: d/dVhi = gds, d/dVg = gm, d/dVlo = −(gm + gds).
    let (jh, jg, jl) = (gds, gm, -(gm + gds));
    if swap {
        ([-i, 0.0, i], [[-jl, -jg, -jh], [0.0; 3], [jl, jg, jh]])
    } else {
        ([i, 0.0, -i], [[jh, jg, jl], [0.0; 3], [-jh, -jg, -jl]])
    }
}

#[derive(Debug, Clone)]
enum Analysis {
    Op,
    Dc { src: String, from: f64, to: f64, step: f64 },
    Ac { per_decade: usize, f1: f64, f2: f64 },
    Tran { step: f64, stop: f64, uic: bool },
}

/// A SPICE number: 4.7k, 10u, 1meg, 2.2µF, 1e-3.
pub fn value(text: &str) -> Result<f64, String> {
    let t = text.trim().to_ascii_lowercase().replace('µ', "u");
    let end = t.find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+' || c == 'e')).unwrap_or(t.len());
    // "e" followed by a non-digit is not an exponent (rare); keep it simple.
    let (num, rest) = t.split_at(end);
    let (num, rest) = if num.ends_with('e') && !rest.is_empty() { (&num[..num.len() - 1], &t[end - 1..]) } else { (num, rest) };
    let base: f64 = num.parse().map_err(|_| format!("\"{text}\" is not a value"))?;
    let scale = if rest.starts_with("meg") {
        1e6
    } else if rest.starts_with("mil") {
        25.4e-6
    } else {
        match rest.chars().next() {
            Some('f') => 1e-15,
            Some('p') => 1e-12,
            Some('n') => 1e-9,
            Some('u') => 1e-6,
            Some('m') => 1e-3,
            Some('k') => 1e3,
            Some('g') => 1e9,
            Some('t') => 1e12,
            _ => 1.0,
        }
    };
    Ok(base * scale)
}

/// Tokens of a line, with "SIN(0 1 1k)" kept together as one token.
fn tokens(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut depth = 0;
    for ch in line.chars() {
        match ch {
            '(' => {
                depth += 1;
                cur.push(ch);
            }
            ')' => {
                depth -= 1;
                cur.push(ch);
            }
            c if (c.is_whitespace() || c == ',') && depth == 0 => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    // "SIN (0 1 1k)": join a function name with its bracket.
    let mut joined: Vec<String> = Vec::new();
    for tok in out {
        if tok.starts_with('(') && joined.last().is_some_and(|l| ["sin", "pulse", "pwl"].contains(&l.to_ascii_lowercase().as_str())) {
            let last = joined.pop().unwrap();
            joined.push(format!("{last}{tok}"));
        } else {
            joined.push(tok);
        }
    }
    joined
}

fn args_in(tok: &str) -> Result<Vec<f64>, String> {
    let open = tok.find('(').ok_or("missing (")?;
    tok[open + 1..tok.len() - 1].split(|c: char| c.is_whitespace() || c == ',').filter(|s| !s.is_empty()).map(value).collect()
}

/// Source description after the nodes: DC 5, AC 1 0, SIN(…), PULSE(…), PWL(…), or a plain value.
fn source(toks: &[String]) -> Result<(Wave, (f64, f64)), String> {
    let mut wave = Wave::Dc(0.0);
    let mut ac = (0.0, 0.0);
    let mut i = 0;
    while i < toks.len() {
        let t = toks[i].to_ascii_lowercase();
        if t == "dc" {
            wave = Wave::Dc(value(toks.get(i + 1).ok_or("DC needs a value")?)?);
            i += 2;
        } else if t == "ac" {
            let mag = value(toks.get(i + 1).ok_or("AC needs a magnitude")?)?;
            let phase = toks.get(i + 2).and_then(|p| value(p).ok());
            ac = (mag, phase.unwrap_or(0.0));
            i += if phase.is_some() { 3 } else { 2 };
        } else if t.starts_with("sin(") {
            let a = args_in(&toks[i])?;
            if a.len() < 3 {
                return Err("SIN(VO VA FREQ [TD THETA PHASE])".into());
            }
            wave = Wave::Sin { vo: a[0], va: a[1], f: a[2], td: *a.get(3).unwrap_or(&0.0), theta: *a.get(4).unwrap_or(&0.0), ph: *a.get(5).unwrap_or(&0.0) };
            i += 1;
        } else if t.starts_with("pulse(") {
            let a = args_in(&toks[i])?;
            if a.len() < 2 {
                return Err("PULSE(V1 V2 [TD TR TF PW PER])".into());
            }
            let g = |k: usize, d: f64| *a.get(k).unwrap_or(&d);
            wave = Wave::Pulse { v1: a[0], v2: a[1], td: g(2, 0.0), tr: g(3, 1e-9), tf: g(4, 1e-9), pw: g(5, f64::INFINITY), per: g(6, 0.0) };
            i += 1;
        } else if t.starts_with("pwl(") {
            let a = args_in(&toks[i])?;
            if a.len() < 2 || a.len() % 2 != 0 {
                return Err("PWL(t1 v1 t2 v2 …)".into());
            }
            wave = Wave::Pwl(a.chunks(2).map(|c| (c[0], c[1])).collect());
            i += 1;
        } else {
            wave = Wave::Dc(value(&toks[i])?);
            i += 1;
        }
    }
    Ok((wave, ac))
}

fn params(toks: &[String]) -> HashMap<String, String> {
    toks.iter().filter_map(|t| t.split_once('=').map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))).collect()
}

struct Circuit {
    elems: Vec<Elem>,
    nodes: Vec<String>,
    nbranch: usize,
    analyses: Vec<Analysis>,
    title: Option<String>,
    warnings: Vec<String>,
}

impl Circuit {
    fn size(&self) -> usize {
        self.nodes.len() - 1 + self.nbranch
    }
}

/// A subcircuit: its pins and its element lines.
struct Subckt {
    pins: Vec<String>,
    body: Vec<String>,
}

/// The netlist after cards are read and subcircuits expanded: element and analysis lines,
/// the .model cards, and whether the first line may be a title.
struct Flat {
    lines: Vec<String>,
    models: HashMap<String, (String, HashMap<String, String>)>,
    warnings: Vec<String>,
}

/// Renames the nodes in V(…) and the sources in I(…) inside a behavioural expression.
fn rename_refs(expr: &str, node: &dyn Fn(&str) -> String, elem: &dyn Fn(&str) -> String) -> String {
    let mut out = String::new();
    let b = expr.as_bytes();
    let mut i = 0;
    while i < expr.len() {
        let c = b[i] as char;
        let prev_ok = i == 0 || !(b[i - 1] as char).is_ascii_alphanumeric() && b[i - 1] != b'_';
        if prev_ok && (c == 'V' || c == 'v' || c == 'I' || c == 'i') && b.get(i + 1) == Some(&b'(') {
            if let Some(close) = expr[i..].find(')') {
                let inner = &expr[i + 2..i + close];
                let renamed: Vec<String> = inner.split(',').map(|a| if c == 'V' || c == 'v' { node(a.trim()) } else { elem(a.trim()) }).collect();
                out.push(c);
                out.push('(');
                out.push_str(&renamed.join(","));
                out.push(')');
                i += close + 1;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    out
}

/// Positions of the node tokens of an element line, by its letter.
fn node_slots(letter: char, ntok: usize) -> Vec<usize> {
    match letter {
        'r' | 'c' | 'l' | 'v' | 'i' | 'd' | 'b' | 'f' | 'h' => vec![1, 2],
        'e' | 'g' | 's' => vec![1, 2, 3, 4],
        'q' => vec![1, 2, 3],
        'm' => vec![1, 2, 3, 4],
        _ => (1..ntok.saturating_sub(1)).collect(),
    }
}

fn flatten(text: &str) -> Result<Flat, String> {
    // Comments, continuation lines.
    let mut raw: Vec<String> = Vec::new();
    for line in text.lines() {
        let line = line.split(';').next().unwrap_or("").trim();
        if line.is_empty() || line.starts_with('*') {
            continue;
        }
        if let Some(rest) = line.strip_prefix('+') {
            if let Some(last) = raw.last_mut() {
                last.push(' ');
                last.push_str(rest);
                continue;
            }
        }
        raw.push(line.to_string());
    }
    // .param a = 1, b = {2*a}: values, then {expr} anywhere else.
    let mut params: Vec<(String, f64)> = Vec::new();
    let mut warnings = Vec::new();
    let eval_braces = |line: &str, params: &[(String, f64)]| -> Result<String, String> {
        let mut out = String::new();
        let mut rest = line;
        while let Some(open) = rest.find('{') {
            let close = rest[open..].find('}').ok_or("a { without }")? + open;
            out.push_str(&rest[..open]);
            let names: Vec<String> = params.iter().map(|p| p.0.clone()).collect();
            let vals: Vec<f64> = params.iter().map(|p| p.1).collect();
            let e = Expr::with_names(&rest[open + 1..close], &names).map_err(|e| format!("{{{}}}: {e}", &rest[open + 1..close]))?;
            out.push_str(&format!("{:e}", e.value(&vals)));
            rest = &rest[close + 1..];
        }
        out.push_str(rest);
        Ok(out)
    };
    let mut lines: Vec<String> = Vec::new();
    for line in raw {
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix(".param") {
            let body = &line[line.len() - rest.len()..];
            // name=value pairs separated by spaces (value may be {expr}).
            let joined = body.replace(" = ", "=").replace("= ", "=").replace(" =", "=");
            for pair in joined.split_whitespace() {
                let (k, v) = pair.split_once('=').ok_or_else(|| format!(".param {pair}: name=value"))?;
                let v = eval_braces(v, &params)?;
                let names: Vec<String> = params.iter().map(|p| p.0.clone()).collect();
                let vals: Vec<f64> = params.iter().map(|p| p.1).collect();
                let num = value(&v).or_else(|_| Expr::with_names(&v, &names).map(|e| e.value(&vals)))?;
                params.push((k.trim().to_string(), num));
            }
            continue;
        }
        lines.push(eval_braces(&line, &params)?);
    }
    // .subckt … .ends, .model, other cards.
    let mut subckts: HashMap<String, Subckt> = HashMap::new();
    let mut models = HashMap::new();
    let mut main: Vec<String> = Vec::new();
    let mut current: Option<(String, Subckt)> = None;
    for line in lines {
        let toks = tokens(&line);
        let first = toks[0].to_ascii_lowercase();
        if first == ".subckt" {
            if toks.len() < 2 {
                return Err(".subckt NAME pins…".into());
            }
            let pins = toks[2..].iter().take_while(|t| !t.contains('=') && !t.eq_ignore_ascii_case("params:")).map(|t| t.to_ascii_lowercase()).collect();
            current = Some((toks[1].to_ascii_lowercase(), Subckt { pins, body: Vec::new() }));
        } else if first == ".ends" {
            let (name, sub) = current.take().ok_or(".ends without .subckt")?;
            subckts.insert(name, sub);
        } else if first == ".model" {
            if toks.len() < 3 {
                return Err(".model NAME TYPE(params)".into());
            }
            let rest = toks[2..].join(" ");
            let (kind, body) = match rest.find('(') {
                Some(i) => (rest[..i].trim().to_ascii_lowercase(), rest[i + 1..].trim_end_matches(')').to_string()),
                None => {
                    let mut w = rest.splitn(2, ' ');
                    (w.next().unwrap_or("").to_ascii_lowercase(), w.next().unwrap_or("").to_string())
                }
            };
            let joined = body.replace(" = ", "=").replace("= ", "=").replace(" =", "=").replace(',', " ");
            let p: HashMap<String, String> = joined.split_whitespace().filter_map(|kv| kv.split_once('=').map(|(k, v)| (k.to_ascii_lowercase(), v.to_string()))).collect();
            models.insert(toks[1].to_ascii_lowercase(), (kind, p));
        } else if first == ".include" || first == ".inc" || first == ".lib" {
            return Err(format!("{first} is not supported: paste the models into the netlist"));
        } else if let Some((_, sub)) = current.as_mut() {
            sub.body.push(line);
        } else {
            main.push(line);
        }
    }
    if current.is_some() {
        return Err(".subckt without .ends".into());
    }
    // Expand X instances (recursively).
    fn expand(lines: &[String], prefix: &str, map: &HashMap<String, String>, subckts: &HashMap<String, Subckt>, depth: usize, out: &mut Vec<String>) -> Result<(), String> {
        if depth > 20 {
            return Err("subcircuits nested too deeply (a loop?)".into());
        }
        let node = |n: &str| -> String {
            let l = n.to_ascii_lowercase();
            if l == "0" || l == "gnd" {
                "0".into()
            } else if let Some(m) = map.get(&l) {
                m.clone()
            } else if prefix.is_empty() {
                l
            } else {
                format!("{prefix}.{l}")
            }
        };
        let elem = |n: &str| -> String { if prefix.is_empty() { n.to_string() } else { format!("{n}.{prefix}") } };
        for line in lines {
            let toks = tokens(line);
            let first = toks[0].to_ascii_lowercase();
            let letter = first.chars().next().unwrap_or(' ');
            if first.starts_with('.') {
                if prefix.is_empty() {
                    out.push(line.clone());
                }
                continue;
            }
            if letter == 'x' {
                // The subcircuit name is the last token that names one (parameters may follow).
                let pos = (2..toks.len()).rev().find(|&i| subckts.contains_key(&toks[i].to_ascii_lowercase())).ok_or_else(|| format!("{}: no such subcircuit", toks[0]))?;
                let sub = &subckts[&toks[pos].to_ascii_lowercase()];
                let actual: Vec<String> = toks[1..pos].iter().map(|n| node(n)).collect();
                if actual.len() != sub.pins.len() {
                    return Err(format!("{}: {} nodes for {} pins", toks[0], actual.len(), sub.pins.len()));
                }
                let inner: HashMap<String, String> = sub.pins.iter().cloned().zip(actual).collect();
                let inst = elem(&first);
                expand(&sub.body, &inst, &inner, subckts, depth + 1, out)?;
                continue;
            }
            let mut t: Vec<String> = toks.clone();
            t[0] = elem(&toks[0]);
            for k in node_slots(letter, toks.len()) {
                if k < t.len() {
                    t[k] = node(&toks[k]);
                }
            }
            if (letter == 'f' || letter == 'h') && t.len() > 3 {
                t[3] = elem(&toks[3]);
            }
            if letter == 'b' {
                for k in 3..t.len() {
                    t[k] = rename_refs(&toks[k], &node, &elem);
                }
            }
            out.push(t.join(" "));
        }
        Ok(())
    }
    let mut flat = Vec::new();
    expand(&main, "", &HashMap::new(), &subckts, 0, &mut flat)?;
    for line in &flat {
        let first = line.split_whitespace().next().unwrap_or("").to_ascii_lowercase();
        if [".ic", ".nodeset", ".step", ".meas", ".measure", ".save", ".four", ".temp", ".print", ".plot", ".control", ".endc", ".global", ".func", ".options", ".option", ".probe", ".backanno"].contains(&first.as_str()) {
            warnings.push(format!("{first} is ignored"));
        }
    }
    Ok(Flat { lines: flat, models, warnings })
}

/// SPICE number suffixes inside an expression: 1m → 1e-3, 4.7k → 4.7e3, 2meg → 2e6.
fn suffixed_numbers(text: &str) -> String {
    let c: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        let starts = c[i].is_ascii_digit() || (c[i] == '.' && c.get(i + 1).is_some_and(|d| d.is_ascii_digit()));
        let free = i == 0 || !(c[i - 1].is_ascii_alphanumeric() || c[i - 1] == '_' || c[i - 1] == '.');
        if !(starts && free) {
            out.push(c[i]);
            i += 1;
            continue;
        }
        let s = i;
        while i < c.len() && (c[i].is_ascii_digit() || c[i] == '.') {
            i += 1;
        }
        // An exponent: e/E followed by a digit or a sign and a digit.
        if i < c.len() && (c[i] == 'e' || c[i] == 'E') && c.get(i + 1).is_some_and(|d| d.is_ascii_digit() || ((*d == '-' || *d == '+') && c.get(i + 2).is_some_and(|x| x.is_ascii_digit()))) {
            i += 2;
            while i < c.len() && c[i].is_ascii_digit() {
                i += 1;
            }
        }
        out.extend(&c[s..i]);
        let w = i;
        while i < c.len() && c[i].is_ascii_alphabetic() {
            i += 1;
        }
        let word: String = c[w..i].iter().collect::<String>().to_ascii_lowercase();
        let scale = if word.starts_with("meg") {
            "e6"
        } else {
            match word.chars().next() {
                Some('f') => "e-15",
                Some('p') => "e-12",
                Some('n') => "e-9",
                Some('u') => "e-6",
                Some('m') => "e-3",
                Some('k') => "e3",
                Some('g') => "e9",
                Some('t') => "e12",
                _ => {
                    i = w;
                    ""
                }
            }
        };
        out.push_str(scale);
    }
    out
}

/// Turns a behavioural expression (V(n), V(a,b), I(Vx), time, **) into an Expr over [t, refs…].
fn behavioural(text: &str, node: &mut dyn FnMut(&str) -> usize) -> Result<(Expr, Vec<Ref>), String> {
    let mut refs: Vec<Ref> = Vec::new();
    let mut names = vec!["t".to_string()];
    let mut out = String::new();
    let b = text.as_bytes();
    let mut i = 0;
    let slot = |r: Ref, refs: &mut Vec<Ref>, names: &mut Vec<String>| -> String {
        let key = match &r {
            Ref::Node(k) => format!("v_{k}"),
            Ref::Branch(n) => format!("i_{}", n.replace(|c: char| !c.is_ascii_alphanumeric(), "_")),
        };
        if !names.contains(&key) {
            names.push(key.clone());
            refs.push(r);
        }
        key
    };
    while i < text.len() {
        let c = b[i] as char;
        let prev_ok = i == 0 || !((b[i - 1] as char).is_ascii_alphanumeric() || b[i - 1] == b'_');
        if prev_ok && (c == 'V' || c == 'v' || c == 'I' || c == 'i') && b.get(i + 1) == Some(&b'(') {
            if let Some(close) = text[i..].find(')') {
                let inner = &text[i + 2..i + close];
                let parts: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
                if c == 'V' || c == 'v' {
                    let a = slot(Ref::Node(node(parts[0])), &mut refs, &mut names);
                    if parts.len() > 1 {
                        let bb = slot(Ref::Node(node(parts[1])), &mut refs, &mut names);
                        out.push_str(&format!("({a} - {bb})"));
                    } else {
                        out.push_str(&a);
                    }
                } else {
                    out.push_str(&slot(Ref::Branch(parts[0].to_ascii_lowercase()), &mut refs, &mut names));
                }
                i += close + 1;
                continue;
            }
        }
        // "time" → t
        if prev_ok && text[i..].to_ascii_lowercase().starts_with("time") && !text[i + 4..].starts_with(|ch: char| ch.is_ascii_alphanumeric() || ch == '_') {
            out.push('t');
            i += 4;
            continue;
        }
        out.push(c);
        i += 1;
    }
    let src = suffixed_numbers(&out.replace("**", "^"));
    // LTspice names: u() step, limit() clamp.
    let src = src.replace("u(", "step(").replace("limit(", "clamp(");
    let e = Expr::with_names(&src, &names).map_err(|e| format!("\"{text}\": {e}"))?;
    Ok((e, refs))
}

fn parse(text: &str) -> Result<Circuit, String> {
    let flat = flatten(text)?;
    let mut nodes = vec!["0".to_string()];
    let node = |name: &str, nodes: &mut Vec<String>| -> usize {
        let n = name.to_ascii_lowercase();
        let n = if n == "gnd" { "0".to_string() } else { n };
        match nodes.iter().position(|x| *x == n) {
            Some(i) => i,
            None => {
                nodes.push(n);
                nodes.len() - 1
            }
        }
    };
    let mut elems = Vec::new();
    let mut analyses = Vec::new();
    let mut nbranch = 0;
    let mut title = None;
    let model = |name: &str, want: &[&str]| -> Result<(String, HashMap<String, String>), String> {
        match flat.models.get(&name.to_ascii_lowercase()) {
            Some((kind, p)) if want.contains(&kind.as_str()) => Ok((kind.clone(), p.clone())),
            Some((kind, _)) => Err(format!("model {name} is a {kind}, not {}", want.join("/"))),
            None => Err(format!("no .model {name}")),
        }
    };
    let num = |p: &HashMap<String, String>, k: &str, d: f64| -> Result<f64, String> { p.get(k).map(|v| value(v)).transpose().map(|v| v.unwrap_or(d)) };
    for (li, line) in flat.lines.iter().enumerate() {
        let toks = tokens(line);
        let first = toks[0].to_ascii_lowercase();
        let err = |m: &str| format!("{}: {m}", toks[0]);
        if first.starts_with('.') {
            match first.as_str() {
                ".op" => analyses.push(Analysis::Op),
                ".dc" => {
                    if toks.len() < 5 {
                        return Err(".dc SOURCE FROM TO STEP".into());
                    }
                    analyses.push(Analysis::Dc { src: toks[1].to_ascii_lowercase(), from: value(&toks[2])?, to: value(&toks[3])?, step: value(&toks[4])? });
                }
                ".ac" => {
                    if toks.len() < 5 {
                        return Err(".ac DEC N FSTART FSTOP".into());
                    }
                    analyses.push(Analysis::Ac { per_decade: value(&toks[2])?.max(1.0) as usize, f1: value(&toks[3])?, f2: value(&toks[4])? });
                }
                ".tran" => {
                    if toks.len() < 3 {
                        return Err(".tran TSTEP TSTOP [UIC]".into());
                    }
                    analyses.push(Analysis::Tran { step: value(&toks[1])?, stop: value(&toks[2])?, uic: toks.iter().any(|t| t.eq_ignore_ascii_case("uic")) });
                }
                ".end" | ".title" => {}
                c if flat.warnings.iter().any(|w| w.starts_with(c)) => {}
                other => return Err(format!("unsupported card {other} (supported: .op .dc .ac .tran .model .subckt .param)")),
            }
            continue;
        }
        let parsed = (|| -> Result<Vec<Elem>, String> {
            if toks.len() < 3 {
                return Err(err("needs at least 2 nodes"));
            }
            let need = |n: usize| -> Result<(), String> { if toks.len() < n { Err(err(&format!("needs at least {} fields", n - 1))) } else { Ok(()) } };
            let letter = first.chars().next().unwrap();
            let mut out = Vec::new();
            let mut nodes_local = std::mem::take(&mut nodes);
            let saved = nodes_local.len();
            let res = (|| -> Result<(), String> {
                let a = node(&toks[1], &mut nodes_local);
                let b = node(&toks[2], &mut nodes_local);
                let kind = match letter {
                    'r' => {
                        need(4)?;
                        let r = value(&toks[3])?;
                        if r == 0.0 {
                            return Err(err("a resistance of 0 (use a wire, or a small value)"));
                        }
                        Kind::R(r)
                    }
                    'c' => {
                        need(4)?;
                        let p = params(&toks[4..]);
                        Kind::C { c: value(&toks[3])?, ic: p.get("ic").map(|v| value(v)).transpose()? }
                    }
                    'l' => {
                        need(4)?;
                        Kind::L(value(&toks[3])?)
                    }
                    'v' => {
                        let (wave, ac) = source(&toks[3..]).map_err(|e| err(&e))?;
                        Kind::V { wave, ac }
                    }
                    'i' => {
                        let (wave, ac) = source(&toks[3..]).map_err(|e| err(&e))?;
                        Kind::I { wave, ac }
                    }
                    'd' => {
                        // D a k [MODEL] [IS= N= RS= BV= IBV=]
                        let mut p = toks.get(3).filter(|t| !t.contains('=')).map(|m| model(m, &["d"]).map(|m| m.1)).transpose().map_err(|e| err(&e))?.unwrap_or_default();
                        p.extend(params(&toks[3..]));
                        let rs = num(&p, "rs", 0.0)?;
                        let (is, n) = (num(&p, "is", 1e-14)?, num(&p, "n", 1.0)?);
                        let bv = num(&p, "bv", f64::INFINITY)?;
                        let ibv = num(&p, "ibv", 1e-3)?;
                        if rs > 0.0 {
                            // The series resistance on an inner node.
                            let inner = node(&format!("{}#a", first), &mut nodes_local);
                            out.push(Elem { name: format!("{first}#rs"), a, b: inner, kind: Kind::R(rs), branch: None });
                            out.push(Elem { name: first.clone(), a: inner, b, kind: Kind::D { is, n, bv, ibv }, branch: None });
                            return Ok(());
                        }
                        Kind::D { is, n, bv, ibv }
                    }
                    'q' => {
                        need(5)?;
                        let base = b;
                        let e = node(&toks[3], &mut nodes_local);
                        let mname = toks[4..].iter().find(|t| !t.contains('=') && flat.models.contains_key(&t.to_ascii_lowercase())).ok_or_else(|| err("needs a .model (NPN or PNP)"))?;
                        let (kind, p) = model(mname, &["npn", "pnp"]).map_err(|e| err(&e))?;
                        out.push(Elem { name: first.clone(), a, b: e, kind: Kind::Q { base, is: num(&p, "is", 1e-16)?, bf: num(&p, "bf", 100.0)?, br: num(&p, "br", 1.0)?, pol: if kind == "pnp" { -1.0 } else { 1.0 } }, branch: None });
                        return Ok(());
                    }
                    'm' => {
                        need(6)?;
                        let gate = b;
                        let s = node(&toks[3], &mut nodes_local);
                        let _bulk = node(&toks[4], &mut nodes_local);
                        let (kind, p) = model(&toks[5], &["nmos", "pmos"]).map_err(|e| err(&e))?;
                        let inst = params(&toks[6..]);
                        let mut kp = num(&p, "kp", 2e-5)?;
                        if let (Some(w), Some(l)) = (inst.get("w"), inst.get("l")) {
                            kp *= value(w)? / value(l)?;
                        }
                        let vt = num(&p, "vto", if kind == "pmos" { -1.0 } else { 1.0 })?.abs();
                        out.push(Elem { name: first.clone(), a, b: s, kind: Kind::M { gate, kp, vt, lambda: num(&p, "lambda", 0.0)?, pol: if kind == "pmos" { -1.0 } else { 1.0 } }, branch: None });
                        return Ok(());
                    }
                    'b' => {
                        let spec = toks[3..].join(" ");
                        let (current, rhs) = if let Some(r) = spec.strip_prefix("V=").or_else(|| spec.strip_prefix("v=")) {
                            (false, r.to_string())
                        } else if let Some(r) = spec.strip_prefix("I=").or_else(|| spec.strip_prefix("i=")) {
                            (true, r.to_string())
                        } else {
                            return Err(err("B source: V=expression or I=expression"));
                        };
                        let (expr, refs) = behavioural(&rhs, &mut |n| node(n, &mut nodes_local)).map_err(|e| err(&e))?;
                        Kind::B { expr, refs, current }
                    }
                    'e' => {
                        need(6)?;
                        Kind::E { cp: node(&toks[3], &mut nodes_local), cn: node(&toks[4], &mut nodes_local), gain: value(&toks[5])? }
                    }
                    'g' => {
                        need(6)?;
                        Kind::G { cp: node(&toks[3], &mut nodes_local), cn: node(&toks[4], &mut nodes_local), gm: value(&toks[5])? }
                    }
                    'f' => {
                        need(5)?;
                        Kind::F { sense: toks[3].to_ascii_lowercase(), gain: value(&toks[4])? }
                    }
                    'h' => {
                        need(5)?;
                        Kind::H { sense: toks[3].to_ascii_lowercase(), r: value(&toks[4])? }
                    }
                    's' => {
                        need(5)?;
                        let mut p = toks[5..].iter().find(|t| !t.contains('=')).map(|m| model(m, &["sw", "vswitch"]).map(|m| m.1)).transpose().map_err(|e| err(&e))?.unwrap_or_default();
                        p.extend(params(&toks[5..]));
                        Kind::S {
                            cp: node(&toks[3], &mut nodes_local),
                            cn: node(&toks[4], &mut nodes_local),
                            ron: num(&p, "ron", 1.0)?,
                            roff: num(&p, "roff", 1e9)?,
                            vt: num(&p, "vt", 0.0)?,
                        }
                    }
                    other => return Err(err(&format!("unsupported element '{other}' (R C L V I D Q M B E G F H S X)"))),
                };
                out.push(Elem { name: first.clone(), a, b, kind, branch: None });
                Ok(())
            })();
            // A line that is not an element (a title) leaves no nodes behind.
            if res.is_ok() {
                nodes = nodes_local;
            } else {
                nodes_local.truncate(saved);
                nodes = nodes_local;
            }
            res.map(|_| out)
        })();
        match parsed {
            Ok(list) => {
                for mut e in list {
                    if matches!(e.kind, Kind::V { .. } | Kind::L(_) | Kind::E { .. } | Kind::H { .. } | Kind::B { current: false, .. }) {
                        nbranch += 1;
                        e.branch = Some(nbranch - 1);
                    }
                    elems.push(e);
                }
            }
            // The SPICE convention: the first line is the title.
            Err(_) if li == 0 && title.is_none() => title = Some(line.clone()),
            Err(e) => return Err(e),
        }
    }
    if elems.is_empty() {
        return Err("the netlist has no elements".into());
    }
    // Controlling sources must have a branch current.
    for e in &elems {
        if let Kind::F { sense, .. } | Kind::H { sense, .. } = &e.kind {
            if !elems.iter().any(|x| &x.name == sense && x.branch.is_some()) {
                return Err(format!("{}: no voltage source {sense} to sense", e.name));
            }
        }
        if let Kind::B { refs, .. } = &e.kind {
            for r in refs {
                if let Ref::Branch(n) = r {
                    if !elems.iter().any(|x| &x.name == n && x.branch.is_some()) {
                        return Err(format!("{}: I({n}) needs a voltage source {n}", e.name));
                    }
                }
            }
        }
    }
    if analyses.is_empty() {
        analyses.push(Analysis::Op);
    }
    Ok(Circuit { elems, nodes, nbranch, analyses, title, warnings: flat.warnings })
}

/// Dense real solve with partial pivoting (returns None when singular).
fn solve_real(mut a: Vec<Vec<f64>>, mut b: Vec<f64>) -> Option<Vec<f64>> {
    let n = b.len();
    for col in 0..n {
        let p = (col..n).max_by(|&i, &j| a[i][col].abs().partial_cmp(&a[j][col].abs()).unwrap())?;
        if a[p][col].abs() < 1e-18 {
            return None;
        }
        a.swap(col, p);
        b.swap(col, p);
        for r in col + 1..n {
            let f = a[r][col] / a[col][col];
            if f != 0.0 {
                for k in col..n {
                    a[r][k] -= f * a[col][k];
                }
                b[r] -= f * b[col];
            }
        }
    }
    let mut x = vec![0.0; n];
    for r in (0..n).rev() {
        let mut s = b[r];
        for k in r + 1..n {
            s -= a[r][k] * x[k];
        }
        x[r] = s / a[r][r];
    }
    Some(x)
}

fn solve_complex(mut a: Vec<Vec<C64>>, mut b: Vec<C64>) -> Option<Vec<C64>> {
    let n = b.len();
    for col in 0..n {
        let p = (col..n).max_by(|&i, &j| a[i][col].abs().partial_cmp(&a[j][col].abs()).unwrap())?;
        if a[p][col].abs() < 1e-18 {
            return None;
        }
        a.swap(col, p);
        b.swap(col, p);
        for r in col + 1..n {
            let f = a[r][col] / a[col][col];
            for k in col..n {
                let v = a[col][k];
                a[r][k] = a[r][k] - f * v;
            }
            let v = b[col];
            b[r] = b[r] - f * v;
        }
    }
    let mut x = vec![C64::ZERO; n];
    for r in (0..n).rev() {
        let mut s = b[r];
        for k in r + 1..n {
            s = s - a[r][k] * x[k];
        }
        x[r] = s / a[r][r];
    }
    Some(x)
}

/// Diode current and conductance at vd (Shockley, with reverse breakdown at BV).
fn diode(is: f64, n: f64, bv: f64, ibv: f64, vd: f64) -> (f64, f64) {
    let nvt = n * VT;
    let vd_c = vd.min(40.0 * nvt).max(-40.0 * nvt);
    let ex = (vd_c / nvt).exp();
    let mut id = is * (ex - 1.0) + if vd > vd_c { is * ex / nvt * (vd - vd_c) } else { 0.0 };
    let mut gd = is * ex / nvt + 1e-12;
    if bv.is_finite() {
        // Breakdown: −IBV·e^{−(vd + BV)/nVT}, linear beyond the clamp.
        let arg = -(vd + bv) / nvt;
        let a = arg.min(40.0);
        let e = (a).exp();
        let extra = if arg > a { e * (arg - a) } else { 0.0 };
        id -= ibv * (e + extra);
        gd += ibv * e / nvt;
    }
    (id, gd)
}

/// Transient companion state per element.
#[derive(Clone, Default)]
struct Hist {
    v: f64,
    i: f64,
}

struct Mna<'a> {
    c: &'a Circuit,
    n: usize,
    /// Independent sources scaled by this (source stepping towards a hard operating point).
    scale: std::cell::Cell<f64>,
    /// Pseudo-transient continuation: V= behavioural sources lag behind their expression,
    /// out⁺ = out + α (f − out⁺), with the previous outputs by element index.
    lag: std::cell::RefCell<Option<(f64, Vec<f64>)>>,
}

impl Mna<'_> {
    /// Unknown index of node k (ground has none).
    fn idx(&self, k: usize) -> Option<usize> {
        if k == 0 {
            None
        } else {
            Some(k - 1)
        }
    }

    fn br(&self, e: &Elem) -> usize {
        self.c.nodes.len() - 1 + e.branch.unwrap()
    }

    fn volt(&self, x: &[f64], k: usize) -> f64 {
        self.idx(k).map(|i| x[i]).unwrap_or(0.0)
    }

    /// The unknown holding the branch current of the element called `name`.
    fn br_named(&self, name: &str) -> usize {
        let e = self.c.elems.iter().find(|e| e.name == name && e.branch.is_some()).expect("checked in parse");
        self.br(e)
    }

    /// A behavioural expression's value at x and its derivatives by the unknowns it reads.
    fn behave(&self, expr: &Expr, refs: &[Ref], t: f64, x: &[f64]) -> (f64, Vec<(usize, f64)>) {
        let unknown = |r: &Ref| -> Option<usize> {
            match r {
                Ref::Node(k) => self.idx(*k),
                Ref::Branch(n) => Some(self.br_named(n)),
            }
        };
        let mut vals: Vec<f64> = std::iter::once(t).chain(refs.iter().map(|r| unknown(r).map(|u| x[u]).unwrap_or(0.0))).collect();
        let f0 = expr.value(&vals);
        let mut grad = Vec::new();
        for (j, r) in refs.iter().enumerate() {
            if let Some(u) = unknown(r) {
                let v = vals[j + 1];
                let h = 1e-6 * (1.0 + v.abs());
                vals[j + 1] = v + h;
                let up = expr.value(&vals);
                vals[j + 1] = v - h;
                let dn = expr.value(&vals);
                vals[j + 1] = v;
                grad.push((u, (up - dn) / (2.0 * h)));
            }
        }
        (f0, grad)
    }

    /// Currents into a multi-terminal device and their derivatives by its terminal voltages, at x.
    fn device(&self, e: &Elem, x: &[f64]) -> Option<(Vec<usize>, [f64; 3], [[f64; 3]; 3])> {
        match &e.kind {
            Kind::Q { base, is, bf, br, pol } => {
                let (c, b, em) = (e.a, *base, e.b);
                let (cur, j) = bjt(*pol, *is, *bf, *br, self.volt(x, c), self.volt(x, b), self.volt(x, em));
                Some((vec![c, b, em], cur, j))
            }
            Kind::M { gate, kp, vt, lambda, pol } => {
                let (d, g, s) = (e.a, *gate, e.b);
                let (cur, j) = mosfet(*pol, *kp, *vt, *lambda, self.volt(x, d), self.volt(x, g), self.volt(x, s));
                Some((vec![d, g, s], cur, j))
            }
            _ => None,
        }
    }

    /// One Newton solve of the circuit at time t. `mode`: None = DC (caps open, inductors short), Some(h) = transient step h
    /// with the previous state `hist`. `over` replaces a source's DC value (.dc sweeps).
    fn solve(&self, t: f64, step: Option<f64>, hist: &[Hist], guess: &[f64], over: Option<(&str, f64)>, gmin: f64) -> Result<Vec<f64>, String> {
        let n = self.n;
        let mut x = guess.to_vec();
        for iter in 0..400 {
            let mut g = vec![vec![0.0; n]; n];
            let mut rhs = vec![0.0; n];
            let stamp_g = |g: &mut Vec<Vec<f64>>, a: usize, b: usize, val: f64| {
                if let Some(i) = self.idx(a) {
                    g[i][i] += val;
                }
                if let Some(j) = self.idx(b) {
                    g[j][j] += val;
                }
                if let (Some(i), Some(j)) = (self.idx(a), self.idx(b)) {
                    g[i][j] -= val;
                    g[j][i] -= val;
                }
            };
            let stamp_i = |rhs: &mut Vec<f64>, a: usize, b: usize, cur: f64| {
                // A current `cur` flowing from a to b through the element (leaves a, enters b).
                if let Some(i) = self.idx(a) {
                    rhs[i] -= cur;
                }
                if let Some(j) = self.idx(b) {
                    rhs[j] += cur;
                }
            };
            // gmin from every node to ground keeps floating nodes solvable.
            for k in 1..self.c.nodes.len() {
                g[k - 1][k - 1] += gmin;
            }
            for (ei, e) in self.c.elems.iter().enumerate() {
                match &e.kind {
                    Kind::R(r) => stamp_g(&mut g, e.a, e.b, 1.0 / r),
                    Kind::C { c, .. } => {
                        if let Some(h) = step {
                            // Trapezoidal companion: i = Geq·v − (Geq·v_prev + i_prev).
                            let geq = 2.0 * c / h;
                            stamp_g(&mut g, e.a, e.b, geq);
                            stamp_i(&mut rhs, e.a, e.b, -(geq * hist[ei].v + hist[ei].i));
                        }
                    }
                    Kind::L(l) => {
                        let k = self.br(e);
                        if let Some(i) = self.idx(e.a) {
                            g[i][k] += 1.0;
                            g[k][i] += 1.0;
                        }
                        if let Some(j) = self.idx(e.b) {
                            g[j][k] -= 1.0;
                            g[k][j] -= 1.0;
                        }
                        if let Some(h) = step {
                            // v = (2L/h)(i − i_prev) − v_prev
                            let req = 2.0 * l / h;
                            g[k][k] -= req;
                            rhs[k] = -req * hist[ei].i - hist[ei].v;
                        }
                    }
                    Kind::V { wave, .. } => {
                        let k = self.br(e);
                        if let Some(i) = self.idx(e.a) {
                            g[i][k] += 1.0;
                            g[k][i] += 1.0;
                        }
                        if let Some(j) = self.idx(e.b) {
                            g[j][k] -= 1.0;
                            g[k][j] -= 1.0;
                        }
                        rhs[k] = self.scale.get() * match over {
                            Some((name, v)) if name == e.name => v,
                            _ => if step.is_some() { wave.at(t) } else { wave.dc() },
                        };
                    }
                    Kind::I { wave, .. } => {
                        let cur = self.scale.get() * match over {
                            Some((name, v)) if name == e.name => v,
                            _ => if step.is_some() { wave.at(t) } else { wave.dc() },
                        };
                        stamp_i(&mut rhs, e.a, e.b, cur);
                    }
                    Kind::D { is, n: nn, bv, ibv } => {
                        let vd = self.volt(&x, e.a) - self.volt(&x, e.b);
                        let (id, gd) = diode(*is, *nn, *bv, *ibv, vd);
                        stamp_g(&mut g, e.a, e.b, gd);
                        stamp_i(&mut rhs, e.a, e.b, id - gd * vd);
                    }
                    Kind::Q { .. } | Kind::M { .. } => {
                        let (terms, cur, jac) = self.device(e, &x).unwrap();
                        for (r, &tr) in terms.iter().enumerate() {
                            let Some(row) = self.idx(tr) else { continue };
                            let mut lin = cur[r];
                            for (c, &tc) in terms.iter().enumerate() {
                                let v = self.volt(&x, tc);
                                lin -= jac[r][c] * v;
                                if let Some(col) = self.idx(tc) {
                                    g[row][col] += jac[r][c];
                                }
                            }
                            rhs[row] -= lin;
                        }
                    }
                    Kind::B { expr, refs, current } => {
                        let (f0, grad) = self.behave(expr, refs, if step.is_some() { t } else { 0.0 }, &x);
                        let lin = f0 - grad.iter().map(|(u, d)| d * x[*u]).sum::<f64>();
                        if *current {
                            // i = f from a to b through the source.
                            for (node, sign) in [(e.a, 1.0), (e.b, -1.0)] {
                                if let Some(r) = self.idx(node) {
                                    for (u, d) in &grad {
                                        g[r][*u] += sign * d;
                                    }
                                    rhs[r] -= sign * lin;
                                }
                            }
                        } else {
                            let k = self.br(e);
                            if let Some(i) = self.idx(e.a) {
                                g[i][k] += 1.0;
                            }
                            if let Some(j) = self.idx(e.b) {
                                g[j][k] -= 1.0;
                            }
                            // (1 + α)·V(a, b) − α·f = previous output (α → ∞: V(a, b) = f).
                            let (w, prev) = match self.lag.borrow().as_ref() {
                                Some((alpha, outs)) => (1.0 + 1.0 / alpha, outs[ei] / alpha),
                                None => (1.0, 0.0),
                            };
                            if let Some(i) = self.idx(e.a) {
                                g[k][i] += w;
                            }
                            if let Some(j) = self.idx(e.b) {
                                g[k][j] -= w;
                            }
                            for (u, d) in &grad {
                                g[k][*u] -= d;
                            }
                            rhs[k] = lin + prev;
                        }
                    }
                    Kind::F { sense, gain } => {
                        let s = self.br_named(sense);
                        if let Some(i) = self.idx(e.a) {
                            g[i][s] += gain;
                        }
                        if let Some(j) = self.idx(e.b) {
                            g[j][s] -= gain;
                        }
                    }
                    Kind::H { sense, r } => {
                        let k = self.br(e);
                        let s = self.br_named(sense);
                        if let Some(i) = self.idx(e.a) {
                            g[i][k] += 1.0;
                            g[k][i] += 1.0;
                        }
                        if let Some(j) = self.idx(e.b) {
                            g[j][k] -= 1.0;
                            g[k][j] -= 1.0;
                        }
                        g[k][s] -= r;
                    }
                    Kind::E { cp, cn, gain } => {
                        let k = self.br(e);
                        if let Some(i) = self.idx(e.a) {
                            g[i][k] += 1.0;
                            g[k][i] += 1.0;
                        }
                        if let Some(j) = self.idx(e.b) {
                            g[j][k] -= 1.0;
                            g[k][j] -= 1.0;
                        }
                        if let Some(i) = self.idx(*cp) {
                            g[k][i] -= gain;
                        }
                        if let Some(j) = self.idx(*cn) {
                            g[k][j] += gain;
                        }
                    }
                    Kind::G { cp, cn, gm } => {
                        // gm·(Vcp − Vcn) from a to b.
                        for (node, sign) in [(e.a, 1.0), (e.b, -1.0)] {
                            if let Some(r) = self.idx(node) {
                                if let Some(c) = self.idx(*cp) {
                                    g[r][c] += sign * gm;
                                }
                                if let Some(c) = self.idx(*cn) {
                                    g[r][c] -= sign * gm;
                                }
                            }
                        }
                    }
                    Kind::S { cp, cn, ron, roff, vt } => {
                        let vc = self.volt(&x, *cp) - self.volt(&x, *cn);
                        stamp_g(&mut g, e.a, e.b, 1.0 / if vc > *vt { *ron } else { *roff });
                    }
                }
            }
            let next = solve_real(g, rhs).ok_or("the circuit matrix is singular (a node without a DC path to ground, or a loop of voltage sources)")?;
            let mut delta = 0.0f64;
            // Damp large steps of node voltages (diodes), harder the longer Newton cycles
            // (high-gain loops clipped by min/max jump between the rails otherwise).
            let vmax = match iter {
                0..=39 => 2.0,
                40..=99 => 0.5,
                100..=199 => 0.1,
                _ => 0.02,
            };
            for i in 0..n {
                let d = next[i] - x[i];
                let lim = if i < self.c.nodes.len() - 1 { d.clamp(-vmax, vmax) } else { d };
                delta = delta.max((lim).abs() / (1e-6 + 1e-6 * next[i].abs()));
                x[i] += lim;
            }
            let nonlinear = self.c.elems.iter().any(|e| matches!(e.kind, Kind::D { .. } | Kind::S { .. } | Kind::Q { .. } | Kind::M { .. } | Kind::B { .. }));
            if !nonlinear || delta < 1e-3 {
                if !nonlinear {
                    return Ok(next);
                }
                if iter > 0 {
                    return Ok(x);
                }
            }
        }
        Err(format!("Newton–Raphson did not converge at t = {t}"))
    }

    /// Pseudo-transient continuation for high-gain loops (behavioural op-amps clipped at the
    /// rails): V= sources follow their expression with a lag, stepped implicitly to the steady state.
    fn pseudo_transient(&self, over: Option<(&str, f64)>, start: &[f64]) -> Result<Vec<f64>, String> {
        let outs = |x: &[f64]| -> Vec<f64> { self.c.elems.iter().map(|e| self.volt(x, e.a) - self.volt(x, e.b)).collect() };
        let mut x = start.to_vec();
        let mut alpha = 1e-3;
        let mut steady = false;
        for _ in 0..4000 {
            *self.lag.borrow_mut() = Some((alpha, outs(&x)));
            match self.solve(0.0, None, &[], &x, over, 1e-12) {
                Ok(next) => {
                    let change = next.iter().zip(&x).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
                    x = next;
                    if change < 1e-10 && alpha >= 1e4 {
                        steady = true;
                        break;
                    }
                    alpha = (alpha * 1.3).min(1e8);
                }
                Err(_) => {
                    alpha /= 4.0;
                    if alpha < 1e-12 {
                        break;
                    }
                }
            }
        }
        *self.lag.borrow_mut() = None;
        // Finish with the true equations from the steady state.
        match self.solve(0.0, None, &[], &x, over, 1e-12) {
            Ok(x) => Ok(x),
            Err(e) if !steady => Err(e),
            Err(_) => Ok(x),
        }
    }

    /// The operating point: Newton from zero, with gmin stepping when needed.
    fn op(&self, over: Option<(&str, f64)>, guess: Option<&[f64]>) -> Result<Vec<f64>, String> {
        let zero = vec![0.0; self.n];
        let start = guess.unwrap_or(&zero);
        match self.solve(0.0, None, &[], start, over, 1e-12) {
            Ok(x) => Ok(x),
            Err(_) => {
                // gmin stepping, then source stepping (sources ramped up from 10 %).
                let gmin_steps = || -> Result<Vec<f64>, String> {
                    let mut x = start.to_vec();
                    for gmin in [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-8, 1e-10, 1e-12] {
                        x = self.solve(0.0, None, &[], &x, over, gmin)?;
                    }
                    Ok(x)
                };
                let source_steps = || -> Result<Vec<f64>, String> {
                    let mut x = start.to_vec();
                    let mut result = Ok(());
                    for k in 1..=20 {
                        self.scale.set(k as f64 / 20.0);
                        match self.solve(0.0, None, &[], &x, over, 1e-12) {
                            Ok(next) => x = next,
                            Err(e) => {
                                result = Err(e);
                                break;
                            }
                        }
                    }
                    self.scale.set(1.0);
                    result.map(|_| x)
                };
                gmin_steps().or_else(|_| source_steps()).or_else(|e| self.pseudo_transient(over, start).map_err(|_| e))
            }
        }
    }
}

/// "INPUT(column)" in a source becomes PWL(t v …) from the input table, so a
/// measured or generated signal drives the circuit.
fn expand_inputs(ctx: &Ctx, text: &str) -> Result<String, String> {
    let mut out = String::new();
    let mut rest = text;
    while let Some(at) = rest.to_ascii_lowercase().find("input(") {
        out.push_str(&rest[..at]);
        let close = rest[at..].find(')').ok_or("INPUT( needs a closing )")? + at;
        let column = rest[at + 6..close].trim();
        let table = super::input_table(ctx, "in").map_err(|_| format!("INPUT({column}) needs a table on the input"))?;
        let x = table.pick_x(&ctx.str("x", ""));
        let y = table.pick(column)?;
        let pairs: Vec<String> = x.values.iter().zip(&y.values).filter(|(a, b)| a.is_finite() && b.is_finite()).map(|(a, b)| format!("{a:e} {b:e}")).collect();
        if pairs.is_empty() {
            return Err(format!("INPUT({column}): the column has no values"));
        }
        out.push_str(&format!("PWL({})", pairs.join(" ")));
        rest = &rest[close + 1..];
    }
    out.push_str(rest);
    Ok(out)
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let netlist = expand_inputs(ctx, &ctx.str("netlist", ""))?;
    let circuit = parse(&netlist)?;
    let only: Vec<String> = ctx.str("probes", "").split(|c| c == ',' || c == ' ').map(|s| s.trim().to_ascii_lowercase()).filter(|s| !s.is_empty()).collect();
    let mna = Mna { c: &circuit, n: circuit.size(), scale: std::cell::Cell::new(1.0), lag: std::cell::RefCell::new(None) };
    let nn = circuit.nodes.len();
    let shown: Vec<usize> = (1..nn)
        .filter(|&k| if only.is_empty() { !circuit.nodes[k].contains('.') && !circuit.nodes[k].contains('#') } else { only.contains(&circuit.nodes[k]) || only.contains(&format!("v({})", circuit.nodes[k])) })
        .collect();
    for w in &circuit.warnings {
        ctx.warn(w.clone());
    }
    let branches: Vec<&Elem> = circuit.elems.iter().filter(|e| e.branch.is_some() && !e.name.contains('.')).collect();
    let mut d = Dataset::default();
    // Nodes with no path to ground through any element float (gmin holds them at 0 V, as in SPICE): say so.
    let mut reach = vec![false; nn];
    reach[0] = true;
    loop {
        let mut changed = false;
        for e in &circuit.elems {
            // Only the element's own terminals connect (controlling nodes of E and G draw no current).
            let mut ends = vec![e.a, e.b];
            if let Kind::Q { base, .. } = e.kind {
                ends.push(base);
            }
            ends.dedup();
            if ends.iter().any(|&k| reach[k]) {
                for k in ends {
                    if !reach[k] {
                        reach[k] = true;
                        changed = true;
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }
    let floating: Vec<String> = (1..nn).filter(|&k| !reach[k]).map(|k| circuit.nodes[k].clone()).collect();
    if !floating.is_empty() {
        ctx.warn(format!("floating node{} {} (no path to ground; held at 0 V)", if floating.len() > 1 { "s" } else { "" }, floating.join(", ")));
    }
    let op = mna.op(None, None)?;
    for analysis in &circuit.analyses {
        ctx.check()?;
        match analysis {
            Analysis::Op => {
                let mut t = Table::new("operating point");
                t.push(Column::text("quantity", (1..nn).map(|k| format!("V({})", circuit.nodes[k])).chain(branches.iter().map(|e| format!("I({})", e.name))).collect()));
                let mut vals: Vec<f64> = (1..nn).map(|k| op[k - 1]).collect();
                vals.extend(branches.iter().map(|e| op[mna.br(e)]));
                t.push(Column::new("value", "", vals));
                for k in &shown {
                    d.scalar(&format!("V({})", circuit.nodes[*k]), op[k - 1], "V");
                }
                for e in &branches {
                    if matches!(e.kind, Kind::V { .. }) {
                        d.scalar(&format!("I({})", e.name), op[mna.br(e)], "A");
                    }
                }
                // Power delivered by each source.
                let p: f64 = branches.iter().filter(|e| matches!(e.kind, Kind::V { .. })).map(|e| -(mna.volt(&op, e.a) - mna.volt(&op, e.b)) * op[mna.br(e)]).sum();
                d.scalar("source power", p, "W");
                d.tables.push(t);
            }
            Analysis::Dc { src, from, to, step } => {
                if !circuit.elems.iter().any(|e| &e.name == src && matches!(e.kind, Kind::V { .. } | Kind::I { .. })) {
                    return Err(format!(".dc: no source \"{src}\""));
                }
                let count = ((to - from) / step).abs().round() as usize + 1;
                if count > 200_000 {
                    return Err(".dc: too many points".into());
                }
                let mut sweep = Vec::new();
                let mut cols: Vec<Vec<f64>> = vec![Vec::new(); shown.len()];
                let mut icols: Vec<Vec<f64>> = vec![Vec::new(); branches.len()];
                let mut guess = op.clone();
                for k in 0..count {
                    let v = from + (to - from) * k as f64 / (count - 1).max(1) as f64;
                    let x = mna.op(Some((src, v)), Some(&guess))?;
                    sweep.push(v);
                    for (c, &node) in shown.iter().enumerate() {
                        cols[c].push(x[node - 1]);
                    }
                    for (c, e) in branches.iter().enumerate() {
                        icols[c].push(x[mna.br(e)]);
                    }
                    guess = x;
                }
                let mut t = Table::new("dc sweep").with_x(Column::new(src, "", sweep));
                for (c, &node) in shown.iter().enumerate() {
                    t.push(Column::new(&format!("V({})", circuit.nodes[node]), "V", std::mem::take(&mut cols[c])));
                }
                for (c, e) in branches.iter().enumerate() {
                    t.push(Column::new(&format!("I({})", e.name), "A", std::mem::take(&mut icols[c])));
                }
                d.tables.push(t);
            }
            Analysis::Ac { per_decade, f1, f2 } => {
                if !(f1 > &0.0 && f2 > f1) {
                    return Err(".ac: give 0 < FSTART < FSTOP".into());
                }
                let decades = (f2 / f1).log10();
                let count = ((decades * *per_decade as f64).ceil() as usize + 1).min(100_000);
                let n = mna.n;
                let mut freqs = Vec::with_capacity(count);
                let mut mag: Vec<Vec<f64>> = vec![Vec::new(); shown.len()];
                let mut phase: Vec<Vec<f64>> = vec![Vec::new(); shown.len()];
                for k in 0..count {
                    let f = f1 * 10f64.powf(decades * k as f64 / (count - 1).max(1) as f64);
                    let w = 2.0 * PI * f;
                    let mut g = vec![vec![C64::ZERO; n]; n];
                    let mut rhs = vec![C64::ZERO; n];
                    let idx = |k: usize| if k == 0 { None } else { Some(k - 1) };
                    let stamp = |g: &mut Vec<Vec<C64>>, a: usize, b: usize, y: C64| {
                        if let Some(i) = idx(a) {
                            g[i][i] = g[i][i] + y;
                        }
                        if let Some(j) = idx(b) {
                            g[j][j] = g[j][j] + y;
                        }
                        if let (Some(i), Some(j)) = (idx(a), idx(b)) {
                            g[i][j] = g[i][j] - y;
                            g[j][i] = g[j][i] - y;
                        }
                    };
                    for i in 1..nn {
                        g[i - 1][i - 1] = g[i - 1][i - 1] + C64::new(1e-12, 0.0);
                    }
                    for e in &circuit.elems {
                        let branch_rows = |g: &mut Vec<Vec<C64>>| {
                            let k = mna.br(e);
                            if let Some(i) = idx(e.a) {
                                g[i][k] = g[i][k] + C64::ONE;
                                g[k][i] = g[k][i] + C64::ONE;
                            }
                            if let Some(j) = idx(e.b) {
                                g[j][k] = g[j][k] - C64::ONE;
                                g[k][j] = g[k][j] - C64::ONE;
                            }
                            k
                        };
                        match &e.kind {
                            Kind::R(r) => stamp(&mut g, e.a, e.b, C64::new(1.0 / r, 0.0)),
                            Kind::C { c, .. } => stamp(&mut g, e.a, e.b, C64::new(0.0, w * c)),
                            Kind::L(l) => {
                                let k = branch_rows(&mut g);
                                g[k][k] = g[k][k] - C64::new(0.0, w * l);
                            }
                            Kind::V { ac, .. } => {
                                let k = branch_rows(&mut g);
                                rhs[k] = C64::polar(ac.0, ac.1.to_radians());
                            }
                            Kind::I { ac, .. } => {
                                let cur = C64::polar(ac.0, ac.1.to_radians());
                                if let Some(i) = idx(e.a) {
                                    rhs[i] = rhs[i] - cur;
                                }
                                if let Some(j) = idx(e.b) {
                                    rhs[j] = rhs[j] + cur;
                                }
                            }
                            Kind::D { is, n: nd, bv, ibv } => {
                                let vd = mna.volt(&op, e.a) - mna.volt(&op, e.b);
                                let (_, gd) = diode(*is, *nd, *bv, *ibv, vd);
                                stamp(&mut g, e.a, e.b, C64::new(gd, 0.0));
                            }
                            Kind::Q { .. } | Kind::M { .. } => {
                                // Small-signal: the Jacobian at the operating point.
                                let (terms, _, jac) = mna.device(e, &op).unwrap();
                                for (r, &tr) in terms.iter().enumerate() {
                                    let Some(row) = idx(tr) else { continue };
                                    for (c, &tc) in terms.iter().enumerate() {
                                        if let Some(col) = idx(tc) {
                                            g[row][col] = g[row][col] + C64::new(jac[r][c], 0.0);
                                        }
                                    }
                                }
                            }
                            Kind::B { expr, refs, current } => {
                                let (_, grad) = mna.behave(expr, refs, 0.0, &op);
                                if *current {
                                    for (node, sign) in [(e.a, 1.0), (e.b, -1.0)] {
                                        if let Some(r) = idx(node) {
                                            for (u, d) in &grad {
                                                g[r][*u] = g[r][*u] + C64::new(sign * d, 0.0);
                                            }
                                        }
                                    }
                                } else {
                                    let k = branch_rows(&mut g);
                                    for (u, d) in &grad {
                                        g[k][*u] = g[k][*u] - C64::new(*d, 0.0);
                                    }
                                }
                            }
                            Kind::F { sense, gain } => {
                                let s = mna.br_named(sense);
                                if let Some(i) = idx(e.a) {
                                    g[i][s] = g[i][s] + C64::new(*gain, 0.0);
                                }
                                if let Some(j) = idx(e.b) {
                                    g[j][s] = g[j][s] - C64::new(*gain, 0.0);
                                }
                            }
                            Kind::H { sense, r } => {
                                let k = branch_rows(&mut g);
                                let s = mna.br_named(sense);
                                g[k][s] = g[k][s] - C64::new(*r, 0.0);
                            }
                            Kind::E { cp, cn, gain } => {
                                let k = branch_rows(&mut g);
                                if let Some(i) = idx(*cp) {
                                    g[k][i] = g[k][i] - C64::new(*gain, 0.0);
                                }
                                if let Some(j) = idx(*cn) {
                                    g[k][j] = g[k][j] + C64::new(*gain, 0.0);
                                }
                            }
                            Kind::G { cp, cn, gm } => {
                                for (node, sign) in [(e.a, 1.0), (e.b, -1.0)] {
                                    if let Some(r) = idx(node) {
                                        if let Some(c) = idx(*cp) {
                                            g[r][c] = g[r][c] + C64::new(sign * gm, 0.0);
                                        }
                                        if let Some(c) = idx(*cn) {
                                            g[r][c] = g[r][c] - C64::new(sign * gm, 0.0);
                                        }
                                    }
                                }
                            }
                            Kind::S { cp, cn, ron, roff, vt } => {
                                let vc = mna.volt(&op, *cp) - mna.volt(&op, *cn);
                                stamp(&mut g, e.a, e.b, C64::new(1.0 / if vc > *vt { *ron } else { *roff }, 0.0));
                            }
                        }
                    }
                    let x = solve_complex(g, rhs).ok_or("the AC matrix is singular")?;
                    freqs.push(f);
                    for (c, &node) in shown.iter().enumerate() {
                        let v = x[node - 1];
                        mag[c].push(20.0 * v.abs().max(1e-300).log10());
                        phase[c].push(v.arg().to_degrees());
                    }
                }
                let mut t = Table::new("ac").with_x(Column::new("f", "Hz", freqs.clone()));
                for (c, &node) in shown.iter().enumerate() {
                    let name = &circuit.nodes[node];
                    t.push(Column::new(&format!("V({name}) dB"), "dB", std::mem::take(&mut mag[c])));
                    // Unwrapped phase.
                    let mut p = std::mem::take(&mut phase[c]);
                    for i in 1..p.len() {
                        while p[i] - p[i - 1] > 180.0 {
                            p[i] -= 360.0;
                        }
                        while p[i] - p[i - 1] < -180.0 {
                            p[i] += 360.0;
                        }
                    }
                    t.push(Column::new(&format!("V({name}) phase"), "°", p));
                }
                // −3 dB bandwidth of the last shown node (usually the output).
                if let Some(c) = t.columns.iter().rposition(|col| col.name.ends_with(" dB")) {
                    let db = &t.columns[c].values;
                    let peak = db.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                    let level = peak - 3.0103;
                    if let Some(i) = (1..db.len()).find(|&i| db[i - 1] >= level && db[i] < level) {
                        // Between the two points, linear in dB against log f.
                        let fr = (db[i - 1] - level) / (db[i - 1] - db[i]);
                        d.scalar("−3 dB frequency", freqs[i - 1] * (freqs[i] / freqs[i - 1]).powf(fr), "Hz");
                    }
                    d.scalar("peak gain", peak, "dB");
                }
                d.tables.push(t);
            }
            Analysis::Tran { step, stop, uic } => {
                if !(step > &0.0 && stop > step) {
                    return Err(".tran: give 0 < TSTEP < TSTOP".into());
                }
                let count = (stop / step).round() as usize;
                if count > 2_000_000 {
                    return Err(".tran: too many points (raise TSTEP)".into());
                }
                // Internal step: TSTEP, halved around source edges by the solver's own choice (fixed here).
                let h = *step;
                let mut hist = vec![Hist::default(); circuit.elems.len()];
                // Start: the operating point (capacitor voltages, inductor currents), or zero/IC with UIC.
                let mut x = if *uic { vec![0.0; mna.n] } else { op.clone() };
                for (ei, e) in circuit.elems.iter().enumerate() {
                    match &e.kind {
                        Kind::C { ic, .. } => {
                            hist[ei].v = match (uic, ic) {
                                (true, Some(v)) => *v,
                                (true, None) => 0.0,
                                _ => mna.volt(&x, e.a) - mna.volt(&x, e.b),
                            };
                            hist[ei].i = 0.0;
                        }
                        Kind::L(_) => {
                            hist[ei].i = if *uic { 0.0 } else { x[mna.br(e)] };
                            hist[ei].v = 0.0;
                        }
                        _ => {}
                    }
                }
                let mut times = vec![0.0];
                let mut cols: Vec<Vec<f64>> = shown.iter().map(|&k| vec![mna.volt(&x, k)]).collect();
                let mut icols: Vec<Vec<f64>> = branches.iter().map(|e| vec![if *uic { 0.0 } else { x[mna.br(e)] }]).collect();
                for k in 1..=count {
                    let t = k as f64 * h;
                    x = mna.solve(t, Some(h), &hist, &x, None, 1e-12)?;
                    for (ei, e) in circuit.elems.iter().enumerate() {
                        match &e.kind {
                            Kind::C { c, .. } => {
                                let v = mna.volt(&x, e.a) - mna.volt(&x, e.b);
                                let geq = 2.0 * c / h;
                                let i = geq * v - (geq * hist[ei].v + hist[ei].i);
                                hist[ei] = Hist { v, i };
                            }
                            Kind::L(_) => {
                                let v = mna.volt(&x, e.a) - mna.volt(&x, e.b);
                                hist[ei] = Hist { v, i: x[mna.br(e)] };
                            }
                            _ => {}
                        }
                    }
                    times.push(t);
                    for (c, &node) in shown.iter().enumerate() {
                        cols[c].push(mna.volt(&x, node));
                    }
                    for (c, e) in branches.iter().enumerate() {
                        icols[c].push(x[mna.br(e)]);
                    }
                    if k % 2000 == 0 {
                        ctx.check()?;
                        ctx.report(k as f64 / count as f64, "transient");
                    }
                }
                let mut t = Table::new("transient").with_x(Column::new("t", "s", times));
                for (c, &node) in shown.iter().enumerate() {
                    t.push(Column::new(&format!("V({})", circuit.nodes[node]), "V", std::mem::take(&mut cols[c])));
                }
                for (c, e) in branches.iter().enumerate() {
                    t.push(Column::new(&format!("I({})", e.name), "A", std::mem::take(&mut icols[c])));
                }
                d.tables.push(t);
            }
        }
    }
    // The transient (or the sweep) first: it is what a plot shows by default.
    d.tables.sort_by_key(|t| match t.name.as_str() {
        "transient" => 0,
        "ac" => 1,
        "dc sweep" => 2,
        _ => 3,
    });
    d.scalar("nodes", (nn - 1) as f64, "").scalar("elements", circuit.elems.len() as f64, "");
    if let Some(t) = &circuit.title {
        d.text = t.clone();
    }
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_and_tokens() {
        assert!((value("4.7k").unwrap() - 4700.0).abs() < 1e-9);
        assert!((value("10uF").unwrap() - 1e-5).abs() < 1e-18);
        assert!((value("1meg").unwrap() - 1e6).abs() < 1e-6);
        assert!((value("2.2µ").unwrap() - 2.2e-6).abs() < 1e-18);
        assert!((value("1e-3").unwrap() - 1e-3).abs() < 1e-18);
        assert_eq!(tokens("V1 in 0 SIN (0 1 1k) AC 1"), vec!["V1", "in", "0", "SIN(0 1 1k)", "AC", "1"]);
    }
}
