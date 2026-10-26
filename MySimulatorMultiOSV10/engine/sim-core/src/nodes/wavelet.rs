//! Wavelets and multirate signal processing (MATLAB's Wavelet Toolbox and
//! decimate / interp / upsample / resample): the discrete wavelet transform
//! with multiresolution analysis and threshold denoising, the continuous
//! (Morlet) wavelet scalogram, and sample-rate changes with anti-alias filters.

use super::input_table;
use super::signal::{iir_design, Sos};
use crate::data::{sample_rate, Column, Dataset, Grid, Table};
use crate::fft::{fft, C64};
use crate::Ctx;
use std::f64::consts::PI;

/// The low-pass decomposition filter of an orthogonal wavelet.
pub fn wavelet_filter(name: &str) -> Result<Vec<f64>, String> {
    let s2 = std::f64::consts::SQRT_2;
    let s3 = 3f64.sqrt();
    Ok(match name {
        "haar" | "db1" => vec![1.0 / s2, 1.0 / s2],
        "db2" => vec![(1.0 + s3) / (4.0 * s2), (3.0 + s3) / (4.0 * s2), (3.0 - s3) / (4.0 * s2), (1.0 - s3) / (4.0 * s2)],
        "db3" => vec![0.3326705529500826, 0.8068915093110925, 0.4598775021184915, -0.1350110200102546, -0.0854412738820267, 0.0352262918857095],
        "db4" => vec![0.2303778133088964, 0.7148465705529154, 0.6308807679298587, -0.0279837694168599, -0.1870348117190931, 0.0308413818355607, 0.0328830116668852, -0.0105974017850690],
        "sym4" => vec![-0.0757657147893407, -0.0296355276459541, 0.4976186676324578, 0.8037387518052163, 0.2978577956055422, -0.0992195435769354, -0.0126039672622612, 0.0322231006040713],
        "coif1" => vec![-0.0156557281354645, -0.0727326195128561, 0.3848648468642029, 0.8525720202122554, 0.3378976624578092, -0.0727326195128561],
        other => return Err(format!("unknown wavelet \"{other}\" (haar, db2, db3, db4, sym4, coif1)")),
    })
}

/// The high-pass filter of the quadrature mirror pair: g[k] = (−1)^k h[L−1−k].
fn qmf(h: &[f64]) -> Vec<f64> {
    let l = h.len();
    (0..l).map(|k| if k % 2 == 0 { h[l - 1 - k] } else { -h[l - 1 - k] }).collect()
}

/// One analysis level with periodic extension: (approximation, detail), each n/2 long.
fn dwt_step(x: &[f64], h: &[f64], g: &[f64]) -> (Vec<f64>, Vec<f64>) {
    let n = x.len();
    let half = n / 2;
    let mut a = vec![0.0; half];
    let mut d = vec![0.0; half];
    for i in 0..half {
        let (mut sa, mut sd) = (0.0, 0.0);
        for k in 0..h.len() {
            let v = x[(2 * i + k) % n];
            sa += h[k] * v;
            sd += g[k] * v;
        }
        a[i] = sa;
        d[i] = sd;
    }
    (a, d)
}

/// The inverse of dwt_step (the transposed periodic convolution).
fn idwt_step(a: &[f64], d: &[f64], h: &[f64], g: &[f64]) -> Vec<f64> {
    let half = a.len();
    let n = 2 * half;
    let mut x = vec![0.0; n];
    for i in 0..half {
        for k in 0..h.len() {
            x[(2 * i + k) % n] += h[k] * a[i] + g[k] * d[i];
        }
    }
    x
}

/// Multilevel DWT: details d1 … dL (finest first) and the approximation aL.
pub fn wavedec(x: &[f64], levels: usize, h: &[f64]) -> (Vec<Vec<f64>>, Vec<f64>) {
    let g = qmf(h);
    let mut a = x.to_vec();
    let mut details = Vec::new();
    for _ in 0..levels {
        let (na, d) = dwt_step(&a, h, &g);
        details.push(d);
        a = na;
    }
    (details, a)
}

pub fn waverec(details: &[Vec<f64>], approx: &[f64], h: &[f64]) -> Vec<f64> {
    let g = qmf(h);
    let mut a = approx.to_vec();
    for d in details.iter().rev() {
        a = idwt_step(&a, d, h, &g);
    }
    a
}

fn median(v: &[f64]) -> f64 {
    let mut s: Vec<f64> = v.iter().map(|x| x.abs()).collect();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    if s.is_empty() {
        0.0
    } else {
        s[s.len() / 2]
    }
}

pub fn wavelet(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let ycol = table.pick(&ctx.str("column", ""))?;
    let xcol = table.pick_x(&ctx.str("x", ""));
    let y: Vec<f64> = ycol.values.iter().map(|v| if v.is_finite() { *v } else { 0.0 }).collect();
    let n = y.len();
    if n < 8 {
        return Err("the signal needs at least 8 samples".into());
    }
    let fs = match ctx.num("fs", 0.0)? {
        f if f > 0.0 => f,
        _ => sample_rate(&xcol.values).unwrap_or(1.0),
    };
    if ctx.str("transform", "dwt") == "cwt" {
        return cwt(ctx, &y, &xcol.values, fs);
    }
    let h = wavelet_filter(&ctx.str("wavelet", "db4"))?;
    let max_levels = ((n as f64 / h.len() as f64).log2().floor() as usize).max(1);
    let levels = ctx.count("levels", 4, 1, 20)?.min(max_levels);
    // Periodic extension needs a length divisible by 2^L: pad by repeating the last sample.
    let block = 1usize << levels;
    let padded = n.div_ceil(block) * block;
    let mut x = y.clone();
    x.resize(padded, *y.last().unwrap());
    let (details, approx) = wavedec(&x, levels, &h);
    // Multiresolution analysis: each band reconstructed on its own.
    let zero_like = |v: &[f64]| vec![0.0; v.len()];
    let mut table_out = Table::new("multiresolution").with_x(Column::new(&xcol.name, &xcol.unit, xcol.values.clone()));
    table_out.push(Column::new(&ycol.name, &ycol.unit, y.clone()));
    let total_energy: f64 = x.iter().map(|v| v * v).sum::<f64>().max(1e-300);
    let mut energy = Vec::new();
    for l in 0..levels {
        let ds: Vec<Vec<f64>> = (0..levels).map(|k| if k == l { details[k].clone() } else { zero_like(&details[k]) }).collect();
        let rec = waverec(&ds, &zero_like(&approx), &h);
        table_out.push(Column::new(&format!("D{}", l + 1), &ycol.unit, rec[..n].to_vec()));
        energy.push(details[l].iter().map(|v| v * v).sum::<f64>() / total_energy * 100.0);
    }
    let ds0: Vec<Vec<f64>> = details.iter().map(|d| zero_like(d)).collect();
    let arec = waverec(&ds0, &approx, &h);
    table_out.push(Column::new(&format!("A{levels}"), &ycol.unit, arec[..n].to_vec()));
    energy.push(approx.iter().map(|v| v * v).sum::<f64>() / total_energy * 100.0);
    // Threshold denoising (Donoho–Johnstone universal threshold, noise from the finest details).
    let mode = ctx.str("threshold", "soft");
    let sigma = median(&details[0]) / 0.6745;
    let thr = match ctx.num("thresholdValue", 0.0)? {
        v if v > 0.0 => v,
        _ => sigma * (2.0 * (padded as f64).ln()).sqrt(),
    };
    let mut out = Dataset::default();
    if mode != "none" {
        let shrunk: Vec<Vec<f64>> = details
            .iter()
            .map(|d| {
                d.iter()
                    .map(|v| match mode.as_str() {
                        "hard" => {
                            if v.abs() > thr {
                                *v
                            } else {
                                0.0
                            }
                        }
                        _ => v.signum() * (v.abs() - thr).max(0.0),
                    })
                    .collect()
            })
            .collect();
        let den = waverec(&shrunk, &approx, &h);
        table_out.columns.insert(2, Column::new("denoised", &ycol.unit, den[..n].to_vec()));
        let kept: usize = shrunk.iter().flatten().filter(|v| **v != 0.0).count();
        out.scalar("threshold", thr, &ycol.unit).scalar("noise sigma", sigma, &ycol.unit).scalar("coefficients kept", kept as f64, "");
    }
    let rec = waverec(&details, &approx, &h);
    let err = rec[..n].iter().zip(&y).fold(0.0f64, |m, (a, b)| m.max((a - b).abs()));
    out.tables.push(table_out);
    let mut et = Table::new("energy by level");
    et.push(Column::text("band", (1..=levels).map(|l| format!("D{l}")).chain(std::iter::once(format!("A{levels}"))).collect()));
    et.push(Column::new("from", "Hz", (1..=levels).map(|l| fs / 2f64.powi(l as i32 + 1)).chain(std::iter::once(0.0)).collect()));
    et.push(Column::new("to", "Hz", (1..=levels).map(|l| fs / 2f64.powi(l as i32)).chain(std::iter::once(fs / 2f64.powi(levels as i32 + 1))).collect()));
    et.push(Column::new("energy", "%", energy));
    out.tables.push(et);
    // The raw coefficients (one table, a level column).
    let mut ct = Table::new("coefficients");
    let mut lv = Vec::new();
    let mut idx = Vec::new();
    let mut vals = Vec::new();
    for (l, d) in details.iter().enumerate() {
        for (i, v) in d.iter().enumerate() {
            lv.push(format!("D{}", l + 1));
            idx.push(i as f64);
            vals.push(*v);
        }
    }
    for (i, v) in approx.iter().enumerate() {
        lv.push(format!("A{levels}"));
        idx.push(i as f64);
        vals.push(*v);
    }
    ct.push(Column::text("band", lv));
    ct.push(Column::new("index", "", idx));
    ct.push(Column::new("value", "", vals));
    out.tables.push(ct);
    out.scalar("levels", levels as f64, "").scalar("reconstruction error", err, &ycol.unit);
    Ok(out)
}

/// The continuous wavelet transform with a Morlet wavelet (ω0 = 6) by FFT, as a time × frequency magnitude grid.
fn cwt(ctx: &mut Ctx, y: &[f64], t: &[f64], fs: f64) -> Result<Dataset, String> {
    let n = y.len();
    let voices = ctx.count("scales", 64, 4, 512)?;
    let fmax = match ctx.num("fmax", 0.0)? {
        f if f > 0.0 => f.min(fs / 2.0),
        _ => fs / 4.0,
    };
    let fmin = match ctx.num("fmin", 0.0)? {
        f if f > 0.0 => f,
        _ => (fs / n as f64 * 4.0).min(fmax / 2.0),
    };
    let m = n.next_power_of_two() * 2;
    let mean = y.iter().sum::<f64>() / n as f64;
    let mut spec: Vec<C64> = (0..m).map(|i| C64::new(if i < n { y[i] - mean } else { 0.0 }, 0.0)).collect();
    fft(&mut spec, false);
    let w0 = 6.0;
    let freqs: Vec<f64> = (0..voices).map(|k| fmin * (fmax / fmin).powf(k as f64 / (voices - 1) as f64)).collect();
    // Keep at most ~1500 time columns.
    let stride = (n / 1500).max(1);
    let cols: Vec<usize> = (0..n).step_by(stride).collect();
    let nx = cols.len();
    let mut z = vec![0.0; nx * voices];
    let mut peak = (0.0, 0.0, 0.0);
    for (j, &f) in freqs.iter().enumerate() {
        let scale = w0 / (2.0 * PI * f);
        let mut buf: Vec<C64> = (0..m)
            .map(|k| {
                let w = 2.0 * PI * (if k <= m / 2 { k as f64 } else { k as f64 - m as f64 }) * fs / m as f64;
                if w <= 0.0 {
                    return C64::ZERO;
                }
                let psi = PI.powf(-0.25) * (-(scale * w - w0).powi(2) / 2.0).exp() * (2.0 * PI * scale * fs).sqrt();
                spec[k].scale(psi)
            })
            .collect();
        fft(&mut buf, true);
        for (i, &c) in cols.iter().enumerate() {
            let v = buf[c].abs() / m as f64;
            z[j * nx + i] = v;
            if v > peak.0 {
                peak = (v, f, t.get(c).copied().unwrap_or(c as f64 / fs));
            }
        }
        if j % 16 == 0 {
            ctx.check()?;
        }
    }
    let times: Vec<f64> = cols.iter().map(|&c| t.get(c).copied().unwrap_or(c as f64 / fs)).collect();
    let grid = Grid { name: "scalogram".into(), x: times, y: freqs, z, x_label: "t".into(), y_label: "f (Hz)".into(), z_label: "|W|".into(), x_names: None, y_names: None };
    let mut out = Dataset { grids: vec![grid], ..Default::default() };
    out.scalar("peak frequency", peak.1, "Hz").scalar("peak time", peak.2, "").scalar("peak magnitude", peak.0, "");
    Ok(out)
}

// ───────────────────────── multirate

fn sosfilt_zero(sos: &[Sos], gain: f64, x: &[f64]) -> Vec<f64> {
    let run = |x: &[f64]| -> Vec<f64> {
        let mut y: Vec<f64> = x.iter().map(|v| v * gain).collect();
        for s in sos {
            let (mut z1, mut z2) = (0.0, 0.0);
            // Start from the steady state of the first sample.
            let dc = (s.b[0] + s.b[1] + s.b[2]) / (s.a[0] + s.a[1] + s.a[2]);
            if let Some(&x0) = y.first() {
                if dc.is_finite() {
                    let y0 = dc * x0;
                    z2 = s.b[2] * x0 - s.a[2] * y0;
                    z1 = s.b[1] * x0 - s.a[1] * y0 + z2;
                }
            }
            for v in y.iter_mut() {
                let xin = *v;
                let o = s.b[0] * xin + z1;
                z1 = s.b[1] * xin - s.a[1] * o + z2;
                z2 = s.b[2] * xin - s.a[2] * o;
                *v = o;
            }
        }
        y
    };
    let fwd = run(x);
    let rev: Vec<f64> = fwd.into_iter().rev().collect();
    run(&rev).into_iter().rev().collect()
}

/// A Kaiser-windowed sinc low-pass of the given length (cut-off as a fraction of Nyquist).
fn kaiser_lowpass(taps: usize, cutoff: f64, gain: f64) -> Vec<f64> {
    let beta = 5.0;
    let bessel0 = |x: f64| {
        let mut s = 1.0;
        let mut term = 1.0;
        for k in 1..50 {
            term *= (x / 2.0) / k as f64;
            s += term * term;
        }
        s
    };
    let mid = (taps - 1) as f64 / 2.0;
    (0..taps)
        .map(|i| {
            let k = i as f64 - mid;
            let sinc = if k == 0.0 { cutoff } else { (PI * cutoff * k).sin() / (PI * k) };
            let r = k / mid.max(1.0);
            let w = bessel0(beta * (1.0 - r * r).max(0.0).sqrt()) / bessel0(beta);
            gain * sinc * w
        })
        .collect()
}

/// Upsample by p, low-pass, downsample by q (MATLAB's resample, polyphase in effect).
fn resample_pq(x: &[f64], p: usize, q: usize) -> Vec<f64> {
    let g = gcd(p, q);
    let (p, q) = (p / g, q / g);
    let pq = p.max(q);
    let half = 10 * pq;
    let taps = 2 * half + 1;
    let h = kaiser_lowpass(taps, 1.0 / pq as f64, p as f64);
    let n_out = (x.len() * p).div_ceil(q);
    (0..n_out)
        .map(|m| {
            // Output m is at upsampled index m·q; sum h[k] x_up[m q + half − k].
            let center = m * q + half;
            let mut s = 0.0;
            let k_lo = center.saturating_sub((x.len() - 1) * p);
            let k_start = k_lo + (center - k_lo) % p;
            let mut k = k_start;
            while k < taps && k <= center {
                let idx = (center - k) / p;
                if idx < x.len() {
                    s += h[k] * x[idx];
                }
                k += p;
            }
            s
        })
        .collect()
}

fn gcd(a: usize, b: usize) -> usize {
    if b == 0 {
        a.max(1)
    } else {
        gcd(b, a % b)
    }
}

pub fn multirate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let xcol = table.pick_x(&ctx.str("x", ""));
    let cols = super::column_list(table, &ctx.str("columns", ""))?;
    let fs = match ctx.num("fs", 0.0)? {
        f if f > 0.0 => f,
        _ => sample_rate(&xcol.values).unwrap_or(1.0),
    };
    let op = ctx.str("operation", "decimate");
    let factor = ctx.count("factor", 2, 1, 1000)?;
    let (p, q) = match op.as_str() {
        "decimate" | "downsample" => (1, factor),
        "interp" | "upsample" => (factor, 1),
        "resample" => (ctx.count("p", 3, 1, 1000)?, ctx.count("q", 2, 1, 1000)?),
        other => return Err(format!("unknown operation \"{other}\" (decimate, downsample, interp, upsample, resample)")),
    };
    let new_fs = fs * p as f64 / q as f64;
    let t0 = xcol.values.first().copied().unwrap_or(0.0);
    let mut columns = Vec::new();
    let mut len = 0;
    for &c in &cols {
        let col = &table.columns[c];
        if table.x == Some(c) {
            continue;
        }
        let y: Vec<f64> = col.values.iter().map(|v| if v.is_finite() { *v } else { 0.0 }).collect();
        let out: Vec<f64> = match op.as_str() {
            "downsample" => y.iter().step_by(factor).copied().collect(),
            "upsample" => y.iter().flat_map(|v| std::iter::once(*v).chain(std::iter::repeat(0.0).take(factor - 1))).collect(),
            "decimate" => {
                // MATLAB's default: an 8th-order Chebyshev I (0.05 dB) at 0.8·(fs/2)/M, zero phase.
                if factor == 1 {
                    y.clone()
                } else {
                    let (sos, g) = iir_design("cheby1", 8, "lowpass", 0.8 * fs / 2.0 / factor as f64, 0.0, fs, 0.05, 40.0)?;
                    sosfilt_zero(&sos, g, &y).into_iter().step_by(factor).collect()
                }
            }
            _ => resample_pq(&y, p, q),
        };
        len = out.len();
        columns.push(Column::new(&col.name, &col.unit, out));
    }
    if columns.is_empty() {
        return Err("no signal columns to resample".into());
    }
    let mut t = Table::new("resampled").with_x(Column::new(&xcol.name, &xcol.unit, (0..len).map(|i| t0 + i as f64 / new_fs).collect()));
    for c in columns {
        t.push(c);
    }
    let mut out = Dataset::table(t);
    out.scalar("sample rate in", fs, "Hz").scalar("sample rate out", new_fs, "Hz").scalar("samples out", len as f64, "");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wavelets_are_orthonormal_and_reconstruct() {
        for name in ["haar", "db2", "db3", "db4", "sym4", "coif1"] {
            let h = wavelet_filter(name).unwrap();
            let sum: f64 = h.iter().sum();
            let energy: f64 = h.iter().map(|v| v * v).sum();
            assert!((sum - std::f64::consts::SQRT_2).abs() < 1e-9, "{name} sum {sum}");
            assert!((energy - 1.0).abs() < 1e-9, "{name} energy {energy}");
            for shift in (2..h.len()).step_by(2) {
                let dot: f64 = (0..h.len() - shift).map(|k| h[k] * h[k + shift]).sum();
                assert!(dot.abs() < 1e-9, "{name} shift {shift}: {dot}");
            }
            let x: Vec<f64> = (0..64).map(|i| (i as f64 * 0.3).sin() + if i == 20 { 2.0 } else { 0.0 }).collect();
            let (d, a) = wavedec(&x, 3, &h);
            let r = waverec(&d, &a, &h);
            assert!(r.iter().zip(&x).all(|(p, q)| (p - q).abs() < 1e-9), "{name}");
        }
    }

    #[test]
    fn resample_keeps_a_slow_sine() {
        let fs = 100.0;
        let x: Vec<f64> = (0..400).map(|i| (2.0 * PI * 2.0 * i as f64 / fs).sin()).collect();
        let y = resample_pq(&x, 3, 2);
        assert_eq!(y.len(), 600);
        // Away from the edges y[m] = sin(2π·2·m/150).
        for m in 100..500 {
            let exact = (2.0 * PI * 2.0 * m as f64 / 150.0).sin();
            assert!((y[m] - exact).abs() < 2e-3, "m {m}: {} vs {exact}", y[m]);
        }
    }
}
