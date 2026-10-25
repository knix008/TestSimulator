//! Signal processing: spectrum (FFT), power spectral density (Welch),
//! filters (Butterworth IIR, windowed-sinc FIR, moving average, median),
//! spectrogram (STFT), peak finding, correlation and the Hilbert envelope.

use super::input_table;
use crate::data::{mean, rms, sample_rate, Column, Dataset, Grid, Table};
use crate::fft::{fft_real, window, C64};
use crate::Ctx;
use std::f64::consts::PI;

struct Series {
    x: Vec<f64>,
    y: Vec<f64>,
    x_name: String,
    x_unit: String,
    y_name: String,
    y_unit: String,
    fs: f64,
}

fn series(ctx: &Ctx) -> Result<Series, String> {
    let table = input_table(ctx, "in")?;
    let ycol = table.pick(&ctx.str("column", ""))?;
    let xcol = table.pick_x(&ctx.str("x", ""));
    let y: Vec<f64> = ycol.values.iter().map(|v| if v.is_finite() { *v } else { 0.0 }).collect();
    if y.len() < 4 {
        return Err("the signal needs at least 4 samples".into());
    }
    let given = ctx.num("fs", 0.0)?;
    let fs = if given > 0.0 { given } else { sample_rate(&xcol.values).unwrap_or(1.0) };
    Ok(Series { x: xcol.values.clone(), y, x_name: xcol.name.clone(), x_unit: xcol.unit.clone(), y_name: ycol.name.clone(), y_unit: ycol.unit.clone(), fs })
}

fn freq_unit(fs_from_time: bool) -> &'static str {
    if fs_from_time {
        "Hz"
    } else {
        "1/x"
    }
}

/// Single-sided amplitude spectrum.
pub fn fft(ctx: &mut Ctx) -> Result<Dataset, String> {
    let s = series(ctx)?;
    let detrend = ctx.flag("removeMean", true);
    let win_kind = ctx.str("window", "hann");
    let pad = ctx.flag("zeroPad", false);
    let n0 = s.y.len();
    let m = mean(&s.y);
    let w = window(&win_kind, n0)?;
    let wsum: f64 = w.iter().sum();
    let mut data: Vec<f64> = s.y.iter().zip(&w).map(|(v, k)| (if detrend { v - m } else { *v }) * k).collect();
    let n = if pad { n0.next_power_of_two() * 2 } else { n0 };
    data.resize(n, 0.0);
    let spec = fft_real(&data);
    let half = n / 2 + 1;
    let df = s.fs / n as f64;
    let mut f = Vec::with_capacity(half);
    let mut mag = Vec::with_capacity(half);
    let mut db = Vec::with_capacity(half);
    let mut ph = Vec::with_capacity(half);
    for k in 0..half {
        let scale = if k == 0 || (n % 2 == 0 && k == n / 2) { 1.0 } else { 2.0 };
        let a = spec[k].abs() * scale / wsum;
        f.push(k as f64 * df);
        mag.push(a);
        db.push(20.0 * a.max(1e-300).log10());
        ph.push(spec[k].arg().to_degrees());
    }
    // The dominant frequency (DC excluded), refined by parabolic interpolation of the log magnitude.
    let peak = (1..half).max_by(|&a, &b| mag[a].partial_cmp(&mag[b]).unwrap()).unwrap_or(0);
    let mut f0 = f[peak];
    if peak > 0 && peak + 1 < half {
        let (a, b, c) = (mag[peak - 1].max(1e-300).ln(), mag[peak].max(1e-300).ln(), mag[peak + 1].max(1e-300).ln());
        let denom = a - 2.0 * b + c;
        if denom.abs() > 1e-300 {
            f0 += 0.5 * (a - c) / denom * df;
        }
    }
    // Total harmonic distortion from the harmonics of the dominant frequency.
    let mut harmonics = 0.0;
    for h in 2..=10 {
        let k = (f0 * h as f64 / df).round() as usize;
        if k >= half {
            break;
        }
        let lo = k.saturating_sub(2);
        let hi = (k + 2).min(half - 1);
        let a = (lo..=hi).map(|i| mag[i]).fold(0.0, f64::max);
        harmonics += a * a;
    }
    let time = s.x_unit == "s" || s.x_name == "t";
    let fu = freq_unit(time);
    let mut table = Table::new("spectrum").with_x(Column::new("f", fu, f));
    table.push(Column::new("amplitude", &s.y_unit, mag.clone()));
    table.push(Column::new("dB", "dB", db));
    table.push(Column::new("phase", "°", ph));
    let mut out = Dataset::table(table);
    out.scalar("dominant frequency", f0, fu)
        .scalar("amplitude at peak", mag[peak], &s.y_unit)
        .scalar("THD", if mag[peak] > 0.0 { harmonics.sqrt() / mag[peak] * 100.0 } else { f64::NAN }, "%")
        .scalar("RMS", rms(&s.y), &s.y_unit)
        .scalar("mean", m, &s.y_unit)
        .scalar("resolution", df, fu)
        .scalar("fs", s.fs, fu);
    Ok(out)
}

/// One-sided PSD by Welch's method (segments with 50 % overlap, averaged).
fn welch(y: &[f64], fs: f64, nseg: usize, win: &[f64], overlap: f64) -> (Vec<f64>, Vec<f64>) {
    let step = ((nseg as f64) * (1.0 - overlap)).round().max(1.0) as usize;
    let u: f64 = win.iter().map(|w| w * w).sum();
    let half = nseg / 2 + 1;
    let mut acc = vec![0.0; half];
    let mut count = 0;
    let mut start = 0;
    while start + nseg <= y.len() {
        let seg = &y[start..start + nseg];
        let m = mean(seg);
        let data: Vec<f64> = seg.iter().zip(win).map(|(v, w)| (v - m) * w).collect();
        let spec = fft_real(&data);
        for k in 0..half {
            acc[k] += spec[k].norm2();
        }
        count += 1;
        start += step;
    }
    let f: Vec<f64> = (0..half).map(|k| k as f64 * fs / nseg as f64).collect();
    let psd: Vec<f64> = acc
        .iter()
        .enumerate()
        .map(|(k, a)| {
            let scale = if k == 0 || (nseg % 2 == 0 && k == nseg / 2) { 1.0 } else { 2.0 };
            a / count.max(1) as f64 / (fs * u) * scale
        })
        .collect();
    (f, psd)
}

pub fn psd(ctx: &mut Ctx) -> Result<Dataset, String> {
    let s = series(ctx)?;
    let mut nseg = ctx.count("segment", 256, 8, 1 << 22)?;
    if nseg > s.y.len() {
        nseg = s.y.len();
        ctx.warn(format!("the segment is longer than the signal; {nseg} samples are used"));
    }
    let overlap = ctx.num("overlap", 50.0)?.clamp(0.0, 95.0) / 100.0;
    let win = window(&ctx.str("window", "hann"), nseg)?;
    let (f, p) = welch(&s.y, s.fs, nseg, &win, overlap);
    let df = s.fs / nseg as f64;
    let power: f64 = p.iter().sum::<f64>() * df;
    let fu = freq_unit(s.x_unit == "s" || s.x_name == "t");
    let peak = (1..p.len()).max_by(|&a, &b| p[a].partial_cmp(&p[b]).unwrap()).unwrap_or(0);
    let unit = if s.y_unit.is_empty() { format!("1/{fu}") } else { format!("{}²/{fu}", s.y_unit) };
    let mut table = Table::new("psd").with_x(Column::new("f", fu, f.clone()));
    table.push(Column::new("psd", &unit, p.clone()));
    table.push(Column::new("dB", "dB", p.iter().map(|v| 10.0 * v.max(1e-300).log10()).collect()));
    let mut out = Dataset::table(table);
    out.scalar("total power", power, "").scalar("RMS (from PSD)", power.sqrt(), &s.y_unit).scalar("peak frequency", f[peak], fu);
    Ok(out)
}

// ───────────────────────── filters

/// A second-order section b0 b1 b2 / 1 a1 a2.
#[derive(Clone, Copy, Debug)]
pub struct Sos {
    pub b: [f64; 3],
    pub a: [f64; 3],
}

fn sos_response(sos: &[Sos], gain: f64, w: f64) -> C64 {
    let z1 = C64::polar(1.0, -w);
    let z2 = C64::polar(1.0, -2.0 * w);
    let mut h = C64::new(gain, 0.0);
    for s in sos {
        let num = C64::new(s.b[0], 0.0) + z1.scale(s.b[1]) + z2.scale(s.b[2]);
        let den = C64::new(s.a[0], 0.0) + z1.scale(s.a[1]) + z2.scale(s.a[2]);
        h = h * num / den;
    }
    h
}

/// Butterworth design: analog prototype → frequency transform → bilinear → SOS, gain normalised in the pass band.
pub fn butterworth(order: usize, kind: &str, f1: f64, f2: f64, fs: f64) -> Result<(Vec<Sos>, f64), String> {
    let nyq = fs / 2.0;
    let check = |f: f64| -> Result<(), String> {
        if f > 0.0 && f < nyq {
            Ok(())
        } else {
            Err(format!("the cut-off {f} must be between 0 and the Nyquist frequency {nyq}"))
        }
    };
    let warp = |f: f64| 2.0 * fs * (PI * f / fs).tan();
    let proto: Vec<C64> = (0..order).map(|k| C64::polar(1.0, PI * (2 * k + order + 1) as f64 / (2 * order) as f64)).collect();
    let (zeros, poles): (Vec<C64>, Vec<C64>) = match kind {
        "lowpass" => {
            check(f1)?;
            let wc = warp(f1);
            (Vec::new(), proto.iter().map(|p| p.scale(wc)).collect())
        }
        "highpass" => {
            check(f1)?;
            let wc = warp(f1);
            (vec![C64::ZERO; order], proto.iter().map(|p| C64::new(wc, 0.0) / *p).collect())
        }
        "bandpass" | "bandstop" => {
            check(f1)?;
            check(f2)?;
            if f2 <= f1 {
                return Err("the upper cut-off must be above the lower one".into());
            }
            let (w1, w2) = (warp(f1), warp(f2));
            let bw = w2 - w1;
            let w0 = (w1 * w2).sqrt();
            let mut poles = Vec::new();
            let mut zeros = Vec::new();
            for p in &proto {
                let base = if kind == "bandpass" { p.scale(bw / 2.0) } else { C64::new(bw / 2.0, 0.0) / *p };
                let disc = (base * base - C64::new(w0 * w0, 0.0)).sqrt();
                poles.push(base + disc);
                poles.push(base - disc);
                if kind == "bandpass" {
                    zeros.push(C64::ZERO);
                } else {
                    zeros.push(C64::new(0.0, w0));
                    zeros.push(C64::new(0.0, -w0));
                }
            }
            (zeros, poles)
        }
        other => return Err(format!("unknown filter type \"{other}\" (lowpass, highpass, bandpass, bandstop)")),
    };
    // Bilinear transform; zeros at infinity go to z = −1.
    let k2 = C64::new(2.0 * fs, 0.0);
    let bil = |s: C64| (k2 + s) / (k2 - s);
    let mut zd: Vec<C64> = zeros.iter().map(|z| bil(*z)).collect();
    let pd: Vec<C64> = poles.iter().map(|p| bil(*p)).collect();
    while zd.len() < pd.len() {
        zd.push(C64::new(-1.0, 0.0));
    }
    // Pair conjugates into sections (poles with im > 0 with their conjugates; real ones two by two).
    let sections = pair(&zd, &pd);
    // Normalise the gain at a pass-band frequency.
    let w_ref = match kind {
        "lowpass" | "bandstop" => 0.0,
        "highpass" => PI,
        _ => 2.0 * PI * (f1 * f2).sqrt() / fs,
    };
    let h = sos_response(&sections, 1.0, w_ref).abs();
    let gain = if h > 0.0 { 1.0 / h } else { 1.0 };
    Ok((sections, gain))
}

fn pair(zeros: &[C64], poles: &[C64]) -> Vec<Sos> {
    let group = |roots: &[C64]| -> Vec<[f64; 3]> {
        let mut used = vec![false; roots.len()];
        let mut quads = Vec::new();
        let mut reals = Vec::new();
        for i in 0..roots.len() {
            if used[i] {
                continue;
            }
            used[i] = true;
            let r = roots[i];
            if r.im.abs() > 1e-10 {
                // Find its conjugate.
                if let Some(j) = (0..roots.len()).find(|&j| !used[j] && (roots[j] - r.conj()).abs() < 1e-8 * r.abs().max(1.0)) {
                    used[j] = true;
                }
                quads.push([1.0, -2.0 * r.re, r.norm2()]);
            } else {
                reals.push(r.re);
            }
        }
        for chunk in reals.chunks(2) {
            if chunk.len() == 2 {
                quads.push([1.0, -(chunk[0] + chunk[1]), chunk[0] * chunk[1]]);
            } else {
                quads.push([1.0, -chunk[0], 0.0]);
            }
        }
        quads
    };
    let num = group(zeros);
    let den = group(poles);
    let count = num.len().max(den.len());
    (0..count)
        .map(|i| Sos { b: *num.get(i).unwrap_or(&[1.0, 0.0, 0.0]), a: *den.get(i).unwrap_or(&[1.0, 0.0, 0.0]) })
        .collect()
}

fn sosfilt(sos: &[Sos], gain: f64, x: &[f64]) -> Vec<f64> {
    let mut y: Vec<f64> = x.iter().map(|v| v * gain).collect();
    for s in sos {
        // Direct form II transposed, started from the steady state of the first sample (fewer start-up transients).
        let x0 = y.first().copied().unwrap_or(0.0);
        let dc = (s.b[0] + s.b[1] + s.b[2]) / (s.a[0] + s.a[1] + s.a[2]);
        let (mut z1, mut z2) = if dc.is_finite() {
            let y0 = dc * x0;
            // z2 = b2 x − a2 y, z1 = b1 x − a1 y + z2
            let z2 = s.b[2] * x0 - s.a[2] * y0;
            (s.b[1] * x0 - s.a[1] * y0 + z2, z2)
        } else {
            (0.0, 0.0)
        };
        for v in y.iter_mut() {
            let xin = *v;
            let out = s.b[0] * xin + z1;
            z1 = s.b[1] * xin - s.a[1] * out + z2;
            z2 = s.b[2] * xin - s.a[2] * out;
            *v = out;
        }
    }
    y
}

fn convolve_same(x: &[f64], taps: &[f64]) -> Vec<f64> {
    let n = x.len();
    let m = taps.len();
    let half = m / 2;
    (0..n)
        .map(|i| {
            let mut s = 0.0;
            for (k, t) in taps.iter().enumerate() {
                // Edges: hold the end values.
                let j = (i + k) as isize - half as isize;
                let j = j.clamp(0, n as isize - 1) as usize;
                s += t * x[j];
            }
            s
        })
        .collect()
}

fn fir_design(kind: &str, taps: usize, f1: f64, f2: f64, fs: f64) -> Result<Vec<f64>, String> {
    let m = if taps % 2 == 0 { taps + 1 } else { taps };
    let win = window("hamming", m)?;
    let mid = (m / 2) as isize;
    let sinc_lp = |fc: f64, i: isize| -> f64 {
        let wc = 2.0 * fc / fs;
        if i == 0 {
            wc
        } else {
            (PI * wc * i as f64).sin() / (PI * i as f64)
        }
    };
    let nyq = fs / 2.0;
    if !(f1 > 0.0 && f1 < nyq) {
        return Err(format!("the cut-off {f1} must be between 0 and {nyq}"));
    }
    let mut h: Vec<f64> = (0..m as isize)
        .map(|i| {
            let k = i - mid;
            let delta = if k == 0 { 1.0 } else { 0.0 };
            match kind {
                "lowpass" => sinc_lp(f1, k),
                "highpass" => delta - sinc_lp(f1, k),
                "bandpass" => sinc_lp(f2, k) - sinc_lp(f1, k),
                _ => delta - (sinc_lp(f2, k) - sinc_lp(f1, k)),
            }
        })
        .zip(&win)
        .map(|(v, w)| v * w)
        .collect();
    if (kind == "bandpass" || kind == "bandstop") && !(f2 > f1 && f2 < nyq) {
        return Err("the upper cut-off must be above the lower one and below Nyquist".into());
    }
    // Normalise the pass-band gain.
    let w_ref = match kind {
        "lowpass" | "bandstop" => 0.0,
        "highpass" => PI,
        _ => PI * (f1 + f2) / fs,
    };
    let g = fir_response(&h, w_ref).abs();
    if g > 0.0 {
        for v in &mut h {
            *v /= g;
        }
    }
    Ok(h)
}

fn fir_response(h: &[f64], w: f64) -> C64 {
    h.iter().enumerate().fold(C64::ZERO, |acc, (k, v)| acc + C64::polar(*v, -w * k as f64))
}

pub fn filter(ctx: &mut Ctx) -> Result<Dataset, String> {
    let s = series(ctx)?;
    let design = ctx.str("design", "butterworth");
    let kind = ctx.str("type", "lowpass");
    let f1 = ctx.num("cutoff", 10.0)?;
    let f2 = ctx.num("cutoff2", 50.0)?;
    let zero_phase = ctx.flag("zeroPhase", true);
    let fs = s.fs;
    let mut response: Option<Box<dyn Fn(f64) -> C64>> = None;
    let filtered: Vec<f64> = match design.as_str() {
        "butterworth" => {
            let order = ctx.count("order", 4, 1, 12)?;
            let (sos, gain) = butterworth(order, &kind, f1, f2, fs)?;
            let forward = sosfilt(&sos, gain, &s.y);
            let out = if zero_phase {
                let mut rev: Vec<f64> = forward.into_iter().rev().collect();
                rev = sosfilt(&sos, gain, &rev);
                rev.into_iter().rev().collect()
            } else {
                forward
            };
            let zp = zero_phase;
            response = Some(Box::new(move |w| {
                let h = sos_response(&sos, gain, w);
                if zp {
                    C64::new(h.norm2(), 0.0)
                } else {
                    h
                }
            }));
            out
        }
        "fir" => {
            let taps = ctx.count("taps", 101, 3, 4001)?;
            let h = fir_design(&kind, taps, f1, f2, fs)?;
            let out = convolve_same(&s.y, &h);
            response = Some(Box::new(move |w| C64::new(fir_response(&h, w).abs(), 0.0)));
            out
        }
        "movingAverage" => {
            let width = ctx.count("width", 9, 1, 100_001)?;
            let taps = vec![1.0 / width as f64; width];
            let out = convolve_same(&s.y, &taps);
            response = Some(Box::new(move |w| C64::new(fir_response(&taps, w).abs(), 0.0)));
            out
        }
        "median" => {
            let width = ctx.count("width", 9, 1, 10_001)?;
            let half = width / 2;
            let n = s.y.len();
            (0..n)
                .map(|i| {
                    let lo = i.saturating_sub(half);
                    let hi = (i + half + 1).min(n);
                    let mut w: Vec<f64> = s.y[lo..hi].to_vec();
                    w.sort_by(|a, b| a.partial_cmp(b).unwrap());
                    w[w.len() / 2]
                })
                .collect()
        }
        "exponential" => {
            // First-order low pass: y += α (x − y), α from the cut-off.
            let alpha = 1.0 - (-2.0 * PI * f1 / fs).exp();
            let mut y = s.y[0];
            let out: Vec<f64> = s.y.iter().map(|v| { y += alpha * (v - y); y }).collect();
            response = Some(Box::new(move |w| C64::new(alpha, 0.0) / (C64::ONE - C64::polar(1.0 - alpha, -w))));
            out
        }
        other => return Err(format!("unknown design \"{other}\" (butterworth, fir, movingAverage, median, exponential)")),
    };
    let noise: Vec<f64> = s.y.iter().zip(&filtered).map(|(a, b)| a - b).collect();
    let mut table = Table::new("filtered").with_x(Column::new(&s.x_name, &s.x_unit, s.x.clone()));
    table.push(Column::new(&s.y_name, &s.y_unit, s.y.clone()));
    table.push(Column::new("filtered", &s.y_unit, filtered.clone()));
    table.push(Column::new("removed", &s.y_unit, noise.clone()));
    let mut out = Dataset::table(table);
    if let Some(h) = response {
        let n = 512;
        let mut resp = Table::new("response").with_x(Column::new("f", "Hz", (0..n).map(|k| k as f64 * fs / 2.0 / (n - 1) as f64).collect()));
        let values: Vec<C64> = (0..n).map(|k| h(PI * k as f64 / (n - 1) as f64)).collect();
        resp.push(Column::new("gain", "", values.iter().map(|v| v.abs()).collect()));
        resp.push(Column::new("dB", "dB", values.iter().map(|v| 20.0 * v.abs().max(1e-12).log10()).collect()));
        out.tables.push(resp);
    }
    out.scalar("RMS in", rms(&s.y), &s.y_unit).scalar("RMS out", rms(&filtered), &s.y_unit).scalar("RMS removed", rms(&noise), &s.y_unit);
    Ok(out)
}

pub fn spectrogram(ctx: &mut Ctx) -> Result<Dataset, String> {
    let s = series(ctx)?;
    let nseg = ctx.count("segment", 256, 8, 1 << 18)?.min(s.y.len());
    let overlap = ctx.num("overlap", 75.0)?.clamp(0.0, 95.0) / 100.0;
    let mut hop = ((nseg as f64) * (1.0 - overlap)).round().max(1.0) as usize;
    // At most ~1500 frames.
    let frames_wanted = (s.y.len().saturating_sub(nseg)) / hop + 1;
    if frames_wanted > 1500 {
        hop = (s.y.len() - nseg) / 1499 + 1;
        ctx.warn("the hop was enlarged to keep the picture at 1500 frames");
    }
    let win = window(&ctx.str("window", "hann"), nseg)?;
    let u: f64 = win.iter().map(|w| w * w).sum();
    let half = nseg / 2 + 1;
    let mut times = Vec::new();
    let mut z: Vec<Vec<f64>> = Vec::new();
    let mut start = 0;
    let t0 = s.x.first().copied().unwrap_or(0.0);
    while start + nseg <= s.y.len() {
        let seg = &s.y[start..start + nseg];
        let m = mean(seg);
        let data: Vec<f64> = seg.iter().zip(&win).map(|(v, w)| (v - m) * w).collect();
        let spec = fft_real(&data);
        z.push((0..half).map(|k| 10.0 * (spec[k].norm2() * if k == 0 { 1.0 } else { 2.0 } / (s.fs * u)).max(1e-30).log10()).collect());
        times.push(t0 + (start as f64 + nseg as f64 / 2.0) / s.fs);
        start += hop;
        if z.len() % 64 == 0 {
            ctx.check()?;
        }
    }
    let freqs: Vec<f64> = (0..half).map(|k| k as f64 * s.fs / nseg as f64).collect();
    // z[j * nx + i] with x = time (i), y = frequency (j).
    let nx = times.len();
    let mut flat = vec![0.0; nx * half];
    for (i, col) in z.iter().enumerate() {
        for (j, v) in col.iter().enumerate() {
            flat[j * nx + i] = *v;
        }
    }
    let grid = Grid { name: "spectrogram".into(), x: times, y: freqs, z: flat, x_label: format!("{} ({})", s.x_name, s.x_unit), y_label: "f (Hz)".into(), z_label: "dB".into(), x_names: None, y_names: None };
    let mut out = Dataset { grids: vec![grid], ..Default::default() };
    out.scalar("frames", nx as f64, "").scalar("frequency resolution", s.fs / nseg as f64, "Hz");
    Ok(out)
}

pub fn peaks(ctx: &mut Ctx) -> Result<Dataset, String> {
    let s = series(ctx)?;
    let invert = ctx.flag("valleys", false);
    let y: Vec<f64> = if invert { s.y.iter().map(|v| -v).collect() } else { s.y.clone() };
    let min_height = ctx.num("minHeight", f64::NEG_INFINITY)?;
    let min_prom = ctx.num("minProminence", 0.0)?;
    let distance = ctx.num("minDistance", 0.0)?.max(0.0);
    let max_count = ctx.count("maxCount", 50, 1, 100_000)?;
    let n = y.len();
    let mut candidates: Vec<(usize, f64)> = Vec::new();
    let mut i = 1;
    while i + 1 < n {
        if y[i] > y[i - 1] {
            // Plateaus: take the middle.
            let mut j = i;
            while j + 1 < n && y[j + 1] == y[i] {
                j += 1;
            }
            if j + 1 < n && y[j + 1] < y[i] {
                let at = (i + j) / 2;
                // The height test works on the searched signal (valleys: the negated one).
                if y[at] >= min_height {
                    // Prominence: height above the higher of the two surrounding minima up to a higher peak.
                    let mut left_min = y[at];
                    let mut k = at;
                    while k > 0 {
                        k -= 1;
                        if y[k] > y[at] {
                            break;
                        }
                        left_min = left_min.min(y[k]);
                    }
                    let mut right_min = y[at];
                    let mut k = at;
                    while k + 1 < n {
                        k += 1;
                        if y[k] > y[at] {
                            break;
                        }
                        right_min = right_min.min(y[k]);
                    }
                    let prom = y[at] - left_min.max(right_min);
                    if prom >= min_prom {
                        candidates.push((at, prom));
                    }
                }
            }
            i = j + 1;
        } else {
            i += 1;
        }
    }
    // Minimum distance: keep the tallest first.
    candidates.sort_by(|a, b| y[b.0].partial_cmp(&y[a.0]).unwrap());
    let mut kept: Vec<(usize, f64)> = Vec::new();
    for c in candidates {
        if distance > 0.0 && kept.iter().any(|k| (s.x.get(k.0).copied().unwrap_or(k.0 as f64) - s.x.get(c.0).copied().unwrap_or(c.0 as f64)).abs() < distance) {
            continue;
        }
        kept.push(c);
        if kept.len() >= max_count {
            break;
        }
    }
    kept.sort_by_key(|k| k.0);
    let mut table = Table::new("peaks").with_x(Column::new(&s.x_name, &s.x_unit, kept.iter().map(|k| s.x.get(k.0).copied().unwrap_or(k.0 as f64)).collect()));
    table.push(Column::new(&s.y_name, &s.y_unit, kept.iter().map(|k| s.y[k.0]).collect()));
    table.push(Column::new("prominence", &s.y_unit, kept.iter().map(|k| k.1).collect()));
    table.push(Column::new("index", "", kept.iter().map(|k| k.0 as f64).collect()));
    let mut out = Dataset::table(table);
    out.scalar("peaks", kept.len() as f64, "");
    if kept.len() >= 2 {
        let xs: Vec<f64> = kept.iter().map(|k| s.x.get(k.0).copied().unwrap_or(k.0 as f64)).collect();
        let period = (xs[xs.len() - 1] - xs[0]) / (xs.len() - 1) as f64;
        out.scalar("mean spacing", period, &s.x_unit);
        if period > 0.0 {
            out.scalar("frequency (1/spacing)", 1.0 / period, if s.x_unit == "s" { "Hz" } else { "" });
        }
        // Logarithmic decrement → damping ratio (successive peaks of a decaying oscillation).
        let a0 = s.y[kept[0].0].abs();
        let a1 = s.y[kept[1].0].abs();
        if a0 > 0.0 && a1 > 0.0 && a1 < a0 {
            let delta = (a0 / a1).ln();
            out.scalar("damping ratio (log decrement)", delta / (4.0 * PI * PI + delta * delta).sqrt(), "");
        }
    }
    Ok(out)
}

/// Cross-correlation of a and b (or auto-correlation of a), normalised to −1 … 1.
pub fn correlate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let col_a = ctx.str("column", "");
    let col_b = ctx.str("columnB", "");
    let ta = ctx.need("a")?.pick_table("")?;
    let a: Vec<f64> = ta.pick(&col_a)?.values.clone();
    let xa = ta.pick_x("");
    let b: Vec<f64> = match ctx.input("b") {
        Some(d) => d.pick_table("")?.pick(&col_b)?.values.clone(),
        None => a.clone(),
    };
    let fs = sample_rate(&xa.values).unwrap_or(1.0);
    let n = a.len().max(b.len());
    let size = (2 * n).next_power_of_two();
    let prep = |v: &[f64]| -> (Vec<C64>, f64) {
        let m = mean(v);
        let mut out = vec![C64::ZERO; size];
        let mut energy = 0.0;
        for (i, x) in v.iter().enumerate() {
            let d = if x.is_finite() { x - m } else { 0.0 };
            out[i] = C64::new(d, 0.0);
            energy += d * d;
        }
        crate::fft::fft(&mut out, false);
        (out, energy)
    };
    let (fa, ea) = prep(&a);
    let (fb, eb) = prep(&b);
    let mut prod: Vec<C64> = fa.iter().zip(&fb).map(|(p, q)| *p * q.conj()).collect();
    crate::fft::fft(&mut prod, true);
    let norm = (ea * eb).sqrt().max(1e-300);
    let max_lag = ctx.int("maxLag", 0)?;
    let max_lag = if max_lag > 0 { (max_lag as usize).min(n - 1) } else { n - 1 };
    let mut lags = Vec::new();
    let mut r = Vec::new();
    for lag in -(max_lag as isize)..=(max_lag as isize) {
        let idx = if lag >= 0 { lag as usize } else { size - (-lag) as usize };
        lags.push(lag as f64 / fs);
        r.push(prod[idx].re / norm);
    }
    let best = (0..r.len()).max_by(|&i, &j| r[i].abs().partial_cmp(&r[j].abs()).unwrap()).unwrap_or(0);
    let unit = if xa.unit == "s" { "s" } else { "" };
    let mut table = Table::new("correlation").with_x(Column::new("lag", unit, lags.clone()));
    table.push(Column::new("r", "", r.clone()));
    let mut out = Dataset::table(table);
    out.scalar("max |r|", r[best].abs(), "").scalar("lag at max", lags[best], unit).scalar("r at lag 0", r[max_lag], "");
    Ok(out)
}

/// Analytic signal by the Hilbert transform: envelope and instantaneous frequency.
pub fn envelope(ctx: &mut Ctx) -> Result<Dataset, String> {
    let s = series(ctx)?;
    let n = s.y.len();
    let m = mean(&s.y);
    let mut a: Vec<C64> = s.y.iter().map(|v| C64::new(v - m, 0.0)).collect();
    crate::fft::fft(&mut a, false);
    for (k, v) in a.iter_mut().enumerate() {
        let h = if k == 0 || (n % 2 == 0 && k == n / 2) {
            1.0
        } else if k < (n + 1) / 2 {
            2.0
        } else {
            0.0
        };
        *v = v.scale(h);
    }
    crate::fft::fft(&mut a, true);
    let env: Vec<f64> = a.iter().map(|v| v.abs()).collect();
    let phase: Vec<f64> = a.iter().map(|v| v.arg()).collect();
    let mut unwrapped = phase.clone();
    for i in 1..n {
        let mut d = phase[i] - phase[i - 1];
        while d > PI {
            d -= 2.0 * PI;
        }
        while d < -PI {
            d += 2.0 * PI;
        }
        unwrapped[i] = unwrapped[i - 1] + d;
    }
    let freq: Vec<f64> = (0..n)
        .map(|i| {
            let (p, q) = if i == 0 { (0, 1) } else if i == n - 1 { (n - 2, n - 1) } else { (i - 1, i + 1) };
            (unwrapped[q] - unwrapped[p]) / (2.0 * PI) * s.fs / (q - p) as f64
        })
        .collect();
    let mut table = Table::new("envelope").with_x(Column::new(&s.x_name, &s.x_unit, s.x.clone()));
    table.push(Column::new(&s.y_name, &s.y_unit, s.y.clone()));
    table.push(Column::new("envelope", &s.y_unit, env.iter().map(|e| e + m).collect()));
    table.push(Column::new("envelope_low", &s.y_unit, env.iter().map(|e| m - e).collect()));
    table.push(Column::new("frequency", "Hz", freq.clone()));
    let mut out = Dataset::table(table);
    out.scalar("mean envelope", mean(&env), &s.y_unit).scalar("median frequency", crate::data::quantile(&freq, 0.5), "Hz");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn butterworth_lowpass_is_minus_3db_at_cutoff() {
        for order in [1, 2, 3, 4, 7] {
            let (sos, g) = butterworth(order, "lowpass", 100.0, 0.0, 1000.0).unwrap();
            let at = sos_response(&sos, g, 2.0 * PI * 100.0 / 1000.0).abs();
            assert!((at - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-6, "order {order}: {at}");
            assert!((sos_response(&sos, g, 0.0).abs() - 1.0).abs() < 1e-9);
        }
        let (sos, g) = butterworth(4, "bandpass", 50.0, 150.0, 1000.0).unwrap();
        let lo = sos_response(&sos, g, 2.0 * PI * 50.0 / 1000.0).abs();
        assert!((lo - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-6, "{lo}");
        let (sos, g) = butterworth(3, "highpass", 100.0, 0.0, 1000.0).unwrap();
        assert!(sos_response(&sos, g, 2.0 * PI * 10.0 / 1000.0).abs() < 1e-2);
    }
}
