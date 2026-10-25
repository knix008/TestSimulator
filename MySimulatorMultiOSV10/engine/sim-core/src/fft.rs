//! Complex numbers, the FFT (radix-2, and Bluestein for any length) and
//! analysis windows.

use std::f64::consts::PI;
use std::ops::{Add, Div, Mul, Neg, Sub};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct C64 {
    pub re: f64,
    pub im: f64,
}

impl C64 {
    pub const ZERO: C64 = C64 { re: 0.0, im: 0.0 };
    pub const ONE: C64 = C64 { re: 1.0, im: 0.0 };

    pub fn new(re: f64, im: f64) -> Self {
        C64 { re, im }
    }

    pub fn polar(r: f64, theta: f64) -> Self {
        C64 { re: r * theta.cos(), im: r * theta.sin() }
    }

    pub fn abs(self) -> f64 {
        self.re.hypot(self.im)
    }

    pub fn norm2(self) -> f64 {
        self.re * self.re + self.im * self.im
    }

    pub fn arg(self) -> f64 {
        self.im.atan2(self.re)
    }

    pub fn conj(self) -> Self {
        C64 { re: self.re, im: -self.im }
    }

    pub fn scale(self, k: f64) -> Self {
        C64 { re: self.re * k, im: self.im * k }
    }

    pub fn sqrt(self) -> Self {
        let r = self.abs();
        let re = ((r + self.re) / 2.0).max(0.0).sqrt();
        let im = ((r - self.re) / 2.0).max(0.0).sqrt();
        C64 { re, im: if self.im < 0.0 { -im } else { im } }
    }

    pub fn inv(self) -> Self {
        let d = self.norm2();
        C64 { re: self.re / d, im: -self.im / d }
    }

    pub fn exp(self) -> Self {
        C64::polar(self.re.exp(), self.im)
    }
}

impl Add for C64 {
    type Output = C64;
    fn add(self, o: C64) -> C64 {
        C64 { re: self.re + o.re, im: self.im + o.im }
    }
}

impl Sub for C64 {
    type Output = C64;
    fn sub(self, o: C64) -> C64 {
        C64 { re: self.re - o.re, im: self.im - o.im }
    }
}

impl Mul for C64 {
    type Output = C64;
    fn mul(self, o: C64) -> C64 {
        C64 { re: self.re * o.re - self.im * o.im, im: self.re * o.im + self.im * o.re }
    }
}

impl Div for C64 {
    type Output = C64;
    fn div(self, o: C64) -> C64 {
        self * o.inv()
    }
}

impl Neg for C64 {
    type Output = C64;
    fn neg(self) -> C64 {
        C64 { re: -self.re, im: -self.im }
    }
}

fn fft_pow2(a: &mut [C64], inverse: bool) {
    let n = a.len();
    if n <= 1 {
        return;
    }
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            a.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = 2.0 * PI / len as f64 * if inverse { 1.0 } else { -1.0 };
        let wl = C64::polar(1.0, ang);
        for start in (0..n).step_by(len) {
            let mut w = C64::ONE;
            for k in 0..len / 2 {
                let u = a[start + k];
                let v = a[start + k + len / 2] * w;
                a[start + k] = u + v;
                a[start + k + len / 2] = u - v;
                w = w * wl;
            }
        }
        len <<= 1;
    }
}

/// In-place DFT of any length (unscaled forward; the inverse divides by n).
pub fn fft(a: &mut [C64], inverse: bool) {
    let n = a.len();
    if n <= 1 {
        return;
    }
    if n.is_power_of_two() {
        fft_pow2(a, inverse);
    } else {
        bluestein(a, inverse);
    }
    if inverse {
        let k = 1.0 / n as f64;
        for v in a.iter_mut() {
            *v = v.scale(k);
        }
    }
}

fn bluestein(a: &mut [C64], inverse: bool) {
    let n = a.len();
    let m = (2 * n - 1).next_power_of_two();
    let sign = if inverse { 1.0 } else { -1.0 };
    // chirp w_k = exp(sign·iπk²/n); k² mod 2n keeps the angle accurate for large k.
    let w: Vec<C64> = (0..n)
        .map(|k| {
            let k2 = ((k as u128 * k as u128) % (2 * n as u128)) as f64;
            C64::polar(1.0, sign * PI * k2 / n as f64)
        })
        .collect();
    let mut x = vec![C64::ZERO; m];
    for k in 0..n {
        x[k] = a[k] * w[k];
    }
    let mut y = vec![C64::ZERO; m];
    y[0] = w[0].conj();
    for k in 1..n {
        y[k] = w[k].conj();
        y[m - k] = w[k].conj();
    }
    fft_pow2(&mut x, false);
    fft_pow2(&mut y, false);
    for k in 0..m {
        x[k] = x[k] * y[k];
    }
    fft_pow2(&mut x, true);
    let scale = 1.0 / m as f64;
    for k in 0..n {
        a[k] = x[k].scale(scale) * w[k];
    }
}

pub fn fft_real(x: &[f64]) -> Vec<C64> {
    let mut a: Vec<C64> = x.iter().map(|&v| C64::new(if v.is_finite() { v } else { 0.0 }, 0.0)).collect();
    fft(&mut a, false);
    a
}

/// Analysis window of length n: rect, hann, hamming, blackman, flattop, bartlett.
pub fn window(kind: &str, n: usize) -> Result<Vec<f64>, String> {
    if n == 0 {
        return Ok(Vec::new());
    }
    if n == 1 {
        return Ok(vec![1.0]);
    }
    let m = (n - 1) as f64;
    let w: Vec<f64> = match kind.to_ascii_lowercase().as_str() {
        "rect" | "rectangular" | "none" | "boxcar" => vec![1.0; n],
        "hann" | "hanning" => (0..n).map(|i| 0.5 - 0.5 * (2.0 * PI * i as f64 / m).cos()).collect(),
        "hamming" => (0..n).map(|i| 0.54 - 0.46 * (2.0 * PI * i as f64 / m).cos()).collect(),
        "blackman" => (0..n).map(|i| {
            let x = 2.0 * PI * i as f64 / m;
            0.42 - 0.5 * x.cos() + 0.08 * (2.0 * x).cos()
        }).collect(),
        "flattop" => (0..n).map(|i| {
            let x = 2.0 * PI * i as f64 / m;
            0.21557895 - 0.41663158 * x.cos() + 0.277263158 * (2.0 * x).cos() - 0.083578947 * (3.0 * x).cos() + 0.006947368 * (4.0 * x).cos()
        }).collect(),
        "bartlett" | "triangular" => (0..n).map(|i| 1.0 - ((i as f64 - m / 2.0) / (m / 2.0)).abs()).collect(),
        other => return Err(format!("unknown window \"{other}\" (rect, hann, hamming, blackman, flattop, bartlett)")),
    };
    Ok(w)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn naive(x: &[C64]) -> Vec<C64> {
        let n = x.len();
        (0..n)
            .map(|k| (0..n).fold(C64::ZERO, |acc, j| acc + x[j] * C64::polar(1.0, -2.0 * PI * (k * j) as f64 / n as f64)))
            .collect()
    }

    #[test]
    fn matches_the_definition() {
        for n in [1usize, 2, 8, 12, 17, 100] {
            let x: Vec<C64> = (0..n).map(|i| C64::new((i as f64 * 0.7).sin(), (i as f64 * 0.3).cos())).collect();
            let mut a = x.clone();
            fft(&mut a, false);
            let b = naive(&x);
            for (p, q) in a.iter().zip(b.iter()) {
                assert!((*p - *q).abs() < 1e-9 * n as f64, "n={n}");
            }
            fft(&mut a, true);
            for (p, q) in a.iter().zip(x.iter()) {
                assert!((*p - *q).abs() < 1e-10, "inverse n={n}");
            }
        }
    }
}
