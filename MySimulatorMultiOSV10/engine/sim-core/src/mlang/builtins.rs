//! The M language's built-in functions: constants, array construction and
//! shape, element-wise math (complex aware), reductions, linear algebra,
//! polynomials, interpolation and numerical integration, ODE solvers
//! (ode45, ode23, ode15s, ode23s), optimisation (fzero, fminsearch, fminbnd,
//! fsolve), signal processing (fft, filter, butter …), control design (lqr,
//! place …), statistics, strings and formatted output, cells and structures,
//! MAT-file load/save, and plotting into figures.

use super::interp::{concat, index_value, range, Figure, Interp, Series, Surface};
use super::value::*;
use crate::fft::{fft as fft_in_place, C64};
use std::f64::consts::PI;

type Out = R<Vec<Value>>;

fn one(v: Value) -> Out {
    Ok(vec![v])
}

fn num(v: f64) -> Out {
    one(Value::num(v))
}

fn arg(args: &[Value], k: usize, f: &str) -> R<Value> {
    args.get(k).cloned().ok_or_else(|| format!("{f}: not enough input arguments"))
}

fn arr(args: &[Value], k: usize, f: &str) -> R<Arr> {
    arg(args, k, f)?.arr().map_err(|e| format!("{f}: {e}"))
}

fn scalar(args: &[Value], k: usize, f: &str) -> R<f64> {
    arg(args, k, f)?.scalar().map_err(|e| format!("{f}: {e}"))
}

fn text(args: &[Value], k: usize, f: &str) -> R<String> {
    arg(args, k, f)?.text().map_err(|e| format!("{f}: {e}"))
}

/// Size arguments: f(n), f(r, c), f([r c]).
fn size_args(args: &[Value], f: &str) -> R<(usize, usize)> {
    let nums: Vec<&Value> = args.iter().filter(|a| !matches!(a, Value::Str(_))).collect();
    match nums.len() {
        0 => Ok((1, 1)),
        1 => {
            let a = nums[0].arr()?;
            if a.len() >= 2 {
                Ok((a.re[0].max(0.0) as usize, a.re[1].max(0.0) as usize))
            } else {
                let n = a.re.first().copied().unwrap_or(0.0).max(0.0) as usize;
                Ok((n, n))
            }
        }
        _ => Ok((nums[0].scalar().map_err(|e| format!("{f}: {e}"))?.max(0.0) as usize, nums[1].scalar().map_err(|e| format!("{f}: {e}"))?.max(0.0) as usize)),
    }
}

/// The dimension a reduction works along: given, or the first non-singleton.
fn dim_of(a: &Arr, args: &[Value], k: usize) -> R<usize> {
    match args.get(k) {
        Some(Value::Str(_)) | None => Ok(if a.r == 1 { 2 } else { 1 }),
        Some(v) => {
            let d = v.usize()?;
            if d == 0 {
                return Err("the dimension must be 1 or 2".into());
            }
            Ok(d)
        }
    }
}

/// Applies f to every column (dim 1) or row (dim 2).
fn reduce(a: &Arr, dim: usize, f: &dyn Fn(&[f64]) -> f64) -> Arr {
    if dim == 1 {
        let out: Vec<f64> = (0..a.c).map(|j| f(&a.re[j * a.r..(j + 1) * a.r])).collect();
        Arr::new(if a.r == 0 && a.c == 0 { 1 } else { 1 }, a.c.max(if a.r == 0 && a.c == 0 { 1 } else { 0 }), if a.r == 0 && a.c == 0 { vec![f(&[])] } else { out })
    } else if dim == 2 {
        let out: Vec<f64> = (0..a.r).map(|i| {
            let row: Vec<f64> = (0..a.c).map(|j| a.re[j * a.r + i]).collect();
            f(&row)
        }).collect();
        Arr::new(a.r, 1, out)
    } else {
        a.clone()
    }
}

/// Running operation down columns or along rows (cumsum …).
fn running(a: &Arr, dim: usize, f: &dyn Fn(&[f64]) -> Vec<f64>) -> Arr {
    let mut out = a.clone();
    out.logical = false;
    out.im = None;
    if dim == 1 {
        for j in 0..a.c {
            let v = f(&a.re[j * a.r..(j + 1) * a.r]);
            out.re[j * a.r..(j + 1) * a.r].copy_from_slice(&v);
        }
    } else {
        for i in 0..a.r {
            let row: Vec<f64> = (0..a.c).map(|j| a.re[j * a.r + i]).collect();
            let v = f(&row);
            for j in 0..a.c {
                out.re[j * a.r + i] = v[j];
            }
        }
    }
    out
}

fn sorted(v: &[f64]) -> Vec<f64> {
    let mut s: Vec<f64> = v.iter().copied().filter(|x| !x.is_nan()).collect();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    s
}

fn median(v: &[f64]) -> f64 {
    let s = sorted(v);
    if s.is_empty() {
        return f64::NAN;
    }
    let n = s.len();
    if n % 2 == 1 { s[n / 2] } else { 0.5 * (s[n / 2 - 1] + s[n / 2]) }
}

fn variance(v: &[f64], w: f64) -> f64 {
    let n = v.len() as f64;
    if v.is_empty() {
        return f64::NAN;
    }
    if n == 1.0 {
        return 0.0;
    }
    let m = v.iter().sum::<f64>() / n;
    v.iter().map(|x| (x - m).powi(2)).sum::<f64>() / if w == 1.0 { n } else { n - 1.0 }
}

fn bool_arr(a: &Arr, f: &dyn Fn(f64) -> bool) -> Value {
    Value::Num(Arr::boolean(a.r, a.c, a.re.iter().map(|v| f(*v)).collect()))
}

/// A column if the input was a column, else a row.
fn like(orig: &Arr, v: Vec<f64>) -> Value {
    if orig.c == 1 && orig.r > 1 {
        Value::col(v)
    } else {
        Value::row(v)
    }
}

fn str_cell(items: Vec<String>, row: bool) -> Value {
    let n = items.len();
    let items: Vec<Value> = items.into_iter().map(Value::Str).collect();
    if row { Value::Cell { r: 1, c: n, items } } else { Value::Cell { r: n, c: 1, items } }
}

fn cell_strings(v: &Value) -> R<Vec<String>> {
    match v {
        Value::Cell { items, .. } => items.iter().map(|x| x.text()).collect(),
        Value::Str(s) => Ok(vec![s.clone()]),
        other => Err(format!("expected text or a cell array of text, got a {}", other.class())),
    }
}

// ───────────────────────── formatted text

/// sprintf / fprintf: the format is reused while arguments remain (MATLAB style).
pub fn sprintf(fmt: &str, args: &[Value]) -> R<String> {
    // Flatten the arguments into a queue of numbers or strings.
    enum A {
        N(f64),
        S(String),
    }
    let mut queue: Vec<A> = Vec::new();
    for a in args {
        match a {
            Value::Str(s) => queue.push(A::S(s.clone())),
            Value::Cell { items, .. } => {
                for it in items {
                    match it {
                        Value::Str(s) => queue.push(A::S(s.clone())),
                        other => queue.extend(other.arr()?.re.into_iter().map(A::N)),
                    }
                }
            }
            other => queue.extend(other.arr()?.re.into_iter().map(A::N)),
        }
    }
    let unescape = |s: &str| s.replace("\\n", "\n").replace("\\t", "\t").replace("\\\\", "\\").replace("\\r", "\r");
    let f: Vec<char> = unescape(fmt).chars().collect();
    let mut out = String::new();
    let mut qi = 0;
    loop {
        let mut used = false;
        let mut i = 0;
        while i < f.len() {
            if f[i] != '%' {
                out.push(f[i]);
                i += 1;
                continue;
            }
            if f.get(i + 1) == Some(&'%') {
                out.push('%');
                i += 2;
                continue;
            }
            // %[flags][width][.prec]conv
            let s = i;
            i += 1;
            while i < f.len() && "-+ 0#".contains(f[i]) {
                i += 1;
            }
            while i < f.len() && (f[i].is_ascii_digit() || f[i] == '.' || f[i] == '*') {
                i += 1;
            }
            let conv = *f.get(i).unwrap_or(&'s');
            i += 1;
            let spec: String = f[s + 1..i - 1].iter().collect();
            if qi >= queue.len() {
                if qi == 0 && !used && queue.is_empty() {
                    // No arguments: an empty conversion.
                    continue;
                }
                return Ok(out);
            }
            used = true;
            let item = &queue[qi];
            qi += 1;
            out.push_str(&format_one(&spec, conv, item_val(item))?);
        }
        if qi >= queue.len() || !used {
            break;
        }
    }
    return Ok(out);

    fn item_val(a: &A) -> Result<f64, String> {
        match a {
            A::N(v) => Ok(*v),
            A::S(s) => Err(s.clone()),
        }
    }
}

fn format_one(spec: &str, conv: char, v: Result<f64, String>) -> R<String> {
    let left = spec.contains('-');
    let plus = spec.contains('+');
    let zero = spec.starts_with('0') || spec.contains("-0") || spec.contains("+0");
    let digits: String = spec.trim_start_matches(['-', '+', ' ', '0', '#']).to_string();
    let (w, p) = match digits.split_once('.') {
        Some((a, b)) => (a.parse::<usize>().ok(), b.parse::<usize>().ok()),
        None => (digits.parse::<usize>().ok(), None),
    };
    let body = match (conv, &v) {
        ('s', Ok(x)) => format_num(*x),
        ('s', Err(s)) | ('c', Err(s)) => {
            let s = s.clone();
            match p {
                Some(p) => s.chars().take(p).collect(),
                None => s,
            }
        }
        ('c', Ok(x)) => char::from_u32(*x as u32).map(|c| c.to_string()).unwrap_or_default(),
        (_, Err(s)) => s.clone(),
        ('d' | 'i' | 'u', Ok(x)) => {
            if x.fract() != 0.0 {
                // MATLAB prints non-integers given to %d in %e form.
                format!("{x:e}")
            } else {
                let s = format!("{}", *x as i64);
                if plus && *x >= 0.0 { format!("+{s}") } else { s }
            }
        }
        ('f' | 'F', Ok(x)) => {
            let s = if x.is_finite() { format!("{:.*}", p.unwrap_or(6), x) } else { format_num(*x) };
            if plus && *x >= 0.0 { format!("+{s}") } else { s }
        }
        ('e' | 'E', Ok(x)) => {
            let s = format!("{:.*e}", p.unwrap_or(6), x);
            // Rust writes 1.5e3; C writes 1.500000e+03.
            let s = match s.split_once('e') {
                Some((m, e)) => {
                    let ev: i32 = e.parse().unwrap_or(0);
                    format!("{m}e{}{:02}", if ev < 0 { '-' } else { '+' }, ev.abs())
                }
                None => s,
            };
            let s = if conv == 'E' { s.to_uppercase() } else { s };
            if plus && *x >= 0.0 { format!("+{s}") } else { s }
        }
        ('g' | 'G', Ok(x)) => {
            let prec = p.unwrap_or(6).max(1);
            if *x == 0.0 {
                "0".into()
            } else if !x.is_finite() {
                format_num(*x)
            } else {
                let e = x.abs().log10().floor() as i32;
                if e < -4 || e >= prec as i32 {
                    let s = format!("{:.*e}", prec - 1, x);
                    let (m, ex) = s.split_once('e').unwrap();
                    let m = if m.contains('.') { m.trim_end_matches('0').trim_end_matches('.') } else { m };
                    let ev: i32 = ex.parse().unwrap_or(0);
                    format!("{m}e{}{:02}", if ev < 0 { '-' } else { '+' }, ev.abs())
                } else {
                    let s = format!("{:.*}", (prec as i32 - 1 - e).max(0) as usize, x);
                    if s.contains('.') { s.trim_end_matches('0').trim_end_matches('.').to_string() } else { s }
                }
            }
        }
        ('x', Ok(x)) => format!("{:x}", *x as i64),
        ('X', Ok(x)) => format!("{:X}", *x as i64),
        ('o', Ok(x)) => format!("{:o}", *x as i64),
        (other, _) => return Err(format!("sprintf: unknown conversion %{other}")),
    };
    let width = w.unwrap_or(0);
    let len = body.chars().count();
    if len >= width {
        return Ok(body);
    }
    let pad = width - len;
    Ok(if left {
        format!("{body}{}", " ".repeat(pad))
    } else if zero && conv != 's' && conv != 'c' {
        let (sign, digits) = if body.starts_with('-') || body.starts_with('+') { body.split_at(1) } else { ("", body.as_str()) };
        format!("{sign}{}{digits}", "0".repeat(pad))
    } else {
        format!("{}{body}", " ".repeat(pad))
    })
}

fn num2str(v: &Value, args: &[Value]) -> R<String> {
    match v {
        Value::Str(s) => Ok(s.clone()),
        _ => {
            let a = v.arr()?;
            if let Some(fmt) = args.get(1) {
                if let Value::Str(f) = fmt {
                    return sprintf(f, &[v.clone()]);
                }
                let prec = fmt.usize()?;
                return Ok(a.re.iter().map(|x| format_one("", 'g', Ok(*x)).map(|_| sprintf(&format!("%.{prec}g"), &[Value::num(*x)]).unwrap_or_default()).unwrap_or_default()).collect::<Vec<_>>().join("  "));
            }
            let one = |x: f64, im: Option<f64>| {
                let base = if x.fract() == 0.0 && x.abs() < 1e15 { format!("{}", x as i64) } else { sprintf("%.5g", &[Value::num(x)]).unwrap_or_default() };
                match im {
                    Some(i) => format!("{base}{}{}i", if i < 0.0 { "-" } else { "+" }, sprintf("%.5g", &[Value::num(i.abs())]).unwrap_or_default()),
                    None => base,
                }
            };
            let rows: Vec<String> = (0..a.r).map(|i| (0..a.c).map(|j| one(a.re[j * a.r + i], a.im.as_ref().map(|im| im[j * a.r + i]))).collect::<Vec<_>>().join("  ")).collect();
            Ok(rows.join("\n"))
        }
    }
}

fn mat2str(v: &Value) -> R<String> {
    match v {
        Value::Str(s) => Ok(format!("'{s}'")),
        _ => {
            let a = v.arr()?;
            let f = |x: f64| if a.logical { if x != 0.0 { "true".to_string() } else { "false".to_string() } } else { sprintf("%.15g", &[Value::num(x)]).unwrap_or_default() };
            if a.len() == 1 {
                return Ok(f(a.re[0]));
            }
            let rows: Vec<String> = (0..a.r).map(|i| (0..a.c).map(|j| f(a.re[j * a.r + i])).collect::<Vec<_>>().join(" ")).collect();
            Ok(format!("[{}]", rows.join(";")))
        }
    }
}

// ───────────────────────── numerical helpers

fn interp1(x: &[f64], y: &[f64], xi: &[f64], method: &str, extrap: Option<f64>) -> R<Vec<f64>> {
    let n = x.len();
    if n != y.len() || n < 2 {
        return Err("interp1: x and y need the same length (2 or more)".into());
    }
    // Sort by x.
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| x[a].partial_cmp(&x[b]).unwrap_or(std::cmp::Ordering::Equal));
    let xs: Vec<f64> = order.iter().map(|&k| x[k]).collect();
    let ys: Vec<f64> = order.iter().map(|&k| y[k]).collect();
    let find = |t: f64| -> usize {
        match xs.binary_search_by(|v| v.partial_cmp(&t).unwrap_or(std::cmp::Ordering::Less)) {
            Ok(i) => i.min(n - 2),
            Err(i) => i.saturating_sub(1).min(n - 2),
        }
    };
    let outside = |t: f64| t < xs[0] || t > xs[n - 1];
    let fill = extrap.unwrap_or(f64::NAN);
    let extrapolate = extrap.is_some_and(|v| v.is_nan() == false && v == f64::INFINITY);
    match method {
        "linear" | "" => Ok(xi.iter().map(|&t| {
            if outside(t) && !extrapolate {
                return fill;
            }
            let i = find(t);
            let f = (t - xs[i]) / (xs[i + 1] - xs[i]);
            ys[i] + f * (ys[i + 1] - ys[i])
        }).collect()),
        "nearest" => Ok(xi.iter().map(|&t| {
            if outside(t) && !extrapolate {
                return fill;
            }
            let i = find(t);
            if t - xs[i] < xs[i + 1] - t { ys[i] } else { ys[i + 1] }
        }).collect()),
        "previous" => Ok(xi.iter().map(|&t| if outside(t) && !extrapolate { fill } else { ys[find(t)] }).collect()),
        "next" => Ok(xi.iter().map(|&t| if outside(t) && !extrapolate { fill } else { let i = find(t); if t == xs[i] { ys[i] } else { ys[i + 1] } }).collect()),
        "spline" | "cubic" if method == "spline" => {
            let m = spline_second_derivatives(&xs, &ys);
            Ok(xi.iter().map(|&t| {
                if outside(t) && extrap.is_some() && !extrapolate {
                    return fill;
                }
                let i = find(t);
                let h = xs[i + 1] - xs[i];
                let a = (xs[i + 1] - t) / h;
                let b = (t - xs[i]) / h;
                a * ys[i] + b * ys[i + 1] + ((a * a * a - a) * m[i] + (b * b * b - b) * m[i + 1]) * h * h / 6.0
            }).collect())
        }
        "pchip" | "cubic" => {
            let d = pchip_slopes(&xs, &ys);
            Ok(xi.iter().map(|&t| {
                if outside(t) && extrap.is_some() && !extrapolate {
                    return fill;
                }
                let i = find(t);
                let h = xs[i + 1] - xs[i];
                let s = (t - xs[i]) / h;
                let (h00, h10, h01, h11) = (2.0 * s.powi(3) - 3.0 * s * s + 1.0, s.powi(3) - 2.0 * s * s + s, -2.0 * s.powi(3) + 3.0 * s * s, s.powi(3) - s * s);
                h00 * ys[i] + h10 * h * d[i] + h01 * ys[i + 1] + h11 * h * d[i + 1]
            }).collect())
        }
        other => Err(format!("interp1: unknown method '{other}' (linear, nearest, previous, next, spline, pchip)")),
    }
}

/// Second derivatives of the not-a-knot cubic spline (natural for 3 points).
fn spline_second_derivatives(x: &[f64], y: &[f64]) -> Vec<f64> {
    let n = x.len();
    if n < 3 {
        return vec![0.0; n];
    }
    let h: Vec<f64> = (0..n - 1).map(|i| x[i + 1] - x[i]).collect();
    let mut a = vec![0.0; n];
    let mut b = vec![0.0; n];
    let mut c = vec![0.0; n];
    let mut r = vec![0.0; n];
    for i in 1..n - 1 {
        a[i] = h[i - 1];
        b[i] = 2.0 * (h[i - 1] + h[i]);
        c[i] = h[i];
        r[i] = 6.0 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1]);
    }
    if n == 3 {
        b[0] = 1.0;
        b[2] = 1.0;
    } else {
        // Not-a-knot: h1 M0 − (h0 + h1) M1 + h0 M2 = 0, made tridiagonal with row 1.
        let (h0, h1) = (h[0], h[1]);
        b[0] = h1 - h0 * h0 / h1 * (h0 / h0);
        // Row0' = row0 − (h0/h1)·row1 removes M2.
        let k = h0 / h1;
        b[0] = h1 - k * a[1];
        c[0] = -(h0 + h1) - k * b[1];
        r[0] = -k * r[1];
        let (hm, hl) = (h[n - 3], h[n - 2]);
        let k = hl / hm;
        // Row(n−1): hl M(n−3) − (hm + hl) M(n−2) + hm M(n−1) = 0; remove M(n−3) with row n−2.
        a[n - 1] = -(hm + hl) - k * b[n - 2];
        b[n - 1] = hm - k * c[n - 2];
        r[n - 1] = -k * r[n - 2];
    }
    // Thomas algorithm.
    let mut cp = vec![0.0; n];
    let mut dp = vec![0.0; n];
    cp[0] = c[0] / b[0];
    dp[0] = r[0] / b[0];
    for i in 1..n {
        let m = b[i] - a[i] * cp[i - 1];
        cp[i] = if i < n - 1 { c[i] / m } else { 0.0 };
        dp[i] = (r[i] - a[i] * dp[i - 1]) / m;
    }
    let mut out = vec![0.0; n];
    out[n - 1] = dp[n - 1];
    for i in (0..n - 1).rev() {
        out[i] = dp[i] - cp[i] * out[i + 1];
    }
    out
}

/// Fritsch–Carlson monotone slopes (MATLAB's pchip).
fn pchip_slopes(x: &[f64], y: &[f64]) -> Vec<f64> {
    let n = x.len();
    let h: Vec<f64> = (0..n - 1).map(|i| x[i + 1] - x[i]).collect();
    let del: Vec<f64> = (0..n - 1).map(|i| (y[i + 1] - y[i]) / h[i]).collect();
    let mut d = vec![0.0; n];
    if n == 2 {
        return vec![del[0]; 2];
    }
    for k in 1..n - 1 {
        if del[k - 1] * del[k] > 0.0 {
            let w1 = 2.0 * h[k] + h[k - 1];
            let w2 = h[k] + 2.0 * h[k - 1];
            d[k] = (w1 + w2) / (w1 / del[k - 1] + w2 / del[k]);
        }
    }
    let end = |h0: f64, h1: f64, d0: f64, d1: f64| {
        let mut s = ((2.0 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
        if s.signum() != d0.signum() {
            s = 0.0;
        } else if d0.signum() != d1.signum() && s.abs() > 3.0 * d0.abs() {
            s = 3.0 * d0;
        }
        s
    };
    d[0] = end(h[0], h[1], del[0], del[1]);
    d[n - 1] = end(h[n - 2], h[n - 3], del[n - 2], del[n - 3]);
    d
}

fn polyval(p: &[f64], x: f64) -> f64 {
    p.iter().fold(0.0, |acc, c| acc * x + c)
}

fn conv(a: &[f64], b: &[f64]) -> Vec<f64> {
    if a.is_empty() || b.is_empty() {
        return Vec::new();
    }
    let mut out = vec![0.0; a.len() + b.len() - 1];
    for (i, x) in a.iter().enumerate() {
        for (j, y) in b.iter().enumerate() {
            out[i + j] += x * y;
        }
    }
    out
}

/// y = filter(b, a, x) (direct form II transposed), with the final state.
fn filter(b: &[f64], a: &[f64], x: &[f64], zi: Option<&[f64]>) -> R<(Vec<f64>, Vec<f64>)> {
    if a.is_empty() || a[0] == 0.0 {
        return Err("filter: a(1) must not be zero".into());
    }
    let n = b.len().max(a.len());
    let a0 = a[0];
    let bn: Vec<f64> = (0..n).map(|k| b.get(k).copied().unwrap_or(0.0) / a0).collect();
    let an: Vec<f64> = (0..n).map(|k| a.get(k).copied().unwrap_or(0.0) / a0).collect();
    let mut z = vec![0.0; n];
    if let Some(zi) = zi {
        for (k, v) in zi.iter().enumerate().take(n - 1) {
            z[k] = *v;
        }
    }
    let mut y = Vec::with_capacity(x.len());
    for &xv in x {
        let out = bn[0] * xv + z[0];
        for k in 1..n {
            z[k - 1] = bn[k] * xv + z.get(k).copied().unwrap_or(0.0) - an[k] * out;
        }
        y.push(out);
    }
    z.truncate(n - 1);
    Ok((y, z))
}

/// Adaptive Simpson quadrature.
fn integrate(it: &mut Interp, f: &Func, a: f64, b: f64, tol: f64) -> R<f64> {
    let mut eval = |it: &mut Interp, x: f64| -> R<f64> { it.call_func(f, vec![Value::num(x)], 1)?.first().ok_or("integral: the function returned nothing".to_string())?.scalar() };
    if !a.is_finite() || !b.is_finite() {
        // Map ±∞ by x = t/(1 − t²).
        let g = |t: f64| t / (1.0 - t * t);
        let dg = |t: f64| (1.0 + t * t) / (1.0 - t * t).powi(2);
        let (ta, tb) = (if a.is_finite() { inv_map(a) } else if a < 0.0 { -1.0 + 1e-9 } else { 1.0 - 1e-9 }, if b.is_finite() { inv_map(b) } else if b < 0.0 { -1.0 + 1e-9 } else { 1.0 - 1e-9 });
        let n = 2000;
        let h = (tb - ta) / n as f64;
        let mut s = 0.0;
        for k in 0..=n {
            let t = ta + k as f64 * h;
            let w = if k == 0 || k == n { 1.0 } else if k % 2 == 1 { 4.0 } else { 2.0 };
            let v = eval(it, g(t))? * dg(t);
            if v.is_finite() {
                s += w * v;
            }
        }
        return Ok(s * h / 3.0);
    }
    fn simpson(it: &mut Interp, eval: &mut dyn FnMut(&mut Interp, f64) -> R<f64>, a: f64, b: f64, fa: f64, fm: f64, fb: f64, whole: f64, tol: f64, depth: usize) -> R<f64> {
        let m = 0.5 * (a + b);
        let (lm, rm) = (0.5 * (a + m), 0.5 * (m + b));
        let flm = eval(it, lm)?;
        let frm = eval(it, rm)?;
        let left = (m - a) / 6.0 * (fa + 4.0 * flm + fm);
        let right = (b - m) / 6.0 * (fm + 4.0 * frm + fb);
        if depth > 40 || (left + right - whole).abs() <= 15.0 * tol {
            return Ok(left + right + (left + right - whole) / 15.0);
        }
        Ok(simpson(it, eval, a, m, fa, flm, fm, left, tol / 2.0, depth + 1)? + simpson(it, eval, m, b, fm, frm, fb, right, tol / 2.0, depth + 1)?)
    }
    let fa = eval(it, a)?;
    let fb = eval(it, b)?;
    let m = 0.5 * (a + b);
    let fm = eval(it, m)?;
    let whole = (b - a) / 6.0 * (fa + 4.0 * fm + fb);
    simpson(it, &mut eval, a, b, fa, fm, fb, whole, tol, 0)
}

fn inv_map(x: f64) -> f64 {
    // t with t/(1 − t²) = x.
    if x == 0.0 {
        0.0
    } else {
        (-1.0 + (1.0 + 4.0 * x * x).sqrt()) / (2.0 * x)
    }
}

fn call_scalar(it: &mut Interp, f: &Func, x: f64) -> R<f64> {
    it.call_func(f, vec![Value::num(x)], 1)?.first().ok_or("the function returned nothing".to_string())?.scalar()
}

fn call_vec(it: &mut Interp, f: &Func, x: &[f64], shape_col: bool) -> R<Vec<f64>> {
    let v = if shape_col { Value::col(x.to_vec()) } else { Value::row(x.to_vec()) };
    Ok(it.call_func(f, vec![v], 1)?.first().ok_or("the function returned nothing".to_string())?.arr()?.re)
}

fn as_func(v: &Value, what: &str) -> R<Func> {
    match v {
        Value::Func(f) => Ok(f.clone()),
        Value::Str(s) => Ok(Func::Named(s.clone())),
        _ => Err(format!("{what}: expected a function handle (@(x) … or @name)")),
    }
}

fn get_opt(opts: Option<&Value>, name: &str) -> Option<f64> {
    if let Some(Value::Struct { fields, items, .. }) = opts {
        let k = fields.iter().position(|f| f.eq_ignore_ascii_case(name))?;
        return items.first()?.get(k)?.scalar().ok();
    }
    None
}

/// Nelder–Mead simplex for fminsearch.
fn nelder_mead(it: &mut Interp, f: &Func, x0: &[f64], col: bool, tol: f64, max_iter: usize) -> R<(Vec<f64>, f64, usize)> {
    let n = x0.len();
    let mut simplex: Vec<Vec<f64>> = vec![x0.to_vec()];
    for i in 0..n {
        let mut v = x0.to_vec();
        v[i] = if v[i] != 0.0 { v[i] * 1.05 } else { 0.00025 };
        simplex.push(v);
    }
    let mut fv: Vec<f64> = Vec::new();
    for v in &simplex {
        fv.push(call_vec(it, f, v, col)?.first().copied().unwrap_or(f64::NAN));
    }
    let mut iter = 0;
    while iter < max_iter {
        iter += 1;
        let mut order: Vec<usize> = (0..=n).collect();
        order.sort_by(|&a, &b| fv[a].partial_cmp(&fv[b]).unwrap_or(std::cmp::Ordering::Equal));
        simplex = order.iter().map(|&k| simplex[k].clone()).collect();
        fv = order.iter().map(|&k| fv[k]).collect();
        let spread = simplex.iter().skip(1).flat_map(|v| v.iter().zip(&simplex[0]).map(|(a, b)| (a - b).abs())).fold(0.0f64, f64::max);
        if (fv[n] - fv[0]).abs() <= tol && spread <= tol {
            break;
        }
        let centroid: Vec<f64> = (0..n).map(|j| simplex[..n].iter().map(|v| v[j]).sum::<f64>() / n as f64).collect();
        let point = |t: f64| -> Vec<f64> { (0..n).map(|j| centroid[j] + t * (simplex[n][j] - centroid[j])).collect() };
        let xr = point(-1.0);
        let fr = call_vec(it, f, &xr, col)?[0];
        if fr < fv[0] {
            let xe = point(-2.0);
            let fe = call_vec(it, f, &xe, col)?[0];
            if fe < fr {
                simplex[n] = xe;
                fv[n] = fe;
            } else {
                simplex[n] = xr;
                fv[n] = fr;
            }
        } else if fr < fv[n - 1] {
            simplex[n] = xr;
            fv[n] = fr;
        } else {
            let (xc, fc) = if fr < fv[n] {
                let x = point(-0.5);
                let v = call_vec(it, f, &x, col)?[0];
                (x, v)
            } else {
                let x = point(0.5);
                let v = call_vec(it, f, &x, col)?[0];
                (x, v)
            };
            if fc < fv[n].min(fr) {
                simplex[n] = xc;
                fv[n] = fc;
            } else {
                for k in 1..=n {
                    simplex[k] = (0..n).map(|j| simplex[0][j] + 0.5 * (simplex[k][j] - simplex[0][j])).collect();
                    fv[k] = call_vec(it, f, &simplex[k].clone(), col)?[0];
                }
            }
        }
    }
    let best = (0..=n).min_by(|&a, &b| fv[a].partial_cmp(&fv[b]).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
    Ok((simplex[best].clone(), fv[best], iter))
}

fn digital_filter(name: &str, args: &[Value]) -> R<(Vec<f64>, Vec<f64>)> {
    // butter(n, Wn[, type]), cheby1(n, Rp, Wn[, type]), cheby2(n, Rs, Wn), ellip(n, Rp, Rs, Wn); Wn as a fraction of Nyquist.
    let n = scalar(args, 0, name)? as usize;
    let (rp, rs, wn_at) = match name {
        "butter" => (1.0, 40.0, 1),
        "cheby1" => (scalar(args, 1, name)?, 40.0, 2),
        "cheby2" => (1.0, scalar(args, 1, name)?, 2),
        _ => (scalar(args, 1, name)?, scalar(args, 2, name)?, 3),
    };
    let wn = arr(args, wn_at, name)?.re;
    let kind = match args.get(wn_at + 1) {
        Some(v) => v.text()?,
        None => if wn.len() == 2 { "bandpass".into() } else { "low".into() },
    };
    let kind = match kind.as_str() {
        "low" => "lowpass",
        "high" => "highpass",
        "bandpass" => "bandpass",
        "stop" => "bandstop",
        other => return Err(format!("{name}: unknown type '{other}' (low, high, bandpass, stop)")),
    };
    let fs = 2.0;
    let (sos, g) = crate::nodes::signal::iir_design(if name == "butter" { "butterworth" } else { name }, n, kind, wn[0], *wn.get(1).unwrap_or(&0.0), fs, rp, rs)?;
    let mut b = vec![g];
    let mut a = vec![1.0];
    for s in &sos {
        b = conv(&b, &s.b);
        a = conv(&a, &s.a);
    }
    // Trim trailing zero coefficients that padding sections added.
    let order = if kind == "bandpass" || kind == "bandstop" { 2 * n } else { n };
    b.truncate(order + 1);
    a.truncate(order + 1);
    Ok((b, a))
}

fn mat_to_value(v: &crate::matfile::MatValue) -> Value {
    use crate::matfile::MatValue as M;
    match v {
        M::Num { dims, re, im, class } => {
            let r = dims.first().copied().unwrap_or(0);
            let c: usize = dims.iter().skip(1).product();
            let mut a = Arr::new(r, c, re.clone());
            a.im = im.clone();
            a.logical = class == "logical";
            Value::Num(a)
        }
        M::Char { rows, .. } => Value::Str(rows.join("\n")),
        M::Cell { dims, items } => Value::Cell { r: dims[0], c: dims.iter().skip(1).product(), items: items.iter().map(mat_to_value).collect() },
        M::Struct { dims, fields, items } => Value::Struct { r: dims[0], c: dims.iter().skip(1).product(), fields: fields.clone(), items: items.iter().map(|row| row.iter().map(mat_to_value).collect()).collect() },
        M::Sparse { m, n, ir, jc, re, .. } => {
            let mut dense = vec![0.0; m * n];
            for c in 0..*n {
                for k in jc[c]..jc[c + 1].min(re.len()) {
                    dense[c * m + ir[k]] = re[k];
                }
            }
            Value::Num(Arr::new(*m, *n, dense))
        }
    }
}

pub fn value_to_mat(v: &Value) -> Option<crate::matfile::MatValue> {
    use crate::matfile::MatValue as M;
    Some(match v {
        Value::Num(a) => M::Num { dims: vec![a.r, a.c], re: a.re.clone(), im: a.im.clone(), class: if a.logical { "logical".into() } else { "double".into() } },
        Value::Str(s) => M::Char { dims: vec![1, s.chars().count()], rows: vec![s.clone()] },
        Value::Cell { r, c, items } => M::Cell { dims: vec![*r, *c], items: items.iter().map(|x| value_to_mat(x).unwrap_or(M::Num { dims: vec![0, 0], re: Vec::new(), im: None, class: "double".into() })).collect() },
        Value::Struct { r, c, fields, items } => M::Struct { dims: vec![*r, *c], fields: fields.clone(), items: items.iter().map(|row| row.iter().map(|x| value_to_mat(x).unwrap_or(M::Num { dims: vec![0, 0], re: Vec::new(), im: None, class: "double".into() })).collect()).collect() },
        Value::Func(_) => return None,
    })
}

fn figure<'b>(it: &'b mut Interp) -> &'b mut Figure {
    if it.figures.is_empty() {
        it.figures.push(Figure::default());
        it.current = 0;
    }
    &mut it.figures[it.current]
}

/// plot(y), plot(x, y), plot(x, Y), plot(x1, y1, 'r--', x2, y2, …).
fn plot_series(it: &mut Interp, args: &[Value], kind: &str) -> R<()> {
    let nums: Vec<&Value> = args.iter().take_while(|a| !matches!(a, Value::Str(s) if ["linewidth", "markersize", "displayname", "color"].contains(&s.to_ascii_lowercase().as_str()))).collect();
    let mut groups: Vec<(Option<Arr>, Arr)> = Vec::new();
    let mut k = 0;
    while k < nums.len() {
        if matches!(nums[k], Value::Str(_)) {
            k += 1;
            continue;
        }
        let a = nums[k].arr()?;
        let next_num = nums.get(k + 1).filter(|v| !matches!(v, Value::Str(_)));
        match next_num {
            Some(b) => {
                groups.push((Some(a), b.arr()?));
                k += 2;
            }
            None => {
                groups.push((None, a));
                k += 1;
            }
        }
    }
    let display_name = args.iter().position(|a| matches!(a, Value::Str(s) if s.eq_ignore_ascii_case("displayname"))).and_then(|p| args.get(p + 1)).and_then(|v| v.text().ok());
    let hold = it.hold;
    let fig = figure(it);
    if !hold {
        fig.series.clear();
        fig.legend.clear();
    }
    fig.kind = kind.to_string();
    for (x, y) in groups {
        let y = if y.r == 1 || y.c == 1 { Arr::col(y.re.clone()) } else { y };
        let n = y.r;
        let xs: Vec<f64> = match &x {
            Some(x) => x.re.clone(),
            None => (1..=n).map(|v| v as f64).collect(),
        };
        // Columns of a matrix are separate series (or rows when x matches the row length).
        let y = if xs.len() != n && y.c == xs.len() { y.transpose(false) } else { y };
        for j in 0..y.c {
            let idx = fig.series.len() + 1;
            fig.series.push(Series { name: display_name.clone().unwrap_or_else(|| format!("y{idx}")), x: xs.clone(), y: y.re[j * y.r..(j + 1) * y.r].to_vec() });
        }
    }
    Ok(())
}

fn surface(it: &mut Interp, args: &[Value], kind: &str) -> R<()> {
    let nums: Vec<Arr> = args.iter().filter(|a| !matches!(a, Value::Str(_))).map(|a| a.arr()).collect::<R<_>>()?;
    let (x, y, z) = match nums.len() {
        1 => {
            let z = nums[0].clone();
            ((1..=z.c).map(|v| v as f64).collect::<Vec<_>>(), (1..=z.r).map(|v| v as f64).collect::<Vec<_>>(), z)
        }
        n if n >= 3 => {
            let z = nums[2].clone();
            // Vectors or meshgrid matrices.
            let xv = if nums[0].r == 1 || nums[0].c == 1 { nums[0].re.clone() } else { (0..z.c).map(|j| nums[0].get(0, j)).collect() };
            let yv = if nums[1].r == 1 || nums[1].c == 1 { nums[1].re.clone() } else { (0..z.r).map(|i| nums[1].get(i, 0)).collect() };
            (xv, yv, z)
        }
        _ => return Err(format!("{kind}: give Z, or X, Y and Z")),
    };
    if x.len() != z.c || y.len() != z.r {
        return Err(format!("{kind}: X and Y must match the columns and rows of Z"));
    }
    let flat: Vec<f64> = (0..z.r).flat_map(|i| (0..z.c).map(move |j| (i, j))).map(|(i, j)| z.get(i, j)).collect();
    let hold = it.hold;
    let fig = figure(it);
    if !hold {
        fig.surfaces.clear();
    }
    fig.kind = kind.to_string();
    let n = fig.surfaces.len() + 1;
    fig.surfaces.push(Surface { name: format!("{kind} {n}"), x, y, z: flat });
    Ok(())
}

fn ode(it: &mut Interp, name: &str, args: &[Value], nargout: usize) -> Out {
    let f = as_func(&arg(args, 0, name)?, name)?;
    let tspan = arr(args, 1, name)?.re;
    let y0a = arr(args, 2, name)?;
    let y0 = y0a.re.clone();
    let opts = args.get(3);
    if tspan.len() < 2 {
        return Err(format!("{name}: tspan needs [t0 tf]"));
    }
    let (t0, tf) = (tspan[0], *tspan.last().unwrap());
    let method = match name {
        "ode45" => crate::ode::Method::Rk45,
        "ode23" => crate::ode::Method::Rk23,
        "ode23s" => crate::ode::Method::Rosenbrock,
        "ode15s" | "ode23t" | "ode23tb" => crate::ode::Method::TrBdf2,
        "ode113" => crate::ode::Method::Rk45,
        _ => crate::ode::Method::Rk45,
    };
    let rtol = get_opt(opts, "RelTol").unwrap_or(1e-3);
    let atol = get_opt(opts, "AbsTol").unwrap_or(1e-6);
    // Output grid: tspan itself when it lists times, else 200 steps (MATLAB's refine gives a similar density).
    let uniform = tspan.len() > 2;
    let steps = if uniform { tspan.len() - 1 } else { 200 };
    let dt = (tf - t0) / steps as f64;
    let reverse = dt < 0.0;
    let opt = crate::ode::Options { method, t0: 0.0, t_end: (tf - t0).abs(), dt: dt.abs(), substeps: 1, rtol, atol };
    let n = y0.len();
    let mut err: Option<String> = None;
    let col = true;
    let mut rhs = |t: f64, x: &[f64], dx: &mut [f64]| {
        if err.is_some() {
            dx.iter_mut().for_each(|v| *v = 0.0);
            return;
        }
        let tt = if reverse { t0 - t } else { t0 + t };
        match it.call_func(&f, vec![Value::num(tt), if col { Value::col(x.to_vec()) } else { Value::row(x.to_vec()) }], 1).and_then(|v| v.first().ok_or("the ODE function returned nothing".to_string()).and_then(|v| v.arr())) {
            Ok(a) if a.len() == n => {
                for k in 0..n {
                    dx[k] = if reverse { -a.re[k] } else { a.re[k] };
                }
            }
            Ok(a) => err = Some(format!("{name}: the ODE function returned {} values for {n} states", a.len())),
            Err(e) => err = Some(e),
        }
    };
    let sol = crate::ode::integrate(&mut rhs, &y0, &opt, &|| false, &mut |_| {});
    if let Some(e) = err {
        return Err(e);
    }
    let sol = sol?;
    let t: Vec<f64> = sol.t.iter().map(|v| if reverse { t0 - v } else { t0 + v }).collect();
    let m = t.len();
    let mut y = Arr::zeros(m, n);
    for k in 0..n {
        for i in 0..m {
            y.re[k * m + i] = sol.x[k][i];
        }
    }
    if nargout <= 1 {
        // sol = ode45(…): a structure with x and y.
        let st = Value::Struct { r: 1, c: 1, fields: vec!["x".into(), "y".into(), "solver".into()], items: vec![vec![Value::row(t), Value::Num(y.transpose(false)), Value::Str(name.into())]] };
        return one(st);
    }
    Ok(vec![Value::col(t), Value::Num(y)])
}

// ───────────────────────── dispatch

pub fn call(it: &mut Interp, name: &str, args: Vec<Value>, nargout: usize, _statement: bool) -> Option<Out> {
    let a = &args;
    let r: Out = (|| -> Out {
        match name {
            // Constants.
            "pi" => return num(PI),
            "e" => return num(std::f64::consts::E),
            "Inf" | "inf" => return fill_const(a, f64::INFINITY),
            "NaN" | "nan" => return fill_const(a, f64::NAN),
            "eps" => return num(if a.is_empty() { f64::EPSILON } else { let x = scalar(a, 0, name)?.abs(); if x == 0.0 { f64::MIN_POSITIVE } else { 2f64.powi(x.log2().floor() as i32 - 52) } }),
            "realmax" => return num(f64::MAX),
            "realmin" => return num(f64::MIN_POSITIVE),
            "intmax" => return num(i32::MAX as f64),
            "intmin" => return num(i32::MIN as f64),
            "flintmax" => return num(9007199254740992.0),
            "true" | "false" => {
                let (r, c) = size_args(a, name)?;
                return one(Value::Num(Arr::boolean(r, c, vec![name == "true"; r * c])));
            }
            "i" | "j" | "1i" => return one(Value::Num(Arr::complex(1, 1, vec![0.0], vec![1.0]))),
            // Construction.
            "zeros" | "ones" | "rand" | "randn" | "cell" => {
                let (r, c) = size_args(a, name)?;
                if r.saturating_mul(c) > 50_000_000 {
                    return Err(format!("{name}: {r}×{c} is too large"));
                }
                return one(match name {
                    "zeros" => Value::Num(Arr::zeros(r, c)),
                    "ones" => Value::Num(Arr::new(r, c, vec![1.0; r * c])),
                    "rand" => Value::Num(Arr::new(r, c, (0..r * c).map(|_| it.rng.uniform()).collect())),
                    "randn" => Value::Num(Arr::new(r, c, (0..r * c).map(|_| it.rng.normal()).collect())),
                    _ => Value::Cell { r, c, items: vec![Value::empty(); r * c] },
                });
            }
            "randi" => {
                let lim = arr(a, 0, name)?.re;
                let (lo, hi) = if lim.len() >= 2 { (lim[0], lim[1]) } else { (1.0, lim[0]) };
                let (r, c) = size_args(&a[1..], name)?;
                return one(Value::Num(Arr::new(r, c, (0..r * c).map(|_| (lo + (it.rng.uniform() * (hi - lo + 1.0)).floor()).min(hi)).collect())));
            }
            "randperm" => {
                let n = scalar(a, 0, name)? as usize;
                let mut p: Vec<f64> = (1..=n).map(|v| v as f64).collect();
                it.rng.shuffle(&mut p);
                if let Some(k) = a.get(1) {
                    p.truncate(k.usize()?);
                }
                return one(Value::row(p));
            }
            "rng" => {
                if let Some(Value::Num(x)) = a.first() {
                    it.rng = crate::rng::Rng::new(x.re.first().copied().unwrap_or(0.0) as u64);
                } else if let Some(Value::Str(s)) = a.first() {
                    if s.chars().all(|c| c.is_ascii_digit()) {
                        it.rng = crate::rng::Rng::new(s.parse().unwrap_or(0));
                    }
                }
                return Ok(Vec::new());
            }
            "eye" => {
                let (r, c) = size_args(a, name)?;
                let mut m = Arr::zeros(r, c);
                for k in 0..r.min(c) {
                    m.re[k * r + k] = 1.0;
                }
                return one(Value::Num(m));
            }
            "linspace" => {
                let (lo, hi) = (scalar(a, 0, name)?, scalar(a, 1, name)?);
                let n = a.get(2).map(|v| v.scalar()).transpose()?.unwrap_or(100.0).max(1.0) as usize;
                return one(Value::row((0..n).map(|k| if n == 1 { hi } else { lo + (hi - lo) * k as f64 / (n - 1) as f64 }).collect()));
            }
            "logspace" => {
                let (lo, hi) = (scalar(a, 0, name)?, scalar(a, 1, name)?);
                let n = a.get(2).map(|v| v.scalar()).transpose()?.unwrap_or(50.0).max(1.0) as usize;
                return one(Value::row((0..n).map(|k| 10f64.powf(if n == 1 { hi } else { lo + (hi - lo) * k as f64 / (n - 1) as f64 })).collect()));
            }
            "colon" => return one(Value::Num(range(scalar(a, 0, name)?, if a.len() > 2 { scalar(a, 1, name)? } else { 1.0 }, scalar(a, a.len() - 1, name)?)?)),
            "magic" => {
                let n = scalar(a, 0, name)? as usize;
                return one(Value::Num(Arr::from_rows(&magic(n))));
            }
            "diag" => {
                let m = arr(a, 0, name)?;
                let k = a.get(1).map(|v| v.scalar()).transpose()?.unwrap_or(0.0) as i64;
                if m.r == 1 || m.c == 1 {
                    let n = m.len() + k.unsigned_abs() as usize;
                    let mut out = Arr::zeros(n, n);
                    for (q, v) in m.re.iter().enumerate() {
                        let (i, j) = if k >= 0 { (q, q + k as usize) } else { (q + (-k) as usize, q) };
                        out.re[j * n + i] = *v;
                    }
                    return one(Value::Num(out));
                }
                let mut d = Vec::new();
                for q in 0.. {
                    let (i, j) = if k >= 0 { (q, q + k as usize) } else { (q + (-k) as usize, q) };
                    if i >= m.r || j >= m.c {
                        break;
                    }
                    d.push(m.get(i, j));
                }
                return one(Value::col(d));
            }
            "repmat" => {
                let v = arg(a, 0, name)?;
                let (m, n) = size_args(&a[1..], name)?;
                let row: Vec<Value> = vec![v; n];
                let r = concat(&row, true)?;
                return one(concat(&vec![r; m], false)?);
            }
            "meshgrid" => {
                let x = arr(a, 0, name)?.re;
                let y = match a.get(1) {
                    Some(v) => v.arr()?.re,
                    None => x.clone(),
                };
                let (r, c) = (y.len(), x.len());
                let xx = Arr::new(r, c, (0..c).flat_map(|j| std::iter::repeat(x[j]).take(r)).collect());
                let yy = Arr::new(r, c, (0..c).flat_map(|_| y.iter().copied()).collect());
                return Ok(vec![Value::Num(xx), Value::Num(yy)]);
            }
            "ndgrid" => {
                let x = arr(a, 0, name)?.re;
                let y = match a.get(1) {
                    Some(v) => v.arr()?.re,
                    None => x.clone(),
                };
                let (r, c) = (x.len(), y.len());
                let xx = Arr::new(r, c, (0..c).flat_map(|_| x.iter().copied()).collect());
                let yy = Arr::new(r, c, (0..c).flat_map(|j| std::iter::repeat(y[j]).take(r)).collect());
                return Ok(vec![Value::Num(xx), Value::Num(yy)]);
            }
            "horzcat" => return one(concat(a, true)?),
            "vertcat" => return one(concat(a, false)?),
            "cat" => {
                let d = scalar(a, 0, name)?;
                return one(concat(&a[1..], d == 2.0)?);
            }
            "reshape" => {
                let v = arg(a, 0, name)?;
                let n = v.numel();
                let dims: Vec<Option<usize>> = if a.len() == 2 {
                    a[1].arr()?.re.iter().map(|x| Some(*x as usize)).collect()
                } else {
                    a[1..].iter().map(|x| if x.is_empty() { Ok(None) } else { x.usize().map(Some) }).collect::<R<_>>()?
                };
                let known: usize = dims.iter().flatten().product();
                let dims: Vec<usize> = dims.iter().map(|d| d.unwrap_or(if known > 0 { n / known } else { 0 })).collect();
                let (r, c) = (dims[0], dims.iter().skip(1).product::<usize>().max(if dims.len() == 1 { 1 } else { 0 }));
                if r * c != n {
                    return Err(format!("reshape: {n} elements cannot become {r}×{c}"));
                }
                return one(match v {
                    Value::Num(mut x) => {
                        x.r = r;
                        x.c = c;
                        Value::Num(x)
                    }
                    Value::Cell { items, .. } => Value::Cell { r, c, items },
                    Value::Str(s) => Value::Num(Arr::new(r, c, s.chars().map(|ch| ch as u32 as f64).collect())),
                    other => other,
                });
            }
            // Shape and type.
            "size" => {
                let (r, c) = arg(a, 0, name)?.dims();
                if let Some(d) = a.get(1) {
                    let d = d.usize()?;
                    return num(match d { 1 => r, 2 => c, _ => 1 } as f64);
                }
                if nargout >= 2 {
                    let mut out = vec![Value::num(r as f64), Value::num(c as f64)];
                    for _ in 2..nargout {
                        out.push(Value::num(1.0));
                    }
                    return Ok(out);
                }
                return one(Value::row(vec![r as f64, c as f64]));
            }
            "numel" => return num(arg(a, 0, name)?.numel() as f64),
            "length" => {
                let (r, c) = arg(a, 0, name)?.dims();
                return num(if r == 0 || c == 0 { 0 } else { r.max(c) } as f64);
            }
            "ndims" => return num(2.0),
            "isempty" => return one(Value::boolean(arg(a, 0, name)?.is_empty())),
            "isscalar" => return one(Value::boolean(arg(a, 0, name)?.numel() == 1)),
            "isvector" => {
                let (r, c) = arg(a, 0, name)?.dims();
                return one(Value::boolean((r == 1 || c == 1) && r * c >= 1));
            }
            "isrow" => return one(Value::boolean(arg(a, 0, name)?.dims().0 == 1)),
            "iscolumn" => return one(Value::boolean(arg(a, 0, name)?.dims().1 == 1)),
            "ismatrix" => return one(Value::boolean(true)),
            "issquare" => {
                let (r, c) = arg(a, 0, name)?.dims();
                return one(Value::boolean(r == c));
            }
            "class" => return one(Value::Str(arg(a, 0, name)?.class().into())),
            "isa" => {
                let v = arg(a, 0, name)?;
                let c = text(a, 1, name)?;
                let cl = v.class();
                return one(Value::boolean(cl == c || (c == "numeric" && cl == "double") || (c == "float" && cl == "double")));
            }
            "isnumeric" => return one(Value::boolean(matches!(arg(a, 0, name)?, Value::Num(ref x) if !x.logical))),
            "isfloat" | "isreal" => {
                let v = arg(a, 0, name)?;
                return one(Value::boolean(match (&v, name) {
                    (Value::Num(x), "isreal") => x.im.is_none(),
                    (Value::Num(x), _) => !x.logical,
                    (Value::Str(_), "isreal") => true,
                    _ => false,
                }));
            }
            "islogical" => return one(Value::boolean(matches!(arg(a, 0, name)?, Value::Num(ref x) if x.logical))),
            "ischar" | "isstring" => return one(Value::boolean(matches!(arg(a, 0, name)?, Value::Str(_)))),
            "iscell" => return one(Value::boolean(matches!(arg(a, 0, name)?, Value::Cell { .. }))),
            "iscellstr" => return one(Value::boolean(matches!(arg(a, 0, name)?, Value::Cell { ref items, .. } if items.iter().all(|x| matches!(x, Value::Str(_)))))),
            "isstruct" => return one(Value::boolean(matches!(arg(a, 0, name)?, Value::Struct { .. }))),
            "is_function_handle" => return one(Value::boolean(matches!(arg(a, 0, name)?, Value::Func(_)))),
            "isfield" => {
                let v = arg(a, 0, name)?;
                let fields = match &v {
                    Value::Struct { fields, .. } => fields.clone(),
                    _ => Vec::new(),
                };
                return match arg(a, 1, name)? {
                    Value::Cell { r, c, items } => one(Value::Num(Arr::boolean(r, c, items.iter().map(|x| x.text().map(|t| fields.contains(&t)).unwrap_or(false)).collect()))),
                    other => one(Value::boolean(fields.contains(&other.text()?))),
                };
            }
            "exist" => {
                let n = text(a, 0, name)?;
                return num(if it.get_var(&n).is_some() { 1.0 } else if it.funcs.contains_key(&n) { 2.0 } else { 0.0 });
            }
            "isnan" => return one(bool_arr(&arr(a, 0, name)?, &|v| v.is_nan())),
            "isinf" => return one(bool_arr(&arr(a, 0, name)?, &|v| v.is_infinite())),
            "isfinite" => return one(bool_arr(&arr(a, 0, name)?, &|v| v.is_finite())),
            "logical" => return one(bool_arr(&arr(a, 0, name)?, &|v| v != 0.0)),
            "double" | "single" | "full" => {
                let mut x = arr(a, 0, name)?;
                x.logical = false;
                if name == "single" {
                    x.re.iter_mut().for_each(|v| *v = *v as f32 as f64);
                }
                return one(Value::Num(x));
            }
            "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "int64" | "uint64" => {
                let (lo, hi) = match name {
                    "int8" => (-128.0, 127.0),
                    "uint8" => (0.0, 255.0),
                    "int16" => (-32768.0, 32767.0),
                    "uint16" => (0.0, 65535.0),
                    "int32" => (-2147483648.0, 2147483647.0),
                    "uint32" => (0.0, 4294967295.0),
                    "int64" => (-9.2e18, 9.2e18),
                    _ => (0.0, 1.8e19),
                };
                let x = arr(a, 0, name)?;
                return one(Value::Num(map(&x, &|v| if v.is_nan() { 0.0 } else { v.round().clamp(lo, hi) })));
            }
            "char" => {
                return one(match arg(a, 0, name)? {
                    Value::Cell { items, .. } => Value::Str(items.iter().map(|x| x.text()).collect::<R<Vec<_>>>()?.join("\n")),
                    other => Value::Str(other.text()?),
                });
            }
            // Element-wise math.
            "abs" => {
                let x = arr(a, 0, name)?;
                return one(Value::Num(match &x.im {
                    Some(_) => Arr::new(x.r, x.c, x.to_c().iter().map(|z| z.abs()).collect()),
                    None => map(&x, &f64::abs),
                }));
            }
            "angle" | "arg" => {
                let x = arr(a, 0, name)?;
                return one(Value::Num(Arr::new(x.r, x.c, x.to_c().iter().map(|z| z.arg()).collect())));
            }
            "real" => {
                let mut x = arr(a, 0, name)?;
                x.im = None;
                x.logical = false;
                return one(Value::Num(x));
            }
            "imag" => {
                let x = arr(a, 0, name)?;
                return one(Value::Num(Arr::new(x.r, x.c, x.im.clone().unwrap_or_else(|| vec![0.0; x.len()]))));
            }
            "conj" => {
                let x = arr(a, 0, name)?;
                return one(Value::Num(Arr { im: x.im.as_ref().map(|v| v.iter().map(|y| -y).collect()), ..x }));
            }
            "complex" => {
                let re = arr(a, 0, name)?;
                let im = match a.get(1) {
                    Some(v) => v.arr()?,
                    None => Arr::zeros(re.r, re.c),
                };
                let s = elementwise(&re, &im, &|_, _| 0.0)?;
                let rr = elementwise(&re, &s, &|x, _| x)?;
                let ii = elementwise(&im, &s, &|x, _| x)?;
                return one(Value::Num(Arr { r: rr.r, c: rr.c, re: rr.re, im: Some(ii.re), logical: false }));
            }
            "sqrt" | "exp" | "log" | "sin" | "cos" | "tan" | "sinh" | "cosh" | "tanh" | "asin" | "acos" | "atan" | "log10" | "log2" | "asinh" | "acosh" | "atanh" | "sec" | "csc" | "cot" | "log1p" | "expm1" => {
                let x = arr(a, 0, name)?;
                let needs_c = x.is_complex() || match name {
                    "sqrt" | "log" | "log10" | "log2" => x.re.iter().any(|v| *v < 0.0),
                    "asin" | "acos" => x.re.iter().any(|v| v.abs() > 1.0),
                    "acosh" => x.re.iter().any(|v| *v < 1.0),
                    "atanh" => x.re.iter().any(|v| v.abs() > 1.0),
                    _ => false,
                };
                if needs_c {
                    return one(Value::Num(map_c(&x, &|z| complex_fn(name, z))));
                }
                let f: fn(f64) -> f64 = match name {
                    "sqrt" => f64::sqrt,
                    "exp" => f64::exp,
                    "log" => f64::ln,
                    "sin" => f64::sin,
                    "cos" => f64::cos,
                    "tan" => f64::tan,
                    "sinh" => f64::sinh,
                    "cosh" => f64::cosh,
                    "tanh" => f64::tanh,
                    "asin" => f64::asin,
                    "acos" => f64::acos,
                    "atan" => f64::atan,
                    "log10" => f64::log10,
                    "log2" => f64::log2,
                    "asinh" => f64::asinh,
                    "acosh" => f64::acosh,
                    "atanh" => f64::atanh,
                    "sec" => |v| 1.0 / v.cos(),
                    "csc" => |v| 1.0 / v.sin(),
                    "cot" => |v| 1.0 / v.tan(),
                    "log1p" => f64::ln_1p,
                    _ => f64::exp_m1,
                };
                return one(Value::Num(map(&x, &f)));
            }
            "sind" | "cosd" | "tand" | "asind" | "acosd" | "atand" | "deg2rad" | "rad2deg" => {
                let x = arr(a, 0, name)?;
                let f: fn(f64) -> f64 = match name {
                    "sind" => |v| v.to_radians().sin(),
                    "cosd" => |v| v.to_radians().cos(),
                    "tand" => |v| v.to_radians().tan(),
                    "asind" => |v| v.asin().to_degrees(),
                    "acosd" => |v| v.acos().to_degrees(),
                    "atand" => |v| v.atan().to_degrees(),
                    "deg2rad" => f64::to_radians,
                    _ => f64::to_degrees,
                };
                return one(Value::Num(map(&x, &f)));
            }
            "floor" | "ceil" | "fix" | "sign" | "gamma" | "gammaln" | "erf" | "erfc" | "factorial" | "isprime" | "round" => {
                let x = arr(a, 0, name)?;
                if name == "round" && a.len() > 1 {
                    let d = scalar(a, 1, name)?;
                    let s = 10f64.powf(d);
                    return one(Value::Num(map(&x, &|v| (v * s).round() / s)));
                }
                if name == "isprime" {
                    return one(bool_arr(&x, &|v| is_prime(v)));
                }
                let f: fn(f64) -> f64 = match name {
                    "floor" => f64::floor,
                    "ceil" => f64::ceil,
                    "fix" => f64::trunc,
                    "round" => f64::round,
                    "sign" => |v| if v > 0.0 { 1.0 } else if v < 0.0 { -1.0 } else { 0.0 },
                    "gamma" => crate::rng::gamma_fn,
                    "gammaln" => crate::special::lgamma,
                    "erf" => crate::expr::erf,
                    "erfc" => |v| 1.0 - crate::expr::erf(v),
                    _ => |v| crate::rng::gamma_fn(v + 1.0).round(),
                };
                return one(Value::Num(map(&x, &f)));
            }
            "mod" | "rem" | "atan2" | "hypot" | "power" | "nthroot" | "beta" => {
                let x = arr(a, 0, name)?;
                let y = arr(a, 1, name)?;
                return one(Value::Num(match name {
                    "mod" => elementwise(&x, &y, &|p, q| if q == 0.0 { p } else { p - (p / q).floor() * q })?,
                    "rem" => elementwise(&x, &y, &|p, q| if q == 0.0 { p } else { p - (p / q).trunc() * q })?,
                    "atan2" => elementwise(&x, &y, &f64::atan2)?,
                    "hypot" => elementwise(&x, &y, &f64::hypot)?,
                    "nthroot" => elementwise(&x, &y, &|p, q| if p < 0.0 && (q as i64) % 2 == 1 { -(-p).powf(1.0 / q) } else { p.powf(1.0 / q) })?,
                    "beta" => elementwise(&x, &y, &|p, q| (crate::special::lgamma(p) + crate::special::lgamma(q) - crate::special::lgamma(p + q)).exp())?,
                    _ => binary(super::syntax::Bin::EPow, &x, &y)?,
                }));
            }
            "plus" | "minus" | "times" | "rdivide" | "ldivide" | "mtimes" | "mrdivide" | "mldivide" | "mpower" | "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "and" | "or" => {
                use super::syntax::Bin::*;
                let op = match name { "plus" => Add, "minus" => Sub, "times" => EMul, "rdivide" => EDiv, "ldivide" => ELDiv, "mtimes" => Mul, "mrdivide" => Div, "mldivide" => LDiv, "mpower" => Pow, "eq" => Eq, "ne" => Ne, "lt" => Lt, "le" => Le, "gt" => Gt, "ge" => Ge, "and" => And, _ => Or };
                return one(super::interp::binop(op, &arg(a, 0, name)?, &arg(a, 1, name)?)?);
            }
            "not" => return one(bool_arr(&arr(a, 0, name)?, &|v| v == 0.0)),
            "xor" => {
                let x = arr(a, 0, name)?;
                let y = arr(a, 1, name)?;
                let mut o = elementwise(&x, &y, &|p, q| if (p != 0.0) != (q != 0.0) { 1.0 } else { 0.0 })?;
                o.logical = true;
                return one(Value::Num(o));
            }
            "uminus" => return one(Value::Num(negate(&arr(a, 0, name)?))),
            "transpose" | "ctranspose" => return one(super::interp::transpose_value(&arg(a, 0, name)?, name == "ctranspose")?),
            "nchoosek" => {
                let n = scalar(a, 0, name)?;
                let k = scalar(a, 1, name)?;
                return num((crate::special::lgamma(n + 1.0) - crate::special::lgamma(k + 1.0) - crate::special::lgamma(n - k + 1.0)).exp().round());
            }
            "gcd" | "lcm" => {
                let x = arr(a, 0, name)?;
                let y = arr(a, 1, name)?;
                let g = |mut p: f64, mut q: f64| {
                    p = p.abs();
                    q = q.abs();
                    while q > 0.0 {
                        let t = p % q;
                        p = q;
                        q = t;
                    }
                    p
                };
                return one(Value::Num(if name == "gcd" { elementwise(&x, &y, &g)? } else { elementwise(&x, &y, &|p, q| if p == 0.0 || q == 0.0 { 0.0 } else { (p * q).abs() / g(p, q) })? }));
            }
            "primes" => {
                let n = scalar(a, 0, name)? as usize;
                return one(Value::row((2..=n).filter(|k| is_prime(*k as f64)).map(|k| k as f64).collect()));
            }
            "factor" => {
                let mut n = scalar(a, 0, name)? as u64;
                let mut f = Vec::new();
                let mut d = 2;
                while d * d <= n {
                    while n % d == 0 {
                        f.push(d as f64);
                        n /= d;
                    }
                    d += 1;
                }
                if n > 1 {
                    f.push(n as f64);
                }
                return one(Value::row(f));
            }
            // Reductions.
            "sum" | "prod" | "mean" | "median" | "std" | "var" | "mode" | "range" | "rms" | "nnz" => {
                let x = arr(a, 0, name)?;
                if name == "nnz" {
                    return num(x.re.iter().filter(|v| **v != 0.0).count() as f64);
                }
                let wflag = if matches!(name, "std" | "var") { a.get(1).map(|v| v.scalar()).transpose()?.unwrap_or(0.0) } else { 0.0 };
                let dim_arg = if matches!(name, "std" | "var") { 2 } else { 1 };
                let all = matches!(a.get(dim_arg), Some(Value::Str(s)) if s == "all");
                let x = if all { Arr::col(x.re.clone()) } else { x };
                let dim = dim_of(&x, a, dim_arg)?;
                if x.is_complex() && matches!(name, "sum" | "mean") {
                    let rr = reduce(&Arr::new(x.r, x.c, x.re.clone()), dim, &|v| v.iter().sum::<f64>() / if name == "mean" { v.len() as f64 } else { 1.0 });
                    let ii = reduce(&Arr::new(x.r, x.c, x.im.clone().unwrap()), dim, &|v| v.iter().sum::<f64>() / if name == "mean" { v.len() as f64 } else { 1.0 });
                    return one(Value::Num(Arr::complex(rr.r, rr.c, rr.re, ii.re)));
                }
                let f: Box<dyn Fn(&[f64]) -> f64> = match name {
                    "sum" => Box::new(|v| v.iter().sum()),
                    "prod" => Box::new(|v| v.iter().product()),
                    "mean" => Box::new(|v| if v.is_empty() { f64::NAN } else { v.iter().sum::<f64>() / v.len() as f64 }),
                    "median" => Box::new(median),
                    "std" => Box::new(move |v| variance(v, wflag).sqrt()),
                    "var" => Box::new(move |v| variance(v, wflag)),
                    "range" => Box::new(|v| v.iter().cloned().fold(f64::NEG_INFINITY, f64::max) - v.iter().cloned().fold(f64::INFINITY, f64::min)),
                    "rms" => Box::new(|v| (v.iter().map(|x| x * x).sum::<f64>() / v.len().max(1) as f64).sqrt()),
                    _ => Box::new(|v| {
                        let s = sorted(v);
                        let mut best = (f64::NAN, 0);
                        let mut k = 0;
                        while k < s.len() {
                            let mut e = k;
                            while e + 1 < s.len() && s[e + 1] == s[k] {
                                e += 1;
                            }
                            if e - k + 1 > best.1 {
                                best = (s[k], e - k + 1);
                            }
                            k = e + 1;
                        }
                        best.0
                    }),
                };
                return one(Value::Num(reduce(&x, dim, &*f)));
            }
            "cumsum" | "cumprod" | "cummax" | "cummin" => {
                let x = arr(a, 0, name)?;
                let dim = dim_of(&x, a, 1)?;
                let f: Box<dyn Fn(&[f64]) -> Vec<f64>> = match name {
                    "cumsum" => Box::new(|v| v.iter().scan(0.0, |s, x| { *s += x; Some(*s) }).collect()),
                    "cumprod" => Box::new(|v| v.iter().scan(1.0, |s, x| { *s *= x; Some(*s) }).collect()),
                    "cummax" => Box::new(|v| v.iter().scan(f64::NEG_INFINITY, |s, x| { *s = s.max(*x); Some(*s) }).collect()),
                    _ => Box::new(|v| v.iter().scan(f64::INFINITY, |s, x| { *s = s.min(*x); Some(*s) }).collect()),
                };
                return one(Value::Num(running(&x, dim, &*f)));
            }
            "max" | "min" => {
                let x = arr(a, 0, name)?;
                let better = |p: f64, q: f64| if name == "max" { p > q } else { p < q };
                // max(a, b): element-wise.
                if let Some(y) = a.get(1).filter(|v| !v.is_empty()) {
                    let y = y.arr()?;
                    return one(Value::Num(elementwise(&x, &y, &|p, q| if p.is_nan() { q } else if q.is_nan() || better(p, q) || p == q { p } else { q })?));
                }
                let all = matches!(a.get(2), Some(Value::Str(s)) if s == "all");
                let x = if all { Arr::col(x.re.clone()) } else { x };
                let dim = dim_of(&x, a, 2)?;
                let pick = |v: &[f64]| -> (f64, f64) {
                    let mut best = (f64::NAN, 0usize);
                    for (k, &q) in v.iter().enumerate() {
                        if !q.is_nan() && (best.0.is_nan() || better(q, best.0)) {
                            best = (q, k);
                        }
                    }
                    (best.0, best.1 as f64 + 1.0)
                };
                let vals = reduce(&x, dim, &|v| pick(v).0);
                let idx = reduce(&x, dim, &|v| pick(v).1);
                return Ok(vec![Value::Num(vals), Value::Num(idx)]);
            }
            "any" | "all" => {
                let x = arr(a, 0, name)?;
                let all_flag = matches!(a.get(1), Some(Value::Str(s)) if s == "all");
                let x = if all_flag || x.r == 1 || x.c == 1 { Arr::col(x.re.clone()) } else { x };
                let dim = dim_of(&x, a, 1)?;
                let mut out = reduce(&x, dim, &|v| if name == "any" { v.iter().any(|q| *q != 0.0 && !q.is_nan()) as i32 as f64 } else { v.iter().all(|q| *q != 0.0) as i32 as f64 });
                out.logical = true;
                return one(Value::Num(out));
            }
            "diff" => {
                let mut x = arr(a, 0, name)?;
                let order = a.get(1).map(|v| v.usize()).transpose()?.unwrap_or(1);
                for _ in 0..order {
                    x = if x.r == 1 {
                        Arr::row(x.re.windows(2).map(|w| w[1] - w[0]).collect())
                    } else {
                        let r = x.r.saturating_sub(1);
                        let mut out = Arr::zeros(r, x.c);
                        for j in 0..x.c {
                            for i in 0..r {
                                out.re[j * r + i] = x.get(i + 1, j) - x.get(i, j);
                            }
                        }
                        out
                    };
                }
                return one(Value::Num(x));
            }
            "sort" => {
                let v = arg(a, 0, name)?;
                let descend = a.iter().any(|x| matches!(x, Value::Str(s) if s.eq_ignore_ascii_case("descend")));
                if let Value::Cell { r, c, items } = &v {
                    let mut s: Vec<(String, usize)> = items.iter().enumerate().map(|(k, x)| x.text().map(|t| (t, k))).collect::<R<_>>()?;
                    s.sort();
                    if descend {
                        s.reverse();
                    }
                    let idx: Vec<f64> = s.iter().map(|p| p.1 as f64 + 1.0).collect();
                    return Ok(vec![Value::Cell { r: *r, c: *c, items: s.into_iter().map(|p| Value::Str(p.0)).collect() }, Value::row(idx)]);
                }
                let x = v.arr()?;
                let dim = dim_of(&x, a, 1).unwrap_or(1);
                let sort_one = |vals: &[f64]| -> Vec<(f64, usize)> {
                    let mut s: Vec<(f64, usize)> = vals.iter().copied().zip(0..).collect();
                    s.sort_by(|p, q| {
                        let o = p.0.partial_cmp(&q.0).unwrap_or_else(|| if p.0.is_nan() { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Less });
                        if descend { o.reverse() } else { o }
                    });
                    s
                };
                let vals = running(&x, dim, &|v| sort_one(v).iter().map(|p| p.0).collect());
                let idx = running(&x, dim, &|v| sort_one(v).iter().map(|p| p.1 as f64 + 1.0).collect());
                return Ok(vec![if matches!(v, Value::Str(_)) { Value::Str(vals.re.iter().map(|c| char::from_u32(*c as u32).unwrap_or('?')).collect()) } else { Value::Num(vals) }, Value::Num(idx)]);
            }
            "sortrows" => {
                let x = arr(a, 0, name)?;
                let col = a.get(1).map(|v| v.scalar()).transpose()?.unwrap_or(1.0);
                let (k, desc) = ((col.abs() as usize).max(1) - 1, col < 0.0);
                let mut rows: Vec<(Vec<f64>, usize)> = x.to_rows().into_iter().zip(0..).collect();
                rows.sort_by(|p, q| {
                    let o = p.0[k].partial_cmp(&q.0[k]).unwrap_or(std::cmp::Ordering::Equal);
                    if desc { o.reverse() } else { o }
                });
                let idx: Vec<f64> = rows.iter().map(|r| r.1 as f64 + 1.0).collect();
                return Ok(vec![Value::Num(Arr::from_rows(&rows.into_iter().map(|r| r.0).collect::<Vec<_>>())), Value::col(idx)]);
            }
            "unique" => {
                let v = arg(a, 0, name)?;
                if let Value::Cell { items, .. } = &v {
                    let mut s: Vec<String> = items.iter().map(|x| x.text()).collect::<R<_>>()?;
                    s.sort();
                    s.dedup();
                    return one(str_cell(s, false));
                }
                let x = v.arr()?;
                let mut s = sorted(&x.re);
                s.dedup();
                let first: Vec<f64> = s.iter().map(|u| x.re.iter().position(|q| q == u).unwrap() as f64 + 1.0).collect();
                let back: Vec<f64> = x.re.iter().map(|q| s.iter().position(|u| u == q).map_or(f64::NAN, |k| k as f64 + 1.0)).collect();
                return Ok(vec![like(&x, s), Value::col(first), Value::col(back)]);
            }
            "find" => {
                let x = arr(a, 0, name)?;
                let limit = a.get(1).map(|v| v.usize()).transpose()?.unwrap_or(usize::MAX);
                let last = matches!(a.get(2), Some(Value::Str(s)) if s == "last");
                let mut k: Vec<usize> = (0..x.len()).filter(|&q| x.re[q] != 0.0 || x.im.as_ref().is_some_and(|im| im[q] != 0.0)).collect();
                if last {
                    let n = k.len().saturating_sub(limit);
                    k = k[n..].to_vec();
                } else {
                    k.truncate(limit);
                }
                if nargout >= 2 {
                    let rows: Vec<f64> = k.iter().map(|q| (q % x.r.max(1)) as f64 + 1.0).collect();
                    let cols: Vec<f64> = k.iter().map(|q| (q / x.r.max(1)) as f64 + 1.0).collect();
                    let vals: Vec<f64> = k.iter().map(|q| x.re[*q]).collect();
                    return Ok(vec![like(&x, rows), like(&x, cols), like(&x, vals)]);
                }
                let idx: Vec<f64> = k.iter().map(|q| *q as f64 + 1.0).collect();
                return one(if x.r == 1 { Value::row(idx) } else { Value::col(idx) });
            }
            "fliplr" | "flipud" | "flip" | "rot90" | "circshift" => {
                let v = arg(a, 0, name)?;
                if let Value::Str(s) = &v {
                    if matches!(name, "fliplr" | "flip") {
                        return one(Value::Str(s.chars().rev().collect()));
                    }
                }
                let x = v.arr()?;
                let get = |i: usize, j: usize| x.get(i, j);
                let (r, c) = (x.r, x.c);
                let out = match name {
                    "fliplr" => Arr::new(r, c, (0..c).flat_map(|j| (0..r).map(move |i| (i, j))).map(|(i, j)| get(i, c - 1 - j)).collect()),
                    "flipud" => Arr::new(r, c, (0..c).flat_map(|j| (0..r).map(move |i| (i, j))).map(|(i, j)| get(r - 1 - i, j)).collect()),
                    "flip" => {
                        if r == 1 { Arr::row(x.re.iter().rev().copied().collect()) } else { Arr::new(r, c, (0..c).flat_map(|j| (0..r).map(move |i| (i, j))).map(|(i, j)| get(r - 1 - i, j)).collect()) }
                    }
                    "rot90" => Arr::new(c, r, (0..r).flat_map(|j| (0..c).map(move |i| (i, j))).map(|(i, j)| get(j, c - 1 - i)).collect()),
                    _ => {
                        let k = scalar(a, 1, name)? as i64;
                        if r == 1 || c == 1 {
                            let n = x.len() as i64;
                            let v: Vec<f64> = (0..n).map(|q| x.re[((q - k).rem_euclid(n)) as usize]).collect();
                            Arr::new(r, c, v)
                        } else {
                            let n = r as i64;
                            Arr::new(r, c, (0..c).flat_map(|j| (0..r).map(move |i| (i, j))).map(|(i, j)| get(((i as i64 - k).rem_euclid(n)) as usize, j)).collect())
                        }
                    }
                };
                return one(Value::Num(out));
            }
            "tril" | "triu" => {
                let mut x = arr(a, 0, name)?;
                let k = a.get(1).map(|v| v.scalar()).transpose()?.unwrap_or(0.0) as i64;
                for j in 0..x.c {
                    for i in 0..x.r {
                        let d = j as i64 - i as i64;
                        if (name == "tril" && d > k) || (name == "triu" && d < k) {
                            x.re[j * x.r + i] = 0.0;
                        }
                    }
                }
                return one(Value::Num(x));
            }
            "trapz" | "cumtrapz" => {
                let (x, y) = if a.len() >= 2 { (Some(arr(a, 0, name)?.re), arr(a, 1, name)?) } else { (None, arr(a, 0, name)?) };
                let col = |v: &[f64]| -> Vec<f64> {
                    let mut acc = 0.0;
                    let mut out = vec![0.0];
                    for k in 1..v.len() {
                        let h = x.as_ref().map_or(1.0, |x| x[k] - x[k - 1]);
                        acc += 0.5 * h * (v[k] + v[k - 1]);
                        out.push(acc);
                    }
                    out
                };
                let dim = if y.r == 1 { 2 } else { 1 };
                if name == "trapz" {
                    return one(Value::Num(reduce(&y, dim, &|v| *col(v).last().unwrap_or(&0.0))));
                }
                return one(Value::Num(running(&y, dim, &col)));
            }
            "dot" => {
                let x = arr(a, 0, name)?;
                let y = arr(a, 1, name)?;
                if x.len() != y.len() {
                    return Err("dot: the vectors need the same length".into());
                }
                return num(x.re.iter().zip(&y.re).map(|(p, q)| p * q).sum());
            }
            "cross" => {
                let x = arr(a, 0, name)?.re;
                let y = arr(a, 1, name)?.re;
                if x.len() != 3 || y.len() != 3 {
                    return Err("cross: needs two 3-element vectors".into());
                }
                let o = vec![x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
                return one(like(&arr(a, 0, name)?, o));
            }
            "kron" => {
                let x = arr(a, 0, name)?;
                let y = arr(a, 1, name)?;
                let (r, c) = (x.r * y.r, x.c * y.c);
                let mut out = Arr::zeros(r, c);
                for i in 0..x.r {
                    for j in 0..x.c {
                        for p in 0..y.r {
                            for q in 0..y.c {
                                out.re[(j * y.c + q) * r + i * y.r + p] = x.get(i, j) * y.get(p, q);
                            }
                        }
                    }
                }
                return one(Value::Num(out));
            }
            "norm" => {
                let x = arr(a, 0, name)?;
                let p = a.get(1);
                let pv = match p {
                    Some(Value::Str(s)) if s == "fro" => -1.0,
                    Some(Value::Str(s)) if s.eq_ignore_ascii_case("inf") => f64::INFINITY,
                    Some(v) => v.scalar()?,
                    None => 2.0,
                };
                let mags: Vec<f64> = x.to_c().iter().map(|z| z.abs()).collect();
                if x.r == 1 || x.c == 1 {
                    return num(if pv.is_infinite() { mags.iter().cloned().fold(0.0, f64::max) } else if pv == -1.0 || pv == 2.0 { mags.iter().map(|v| v * v).sum::<f64>().sqrt() } else { mags.iter().map(|v| v.powf(pv)).sum::<f64>().powf(1.0 / pv) });
                }
                return num(match pv {
                    v if v == -1.0 => mags.iter().map(|v| v * v).sum::<f64>().sqrt(),
                    v if v == 1.0 => (0..x.c).map(|j| (0..x.r).map(|i| mags[j * x.r + i]).sum::<f64>()).fold(0.0, f64::max),
                    v if v.is_infinite() => (0..x.r).map(|i| (0..x.c).map(|j| mags[j * x.r + i]).sum::<f64>()).fold(0.0, f64::max),
                    _ => singular_values(&x).first().copied().unwrap_or(0.0),
                });
            }
            "det" => return num(crate::linalg::det(&square(&arr(a, 0, name)?, name)?)),
            "inv" => {
                let m = square(&arr(a, 0, name)?, name)?;
                if crate::linalg::det(&m).abs() < 1e-300 {
                    it.warnings.push("inv: the matrix is singular to working precision".into());
                    return one(Value::Num(Arr::new(m.len(), m.len(), vec![f64::INFINITY; m.len() * m.len()])));
                }
                return one(Value::Num(Arr::from_rows(&crate::linalg::inverse(&m)?)));
            }
            "pinv" => {
                let x = arr(a, 0, name)?;
                // (AᵀA)⁻¹Aᵀ for full column rank, else Aᵀ(AAᵀ)⁻¹.
                let m = x.to_rows();
                let at = crate::linalg::transpose(&m);
                let out = if x.r >= x.c {
                    crate::linalg::matmul(&crate::linalg::inverse(&crate::linalg::matmul(&at, &m))?, &at)
                } else {
                    crate::linalg::matmul(&at, &crate::linalg::inverse(&crate::linalg::matmul(&m, &at))?)
                };
                return one(Value::Num(Arr::from_rows(&out)));
            }
            "rank" => return num(crate::linalg::rank(&arr(a, 0, name)?.to_rows()) as f64),
            "trace" => {
                let x = arr(a, 0, name)?;
                return num((0..x.r.min(x.c)).map(|k| x.get(k, k)).sum());
            }
            "eig" => {
                let x = arr(a, 0, name)?;
                let m = square(&x, name)?;
                let symmetric = (0..m.len()).all(|i| (0..m.len()).all(|j| (m[i][j] - m[j][i]).abs() <= 1e-12 * (m[i][j].abs() + 1.0)));
                if symmetric {
                    let (vals, vecs) = crate::linalg::sym_eigen(&m);
                    // Ascending like MATLAB.
                    let n = vals.len();
                    let order: Vec<usize> = (0..n).rev().collect();
                    let v: Vec<f64> = order.iter().map(|&k| vals[k]).collect();
                    if nargout >= 2 {
                        let mut vm = Arr::zeros(n, n);
                        for (new, &old) in order.iter().enumerate() {
                            for i in 0..n {
                                vm.re[new * n + i] = vecs[i][old];
                            }
                        }
                        let mut d = Arr::zeros(n, n);
                        for k in 0..n {
                            d.re[k * n + k] = v[k];
                        }
                        return Ok(vec![Value::Num(vm), Value::Num(d)]);
                    }
                    return one(Value::col(v));
                }
                let ev = crate::linalg::eig_general(&m);
                if nargout >= 2 {
                    // Eigenvectors by inverse iteration on (A − λI) for each eigenvalue.
                    let n = m.len();
                    let mut vecs: Vec<Vec<C64>> = Vec::new();
                    for lam in &ev {
                        vecs.push(inverse_iteration(&x, *lam));
                    }
                    let flat: Vec<C64> = vecs.iter().flatten().copied().collect();
                    let mut d = vec![C64::ZERO; n * n];
                    for k in 0..n {
                        d[k * n + k] = ev[k];
                    }
                    return Ok(vec![Value::Num(Arr::from_c(n, n, &flat)), Value::Num(Arr::from_c(n, n, &d))]);
                }
                return one(Value::Num(Arr::from_c(ev.len(), 1, &ev)));
            }
            "svd" => {
                let x = arr(a, 0, name)?;
                let s = singular_values(&x);
                if nargout >= 2 {
                    let (u, sm, v) = svd_full(&x);
                    return Ok(vec![Value::Num(u), Value::Num(sm), Value::Num(v)]);
                }
                return one(Value::col(s));
            }
            "chol" => {
                let m = square(&arr(a, 0, name)?, name)?;
                let n = m.len();
                let mut l = vec![vec![0.0; n]; n];
                for i in 0..n {
                    for j in 0..=i {
                        let s: f64 = (0..j).map(|k| l[i][k] * l[j][k]).sum();
                        if i == j {
                            let d = m[i][i] - s;
                            if d <= 0.0 {
                                return Err("chol: the matrix must be positive definite".into());
                            }
                            l[i][j] = d.sqrt();
                        } else {
                            l[i][j] = (m[i][j] - s) / l[j][j];
                        }
                    }
                }
                // MATLAB returns the upper factor R with RᵀR = A.
                return one(Value::Num(Arr::from_rows(&l).transpose(false)));
            }
            "lu" => {
                let m = square(&arr(a, 0, name)?, name)?;
                let n = m.len();
                let mut u = m.clone();
                let mut l = crate::linalg::identity(n);
                let mut p: Vec<usize> = (0..n).collect();
                for c in 0..n {
                    let piv = (c..n).max_by(|&x, &y| u[x][c].abs().partial_cmp(&u[y][c].abs()).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
                    u.swap(c, piv);
                    p.swap(c, piv);
                    for k in 0..c {
                        let t = l[c][k];
                        l[c][k] = l[piv][k];
                        l[piv][k] = t;
                    }
                    for r in c + 1..n {
                        let f = if u[c][c] != 0.0 { u[r][c] / u[c][c] } else { 0.0 };
                        l[r][c] = f;
                        for k in c..n {
                            u[r][k] -= f * u[c][k];
                        }
                    }
                }
                let mut pm = vec![vec![0.0; n]; n];
                for (i, &k) in p.iter().enumerate() {
                    pm[i][k] = 1.0;
                }
                return Ok(vec![Value::Num(Arr::from_rows(&l)), Value::Num(Arr::from_rows(&u)), Value::Num(Arr::from_rows(&pm))]);
            }
            "qr" => {
                let x = arr(a, 0, name)?;
                let (q, rr) = qr(&x);
                return Ok(vec![Value::Num(q), Value::Num(rr)]);
            }
            "expm" => return one(Value::Num(Arr::from_rows(&crate::linalg::expm(&square(&arr(a, 0, name)?, name)?)))),
            "null" => {
                let x = arr(a, 0, name)?;
                let (_, s, v) = svd_full(&x);
                let tol = 1e-10 * s.re.iter().cloned().fold(0.0, f64::max).max(1.0);
                let rank = (0..s.r.min(s.c)).filter(|&k| s.get(k, k) > tol).count();
                let n = v.c;
                let cols: Vec<f64> = (rank..n).flat_map(|j| (0..v.r).map(move |i| (i, j))).map(|(i, j)| v.get(i, j)).collect();
                return one(Value::Num(Arr::new(v.r, n - rank, cols)));
            }
            "cond" => {
                let s = singular_values(&arr(a, 0, name)?);
                return num(s.first().copied().unwrap_or(0.0) / s.last().copied().unwrap_or(0.0));
            }
            "linsolve" => return one(Value::Num(left_divide(&arr(a, 0, name)?, &arr(a, 1, name)?)?)),
            // Polynomials.
            "polyfit" => {
                let x = arr(a, 0, name)?.re;
                let y = arr(a, 1, name)?.re;
                let n = scalar(a, 2, name)? as usize;
                if x.len() != y.len() {
                    return Err("polyfit: x and y need the same length".into());
                }
                let rows: Vec<Vec<f64>> = x.iter().map(|&xv| (0..=n).map(|k| xv.powi((n - k) as i32)).collect()).collect();
                let (p, _) = crate::linalg::lstsq(&rows, &y)?;
                return one(Value::row(p));
            }
            "polyval" => {
                let p = arr(a, 0, name)?.re;
                let x = arr(a, 1, name)?;
                if x.is_complex() {
                    return one(Value::Num(map_c(&x, &|z| p.iter().fold(C64::ZERO, |acc, c| acc * z + C64::new(*c, 0.0)))));
                }
                return one(Value::Num(map(&x, &|v| polyval(&p, v))));
            }
            "roots" => {
                let p = arr(a, 0, name)?.re;
                let r = crate::linalg::poly_roots(&p);
                return one(Value::Num(Arr::from_c(r.len(), 1, &r)));
            }
            "poly" => {
                let x = arr(a, 0, name)?;
                if x.r == x.c && x.r > 1 {
                    return one(Value::row(crate::linalg::char_poly(&x.to_rows())));
                }
                return one(Value::row(crate::nodes::control::poly_from_roots(&x.to_c())));
            }
            "conv" => return one(like(&arr(a, 0, name)?, conv(&arr(a, 0, name)?.re, &arr(a, 1, name)?.re))),
            "deconv" => {
                let mut num = arr(a, 0, name)?.re;
                let den = arr(a, 1, name)?.re;
                if den.is_empty() || den[0] == 0.0 {
                    return Err("deconv: the divisor's leading coefficient must not be zero".into());
                }
                if num.len() < den.len() {
                    return Ok(vec![Value::num(0.0), Value::row(num)]);
                }
                let mut q = vec![0.0; num.len() - den.len() + 1];
                for k in 0..q.len() {
                    q[k] = num[k] / den[0];
                    for (j, d) in den.iter().enumerate() {
                        num[k + j] -= q[k] * d;
                    }
                }
                return Ok(vec![Value::row(q), Value::row(num)]);
            }
            "polyder" => {
                let p = arr(a, 0, name)?.re;
                let n = p.len();
                return one(Value::row(if n <= 1 { vec![0.0] } else { (0..n - 1).map(|k| p[k] * (n - 1 - k) as f64).collect() }));
            }
            "polyint" => {
                let p = arr(a, 0, name)?.re;
                let k = a.get(1).map(|v| v.scalar()).transpose()?.unwrap_or(0.0);
                let n = p.len();
                let mut out: Vec<f64> = (0..n).map(|i| p[i] / (n - i) as f64).collect();
                out.push(k);
                return one(Value::row(out));
            }
            // Interpolation, integration, root finding, optimisation, ODEs.
            "interp1" => {
                let x = arr(a, 0, name)?;
                let y = arr(a, 1, name)?;
                let xi = arr(a, 2, name)?;
                let method = a.get(3).and_then(|v| if let Value::Str(s) = v { Some(s.to_ascii_lowercase()) } else { None }).unwrap_or_else(|| "linear".into());
                let extrap = a.iter().skip(3).find_map(|v| match v {
                    Value::Str(s) if s == "extrap" => Some(f64::INFINITY),
                    Value::Num(n) if n.len() == 1 => Some(n.re[0]),
                    _ => None,
                });
                let extrap = if extrap.is_none() && method == "spline" { Some(f64::INFINITY) } else { extrap };
                let out = interp1(&x.re, &y.re, &xi.re, &method, extrap)?;
                return one(Value::Num(Arr::new(xi.r, xi.c, out)));
            }
            "interp2" => {
                let x = arr(a, 0, name)?;
                let y = arr(a, 1, name)?;
                let z = arr(a, 2, name)?;
                let xi = arr(a, 3, name)?;
                let yi = arr(a, 4, name)?;
                let xv: Vec<f64> = if x.r == 1 || x.c == 1 { x.re.clone() } else { (0..z.c).map(|j| x.get(0, j)).collect() };
                let yv: Vec<f64> = if y.r == 1 || y.c == 1 { y.re.clone() } else { (0..z.r).map(|i| y.get(i, 0)).collect() };
                let at = |v: &[f64], t: f64| -> Option<(usize, f64)> {
                    if t < v[0] || t > *v.last()? {
                        return None;
                    }
                    let k = v.windows(2).position(|w| t <= w[1]).unwrap_or(v.len() - 2);
                    Some((k, (t - v[k]) / (v[k + 1] - v[k])))
                };
                let s = elementwise(&xi, &yi, &|_, _| 0.0)?;
                let xi2 = elementwise(&xi, &s, &|p, _| p)?;
                let yi2 = elementwise(&yi, &s, &|p, _| p)?;
                let out: Vec<f64> = xi2.re.iter().zip(&yi2.re).map(|(&px, &py)| match (at(&xv, px), at(&yv, py)) {
                    (Some((i, fx)), Some((j, fy))) => {
                        let v00 = z.get(j, i);
                        let v01 = z.get(j, i + 1);
                        let v10 = z.get(j + 1, i);
                        let v11 = z.get(j + 1, i + 1);
                        (1.0 - fy) * ((1.0 - fx) * v00 + fx * v01) + fy * ((1.0 - fx) * v10 + fx * v11)
                    }
                    _ => f64::NAN,
                }).collect();
                return one(Value::Num(Arr::new(s.r, s.c, out)));
            }
            "spline" => {
                let x = arr(a, 0, name)?.re;
                let y = arr(a, 1, name)?.re;
                let xi = arr(a, 2, name)?;
                let out = interp1(&x, &y, &xi.re, "spline", Some(f64::INFINITY))?;
                return one(Value::Num(Arr::new(xi.r, xi.c, out)));
            }
            "pchip" => {
                let x = arr(a, 0, name)?.re;
                let y = arr(a, 1, name)?.re;
                let xi = arr(a, 2, name)?;
                let out = interp1(&x, &y, &xi.re, "pchip", Some(f64::INFINITY))?;
                return one(Value::Num(Arr::new(xi.r, xi.c, out)));
            }
            "integral" | "quad" | "quadgk" | "quadl" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                let tol = 1e-10;
                return num(integrate(it, &f, scalar(a, 1, name)?, scalar(a, 2, name)?, tol)?);
            }
            "integral2" | "dblquad" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                let (xa, xb, ya, yb) = (scalar(a, 1, name)?, scalar(a, 2, name)?, scalar(a, 3, name)?, scalar(a, 4, name)?);
                let n = 100;
                let (hx, hy) = ((xb - xa) / n as f64, (yb - ya) / n as f64);
                let w = |k: usize| if k == 0 || k == n { 1.0 } else if k % 2 == 1 { 4.0 } else { 2.0 };
                let mut s = 0.0;
                for i in 0..=n {
                    for j in 0..=n {
                        let v = it.call_func(&f, vec![Value::num(xa + i as f64 * hx), Value::num(ya + j as f64 * hy)], 1)?.first().ok_or("integral2: no value")?.scalar()?;
                        s += w(i) * w(j) * v;
                    }
                }
                return num(s * hx * hy / 9.0);
            }
            "fzero" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                let x0 = arr(a, 1, name)?.re;
                let (mut lo, mut hi);
                if x0.len() >= 2 {
                    lo = x0[0];
                    hi = x0[1];
                } else {
                    // Search outward for a sign change.
                    let x = x0[0];
                    let fx = call_scalar(it, &f, x)?;
                    if fx == 0.0 {
                        return Ok(vec![Value::num(x), Value::num(0.0)]);
                    }
                    let mut d = if x != 0.0 { x.abs() / 50.0 } else { 1.0 / 50.0 };
                    let mut found = None;
                    for _ in 0..200 {
                        for cand in [x - d, x + d] {
                            if call_scalar(it, &f, cand)? * fx <= 0.0 {
                                found = Some(cand);
                                break;
                            }
                        }
                        if found.is_some() {
                            break;
                        }
                        d *= std::f64::consts::SQRT_2;
                    }
                    let other = found.ok_or("fzero: no sign change found around the starting point")?;
                    lo = x.min(other);
                    hi = x.max(other);
                }
                let mut flo = call_scalar(it, &f, lo)?;
                let fhi = call_scalar(it, &f, hi)?;
                if flo * fhi > 0.0 {
                    return Err("fzero: the function values at the interval ends must differ in sign".into());
                }
                // Bisection refined by secant steps (Brent-like, simple and safe).
                for _ in 0..200 {
                    let mid = 0.5 * (lo + hi);
                    let fm = call_scalar(it, &f, mid)?;
                    if fm == 0.0 || (hi - lo) < 4.0 * f64::EPSILON * mid.abs().max(1e-300) {
                        lo = mid;
                        hi = mid;
                        break;
                    }
                    if fm * flo < 0.0 {
                        hi = mid;
                    } else {
                        lo = mid;
                        flo = fm;
                    }
                }
                let x = 0.5 * (lo + hi);
                return Ok(vec![Value::num(x), Value::num(call_scalar(it, &f, x)?)]);
            }
            "fminbnd" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                let (mut lo, mut hi) = (scalar(a, 1, name)?, scalar(a, 2, name)?);
                let g = (5f64.sqrt() - 1.0) / 2.0;
                let mut c = hi - g * (hi - lo);
                let mut d = lo + g * (hi - lo);
                let mut fc = call_scalar(it, &f, c)?;
                let mut fd = call_scalar(it, &f, d)?;
                for _ in 0..200 {
                    if fc < fd {
                        hi = d;
                        d = c;
                        fd = fc;
                        c = hi - g * (hi - lo);
                        fc = call_scalar(it, &f, c)?;
                    } else {
                        lo = c;
                        c = d;
                        fc = fd;
                        d = lo + g * (hi - lo);
                        fd = call_scalar(it, &f, d)?;
                    }
                    if (hi - lo).abs() < 1e-10 * (1.0 + lo.abs()) {
                        break;
                    }
                }
                let x = 0.5 * (lo + hi);
                return Ok(vec![Value::num(x), Value::num(call_scalar(it, &f, x)?)]);
            }
            "fminsearch" | "fminunc" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                let x0 = arr(a, 1, name)?;
                let tol = get_opt(a.get(2), "TolX").unwrap_or(1e-8);
                let max = get_opt(a.get(2), "MaxIter").unwrap_or(200.0 * x0.len() as f64 * 10.0) as usize;
                let (x, fv, iters) = nelder_mead(it, &f, &x0.re, x0.c == 1, tol, max)?;
                let xv = Value::Num(Arr::new(x0.r, x0.c, x));
                return Ok(vec![xv, Value::num(fv), Value::num(1.0), Value::num(iters as f64)]);
            }
            "fsolve" | "lsqnonlin" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                let x0 = arr(a, 1, name)?;
                let col = x0.c == 1;
                let mut x = x0.re.clone();
                let n = x.len();
                let mut r = call_vec(it, &f, &x, col)?;
                let mut lambda = 1e-3;
                let norm = |r: &[f64]| r.iter().map(|v| v * v).sum::<f64>();
                for _ in 0..200 {
                    if norm(&r).sqrt() < 1e-12 {
                        break;
                    }
                    let m = r.len();
                    let mut j = vec![vec![0.0; n]; m];
                    for k in 0..n {
                        let h = 1e-7 * x[k].abs().max(1.0);
                        let mut xp = x.clone();
                        xp[k] += h;
                        let rp = call_vec(it, &f, &xp, col)?;
                        for i in 0..m {
                            j[i][k] = (rp[i] - r[i]) / h;
                        }
                    }
                    let mut improved = false;
                    for _ in 0..30 {
                        let mut am = vec![vec![0.0; n]; n];
                        let mut g = vec![0.0; n];
                        for p in 0..n {
                            for q in 0..n {
                                am[p][q] = (0..m).map(|i| j[i][p] * j[i][q]).sum();
                            }
                            g[p] = -(0..m).map(|i| j[i][p] * r[i]).sum::<f64>();
                            am[p][p] *= 1.0 + lambda;
                            am[p][p] += 1e-15;
                        }
                        let Ok(d) = crate::linalg::solve(&am, &g) else {
                            lambda *= 10.0;
                            continue;
                        };
                        let xn: Vec<f64> = x.iter().zip(&d).map(|(p, q)| p + q).collect();
                        let rn = call_vec(it, &f, &xn, col)?;
                        if norm(&rn) < norm(&r) {
                            x = xn;
                            r = rn;
                            lambda = (lambda * 0.3).max(1e-15);
                            improved = true;
                            break;
                        }
                        lambda *= 10.0;
                    }
                    if !improved {
                        break;
                    }
                }
                let ok = norm(&r).sqrt() < 1e-6;
                return Ok(vec![Value::Num(Arr::new(x0.r, x0.c, x)), Value::Num(Arr::new(r.len(), 1, r)), Value::num(if ok { 1.0 } else { -1.0 })]);
            }
            "optimset" | "odeset" | "optimoptions" => {
                let start = if name == "optimoptions" { 1 } else { 0 };
                let mut fields = Vec::new();
                let mut vals = Vec::new();
                let mut k = start;
                while k + 1 < a.len() {
                    fields.push(a[k].text()?);
                    vals.push(a[k + 1].clone());
                    k += 2;
                }
                return one(Value::Struct { r: 1, c: 1, fields, items: vec![vals] });
            }
            "ode45" | "ode23" | "ode113" | "ode15s" | "ode23s" | "ode23t" | "ode23tb" => return ode(it, name, a, nargout),
            "deval" => {
                let sol = arg(a, 0, name)?;
                let ti = arr(a, 1, name)?;
                if let Value::Struct { fields, items, .. } = &sol {
                    let x = items[0][fields.iter().position(|f| f == "x").ok_or("deval: not a solution structure")?].arr()?;
                    let y = items[0][fields.iter().position(|f| f == "y").ok_or("deval: not a solution structure")?].arr()?;
                    let mut out = Arr::zeros(y.r, ti.len());
                    for i in 0..y.r {
                        let row: Vec<f64> = (0..y.c).map(|j| y.get(i, j)).collect();
                        let v = interp1(&x.re, &row, &ti.re, "linear", Some(f64::INFINITY))?;
                        for (j, q) in v.iter().enumerate() {
                            out.re[j * y.r + i] = *q;
                        }
                    }
                    return one(Value::Num(out));
                }
                return Err("deval: give the structure ode45 returned".into());
            }
            "feval" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                return it.call_func(&f, a[1..].to_vec(), nargout.max(1));
            }
            "func2str" => return one(Value::Str(func_text(&as_func(&arg(a, 0, name)?, name)?))),
            "str2func" => {
                let s = text(a, 0, name)?;
                if s.starts_with('@') {
                    let prog = super::syntax::parse(&format!("__f = {s};"))?;
                    if let super::syntax::Stmt::Assign(_, e, _, _) = &prog.body[0] {
                        return one(it.eval(e)?);
                    }
                }
                return one(Value::Func(Func::Named(s)));
            }
            "cellfun" | "arrayfun" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                let uniform = !a.windows(2).any(|w| matches!(&w[0], Value::Str(s) if s.eq_ignore_ascii_case("UniformOutput")) && !w[1].truthy().unwrap_or(true));
                let inputs: Vec<&Value> = a[1..].iter().take_while(|v| !matches!(v, Value::Str(s) if s.eq_ignore_ascii_case("UniformOutput") || s.eq_ignore_ascii_case("ErrorHandler"))).collect();
                let (r, c) = inputs.first().ok_or_else(|| format!("{name}: give the array"))?.dims();
                let n = r * c;
                let nout = nargout.max(1);
                let mut results: Vec<Vec<Value>> = vec![Vec::with_capacity(n); nout];
                for k in 0..n {
                    let mut call_args = Vec::new();
                    for inp in &inputs {
                        call_args.push(match inp {
                            Value::Cell { items, .. } if name == "cellfun" => items[k].clone(),
                            other => index_value(other, &[Value::num(k as f64 + 1.0)])?,
                        });
                    }
                    let outs = match &f {
                        Func::Named(fname) if name == "cellfun" && matches!(fname.as_str(), "isempty" | "length" | "numel" | "ndims" | "isreal" | "isclass") => it.call_name(fname, call_args, nout, false)?,
                        _ => it.call_func(&f, call_args, nout)?,
                    };
                    for q in 0..nout {
                        results[q].push(outs.get(q).cloned().ok_or_else(|| format!("{name}: the function returned too few outputs"))?);
                    }
                }
                let mut out = Vec::new();
                for res in results {
                    if uniform {
                        let mut v = Vec::with_capacity(n);
                        let mut logical = true;
                        for x in &res {
                            let xa = x.arr().map_err(|_| format!("{name}: non-scalar outputs need 'UniformOutput', false"))?;
                            if xa.len() != 1 {
                                return Err(format!("{name}: non-scalar outputs need 'UniformOutput', false"));
                            }
                            logical &= xa.logical;
                            v.push(xa.re[0]);
                        }
                        let mut arr = Arr::new(r, c, v);
                        arr.logical = logical && n > 0;
                        out.push(Value::Num(arr));
                    } else {
                        out.push(Value::Cell { r, c, items: res });
                    }
                }
                return Ok(out);
            }
            "structfun" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                if let Value::Struct { items, .. } = arg(a, 1, name)? {
                    let mut v = Vec::new();
                    for x in &items[0] {
                        v.push(it.call_func(&f, vec![x.clone()], 1)?.first().ok_or("structfun: no value")?.scalar()?);
                    }
                    return one(Value::col(v));
                }
                return Err("structfun: give a structure".into());
            }
            // Signal processing.
            "fft" | "ifft" => {
                let x = arr(a, 0, name)?;
                let n_req = a.get(1).filter(|v| !v.is_empty()).map(|v| v.usize()).transpose()?;
                let col_mode = !(x.r == 1);
                let columns: Vec<Vec<C64>> = if col_mode { (0..x.c).map(|j| (0..x.r).map(|i| x.at_c(j * x.r + i)).collect()).collect() } else { vec![x.to_c()] };
                let mut out_cols = Vec::new();
                for colv in columns {
                    let n = n_req.unwrap_or(colv.len());
                    let mut v = colv.clone();
                    v.resize(n, C64::ZERO);
                    out_cols.push(dft(&v, name == "ifft"));
                }
                let n = out_cols.first().map_or(0, |c| c.len());
                let flat: Vec<C64> = out_cols.into_iter().flatten().collect();
                let mut res = if col_mode { Arr::from_c(n, flat.len() / n.max(1), &flat) } else { Arr::from_c(1, n, &flat) };
                if a.iter().any(|v| matches!(v, Value::Str(s) if s == "symmetric")) {
                    res.im = None;
                }
                return one(Value::Num(res));
            }
            "fftshift" | "ifftshift" => {
                let x = arr(a, 0, name)?;
                let n = x.len();
                let k = if name == "fftshift" { n.div_ceil(2) } else { n / 2 };
                let idx: Vec<usize> = (0..n).map(|q| (q + k) % n).collect();
                let mut out = Arr::new(x.r, x.c, idx.iter().map(|&q| x.re[q]).collect());
                out.im = x.im.as_ref().map(|im| idx.iter().map(|&q| im[q]).collect());
                return one(Value::Num(out));
            }
            "filter" => {
                let b = arr(a, 0, name)?.re;
                let den = arr(a, 1, name)?.re;
                let x = arr(a, 2, name)?;
                let zi = a.get(3).map(|v| v.arr()).transpose()?;
                let (y, zf) = filter(&b, &den, &x.re, zi.as_ref().map(|z| z.re.as_slice()))?;
                return Ok(vec![Value::Num(Arr::new(x.r, x.c, y)), Value::col(zf)]);
            }
            "filtfilt" => {
                let b = arr(a, 0, name)?.re;
                let den = arr(a, 1, name)?.re;
                let x = arr(a, 2, name)?;
                // Forward and backward, started from the first sample's steady state.
                let start = |v: &[f64]| -> Vec<f64> {
                    let dc = b.iter().sum::<f64>() / den.iter().sum::<f64>();
                    let x0 = v.first().copied().unwrap_or(0.0);
                    let n = b.len().max(den.len());
                    let bn: Vec<f64> = (0..n).map(|k| b.get(k).copied().unwrap_or(0.0) / den[0]).collect();
                    let an: Vec<f64> = (0..n).map(|k| den.get(k).copied().unwrap_or(0.0) / den[0]).collect();
                    let y0 = dc * x0;
                    let mut z = vec![0.0; n.saturating_sub(1)];
                    for k in (0..n.saturating_sub(1)).rev() {
                        z[k] = bn[k + 1] * x0 - an[k + 1] * y0 + z.get(k + 1).copied().unwrap_or(0.0);
                    }
                    z
                };
                let (y1, _) = filter(&b, &den, &x.re, Some(&start(&x.re)))?;
                let rev: Vec<f64> = y1.into_iter().rev().collect();
                let (y2, _) = filter(&b, &den, &rev, Some(&start(&rev)))?;
                return one(Value::Num(Arr::new(x.r, x.c, y2.into_iter().rev().collect())));
            }
            "butter" | "cheby1" | "cheby2" | "ellip" => {
                let (b, den) = digital_filter(name, a)?;
                return Ok(vec![Value::row(b), Value::row(den)]);
            }
            "freqz" => {
                let b = arr(a, 0, name)?.re;
                let den = match a.get(1) {
                    Some(v) => v.arr()?.re,
                    None => vec![1.0],
                };
                let n = a.get(2).map(|v| v.usize()).transpose()?.unwrap_or(512);
                let w: Vec<f64> = (0..n).map(|k| PI * k as f64 / n as f64).collect();
                let h: Vec<C64> = w.iter().map(|&wv| {
                    let z = C64::polar(1.0, -wv);
                    let p = |c: &[f64]| c.iter().rev().fold(C64::ZERO, |acc, v| acc * z + C64::new(*v, 0.0));
                    p(&b) / p(&den)
                }).collect();
                return Ok(vec![Value::Num(Arr::from_c(n, 1, &h)), Value::col(w)]);
            }
            "xcorr" => {
                let x = arr(a, 0, name)?.re;
                let y = match a.get(1).filter(|v| !matches!(v, Value::Str(_))) {
                    Some(v) => v.arr()?.re,
                    None => x.clone(),
                };
                let n = x.len().max(y.len());
                let mut r = Vec::with_capacity(2 * n - 1);
                for lag in -(n as i64 - 1)..=(n as i64 - 1) {
                    let mut s = 0.0;
                    for (k, xv) in x.iter().enumerate() {
                        let j = k as i64 - lag;
                        if j >= 0 && (j as usize) < y.len() {
                            s += xv * y[j as usize];
                        }
                    }
                    r.push(s);
                }
                let lags: Vec<f64> = (-(n as i64 - 1)..=(n as i64 - 1)).map(|v| v as f64).collect();
                return Ok(vec![Value::row(r), Value::row(lags)]);
            }
            "hann" | "hanning" | "hamming" | "blackman" | "rectwin" | "bartlett" => {
                let n = scalar(a, 0, name)? as usize;
                let kind = match name { "hanning" => "hann", "rectwin" => "rect", other => other };
                let mut w = crate::fft::window(kind, n)?;
                if name == "hanning" && n > 0 {
                    w = (1..=n).map(|k| 0.5 - 0.5 * (2.0 * PI * k as f64 / (n + 1) as f64).cos()).collect();
                }
                return one(Value::col(w));
            }
            "sinc" => return one(Value::Num(map(&arr(a, 0, name)?, &|v| if v == 0.0 { 1.0 } else { (PI * v).sin() / (PI * v) }))),
            "square" | "sawtooth" => {
                let t = arr(a, 0, name)?;
                let duty = a.get(1).map(|v| v.scalar()).transpose()?.unwrap_or(if name == "square" { 50.0 } else { 1.0 });
                return one(Value::Num(map(&t, &|v| {
                    let ph = (v / (2.0 * PI)).rem_euclid(1.0);
                    if name == "square" { if ph < duty / 100.0 { 1.0 } else { -1.0 } } else if ph < duty { -1.0 + 2.0 * ph / duty } else { 1.0 - 2.0 * (ph - duty) / (1.0 - duty).max(1e-12) }
                })));
            }
            "downsample" => {
                let x = arr(a, 0, name)?;
                let k = scalar(a, 1, name)? as usize;
                return one(like(&x, x.re.iter().step_by(k.max(1)).copied().collect()));
            }
            "upsample" => {
                let x = arr(a, 0, name)?;
                let k = scalar(a, 1, name)? as usize;
                return one(like(&x, x.re.iter().flat_map(|v| std::iter::once(*v).chain(std::iter::repeat(0.0).take(k.max(1) - 1))).collect()));
            }
            // Control design.
            "lqr" | "dlqr" | "lqe" | "care" | "dare" => {
                let am = arr(a, 0, name)?.to_rows();
                let bm = arr(a, 1, name)?.to_rows();
                let q = arr(a, 2, name)?.to_rows();
                let r = arr(a, 3, name)?.to_rows();
                return match name {
                    "lqr" => {
                        let x = crate::linalg::care(&am, &bm, &q, &r)?;
                        let k = crate::linalg::matmul(&crate::linalg::matmul(&crate::linalg::inverse(&r)?, &crate::linalg::transpose(&bm)), &x);
                        let cl = crate::linalg::add(&am, &crate::linalg::matmul(&bm, &k), -1.0);
                        let ev = crate::linalg::eig_general(&cl);
                        Ok(vec![Value::Num(Arr::from_rows(&k)), Value::Num(Arr::from_rows(&x)), Value::Num(Arr::from_c(ev.len(), 1, &ev))])
                    }
                    "dlqr" => {
                        let x = crate::linalg::dare(&am, &bm, &q, &r)?;
                        let btx = crate::linalg::matmul(&crate::linalg::transpose(&bm), &x);
                        let k = crate::linalg::matmul(&crate::linalg::inverse(&crate::linalg::add(&r, &crate::linalg::matmul(&btx, &bm), 1.0))?, &crate::linalg::matmul(&btx, &am));
                        Ok(vec![Value::Num(Arr::from_rows(&k)), Value::Num(Arr::from_rows(&x))])
                    }
                    "lqe" => {
                        // lqe(A, G, C, Q, R): L = P Cᵀ R⁻¹ with the filter Riccati equation.
                        let g = bm;
                        let c = q;
                        let qn = r;
                        let rn = arr(a, 4, name)?.to_rows();
                        let gq = crate::linalg::matmul(&crate::linalg::matmul(&g, &qn), &crate::linalg::transpose(&g));
                        let p = crate::linalg::care(&crate::linalg::transpose(&am), &crate::linalg::transpose(&c), &gq, &rn)?;
                        let l = crate::linalg::matmul(&crate::linalg::matmul(&p, &crate::linalg::transpose(&c)), &crate::linalg::inverse(&rn)?);
                        Ok(vec![Value::Num(Arr::from_rows(&l)), Value::Num(Arr::from_rows(&p))])
                    }
                    "care" => Ok(vec![Value::Num(Arr::from_rows(&crate::linalg::care(&am, &bm, &q, &r)?))]),
                    _ => Ok(vec![Value::Num(Arr::from_rows(&crate::linalg::dare(&am, &bm, &q, &r)?))]),
                };
            }
            "place" | "acker" => {
                let am = arr(a, 0, name)?.to_rows();
                let b = arr(a, 1, name)?;
                let p = arr(a, 2, name)?;
                let k = crate::nodes::control::acker(&am, &b.re[..am.len()], &p.to_c())?;
                return one(Value::row(k));
            }
            "ctrb" | "obsv" => {
                let am = arr(a, 0, name)?;
                let bm = arr(a, 1, name)?;
                let n = am.r;
                let mut blocks = Vec::new();
                let mut blk = if name == "ctrb" { bm.clone() } else { bm.clone() };
                for _ in 0..n {
                    blocks.push(Value::Num(blk.clone()));
                    blk = if name == "ctrb" { matmul(&am, &blk)? } else { matmul(&blk, &am)? };
                }
                return one(concat(&blocks, name == "ctrb")?);
            }
            // Statistics.
            "cov" => {
                let x = arr(a, 0, name)?;
                let x = if a.len() >= 2 { let y = arr(a, 1, name)?; Arr::from_rows(&x.re.iter().zip(&y.re).map(|(p, q)| vec![*p, *q]).collect::<Vec<_>>()) } else if x.r == 1 { x.transpose(false) } else { x };
                return one(Value::Num(covariance(&x, false)));
            }
            "corrcoef" | "corr" => {
                let x = arr(a, 0, name)?;
                let x = if a.len() >= 2 { let y = arr(a, 1, name)?; Arr::from_rows(&x.re.iter().zip(&y.re).map(|(p, q)| vec![*p, *q]).collect::<Vec<_>>()) } else { x };
                return one(Value::Num(covariance(&x, true)));
            }
            "histcounts" | "histc" | "hist" => {
                let x = arr(a, 0, name)?.re;
                let (lo, hi) = (x.iter().cloned().fold(f64::INFINITY, f64::min), x.iter().cloned().fold(f64::NEG_INFINITY, f64::max));
                let edges: Vec<f64> = match a.get(1) {
                    Some(v) if v.numel() > 1 => v.arr()?.re,
                    Some(v) => {
                        let n = v.usize()?.max(1);
                        (0..=n).map(|k| lo + (hi - lo) * k as f64 / n as f64).collect()
                    }
                    None => {
                        let n = if name == "hist" { 10 } else { ((x.len() as f64).sqrt().ceil() as usize).max(1) };
                        (0..=n).map(|k| lo + (hi - lo) * k as f64 / n as f64).collect()
                    }
                };
                let nb = edges.len() - 1;
                let mut counts = vec![0.0; nb.max(1)];
                for v in &x {
                    if let Some(k) = (0..nb).find(|&k| *v >= edges[k] && (*v < edges[k + 1] || (k == nb - 1 && *v <= edges[k + 1]))) {
                        counts[k] += 1.0;
                    }
                }
                let centers: Vec<f64> = (0..nb).map(|k| 0.5 * (edges[k] + edges[k + 1])).collect();
                return Ok(vec![Value::row(counts), Value::row(if name == "hist" { centers } else { edges })]);
            }
            "normpdf" | "normcdf" | "norminv" => {
                let x = arr(a, 0, name)?;
                let mu = a.get(1).map(|v| v.scalar()).transpose()?.unwrap_or(0.0);
                let s = a.get(2).map(|v| v.scalar()).transpose()?.unwrap_or(1.0);
                return one(Value::Num(map(&x, &|v| match name {
                    "normpdf" => (-(v - mu).powi(2) / (2.0 * s * s)).exp() / (s * (2.0 * PI).sqrt()),
                    "normcdf" => crate::rng::normal_cdf((v - mu) / s),
                    _ => mu + s * crate::rng::normal_inverse(v),
                })));
            }
            "tcdf" | "tinv" | "fcdf" | "chi2cdf" => {
                let x = arr(a, 0, name)?;
                let d1 = scalar(a, 1, name)?;
                let d2 = a.get(2).map(|v| v.scalar()).transpose()?.unwrap_or(1.0);
                return one(Value::Num(map(&x, &|v| match name {
                    "tcdf" => crate::special::t_cdf(v, d1),
                    "tinv" => crate::special::t_inv(v, d1),
                    "fcdf" => 1.0 - crate::special::f_sf(v, d1, d2),
                    _ => 1.0 - crate::special::chi2_sf(v, d1),
                })));
            }
            "ttest" | "ttest2" => {
                let x = arr(a, 0, name)?.re;
                let mean = |v: &[f64]| v.iter().sum::<f64>() / v.len() as f64;
                let (t, df) = if name == "ttest" {
                    let mu = match a.get(1) { Some(v) if v.numel() == 1 => v.scalar()?, _ => 0.0 };
                    let d: Vec<f64> = match a.get(1) { Some(v) if v.numel() > 1 => x.iter().zip(&v.arr()?.re).map(|(p, q)| p - q).collect(), _ => x.clone() };
                    let n = d.len() as f64;
                    ((mean(&d) - mu) / (variance(&d, 0.0) / n).sqrt(), n - 1.0)
                } else {
                    let y = arr(a, 1, name)?.re;
                    let (n1, n2) = (x.len() as f64, y.len() as f64);
                    let sp = ((n1 - 1.0) * variance(&x, 0.0) + (n2 - 1.0) * variance(&y, 0.0)) / (n1 + n2 - 2.0);
                    ((mean(&x) - mean(&y)) / (sp * (1.0 / n1 + 1.0 / n2)).sqrt(), n1 + n2 - 2.0)
                };
                let p = 2.0 * (1.0 - crate::special::t_cdf(t.abs(), df));
                let st = Value::Struct { r: 1, c: 1, fields: vec!["tstat".into(), "df".into()], items: vec![vec![Value::num(t), Value::num(df)]] };
                return Ok(vec![Value::boolean(p < 0.05), Value::num(p), Value::empty(), st]);
            }
            // Strings.
            "num2str" | "int2str" | "string" => {
                let v = arg(a, 0, name)?;
                let v = if name == "int2str" { Value::Num(map(&v.arr()?, &f64::round)) } else { v };
                return one(Value::Str(num2str(&v, a)?));
            }
            "mat2str" => return one(Value::Str(mat2str(&arg(a, 0, name)?)?)),
            "str2num" | "str2double" => {
                let s = arg(a, 0, name)?;
                let parse = |t: &str| -> f64 { let t = t.trim(); t.parse::<f64>().unwrap_or_else(|_| match t.to_ascii_lowercase().as_str() { "inf" => f64::INFINITY, "-inf" => f64::NEG_INFINITY, _ => f64::NAN }) };
                return one(match s {
                    Value::Cell { r, c, items } => Value::Num(Arr::new(r, c, items.iter().map(|x| x.text().map(|t| parse(&t)).unwrap_or(f64::NAN)).collect())),
                    other => {
                        let t = other.text()?;
                        if name == "str2num" {
                            let prog = super::syntax::parse(&format!("__v = [{t}];"))?;
                            if let super::syntax::Stmt::Assign(_, e, _, _) = &prog.body[0] {
                                return one(it.eval(e)?);
                            }
                        }
                        Value::num(parse(&t))
                    }
                });
            }
            "sprintf" => return one(Value::Str(sprintf(&text(a, 0, name)?, &a[1..])?)),
            "fprintf" | "printf" => {
                // fprintf(fid, fmt, …) with fid 1 or 2.
                let (fmt, rest) = match a.first() {
                    Some(Value::Num(x)) if x.len() == 1 && a.len() >= 2 && matches!(a[1], Value::Str(_)) => (text(a, 1, name)?, &a[2..]),
                    _ => (text(a, 0, name)?, &a[1..]),
                };
                let s = sprintf(&fmt, rest)?;
                it.print(&s);
                return Ok(Vec::new());
            }
            "disp" | "display" => {
                let v = arg(a, 0, name)?;
                let s = match &v {
                    Value::Str(s) => format!("{s}\n"),
                    Value::Num(x) if x.len() == 1 => format!("{}\n", short(&v)),
                    other => {
                        let d = display("", other);
                        d.trim_start_matches(" =").trim_start_matches(" ").trim_start_matches('\n').to_string()
                    }
                };
                it.print(&s);
                return Ok(Vec::new());
            }
            "error" => {
                if a.is_empty() {
                    return Ok(Vec::new());
                }
                let first = text(a, 0, name)?;
                // error('pkg:id', 'message %d', …)
                let (id, msg) = if a.len() >= 2 && first.contains(':') && !first.contains(' ') { (first.clone(), sprintf(&text(a, 1, name)?, &a[2..])?) } else { (String::new(), sprintf(&first, &a[1..])?) };
                return Err(if id.is_empty() { msg } else { format!("{id}\u{1}{msg}") });
            }
            "warning" => {
                if let Some(Value::Str(s)) = a.first() {
                    if matches!(s.as_str(), "off" | "on" | "query") {
                        return Ok(Vec::new());
                    }
                    let msg = sprintf(s, &a[1..])?;
                    it.warnings.push(msg.clone());
                    it.print(&format!("Warning: {msg}\n"));
                }
                return Ok(Vec::new());
            }
            "assert" => {
                if !arg(a, 0, name)?.truthy()? {
                    let msg = match a.get(1) { Some(v) => sprintf(&v.text()?, &a[2..])?, None => "assertion failed".into() };
                    return Err(msg);
                }
                return Ok(Vec::new());
            }
            "lasterr" => return one(Value::Str(it.last_error.clone())),
            "strcat" => {
                if a.iter().any(|v| matches!(v, Value::Cell { .. })) {
                    let n = a.iter().map(|v| if let Value::Cell { items, .. } = v { items.len() } else { 1 }).max().unwrap_or(0);
                    let out: Vec<String> = (0..n).map(|k| a.iter().map(|v| match v { Value::Cell { items, .. } => items.get(k).or(items.first()).map(|x| x.text().unwrap_or_default()).unwrap_or_default(), other => other.text().unwrap_or_default() }).collect()).collect();
                    return one(str_cell(out, true));
                }
                return one(Value::Str(a.iter().map(|v| v.text().map(|t| if matches!(v, Value::Str(_)) { t.trim_end().to_string() } else { t })).collect::<R<Vec<_>>>()?.concat()));
            }
            "strcmp" | "strcmpi" | "strncmp" | "strncmpi" => {
                let fold = name.ends_with('i');
                let n = if name.starts_with("strn") { Some(scalar(a, 2, name)? as usize) } else { None };
                let eq = |p: &str, q: &str| -> bool {
                    let (p, q) = if fold { (p.to_lowercase(), q.to_lowercase()) } else { (p.to_string(), q.to_string()) };
                    match n {
                        Some(n) => p.chars().take(n).collect::<String>() == q.chars().take(n).collect::<String>() && p.chars().count() >= n && q.chars().count() >= n,
                        None => p == q,
                    }
                };
                let (x, y) = (arg(a, 0, name)?, arg(a, 1, name)?);
                return one(match (&x, &y) {
                    (Value::Cell { r, c, items }, other) | (other, Value::Cell { r, c, items }) if !matches!(other, Value::Cell { .. }) => {
                        let t = other.text().unwrap_or_default();
                        let is_str = matches!(other, Value::Str(_));
                        Value::Num(Arr::boolean(*r, *c, items.iter().map(|v| is_str && matches!(v, Value::Str(s) if eq(s, &t))).collect()))
                    }
                    (Value::Cell { r, c, items }, Value::Cell { items: i2, .. }) => Value::Num(Arr::boolean(*r, *c, items.iter().zip(i2).map(|(p, q)| matches!((p, q), (Value::Str(s), Value::Str(t)) if eq(s, t))).collect())),
                    (Value::Str(s), Value::Str(t)) => Value::boolean(eq(s, t)),
                    _ => Value::boolean(false),
                });
            }
            "strrep" => return one(Value::Str(text(a, 0, name)?.replace(&text(a, 1, name)?, &text(a, 2, name)?))),
            "strtrim" | "deblank" => {
                return one(match arg(a, 0, name)? {
                    Value::Cell { r, c, items } => Value::Cell { r, c, items: items.iter().map(|x| x.text().map(|t| Value::Str(if name == "strtrim" { t.trim().to_string() } else { t.trim_end().to_string() }))).collect::<R<_>>()? },
                    other => Value::Str(if name == "strtrim" { other.text()?.trim().to_string() } else { other.text()?.trim_end().to_string() }),
                });
            }
            "upper" | "lower" => {
                let s = text(a, 0, name)?;
                return one(Value::Str(if name == "upper" { s.to_uppercase() } else { s.to_lowercase() }));
            }
            "strsplit" => {
                let s = text(a, 0, name)?;
                let delims: Vec<String> = match a.get(1) { Some(v) => cell_strings(v)?, None => vec![" ".into()] };
                let mut parts = vec![s];
                for d in &delims {
                    let d = d.replace("\\t", "\t").replace("\\n", "\n");
                    parts = parts.iter().flat_map(|p| p.split(d.as_str()).map(String::from).collect::<Vec<_>>()).collect();
                }
                return one(str_cell(parts, true));
            }
            "strjoin" => {
                let parts = cell_strings(&arg(a, 0, name)?)?;
                let d = match a.get(1) { Some(v) => v.text()?.replace("\\n", "\n").replace("\\t", "\t"), None => " ".into() };
                return one(Value::Str(parts.join(&d)));
            }
            "strfind" => {
                let s = text(a, 0, name)?;
                let pat = text(a, 1, name)?;
                let sc: Vec<char> = s.chars().collect();
                let pc: Vec<char> = pat.chars().collect();
                let hits: Vec<f64> = if pc.is_empty() || pc.len() > sc.len() { Vec::new() } else { (0..=sc.len() - pc.len()).filter(|&k| sc[k..k + pc.len()] == pc[..]).map(|k| k as f64 + 1.0).collect() };
                return one(if hits.is_empty() { Value::Num(Arr::zeros(1, 0)) } else { Value::row(hits) });
            }
            "contains" | "startsWith" | "endsWith" => {
                let pat = text(a, 1, name)?;
                let test = |s: &str| match name { "contains" => s.contains(&pat), "startsWith" => s.starts_with(&pat), _ => s.ends_with(&pat) };
                return one(match arg(a, 0, name)? {
                    Value::Cell { r, c, items } => Value::Num(Arr::boolean(r, c, items.iter().map(|x| x.text().map(|t| test(&t)).unwrap_or(false)).collect())),
                    other => Value::boolean(test(&other.text()?)),
                });
            }
            "regexprep" => {
                // Literal replacement (no regular-expression engine).
                return one(Value::Str(text(a, 0, name)?.replace(&text(a, 1, name)?, &text(a, 2, name)?)));
            }
            "blanks" => return one(Value::Str(" ".repeat(scalar(a, 0, name)? as usize))),
            "newline" => return one(Value::Str("\n".into())),
            "isspace" | "isletter" | "isdigit" | "isstrprop" => {
                let s = text(a, 0, name)?;
                let kind = if name == "isstrprop" { text(a, 1, name)? } else { name.to_string() };
                let v: Vec<bool> = s.chars().map(|c| match kind.as_str() { "isspace" | "wspace" => c.is_whitespace(), "isletter" | "alpha" => c.is_alphabetic(), _ => c.is_ascii_digit() }).collect();
                return one(Value::Num(Arr::boolean(1, v.len(), v)));
            }
            "fliptext" => return one(Value::Str(text(a, 0, name)?.chars().rev().collect())),
            "datestr" | "date" => return one(Value::Str("2026-01-01".into())),
            "tic" => return Ok(Vec::new()),
            "toc" => return if nargout > 0 { num(0.0) } else { Ok(Vec::new()) },
            "cputime" | "now" | "clock" => return num(0.0),
            // Cells and structures.
            "struct" => {
                if a.is_empty() {
                    return one(Value::Struct { r: 1, c: 1, fields: Vec::new(), items: vec![Vec::new()] });
                }
                let mut fields = Vec::new();
                let mut vals = Vec::new();
                let mut n = 1;
                let mut k = 0;
                while k + 1 < a.len() {
                    fields.push(a[k].text()?);
                    if let Value::Cell { items, .. } = &a[k + 1] {
                        if items.len() != 1 {
                            n = n.max(items.len());
                        }
                    }
                    vals.push(a[k + 1].clone());
                    k += 2;
                }
                let items: Vec<Vec<Value>> = (0..n).map(|e| vals.iter().map(|v| match v {
                    Value::Cell { items, .. } if items.len() == 1 => items[0].clone(),
                    Value::Cell { items, .. } if items.is_empty() => Value::empty(),
                    Value::Cell { items, .. } => items[e.min(items.len() - 1)].clone(),
                    other => other.clone(),
                }).collect()).collect();
                return one(Value::Struct { r: 1, c: n, fields, items });
            }
            "fieldnames" => {
                if let Value::Struct { fields, .. } = arg(a, 0, name)? {
                    return one(str_cell(fields, false));
                }
                return Err("fieldnames: give a structure".into());
            }
            "rmfield" => {
                if let Value::Struct { r, c, fields, items } = arg(a, 0, name)? {
                    let drop = cell_strings(&arg(a, 1, name)?)?;
                    let keep: Vec<usize> = (0..fields.len()).filter(|&k| !drop.contains(&fields[k])).collect();
                    return one(Value::Struct { r, c, fields: keep.iter().map(|&k| fields[k].clone()).collect(), items: items.iter().map(|it| keep.iter().map(|&k| it[k].clone()).collect()).collect() });
                }
                return Err("rmfield: give a structure".into());
            }
            "getfield" => {
                let f = text(a, 1, name)?;
                if let Value::Struct { fields, items, .. } = arg(a, 0, name)? {
                    let k = fields.iter().position(|x| *x == f).ok_or_else(|| format!("getfield: no field '{f}'"))?;
                    return one(items[0][k].clone());
                }
                return Err("getfield: give a structure".into());
            }
            "setfield" => {
                let f = text(a, 1, name)?;
                let v = arg(a, 2, name)?;
                let (r, c, mut fields, mut items) = match arg(a, 0, name)? {
                    Value::Struct { r, c, fields, items } => (r, c, fields, items),
                    _ => (1, 1, Vec::new(), vec![Vec::new()]),
                };
                match fields.iter().position(|x| *x == f) {
                    Some(k) => items[0][k] = v,
                    None => {
                        fields.push(f);
                        for (e, it) in items.iter_mut().enumerate() {
                            it.push(if e == 0 { v.clone() } else { Value::empty() });
                        }
                    }
                }
                return one(Value::Struct { r, c, fields, items });
            }
            "struct2cell" => {
                if let Value::Struct { items, .. } = arg(a, 0, name)? {
                    let n = items[0].len();
                    return one(Value::Cell { r: n, c: 1, items: items[0].clone() });
                }
                return Err("struct2cell: give a structure".into());
            }
            "cell2struct" => {
                if let Value::Cell { items, .. } = arg(a, 0, name)? {
                    let fields = cell_strings(&arg(a, 1, name)?)?;
                    return one(Value::Struct { r: 1, c: 1, fields, items: vec![items] });
                }
                return Err("cell2struct: give a cell array".into());
            }
            "num2cell" => {
                let v = arg(a, 0, name)?;
                let (r, c) = v.dims();
                let items: Vec<Value> = (0..r * c).map(|k| index_value(&v, &[Value::num(k as f64 + 1.0)])).collect::<R<_>>()?;
                return one(Value::Cell { r, c, items });
            }
            "cell2mat" => {
                if let Value::Cell { r, c, items } = arg(a, 0, name)? {
                    let mut rows = Vec::new();
                    for i in 0..r {
                        let row: Vec<Value> = (0..c).map(|j| items[j * r + i].clone()).collect();
                        rows.push(concat(&row, true)?);
                    }
                    return one(concat(&rows, false)?);
                }
                return Err("cell2mat: give a cell array".into());
            }
            "isequal" => {
                let first = arg(a, 0, name)?;
                return one(Value::boolean(a[1..].iter().all(|b| values_equal(&first, b))));
            }
            "ismember" => {
                let x = arg(a, 0, name)?;
                let set = arg(a, 1, name)?;
                if let (Value::Str(s), Value::Cell { items, .. }) = (&x, &set) {
                    let k = items.iter().position(|v| matches!(v, Value::Str(t) if t == s));
                    return Ok(vec![Value::boolean(k.is_some()), Value::num(k.map_or(0.0, |k| k as f64 + 1.0))]);
                }
                let xa = x.arr()?;
                let sa = set.arr()?;
                let locs: Vec<f64> = xa.re.iter().map(|v| sa.re.iter().position(|q| q == v).map_or(0.0, |k| k as f64 + 1.0)).collect();
                return Ok(vec![Value::Num(Arr::boolean(xa.r, xa.c, locs.iter().map(|l| *l > 0.0).collect())), Value::Num(Arr::new(xa.r, xa.c, locs))]);
            }
            "setdiff" | "intersect" | "union" => {
                let x = sorted(&arr(a, 0, name)?.re);
                let y = sorted(&arr(a, 1, name)?.re);
                let mut out: Vec<f64> = match name {
                    "setdiff" => x.iter().copied().filter(|v| !y.contains(v)).collect(),
                    "intersect" => x.iter().copied().filter(|v| y.contains(v)).collect(),
                    _ => x.iter().chain(&y).copied().collect(),
                };
                out.sort_by(|p, q| p.partial_cmp(q).unwrap());
                out.dedup();
                return one(Value::row(out));
            }
            "accumarray" => {
                let subs = arr(a, 0, name)?.re;
                let vals = arr(a, 1, name)?;
                let n = subs.iter().cloned().fold(0.0, f64::max) as usize;
                let mut out = vec![0.0; n];
                for (k, s) in subs.iter().enumerate() {
                    out[*s as usize - 1] += if vals.len() == 1 { vals.re[0] } else { vals.re[k] };
                }
                return one(Value::col(out));
            }
            // Workspace and files.
            "clc" | "close" | "format" | "more" | "drawnow" | "pause" | "beep" | "clearvars" | "echo" | "pkg" | "box" | "colorbar" | "colormap" | "shading" | "view" | "axis" | "set" | "rotate3d" | "zlabel" | "caxis" | "daspect" => return Ok(Vec::new()),
            "clear" => {
                if a.is_empty() || matches!(a.first(), Some(Value::Str(s)) if s == "all" || s == "variables") {
                    it.scopes.last_mut().unwrap().clear();
                } else {
                    for v in a {
                        let n = v.text()?;
                        it.scopes.last_mut().unwrap().remove(&n);
                    }
                }
                return Ok(Vec::new());
            }
            "who" | "whos" => {
                let mut names: Vec<String> = it.scopes.last().unwrap().keys().cloned().collect();
                names.sort();
                let lines: Vec<String> = names.iter().map(|n| { let v = &it.scopes.last().unwrap()[n]; let (r, c) = v.dims(); format!("  {n}  {r}×{c}  {}", v.class()) }).collect();
                let s = lines.join("\n") + "\n";
                it.print(&s);
                return Ok(Vec::new());
            }
            "load" => {
                let path = text(a, 0, name)?;
                let bytes = it.host.read_bytes(&path)?;
                let lower = path.to_ascii_lowercase();
                if lower.ends_with(".csv") || lower.ends_with(".txt") || lower.ends_with(".dat") {
                    let t = crate::data::parse_csv(&String::from_utf8_lossy(&bytes), "data")?;
                    let cols: Vec<Vec<f64>> = t.columns.iter().map(|c| c.values.clone()).collect();
                    let r = cols.first().map_or(0, |c| c.len());
                    return one(Value::Num(Arr::new(r, cols.len(), cols.into_iter().flatten().collect())));
                }
                let vars = crate::matfile::read(&bytes)?;
                let pick: Vec<String> = a[1..].iter().filter_map(|v| v.text().ok()).collect();
                let vars: Vec<_> = vars.into_iter().filter(|(n, _)| pick.is_empty() || pick.contains(n)).collect();
                if nargout >= 1 {
                    return one(Value::Struct { r: 1, c: 1, fields: vars.iter().map(|v| v.0.clone()).collect(), items: vec![vars.iter().map(|v| mat_to_value(&v.1)).collect()] });
                }
                for (n, v) in vars {
                    let val = mat_to_value(&v);
                    it.set_var(&n, val);
                }
                return Ok(Vec::new());
            }
            "save" => {
                let path = text(a, 0, name)?;
                let names: Vec<String> = a[1..].iter().filter_map(|v| v.text().ok()).filter(|s| !s.starts_with('-')).collect();
                let scope = it.scopes.last().unwrap();
                let mut keys: Vec<&String> = scope.keys().filter(|k| names.is_empty() || names.contains(k)).collect();
                keys.sort();
                let vars: Vec<(String, crate::matfile::MatValue)> = keys.iter().filter_map(|k| value_to_mat(&scope[*k]).map(|m| ((*k).clone(), m))).collect();
                let path = if path.contains('.') { path } else { format!("{path}.mat") };
                it.host.write_bytes(&path, &crate::matfile::write_v5(&vars))?;
                return Ok(Vec::new());
            }
            "readmatrix" | "csvread" | "dlmread" => {
                let path = text(a, 0, name)?;
                let txt = it.host.read_file(&path)?;
                let t = crate::data::parse_csv(&txt, "data")?;
                let cols: Vec<Vec<f64>> = t.columns.iter().map(|c| c.values.clone()).collect();
                let r = cols.first().map_or(0, |c| c.len());
                return one(Value::Num(Arr::new(r, cols.len(), cols.into_iter().flatten().collect())));
            }
            "writematrix" | "csvwrite" | "dlmwrite" => {
                let (m, path) = if name == "writematrix" { (arr(a, 0, name)?, text(a, 1, name)?) } else { (arr(a, 1, name)?, text(a, 0, name)?) };
                let s: String = (0..m.r).map(|i| (0..m.c).map(|j| crate::data::format_number(m.get(i, j))).collect::<Vec<_>>().join(",") + "\n").collect();
                it.host.write_file(&path, &s)?;
                return Ok(Vec::new());
            }
            // Plotting.
            "figure" => {
                it.figures.push(Figure::default());
                it.current = it.figures.len() - 1;
                it.hold = false;
                if let Some(Value::Str(t)) = a.iter().skip_while(|v| !matches!(v, Value::Str(s) if s.eq_ignore_ascii_case("name"))).nth(1) {
                    it.figures[it.current].title = t.clone();
                }
                return Ok(Vec::new());
            }
            "subplot" => {
                let tag = a.iter().map(|v| v.scalar().map(|x| format_num(x)).unwrap_or_default()).collect::<Vec<_>>().join(",");
                let base = figure(it).title.clone();
                let title = format!("subplot({tag})");
                let existing = it.figures.iter().position(|f| f.title == title || f.title.ends_with(&format!("[{title}]")));
                match existing {
                    Some(k) => it.current = k,
                    None => {
                        let cur = &it.figures[it.current];
                        if cur.series.is_empty() && cur.surfaces.is_empty() {
                            it.figures[it.current].title = title;
                        } else {
                            it.figures.push(Figure { title, ..Default::default() });
                            it.current = it.figures.len() - 1;
                        }
                    }
                }
                let _ = base;
                return Ok(Vec::new());
            }
            "hold" => {
                it.hold = match a.first() {
                    Some(v) => !matches!(v.text().as_deref(), Ok("off")),
                    None => !it.hold,
                };
                return Ok(Vec::new());
            }
            "grid" | "legend" => {
                if name == "legend" {
                    let names: Vec<String> = a.iter().flat_map(|v| cell_strings(v).unwrap_or_default()).filter(|s| !["location", "best", "northeast", "northwest", "southeast", "southwest", "off", "show"].contains(&s.to_ascii_lowercase().as_str())).collect();
                    let fig = figure(it);
                    for (s, n) in fig.series.iter_mut().zip(&names) {
                        s.name = n.clone();
                    }
                    fig.legend = names;
                }
                return Ok(Vec::new());
            }
            "title" | "xlabel" | "ylabel" | "sgtitle" => {
                let t = match a.first() { Some(v) => v.text()?, None => String::new() };
                let fig = figure(it);
                match name {
                    "xlabel" => fig.xlabel = t,
                    "ylabel" => fig.ylabel = t,
                    _ => {
                        if fig.title.starts_with("subplot(") {
                            fig.title = format!("{t} [{}]", fig.title);
                        } else {
                            fig.title = t;
                        }
                    }
                }
                return Ok(Vec::new());
            }
            "plot" | "semilogx" | "semilogy" | "loglog" | "stairs" | "stem" | "scatter" | "bar" | "area" | "plot3" | "errorbar" => {
                plot_series(it, a, match name { "scatter" => "scatter", "bar" => "bar", "stairs" => "step", "stem" => "stem", "area" => "area", _ => name })?;
                return Ok(Vec::new());
            }
            "fplot" => {
                let f = as_func(&arg(a, 0, name)?, name)?;
                let lim = match a.get(1) { Some(v) => v.arr()?.re, None => vec![-5.0, 5.0] };
                let xs: Vec<f64> = (0..=400).map(|k| lim[0] + (lim[1] - lim[0]) * k as f64 / 400.0).collect();
                let mut ys = Vec::with_capacity(xs.len());
                for x in &xs {
                    ys.push(call_scalar(it, &f, *x)?);
                }
                plot_series(it, &[Value::row(xs), Value::row(ys)], "plot")?;
                return Ok(Vec::new());
            }
            "histogram" => {
                let x = arr(a, 0, name)?.re;
                let n = a.get(1).map(|v| v.usize()).transpose()?.unwrap_or(((x.len() as f64).sqrt().ceil() as usize).clamp(1, 100));
                let (lo, hi) = (x.iter().cloned().fold(f64::INFINITY, f64::min), x.iter().cloned().fold(f64::NEG_INFINITY, f64::max));
                let mut counts = vec![0.0; n];
                for v in &x {
                    let k = (((v - lo) / (hi - lo).max(1e-300)) * n as f64) as usize;
                    counts[k.min(n - 1)] += 1.0;
                }
                let centers: Vec<f64> = (0..n).map(|k| lo + (k as f64 + 0.5) * (hi - lo) / n as f64).collect();
                plot_series(it, &[Value::row(centers), Value::row(counts)], "bar")?;
                return Ok(Vec::new());
            }
            "surf" | "mesh" | "contour" | "contourf" | "imagesc" | "pcolor" | "image" | "surfc" | "meshc" | "heatmap" => {
                surface(it, a, name)?;
                return Ok(Vec::new());
            }
            "xlim" | "ylim" | "zlim" | "text" | "line" | "annotation" | "yline" | "xline" | "patch" | "fill" => return Ok(Vec::new()),
            _ => Err("\u{0}".into()),
        }
    })();
    match r {
        Err(e) if e == "\u{0}" => None,
        other => Some(other),
    }
}

fn fill_const(a: &[Value], v: f64) -> Out {
    let (r, c) = size_args(a, "")?;
    one(Value::Num(Arr::new(r, c, vec![v; r * c])))
}

fn complex_fn(name: &str, z: C64) -> C64 {
    let i = C64::new(0.0, 1.0);
    let ln = |z: C64| C64::new(z.abs().ln(), z.arg());
    let sqrt = |z: C64| z.sqrt();
    match name {
        "sqrt" => sqrt(z),
        "exp" => z.exp(),
        "log" => ln(z),
        "log10" => ln(z).scale(1.0 / std::f64::consts::LN_10),
        "log2" => ln(z).scale(1.0 / std::f64::consts::LN_2),
        "sin" => C64::new(z.re.sin() * z.im.cosh(), z.re.cos() * z.im.sinh()),
        "cos" => C64::new(z.re.cos() * z.im.cosh(), -z.re.sin() * z.im.sinh()),
        "tan" => complex_fn("sin", z) / complex_fn("cos", z),
        "sinh" => (z.exp() - (-z).exp()).scale(0.5),
        "cosh" => (z.exp() + (-z).exp()).scale(0.5),
        "tanh" => complex_fn("sinh", z) / complex_fn("cosh", z),
        "asin" => {
            let w = ln(i * z + sqrt(C64::ONE - z * z));
            C64::new(w.im, -w.re)
        }
        "acos" => {
            let w = ln(z + i * sqrt(C64::ONE - z * z));
            C64::new(w.im, -w.re)
        }
        "atan" => (ln(C64::ONE - i * z) - ln(C64::ONE + i * z)) * i.scale(0.5),
        "acosh" => ln(z + sqrt(z * z - C64::ONE)),
        "asinh" => ln(z + sqrt(z * z + C64::ONE)),
        "atanh" => (ln(C64::ONE + z) - ln(C64::ONE - z)).scale(0.5),
        _ => C64::new(f64::NAN, f64::NAN),
    }
}

fn is_prime(v: f64) -> bool {
    if v < 2.0 || v.fract() != 0.0 {
        return false;
    }
    let n = v as u64;
    let mut d = 2;
    while d * d <= n {
        if n % d == 0 {
            return false;
        }
        d += 1;
    }
    true
}

fn magic(n: usize) -> Vec<Vec<f64>> {
    let mut m = vec![vec![0.0; n]; n];
    if n == 0 {
        return m;
    }
    if n % 2 == 1 {
        let (mut i, mut j) = (0usize, n / 2);
        for k in 1..=n * n {
            m[i][j] = k as f64;
            let (ni, nj) = ((i + n - 1) % n, (j + 1) % n);
            if m[ni][nj] != 0.0 {
                i = (i + 1) % n;
            } else {
                i = ni;
                j = nj;
            }
        }
    } else if n % 4 == 0 {
        for i in 0..n {
            for j in 0..n {
                let v = (i * n + j + 1) as f64;
                let keep = ((i % 4 == 0 || i % 4 == 3) && (j % 4 == 0 || j % 4 == 3)) || ((i % 4 == 1 || i % 4 == 2) && (j % 4 == 1 || j % 4 == 2));
                m[i][j] = if keep { (n * n + 1) as f64 - v } else { v };
            }
        }
    } else {
        // LUX method for singly even n.
        let h = n / 2;
        let sub = magic(h);
        let add = [0.0, 2.0, 3.0, 1.0];
        for i in 0..h {
            for j in 0..h {
                let v = sub[i][j];
                m[i][j] = v + add[0] * (h * h) as f64;
                m[i + h][j + h] = v + add[3] * (h * h) as f64;
                m[i][j + h] = v + add[1] * (h * h) as f64;
                m[i + h][j] = v + add[2] * (h * h) as f64;
            }
        }
        let k = (n - 2) / 4;
        for i in 0..h {
            let cols: Vec<usize> = (0..n).filter(|&j| if i == h / 2 { j >= 1 && j <= k } else { j < k }).chain(n - k + 1..n).collect();
            for j in cols {
                let t = m[i][j];
                m[i][j] = m[i + h][j];
                m[i + h][j] = t;
            }
        }
    }
    m
}

fn square(a: &Arr, f: &str) -> R<Vec<Vec<f64>>> {
    if a.r != a.c {
        return Err(format!("{f}: the matrix must be square ({}×{})", a.r, a.c));
    }
    if a.is_complex() {
        return Err(format!("{f}: complex matrices are not supported here"));
    }
    Ok(a.to_rows())
}

fn singular_values(a: &Arr) -> Vec<f64> {
    let m = a.to_rows();
    let at = crate::linalg::transpose(&m);
    let ata = if a.r >= a.c { crate::linalg::matmul(&at, &m) } else { crate::linalg::matmul(&m, &at) };
    let (vals, _) = crate::linalg::sym_eigen(&ata);
    vals.iter().map(|v| v.max(0.0).sqrt()).collect()
}

/// A = U S Vᵀ from the eigen decomposition of AᵀA (fine for well-conditioned matrices).
fn svd_full(a: &Arr) -> (Arr, Arr, Arr) {
    let m = a.to_rows();
    let at = crate::linalg::transpose(&m);
    let ata = crate::linalg::matmul(&at, &m);
    let (vals, v) = crate::linalg::sym_eigen(&ata);
    let n = a.c;
    let r = a.r;
    let s: Vec<f64> = vals.iter().map(|x| x.max(0.0).sqrt()).collect();
    // U columns = A v / σ, completed to an orthonormal basis by Gram–Schmidt.
    let mut u: Vec<Vec<f64>> = Vec::new();
    for k in 0..n.min(r) {
        let vk: Vec<f64> = (0..n).map(|i| v[i][k]).collect();
        let av = crate::linalg::matvec(&m, &vk);
        if s[k] > 1e-12 {
            u.push(av.iter().map(|x| x / s[k]).collect());
        }
    }
    let mut e = 0;
    while u.len() < r && e < r {
        let mut cand = vec![0.0; r];
        cand[e] = 1.0;
        for q in &u {
            let d: f64 = q.iter().zip(&cand).map(|(p, c)| p * c).sum();
            for i in 0..r {
                cand[i] -= d * q[i];
            }
        }
        let nrm = cand.iter().map(|x| x * x).sum::<f64>().sqrt();
        if nrm > 1e-8 {
            u.push(cand.iter().map(|x| x / nrm).collect());
        }
        e += 1;
    }
    let uarr = Arr::new(r, r, (0..r).flat_map(|j| (0..r).map(move |i| (i, j))).map(|(i, j)| u[j][i]).collect());
    let mut sarr = Arr::zeros(r, n);
    for k in 0..r.min(n) {
        sarr.re[k * r + k] = s[k];
    }
    let varr = Arr::from_rows(&v);
    (uarr, sarr, varr)
}

fn qr(a: &Arr) -> (Arr, Arr) {
    // Modified Gram–Schmidt on the columns, completed to a square Q.
    let (r, c) = (a.r, a.c);
    let mut q: Vec<Vec<f64>> = Vec::new();
    let mut rr = Arr::zeros(r, c);
    for j in 0..c {
        let mut v: Vec<f64> = (0..r).map(|i| a.get(i, j)).collect();
        for (k, qk) in q.iter().enumerate() {
            let d: f64 = qk.iter().zip(&v).map(|(p, x)| p * x).sum();
            rr.re[j * r + k] = d;
            for i in 0..r {
                v[i] -= d * qk[i];
            }
        }
        let nrm = v.iter().map(|x| x * x).sum::<f64>().sqrt();
        if q.len() < r {
            rr.re[j * r + q.len()] = nrm;
            if nrm > 1e-14 {
                q.push(v.iter().map(|x| x / nrm).collect());
            }
        }
    }
    let mut e = 0;
    while q.len() < r && e < r {
        let mut cand = vec![0.0; r];
        cand[e] = 1.0;
        for qk in &q {
            let d: f64 = qk.iter().zip(&cand).map(|(p, x)| p * x).sum();
            for i in 0..r {
                cand[i] -= d * qk[i];
            }
        }
        let nrm = cand.iter().map(|x| x * x).sum::<f64>().sqrt();
        if nrm > 1e-8 {
            q.push(cand.iter().map(|x| x / nrm).collect());
        }
        e += 1;
    }
    let qa = Arr::new(r, r, (0..r).flat_map(|j| (0..r).map(move |i| (i, j))).map(|(i, j)| q[j][i]).collect());
    (qa, rr)
}

fn inverse_iteration(a: &Arr, lam: C64) -> Vec<C64> {
    let n = a.r;
    let shift = C64::new(lam.re + 1e-10 * (1.0 + lam.abs()), lam.im);
    let mut m: Vec<Vec<C64>> = (0..n).map(|i| (0..n).map(|j| C64::new(a.get(i, j), 0.0) - if i == j { shift } else { C64::ZERO }).collect()).collect();
    // LU once.
    let mut piv: Vec<usize> = (0..n).collect();
    for c in 0..n {
        let p = (c..n).max_by(|&x, &y| m[x][c].abs().partial_cmp(&m[y][c].abs()).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
        m.swap(c, p);
        piv.swap(c, p);
        if m[c][c].abs() < 1e-300 {
            m[c][c] = C64::new(1e-300, 0.0);
        }
        for r in c + 1..n {
            let f = m[r][c] / m[c][c];
            m[r][c] = f;
            for k in c + 1..n {
                let v = m[c][k];
                m[r][k] = m[r][k] - f * v;
            }
        }
    }
    let mut x = vec![C64::ONE; n];
    for _ in 0..3 {
        let mut y: Vec<C64> = piv.iter().map(|&p| x[p]).collect();
        for r in 0..n {
            for k in 0..r {
                let v = m[r][k] * y[k];
                y[r] = y[r] - v;
            }
        }
        for r in (0..n).rev() {
            for k in r + 1..n {
                let v = m[r][k] * y[k];
                y[r] = y[r] - v;
            }
            y[r] = y[r] / m[r][r];
        }
        let nrm = y.iter().map(|v| v.norm2()).sum::<f64>().sqrt().max(1e-300);
        x = y.iter().map(|v| v.scale(1.0 / nrm)).collect();
    }
    // Sign: the largest component real and positive.
    let k = (0..n).max_by(|&p, &q| x[p].abs().partial_cmp(&x[q].abs()).unwrap_or(std::cmp::Ordering::Equal)).unwrap_or(0);
    let ph = x[k] / C64::new(x[k].abs().max(1e-300), 0.0);
    x.iter().map(|v| *v / ph).collect()
}

fn dft(v: &[C64], inverse: bool) -> Vec<C64> {
    let n = v.len();
    if n == 0 {
        return Vec::new();
    }
    if n.is_power_of_two() {
        let mut buf = v.to_vec();
        fft_in_place(&mut buf, inverse);
        if inverse {
            return buf.iter().map(|z| z.scale(1.0 / n as f64)).collect();
        }
        return buf;
    }
    // Bluestein for any length.
    let m = (2 * n - 1).next_power_of_two();
    let sign = if inverse { 1.0 } else { -1.0 };
    let w: Vec<C64> = (0..n).map(|k| C64::polar(1.0, sign * PI * ((k * k) % (2 * n)) as f64 / n as f64)).collect();
    let mut a = vec![C64::ZERO; m];
    for k in 0..n {
        a[k] = v[k] * w[k];
    }
    let mut b = vec![C64::ZERO; m];
    b[0] = w[0].conj();
    for k in 1..n {
        b[k] = w[k].conj();
        b[m - k] = w[k].conj();
    }
    fft_in_place(&mut a, false);
    fft_in_place(&mut b, false);
    let mut c: Vec<C64> = a.iter().zip(&b).map(|(p, q)| *p * *q).collect();
    fft_in_place(&mut c, true);
    let scale = 1.0 / m as f64;
    (0..n).map(|k| {
        let z = c[k].scale(scale) * w[k];
        if inverse { z.scale(1.0 / n as f64) } else { z }
    }).collect()
}

fn covariance(x: &Arr, corr: bool) -> Arr {
    let (n, p) = (x.r, x.c);
    let means: Vec<f64> = (0..p).map(|j| (0..n).map(|i| x.get(i, j)).sum::<f64>() / n as f64).collect();
    let mut c = Arr::zeros(p, p);
    for a in 0..p {
        for b in 0..p {
            let s: f64 = (0..n).map(|i| (x.get(i, a) - means[a]) * (x.get(i, b) - means[b])).sum::<f64>() / (n as f64 - 1.0).max(1.0);
            c.re[b * p + a] = s;
        }
    }
    if corr {
        let d: Vec<f64> = (0..p).map(|k| c.re[k * p + k].sqrt()).collect();
        for a in 0..p {
            for b in 0..p {
                c.re[b * p + a] /= d[a] * d[b];
            }
        }
    }
    if p == 1 && !corr {
        return c;
    }
    c
}

pub fn values_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Str(x), Value::Str(y)) => x == y,
        (Value::Cell { r, c, items }, Value::Cell { r: r2, c: c2, items: i2 }) => r == r2 && c == c2 && items.iter().zip(i2).all(|(p, q)| values_equal(p, q)),
        (Value::Struct { fields, items, .. }, Value::Struct { fields: f2, items: i2, .. }) => fields == f2 && items.len() == i2.len() && items.iter().zip(i2).all(|(p, q)| p.iter().zip(q).all(|(x, y)| values_equal(x, y))),
        (Value::Num(x), Value::Num(y)) => x.r == y.r && x.c == y.c && x.re == y.re && x.im.clone().unwrap_or_default() == y.im.clone().unwrap_or_default(),
        (Value::Num(x), Value::Str(s)) | (Value::Str(s), Value::Num(x)) => {
            let codes: Vec<f64> = s.chars().map(|c| c as u32 as f64).collect();
            x.re == codes && x.r == 1
        }
        _ => false,
    }
}
