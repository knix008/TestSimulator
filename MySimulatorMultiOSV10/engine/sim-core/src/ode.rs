//! Time integration of x' = f(t, x): explicit Euler, classic RK4 (fixed
//! step) and Dormand–Prince RK45 (adaptive, error controlled). The solution
//! is returned on an even output grid.

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Method {
    Euler,
    Rk4,
    Rk45,
}

impl Method {
    pub fn parse(name: &str) -> Result<Method, String> {
        Ok(match name.trim().to_ascii_lowercase().as_str() {
            "euler" => Method::Euler,
            "rk4" => Method::Rk4,
            "" | "rk45" | "dopri" | "dormandprince" | "adaptive" => Method::Rk45,
            other => return Err(format!("unknown method \"{other}\" (euler, rk4, rk45)")),
        })
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

pub struct Solution {
    pub t: Vec<f64>,
    /// x[state][output index]
    pub x: Vec<Vec<f64>>,
    pub steps: usize,
    pub rejected: usize,
    pub warning: Option<String>,
}

/// The right-hand side: f(t, x, dx).
pub type Rhs<'a> = dyn FnMut(f64, &[f64], &mut [f64]) + 'a;

pub fn integrate(f: &mut Rhs, x0: &[f64], opt: &Options, cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(f64)) -> Result<Solution, String> {
    if !(opt.dt > 0.0) || !opt.t_end.is_finite() || opt.t_end <= opt.t0 {
        return Err("the end time must be after the start and the step positive".into());
    }
    let count = ((opt.t_end - opt.t0) / opt.dt).round() as usize + 1;
    if count > 5_000_001 {
        return Err(format!("{count} output points are too many (at most 5 million): use a larger step"));
    }
    let n = x0.len();
    let mut sol = Solution { t: Vec::with_capacity(count), x: vec![Vec::with_capacity(count); n], steps: 0, rejected: 0, warning: None };
    let mut x = x0.to_vec();
    let mut t = opt.t0;
    let record = |sol: &mut Solution, t: f64, x: &[f64]| {
        sol.t.push(t);
        for (i, v) in x.iter().enumerate() {
            sol.x[i].push(*v);
        }
    };
    record(&mut sol, t, &x);
    let mut k1 = vec![0.0; n];
    let mut k2 = vec![0.0; n];
    let mut k3 = vec![0.0; n];
    let mut k4 = vec![0.0; n];
    let mut k5 = vec![0.0; n];
    let mut k6 = vec![0.0; n];
    let mut k7 = vec![0.0; n];
    let mut tmp = vec![0.0; n];
    let mut h = opt.dt.min((opt.t_end - opt.t0) / 100.0).max(1e-12);
    let mut fsal = false;
    for index in 1..count {
        let target = opt.t0 + opt.dt * index as f64;
        if index % 256 == 0 {
            if cancel() {
                return Err("cancelled".into());
            }
            progress(index as f64 / count as f64);
        }
        match opt.method {
            Method::Euler | Method::Rk4 => {
                let sub = opt.substeps.max(1);
                let hs = (target - t) / sub as f64;
                for _ in 0..sub {
                    if opt.method == Method::Euler {
                        f(t, &x, &mut k1);
                        for i in 0..n {
                            x[i] += hs * k1[i];
                        }
                    } else {
                        f(t, &x, &mut k1);
                        for i in 0..n {
                            tmp[i] = x[i] + 0.5 * hs * k1[i];
                        }
                        f(t + 0.5 * hs, &tmp, &mut k2);
                        for i in 0..n {
                            tmp[i] = x[i] + 0.5 * hs * k2[i];
                        }
                        f(t + 0.5 * hs, &tmp, &mut k3);
                        for i in 0..n {
                            tmp[i] = x[i] + hs * k3[i];
                        }
                        f(t + hs, &tmp, &mut k4);
                        for i in 0..n {
                            x[i] += hs / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
                        }
                    }
                    t += hs;
                    sol.steps += 1;
                }
                t = target;
            }
            Method::Rk45 => {
                // Dormand–Prince 5(4), stepping exactly onto each output time.
                let mut guard = 0usize;
                while t < target - 1e-14 * target.abs().max(1.0) {
                    guard += 1;
                    if guard > 2_000_000 {
                        return Err("the step size became too small (the system may be stiff or blow up)".into());
                    }
                    let last = h >= target - t;
                    let hs = if last { target - t } else { h };
                    if !fsal {
                        f(t, &x, &mut k1);
                    }
                    for i in 0..n {
                        tmp[i] = x[i] + hs * (1.0 / 5.0) * k1[i];
                    }
                    f(t + hs / 5.0, &tmp, &mut k2);
                    for i in 0..n {
                        tmp[i] = x[i] + hs * (3.0 / 40.0 * k1[i] + 9.0 / 40.0 * k2[i]);
                    }
                    f(t + 3.0 * hs / 10.0, &tmp, &mut k3);
                    for i in 0..n {
                        tmp[i] = x[i] + hs * (44.0 / 45.0 * k1[i] - 56.0 / 15.0 * k2[i] + 32.0 / 9.0 * k3[i]);
                    }
                    f(t + 4.0 * hs / 5.0, &tmp, &mut k4);
                    for i in 0..n {
                        tmp[i] = x[i] + hs * (19372.0 / 6561.0 * k1[i] - 25360.0 / 2187.0 * k2[i] + 64448.0 / 6561.0 * k3[i] - 212.0 / 729.0 * k4[i]);
                    }
                    f(t + 8.0 * hs / 9.0, &tmp, &mut k5);
                    for i in 0..n {
                        tmp[i] = x[i] + hs * (9017.0 / 3168.0 * k1[i] - 355.0 / 33.0 * k2[i] + 46732.0 / 5247.0 * k3[i] + 49.0 / 176.0 * k4[i] - 5103.0 / 18656.0 * k5[i]);
                    }
                    f(t + hs, &tmp, &mut k6);
                    // 5th order solution in tmp.
                    for i in 0..n {
                        tmp[i] = x[i] + hs * (35.0 / 384.0 * k1[i] + 500.0 / 1113.0 * k3[i] + 125.0 / 192.0 * k4[i] - 2187.0 / 6784.0 * k5[i] + 11.0 / 84.0 * k6[i]);
                    }
                    f(t + hs, &tmp, &mut k7);
                    let mut err = 0.0f64;
                    for i in 0..n {
                        let e = hs * ((35.0 / 384.0 - 5179.0 / 57600.0) * k1[i] + (500.0 / 1113.0 - 7571.0 / 16695.0) * k3[i] + (125.0 / 192.0 - 393.0 / 640.0) * k4[i]
                            + (-2187.0 / 6784.0 + 92097.0 / 339200.0) * k5[i] + (11.0 / 84.0 - 187.0 / 2100.0) * k6[i] - 1.0 / 40.0 * k7[i]);
                        let scale = opt.atol + opt.rtol * x[i].abs().max(tmp[i].abs());
                        err = err.max((e / scale).abs());
                    }
                    if !err.is_finite() {
                        if hs < 1e-14 * t.abs().max(1.0) {
                            return Err(format!("the solution is not finite at t = {t:.6} (it blows up)"));
                        }
                        h = hs * 0.1;
                        fsal = false;
                        sol.rejected += 1;
                        continue;
                    }
                    if err <= 1.0 {
                        t += hs;
                        x.copy_from_slice(&tmp);
                        k1.copy_from_slice(&k7);
                        fsal = true;
                        sol.steps += 1;
                        let grow = if err == 0.0 { 5.0 } else { (0.9 * err.powf(-0.2)).clamp(0.2, 5.0) };
                        if !last {
                            h = hs * grow;
                        } else {
                            h = h.max(hs * grow.min(1.0));
                        }
                    } else {
                        h = hs * (0.9 * err.powf(-0.25)).clamp(0.1, 0.9);
                        fsal = false;
                        sol.rejected += 1;
                        if h < 1e-15 * t.abs().max(1.0) {
                            return Err(format!("the step size became too small at t = {t:.6}"));
                        }
                    }
                }
                t = target;
            }
        }
        if x.iter().any(|v| !v.is_finite()) {
            sol.warning = Some(format!("the solution stopped being finite at t = {t:.6}"));
            record(&mut sol, t, &x);
            break;
        }
        record(&mut sol, t, &x);
    }
    Ok(sol)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn harmonic_oscillator() {
        // x'' = -x, x(0)=1 → x = cos t.
        for method in [Method::Rk4, Method::Rk45] {
            let opt = Options { method, t0: 0.0, t_end: 10.0, dt: 0.01, substeps: 1, rtol: 1e-9, atol: 1e-12 };
            let mut f = |_t: f64, x: &[f64], dx: &mut [f64]| {
                dx[0] = x[1];
                dx[1] = -x[0];
            };
            let sol = integrate(&mut f, &[1.0, 0.0], &opt, &|| false, &mut |_| {}).unwrap();
            assert_eq!(sol.t.len(), 1001);
            let last = sol.x[0][1000];
            assert!((last - 10f64.cos()).abs() < 1e-7, "{method:?} {last}");
        }
    }

    #[test]
    fn exponential_decay_euler_converges() {
        let opt = Options { method: Method::Euler, t0: 0.0, t_end: 1.0, dt: 0.1, substeps: 1000, rtol: 0.0, atol: 0.0 };
        let mut f = |_t: f64, x: &[f64], dx: &mut [f64]| dx[0] = -x[0];
        let sol = integrate(&mut f, &[1.0], &opt, &|| false, &mut |_| {}).unwrap();
        assert!((sol.x[0][10] - (-1f64).exp()).abs() < 1e-3);
    }
}
