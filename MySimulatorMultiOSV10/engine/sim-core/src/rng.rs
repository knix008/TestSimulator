//! A seeded random generator (xoshiro256**) and the distributions the
//! sources and the Monte Carlo nodes draw from. The same seed gives the same
//! numbers on the desktop and in WebAssembly.

use std::f64::consts::PI;

#[derive(Clone)]
pub struct Rng {
    s: [u64; 4],
    spare: Option<f64>,
}

fn splitmix(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut state = seed;
        Rng { s: [splitmix(&mut state), splitmix(&mut state), splitmix(&mut state), splitmix(&mut state)], spare: None }
    }

    /// The generator state (to carry a session's random stream across commands).
    pub fn state(&self) -> [u64; 4] {
        self.s
    }

    pub fn from_state(s: [u64; 4]) -> Self {
        Rng { s, spare: None }
    }

    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }

    /// Uniform in [0, 1).
    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Uniform in (0, 1): never exactly 0 (for logarithms).
    pub fn open01(&mut self) -> f64 {
        loop {
            let u = self.uniform();
            if u > 0.0 {
                return u;
            }
        }
    }

    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.uniform()
    }

    pub fn below(&mut self, n: usize) -> usize {
        ((self.uniform() * n as f64) as usize).min(n.saturating_sub(1))
    }

    /// Standard normal (Box–Muller, the second value kept for the next call).
    pub fn normal(&mut self) -> f64 {
        if let Some(v) = self.spare.take() {
            return v;
        }
        let u1 = self.open01();
        let u2 = self.uniform();
        let r = (-2.0 * u1.ln()).sqrt();
        self.spare = Some(r * (2.0 * PI * u2).sin());
        r * (2.0 * PI * u2).cos()
    }

    /// Gamma(shape k, scale 1) — Marsaglia and Tsang.
    pub fn gamma(&mut self, k: f64) -> f64 {
        if k < 1.0 {
            let u = self.open01();
            return self.gamma(k + 1.0) * u.powf(1.0 / k);
        }
        let d = k - 1.0 / 3.0;
        let c = 1.0 / (9.0 * d).sqrt();
        loop {
            let x = self.normal();
            let v = (1.0 + c * x).powi(3);
            if v <= 0.0 {
                continue;
            }
            let u = self.open01();
            if u.ln() < 0.5 * x * x + d - d * v + d * v.ln() {
                return d * v;
            }
        }
    }

    pub fn poisson(&mut self, lambda: f64) -> f64 {
        if lambda <= 0.0 {
            return 0.0;
        }
        if lambda > 60.0 {
            // Normal approximation with continuity correction.
            return (lambda + lambda.sqrt() * self.normal() + 0.5).floor().max(0.0);
        }
        let l = (-lambda).exp();
        let mut k = 0.0;
        let mut p = 1.0;
        loop {
            p *= self.uniform();
            if p <= l {
                return k;
            }
            k += 1.0;
        }
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.below(i + 1);
            items.swap(i, j);
        }
    }
}

/// A probability distribution with its parameters.
#[derive(Clone, Debug, PartialEq)]
pub enum Dist {
    Normal(f64, f64),
    Uniform(f64, f64),
    Triangular(f64, f64, f64),
    LogNormal(f64, f64),
    Exponential(f64),
    Weibull(f64, f64),
    Gamma(f64, f64),
    Beta(f64, f64),
    Bernoulli(f64),
    Poisson(f64),
    Constant(f64),
}

impl Dist {
    /// "normal(10, 0.5)", "uniform(0, 1)", "tri(1, 2, 4)" …
    pub fn parse(name: &str, args: &[f64]) -> Result<Dist, String> {
        let need = |n: usize| -> Result<(), String> {
            if args.len() == n {
                Ok(())
            } else {
                Err(format!("{name}() takes {n} argument(s), got {}", args.len()))
            }
        };
        let positive = |v: f64, what: &str| -> Result<(), String> {
            if v > 0.0 {
                Ok(())
            } else {
                Err(format!("{name}(): {what} must be positive"))
            }
        };
        Ok(match name.to_ascii_lowercase().as_str() {
            "normal" | "norm" | "gauss" => {
                need(2)?;
                if args[1] < 0.0 {
                    return Err(format!("{name}(): the standard deviation must not be negative"));
                }
                Dist::Normal(args[0], args[1])
            }
            "uniform" | "unif" => {
                need(2)?;
                if args[1] < args[0] {
                    return Err(format!("{name}(): the upper limit is below the lower one"));
                }
                Dist::Uniform(args[0], args[1])
            }
            "triangular" | "tri" => {
                need(3)?;
                if !(args[0] <= args[1] && args[1] <= args[2]) {
                    return Err(format!("{name}(low, mode, high) needs low ≤ mode ≤ high"));
                }
                Dist::Triangular(args[0], args[1], args[2])
            }
            "lognormal" | "lognorm" => {
                need(2)?;
                Dist::LogNormal(args[0], args[1].abs())
            }
            "exponential" | "exp" => {
                need(1)?;
                positive(args[0], "the rate")?;
                Dist::Exponential(args[0])
            }
            "weibull" => {
                need(2)?;
                positive(args[0], "the shape")?;
                positive(args[1], "the scale")?;
                Dist::Weibull(args[0], args[1])
            }
            "gamma" => {
                need(2)?;
                positive(args[0], "the shape")?;
                positive(args[1], "the scale")?;
                Dist::Gamma(args[0], args[1])
            }
            "beta" => {
                need(2)?;
                positive(args[0], "alpha")?;
                positive(args[1], "beta")?;
                Dist::Beta(args[0], args[1])
            }
            "bernoulli" => {
                need(1)?;
                Dist::Bernoulli(args[0].clamp(0.0, 1.0))
            }
            "poisson" => {
                need(1)?;
                Dist::Poisson(args[0].max(0.0))
            }
            "const" | "constant" => {
                need(1)?;
                Dist::Constant(args[0])
            }
            other => return Err(format!("unknown distribution \"{other}\" (normal, uniform, triangular, lognormal, exponential, weibull, gamma, beta, bernoulli, poisson, const)")),
        })
    }

    pub fn sample(&self, rng: &mut Rng) -> f64 {
        match *self {
            Dist::Normal(m, s) => m + s * rng.normal(),
            Dist::Uniform(a, b) => rng.range(a, b),
            Dist::Triangular(a, c, b) => self.inverse(rng.uniform()).unwrap_or(if b > a { c } else { a }),
            Dist::LogNormal(m, s) => (m + s * rng.normal()).exp(),
            Dist::Exponential(l) => -rng.open01().ln() / l,
            Dist::Weibull(k, l) => l * (-rng.open01().ln()).powf(1.0 / k),
            Dist::Gamma(k, theta) => rng.gamma(k) * theta,
            Dist::Beta(a, b) => {
                let x = rng.gamma(a);
                let y = rng.gamma(b);
                x / (x + y)
            }
            Dist::Bernoulli(p) => {
                if rng.uniform() < p {
                    1.0
                } else {
                    0.0
                }
            }
            Dist::Poisson(l) => rng.poisson(l),
            Dist::Constant(v) => v,
        }
    }

    /// Inverse CDF where it has a closed form (Latin hypercube sampling); None otherwise.
    pub fn inverse(&self, u: f64) -> Option<f64> {
        let u = u.clamp(1e-12, 1.0 - 1e-12);
        Some(match *self {
            Dist::Normal(m, s) => m + s * normal_inverse(u),
            Dist::Uniform(a, b) => a + (b - a) * u,
            Dist::Triangular(a, c, b) => {
                if b <= a {
                    return Some(a);
                }
                let fc = (c - a) / (b - a);
                if u < fc {
                    a + (u * (b - a) * (c - a)).sqrt()
                } else {
                    b - ((1.0 - u) * (b - a) * (b - c)).sqrt()
                }
            }
            Dist::LogNormal(m, s) => (m + s * normal_inverse(u)).exp(),
            Dist::Exponential(l) => -(1.0 - u).ln() / l,
            Dist::Weibull(k, l) => l * (-(1.0 - u).ln()).powf(1.0 / k),
            Dist::Constant(v) => v,
            _ => return None,
        })
    }

    pub fn mean(&self) -> f64 {
        match *self {
            Dist::Normal(m, _) => m,
            Dist::Uniform(a, b) => (a + b) / 2.0,
            Dist::Triangular(a, c, b) => (a + b + c) / 3.0,
            Dist::LogNormal(m, s) => (m + s * s / 2.0).exp(),
            Dist::Exponential(l) => 1.0 / l,
            Dist::Weibull(k, l) => l * gamma_fn(1.0 + 1.0 / k),
            Dist::Gamma(k, t) => k * t,
            Dist::Beta(a, b) => a / (a + b),
            Dist::Bernoulli(p) => p,
            Dist::Poisson(l) => l,
            Dist::Constant(v) => v,
        }
    }
}

/// Inverse of the standard normal CDF (Acklam, |relative error| < 1.2e-9 after one Newton step).
pub fn normal_inverse(p: f64) -> f64 {
    let p = p.clamp(1e-300, 1.0 - 1e-16);
    const A: [f64; 6] = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
    const B: [f64; 5] = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const C: [f64; 6] = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const D: [f64; 4] = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    let plow = 0.02425;
    let x = if p < plow {
        let q = (-2.0 * p.ln()).sqrt();
        (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0)
    } else if p <= 1.0 - plow {
        let q = p - 0.5;
        let r = q * q;
        (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1.0)
    } else {
        let q = (-2.0 * (1.0 - p).ln()).sqrt();
        -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0)
    };
    // Acklam's rational approximation alone is accurate to 1.15e-9 (relative); a refinement
    // through erf() would only bring in erf's own 1e-7 error.
    x
}

/// Standard normal CDF.
pub fn normal_cdf(x: f64) -> f64 {
    0.5 * (1.0 + crate::expr::erf(x / std::f64::consts::SQRT_2))
}

/// Γ(x) by the Lanczos approximation.
pub fn gamma_fn(x: f64) -> f64 {
    if x < 0.5 {
        return PI / ((PI * x).sin() * gamma_fn(1.0 - x));
    }
    const G: [f64; 9] = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = x - 1.0;
    let mut a = G[0];
    let t = x + 7.5;
    for (i, g) in G.iter().enumerate().skip(1) {
        a += g / (x + i as f64);
    }
    (2.0 * PI).sqrt() * t.powf(x + 0.5) * (-t).exp() * a
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moments() {
        let mut rng = Rng::new(7);
        let n = 200_000;
        let xs: Vec<f64> = (0..n).map(|_| rng.normal()).collect();
        let m = xs.iter().sum::<f64>() / n as f64;
        let v = xs.iter().map(|x| (x - m) * (x - m)).sum::<f64>() / n as f64;
        assert!(m.abs() < 0.01 && (v - 1.0).abs() < 0.02, "{m} {v}");
        let g = Dist::Gamma(3.0, 2.0);
        let gm = (0..n).map(|_| g.sample(&mut rng)).sum::<f64>() / n as f64;
        assert!((gm - 6.0).abs() < 0.05, "{gm}");
        let b = Dist::Beta(2.0, 5.0);
        let bm = (0..n).map(|_| b.sample(&mut rng)).sum::<f64>() / n as f64;
        assert!((bm - 2.0 / 7.0).abs() < 0.005, "{bm}");
    }

    #[test]
    fn inverse_normal() {
        assert!((normal_inverse(0.975) - 1.959963985).abs() < 1e-8);
        assert!((normal_inverse(0.5)).abs() < 1e-12);
        assert!((normal_cdf(1.959963985) - 0.975).abs() < 1e-6);
        assert!((gamma_fn(5.0) - 24.0).abs() < 1e-9);
    }

    #[test]
    fn same_seed_same_numbers() {
        let a: Vec<u64> = { let mut r = Rng::new(42); (0..5).map(|_| r.next_u64()).collect() };
        let b: Vec<u64> = { let mut r = Rng::new(42); (0..5).map(|_| r.next_u64()).collect() };
        assert_eq!(a, b);
    }
}
