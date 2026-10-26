//! Control System Toolbox objects in the M language: SISO linear
//! time-invariant systems made with tf, zpk or ss (continuous, or discrete
//! with a sample time), their arithmetic (+ − * / ^, feedback, series,
//! parallel), MATLAB's display, and the analysis functions — step, impulse,
//! lsim, bode, nyquist, margin, pole, zero, damp, dcgain, stepinfo, c2d,
//! d2c, minreal, pzmap, rlocus, pade, tfdata, zpkdata, ssdata.

use super::interp::{Figure, Interp, Series};
use super::value::*;
use crate::fft::C64;
use crate::linalg;
use crate::nodes::control::{dstep, hold, matched, poly_add, poly_from_roots, poly_mul, poly_scale, ss_to_tf, trim, tustin, Siso};
use crate::nodes::dynamics::{step_info, Tf};
use std::rc::Rc;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Form {
    Tf,
    Zpk,
    Ss,
}

#[derive(Clone, Debug)]
pub struct Lti {
    pub num: Vec<f64>,
    pub den: Vec<f64>,
    /// Sample time (0 = continuous).
    pub ts: f64,
    pub form: Form,
    /// State-space matrices when made with ss (A, B, C, D).
    pub ss: Option<(Vec<Vec<f64>>, Vec<f64>, Vec<f64>, f64)>,
    /// Input/output delay (continuous, seconds).
    pub delay: f64,
}

type Out = R<Vec<Value>>;

impl Lti {
    pub fn tf(num: Vec<f64>, den: Vec<f64>, ts: f64) -> R<Lti> {
        let num = trim(if num.is_empty() { vec![0.0] } else { num });
        let den = trim(den);
        if den.iter().all(|v| *v == 0.0) {
            return Err("the denominator is zero".into());
        }
        // Normalise to a monic denominator.
        let lead = den[0];
        Ok(Lti { num: num.iter().map(|v| v / lead).collect(), den: den.iter().map(|v| v / lead).collect(), ts, form: Form::Tf, ss: None, delay: 0.0 })
    }

    pub fn gain(k: f64, ts: f64) -> Lti {
        Lti { num: vec![k], den: vec![1.0], ts, form: Form::Tf, ss: None, delay: 0.0 }
    }

    fn with_form(mut self, f: Form) -> Lti {
        self.form = f;
        self
    }

    pub fn poles(&self) -> Vec<C64> {
        linalg::poly_roots(&self.den)
    }

    pub fn zeros(&self) -> Vec<C64> {
        if self.num.iter().all(|v| *v == 0.0) {
            return Vec::new();
        }
        linalg::poly_roots(&self.num)
    }

    pub fn at(&self, s: C64) -> C64 {
        let g = linalg::poly_eval(&self.num, s) / linalg::poly_eval(&self.den, s);
        if self.delay > 0.0 && self.ts == 0.0 {
            g * C64::new(0.0, -self.delay * s.im).exp() * C64::new((-self.delay * s.re).exp(), 0.0)
        } else {
            g
        }
    }

    /// The frequency response at ω (rad/s): G(jω) or G(e^{jωT}).
    pub fn freq(&self, w: f64) -> C64 {
        if self.ts > 0.0 {
            self.at(C64::polar(1.0, w * self.ts))
        } else {
            self.at(C64::new(0.0, w))
        }
    }

    pub fn dc(&self) -> f64 {
        let z = if self.ts > 0.0 { C64::ONE } else { C64::ZERO };
        let d = linalg::poly_eval(&self.den, z);
        let n = linalg::poly_eval(&self.num, z);
        if d.abs() < 1e-300 {
            if n.abs() < 1e-300 { f64::NAN } else { f64::INFINITY * n.re.signum() }
        } else {
            (n / d).re
        }
    }

    pub fn stable(&self) -> bool {
        self.poles().iter().all(|p| if self.ts > 0.0 { p.abs() < 1.0 } else { p.re < 0.0 })
    }

    fn compatible(&self, o: &Lti) -> R<f64> {
        if self.ts != o.ts && self.ts != -1.0 && o.ts != -1.0 {
            return Err("the systems have different sample times".into());
        }
        Ok(self.ts.max(o.ts))
    }

    pub fn add(&self, o: &Lti) -> R<Lti> {
        let ts = self.compatible(o)?;
        let num = poly_add(&poly_mul(&self.num, &o.den), &poly_mul(&o.num, &self.den));
        let mut r = Lti::tf(num, poly_mul(&self.den, &o.den), ts)?;
        r.delay = self.delay.min(o.delay);
        Ok(r.with_form(self.form))
    }

    pub fn mul(&self, o: &Lti) -> R<Lti> {
        let ts = self.compatible(o)?;
        let mut r = Lti::tf(poly_mul(&self.num, &o.num), poly_mul(&self.den, &o.den), ts)?;
        r.delay = self.delay + o.delay;
        Ok(r.with_form(if self.form == Form::Zpk || o.form == Form::Zpk { Form::Zpk } else { self.form }))
    }

    pub fn inv(&self) -> R<Lti> {
        if self.num.iter().all(|v| *v == 0.0) {
            return Err("the system is zero: it has no inverse".into());
        }
        Ok(Lti::tf(self.den.clone(), self.num.clone(), self.ts)?.with_form(self.form))
    }

    pub fn neg(&self) -> Lti {
        Lti { num: self.num.iter().map(|v| -v).collect(), ..self.clone() }
    }

    pub fn feedback(&self, h: &Lti, sign: f64) -> R<Lti> {
        // G / (1 − sign·G H)
        let ts = self.compatible(h)?;
        let num = poly_mul(&self.num, &h.den);
        let den = poly_add(&poly_mul(&self.den, &h.den), &poly_scale(&poly_mul(&self.num, &h.num), -sign));
        Ok(Lti::tf(num, den, ts)?.with_form(self.form))
    }

    /// Cancels pole–zero pairs closer than tol.
    pub fn minreal(&self, tol: f64) -> R<Lti> {
        let mut z = self.zeros();
        let mut p = self.poles();
        let k = self.num.iter().find(|v| **v != 0.0).copied().unwrap_or(0.0) / self.den[0];
        let mut i = 0;
        while i < z.len() {
            if let Some(j) = p.iter().position(|q| (*q - z[i]).abs() <= tol * (1.0 + z[i].abs())) {
                p.remove(j);
                z.remove(i);
            } else {
                i += 1;
            }
        }
        Ok(Lti::tf(poly_scale(&poly_from_roots(&z), k), poly_from_roots(&p), self.ts)?.with_form(self.form))
    }

    pub fn state_space(&self) -> (Vec<Vec<f64>>, Vec<f64>, Vec<f64>, f64) {
        if let Some(ss) = &self.ss {
            return ss.clone();
        }
        Tf { num: self.num.clone(), den: self.den.clone() }.to_ss()
    }
}

// ───────────────────────── display

fn coef_text(v: f64) -> String {
    let a = v.abs();
    if a.fract() == 0.0 && a < 1e9 {
        format!("{}", a as i64)
    } else {
        let s = format!("{a:.4}");
        let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
        if s == "0" { format!("{a:.3e}") } else { s }
    }
}

fn poly_display(p: &[f64], var: &str) -> String {
    let n = p.len();
    let mut out = String::new();
    for (i, &c) in p.iter().enumerate() {
        if c == 0.0 {
            continue;
        }
        let power = n - 1 - i;
        let body = match power {
            0 => coef_text(c),
            _ => {
                let v = if power == 1 { var.to_string() } else { format!("{var}^{power}") };
                if c.abs() == 1.0 { v } else { format!("{} {v}", coef_text(c)) }
            }
        };
        if out.is_empty() {
            out = if c < 0.0 { format!("-{body}") } else { body };
        } else {
            out.push_str(if c < 0.0 { " - " } else { " + " });
            out.push_str(&body);
        }
    }
    if out.is_empty() {
        "0".into()
    } else {
        out
    }
}

fn factor_display(roots: &[C64], var: &str) -> String {
    // Smallest magnitude first, as MATLAB lists the factors.
    let mut sorted = roots.to_vec();
    sorted.sort_by(|p, q| p.abs().partial_cmp(&q.abs()).unwrap_or(std::cmp::Ordering::Equal));
    let roots = &sorted[..];
    let mut parts = Vec::new();
    let mut used = vec![false; roots.len()];
    for i in 0..roots.len() {
        if used[i] {
            continue;
        }
        used[i] = true;
        let r = roots[i];
        if r.im.abs() > 1e-9 {
            if let Some(j) = (i + 1..roots.len()).find(|&j| !used[j] && (roots[j] - r.conj()).abs() < 1e-7) {
                used[j] = true;
            }
            parts.push(format!("({})", poly_display(&[1.0, -2.0 * r.re, r.norm2()], var)));
        } else if r.re == 0.0 {
            parts.push(var.to_string());
        } else {
            parts.push(format!("({var}{}{})", if r.re < 0.0 { "+" } else { "-" }, coef_text(r.re.abs())));
        }
    }
    if parts.is_empty() {
        "1".into()
    } else {
        parts.join(" ")
    }
}

fn fraction(name: &str, num: &str, den: &str, footer: &str) -> String {
    let w = num.chars().count().max(den.chars().count());
    let center = |s: &str| {
        let pad = (w - s.chars().count()) / 2;
        format!("  {}{}", " ".repeat(pad), s)
    };
    if den == "1" {
        return format!("{name} =\n \n  {num}\n \n{footer}\n");
    }
    format!("{name} =\n \n{}\n  {}\n{}\n \n{footer}\n", center(num), "-".repeat(w), center(den))
}

pub fn display(name: &str, g: &Lti) -> String {
    let var = if g.ts > 0.0 { "z" } else { "s" };
    let kind = if g.ts > 0.0 { format!("Sample time: {} seconds\nDiscrete-time", super::value::format_num(g.ts)) } else { "Continuous-time".into() };
    let delay = if g.delay > 0.0 { format!("\nInput delay: {} seconds", super::value::format_num(g.delay)) } else { String::new() };
    match g.form {
        Form::Ss => {
            let (a, b, c, d) = g.state_space();
            let n = a.len();
            let mut out = format!("{name} =\n \n  A = \n");
            for row in &a {
                out.push_str(&format!("    {}\n", row.iter().map(|v| format!("{:>9}", super::value::format_num(*v))).collect::<String>()));
            }
            out.push_str(" \n  B = \n");
            for v in &b {
                out.push_str(&format!("    {:>9}\n", super::value::format_num(*v)));
            }
            out.push_str(" \n  C = \n");
            out.push_str(&format!("    {}\n", c.iter().map(|v| format!("{:>9}", super::value::format_num(*v))).collect::<String>()));
            out.push_str(&format!(" \n  D = \n    {:>9}\n \n{kind} state-space model ({n} states).{delay}\n", super::value::format_num(d)));
            out
        }
        Form::Zpk => {
            let k = g.num.iter().find(|v| **v != 0.0).copied().unwrap_or(0.0);
            let num = factor_display(&g.zeros(), var);
            let num = if k == 1.0 { num } else if num == "1" { coef_text(k) } else { format!("{} {num}", if k < 0.0 { format!("-{}", coef_text(k)) } else { coef_text(k) }) };
            fraction(name, &num, &factor_display(&g.poles(), var), &format!("{kind} zero/pole/gain model.{delay}"))
        }
        Form::Tf => fraction(name, &poly_display(&g.num, var), &poly_display(&g.den, var), &format!("{kind} transfer function.{delay}")),
    }
}

pub fn class_name(g: &Lti) -> &'static str {
    match g.form {
        Form::Tf => "tf",
        Form::Zpk => "zpk",
        Form::Ss => "ss",
    }
}

// ───────────────────────── values

pub fn wrap(g: Lti) -> Value {
    let class = class_name(&g).to_string();
    Value::Obj(Rc::new(Object { class, data: ObjData::Lti(g) }))
}

pub fn as_lti(v: &Value) -> Option<&Lti> {
    match v {
        Value::Obj(o) => match &o.data {
            ObjData::Lti(g) => Some(g),
            _ => None,
        },
        _ => None,
    }
}

/// A number or an LTI system as an LTI system.
fn to_lti(v: &Value, ts: f64) -> R<Lti> {
    if let Some(g) = as_lti(v) {
        return Ok(g.clone());
    }
    let x = v.scalar().map_err(|_| "expected a system (tf, zpk, ss) or a number".to_string())?;
    Ok(Lti::gain(x, ts))
}

/// + − * / ^ with a system on either side.
pub fn binop(op: super::syntax::Bin, l: &Value, r: &Value) -> Option<R<Value>> {
    use super::syntax::Bin;
    if as_lti(l).is_none() && as_lti(r).is_none() {
        return None;
    }
    let ts = as_lti(l).or(as_lti(r)).map(|g| g.ts).unwrap_or(0.0);
    Some((|| {
        Ok(wrap(match op {
            Bin::Add => to_lti(l, ts)?.add(&to_lti(r, ts)?)?,
            Bin::Sub => to_lti(l, ts)?.add(&to_lti(r, ts)?.neg())?,
            Bin::Mul | Bin::EMul => to_lti(l, ts)?.mul(&to_lti(r, ts)?)?,
            Bin::Div | Bin::EDiv => to_lti(l, ts)?.mul(&to_lti(r, ts)?.inv()?)?,
            Bin::LDiv => to_lti(l, ts)?.inv()?.mul(&to_lti(r, ts)?)?,
            Bin::Pow | Bin::EPow => {
                let g = as_lti(l).ok_or("a number cannot be raised to a system")?;
                let k = r.scalar()?;
                if k.fract() != 0.0 {
                    return Err("a system power must be a whole number".into());
                }
                let base = if k < 0.0 { g.inv()? } else { g.clone() };
                let mut out = Lti::gain(1.0, g.ts);
                for _ in 0..(k.abs() as usize) {
                    out = out.mul(&base)?;
                }
                out.with_form(g.form)
            }
            _ => return Err("this operator does not apply to systems".into()),
        }))
    })())
}

// ───────────────────────── simulation

/// A time grid that shows the response: about 7 slowest time constants (or periods).
fn auto_time(g: &Lti) -> (f64, usize) {
    let poles = g.poles();
    if g.ts > 0.0 {
        let slow = poles.iter().map(|p| p.abs()).filter(|r| *r < 1.0 && *r > 1e-12).fold(0.0f64, f64::max);
        let n = if slow > 0.0 { ((-7.0 / slow.ln()).ceil() as usize).clamp(20, 2000) } else { 50 };
        return (n as f64 * g.ts, n);
    }
    let rates: Vec<f64> = poles.iter().filter(|p| p.abs() > 1e-9).map(|p| p.re.abs().max(1e-6)).collect();
    let slow = rates.iter().cloned().fold(f64::INFINITY, f64::min);
    let fast_osc = poles.iter().map(|p| p.im.abs()).fold(0.0f64, f64::max);
    let mut t_end = if slow.is_finite() { 7.0 / slow } else { 10.0 };
    if poles.iter().any(|p| p.abs() < 1e-9) {
        t_end = t_end.max(10.0);
    }
    let _ = fast_osc;
    (t_end.clamp(1e-6, 1e6) + g.delay, 500)
}

/// The output for input u on the uniform grid t (exact for piecewise-constant input).
pub fn simulate(g: &Lti, t: &[f64], u: &dyn Fn(usize) -> f64, impulse: bool) -> Vec<f64> {
    let n = t.len();
    if g.ts > 0.0 {
        let siso = Siso { num: g.num.clone(), den: g.den.clone() };
        if !impulse {
            // dstep works for a unit step; a general input runs the difference equation.
            let all_one = (0..n).all(|k| u(k) == 1.0);
            if all_one {
                return dstep(&siso, n);
            }
        }
        let nd = g.den.len();
        let mut num = vec![0.0; nd - g.num.len()];
        num.extend(&g.num);
        let mut y = vec![0.0; n];
        let input = |k: usize| if impulse { if k == 0 { 1.0 / g.ts } else { 0.0 } } else { u(k) };
        for k in 0..n {
            let mut s = 0.0;
            for (i, b) in num.iter().enumerate() {
                if k >= i {
                    s += b * input(k - i);
                }
            }
            for i in 1..nd {
                if k >= i {
                    s -= g.den[i] * y[k - i];
                }
            }
            y[k] = s;
        }
        // MATLAB's discrete impulse is the unit pulse response scaled by 1/T.
        return y;
    }
    let (a, b, c, d) = g.state_space();
    let ns = a.len();
    let dt = if n > 1 { t[1] - t[0] } else { 1.0 };
    let shift = (g.delay / dt).round() as usize;
    let mut y = vec![0.0; n];
    if ns == 0 {
        for k in 0..n {
            y[k] = if impulse { 0.0 } else { d * u(k.saturating_sub(shift)) * if k >= shift { 1.0 } else { 0.0 } };
        }
        return y;
    }
    // Φ = e^{A dt}, Γ = ∫ e^{Aτ} dτ B from the augmented exponential.
    let mut m = linalg::zeros(ns + 1, ns + 1);
    for i in 0..ns {
        for j in 0..ns {
            m[i][j] = a[i][j] * dt;
        }
        m[i][ns] = b[i] * dt;
    }
    let e = linalg::expm(&m);
    let mut x = if impulse { b.clone() } else { vec![0.0; ns] };
    for k in 0..n {
        let uk = if impulse || k < shift { 0.0 } else { u(k - shift) };
        let mut yk = (0..ns).map(|i| c[i] * x[i]).sum::<f64>() + d * uk;
        if impulse && k < shift {
            yk = 0.0;
        }
        y[k] = yk;
        let next: Vec<f64> = (0..ns).map(|i| (0..ns).map(|j| e[i][j] * x[j]).sum::<f64>() + e[i][ns] * uk).collect();
        if !(impulse && k < shift) {
            x = next;
        }
    }
    y
}

fn time_arg(g: &Lti, a: Option<&Value>) -> R<Vec<f64>> {
    match a {
        Some(v) if v.numel() > 1 => Ok(v.arr()?.re),
        Some(v) => {
            let t_end = v.scalar()?;
            let n = if g.ts > 0.0 { (t_end / g.ts).floor() as usize + 1 } else { 501 };
            let dt = if g.ts > 0.0 { g.ts } else { t_end / 500.0 };
            Ok((0..n).map(|k| k as f64 * dt).collect())
        }
        None => {
            let (t_end, n) = auto_time(g);
            if g.ts > 0.0 {
                Ok((0..n).map(|k| k as f64 * g.ts).collect())
            } else {
                Ok((0..=n).map(|k| k as f64 * t_end / n as f64).collect())
            }
        }
    }
}

fn plot_into(it: &mut Interp, title: &str, xlabel: &str, ylabel: &str, kind: &str, series: Vec<Series>) {
    if it.figures.is_empty() {
        it.figures.push(Figure::default());
        it.current = 0;
    }
    let hold = it.hold;
    let fig = &mut it.figures[it.current];
    if !hold {
        fig.series.clear();
        fig.surfaces.clear();
    }
    fig.title = title.to_string();
    fig.xlabel = xlabel.to_string();
    fig.ylabel = ylabel.to_string();
    fig.kind = kind.to_string();
    fig.series.extend(series);
}

fn freq_grid(g: &Lti) -> Vec<f64> {
    let mags: Vec<f64> = g.poles().iter().chain(g.zeros().iter()).map(|p| if g.ts > 0.0 { (p.abs().ln().abs() + p.arg().abs()) / g.ts } else { p.abs() }).filter(|v| *v > 1e-9).collect();
    let lo = mags.iter().cloned().fold(f64::INFINITY, f64::min);
    let hi = mags.iter().cloned().fold(0.0f64, f64::max);
    let (lo, hi) = if lo.is_finite() { ((lo / 100.0).log10().floor(), (hi * 100.0).log10().ceil()) } else { (-2.0, 2.0) };
    let hi = if g.ts > 0.0 { hi.min((std::f64::consts::PI / g.ts).log10()) } else { hi };
    let n = 600;
    (0..n).map(|k| 10f64.powf(lo + (hi - lo) * k as f64 / (n - 1) as f64)).collect()
}

/// Gain and phase margins: (Gm, Pm, Wcg, Wcp) as MATLAB's margin (Gm absolute).
pub fn margins(g: &Lti) -> (f64, f64, f64, f64) {
    let w = freq_grid(g);
    let resp: Vec<C64> = w.iter().map(|&x| g.freq(x)).collect();
    let mag: Vec<f64> = resp.iter().map(|z| z.abs()).collect();
    // Unwrapped phase in degrees.
    let mut ph = Vec::with_capacity(w.len());
    let mut offset = 0.0;
    let mut prev = f64::NAN;
    for z in &resp {
        let p = z.arg().to_degrees();
        if prev.is_finite() {
            let d = p - prev;
            if d > 180.0 {
                offset -= 360.0;
            } else if d < -180.0 {
                offset += 360.0;
            }
        }
        prev = p;
        ph.push(p + offset);
    }
    let (mut gm, mut wcg) = (f64::INFINITY, f64::NAN);
    let (mut pm, mut wcp) = (f64::INFINITY, f64::NAN);
    for k in 1..w.len() {
        // Phase crossings of −180° + 360°·m between the two grid points.
        let (a, b) = (ph[k - 1], ph[k]);
        let (lo, hi) = (a.min(b), a.max(b));
        let first = ((lo + 180.0) / 360.0).ceil() as i64;
        let last = ((hi + 180.0) / 360.0).floor() as i64;
        for m in first..=last {
            let target = -180.0 + 360.0 * m as f64;
            if (b - a).abs() < 1e-12 || target <= lo && lo == hi {
                continue;
            }
            let f = ((target - a) / (b - a)).clamp(0.0, 1.0);
            let wx = w[k - 1] * (w[k] / w[k - 1]).powf(f);
            let mg = g.freq(wx).abs();
            if mg > 0.0 && 1.0 / mg < gm {
                gm = 1.0 / mg;
                wcg = wx;
            }
        }
        if (mag[k - 1] - 1.0) * (mag[k] - 1.0) <= 0.0 && mag[k - 1] != mag[k] {
            let f = (1.0 - mag[k - 1]) / (mag[k] - mag[k - 1]);
            let wx = w[k - 1] * (w[k] / w[k - 1]).powf(f);
            let p = ph[k - 1] + f * (ph[k] - ph[k - 1]);
            let margin = (p + 180.0).rem_euclid(360.0);
            let margin = if margin > 180.0 { margin - 360.0 } else { margin };
            if margin.abs() < pm.abs() || !pm.is_finite() {
                pm = margin;
                wcp = wx;
            }
        }
    }
    (gm, pm, wcg, wcp)
}

fn rows(v: &[f64]) -> Value {
    Value::col(v.to_vec())
}

/// The Control System Toolbox functions (None when the name is not one of them).
pub fn call(it: &mut Interp, name: &str, a: &[Value], nargout: usize) -> Option<Out> {
    let first_lti = a.first().and_then(as_lti).cloned();
    let r: Out = (|| -> Out {
        match name {
            "tf" => {
                if let Some(Value::Str(v)) = a.first() {
                    let ts = a.get(1).map(|x| x.scalar()).transpose()?.unwrap_or(if v == "z" { -1.0 } else { 0.0 });
                    return Ok(vec![wrap(Lti::tf(vec![1.0, 0.0], vec![1.0], ts)?)]);
                }
                if let Some(g) = &first_lti {
                    let mut c = g.clone();
                    c.form = Form::Tf;
                    c.ss = None;
                    return Ok(vec![wrap(c)]);
                }
                let num = a.first().ok_or("tf: give num and den")?.arr()?.re;
                let den = match a.get(1) {
                    Some(v) => v.arr()?.re,
                    None => vec![1.0],
                };
                let ts = a.get(2).map(|x| x.scalar()).transpose()?.unwrap_or(0.0);
                Ok(vec![wrap(Lti::tf(num, den, ts)?)])
            }
            "zpk" => {
                if let Some(Value::Str(v)) = a.first() {
                    let ts = a.get(1).map(|x| x.scalar()).transpose()?.unwrap_or(if v == "z" { -1.0 } else { 0.0 });
                    return Ok(vec![wrap(Lti::tf(vec![1.0, 0.0], vec![1.0], ts)?.with_form(Form::Zpk))]);
                }
                if let Some(g) = &first_lti {
                    let mut c = g.clone();
                    c.form = Form::Zpk;
                    c.ss = None;
                    return Ok(vec![wrap(c)]);
                }
                let z = a.first().ok_or("zpk: give z, p, k")?.arr()?.to_c();
                let p = a.get(1).ok_or("zpk: give z, p, k")?.arr()?.to_c();
                let k = a.get(2).map(|x| x.scalar()).transpose()?.unwrap_or(1.0);
                let ts = a.get(3).map(|x| x.scalar()).transpose()?.unwrap_or(0.0);
                Ok(vec![wrap(Lti::tf(poly_scale(&poly_from_roots(&z), k), poly_from_roots(&p), ts)?.with_form(Form::Zpk))])
            }
            "ss" => {
                if let Some(g) = &first_lti {
                    let (aa, b, c, d) = g.state_space();
                    let mut s = g.clone();
                    s.form = Form::Ss;
                    s.ss = Some((aa, b, c, d));
                    return Ok(vec![wrap(s)]);
                }
                let am = a.first().ok_or("ss: give A, B, C, D")?.arr()?;
                if a.len() == 1 {
                    return Ok(vec![wrap(Lti::gain(am.re.first().copied().unwrap_or(0.0), 0.0))]);
                }
                let bm = a.get(1).ok_or("ss: give A, B, C, D")?.arr()?;
                let cm = a.get(2).ok_or("ss: give A, B, C, D")?.arr()?;
                let d = a.get(3).map(|x| x.scalar()).transpose()?.unwrap_or(0.0);
                let ts = a.get(4).map(|x| x.scalar()).transpose()?.unwrap_or(0.0);
                if bm.c != 1 || cm.r != 1 {
                    return Err("ss: only single-input single-output systems become objects (use the matrices for MIMO)".into());
                }
                let n = am.r;
                let arows = am.to_rows();
                let siso = ss_to_tf(&arows, &bm.re, &cm.re, d);
                let mut g = Lti::tf(siso.num, siso.den, ts)?;
                g.form = Form::Ss;
                g.ss = Some((arows, bm.re.clone(), cm.re.clone(), d));
                let _ = n;
                Ok(vec![wrap(g)])
            }
            "feedback" => {
                let g = to_lti(a.first().ok_or("feedback: give G")?, 0.0)?;
                let h = match a.get(1) {
                    Some(v) => to_lti(v, g.ts)?,
                    None => Lti::gain(1.0, g.ts),
                };
                let sign = a.get(2).map(|x| x.scalar()).transpose()?.unwrap_or(-1.0);
                Ok(vec![wrap(g.feedback(&h, sign)?)])
            }
            "series" => Ok(vec![wrap(to_lti(&a[0], 0.0)?.mul(&to_lti(a.get(1).ok_or("series: two systems")?, 0.0)?)?)]),
            "parallel" => Ok(vec![wrap(to_lti(&a[0], 0.0)?.add(&to_lti(a.get(1).ok_or("parallel: two systems")?, 0.0)?)?)]),
            "pade" => {
                let t = a.first().ok_or("pade: give the delay")?.scalar()?;
                let n = a.get(1).map(|x| x.usize()).transpose()?.unwrap_or(1);
                // Padé coefficients of e^{−sT}: c_k = (2n−k)! n! / ((2n)! k! (n−k)!) (−T)^k
                let fact = |m: usize| (1..=m).fold(1.0f64, |p, q| p * q as f64);
                let coef = |k: usize, sign: f64| fact(2 * n - k) * fact(n) / (fact(2 * n) * fact(k) * fact(n - k)) * (sign * t).powi(k as i32);
                let num: Vec<f64> = (0..=n).rev().map(|k| coef(k, -1.0)).collect();
                let den: Vec<f64> = (0..=n).rev().map(|k| coef(k, 1.0)).collect();
                Ok(vec![wrap(Lti::tf(num, den, 0.0)?)])
            }
            _ => {
                // The rest need a system first.
                let Some(g) = first_lti.clone() else { return Err("\u{0}".into()) };
                lti_function(it, name, &g, a, nargout)
            }
        }
    })();
    match r {
        Err(e) if e == "\u{0}" => None,
        other => Some(other),
    }
}

fn lti_function(it: &mut Interp, name: &str, g: &Lti, a: &[Value], nargout: usize) -> Out {
    let others: Vec<Lti> = a.iter().skip(1).filter_map(as_lti).cloned().collect();
    match name {
        "pole" => {
            let p = g.poles();
            Ok(vec![Value::Num(Arr::from_c(p.len(), 1, &p))])
        }
        "zero" | "tzero" => {
            let z = g.zeros();
            Ok(vec![Value::Num(Arr::from_c(z.len(), 1, &z))])
        }
        "dcgain" => Ok(vec![Value::num(g.dc())]),
        "isstable" => Ok(vec![Value::boolean(g.stable())]),
        "isct" => Ok(vec![Value::boolean(g.ts == 0.0)]),
        "isdt" => Ok(vec![Value::boolean(g.ts != 0.0)]),
        "order" => Ok(vec![Value::num((g.den.len() - 1) as f64)]),
        "minreal" => Ok(vec![wrap(g.minreal(a.get(1).map(|x| x.scalar()).transpose()?.unwrap_or(1e-6))?)]),
        "tfdata" => Ok(vec![Value::row(g.num.clone()), Value::row(g.den.clone()), Value::num(g.ts)]),
        "zpkdata" => {
            let z = g.zeros();
            let p = g.poles();
            let k = g.num.iter().find(|v| **v != 0.0).copied().unwrap_or(0.0);
            Ok(vec![Value::Num(Arr::from_c(z.len(), 1, &z)), Value::Num(Arr::from_c(p.len(), 1, &p)), Value::num(k), Value::num(g.ts)])
        }
        "ssdata" => {
            let (am, b, c, d) = g.state_space();
            Ok(vec![Value::Num(Arr::from_rows(&am)), Value::col(b), Value::row(c), Value::num(d), Value::num(g.ts)])
        }
        "damp" => {
            let p = g.poles();
            let (mut wn, mut zeta) = (Vec::new(), Vec::new());
            for q in &p {
                let s = if g.ts > 0.0 { C64::new(q.abs().ln(), q.arg()).scale(1.0 / g.ts) } else { *q };
                let w = s.abs();
                wn.push(w);
                zeta.push(if w > 0.0 { -s.re / w } else { -1.0 });
            }
            if nargout == 0 {
                let mut text = String::from("\n         Pole              Damping       Frequency      Time Constant\n                                       (rad/seconds)    (seconds)\n\n");
                for (k, q) in p.iter().enumerate() {
                    let tau = if q.re != 0.0 { -1.0 / q.re } else { f64::INFINITY };
                    text.push_str(&format!("  {:>22}  {:>12}  {:>14}  {:>14}\n", format!("{:.2e}{:+.2e}i", q.re, q.im), format!("{:.2e}", zeta[k]), format!("{:.2e}", wn[k]), format!("{tau:.2e}")));
                }
                it.print(&text);
                return Ok(Vec::new());
            }
            Ok(vec![rows(&wn), rows(&zeta), Value::Num(Arr::from_c(p.len(), 1, &p))])
        }
        "c2d" => {
            let ts = a.get(1).ok_or("c2d: give the sample time")?.scalar()?;
            let method = a.get(2).and_then(|v| v.text().ok()).unwrap_or_else(|| "zoh".into());
            let s = Siso { num: g.num.clone(), den: g.den.clone() };
            let d = match method.as_str() {
                "zoh" => hold(&s, ts, false),
                "foh" => hold(&s, ts, true),
                "tustin" | "bilinear" => tustin(&s, ts),
                "matched" => matched(&s, ts),
                other => return Err(format!("c2d: unknown method '{other}' (zoh, foh, tustin, matched)")),
            };
            let mut out = Lti::tf(d.num, d.den, ts)?.with_form(g.form);
            if g.form == Form::Ss {
                out.ss = None;
                out.form = Form::Tf;
            }
            Ok(vec![wrap(out)])
        }
        "d2c" => {
            // Inverse Tustin: z = (1 + sT/2)/(1 − sT/2).
            if g.ts <= 0.0 {
                return Err("d2c: the system is already continuous".into());
            }
            let t = g.ts;
            let n = g.den.len() - 1;
            let sub = |p: &[f64]| -> Vec<f64> {
                let deg = p.len() - 1;
                let mut out = vec![0.0];
                for (i, coef) in p.iter().enumerate() {
                    let k = deg - i;
                    let term = poly_mul(&crate::nodes::control::poly_pow(&[t / 2.0, 1.0], k), &crate::nodes::control::poly_pow(&[-t / 2.0, 1.0], n - k));
                    out = poly_add(&out, &poly_scale(&term, *coef));
                }
                out
            };
            Ok(vec![wrap(Lti::tf(sub(&g.num), sub(&g.den), 0.0)?.with_form(g.form))])
        }
        "step" | "impulse" => {
            let systems: Vec<Lti> = std::iter::once(g.clone()).chain(others.iter().cloned()).collect();
            let targ = a.iter().skip(1).find(|v| as_lti(v).is_none() && !matches!(v, Value::Str(_)));
            let t = time_arg(g, targ)?;
            let impulse = name == "impulse";
            if nargout == 0 {
                let series: Vec<Series> = systems.iter().enumerate().map(|(k, s)| Series { name: format!("sys{}", k + 1), x: t.clone(), y: simulate(s, &t, &|_| 1.0, impulse), style: if s.ts > 0.0 { "stairs".into() } else { String::new() }, ..Default::default() }).collect();
                plot_into(it, if impulse { "Impulse Response" } else { "Step Response" }, "Time (seconds)", "Amplitude", if g.ts > 0.0 { "stairs" } else { "plot" }, series);
                return Ok(Vec::new());
            }
            let y = simulate(g, &t, &|_| 1.0, impulse);
            Ok(vec![rows(&y), rows(&t)])
        }
        "lsim" => {
            let u = a.get(1).ok_or("lsim: give u and t")?.arr()?.re;
            let t = a.get(2).ok_or("lsim: give u and t")?.arr()?.re;
            if u.len() != t.len() {
                return Err("lsim: u and t need the same length".into());
            }
            let y = simulate(g, &t, &|k| u[k], false);
            if nargout == 0 {
                plot_into(it, "Linear Simulation Results", "Time (seconds)", "Amplitude", "plot", vec![Series { name: "u".into(), x: t.clone(), y: u.clone(), style: ":".into(), ..Default::default() }, Series { name: "y".into(), x: t.clone(), y, style: String::new(), ..Default::default() }]);
                return Ok(Vec::new());
            }
            Ok(vec![rows(&y), rows(&t)])
        }
        "stepinfo" => {
            let t = time_arg(g, None)?;
            let t = {
                // Longer than the plot so the settling time is seen.
                let span = t.last().copied().unwrap_or(10.0) * 2.0;
                if g.ts > 0.0 { (0..(span / g.ts) as usize + 1).map(|k| k as f64 * g.ts).collect::<Vec<_>>() } else { (0..=2000).map(|k| k as f64 * span / 2000.0).collect() }
            };
            let y = simulate(g, &t, &|_| 1.0, false);
            let fin = g.dc();
            let info = step_info(&t, &y, 0.0, if fin.is_finite() { fin } else { *y.last().unwrap_or(&0.0) }, 0.0);
            let settle: Vec<f64> = y.iter().zip(&t).filter(|(_, tt)| **tt >= info.settling.min(f64::MAX)).map(|(v, _)| *v).collect();
            let (smin, smax) = (settle.iter().cloned().fold(f64::INFINITY, f64::min), settle.iter().cloned().fold(f64::NEG_INFINITY, f64::max));
            let fields = ["RiseTime", "TransientTime", "SettlingTime", "SettlingMin", "SettlingMax", "Overshoot", "Undershoot", "Peak", "PeakTime"];
            let under = (-y.iter().cloned().fold(f64::INFINITY, f64::min) / fin.abs().max(1e-300) * 100.0).max(0.0);
            let vals = [info.rise, info.settling, info.settling, smin, smax, info.overshoot, under, info.peak.abs(), info.peak_time];
            Ok(vec![Value::Struct { r: 1, c: 1, fields: fields.iter().map(|s| s.to_string()).collect(), items: vec![vals.iter().map(|v| Value::num(*v)).collect()] }])
        }
        "bode" | "bodemag" => {
            let w = match a.iter().skip(1).find(|v| as_lti(v).is_none()) {
                Some(v) if v.numel() > 2 => v.arr()?.re,
                Some(v) if v.numel() == 2 => {
                    let r = v.arr()?.re;
                    (0..400).map(|k| r[0] * (r[1] / r[0]).powf(k as f64 / 399.0)).collect()
                }
                _ => freq_grid(g),
            };
            let resp: Vec<C64> = w.iter().map(|&x| g.freq(x)).collect();
            let mag: Vec<f64> = resp.iter().map(|z| z.abs()).collect();
            let mut ph: Vec<f64> = resp.iter().map(|z| z.arg().to_degrees()).collect();
            for k in 1..ph.len() {
                while ph[k] - ph[k - 1] > 180.0 {
                    ph[k] -= 360.0;
                }
                while ph[k] - ph[k - 1] < -180.0 {
                    ph[k] += 360.0;
                }
            }
            if nargout == 0 {
                let db: Vec<f64> = mag.iter().map(|m| 20.0 * m.max(1e-300).log10()).collect();
                plot_into(it, "Bode Diagram — Magnitude", "Frequency (rad/s)", "Magnitude (dB)", "semilogx", vec![Series { name: "magnitude".into(), x: w.clone(), y: db, style: String::new(), ..Default::default() }]);
                if name == "bode" {
                    it.figures.push(Figure::default());
                    it.current = it.figures.len() - 1;
                    let hold = it.hold;
                    it.hold = false;
                    plot_into(it, "Bode Diagram — Phase", "Frequency (rad/s)", "Phase (deg)", "semilogx", vec![Series { name: "phase".into(), x: w.clone(), y: ph.clone(), style: String::new(), ..Default::default() }]);
                    it.hold = hold;
                }
                return Ok(Vec::new());
            }
            Ok(vec![rows(&mag), rows(&ph), rows(&w)])
        }
        "nyquist" => {
            let w = freq_grid(g);
            let resp: Vec<C64> = w.iter().map(|&x| g.freq(x)).collect();
            if nargout == 0 {
                let mut x: Vec<f64> = resp.iter().map(|z| z.re).collect();
                let mut y: Vec<f64> = resp.iter().map(|z| z.im).collect();
                // The mirror image for negative frequencies.
                x.push(f64::NAN);
                y.push(f64::NAN);
                x.extend(resp.iter().rev().map(|z| z.re));
                y.extend(resp.iter().rev().map(|z| -z.im));
                plot_into(it, "Nyquist Diagram", "Real Axis", "Imaginary Axis", "plot", vec![Series { name: "G(jω)".into(), x, y, style: String::new(), ..Default::default() }, Series { name: "−1".into(), x: vec![-1.0], y: vec![0.0], style: "r+".into(), ..Default::default() }]);
                return Ok(Vec::new());
            }
            Ok(vec![rows(&resp.iter().map(|z| z.re).collect::<Vec<_>>()), rows(&resp.iter().map(|z| z.im).collect::<Vec<_>>()), rows(&w)])
        }
        "margin" | "allmargin" => {
            let (gm, pm, wcg, wcp) = margins(g);
            if nargout == 0 {
                let w = freq_grid(g);
                let db: Vec<f64> = w.iter().map(|&x| 20.0 * g.freq(x).abs().max(1e-300).log10()).collect();
                plot_into(it, &format!("Bode Diagram — Gm = {} dB (at {} rad/s), Pm = {} deg (at {} rad/s)", super::value::format_num(20.0 * gm.log10()), super::value::format_num(wcg), super::value::format_num(pm), super::value::format_num(wcp)), "Frequency (rad/s)", "Magnitude (dB)", "semilogx", vec![Series { name: "magnitude".into(), x: w, y: db, style: String::new(), ..Default::default() }]);
                return Ok(Vec::new());
            }
            Ok(vec![Value::num(gm), Value::num(pm), Value::num(wcg), Value::num(wcp)])
        }
        "pzmap" | "iopzmap" => {
            let p = g.poles();
            let z = g.zeros();
            if nargout == 0 {
                plot_into(it, "Pole-Zero Map", "Real Axis", "Imaginary Axis", "plot", vec![
                    Series { name: "poles".into(), x: p.iter().map(|q| q.re).collect(), y: p.iter().map(|q| q.im).collect(), style: "x".into(), ..Default::default() },
                    Series { name: "zeros".into(), x: z.iter().map(|q| q.re).collect(), y: z.iter().map(|q| q.im).collect(), style: "o".into(), ..Default::default() },
                ]);
                return Ok(Vec::new());
            }
            Ok(vec![Value::Num(Arr::from_c(p.len(), 1, &p)), Value::Num(Arr::from_c(z.len(), 1, &z))])
        }
        "rlocus" => {
            let ks: Vec<f64> = match a.get(1) {
                Some(v) if as_lti(v).is_none() => v.arr()?.re,
                _ => {
                    let lead = (g.den[0] / g.num.iter().find(|v| **v != 0.0).copied().unwrap_or(1.0)).abs().max(1e-12);
                    let mag: f64 = g.poles().iter().chain(g.zeros().iter()).map(|p| p.abs()).fold(1.0, f64::max);
                    let kmax = lead * mag.powi((g.den.len() as i32 - g.num.len() as i32).max(1)) * 100.0;
                    std::iter::once(0.0).chain((0..400).map(|i| kmax * 1e-6 * (1e6f64).powf(i as f64 / 399.0))).collect()
                }
            };
            let n = g.den.len() - 1;
            let mut branches: Vec<Vec<C64>> = vec![Vec::new(); n];
            let mut prev = g.poles();
            for &k in &ks {
                let mut r = linalg::poly_roots(&poly_add(&g.den, &poly_scale(&g.num, k)));
                let mut ordered = Vec::new();
                for p in &prev {
                    if r.is_empty() {
                        break;
                    }
                    let j = (0..r.len()).min_by(|&x, &y| (r[x] - *p).abs().partial_cmp(&(r[y] - *p).abs()).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
                    ordered.push(r.remove(j));
                }
                for (b, q) in ordered.iter().enumerate() {
                    branches[b].push(*q);
                }
                prev = ordered;
            }
            if nargout == 0 {
                let series: Vec<Series> = branches.iter().enumerate().map(|(b, br)| Series { name: format!("branch {}", b + 1), x: br.iter().map(|q| q.re).collect(), y: br.iter().map(|q| q.im).collect(), style: String::new(), ..Default::default() }).collect();
                let p = g.poles();
                let z = g.zeros();
                let mut all = series;
                all.push(Series { name: "poles".into(), x: p.iter().map(|q| q.re).collect(), y: p.iter().map(|q| q.im).collect(), style: "x".into(), ..Default::default() });
                if !z.is_empty() {
                    all.push(Series { name: "zeros".into(), x: z.iter().map(|q| q.re).collect(), y: z.iter().map(|q| q.im).collect(), style: "o".into(), ..Default::default() });
                }
                plot_into(it, "Root Locus", "Real Axis", "Imaginary Axis", "plot", all);
                return Ok(Vec::new());
            }
            let m = ks.len();
            let mut re = vec![0.0; n * m];
            let mut im = vec![0.0; n * m];
            for (b, br) in branches.iter().enumerate() {
                for (k, q) in br.iter().enumerate() {
                    re[k * n + b] = q.re;
                    im[k * n + b] = q.im;
                }
            }
            Ok(vec![Value::Num(Arr::complex(n, m, re, im)), Value::row(ks)])
        }
        _ => Err("\u{0}".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_like_matlab() {
        let g = Lti::tf(vec![1.0], vec![1.0, 2.0, 1.0], 0.0).unwrap();
        let d = display("G", &g);
        assert!(d.contains("s^2 + 2 s + 1") && d.contains("Continuous-time transfer function."), "{d}");
        let z = Lti::tf(vec![2.0, 2.0], vec![1.0, 5.0, 6.0], 0.0).unwrap().with_form(Form::Zpk);
        let d = display("H", &z);
        assert!(d.contains("2 (s+1)") && d.contains("(s+2) (s+3)"), "{d}");
        let (gm, pm, wcg, _) = margins(&Lti::tf(vec![1.0], vec![1.0, 3.0, 3.0, 1.0], 0.0).unwrap());
        assert!((gm - 8.0).abs() < 1e-3 && (wcg - 3f64.sqrt()).abs() < 1e-3 && pm > 0.0, "{gm} {wcg} {pm}");
    }
}
