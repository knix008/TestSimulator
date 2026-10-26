//! Values of the M language: real or complex matrices (logical too), char
//! strings, cell arrays, structure arrays and function handles, with
//! MATLAB's arithmetic (implicit expansion, matrix products and division).

use super::syntax::{Bin, Expr, Function};
use crate::fft::C64;
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Clone, Debug, PartialEq)]
pub struct Arr {
    pub r: usize,
    pub c: usize,
    /// Column-major.
    pub re: Vec<f64>,
    pub im: Option<Vec<f64>>,
    pub logical: bool,
}

#[derive(Clone, Debug)]
pub enum Func {
    Named(String),
    User(Rc<Function>),
    Anon { params: Rc<Vec<String>>, body: Rc<Expr>, captured: Rc<HashMap<String, Value>> },
}

#[derive(Clone, Debug)]
pub enum Value {
    Num(Arr),
    Str(String),
    Cell { r: usize, c: usize, items: Vec<Value> },
    /// items[element][field]
    Struct { r: usize, c: usize, fields: Vec<String>, items: Vec<Vec<Value>> },
    Func(Func),
}

pub type R<T> = Result<T, String>;

impl Arr {
    pub fn new(r: usize, c: usize, re: Vec<f64>) -> Arr {
        Arr { r, c, re, im: None, logical: false }
    }
    pub fn zeros(r: usize, c: usize) -> Arr {
        Arr::new(r, c, vec![0.0; r * c])
    }
    pub fn scalar(v: f64) -> Arr {
        Arr::new(1, 1, vec![v])
    }
    pub fn row(v: Vec<f64>) -> Arr {
        Arr::new(1, v.len(), v)
    }
    pub fn col(v: Vec<f64>) -> Arr {
        Arr::new(v.len(), 1, v)
    }
    pub fn complex(r: usize, c: usize, re: Vec<f64>, im: Vec<f64>) -> Arr {
        let mut a = Arr { r, c, re, im: Some(im), logical: false };
        a.simplify();
        a
    }
    pub fn from_c(r: usize, c: usize, v: &[C64]) -> Arr {
        Arr::complex(r, c, v.iter().map(|z| z.re).collect(), v.iter().map(|z| z.im).collect())
    }
    pub fn len(&self) -> usize {
        self.re.len()
    }
    pub fn is_empty(&self) -> bool {
        self.re.is_empty()
    }
    pub fn is_complex(&self) -> bool {
        self.im.is_some()
    }
    pub fn at_c(&self, k: usize) -> C64 {
        C64::new(self.re[k], self.im.as_ref().map_or(0.0, |v| v[k]))
    }
    pub fn to_c(&self) -> Vec<C64> {
        (0..self.len()).map(|k| self.at_c(k)).collect()
    }
    /// Drops an all-zero imaginary part.
    pub fn simplify(&mut self) {
        if let Some(im) = &self.im {
            if im.iter().all(|v| *v == 0.0) {
                self.im = None;
            }
        }
    }
    pub fn get(&self, i: usize, j: usize) -> f64 {
        self.re[j * self.r + i]
    }
    pub fn transpose(&self, conj: bool) -> Arr {
        let mut re = vec![0.0; self.len()];
        let mut im = self.im.as_ref().map(|_| vec![0.0; self.len()]);
        for i in 0..self.r {
            for j in 0..self.c {
                re[i * self.c + j] = self.re[j * self.r + i];
                if let (Some(dst), Some(src)) = (im.as_mut(), self.im.as_ref()) {
                    dst[i * self.c + j] = if conj { -src[j * self.r + i] } else { src[j * self.r + i] };
                }
            }
        }
        Arr { r: self.c, c: self.r, re, im, logical: self.logical }
    }
    pub fn to_rows(&self) -> Vec<Vec<f64>> {
        (0..self.r).map(|i| (0..self.c).map(|j| self.get(i, j)).collect()).collect()
    }
    pub fn from_rows(m: &[Vec<f64>]) -> Arr {
        let r = m.len();
        let c = m.first().map_or(0, |x| x.len());
        let mut re = vec![0.0; r * c];
        for i in 0..r {
            for j in 0..c {
                re[j * r + i] = m[i][j];
            }
        }
        Arr::new(r, c, re)
    }
    pub fn boolean(r: usize, c: usize, v: Vec<bool>) -> Arr {
        Arr { r, c, re: v.into_iter().map(|b| if b { 1.0 } else { 0.0 }).collect(), im: None, logical: true }
    }
}

impl Value {
    pub fn num(v: f64) -> Value {
        Value::Num(Arr::scalar(v))
    }
    pub fn boolean(b: bool) -> Value {
        Value::Num(Arr::boolean(1, 1, vec![b]))
    }
    pub fn empty() -> Value {
        Value::Num(Arr::zeros(0, 0))
    }
    pub fn row(v: Vec<f64>) -> Value {
        Value::Num(Arr::row(v))
    }
    pub fn col(v: Vec<f64>) -> Value {
        Value::Num(Arr::col(v))
    }
    pub fn class(&self) -> &'static str {
        match self {
            Value::Num(a) if a.logical => "logical",
            Value::Num(_) => "double",
            Value::Str(_) => "char",
            Value::Cell { .. } => "cell",
            Value::Struct { .. } => "struct",
            Value::Func(_) => "function_handle",
        }
    }
    pub fn dims(&self) -> (usize, usize) {
        match self {
            Value::Num(a) => (a.r, a.c),
            Value::Str(s) => (if s.is_empty() { 0 } else { 1 }, s.chars().count()),
            Value::Cell { r, c, .. } | Value::Struct { r, c, .. } => (*r, *c),
            Value::Func(_) => (1, 1),
        }
    }
    pub fn numel(&self) -> usize {
        let (r, c) = self.dims();
        r * c
    }
    /// As a numeric array (char → codes).
    pub fn arr(&self) -> R<Arr> {
        match self {
            Value::Num(a) => Ok(a.clone()),
            Value::Str(s) => Ok(Arr::row(s.chars().map(|c| c as u32 as f64).collect())),
            Value::Cell { .. } => Err("a cell array cannot be used as a number (use {} to get its contents)".into()),
            Value::Struct { .. } => Err("a structure cannot be used as a number".into()),
            Value::Func(_) => Err("a function handle cannot be used as a number (call it with ( ))".into()),
        }
    }
    pub fn scalar(&self) -> R<f64> {
        let a = self.arr()?;
        if a.is_empty() {
            return Err("expected a number, got an empty array".into());
        }
        Ok(a.re[0])
    }
    pub fn usize(&self) -> R<usize> {
        let v = self.scalar()?;
        if v < 0.0 || v.fract() != 0.0 || !v.is_finite() {
            return Err(format!("expected a whole number ≥ 0, got {v}"));
        }
        Ok(v as usize)
    }
    pub fn text(&self) -> R<String> {
        match self {
            Value::Str(s) => Ok(s.clone()),
            Value::Num(a) => Ok(a.re.iter().map(|v| char::from_u32(*v as u32).unwrap_or('?')).collect()),
            Value::Cell { items, .. } if items.len() == 1 => items[0].text(),
            _ => Err(format!("expected text, got a {}", self.class())),
        }
    }
    pub fn truthy(&self) -> R<bool> {
        let a = self.arr()?;
        Ok(!a.is_empty() && a.re.iter().zip(0..).all(|(v, k)| *v != 0.0 || a.im.as_ref().is_some_and(|im| im[k] != 0.0)))
    }
    pub fn is_empty(&self) -> bool {
        self.numel() == 0
    }
}

// ───────────────────────── arithmetic

fn broadcast(a: &Arr, b: &Arr) -> R<(usize, usize)> {
    let r = if a.r == b.r { a.r } else if a.r == 1 { b.r } else if b.r == 1 { a.r } else { return Err(format!("sizes do not match: {}×{} and {}×{}", a.r, a.c, b.r, b.c)) };
    let c = if a.c == b.c { a.c } else if a.c == 1 { b.c } else if b.c == 1 { a.c } else { return Err(format!("sizes do not match: {}×{} and {}×{}", a.r, a.c, b.r, b.c)) };
    Ok((r, c))
}

fn idx(a: &Arr, i: usize, j: usize) -> usize {
    (if a.c == 1 { 0 } else { j }) * a.r + if a.r == 1 { 0 } else { i }
}

/// Element-wise with implicit expansion.
pub fn elementwise(a: &Arr, b: &Arr, f: &dyn Fn(f64, f64) -> f64) -> R<Arr> {
    let (r, c) = broadcast(a, b)?;
    let mut re = Vec::with_capacity(r * c);
    for j in 0..c {
        for i in 0..r {
            re.push(f(a.re[idx(a, i, j)], b.re[idx(b, i, j)]));
        }
    }
    Ok(Arr::new(r, c, re))
}

pub fn elementwise_c(a: &Arr, b: &Arr, f: &dyn Fn(C64, C64) -> C64) -> R<Arr> {
    let (r, c) = broadcast(a, b)?;
    let mut out = Vec::with_capacity(r * c);
    for j in 0..c {
        for i in 0..r {
            out.push(f(a.at_c(idx(a, i, j)), b.at_c(idx(b, i, j))));
        }
    }
    Ok(Arr::from_c(r, c, &out))
}

fn cpow(a: C64, b: C64) -> C64 {
    if a.re == 0.0 && a.im == 0.0 {
        return if b.re == 0.0 && b.im == 0.0 { C64::ONE } else { C64::ZERO };
    }
    let ln = C64::new(a.abs().ln(), a.arg());
    (ln * b).exp()
}

pub fn matmul(a: &Arr, b: &Arr) -> R<Arr> {
    if a.len() == 1 || b.len() == 1 {
        return binary(Bin::EMul, a, b);
    }
    if a.c != b.r {
        return Err(format!("inner matrix dimensions must agree: {}×{} * {}×{}", a.r, a.c, b.r, b.c));
    }
    if a.is_complex() || b.is_complex() {
        let mut out = vec![C64::ZERO; a.r * b.c];
        for j in 0..b.c {
            for k in 0..a.c {
                let bk = b.at_c(j * b.r + k);
                for i in 0..a.r {
                    out[j * a.r + i] = out[j * a.r + i] + a.at_c(k * a.r + i) * bk;
                }
            }
        }
        return Ok(Arr::from_c(a.r, b.c, &out));
    }
    let mut re = vec![0.0; a.r * b.c];
    for j in 0..b.c {
        for k in 0..a.c {
            let bk = b.re[j * b.r + k];
            if bk == 0.0 {
                continue;
            }
            for i in 0..a.r {
                re[j * a.r + i] += a.re[k * a.r + i] * bk;
            }
        }
    }
    Ok(Arr::new(a.r, b.c, re))
}

/// A \ B: exact solve for square A, least squares otherwise (real).
pub fn left_divide(a: &Arr, b: &Arr) -> R<Arr> {
    if a.len() == 1 {
        return binary(Bin::ELDiv, a, b);
    }
    if a.r != b.r {
        return Err(format!("A\\B needs the same number of rows: {}×{} and {}×{}", a.r, a.c, b.r, b.c));
    }
    if a.is_complex() || b.is_complex() {
        return complex_solve(a, b);
    }
    let am = a.to_rows();
    let mut out = Arr::zeros(a.c, b.c);
    for j in 0..b.c {
        let col: Vec<f64> = (0..b.r).map(|i| b.get(i, j)).collect();
        let x = if a.r == a.c {
            match crate::linalg::solve(&am, &col) {
                Ok(x) => x,
                Err(_) => crate::linalg::lstsq(&am, &col).map(|v| v.0).map_err(|_| "the matrix is singular".to_string())?,
            }
        } else if a.r > a.c {
            crate::linalg::lstsq(&am, &col)?.0
        } else {
            // Under-determined: the minimum-norm solution Aᵀ(AAᵀ)⁻¹b.
            let at = crate::linalg::transpose(&am);
            let aat = crate::linalg::matmul(&am, &at);
            let y = crate::linalg::solve(&aat, &col)?;
            crate::linalg::matvec(&at, &y)
        };
        for i in 0..a.c {
            out.re[j * a.c + i] = x[i];
        }
    }
    Ok(out)
}

fn complex_solve(a: &Arr, b: &Arr) -> R<Arr> {
    if a.r != a.c {
        return Err("complex A\\B needs a square A".into());
    }
    let n = a.r;
    let mut m: Vec<Vec<C64>> = (0..n).map(|i| (0..n).map(|j| a.at_c(j * n + i)).collect()).collect();
    let mut rhs: Vec<Vec<C64>> = (0..n).map(|i| (0..b.c).map(|j| b.at_c(j * n + i)).collect()).collect();
    for c in 0..n {
        let p = (c..n).max_by(|&x, &y| m[x][c].abs().partial_cmp(&m[y][c].abs()).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
        if m[p][c].abs() < 1e-300 {
            return Err("the matrix is singular".into());
        }
        m.swap(c, p);
        rhs.swap(c, p);
        for r in c + 1..n {
            let f = m[r][c] / m[c][c];
            for k in c..n {
                let v = m[c][k];
                m[r][k] = m[r][k] - f * v;
            }
            for k in 0..b.c {
                let v = rhs[c][k];
                rhs[r][k] = rhs[r][k] - f * v;
            }
        }
    }
    let mut x = vec![vec![C64::ZERO; b.c]; n];
    for r in (0..n).rev() {
        for k in 0..b.c {
            let mut s = rhs[r][k];
            for q in r + 1..n {
                s = s - m[r][q] * x[q][k];
            }
            x[r][k] = s / m[r][r];
        }
    }
    let flat: Vec<C64> = (0..b.c).flat_map(|k| (0..n).map(move |r| (r, k))).map(|(r, k)| x[r][k]).collect();
    Ok(Arr::from_c(n, b.c, &flat))
}

pub fn matpow(a: &Arr, b: &Arr) -> R<Arr> {
    if a.len() == 1 && b.len() == 1 {
        return binary(Bin::EPow, a, b);
    }
    if b.len() == 1 && a.r == a.c && !b.is_complex() && b.re[0].fract() == 0.0 {
        let mut p = b.re[0] as i64;
        let mut base = if p < 0 {
            p = -p;
            let inv = crate::linalg::inverse(&a.to_rows())?;
            Arr::from_rows(&inv)
        } else {
            a.clone()
        };
        let mut result = Arr::from_rows(&crate::linalg::identity(a.r));
        while p > 0 {
            if p & 1 == 1 {
                result = matmul(&result, &base)?;
            }
            base = matmul(&base, &base)?;
            p >>= 1;
        }
        return Ok(result);
    }
    Err("A^p needs a square A and a whole-number p here (use .^ for element-wise powers)".into())
}

pub fn binary(op: Bin, a: &Arr, b: &Arr) -> R<Arr> {
    let complex = a.is_complex() || b.is_complex();
    let cmp = |f: &dyn Fn(f64, f64) -> bool| -> R<Arr> {
        let mut out = elementwise(a, b, &|x, y| if f(x, y) { 1.0 } else { 0.0 })?;
        out.logical = true;
        Ok(out)
    };
    match op {
        Bin::Add if complex => elementwise_c(a, b, &|x, y| x + y),
        Bin::Sub if complex => elementwise_c(a, b, &|x, y| x - y),
        Bin::EMul if complex => elementwise_c(a, b, &|x, y| x * y),
        Bin::EDiv if complex => elementwise_c(a, b, &|x, y| x / y),
        Bin::ELDiv if complex => elementwise_c(a, b, &|x, y| y / x),
        Bin::Add => elementwise(a, b, &|x, y| x + y),
        Bin::Sub => elementwise(a, b, &|x, y| x - y),
        Bin::EMul => elementwise(a, b, &|x, y| x * y),
        Bin::EDiv => elementwise(a, b, &|x, y| x / y),
        Bin::ELDiv => elementwise(a, b, &|x, y| y / x),
        Bin::EPow => {
            // Negative bases with fractional exponents go complex.
            let goes_complex = complex || a.re.iter().any(|x| *x < 0.0) && b.re.iter().any(|y| y.fract() != 0.0);
            if goes_complex {
                elementwise_c(a, b, &cpow)
            } else {
                elementwise(a, b, &|x, y| x.powf(y))
            }
        }
        Bin::Mul => matmul(a, b),
        Bin::Div => {
            if b.len() == 1 {
                binary(Bin::EDiv, a, b)
            } else {
                // A / B = (Bᵀ \ Aᵀ)ᵀ
                Ok(left_divide(&b.transpose(false), &a.transpose(false))?.transpose(false))
            }
        }
        Bin::LDiv => left_divide(a, b),
        Bin::Pow => matpow(a, b),
        Bin::Eq if complex => {
            let mut o = elementwise_c(a, b, &|x, y| if x == y { C64::ONE } else { C64::ZERO })?;
            o.logical = true;
            Ok(o)
        }
        Bin::Ne if complex => {
            let mut o = elementwise_c(a, b, &|x, y| if x != y { C64::ONE } else { C64::ZERO })?;
            o.logical = true;
            Ok(o)
        }
        Bin::Eq => cmp(&|x, y| x == y),
        Bin::Ne => cmp(&|x, y| x != y),
        Bin::Lt => cmp(&|x, y| x < y),
        Bin::Le => cmp(&|x, y| x <= y),
        Bin::Gt => cmp(&|x, y| x > y),
        Bin::Ge => cmp(&|x, y| x >= y),
        Bin::And => cmp(&|x, y| x != 0.0 && y != 0.0),
        Bin::Or => cmp(&|x, y| x != 0.0 || y != 0.0),
        Bin::AndAnd | Bin::OrOr => unreachable!(),
    }
}

pub fn negate(a: &Arr) -> Arr {
    Arr { r: a.r, c: a.c, re: a.re.iter().map(|v| -v).collect(), im: a.im.as_ref().map(|im| im.iter().map(|v| -v).collect()), logical: false }
}

/// Applies a real function element-wise (complex inputs use `fc` when given).
pub fn map(a: &Arr, f: &dyn Fn(f64) -> f64) -> Arr {
    Arr::new(a.r, a.c, a.re.iter().map(|v| f(*v)).collect())
}

pub fn map_c(a: &Arr, f: &dyn Fn(C64) -> C64) -> Arr {
    let v: Vec<C64> = a.to_c().into_iter().map(f).collect();
    Arr::from_c(a.r, a.c, &v)
}

// ───────────────────────── display

pub fn format_num(v: f64) -> String {
    if v.is_nan() {
        "NaN".into()
    } else if v.is_infinite() {
        if v > 0.0 { "Inf".into() } else { "-Inf".into() }
    } else if v.fract() == 0.0 && v.abs() < 1e15 {
        format!("{}", v as i64)
    } else {
        let a = v.abs();
        if (1e-4..1e5).contains(&a) {
            let s = format!("{v:.4}");
            s
        } else {
            format!("{v:.4e}")
        }
    }
}

fn format_c(re: f64, im: f64) -> String {
    let sign = if im < 0.0 || (im == 0.0 && im.is_sign_negative()) { "-" } else { "+" };
    format!("{} {sign} {}i", format_num(re), format_num(im.abs()))
}

/// MATLAB-style display of a value.
pub fn display(name: &str, v: &Value) -> String {
    match v {
        Value::Num(a) => {
            if a.is_empty() {
                return format!("{name} =\n\n     []\n");
            }
            if a.len() == 1 {
                let s = match &a.im {
                    Some(im) => format_c(a.re[0], im[0]),
                    None => format_num(a.re[0]),
                };
                return format!("{name} = {s}\n");
            }
            let cells: Vec<Vec<String>> = (0..a.r).map(|i| (0..a.c).map(|j| {
                let k = j * a.r + i;
                match &a.im {
                    Some(im) => format_c(a.re[k], im[k]),
                    None => format_num(a.re[k]),
                }
            }).collect()).collect();
            let w = cells.iter().flatten().map(|s| s.len()).max().unwrap_or(1) + 3;
            let mut out = format!("{name} =\n\n");
            let show_rows = a.r.min(40);
            for row in cells.iter().take(show_rows) {
                for s in row.iter().take(30) {
                    out.push_str(&format!("{s:>w$}"));
                }
                if row.len() > 30 {
                    out.push_str("  …");
                }
                out.push('\n');
            }
            if a.r > show_rows {
                out.push_str(&format!("   … ({} rows)\n", a.r));
            }
            out
        }
        Value::Str(s) => format!("{name} = '{s}'\n"),
        Value::Cell { r, c, items } => {
            let mut out = format!("{name} =\n  {r}×{c} cell array\n");
            for it in items.iter().take(20) {
                out.push_str(&format!("    {}\n", short(it)));
            }
            out
        }
        Value::Struct { r, c, fields, items } => {
            if items.len() == 1 {
                let mut out = format!("{name} = struct with fields:\n");
                for (f, v) in fields.iter().zip(&items[0]) {
                    out.push_str(&format!("    {f}: {}\n", short(v)));
                }
                out
            } else {
                format!("{name} = {r}×{c} struct array with fields: {}\n", fields.join(", "))
            }
        }
        Value::Func(f) => format!("{name} = {}\n", func_text(f)),
    }
}

pub fn func_text(f: &Func) -> String {
    match f {
        Func::Named(n) => format!("@{n}"),
        Func::User(u) => format!("@{}", u.name),
        Func::Anon { params, .. } => format!("@({}) …", params.join(", ")),
    }
}

/// A one-line summary (cells and struct fields).
pub fn short(v: &Value) -> String {
    match v {
        Value::Num(a) if a.len() == 1 => match &a.im {
            Some(im) => format_c(a.re[0], im[0]),
            None => format_num(a.re[0]),
        },
        Value::Num(a) if a.len() <= 8 && (a.r == 1 || a.c == 1) && a.im.is_none() => format!("[{}]", a.re.iter().map(|v| format_num(*v)).collect::<Vec<_>>().join(" ")),
        Value::Num(a) => format!("[{}×{} {}]", a.r, a.c, if a.logical { "logical" } else { "double" }),
        Value::Str(s) => format!("'{s}'"),
        Value::Cell { r, c, .. } => format!("{{{r}×{c} cell}}"),
        Value::Struct { r, c, .. } => format!("[{r}×{c} struct]"),
        Value::Func(f) => func_text(f),
    }
}
