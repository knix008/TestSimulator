//! A small expression language for the nodes that take formulas: ODE
//! right-hand sides, derived columns, Monte Carlo outputs, objectives and
//! curve-fit models.
//!
//! `x^2 + sin(2*pi*f*t) - min(a, b)`, comparisons (`<`, `<=`, `==` … give 1 or
//! 0), `&&`, `||`, `!`, `if(c, a, b)`. An expression is compiled once against a
//! list of variable names into a stack program and evaluated many times.

use std::f64::consts::{E, PI};

#[derive(Clone, Copy, Debug, PartialEq)]
enum Func {
    Sin, Cos, Tan, Asin, Acos, Atan, Atan2, Sinh, Cosh, Tanh, Exp, Ln, Log10, Log2, Sqrt, Cbrt, Abs, Sign,
    Floor, Ceil, Round, Min, Max, Pow, Hypot, Clamp, Step, If, Mod, Sat, Deg, Rad, Sinc, Erf, Gauss,
}

fn func_by_name(name: &str) -> Option<(Func, usize, usize)> {
    use Func::*;
    // (function, min args, max args)
    Some(match name {
        "sin" => (Sin, 1, 1),
        "cos" => (Cos, 1, 1),
        "tan" => (Tan, 1, 1),
        "asin" => (Asin, 1, 1),
        "acos" => (Acos, 1, 1),
        "atan" => (Atan, 1, 1),
        "atan2" => (Atan2, 2, 2),
        "sinh" => (Sinh, 1, 1),
        "cosh" => (Cosh, 1, 1),
        "tanh" => (Tanh, 1, 1),
        "exp" => (Exp, 1, 1),
        "ln" | "log" => (Ln, 1, 1),
        "log10" => (Log10, 1, 1),
        "log2" => (Log2, 1, 1),
        "sqrt" => (Sqrt, 1, 1),
        "cbrt" => (Cbrt, 1, 1),
        "abs" => (Abs, 1, 1),
        "sign" | "sgn" => (Sign, 1, 1),
        "floor" => (Floor, 1, 1),
        "ceil" => (Ceil, 1, 1),
        "round" => (Round, 1, 1),
        "min" => (Min, 2, 16),
        "max" => (Max, 2, 16),
        "pow" => (Pow, 2, 2),
        "hypot" => (Hypot, 2, 2),
        "clamp" => (Clamp, 3, 3),
        "step" | "heaviside" => (Step, 1, 1),
        "if" => (If, 3, 3),
        "mod" => (Mod, 2, 2),
        "sat" => (Sat, 1, 3),
        "deg" => (Deg, 1, 1),
        "rad" => (Rad, 1, 1),
        "sinc" => (Sinc, 1, 1),
        "erf" => (Erf, 1, 1),
        "gauss" => (Gauss, 1, 3),
        _ => return None,
    })
}

/// The names the language knows (for the UI's help and to reject them as variable names).
pub const FUNCTIONS: &[&str] = &[
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "exp", "ln", "log", "log10", "log2", "sqrt", "cbrt", "abs",
    "sign", "floor", "ceil", "round", "min", "max", "pow", "hypot", "clamp", "step", "if", "mod", "sat", "deg", "rad", "sinc", "erf", "gauss",
];

#[derive(Clone, Copy, Debug, PartialEq)]
enum Bin {
    Add, Sub, Mul, Div, Pow, Rem, Lt, Le, Gt, Ge, Eq, Ne, And, Or,
}

#[derive(Clone, Debug)]
enum Op {
    Num(f64),
    Var(usize),
    Neg,
    Not,
    Bin(Bin),
    Call(Func, usize),
}

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Num(f64),
    Id(String),
    Op(&'static str),
    LParen,
    RParen,
    Comma,
}

fn tokenize(src: &str) -> Result<Vec<Tok>, String> {
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;
    let mut out = Vec::new();
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c.is_ascii_digit() || (c == '.' && chars.get(i + 1).is_some_and(|d| d.is_ascii_digit())) {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            if i < chars.len() && (chars[i] == 'e' || chars[i] == 'E') {
                let save = i;
                i += 1;
                if i < chars.len() && (chars[i] == '+' || chars[i] == '-') {
                    i += 1;
                }
                if i < chars.len() && chars[i].is_ascii_digit() {
                    while i < chars.len() && chars[i].is_ascii_digit() {
                        i += 1;
                    }
                } else {
                    i = save;
                }
            }
            let text: String = chars[start..i].iter().collect();
            out.push(Tok::Num(text.parse().map_err(|_| format!("bad number \"{text}\""))?));
            continue;
        }
        if c.is_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '.') {
                i += 1;
            }
            out.push(Tok::Id(chars[start..i].iter().collect()));
            continue;
        }
        let two: String = chars[i..(i + 2).min(chars.len())].iter().collect();
        let op2 = ["<=", ">=", "==", "!=", "&&", "||", "**"].iter().find(|o| **o == two);
        if let Some(op) = op2 {
            out.push(Tok::Op(if *op == "**" { "^" } else { op }));
            i += 2;
            continue;
        }
        let tok = match c {
            '+' => Tok::Op("+"),
            '-' => Tok::Op("-"),
            '*' | '·' | '×' => Tok::Op("*"),
            '/' => Tok::Op("/"),
            '^' => Tok::Op("^"),
            '%' => Tok::Op("%"),
            '<' => Tok::Op("<"),
            '>' => Tok::Op(">"),
            '!' => Tok::Op("!"),
            '(' | '[' => Tok::LParen,
            ')' | ']' => Tok::RParen,
            ',' => Tok::Comma,
            '−' => Tok::Op("-"),
            other => return Err(format!("unexpected character '{other}'")),
        };
        out.push(tok);
        i += 1;
    }
    Ok(out)
}

struct Parser<'a> {
    toks: Vec<Tok>,
    pos: usize,
    vars: &'a dyn Fn(&str) -> Option<usize>,
    ops: Vec<Op>,
    unknown: Vec<String>,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }

    fn eat_op(&mut self, ops: &[&str]) -> Option<&'static str> {
        if let Some(Tok::Op(op)) = self.peek() {
            if ops.contains(op) {
                let op = *op;
                self.pos += 1;
                return Some(op);
            }
        }
        None
    }

    fn or(&mut self) -> Result<(), String> {
        self.and()?;
        while self.eat_op(&["||"]).is_some() {
            self.and()?;
            self.ops.push(Op::Bin(Bin::Or));
        }
        Ok(())
    }

    fn and(&mut self) -> Result<(), String> {
        self.cmp()?;
        while self.eat_op(&["&&"]).is_some() {
            self.cmp()?;
            self.ops.push(Op::Bin(Bin::And));
        }
        Ok(())
    }

    fn cmp(&mut self) -> Result<(), String> {
        self.add()?;
        while let Some(op) = self.eat_op(&["<", "<=", ">", ">=", "==", "!="]) {
            self.add()?;
            self.ops.push(Op::Bin(match op {
                "<" => Bin::Lt,
                "<=" => Bin::Le,
                ">" => Bin::Gt,
                ">=" => Bin::Ge,
                "==" => Bin::Eq,
                _ => Bin::Ne,
            }));
        }
        Ok(())
    }

    fn add(&mut self) -> Result<(), String> {
        self.mul()?;
        while let Some(op) = self.eat_op(&["+", "-"]) {
            self.mul()?;
            self.ops.push(Op::Bin(if op == "+" { Bin::Add } else { Bin::Sub }));
        }
        Ok(())
    }

    fn mul(&mut self) -> Result<(), String> {
        self.unary()?;
        loop {
            if let Some(op) = self.eat_op(&["*", "/", "%"]) {
                self.unary()?;
                self.ops.push(Op::Bin(match op {
                    "*" => Bin::Mul,
                    "/" => Bin::Div,
                    _ => Bin::Rem,
                }));
            } else if matches!(self.peek(), Some(Tok::Num(_)) | Some(Tok::Id(_)) | Some(Tok::LParen)) && self.implicit_ok() {
                // Implicit multiplication: 2x, 2(a+b), 3pi.
                self.unary()?;
                self.ops.push(Op::Bin(Bin::Mul));
            } else {
                return Ok(());
            }
        }
    }

    fn implicit_ok(&self) -> bool {
        // Only after a number literal ("2x", "3(a+b)"), never between two names.
        matches!(self.toks.get(self.pos.wrapping_sub(1)), Some(Tok::Num(_)))
    }

    fn unary(&mut self) -> Result<(), String> {
        if let Some(op) = self.eat_op(&["-", "+", "!"]) {
            self.unary()?;
            match op {
                "-" => self.ops.push(Op::Neg),
                "!" => self.ops.push(Op::Not),
                _ => {}
            }
            return Ok(());
        }
        self.power()
    }

    fn power(&mut self) -> Result<(), String> {
        self.atom()?;
        if self.eat_op(&["^"]).is_some() {
            // Right associative, and binds tighter than a unary minus on its left: -x^2 = -(x^2).
            self.unary()?;
            self.ops.push(Op::Bin(Bin::Pow));
        }
        Ok(())
    }

    fn atom(&mut self) -> Result<(), String> {
        match self.toks.get(self.pos).cloned() {
            Some(Tok::Num(v)) => {
                self.pos += 1;
                self.ops.push(Op::Num(v));
                Ok(())
            }
            Some(Tok::LParen) => {
                self.pos += 1;
                self.or()?;
                if self.peek() != Some(&Tok::RParen) {
                    return Err("missing ')'".into());
                }
                self.pos += 1;
                Ok(())
            }
            Some(Tok::Id(name)) => {
                self.pos += 1;
                if self.peek() == Some(&Tok::LParen) {
                    let lname = name.to_ascii_lowercase();
                    let (func, lo, hi) = func_by_name(&lname).ok_or_else(|| format!("unknown function \"{name}\""))?;
                    self.pos += 1;
                    let mut count = 0;
                    if self.peek() != Some(&Tok::RParen) {
                        loop {
                            self.or()?;
                            count += 1;
                            if self.peek() == Some(&Tok::Comma) {
                                self.pos += 1;
                                continue;
                            }
                            break;
                        }
                    }
                    if self.peek() != Some(&Tok::RParen) {
                        return Err(format!("missing ')' after the arguments of {name}"));
                    }
                    self.pos += 1;
                    if count < lo || count > hi {
                        return Err(if lo == hi {
                            format!("{name}() takes {lo} argument(s), got {count}")
                        } else {
                            format!("{name}() takes {lo} to {hi} arguments, got {count}")
                        });
                    }
                    self.ops.push(Op::Call(func, count));
                    return Ok(());
                }
                if let Some(index) = (self.vars)(&name) {
                    self.ops.push(Op::Var(index));
                } else {
                    match name.as_str() {
                        "pi" | "PI" | "π" => self.ops.push(Op::Num(PI)),
                        "e" => self.ops.push(Op::Num(E)),
                        "inf" | "Inf" => self.ops.push(Op::Num(f64::INFINITY)),
                        "nan" | "NaN" => self.ops.push(Op::Num(f64::NAN)),
                        "true" => self.ops.push(Op::Num(1.0)),
                        "false" => self.ops.push(Op::Num(0.0)),
                        _ => {
                            if !self.unknown.contains(&name) {
                                self.unknown.push(name.clone());
                            }
                            self.ops.push(Op::Num(f64::NAN));
                        }
                    }
                }
                Ok(())
            }
            Some(Tok::Op(op)) => Err(format!("unexpected '{op}'")),
            Some(Tok::RParen) => Err("unexpected ')'".into()),
            Some(Tok::Comma) => Err("unexpected ','".into()),
            None => Err("the expression ends too early".into()),
        }
    }
}

/// A compiled expression.
#[derive(Clone, Debug)]
pub struct Expr {
    ops: Vec<Op>,
    depth: usize,
    pub source: String,
}

impl Expr {
    /// Compiles `src` with variables resolved by `vars(name) -> slot`.
    pub fn compile(src: &str, vars: &dyn Fn(&str) -> Option<usize>) -> Result<Expr, String> {
        let toks = tokenize(src).map_err(|e| format!("{e} in \"{}\"", src.trim()))?;
        if toks.is_empty() {
            return Err("empty expression".into());
        }
        let mut p = Parser { toks, pos: 0, vars, ops: Vec::new(), unknown: Vec::new() };
        p.or().map_err(|e| format!("{e} in \"{}\"", src.trim()))?;
        if p.pos < p.toks.len() {
            return Err(format!("unexpected text after the expression in \"{}\"", src.trim()));
        }
        if !p.unknown.is_empty() {
            return Err(format!("unknown name{} {} in \"{}\"", if p.unknown.len() > 1 { "s" } else { "" }, p.unknown.join(", "), src.trim()));
        }
        // Stack depth for a preallocated evaluation stack.
        let mut depth = 0usize;
        let mut max = 0usize;
        for op in &p.ops {
            match op {
                Op::Num(_) | Op::Var(_) => depth += 1,
                Op::Neg | Op::Not => {}
                Op::Bin(_) => depth -= 1,
                Op::Call(_, n) => depth = depth + 1 - n,
            }
            max = max.max(depth);
        }
        Ok(Expr { ops: p.ops, depth: max.max(1), source: src.trim().to_string() })
    }

    /// Compiles against a fixed list of names (slot = position).
    pub fn with_names(src: &str, names: &[String]) -> Result<Expr, String> {
        Expr::compile(src, &|name| names.iter().position(|n| n == name))
    }

    pub fn stack(&self) -> Vec<f64> {
        Vec::with_capacity(self.depth + 2)
    }

    /// Is the expression a plain constant (no variables)?
    pub fn is_constant(&self) -> bool {
        !self.ops.iter().any(|op| matches!(op, Op::Var(_)))
    }

    /// The variable slots the expression reads (each once).
    pub fn vars(&self) -> Vec<usize> {
        let mut out = Vec::new();
        for op in &self.ops {
            if let Op::Var(i) = op {
                if !out.contains(i) {
                    out.push(*i);
                }
            }
        }
        out
    }

    pub fn eval(&self, vars: &[f64], stack: &mut Vec<f64>) -> f64 {
        stack.clear();
        for op in &self.ops {
            match op {
                Op::Num(v) => stack.push(*v),
                Op::Var(i) => stack.push(vars.get(*i).copied().unwrap_or(f64::NAN)),
                Op::Neg => {
                    let v = stack.pop().unwrap_or(f64::NAN);
                    stack.push(-v);
                }
                Op::Not => {
                    let v = stack.pop().unwrap_or(f64::NAN);
                    stack.push(if v == 0.0 { 1.0 } else { 0.0 });
                }
                Op::Bin(b) => {
                    let r = stack.pop().unwrap_or(f64::NAN);
                    let l = stack.pop().unwrap_or(f64::NAN);
                    let flag = |c: bool| if c { 1.0 } else { 0.0 };
                    stack.push(match b {
                        Bin::Add => l + r,
                        Bin::Sub => l - r,
                        Bin::Mul => l * r,
                        Bin::Div => l / r,
                        Bin::Pow => pow(l, r),
                        Bin::Rem => l - r * (l / r).floor(),
                        Bin::Lt => flag(l < r),
                        Bin::Le => flag(l <= r),
                        Bin::Gt => flag(l > r),
                        Bin::Ge => flag(l >= r),
                        Bin::Eq => flag((l - r).abs() <= 1e-12 * l.abs().max(r.abs()).max(1.0)),
                        Bin::Ne => flag((l - r).abs() > 1e-12 * l.abs().max(r.abs()).max(1.0)),
                        Bin::And => flag(l != 0.0 && r != 0.0),
                        Bin::Or => flag(l != 0.0 || r != 0.0),
                    });
                }
                Op::Call(f, n) => {
                    let at = stack.len() - n;
                    let v = call(*f, &stack[at..]);
                    stack.truncate(at);
                    stack.push(v);
                }
            }
        }
        stack.pop().unwrap_or(f64::NAN)
    }

    /// Convenience: evaluate once with a fresh stack.
    pub fn value(&self, vars: &[f64]) -> f64 {
        let mut stack = self.stack();
        self.eval(vars, &mut stack)
    }
}

fn pow(l: f64, r: f64) -> f64 {
    if r == 2.0 {
        l * l
    } else if r == r.trunc() && r.abs() < 64.0 {
        l.powi(r as i32)
    } else {
        l.powf(r)
    }
}

fn call(f: Func, a: &[f64]) -> f64 {
    use Func::*;
    match f {
        Sin => a[0].sin(),
        Cos => a[0].cos(),
        Tan => a[0].tan(),
        Asin => a[0].asin(),
        Acos => a[0].acos(),
        Atan => a[0].atan(),
        Atan2 => a[0].atan2(a[1]),
        Sinh => a[0].sinh(),
        Cosh => a[0].cosh(),
        Tanh => a[0].tanh(),
        Exp => a[0].exp(),
        Ln => a[0].ln(),
        Log10 => a[0].log10(),
        Log2 => a[0].log2(),
        Sqrt => a[0].sqrt(),
        Cbrt => a[0].cbrt(),
        Abs => a[0].abs(),
        Sign => {
            if a[0] > 0.0 {
                1.0
            } else if a[0] < 0.0 {
                -1.0
            } else {
                0.0
            }
        }
        Floor => a[0].floor(),
        Ceil => a[0].ceil(),
        Round => a[0].round(),
        Min => a.iter().cloned().fold(f64::INFINITY, f64::min),
        Max => a.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
        Pow => pow(a[0], a[1]),
        Hypot => a[0].hypot(a[1]),
        Clamp => a[0].max(a[1]).min(a[2]),
        Step => {
            if a[0] >= 0.0 {
                1.0
            } else {
                0.0
            }
        }
        If => {
            if a[0] != 0.0 && !a[0].is_nan() {
                a[1]
            } else {
                a[2]
            }
        }
        Mod => a[0] - a[1] * (a[0] / a[1]).floor(),
        Sat => {
            let (lo, hi) = match a.len() {
                1 => (-1.0, 1.0),
                2 => (-a[1].abs(), a[1].abs()),
                _ => (a[1], a[2]),
            };
            a[0].max(lo).min(hi)
        }
        Deg => a[0].to_degrees(),
        Rad => a[0].to_radians(),
        Sinc => {
            if a[0].abs() < 1e-12 {
                1.0
            } else {
                (PI * a[0]).sin() / (PI * a[0])
            }
        }
        Erf => erf(a[0]),
        Gauss => {
            let (mu, sigma) = match a.len() {
                1 => (0.0, 1.0),
                2 => (a[1], 1.0),
                _ => (a[1], a[2]),
            };
            let z = (a[0] - mu) / sigma;
            (-0.5 * z * z).exp() / (sigma * (2.0 * PI).sqrt())
        }
    }
}

/// erf(x), Abramowitz–Stegun 7.1.26 refined with one series/continued fraction switch (|error| < 1.2e-7).
pub fn erf(x: f64) -> f64 {
    // Numerical Recipes erfc (Chebyshev), accurate to ~1.2e-7.
    let z = x.abs();
    let t = 1.0 / (1.0 + 0.5 * z);
    let r = t * (-z * z - 1.26551223
        + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
        .exp();
    if x >= 0.0 {
        1.0 - r
    } else {
        r - 1.0
    }
}

/// Is `name` usable as a variable name?
pub fn valid_name(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if c.is_alphabetic() || c == '_' => {}
        _ => return false,
    }
    chars.all(|c| c.is_alphanumeric() || c == '_' || c == '.') && func_by_name(&name.to_ascii_lowercase()).is_none() && !["pi", "inf", "nan", "true", "false"].contains(&name)
}

/// A column name made usable in expressions: "Speed (m/s)" → "Speed".
pub fn sanitize_name(name: &str) -> String {
    let mut out: String = name.chars().map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' }).collect();
    while out.contains("__") {
        out = out.replace("__", "_");
    }
    let out = out.trim_matches('_').to_string();
    if out.is_empty() || out.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        format!("c_{out}")
    } else {
        out
    }
}

/// Splits statement text into non-empty statements: lines and ';', with `#` and `//` comments removed.
pub fn statements(text: &str) -> Vec<String> {
    text.lines()
        .flat_map(|line| {
            let line = line.split('#').next().unwrap_or("");
            let line = line.split("//").next().unwrap_or("");
            line.split(';').map(|s| s.trim().to_string()).collect::<Vec<_>>()
        })
        .filter(|s| !s.is_empty())
        .collect()
}

/// "a = 1, b = 2*a" or one per line → [(a, 1), (b, 2)]: constants, each may use the earlier ones.
pub fn constants(text: &str) -> Result<Vec<(String, f64)>, String> {
    let mut out: Vec<(String, f64)> = Vec::new();
    for stmt in statements(&text.replace(',', ";")) {
        let (name, value) = stmt.split_once('=').ok_or_else(|| format!("\"{stmt}\" is not name = value"))?;
        let name = name.trim().to_string();
        if !valid_name(&name) {
            return Err(format!("\"{name}\" cannot be a name"));
        }
        let names: Vec<String> = out.iter().map(|(n, _)| n.clone()).collect();
        let vals: Vec<f64> = out.iter().map(|(_, v)| *v).collect();
        let e = Expr::with_names(value, &names)?;
        let v = e.value(&vals);
        if let Some(slot) = out.iter_mut().find(|(n, _)| *n == name) {
            slot.1 = v;
        } else {
            out.push((name, v));
        }
    }
    Ok(out)
}

/// A list of numbers: "1, 2.5, 3e-3" (also spaces, ';' or new lines), each may be an expression of constants.
pub fn number_list(text: &str) -> Result<Vec<f64>, String> {
    let mut out = Vec::new();
    for part in text.split(|c: char| c == ',' || c == ';' || c == '\n' || c == '\t') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        // Space separated plain numbers: "1 0.6 1".
        let pieces: Vec<&str> = part.split_whitespace().collect();
        if pieces.len() > 1 && pieces.iter().all(|p| p.parse::<f64>().is_ok()) {
            out.extend(pieces.iter().map(|p| p.parse::<f64>().unwrap()));
            continue;
        }
        let e = Expr::with_names(part, &[])?;
        out.push(e.value(&[]));
    }
    Ok(out)
}

/// A matrix: rows separated by ';' or new lines, entries by ',' or spaces.
pub fn matrix(text: &str) -> Result<Vec<Vec<f64>>, String> {
    let mut rows = Vec::new();
    for line in text.split(|c| c == ';' || c == '\n') {
        let line = line.trim().trim_start_matches('[').trim_end_matches(']').trim();
        if line.is_empty() {
            continue;
        }
        let mut row = Vec::new();
        for part in line.split(|c: char| c == ',' || c.is_whitespace()) {
            if part.trim().is_empty() {
                continue;
            }
            row.push(Expr::with_names(part, &[])?.value(&[]));
        }
        rows.push(row);
    }
    if let Some(w) = rows.first().map(|r| r.len()) {
        if rows.iter().any(|r| r.len() != w) {
            return Err("the matrix rows have different lengths".into());
        }
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(src: &str) -> f64 {
        Expr::with_names(src, &["x".into(), "y".into()]).unwrap().value(&[2.0, 3.0])
    }

    #[test]
    fn precedence_and_functions() {
        assert_eq!(ev("1 + 2 * 3"), 7.0);
        assert_eq!(ev("-x^2"), -4.0);
        assert_eq!(ev("2^3^2"), 512.0);
        assert_eq!(ev("(x + y) * 2"), 10.0);
        assert_eq!(ev("max(x, y, 1)"), 3.0);
        assert_eq!(ev("if(x > y, 1, 2)"), 2.0);
        assert_eq!(ev("x < y && y < 4"), 1.0);
        assert_eq!(ev("2x + 3"), 7.0);
        assert!((ev("sin(pi/2)") - 1.0).abs() < 1e-12);
        assert!((ev("erf(1)") - 0.8427007929).abs() < 1e-6);
        assert_eq!(ev("7 % 3"), 1.0);
        assert_eq!(ev("x ** 3"), 8.0);
    }

    #[test]
    fn errors_name_the_problem() {
        let e = Expr::with_names("x + z", &["x".into()]).unwrap_err();
        assert!(e.contains("unknown name z"), "{e}");
        assert!(Expr::with_names("sin(1, 2)", &[]).unwrap_err().contains("1 argument"));
        assert!(Expr::with_names("(1 + 2", &[]).is_err());
        assert!(Expr::with_names("1 +", &[]).is_err());
    }

    #[test]
    fn helpers() {
        assert_eq!(constants("m = 2, k = 4*m").unwrap(), vec![("m".into(), 2.0), ("k".into(), 8.0)]);
        assert_eq!(number_list("1, 0.6 ,1").unwrap(), vec![1.0, 0.6, 1.0]);
        assert_eq!(number_list("1 2 3").unwrap(), vec![1.0, 2.0, 3.0]);
        assert_eq!(matrix("0 1; -2 -3").unwrap(), vec![vec![0.0, 1.0], vec![-2.0, -3.0]]);
        assert_eq!(sanitize_name("Speed (m/s)"), "Speed_m_s");
        assert_eq!(statements("a=1 # c\nb=2; c=3"), vec!["a=1", "b=2", "c=3"]);
    }
}
