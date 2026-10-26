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
    /// All the dimensions when there are three or more (r × c is then the folded
    /// view: rows × everything else, MATLAB's column-major layout); empty for 2-D.
    pub nd: Vec<usize>,
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
    /// An object: a Control System Toolbox model or an instance of a classdef class.
    Obj(Rc<Object>),
}

#[derive(Debug)]
pub struct Object {
    pub class: String,
    pub data: ObjData,
}

#[derive(Debug)]
pub enum ObjData {
    Lti(super::lti::Lti),
    User(super::classes::Instance),
    /// Graphics handles (one or more: a graphics array).
    Gfx(Vec<super::graphics::GRef>),
}

pub type R<T> = Result<T, String>;

impl Arr {
    pub fn new(r: usize, c: usize, re: Vec<f64>) -> Arr {
        Arr { r, c, re, im: None, logical: false, nd: Vec::new() }
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
        let mut a = Arr { r, c, re, im: Some(im), logical: false, nd: Vec::new() };
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
        Arr { r: self.c, c: self.r, re, im, logical: self.logical, nd: Vec::new() }
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
    /// The dimensions as MATLAB reports them (at least two).
    pub fn dims(&self) -> Vec<usize> {
        if self.nd.is_empty() { vec![self.r, self.c] } else { self.nd.clone() }
    }

    /// Sets the dimensions (trailing singletons beyond the second are dropped).
    pub fn set_dims(&mut self, dims: &[usize]) {
        let mut d: Vec<usize> = dims.to_vec();
        while d.len() > 2 && *d.last().unwrap() == 1 {
            d.pop();
        }
        while d.len() < 2 {
            d.push(1);
        }
        self.r = d[0];
        self.c = d[1..].iter().product();
        self.nd = if d.len() > 2 { d } else { Vec::new() };
    }

    pub fn with_dims(re: Vec<f64>, dims: &[usize]) -> Arr {
        let mut a = Arr::new(0, 0, re);
        a.set_dims(dims);
        a
    }

    pub fn boolean(r: usize, c: usize, v: Vec<bool>) -> Arr {
        Arr { r, c, re: v.into_iter().map(|b| if b { 1.0 } else { 0.0 }).collect(), im: None, logical: true, nd: Vec::new() }
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
            Value::Obj(_) => "object",
        }
    }
    pub fn dims(&self) -> (usize, usize) {
        match self {
            Value::Num(a) => (a.r, a.c),
            Value::Str(s) => (if s.is_empty() { 0 } else { 1 }, s.chars().count()),
            Value::Cell { r, c, .. } | Value::Struct { r, c, .. } => (*r, *c),
            Value::Obj(o) => match &o.data {
                ObjData::Gfx(r) => (if r.is_empty() { 0 } else { 1 }, r.len()),
                _ => (1, 1),
            },
            Value::Func(_) => (1, 1),
        }
    }
    pub fn numel(&self) -> usize {
        let (r, c) = self.dims();
        r * c
    }
    /// All the dimensions (numeric arrays can have more than two).
    pub fn full_dims(&self) -> Vec<usize> {
        match self {
            Value::Num(a) => a.dims(),
            _ => {
                let (r, c) = self.dims();
                vec![r, c]
            }
        }
    }
    /// As a numeric array (char → codes).
    pub fn arr(&self) -> R<Arr> {
        match self {
            Value::Num(a) => Ok(a.clone()),
            Value::Str(s) => Ok(Arr::row(s.chars().map(|c| c as u32 as f64).collect())),
            Value::Cell { .. } => Err("a cell array cannot be used as a number (use {} to get its contents)".into()),
            Value::Struct { .. } => Err("a structure cannot be used as a number".into()),
            Value::Func(_) => Err("a function handle cannot be used as a number (call it with ( ))".into()),
            Value::Obj(o) => Err(format!("a {} object cannot be used as a number", o.class)),
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

/// The extents n subscripts see: missing dimensions are 1, the last subscript folds the rest.
pub fn fold_dims(d: &[usize], n: usize) -> Vec<usize> {
    let mut e: Vec<usize> = (0..n).map(|k| *d.get(k).unwrap_or(&1)).collect();
    if d.len() > n && n > 0 {
        e[n - 1] = d[n - 1..].iter().product();
    }
    e
}

/// Linear positions of every combination of subscripts (the first varies fastest).
pub fn nd_positions(e: &[usize], subs: &[Vec<usize>]) -> Vec<usize> {
    let st = strides(e);
    let total: usize = subs.iter().map(|s| s.len()).product();
    let mut out = Vec::with_capacity(total);
    if total == 0 {
        return out;
    }
    let mut ctr = vec![0usize; subs.len()];
    loop {
        out.push(ctr.iter().enumerate().map(|(k, &c)| subs[k][c] * st[k]).sum());
        let mut k = 0;
        loop {
            if k == ctr.len() {
                return out;
            }
            ctr[k] += 1;
            if ctr[k] < subs[k].len() {
                break;
            }
            ctr[k] = 0;
            k += 1;
        }
    }
}

/// Strides of a column-major array.
pub fn strides(d: &[usize]) -> Vec<usize> {
    let mut s = vec![1; d.len()];
    for k in 1..d.len() {
        s[k] = s[k - 1] * d[k - 1];
    }
    s
}

/// The output dimensions of implicit expansion across any number of dimensions.
fn broadcast_nd(a: &[usize], b: &[usize]) -> R<Vec<usize>> {
    let n = a.len().max(b.len());
    (0..n)
        .map(|k| {
            let (x, y) = (*a.get(k).unwrap_or(&1), *b.get(k).unwrap_or(&1));
            if x == y || y == 1 {
                Ok(x)
            } else if x == 1 {
                Ok(y)
            } else {
                Err(format!("sizes do not match: {} and {}", a.iter().map(|v| v.to_string()).collect::<Vec<_>>().join("×"), b.iter().map(|v| v.to_string()).collect::<Vec<_>>().join("×")))
            }
        })
        .collect()
}

/// For every output element, the linear indices into a and b (singleton dimensions repeat).
fn nd_pairs(da: &[usize], db: &[usize], out: &[usize]) -> Vec<(usize, usize)> {
    let (sa, sb) = (strides(da), strides(db));
    let total: usize = out.iter().product();
    let mut sub = vec![0usize; out.len()];
    let mut pairs = Vec::with_capacity(total);
    for _ in 0..total {
        let (mut ia, mut ib) = (0, 0);
        for k in 0..out.len() {
            if *da.get(k).unwrap_or(&1) > 1 {
                ia += sub[k] * sa[k];
            }
            if *db.get(k).unwrap_or(&1) > 1 {
                ib += sub[k] * sb[k];
            }
        }
        pairs.push((ia, ib));
        for k in 0..out.len() {
            sub[k] += 1;
            if sub[k] < out[k] {
                break;
            }
            sub[k] = 0;
        }
    }
    pairs
}

/// Element-wise with implicit expansion.
pub fn elementwise(a: &Arr, b: &Arr, f: &dyn Fn(f64, f64) -> f64) -> R<Arr> {
    if !a.nd.is_empty() || !b.nd.is_empty() {
        let (da, db) = (a.dims(), b.dims());
        let out = broadcast_nd(&da, &db)?;
        let re = nd_pairs(&da, &db, &out).into_iter().map(|(i, j)| f(a.re[i], b.re[j])).collect();
        return Ok(Arr::with_dims(re, &out));
    }
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
    if !a.nd.is_empty() || !b.nd.is_empty() {
        let (da, db) = (a.dims(), b.dims());
        let out = broadcast_nd(&da, &db)?;
        let v: Vec<C64> = nd_pairs(&da, &db, &out).into_iter().map(|(i, j)| f(a.at_c(i), b.at_c(j))).collect();
        let mut r = Arr::from_c(1, v.len(), &v);
        let im = r.im.take();
        let mut r2 = Arr::with_dims(r.re, &out);
        r2.im = im;
        return Ok(r2);
    }
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
    if !a.nd.is_empty() || !b.nd.is_empty() {
        return Err("matrix multiplication needs 2-D arrays; use .* or pagemtimes for N-D arrays".into());
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
    Arr { r: a.r, c: a.c, re: a.re.iter().map(|v| -v).collect(), im: a.im.as_ref().map(|im| im.iter().map(|v| -v).collect()), logical: false, nd: a.nd.clone() }
}

/// Applies a real function element-wise (complex inputs use `fc` when given).
pub fn map(a: &Arr, f: &dyn Fn(f64) -> f64) -> Arr {
    let mut out = Arr::new(a.r, a.c, a.re.iter().map(|v| f(*v)).collect());
    out.nd = a.nd.clone();
    out
}

pub fn map_c(a: &Arr, f: &dyn Fn(C64) -> C64) -> Arr {
    let v: Vec<C64> = a.to_c().into_iter().map(f).collect();
    let mut out = Arr::from_c(a.r, a.c, &v);
    out.nd = a.nd.clone();
    out
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
            if !a.nd.is_empty() {
                // One page per index of the third and later dimensions.
                let d = a.nd.clone();
                let page = d[0] * d[1];
                let pages = a.len() / page.max(1);
                let mut out = String::new();
                for p in 0..pages.min(50) {
                    let mut rest = p;
                    let mut subs = Vec::new();
                    for &k in &d[2..] {
                        subs.push(rest % k + 1);
                        rest /= k;
                    }
                    let mut pa = Arr::new(d[0], d[1], a.re[p * page..(p + 1) * page].to_vec());
                    pa.im = a.im.as_ref().map(|im| im[p * page..(p + 1) * page].to_vec());
                    pa.logical = a.logical;
                    let label = format!("{name}(:,:,{})", subs.iter().map(|s| s.to_string()).collect::<Vec<_>>().join(","));
                    out.push_str(&display(&label, &Value::Num(pa)));
                    out.push('\n');
                }
                return out;
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
        Value::Obj(o) => match &o.data {
            ObjData::Lti(g) => super::lti::display(name, g),
            ObjData::User(i) => super::classes::display_instance(name, i),
            ObjData::Gfx(r) => format!("{name} = \n\n  {}×{} {}\n", if r.is_empty() { 0 } else { 1 }, r.len(), o.class),
        },
    }
}

pub fn func_text(f: &Func) -> String {
    match f {
        Func::Named(n) => format!("@{n}"),
        Func::User(u) => format!("@{}", u.name),
        Func::Anon { params, body, .. } => format!("@({}) {}", params.join(", "), super::session::expr_src(body)),
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
        Value::Obj(o) => format!("[1×1 {}]", o.class),
    }
}
