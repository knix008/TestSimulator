//! Time integration of x' = f(t, x): explicit Euler, classic RK4 (fixed
//! step), Dormand–Prince RK45 (ode45) and Bogacki–Shampine RK23 (ode23)
//! (adaptive, error controlled), and two stiff solvers with a numerical
//! Jacobian: the Rosenbrock method of ode23s and TR-BDF2 (ode23tb, also used
//! for ode15s). The solution is returned on an even output grid.
//!
//! Event functions g(t, x) are watched at every output step: a sign change
//! (in the chosen direction) is located by bisection and recorded, and a
//! terminal event ends the run there. Delay equations (dde23) integrate with
//! RK4 over a stored history: `integrate_dde`.

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Method {
    Euler,
    Rk4,
    Rk45,
    Rk23,
    Rosenbrock,
    TrBdf2,
}

impl Method {
    pub fn parse(name: &str) -> Result<Method, String> {
        Ok(match name.trim().to_ascii_lowercase().as_str() {
            "euler" | "ode1" => Method::Euler,
            "rk4" | "ode4" => Method::Rk4,
            "" | "rk45" | "ode45" | "dopri" | "dormandprince" | "adaptive" => Method::Rk45,
            "rk23" | "ode23" | "bogacki" => Method::Rk23,
            "ode23s" | "rosenbrock" => Method::Rosenbrock,
            "ode23tb" | "trbdf2" | "ode15s" | "stiff" | "bdf" => Method::TrBdf2,
            other => return Err(format!("unknown method \"{other}\" (euler, rk4, rk45/ode45, ode23, ode23s, ode23tb/ode15s)")),
        })
    }

    pub fn adaptive(self) -> bool {
        !matches!(self, Method::Euler | Method::Rk4)
    }
}

pub struct Options {
    pub method: Method,
    pub t0: f64,
    pub t_end: f64,
    /// Output step.
    pub dt: f64,
    /// Fixed-step methods take this many steps per output step.
    pub substeps: usize,
    pub rtol: f64,
    pub atol: f64,
}

/// An event function g(t, x): a zero crossing in `direction` (−1 falling,
/// +1 rising, 0 both) is an event; a terminal one stops the integration.
pub struct Event<'a> {
    pub g: Box<dyn FnMut(f64, &[f64]) -> f64 + 'a>,
    pub direction: i32,
    pub terminal: bool,
}

/// One located event: which, when and the state there.
#[derive(Clone, Debug)]
pub struct EventHit {
    pub index: usize,
    pub t: f64,
    pub x: Vec<f64>,
}

pub struct Solution {
    pub t: Vec<f64>,
    /// x[state][output index]
    pub x: Vec<Vec<f64>>,
    pub steps: usize,
    pub rejected: usize,
    pub warning: Option<String>,
    pub events: Vec<EventHit>,
}

/// The right-hand side: f(t, x, dx).
pub type Rhs<'a> = dyn FnMut(f64, &[f64], &mut [f64]) + 'a;

pub fn integrate(f: &mut Rhs, x0: &[f64], opt: &Options, cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(f64)) -> Result<Solution, String> {
    integrate_events(f, x0, opt, &mut [], cancel, progress)
}

/// Working arrays and the adaptive step of one integration.
struct Stepper {
    n: usize,
    k: Vec<Vec<f64>>,
    tmp: Vec<f64>,
    h: f64,
    fsal: bool,
    steps: usize,
    rejected: usize,
}

impl Stepper {
    fn new(n: usize, h: f64) -> Self {
        Stepper { n, k: vec![vec![0.0; n]; 8], tmp: vec![0.0; n], h, fsal: false, steps: 0, rejected: 0 }
    }

    /// Advances x from t to target (adaptive methods choose their own steps).
    fn advance(&mut self, f: &mut Rhs, method: Method, t: &mut f64, x: &mut [f64], target: f64, opt: &Options) -> Result<(), String> {
        match method {
            Method::Euler | Method::Rk4 => {
                let sub = opt.substeps.max(1);
                let hs = (target - *t) / sub as f64;
                for _ in 0..sub {
                    if method == Method::Euler {
                        euler_step(f, *t, x, hs, &mut self.k[0]);
                    } else {
                        rk4_step(f, *t, x, hs, &mut self.k, &mut self.tmp);
                    }
                    *t += hs;
                    self.steps += 1;
                }
                *t = target;
                Ok(())
            }
            _ => self.adaptive(f, method, t, x, target, opt),
        }
    }

    fn adaptive(&mut self, f: &mut Rhs, method: Method, t: &mut f64, x: &mut [f64], target: f64, opt: &Options) -> Result<(), String> {
        let n = self.n;
        let mut guard = 0usize;
        let mut xn = vec![0.0; n];
        while *t < target - 1e-14 * target.abs().max(1.0) {
            guard += 1;
            if guard > 2_000_000 {
                return Err("the step size became too small (the system may be stiff — try ode23s or ode15s — or blow up)".into());
            }
            let last = self.h >= target - *t;
            let hs = if last { target - *t } else { self.h };
            let (err, order) = match method {
                Method::Rk45 => (self.dopri(f, *t, x, hs, &mut xn, opt), 5.0),
                Method::Rk23 => (self.bs23(f, *t, x, hs, &mut xn, opt), 3.0),
                Method::Rosenbrock => (rosenbrock(f, *t, x, hs, &mut xn, opt)?, 3.0),
                _ => (tr_bdf2(f, *t, x, hs, &mut xn, opt)?, 3.0),
            };
            if !err.is_finite() {
                if hs < 1e-14 * t.abs().max(1.0) {
                    return Err(format!("the solution is not finite at t = {:.6} (it blows up)", *t));
                }
                self.h = hs * 0.1;
                self.fsal = false;
                self.rejected += 1;
                continue;
            }
            if err <= 1.0 {
                *t += hs;
                x.copy_from_slice(&xn);
                if matches!(method, Method::Rk45 | Method::Rk23) {
                    let last_k = if method == Method::Rk45 { 6 } else { 3 };
                    let k = std::mem::take(&mut self.k[last_k]);
                    self.k[0].copy_from_slice(&k);
                    self.k[last_k] = k;
                    self.fsal = true;
                }
                self.steps += 1;
                let grow = if err == 0.0 { 5.0 } else { (0.9 * err.powf(-1.0 / order)).clamp(0.2, 5.0) };
                if !last {
                    self.h = hs * grow;
                } else {
                    self.h = self.h.max(hs * grow.min(1.0));
                }
            } else {
                self.h = hs * (0.9 * err.powf(-1.0 / (order - 1.0))).clamp(0.1, 0.9);
                self.fsal = false;
                self.rejected += 1;
                if self.h < 1e-15 * t.abs().max(1.0) {
                    return Err(format!("the step size became too small at t = {:.6}", *t));
                }
            }
        }
        *t = target;
        Ok(())
    }

    /// Dormand–Prince 5(4): xn = the 5th order solution, returns the scaled error.
    fn dopri(&mut self, f: &mut Rhs, t: f64, x: &[f64], hs: f64, xn: &mut [f64], opt: &Options) -> f64 {
        let n = self.n;
        let [k1, k2, k3, k4, k5, k6, k7, _] = &mut self.k[..] else { unreachable!() };
        let tmp = &mut self.tmp;
        if !self.fsal {
            f(t, x, k1);
        }
        for i in 0..n {
            tmp[i] = x[i] + hs * (1.0 / 5.0) * k1[i];
        }
        f(t + hs / 5.0, tmp, k2);
        for i in 0..n {
            tmp[i] = x[i] + hs * (3.0 / 40.0 * k1[i] + 9.0 / 40.0 * k2[i]);
        }
        f(t + 3.0 * hs / 10.0, tmp, k3);
        for i in 0..n {
            tmp[i] = x[i] + hs * (44.0 / 45.0 * k1[i] - 56.0 / 15.0 * k2[i] + 32.0 / 9.0 * k3[i]);
        }
        f(t + 4.0 * hs / 5.0, tmp, k4);
        for i in 0..n {
            tmp[i] = x[i] + hs * (19372.0 / 6561.0 * k1[i] - 25360.0 / 2187.0 * k2[i] + 64448.0 / 6561.0 * k3[i] - 212.0 / 729.0 * k4[i]);
        }
        f(t + 8.0 * hs / 9.0, tmp, k5);
        for i in 0..n {
            tmp[i] = x[i] + hs * (9017.0 / 3168.0 * k1[i] - 355.0 / 33.0 * k2[i] + 46732.0 / 5247.0 * k3[i] + 49.0 / 176.0 * k4[i] - 5103.0 / 18656.0 * k5[i]);
        }
        f(t + hs, tmp, k6);
        for i in 0..n {
            xn[i] = x[i] + hs * (35.0 / 384.0 * k1[i] + 500.0 / 1113.0 * k3[i] + 125.0 / 192.0 * k4[i] - 2187.0 / 6784.0 * k5[i] + 11.0 / 84.0 * k6[i]);
        }
        f(t + hs, xn, k7);
        let mut err = 0.0f64;
        for i in 0..n {
            let e = hs * ((35.0 / 384.0 - 5179.0 / 57600.0) * k1[i] + (500.0 / 1113.0 - 7571.0 / 16695.0) * k3[i] + (125.0 / 192.0 - 393.0 / 640.0) * k4[i]
                + (-2187.0 / 6784.0 + 92097.0 / 339200.0) * k5[i] + (11.0 / 84.0 - 187.0 / 2100.0) * k6[i] - 1.0 / 40.0 * k7[i]);
            let scale = opt.atol + opt.rtol * x[i].abs().max(xn[i].abs());
            err = err.max((e / scale).abs());
        }
        err
    }

    /// Bogacki–Shampine 3(2) (MATLAB's ode23).
    fn bs23(&mut self, f: &mut Rhs, t: f64, x: &[f64], hs: f64, xn: &mut [f64], opt: &Options) -> f64 {
        let n = self.n;
        let [k1, k2, k3, k4, ..] = &mut self.k[..] else { unreachable!() };
        let tmp = &mut self.tmp;
        if !self.fsal {
            f(t, x, k1);
        }
        for i in 0..n {
            tmp[i] = x[i] + 0.5 * hs * k1[i];
        }
        f(t + 0.5 * hs, tmp, k2);
        for i in 0..n {
            tmp[i] = x[i] + 0.75 * hs * k2[i];
        }
        f(t + 0.75 * hs, tmp, k3);
        for i in 0..n {
            xn[i] = x[i] + hs * (2.0 / 9.0 * k1[i] + 1.0 / 3.0 * k2[i] + 4.0 / 9.0 * k3[i]);
        }
        f(t + hs, xn, k4);
        let mut err = 0.0f64;
        for i in 0..n {
            let e = hs * (-5.0 / 72.0 * k1[i] + 1.0 / 12.0 * k2[i] + 1.0 / 9.0 * k3[i] - 1.0 / 8.0 * k4[i]);
            let scale = opt.atol + opt.rtol * x[i].abs().max(xn[i].abs());
            err = err.max((e / scale).abs());
        }
        err
    }
}

fn euler_step(f: &mut Rhs, t: f64, x: &mut [f64], h: f64, k1: &mut [f64]) {
    f(t, x, k1);
    for i in 0..x.len() {
        x[i] += h * k1[i];
    }
}

fn rk4_step(f: &mut Rhs, t: f64, x: &mut [f64], h: f64, k: &mut [Vec<f64>], tmp: &mut [f64]) {
    let n = x.len();
    let [k1, k2, k3, k4, ..] = k else { unreachable!() };
    f(t, x, k1);
    for i in 0..n {
        tmp[i] = x[i] + 0.5 * h * k1[i];
    }
    f(t + 0.5 * h, tmp, k2);
    for i in 0..n {
        tmp[i] = x[i] + 0.5 * h * k2[i];
    }
    f(t + 0.5 * h, tmp, k3);
    for i in 0..n {
        tmp[i] = x[i] + h * k3[i];
    }
    f(t + h, tmp, k4);
    for i in 0..n {
        x[i] += h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
    }
}

// ───────────────────────── stiff solvers

/// A dense LU factorisation with partial pivoting (small systems).
pub struct Lu {
    m: Vec<Vec<f64>>,
    piv: Vec<usize>,
}

impl Lu {
    pub fn new(mut m: Vec<Vec<f64>>) -> Result<Lu, String> {
        let n = m.len();
        let mut piv: Vec<usize> = (0..n).collect();
        for c in 0..n {
            let p = (c..n).max_by(|&i, &j| m[i][c].abs().partial_cmp(&m[j][c].abs()).unwrap_or(std::cmp::Ordering::Equal)).unwrap_or(c);
            if !(m[p][c].abs() > 1e-300) {
                return Err("the iteration matrix is singular".into());
            }
            m.swap(c, p);
            piv.swap(c, p);
            for r in c + 1..n {
                let f = m[r][c] / m[c][c];
                m[r][c] = f;
                if f != 0.0 {
                    for k in c + 1..n {
                        m[r][k] -= f * m[c][k];
                    }
                }
            }
        }
        Ok(Lu { m, piv })
    }

    pub fn solve(&self, b: &[f64]) -> Vec<f64> {
        let n = self.m.len();
        let mut x: Vec<f64> = self.piv.iter().map(|&p| b[p]).collect();
        for r in 0..n {
            for k in 0..r {
                x[r] -= self.m[r][k] * x[k];
            }
        }
        for r in (0..n).rev() {
            for k in r + 1..n {
                x[r] -= self.m[r][k] * x[k];
            }
            x[r] /= self.m[r][r];
        }
        x
    }
}

/// Forward-difference Jacobian ∂f/∂x at (t, x); f0 = f(t, x).
fn jacobian(f: &mut Rhs, t: f64, x: &[f64], f0: &[f64]) -> Vec<Vec<f64>> {
    let n = x.len();
    let mut j = vec![vec![0.0; n]; n];
    let mut xp = x.to_vec();
    let mut fp = vec![0.0; n];
    for c in 0..n {
        let d = 1.5e-8 * x[c].abs().max(1e-5);
        xp[c] = x[c] + d;
        f(t, &xp, &mut fp);
        for r in 0..n {
            j[r][c] = (fp[r] - f0[r]) / d;
        }
        xp[c] = x[c];
    }
    j
}

/// I − c·h·J
fn iteration_matrix(jac: &[Vec<f64>], ch: f64) -> Vec<Vec<f64>> {
    let n = jac.len();
    (0..n).map(|r| (0..n).map(|c| (if r == c { 1.0 } else { 0.0 }) - ch * jac[r][c]).collect()).collect()
}

fn scaled_error(e: &[f64], x: &[f64], xn: &[f64], opt: &Options) -> f64 {
    if e.iter().chain(xn).any(|v| !v.is_finite()) {
        return f64::INFINITY;
    }
    e.iter().enumerate().fold(0.0f64, |m, (i, v)| m.max((v / (opt.atol + opt.rtol * x[i].abs().max(xn[i].abs()))).abs()))
}

/// The modified Rosenbrock triple of ode23s (Shampine & Reichelt 1997).
fn rosenbrock(f: &mut Rhs, t: f64, x: &[f64], h: f64, xn: &mut [f64], opt: &Options) -> Result<f64, String> {
    let n = x.len();
    let d = 1.0 / (2.0 + 2f64.sqrt());
    let e32 = 6.0 + 2f64.sqrt();
    let mut f0 = vec![0.0; n];
    f(t, x, &mut f0);
    let jac = jacobian(f, t, x, &f0);
    // ∂f/∂t by a forward difference.
    let dt = 1.5e-8 * t.abs().max(1e-5);
    let mut ft = vec![0.0; n];
    f(t + dt, x, &mut ft);
    let tder: Vec<f64> = (0..n).map(|i| (ft[i] - f0[i]) / dt).collect();
    let Ok(lu) = Lu::new(iteration_matrix(&jac, d * h)) else { return Ok(f64::INFINITY) };
    let k1 = lu.solve(&(0..n).map(|i| f0[i] + h * d * tder[i]).collect::<Vec<_>>());
    let mid: Vec<f64> = (0..n).map(|i| x[i] + 0.5 * h * k1[i]).collect();
    let mut f1 = vec![0.0; n];
    f(t + 0.5 * h, &mid, &mut f1);
    let k2: Vec<f64> = lu.solve(&(0..n).map(|i| f1[i] - k1[i]).collect::<Vec<_>>()).iter().zip(&k1).map(|(a, b)| a + b).collect();
    for i in 0..n {
        xn[i] = x[i] + h * k2[i];
    }
    let mut f2 = vec![0.0; n];
    f(t + h, xn, &mut f2);
    let k3 = lu.solve(&(0..n).map(|i| f2[i] - e32 * (k2[i] - f1[i]) - 2.0 * (k1[i] - f0[i]) + h * d * tder[i]).collect::<Vec<_>>());
    let e: Vec<f64> = (0..n).map(|i| h / 6.0 * (k1[i] - 2.0 * k2[i] + k3[i])).collect();
    Ok(scaled_error(&e, x, xn, opt))
}

/// TR-BDF2 (Bank et al.; Hosea & Shampine's ode23tb): a trapezoidal stage to
/// t + γh, then BDF2 to t + h, both solved by simplified Newton.
fn tr_bdf2(f: &mut Rhs, t: f64, x: &[f64], h: f64, xn: &mut [f64], opt: &Options) -> Result<f64, String> {
    let n = x.len();
    let g = 2.0 - 2f64.sqrt();
    let w = (1.0 - g) / (2.0 - g); // = γ/2
    let mut f0 = vec![0.0; n];
    f(t, x, &mut f0);
    let jac = jacobian(f, t, x, &f0);
    let Ok(lu) = Lu::new(iteration_matrix(&jac, w * h)) else { return Ok(f64::INFINITY) };
    let newton = |f: &mut Rhs, tt: f64, rhs_const: &[f64], guess: &mut Vec<f64>| -> Result<Vec<f64>, String> {
        // Solve y − w h f(tt, y) = rhs_const.
        let mut fy = vec![0.0; n];
        for it in 0..12 {
            f(tt, guess, &mut fy);
            let res: Vec<f64> = (0..n).map(|i| rhs_const[i] - guess[i] + w * h * fy[i]).collect();
            let dy = lu.solve(&res);
            let mut size = 0.0f64;
            for i in 0..n {
                guess[i] += dy[i];
                size = size.max((dy[i] / (opt.atol + opt.rtol * guess[i].abs())).abs());
            }
            if !size.is_finite() {
                break;
            }
            if size < 0.01 || (it > 0 && size < 1e-3) {
                f(tt, guess, &mut fy);
                return Ok(fy);
            }
        }
        Err("newton".into())
    };
    // Stage 1: y_g − (γh/2) f_g = y + (γh/2) f0.
    let c1: Vec<f64> = (0..n).map(|i| x[i] + w * h * f0[i]).collect();
    let mut yg: Vec<f64> = (0..n).map(|i| x[i] + g * h * f0[i]).collect();
    let fg = match newton(f, t + g * h, &c1, &mut yg) {
        Ok(v) => v,
        Err(_) => return Ok(f64::INFINITY),
    };
    // Stage 2: y1 − w h f1 = (y_g − (1−γ)² y) / (γ(2−γ)).
    let a = 1.0 / (g * (2.0 - g));
    let b = (1.0 - g) * (1.0 - g) / (g * (2.0 - g));
    let c2: Vec<f64> = (0..n).map(|i| a * yg[i] - b * x[i]).collect();
    let mut y1: Vec<f64> = (0..n).map(|i| x[i] + h * fg[i]).collect();
    let f1 = match newton(f, t + h, &c2, &mut y1) {
        Ok(v) => v,
        Err(_) => return Ok(f64::INFINITY),
    };
    xn.copy_from_slice(&y1);
    let k = (-3.0 * g * g + 4.0 * g - 2.0) / (12.0 * (2.0 - g));
    let e: Vec<f64> = (0..n).map(|i| 2.0 * k * h * (f0[i] / g - fg[i] / (g * (1.0 - g)) + f1[i] / (1.0 - g))).collect();
    // Filter the estimate through the iteration matrix (Shampine) so stiff components are not over-counted.
    let e = lu.solve(&e);
    Ok(scaled_error(&e, x, xn, opt))
}

// ───────────────────────── driver

pub fn integrate_events(f: &mut Rhs, x0: &[f64], opt: &Options, events: &mut [Event], cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(f64)) -> Result<Solution, String> {
    if !(opt.dt > 0.0) || !opt.t_end.is_finite() || opt.t_end <= opt.t0 {
        return Err("the end time must be after the start and the step positive".into());
    }
    let count = ((opt.t_end - opt.t0) / opt.dt).round() as usize + 1;
    if count > 5_000_001 {
        return Err(format!("{count} output points are too many (at most 5 million): use a larger step"));
    }
    let n = x0.len();
    let mut sol = Solution { t: Vec::with_capacity(count), x: vec![Vec::with_capacity(count); n], steps: 0, rejected: 0, warning: None, events: Vec::new() };
    let mut x = x0.to_vec();
    let mut t = opt.t0;
    let record = |sol: &mut Solution, t: f64, x: &[f64]| {
        sol.t.push(t);
        for (i, v) in x.iter().enumerate() {
            sol.x[i].push(*v);
        }
    };
    record(&mut sol, t, &x);
    let mut st = Stepper::new(n, opt.dt.min((opt.t_end - opt.t0) / 100.0).max(1e-12));
    let mut gprev: Vec<f64> = events.iter_mut().map(|e| (e.g)(t, &x)).collect();
    'outer: for index in 1..count {
        let target = opt.t0 + opt.dt * index as f64;
        if index % 256 == 0 {
            if cancel() {
                return Err("cancelled".into());
            }
            progress(index as f64 / count as f64);
        }
        let (t_prev, x_prev) = (t, x.clone());
        st.advance(f, opt.method, &mut t, &mut x, target, opt)?;
        if x.iter().any(|v| !v.is_finite()) {
            sol.warning = Some(format!("the solution stopped being finite at t = {t:.6}"));
            record(&mut sol, t, &x);
            break;
        }
        if !events.is_empty() {
            // Find the earliest crossing in this output step.
            let gnow: Vec<f64> = events.iter_mut().map(|e| (e.g)(t, &x)).collect();
            let mut hits: Vec<(f64, usize, Vec<f64>)> = Vec::new();
            for (k, ev) in events.iter_mut().enumerate() {
                let (a, b) = (gprev[k], gnow[k]);
                let crossed = (a < 0.0 && b >= 0.0 && ev.direction >= 0) || (a > 0.0 && b <= 0.0 && ev.direction <= 0);
                if !crossed {
                    continue;
                }
                // Bisection: re-integrate from the step start with fine RK4 steps.
                let (mut lo, mut hi) = (t_prev, t);
                let mut xs = x.clone();
                for _ in 0..50 {
                    let mid = 0.5 * (lo + hi);
                    let xm = fine(f, t_prev, &x_prev, mid, opt.dt);
                    let gm = (ev.g)(mid, &xm);
                    if (gm < 0.0) == (a < 0.0) && gm != 0.0 {
                        lo = mid;
                    } else {
                        hi = mid;
                        xs = xm;
                    }
                    if hi - lo <= 1e-12 * hi.abs().max(1.0) {
                        break;
                    }
                }
                hits.push((hi, k, xs));
            }
            gprev = gnow;
            hits.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap_or(std::cmp::Ordering::Equal));
            for (te, k, xe) in hits {
                sol.events.push(EventHit { index: k, t: te, x: xe.clone() });
                if events[k].terminal {
                    record(&mut sol, te, &xe);
                    break 'outer;
                }
            }
        }
        record(&mut sol, t, &x);
    }
    sol.steps = st.steps;
    sol.rejected = st.rejected;
    Ok(sol)
}

/// x at time `to` from (t0, x0) by RK4 steps no longer than dt/16 (event location).
fn fine(f: &mut Rhs, t0: f64, x0: &[f64], to: f64, dt: f64) -> Vec<f64> {
    let n = x0.len();
    let steps = (((to - t0) / (dt / 16.0)).ceil() as usize).max(1);
    let h = (to - t0) / steps as f64;
    let mut x = x0.to_vec();
    let mut k = vec![vec![0.0; n]; 4];
    let mut tmp = vec![0.0; n];
    for s in 0..steps {
        rk4_step(f, t0 + s as f64 * h, &mut x, h, &mut k, &mut tmp);
    }
    x
}

// ───────────────────────── delay equations

/// One delayed value x_state(t − lag) the right-hand side reads.
#[derive(Clone, Copy, Debug)]
pub struct Lag {
    pub state: usize,
    pub lag: f64,
}

/// The right-hand side of a delay equation: f(t, x, delayed values, dx).
pub type DdeRhs<'a> = dyn FnMut(f64, &[f64], &[f64], &mut [f64]) + 'a;

/// Integrates x'(t) = f(t, x(t), x(t − τ₁), …) by RK4 with `substeps` steps per
/// output step; before t0 the history is the constant x0. Delayed values come
/// from cubic Hermite interpolation of every step taken.
pub fn integrate_dde(f: &mut DdeRhs, x0: &[f64], lags: &[Lag], opt: &Options, cancel: &dyn Fn() -> bool) -> Result<Solution, String> {
    if !(opt.dt > 0.0) || !opt.t_end.is_finite() || opt.t_end <= opt.t0 {
        return Err("the end time must be after the start and the step positive".into());
    }
    if let Some(l) = lags.iter().find(|l| !(l.lag > 0.0)) {
        return Err(format!("a delay must be positive (got {})", l.lag));
    }
    let count = ((opt.t_end - opt.t0) / opt.dt).round() as usize + 1;
    if count > 2_000_001 {
        return Err(format!("{count} output points are too many for a delay equation: use a larger step"));
    }
    let n = x0.len();
    let sub = opt.substeps.max(1);
    let h = opt.dt / sub as f64;
    let mut warning = None;
    if let Some(l) = lags.iter().find(|l| l.lag < h) {
        warning = Some(format!("the delay {} is shorter than the internal step {h}: use a smaller step", l.lag));
    }
    // History: times, states and derivatives at every step.
    let mut ht: Vec<f64> = vec![opt.t0];
    let mut hx: Vec<Vec<f64>> = vec![x0.to_vec()];
    let mut hd: Vec<Vec<f64>> = Vec::new();
    let delayed = |ht: &[f64], hx: &[Vec<f64>], hd: &[Vec<f64>], t: f64, out: &mut Vec<f64>| {
        out.clear();
        for l in lags {
            let tq = t - l.lag;
            let s = l.state;
            if tq <= ht[0] {
                out.push(hx[0][s]);
                continue;
            }
            let last = ht.len() - 1;
            if tq >= ht[last] || hd.len() < last {
                out.push(hx[last][s]);
                continue;
            }
            let i = match ht.binary_search_by(|v| v.partial_cmp(&tq).unwrap_or(std::cmp::Ordering::Less)) {
                Ok(i) => i.min(last - 1),
                Err(i) => i - 1,
            };
            let (t0, t1) = (ht[i], ht[i + 1]);
            let dtt = t1 - t0;
            let u = (tq - t0) / dtt;
            let (h00, h10, h01, h11) = (2.0 * u.powi(3) - 3.0 * u * u + 1.0, u.powi(3) - 2.0 * u * u + u, -2.0 * u.powi(3) + 3.0 * u * u, u.powi(3) - u * u);
            out.push(h00 * hx[i][s] + h10 * dtt * hd[i][s] + h01 * hx[i + 1][s] + h11 * dtt * hd[i + 1][s]);
        }
    };
    let mut sol = Solution { t: vec![opt.t0], x: x0.iter().map(|v| vec![*v]).collect(), steps: 0, rejected: 0, warning, events: Vec::new() };
    let mut x = x0.to_vec();
    let mut t = opt.t0;
    let mut z = Vec::with_capacity(lags.len());
    let (mut k1, mut k2, mut k3, mut k4, mut tmp) = (vec![0.0; n], vec![0.0; n], vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    for index in 1..count {
        if index % 256 == 0 && cancel() {
            return Err("cancelled".into());
        }
        let target = opt.t0 + opt.dt * index as f64;
        for _ in 0..sub {
            delayed(&ht, &hx, &hd, t, &mut z);
            f(t, &x, &z, &mut k1);
            if hd.len() < ht.len() {
                hd.push(k1.clone());
            }
            for i in 0..n {
                tmp[i] = x[i] + 0.5 * h * k1[i];
            }
            delayed(&ht, &hx, &hd, t + 0.5 * h, &mut z);
            f(t + 0.5 * h, &tmp, &z, &mut k2);
            for i in 0..n {
                tmp[i] = x[i] + 0.5 * h * k2[i];
            }
            f(t + 0.5 * h, &tmp, &z, &mut k3);
            for i in 0..n {
                tmp[i] = x[i] + h * k3[i];
            }
            delayed(&ht, &hx, &hd, t + h, &mut z);
            f(t + h, &tmp, &z, &mut k4);
            for i in 0..n {
                x[i] += h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
            }
            t += h;
            sol.steps += 1;
            ht.push(t);
            hx.push(x.clone());
        }
        t = target;
        if x.iter().any(|v| !v.is_finite()) {
            sol.warning = Some(format!("the solution stopped being finite at t = {t:.6}"));
            break;
        }
        sol.t.push(t);
        for i in 0..n {
            sol.x[i].push(x[i]);
        }
    }
    Ok(sol)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(method: Method, t_end: f64, dt: f64) -> Options {
        Options { method, t0: 0.0, t_end, dt, substeps: 1, rtol: 1e-9, atol: 1e-12 }
    }

    #[test]
    fn harmonic_oscillator() {
        // x'' = -x, x(0)=1 → x = cos t.
        for (method, tol) in [(Method::Rk4, 1e-7), (Method::Rk45, 1e-7), (Method::Rk23, 1e-6), (Method::Rosenbrock, 1e-4), (Method::TrBdf2, 1e-4)] {
            let opt = Options { rtol: if method.adaptive() && method != Method::Rk45 { 1e-7 } else { 1e-9 }, ..opts(method, 10.0, 0.01) };
            let mut f = |_t: f64, x: &[f64], dx: &mut [f64]| {
                dx[0] = x[1];
                dx[1] = -x[0];
            };
            let sol = integrate(&mut f, &[1.0, 0.0], &opt, &|| false, &mut |_| {}).unwrap();
            assert_eq!(sol.t.len(), 1001);
            let last = sol.x[0][1000];
            assert!((last - 10f64.cos()).abs() < tol, "{method:?} {last}");
        }
    }

    #[test]
    fn exponential_decay_euler_converges() {
        let opt = Options { method: Method::Euler, t0: 0.0, t_end: 1.0, dt: 0.1, substeps: 1000, rtol: 0.0, atol: 0.0 };
        let mut f = |_t: f64, x: &[f64], dx: &mut [f64]| dx[0] = -x[0];
        let sol = integrate(&mut f, &[1.0], &opt, &|| false, &mut |_| {}).unwrap();
        assert!((sol.x[0][10] - (-1f64).exp()).abs() < 1e-3);
    }

    #[test]
    fn stiff_robertson_takes_few_steps() {
        // Robertson's chemical kinetics: the classic stiff test (x1 + x2 + x3 = 1).
        let mut f = |_t: f64, y: &[f64], d: &mut [f64]| {
            d[0] = -0.04 * y[0] + 1e4 * y[1] * y[2];
            d[1] = 0.04 * y[0] - 1e4 * y[1] * y[2] - 3e7 * y[1] * y[1];
            d[2] = 3e7 * y[1] * y[1];
        };
        for method in [Method::Rosenbrock, Method::TrBdf2] {
            let opt = Options { rtol: 1e-4, atol: 1e-8, ..opts(method, 40.0, 1.0) };
            let sol = integrate(&mut f, &[1.0, 0.0, 0.0], &opt, &|| false, &mut |_| {}).unwrap();
            // Reference (Hairer–Wanner): y1(40) = 0.7158, y3(40) = 0.2842.
            assert!((sol.x[0][40] - 0.7158).abs() < 2e-3, "{method:?} {}", sol.x[0][40]);
            assert!((sol.x[0][40] + sol.x[1][40] + sol.x[2][40] - 1.0).abs() < 1e-3);
            assert!(sol.steps < 2000, "{method:?} took {} steps", sol.steps);
        }
    }

    #[test]
    fn falling_ball_event_stops_at_the_ground() {
        // y'' = −g from y = 10: hits y = 0 at t = √(2·10/g).
        let mut f = |_t: f64, x: &[f64], dx: &mut [f64]| {
            dx[0] = x[1];
            dx[1] = -9.81;
        };
        let mut events = vec![Event { g: Box::new(|_t, x: &[f64]| x[0]), direction: -1, terminal: true }];
        let sol = integrate_events(&mut f, &[10.0, 0.0], &opts(Method::Rk45, 5.0, 0.01), &mut events, &|| false, &mut |_| {}).unwrap();
        let te = (20.0f64 / 9.81).sqrt();
        assert_eq!(sol.events.len(), 1);
        assert!((sol.events[0].t - te).abs() < 1e-8, "{}", sol.events[0].t);
        assert!((sol.t.last().unwrap() - te).abs() < 1e-8);
    }

    #[test]
    fn delay_equation_matches_method_of_steps() {
        // x' = −x(t − 1), x = 1 for t ≤ 0: x = 1 − t on [0, 1], 1 − t + (t − 1)²/2 on [1, 2].
        let mut f = |_t: f64, _x: &[f64], z: &[f64], dx: &mut [f64]| dx[0] = -z[0];
        let opt = Options { substeps: 10, ..opts(Method::Rk4, 2.0, 0.01) };
        let sol = integrate_dde(&mut f, &[1.0], &[Lag { state: 0, lag: 1.0 }], &opt, &|| false).unwrap();
        let t = 1.75;
        let exact = 1.0 - t + (t - 1.0) * (t - 1.0) / 2.0;
        assert!((sol.x[0][175] - exact).abs() < 1e-6, "{} vs {exact}", sol.x[0][175]);
    }
}
