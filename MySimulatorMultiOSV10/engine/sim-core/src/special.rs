//! Special functions for the statistics: log-gamma, the regularised
//! incomplete beta and gamma functions and the t, F and χ² distributions.

/// ln Γ(x) (Lanczos, g = 7).
pub fn lgamma(x: f64) -> f64 {
    if x < 0.5 {
        // Reflection.
        return (std::f64::consts::PI / (std::f64::consts::PI * x).sin()).abs().ln() - lgamma(1.0 - x);
    }
    const C: [f64; 9] = [0.999_999_999_999_809_9, 676.5203681218851, -1259.1392167224028, 771.323_428_777_653_1, -176.615_029_162_140_6, 12.507343278686905, -0.13857109526572012, 9.984_369_578_019_572e-6, 1.5056327351493116e-7];
    let x = x - 1.0;
    let mut a = C[0];
    let t = x + 7.5;
    for (i, c) in C.iter().enumerate().skip(1) {
        a += c / (x + i as f64);
    }
    0.5 * (2.0 * std::f64::consts::PI).ln() + (x + 0.5) * t.ln() - t + a.ln()
}

/// The continued fraction of the incomplete beta function (Numerical Recipes betacf).
fn betacf(a: f64, b: f64, x: f64) -> f64 {
    let (qab, qap, qam) = (a + b, a + 1.0, a - 1.0);
    let tiny = 1e-300;
    let mut c = 1.0;
    let mut d = 1.0 - qab * x / qap;
    if d.abs() < tiny {
        d = tiny;
    }
    d = 1.0 / d;
    let mut h = d;
    for m in 1..300 {
        let m = m as f64;
        let m2 = 2.0 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1.0 + aa * d;
        if d.abs() < tiny {
            d = tiny;
        }
        c = 1.0 + aa / c;
        if c.abs() < tiny {
            c = tiny;
        }
        d = 1.0 / d;
        h *= d * c;
        let aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1.0 + aa * d;
        if d.abs() < tiny {
            d = tiny;
        }
        c = 1.0 + aa / c;
        if c.abs() < tiny {
            c = tiny;
        }
        d = 1.0 / d;
        let del = d * c;
        h *= del;
        if (del - 1.0).abs() < 1e-15 {
            break;
        }
    }
    h
}

/// The regularised incomplete beta function I_x(a, b).
pub fn betainc(x: f64, a: f64, b: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let bt = (lgamma(a + b) - lgamma(a) - lgamma(b) + a * x.ln() + b * (1.0 - x).ln()).exp();
    if x < (a + 1.0) / (a + b + 2.0) {
        bt * betacf(a, b, x) / a
    } else {
        1.0 - bt * betacf(b, a, 1.0 - x) / b
    }
}

/// The regularised lower incomplete gamma function P(a, x).
pub fn gammainc(x: f64, a: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    if x < a + 1.0 {
        let mut sum = 1.0 / a;
        let mut del = sum;
        let mut ap = a;
        for _ in 0..1000 {
            ap += 1.0;
            del *= x / ap;
            sum += del;
            if del.abs() < sum.abs() * 1e-16 {
                break;
            }
        }
        sum * (-x + a * x.ln() - lgamma(a)).exp()
    } else {
        // Continued fraction for Q.
        let tiny = 1e-300;
        let mut b = x + 1.0 - a;
        let mut c = 1.0 / tiny;
        let mut d = 1.0 / b;
        let mut h = d;
        for i in 1..1000 {
            let an = -(i as f64) * (i as f64 - a);
            b += 2.0;
            d = an * d + b;
            if d.abs() < tiny {
                d = tiny;
            }
            c = b + an / c;
            if c.abs() < tiny {
                c = tiny;
            }
            d = 1.0 / d;
            let del = d * c;
            h *= del;
            if (del - 1.0).abs() < 1e-16 {
                break;
            }
        }
        1.0 - (-x + a * x.ln() - lgamma(a)).exp() * h
    }
}

/// Student's t cumulative distribution.
pub fn t_cdf(t: f64, df: f64) -> f64 {
    let x = df / (df + t * t);
    let tail = 0.5 * betainc(x, df / 2.0, 0.5);
    if t >= 0.0 {
        1.0 - tail
    } else {
        tail
    }
}

/// The F distribution's upper tail P(F > f).
pub fn f_sf(f: f64, d1: f64, d2: f64) -> f64 {
    if f <= 0.0 {
        return 1.0;
    }
    betainc(d2 / (d2 + d1 * f), d2 / 2.0, d1 / 2.0)
}

/// The χ² upper tail P(X > x).
pub fn chi2_sf(x: f64, k: f64) -> f64 {
    1.0 - gammainc(x / 2.0, k / 2.0)
}

/// The t quantile (two-sided critical value for confidence intervals) by bisection.
pub fn t_inv(p: f64, df: f64) -> f64 {
    let (mut lo, mut hi) = (-1e3, 1e3);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if t_cdf(mid, df) < p {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_values() {
        assert!((lgamma(5.0) - 24f64.ln()).abs() < 1e-12);
        assert!((lgamma(0.5) - std::f64::consts::PI.sqrt().ln()).abs() < 1e-12);
        // t(10): P(T < 2.228) = 0.975.
        assert!((t_cdf(2.228138851986, 10.0) - 0.975).abs() < 1e-9);
        assert!((t_inv(0.975, 10.0) - 2.228138851986).abs() < 1e-8);
        // F(3, 20): upper 5 % point 3.0984.
        assert!((f_sf(3.098391212, 3.0, 20.0) - 0.05).abs() < 1e-8);
        // χ²(2): P(X > 5.991) = 0.05.
        assert!((chi2_sf(5.991464547, 2.0) - 0.05).abs() < 1e-9);
        assert!((betainc(0.3, 2.0, 3.0) - 0.3483).abs() < 1e-12);
    }
}
