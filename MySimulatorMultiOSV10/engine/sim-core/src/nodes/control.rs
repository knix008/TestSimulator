//! Control design (MATLAB's Control System Toolbox): root locus (rlocus),
//! state feedback and estimators (lqr, dlqr, lqe/kalman, place/acker) and
//! model conversion (tf, zpk, ss, c2d with zoh, foh, tustin and matched).

use super::dynamics::{roots_table, step_info, Tf};
use crate::data::{Column, Dataset, Table};
use crate::expr::{number_list, Expr};
use crate::fft::C64;
use crate::linalg::{self, matmul, transpose, Mat};
use crate::Ctx;

// ───────────────────────── polynomials (descending powers)

pub fn poly_mul(a: &[f64], b: &[f64]) -> Vec<f64> {
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

pub fn poly_add(a: &[f64], b: &[f64]) -> Vec<f64> {
    let n = a.len().max(b.len());
    let mut out = vec![0.0; n];
    for (i, x) in a.iter().enumerate() {
        out[n - a.len() + i] += x;
    }
    for (i, y) in b.iter().enumerate() {
        out[n - b.len() + i] += y;
    }
    out
}

fn poly_scale(a: &[f64], k: f64) -> Vec<f64> {
    a.iter().map(|v| v * k).collect()
}

fn poly_pow(a: &[f64], k: usize) -> Vec<f64> {
    (0..k).fold(vec![1.0], |acc, _| poly_mul(&acc, a))
}

fn poly_der(a: &[f64]) -> Vec<f64> {
    let n = a.len();
    if n <= 1 {
        return vec![0.0];
    }
    (0..n - 1).map(|i| a[i] * (n - 1 - i) as f64).collect()
}

/// The real polynomial with these roots (conjugate pairs give real coefficients).
pub fn poly_from_roots(roots: &[C64]) -> Vec<f64> {
    let mut c = vec![C64::ONE];
    for r in roots {
        let mut next = vec![C64::ZERO; c.len() + 1];
        for (i, v) in c.iter().enumerate() {
            next[i] = next[i] + *v;
            next[i + 1] = next[i + 1] - *v * *r;
        }
        c = next;
    }
    c.iter().map(|v| v.re).collect()
}

fn trim(mut p: Vec<f64>) -> Vec<f64> {
    let scale = p.iter().fold(0.0f64, |m, v| m.max(v.abs())).max(1e-300);
    while p.len() > 1 && p[0].abs() <= 1e-12 * scale {
        p.remove(0);
    }
    p
}

/// "-1, -2+3i, -0.5±2j, 4i" → complex numbers ("±" adds the conjugate pair).
pub fn complex_list(text: &str) -> Result<Vec<C64>, String> {
    let mut out = Vec::new();
    for part in text.split([',', ';', '\n']).map(str::trim).filter(|s| !s.is_empty()) {
        let p = part.replace(' ', "").replace("+-", "-");
        if let Some((re, im)) = p.split_once('±').or_else(|| p.split_once("+/-")) {
            let re = if re.is_empty() { 0.0 } else { parse_real(re)? };
            let im = parse_real(im.trim_end_matches(['i', 'j']))?;
            out.push(C64::new(re, im.abs()));
            out.push(C64::new(re, -im.abs()));
            continue;
        }
        if let Some(body) = p.strip_suffix(['i', 'j']) {
            // Split at the last + or − that is not an exponent sign.
            let bytes = body.as_bytes();
            let mut cut = None;
            for k in (1..bytes.len()).rev() {
                if (bytes[k] == b'+' || bytes[k] == b'-') && !matches!(bytes[k - 1], b'e' | b'E') {
                    cut = Some(k);
                    break;
                }
            }
            let (re, im) = match cut {
                Some(k) => (parse_real(&body[..k])?, &body[k..]),
                None => (0.0, body),
            };
            let im = match im {
                "" | "+" => 1.0,
                "-" => -1.0,
                s => parse_real(s)?,
            };
            out.push(C64::new(re, im));
        } else {
            out.push(C64::new(parse_real(&p)?, 0.0));
        }
    }
    Ok(out)
}

fn parse_real(s: &str) -> Result<f64, String> {
    let e = Expr::with_names(s, &[]).map_err(|e| format!("\"{s}\": {e}"))?;
    Ok(e.value(&[]))
}

fn matrix_or_identity(text: &str, n: usize, what: &str) -> Result<Mat, String> {
    if text.trim().is_empty() {
        return Ok(linalg::identity(n));
    }
    let m = crate::expr::matrix(text)?;
    if m.len() == 1 && m[0].len() == n && n > 1 {
        // A row of numbers is the diagonal.
        let mut d = linalg::zeros(n, n);
        for i in 0..n {
            d[i][i] = m[0][i];
        }
        return Ok(d);
    }
    if m.len() == 1 && m[0].len() == 1 && n > 1 {
        return Ok(linalg::scale(&linalg::identity(n), m[0][0]));
    }
    if m.len() != n || m.iter().any(|r| r.len() != n) {
        return Err(format!("{what} must be {n} × {n} (or a diagonal list, or empty for I)"));
    }
    Ok(m)
}

fn matrix_table(name: &str, m: &Mat, row: &str, col: &str) -> Table {
    let mut t = Table::new(name);
    t.push(Column::text("", (1..=m.len()).map(|i| format!("{row}{i}")).collect()));
    let cols = m.first().map_or(0, |r| r.len());
    for j in 0..cols {
        t.push(Column::new(&format!("{col}{}", j + 1), "", m.iter().map(|r| r[j]).collect()));
    }
    t
}

fn poly_text(p: &[f64]) -> String {
    p.iter().map(|v| crate::data::format_number(*v)).collect::<Vec<_>>().join(", ")
}

// ───────────────────────── root locus

/// Root locus of 1 + K·G(s) = 0: the closed-loop poles as K runs from 0 to kMax,
/// the gain where the locus crosses into the right half plane and the breakaway points.
pub fn rlocus(ctx: &mut Ctx) -> Result<Dataset, String> {
    let tf = Tf::parse(&ctx.str("num", "1"), &ctx.str("den", "1, 3, 2, 0"))?;
    let points = ctx.count("points", 400, 20, 20_000)?;
    let discrete = ctx.str("domain", "continuous") == "discrete";
    let poles0 = linalg::poly_roots(&tf.den);
    let zeros = linalg::poly_roots(&tf.num);
    let char_at = |k: f64| linalg::poly_roots(&poly_add(&tf.den, &poly_scale(&tf.num, k)));
    let unstable = |r: &[C64]| r.iter().any(|p| if discrete { p.abs() > 1.0 + 1e-9 } else { p.re > 1e-9 });
    // The gain range: automatic (until the poles reach their asymptotes) or given.
    let mut kmax = ctx.num("kMax", 0.0)?;
    if !(kmax > 0.0) {
        let lead = (tf.den[0] / tf.num[0]).abs().max(1e-12);
        let mag: f64 = poles0.iter().chain(&zeros).map(|p| p.abs()).fold(1.0, f64::max);
        kmax = lead * mag.powi((tf.den.len() - tf.num.len()).max(1) as i32) * 100.0;
    }
    let mut ks: Vec<f64> = vec![0.0];
    let kmin = kmax * 1e-6;
    for i in 0..points {
        ks.push(kmin * (kmax / kmin).powf(i as f64 / (points - 1) as f64));
    }
    let n = poles0.len();
    let mut branches: Vec<Vec<C64>> = vec![Vec::with_capacity(ks.len()); n];
    let mut prev = poles0.clone();
    for (i, &k) in ks.iter().enumerate() {
        let mut roots = if i == 0 { poles0.clone() } else { char_at(k) };
        // Match each branch to the nearest new root.
        let mut order = Vec::with_capacity(n);
        for p in &prev {
            let (j, _) = roots.iter().enumerate().fold((0, f64::INFINITY), |acc, (j, r)| {
                let d = (*r - *p).abs();
                if d < acc.1 { (j, d) } else { acc }
            });
            order.push(roots.remove(j.min(roots.len().saturating_sub(1))));
            if roots.is_empty() {
                break;
            }
        }
        for (b, r) in order.iter().enumerate() {
            branches[b].push(*r);
        }
        prev = order;
    }
    let mut table = Table::new("root locus").with_x(Column::new("K", "", ks.clone()));
    for (b, br) in branches.iter().enumerate() {
        table.push(Column::new(&format!("re{}", b + 1), "", br.iter().map(|r| r.re).collect()));
        table.push(Column::new(&format!("im{}", b + 1), "", br.iter().map(|r| r.im).collect()));
    }
    // The locus as one x–y curve (NaN between branches) for an x–y chart.
    let (mut xs, mut ys) = (Vec::new(), Vec::new());
    for br in &branches {
        xs.extend(br.iter().map(|r| r.re));
        ys.extend(br.iter().map(|r| r.im));
        xs.push(f64::NAN);
        ys.push(f64::NAN);
    }
    let mut curve = Table::new("locus curve");
    curve.push(Column::new("real", "", xs));
    curve.push(Column::new("imag", "", ys));
    let mut out = Dataset { tables: vec![curve, table, roots_table("open-loop poles", "pole", &poles0)], ..Default::default() };
    if !zeros.is_empty() {
        out.tables.push(roots_table("open-loop zeros", "zero", &zeros));
    }
    // The stability limit: the first K where a pole leaves the stable region.
    let mut k_crit = f64::INFINITY;
    let mut w_crit = f64::NAN;
    let stable0 = !unstable(&poles0);
    for w in ks.windows(2) {
        if (unstable(&char_at(w[0])) != unstable(&char_at(w[1]))) && w[0] > 0.0 {
            let (mut lo, mut hi) = (w[0], w[1]);
            let lo_unstable = unstable(&char_at(lo));
            for _ in 0..80 {
                let mid = 0.5 * (lo + hi);
                if unstable(&char_at(mid)) == lo_unstable {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            k_crit = 0.5 * (lo + hi);
            let r = char_at(k_crit);
            let edge = r.iter().fold(C64::ZERO, |acc, p| {
                let d = if discrete { (p.abs() - 1.0).abs() } else { p.re.abs() };
                let da = if discrete { (acc.abs() - 1.0).abs() } else { acc.re.abs() };
                if acc == C64::ZERO || d < da { *p } else { acc }
            });
            w_crit = if discrete { edge.arg().abs() } else { edge.im.abs() };
            break;
        }
    }
    out.scalar("stable at K = 0", if stable0 { 1.0 } else { 0.0 }, "");
    if k_crit.is_finite() {
        out.scalar("critical gain", k_crit, "");
        out.scalar(if discrete { "crossing angle" } else { "crossing frequency" }, w_crit, if discrete { "rad" } else { "rad/s" });
    }
    // Breakaway / break-in points: real roots of N·D' − N'·D with K = −D/N > 0.
    let bp = poly_add(&poly_mul(&tf.num, &poly_der(&tf.den)), &poly_scale(&poly_mul(&poly_der(&tf.num), &tf.den), -1.0));
    let mut breaks: Vec<(f64, f64)> = Vec::new();
    for r in linalg::poly_roots(&trim(bp)) {
        if r.im.abs() > 1e-7 * r.re.abs().max(1.0) {
            continue;
        }
        let s = C64::new(r.re, 0.0);
        let nv = linalg::poly_eval(&tf.num, s).re;
        if nv.abs() < 1e-300 {
            continue;
        }
        let k = -linalg::poly_eval(&tf.den, s).re / nv;
        if k > 0.0 {
            breaks.push((r.re, k));
        }
    }
    if !breaks.is_empty() {
        let mut bt = Table::new("breakaway points");
        bt.push(Column::new("s", "", breaks.iter().map(|b| b.0).collect()));
        bt.push(Column::new("K", "", breaks.iter().map(|b| b.1).collect()));
        out.tables.push(bt);
    }
    // Asymptotes (continuous): centroid and angles.
    let excess = tf.den.len() as i64 - tf.num.len() as i64;
    if excess > 0 && !discrete {
        let centroid = (poles0.iter().map(|p| p.re).sum::<f64>() - zeros.iter().map(|z| z.re).sum::<f64>()) / excess as f64;
        out.scalar("asymptote centroid", centroid, "");
        out.scalar("asymptotes", excess as f64, "");
    }
    Ok(out)
}

// ───────────────────────── state feedback and estimators

/// Ackermann's formula: K = [0 … 0 1]·Ctrb⁻¹·φ(A) for the desired poles (single input).
pub fn acker(a: &Mat, b: &[f64], poles: &[C64]) -> Result<Vec<f64>, String> {
    let n = a.len();
    if poles.len() != n {
        return Err(format!("give {n} poles (one per state)"));
    }
    let phi_c = poly_from_roots(poles);
    let mut ctrb = linalg::zeros(n, n);
    let mut v = b.to_vec();
    for k in 0..n {
        for i in 0..n {
            ctrb[i][k] = v[i];
        }
        v = linalg::matvec(a, &v);
    }
    if linalg::rank(&ctrb) < n {
        return Err("the system is not controllable from this input: the poles cannot be placed".into());
    }
    // φ(A) = Aⁿ + c1 Aⁿ⁻¹ + … + cn I
    let mut phi = linalg::zeros(n, n);
    let mut pw = linalg::identity(n);
    for k in (0..=n).rev() {
        phi = linalg::add(&phi, &pw, phi_c[k]);
        pw = matmul(&pw, a);
    }
    let ctrb_inv = linalg::inverse(&ctrb)?;
    let last: Vec<f64> = ctrb_inv[n - 1].clone();
    Ok((0..n).map(|j| (0..n).map(|k| last[k] * phi[k][j]).sum()).collect())
}

pub fn design(ctx: &mut Ctx) -> Result<Dataset, String> {
    let a = crate::expr::matrix(&ctx.str("A", "0 1; 0 0"))?;
    let n = a.len();
    if n == 0 || a.iter().any(|r| r.len() != n) {
        return Err("A must be square".into());
    }
    let b = crate::expr::matrix(&ctx.str("B", "0; 1"))?;
    if b.len() != n {
        return Err(format!("B must have {n} rows"));
    }
    let m = b[0].len();
    let ctext = ctx.str("C", "");
    let c = if ctext.trim().is_empty() { vec![{ let mut r = vec![0.0; n]; r[0] = 1.0; r }] } else { crate::expr::matrix(&ctext)? };
    if c.iter().any(|r| r.len() != n) {
        return Err(format!("C must have {n} columns"));
    }
    let p = c.len();
    let mode = ctx.str("mode", "lqr");
    let discrete = ctx.str("domain", "continuous") == "discrete";
    let ts = ctx.positive("ts", 0.1)?;
    let mut out = Dataset::default();
    // The closed loop matrix (state feedback A − BK, or estimator A − LC).
    let (gain, closed, gain_name): (Mat, Mat, &str) = match mode.as_str() {
        "lqr" => {
            let q = matrix_or_identity(&ctx.str("Q", ""), n, "Q")?;
            let r = matrix_or_identity(&ctx.str("R", ""), m, "R")?;
            let (k, x) = if discrete {
                let x = linalg::dare(&a, &b, &q, &r)?;
                // K = (R + BᵀXB)⁻¹ BᵀXA
                let btx = matmul(&transpose(&b), &x);
                let k = matmul(&linalg::inverse(&linalg::add(&r, &matmul(&btx, &b), 1.0))?, &matmul(&btx, &a));
                (k, x)
            } else {
                let x = linalg::care(&a, &b, &q, &r)?;
                (matmul(&matmul(&linalg::inverse(&r)?, &transpose(&b)), &x), x)
            };
            out.tables.push(matrix_table("Riccati solution X", &x, "x", "x"));
            (k.clone(), linalg::add(&a, &matmul(&b, &k), -1.0), "K")
        }
        "lqe" | "kalman" => {
            // Process noise w on every state (G = I) with covariance Qn, measurement noise Rn.
            let qn = matrix_or_identity(&ctx.str("Q", ""), n, "Qn")?;
            let rn = matrix_or_identity(&ctx.str("R", ""), p, "Rn")?;
            let at = transpose(&a);
            let ct = transpose(&c);
            let (l, pm) = if discrete {
                let pm = linalg::dare(&at, &ct, &qn, &rn)?;
                // L = A P Cᵀ (C P Cᵀ + R)⁻¹ (predictor gain)
                let pct = matmul(&pm, &ct);
                let l = matmul(&matmul(&a, &pct), &linalg::inverse(&linalg::add(&matmul(&c, &pct), &rn, 1.0))?);
                (l, pm)
            } else {
                let pm = linalg::care(&at, &ct, &qn, &rn)?;
                (matmul(&matmul(&pm, &ct), &linalg::inverse(&rn)?), pm)
            };
            out.tables.push(matrix_table("error covariance P", &pm, "x", "x"));
            (l.clone(), linalg::add(&a, &matmul(&l, &c), -1.0), "L")
        }
        "place" | "acker" => {
            let poles = complex_list(&ctx.str("poles", "-1±1i"))?;
            let target = ctx.str("target", "controller");
            if target == "observer" {
                // Duality: L = acker(Aᵀ, Cᵀ, poles)ᵀ (first output).
                let k = acker(&transpose(&a), &c[0], &poles)?;
                let l: Mat = k.iter().map(|v| vec![*v]).collect();
                let c0 = vec![c[0].clone()];
                (l.clone(), linalg::add(&a, &matmul(&l, &c0), -1.0), "L")
            } else {
                let input = ctx.count("channel", 1, 1, m as i64)? - 1;
                let bcol: Vec<f64> = b.iter().map(|r| r[input]).collect();
                let kv = acker(&a, &bcol, &poles)?;
                let mut k = linalg::zeros(m, n);
                k[input] = kv;
                (k.clone(), linalg::add(&a, &matmul(&b, &k), -1.0), "K")
            }
        }
        other => return Err(format!("unknown design \"{other}\" (lqr, lqe, place)")),
    };
    let rows = if gain_name == "K" { "u" } else { "x" };
    let cols = if gain_name == "K" { "x" } else { "y" };
    out.tables.insert(0, matrix_table(&format!("gain {gain_name}"), &gain, rows, cols));
    let eig = linalg::eig_general(&closed);

    out.tables.push(roots_table("closed-loop poles", "λ", &eig));
    let stable = eig.iter().all(|e| if discrete { e.abs() < 1.0 } else { e.re < 0.0 });
    out.scalar("closed loop stable", if stable { 1.0 } else { 0.0 }, "");
    for (i, row) in gain.iter().enumerate() {
        for (j, v) in row.iter().enumerate() {
            out.scalar(&format!("{gain_name}{}{}", i + 1, j + 1), *v, "");
        }
    }
    // Free response of the closed loop from x0 (continuous: e^{(A−BK)t}; discrete: powers).
    let mut x0 = number_list(&ctx.str("x0", ""))?;
    if x0.is_empty() {
        x0 = vec![1.0; n];
    }
    x0.resize(n, 0.0);
    let t_end = ctx.positive("tEnd", 10.0)?;
    let dt = if discrete { ts } else { ctx.positive("dt", 0.01)? };
    let steps = ((t_end / dt).round() as usize).min(200_000);
    let phi = if discrete { closed.clone() } else { linalg::expm(&linalg::scale(&closed, dt)) };
    let mut x = x0.clone();
    let mut tcol = Vec::with_capacity(steps + 1);
    let mut cols_x: Vec<Vec<f64>> = vec![Vec::with_capacity(steps + 1); n];
    let mut ucols: Vec<Vec<f64>> = vec![Vec::new(); if gain_name == "K" { m } else { 0 }];
    for s in 0..=steps {
        tcol.push(s as f64 * dt);
        for i in 0..n {
            cols_x[i].push(x[i]);
        }
        for (j, uc) in ucols.iter_mut().enumerate() {
            uc.push(-(0..n).map(|k| gain[j][k] * x[k]).sum::<f64>());
        }
        x = linalg::matvec(&phi, &x);
    }
    let mut table = Table::new(if gain_name == "K" { "closed-loop response" } else { "estimation error" }).with_x(Column::new("t", "s", tcol));
    for (i, col) in cols_x.into_iter().enumerate() {
        table.push(Column::new(&format!("{}{}", if gain_name == "K" { "x" } else { "e" }, i + 1), "", col));
    }
    for (j, col) in ucols.into_iter().enumerate() {
        table.push(Column::new(&format!("u{}", j + 1), "", col));
    }
    out.tables.insert(0, table);
    Ok(out)
}

// ───────────────────────── model conversion

/// A SISO model in its three forms.
struct Siso {
    num: Vec<f64>,
    den: Vec<f64>,
}

impl Siso {
    fn zpk(&self) -> (Vec<C64>, Vec<C64>, f64) {
        let k = self.num[0] / self.den[0];
        (linalg::poly_roots(&self.num), linalg::poly_roots(&self.den), k)
    }
}

/// C(sI − A)⁻¹B + D as num/den: num = det(sI − A + BC) − det(sI − A) + D·det(sI − A).
fn ss_to_tf(a: &Mat, b: &[f64], c: &[f64], d: f64) -> Siso {
    let n = a.len();
    let den = linalg::char_poly(a);
    let mut abc = a.clone();
    for i in 0..n {
        for j in 0..n {
            abc[i][j] -= b[i] * c[j];
        }
    }
    let num = poly_add(&poly_add(&linalg::char_poly(&abc), &poly_scale(&den, -1.0)), &poly_scale(&den, d));
    Siso { num: trim(num), den }
}

/// G(s) → Gd(z) by the bilinear (Tustin) substitution s = (2/T)(z − 1)/(z + 1).
fn tustin(g: &Siso, ts: f64) -> Siso {
    let n = g.den.len() - 1;
    let sub = |p: &[f64]| -> Vec<f64> {
        let deg = p.len() - 1;
        let mut out = vec![0.0];
        for (i, coef) in p.iter().enumerate() {
            let k = deg - i; // power of s
            let term = poly_mul(&poly_pow(&[1.0, -1.0], k), &poly_pow(&[1.0, 1.0], n - k));
            out = poly_add(&out, &poly_scale(&term, coef * (2.0 / ts).powi(k as i32)));
        }
        out
    };
    let num = sub(&g.num);
    let den = sub(&g.den);
    let lead = den[0];
    Siso { num: trim(poly_scale(&num, 1.0 / lead)), den: poly_scale(&den, 1.0 / lead) }
}

/// Pole–zero matching z = e^{sT}, with the gain matched at DC (or at s = 0 removed poles' frequency).
fn matched(g: &Siso, ts: f64) -> Siso {
    let (z, p, _) = g.zpk();
    let zd: Vec<C64> = z.iter().map(|r| r.scale(ts).exp()).collect();
    let pd: Vec<C64> = p.iter().map(|r| r.scale(ts).exp()).collect();
    let mut num = poly_from_roots(&zd);
    // Zeros at infinity map to z = −1 (all but one, keeping the system causal).
    let extra = pd.len().saturating_sub(zd.len() + 1);
    for _ in 0..extra {
        num = poly_mul(&num, &[1.0, 1.0]);
    }
    let den = poly_from_roots(&pd);
    // Match the gain at a test point: DC unless there is a pole or zero at s = 0.
    let s_test = if p.iter().chain(&z).any(|r| r.abs() < 1e-9) { C64::new(0.0, 0.1 / ts) } else { C64::ZERO };
    let gc = linalg::poly_eval(&g.num, s_test) / linalg::poly_eval(&g.den, s_test);
    let zt = s_test.scale(ts).exp();
    let gd = linalg::poly_eval(&num, zt) / linalg::poly_eval(&den, zt);
    let k = gc.abs() / gd.abs().max(1e-300);
    Siso { num: poly_scale(&num, k), den }
}

/// Zero-order hold (or first-order hold) by the matrix exponential of the augmented system.
fn hold(g: &Siso, ts: f64, foh: bool) -> Siso {
    let tf = Tf { num: g.num.clone(), den: g.den.clone() };
    let (a, b, c, d) = tf.to_ss();
    let n = a.len();
    if n == 0 {
        return Siso { num: vec![d], den: vec![1.0] };
    }
    if !foh {
        let mut m = linalg::zeros(n + 1, n + 1);
        for i in 0..n {
            for j in 0..n {
                m[i][j] = a[i][j] * ts;
            }
            m[i][n] = b[i] * ts;
        }
        let e = linalg::expm(&m);
        let ad: Mat = (0..n).map(|i| e[i][..n].to_vec()).collect();
        let bd: Vec<f64> = (0..n).map(|i| e[i][n]).collect();
        return ss_to_tf(&ad, &bd, &c, d);
    }
    // FOH (triangle hold): exp([[A, B, 0], [0, 0, I/T], [0, 0, 0]]·T) = [[Φ, Γ1, Γ2], …].
    let mut m = linalg::zeros(n + 2, n + 2);
    for i in 0..n {
        for j in 0..n {
            m[i][j] = a[i][j] * ts;
        }
        m[i][n] = b[i] * ts;
    }
    m[n][n + 1] = 1.0;
    let e = linalg::expm(&m);
    let ad: Mat = (0..n).map(|i| e[i][..n].to_vec()).collect();
    let g1: Vec<f64> = (0..n).map(|i| e[i][n]).collect();
    let g2: Vec<f64> = (0..n).map(|i| e[i][n + 1]).collect();
    let adg2 = linalg::matvec(&ad, &g2);
    let bd: Vec<f64> = (0..n).map(|i| g1[i] + adg2[i] - g2[i]).collect();
    let dd = d + (0..n).map(|i| c[i] * g2[i]).sum::<f64>();
    ss_to_tf(&ad, &bd, &c, dd)
}

/// Step response of a discrete transfer function (difference equation).
fn dstep(g: &Siso, steps: usize) -> Vec<f64> {
    let nd = g.den.len();
    let mut num = vec![0.0; nd - g.num.len()];
    num.extend(&g.num);
    let a0 = g.den[0];
    let mut y = vec![0.0; steps];
    for k in 0..steps {
        let mut s = 0.0;
        for (i, bi) in num.iter().enumerate() {
            if k >= i {
                s += bi; // u = 1 for k ≥ 0
            }
        }
        for i in 1..nd {
            if k >= i {
                s -= g.den[i] * y[k - i];
            }
        }
        y[k] = s / a0;
    }
    y
}

pub fn convert(ctx: &mut Ctx) -> Result<Dataset, String> {
    let form = ctx.str("form", "tf");
    let g = match form.as_str() {
        "tf" => {
            let tf = Tf::parse(&ctx.str("num", "1"), &ctx.str("den", "1, 1"))?;
            Siso { num: tf.num, den: tf.den }
        }
        "zpk" => {
            let z = complex_list(&ctx.str("zeros", ""))?;
            let p = complex_list(&ctx.str("poles", "-1"))?;
            if p.is_empty() {
                return Err("give at least one pole".into());
            }
            if z.len() > p.len() {
                return Err("more zeros than poles: the model is improper".into());
            }
            let k = ctx.num("gain", 1.0)?;
            Siso { num: poly_scale(&poly_from_roots(&z), k), den: poly_from_roots(&p) }
        }
        "ss" => {
            let a = crate::expr::matrix(&ctx.str("A", "-1"))?;
            let n = a.len();
            let b = crate::expr::matrix(&ctx.str("B", "1"))?;
            let c = crate::expr::matrix(&ctx.str("C", "1"))?;
            let d = ctx.num("D", 0.0)?;
            if a.iter().any(|r| r.len() != n) || b.len() != n || c.first().map_or(0, |r| r.len()) != n {
                return Err(format!("A must be {n} × {n}, B {n} × 1 and C 1 × {n}"));
            }
            let bcol: Vec<f64> = b.iter().map(|r| r[0]).collect();
            ss_to_tf(&a, &bcol, &c[0], d)
        }
        other => return Err(format!("unknown form \"{other}\" (tf, zpk, ss)")),
    };
    if g.num.len() > g.den.len() {
        return Err("the model is improper (numerator degree above the denominator's)".into());
    }
    let mut out = Dataset::default();
    let (z, p, k) = g.zpk();
    // Coefficients table.
    let deg = g.den.len();
    let mut num_pad = vec![0.0; deg - g.num.len()];
    num_pad.extend(&g.num);
    let mut coef = Table::new("transfer function");
    coef.push(Column::text("power", (0..deg).map(|i| format!("s^{}", deg - 1 - i)).collect()));
    coef.push(Column::new("num", "", num_pad));
    coef.push(Column::new("den", "", g.den.clone()));
    out.tables.push(coef);
    out.tables.push(roots_table("poles", "pole", &p));
    if !z.is_empty() {
        out.tables.push(roots_table("zeros", "zero", &z));
    }
    let tf = Tf { num: g.num.clone(), den: g.den.clone() };
    let (a, b, c, d) = tf.to_ss();
    if !a.is_empty() {
        let mut abcd = a.clone();
        for (i, row) in abcd.iter_mut().enumerate() {
            row.push(b[i]);
        }
        let mut last = c.clone();
        last.push(d);
        abcd.push(last);
        let mut t = Table::new("state space [A B; C D]");
        let n = a.len();
        t.push(Column::text("", (0..=n).map(|i| if i < n { format!("x{}", i + 1) } else { "y".into() }).collect()));
        for j in 0..=n {
            t.push(Column::new(&if j < n { format!("x{}", j + 1) } else { "u".into() }, "", abcd.iter().map(|r| r[j]).collect()));
        }
        out.tables.push(t);
    }
    out.scalar("zpk gain", k, "").scalar("DC gain", tf.dc_gain(), "").scalar("order", (g.den.len() - 1) as f64, "");
    let mut text = format!("num = [{}]\nden = [{}]", poly_text(&g.num), poly_text(&g.den));
    // Discretisation.
    let method = ctx.str("c2d", "zoh");
    if method != "none" {
        let ts = ctx.positive("ts", 0.1)?;
        let gd = match method.as_str() {
            "zoh" => hold(&g, ts, false),
            "foh" => hold(&g, ts, true),
            "tustin" | "bilinear" => tustin(&g, ts),
            "matched" => matched(&g, ts),
            other => return Err(format!("unknown discretisation \"{other}\" (zoh, foh, tustin, matched, none)")),
        };
        let dd = gd.den.len();
        let mut np = vec![0.0; dd - gd.num.len()];
        np.extend(&gd.num);
        let mut dt = Table::new(&format!("discrete ({method}, T = {ts})"));
        dt.push(Column::text("power", (0..dd).map(|i| format!("z^{}", dd as i64 - 1 - i as i64)).collect()));
        dt.push(Column::new("num", "", np));
        dt.push(Column::new("den", "", gd.den.clone()));
        out.tables.push(dt);
        let pd = linalg::poly_roots(&gd.den);
        out.tables.push(roots_table("discrete poles", "pole", &pd));
        let t_end = ctx.positive("tEnd", 10.0)?;
        let steps = ((t_end / ts).round() as usize + 1).min(100_000);
        let yd = dstep(&gd, steps);
        // The continuous step response at the same instants (exact, by the matrix exponential).
        let yc: Vec<f64> = if a.is_empty() {
            vec![d; steps]
        } else {
            let n = a.len();
            let phi = linalg::expm(&linalg::scale(&a, ts));
            // Γ = ∫ e^{Aτ} dτ B over one step (augmented exponential).
            let mut m = linalg::zeros(n + 1, n + 1);
            for i in 0..n {
                for j in 0..n {
                    m[i][j] = a[i][j] * ts;
                }
                m[i][n] = b[i] * ts;
            }
            let e = linalg::expm(&m);
            let gam: Vec<f64> = (0..n).map(|i| e[i][n]).collect();
            let mut x = vec![0.0; n];
            (0..steps)
                .map(|_| {
                    let y = (0..n).map(|i| c[i] * x[i]).sum::<f64>() + d;
                    let px = linalg::matvec(&phi, &x);
                    for i in 0..n {
                        x[i] = px[i] + gam[i];
                    }
                    y
                })
                .collect()
        };
        let tt: Vec<f64> = (0..steps).map(|k| k as f64 * ts).collect();
        let mut resp = Table::new("step response").with_x(Column::new("t", "s", tt.clone()));
        resp.push(Column::new("continuous", "", yc));
        resp.push(Column::new("discrete", "", yd.clone()));
        out.tables.insert(0, resp);
        let info = step_info(&tt, &yd, 0.0, *yd.last().unwrap_or(&0.0), 0.0);
        out.scalar("discrete overshoot", info.overshoot, "%");
        out.scalar("discrete stable", if pd.iter().all(|r| r.abs() < 1.0) { 1.0 } else { 0.0 }, "");
        text.push_str(&format!("\nnumd = [{}]\ndend = [{}]  (T = {ts}, {method})", poly_text(&gd.num), poly_text(&gd.den)));
    }
    out.text = text;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complex_lists() {
        let v = complex_list("-1, -2+3i, -0.5±2j, 4i, 1e-3-2i").unwrap();
        assert_eq!(v.len(), 6);
        assert_eq!((v[1].re, v[1].im), (-2.0, 3.0));
        assert_eq!((v[2].im, v[3].im), (2.0, -2.0));
        assert_eq!((v[4].re, v[4].im), (0.0, 4.0));
        assert_eq!((v[5].re, v[5].im), (1e-3, -2.0));
    }

    #[test]
    fn tustin_and_zoh_of_first_order() {
        // 1/(s + 1), T = 0.1: ZOH → (1 − e^−T)/(z − e^−T).
        let g = Siso { num: vec![1.0], den: vec![1.0, 1.0] };
        let zd = hold(&g, 0.1, false);
        let e = (-0.1f64).exp();
        assert!((zd.den[1] + e).abs() < 1e-12 && (zd.num[0] - (1.0 - e)).abs() < 1e-12, "{:?} {:?}", zd.num, zd.den);
        // Tustin: (T/(2+T))(z + 1)/(z − (2−T)/(2+T)).
        let td = tustin(&g, 0.1);
        assert!((td.den[1] + 1.9 / 2.1).abs() < 1e-12 && (td.num[0] - 0.1 / 2.1).abs() < 1e-12);
        // Every method keeps the DC gain 1.
        for gd in [zd, td, matched(&g, 0.1), hold(&g, 0.1, true)] {
            let dc = gd.num.iter().sum::<f64>() / gd.den.iter().sum::<f64>();
            assert!((dc - 1.0).abs() < 1e-9, "{dc}");
        }
    }

    #[test]
    fn acker_places_poles() {
        let a = vec![vec![0.0, 1.0], vec![0.0, 0.0]];
        let k = acker(&a, &[0.0, 1.0], &complex_list("-2, -3").unwrap()).unwrap();
        // s² + k2 s + k1 = (s + 2)(s + 3) → K = [6, 5].
        assert!((k[0] - 6.0).abs() < 1e-9 && (k[1] - 5.0).abs() < 1e-9);
    }

    #[test]
    fn ss_round_trip() {
        let tf = Tf::parse("2, 3", "1, 4, 5").unwrap();
        let (a, b, c, d) = tf.to_ss();
        let g = ss_to_tf(&a, &b, &c, d);
        assert!(g.num.iter().zip([2.0, 3.0]).all(|(x, y)| (x - y).abs() < 1e-9), "{:?}", g.num);
        assert!(g.den.iter().zip([1.0, 4.0, 5.0]).all(|(x, y)| (x - y).abs() < 1e-9));
    }
}
