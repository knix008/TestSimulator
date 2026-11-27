//! Statistics of a range.
//!
//! CONTRACT
//! `stats(src, {offset?, length?, blocks: n (entropy graph points, default 256)}, progress)` →
//!   `{ offset, length, histogram: [256 counts], entropy (bits per byte, 0–8), blockSize, blockEntropy: [..],
//!      zero, printable (0x20–0x7E), control (<0x20, 0x7F), high (>=0x80), distinct, mostCommon: [{byte, count}] (top 16),
//!      mean, median, chiSquare, chiSquareP (probability, %), monteCarloPi, monteCarloError (%), serialCorrelation }`
//!   One pass in 1 MiB chunks. The last block may be shorter than `blockSize`. The "ent" statistics follow John
//!   Walker's ent: chi-square against a uniform distribution, Monte Carlo π from successive 6-byte pairs (24-bit x, y),
//!   serial correlation of successive bytes.
use crate::doc::Bytes;
use crate::util::{for_each_chunk, range_of, Args, Progress};
use serde_json::{json, Value};

fn entropy(counts: &[u64; 256], total: u64) -> f64 {
    if total == 0 {
        return 0.0;
    }
    let n = total as f64;
    counts.iter().filter(|&&c| c > 0).map(|&c| {
        let p = c as f64 / n;
        -p * p.log2()
    }).sum::<f64>()
}

/// Upper-tail probability of chi-square with 255 degrees of freedom (Wilson–Hilferty normal approximation).
fn chi_p(chi: f64) -> f64 {
    let k = 255.0f64;
    let z = ((chi / k).powf(1.0 / 3.0) - (1.0 - 2.0 / (9.0 * k))) / (2.0 / (9.0 * k)).sqrt();
    // 1 - Φ(z) via erfc.
    0.5 * erfc(z / std::f64::consts::SQRT_2)
}

fn erfc(x: f64) -> f64 {
    // Numerical Recipes erfc (Chebyshev), accurate to ~1e-7.
    let z = x.abs();
    let t = 1.0 / (1.0 + 0.5 * z);
    let r = t * (-z * z - 1.265_512_23 + t * (1.000_023_68 + t * (0.374_091_96 + t * (0.096_784_18 + t * (-0.186_288_06 + t * (0.278_868_07 + t * (-1.135_203_98 + t * (1.488_515_87 + t * (-0.822_152_23 + t * 0.170_872_77))))))))).exp();
    if x >= 0.0 { r } else { 2.0 - r }
}

pub fn stats(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let (offset, length) = range_of(src, args);
    let blocks = args.u64_or("blocks", 256).clamp(1, 65536);
    let block_size = if length == 0 { 1 } else { length.div_ceil(blocks).max(1) };
    let mut hist = [0u64; 256];
    let mut block_counts = [0u64; 256];
    let mut block_fill = 0u64;
    let mut block_entropy: Vec<f64> = Vec::new();
    // ent: serial correlation and Monte Carlo.
    let (mut sc1, mut sc2, mut sc3) = (0f64, 0f64, 0f64);
    let mut first: Option<u8> = None;
    let mut last = 0u8;
    let mut mc = [0u8; 6];
    let mut mc_fill = 0usize;
    let (mut mc_tries, mut mc_in) = (0u64, 0u64);
    let radius = (256f64.powi(3) - 1.0).powi(2);
    for_each_chunk(src, offset, length, 1 << 20, progress, |_, chunk| {
        for &b in chunk {
            hist[b as usize] += 1;
            block_counts[b as usize] += 1;
            block_fill += 1;
            if block_fill == block_size {
                block_entropy.push(entropy(&block_counts, block_fill));
                block_counts = [0; 256];
                block_fill = 0;
            }
            let v = b as f64;
            if first.is_none() {
                first = Some(b);
            } else {
                sc1 += last as f64 * v;
            }
            sc2 += v;
            sc3 += v * v;
            last = b;
            mc[mc_fill] = b;
            mc_fill += 1;
            if mc_fill == 6 {
                mc_fill = 0;
                mc_tries += 1;
                let x = ((mc[0] as u32) << 16 | (mc[1] as u32) << 8 | mc[2] as u32) as f64;
                let y = ((mc[3] as u32) << 16 | (mc[4] as u32) << 8 | mc[5] as u32) as f64;
                if x * x + y * y <= radius {
                    mc_in += 1;
                }
            }
        }
        true
    })?;
    if block_fill > 0 {
        block_entropy.push(entropy(&block_counts, block_fill));
    }
    let n = length as f64;
    let total_entropy = entropy(&hist, length);
    let sum: f64 = hist.iter().enumerate().map(|(i, &c)| i as f64 * c as f64).sum();
    let mean = if length > 0 { sum / n } else { 0.0 };
    let median = {
        let half = length.div_ceil(2).max(1);
        let mut acc = 0;
        let mut m = 0;
        for (i, &c) in hist.iter().enumerate() {
            acc += c;
            if acc >= half {
                m = i;
                break;
            }
        }
        if length == 0 { 0 } else { m }
    };
    let expected = n / 256.0;
    let chi = if length > 0 { hist.iter().map(|&c| (c as f64 - expected).powi(2) / expected).sum::<f64>() } else { 0.0 };
    let pi = if mc_tries > 0 { 4.0 * mc_in as f64 / mc_tries as f64 } else { 0.0 };
    let serial = if length > 1 {
        let s1 = sc1 + last as f64 * first.unwrap_or(0) as f64; // wrap around like ent
        let d = n * sc3 - sc2 * sc2;
        if d == 0.0 { 1.0 } else { (n * s1 - sc2 * sc2) / d }
    } else {
        0.0
    };
    let mut common: Vec<(usize, u64)> = hist.iter().copied().enumerate().filter(|&(_, c)| c > 0).collect();
    common.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    common.truncate(16);
    let range_sum = |r: std::ops::RangeInclusive<usize>| r.map(|i| hist[i]).sum::<u64>();
    let round = |x: f64| (x * 1e6).round() / 1e6;
    Ok(json!({
        "offset": offset, "length": length, "histogram": hist.to_vec(), "entropy": round(total_entropy),
        "blockSize": block_size, "blockEntropy": block_entropy.iter().map(|&e| round(e)).collect::<Vec<_>>(),
        "zero": hist[0], "printable": range_sum(0x20..=0x7E), "control": range_sum(0..=0x1F) + hist[0x7F], "high": range_sum(0x80..=0xFF),
        "distinct": hist.iter().filter(|&&c| c > 0).count(),
        "mostCommon": common.iter().map(|&(b, c)| json!({ "byte": b, "count": c })).collect::<Vec<_>>(),
        "mean": round(mean), "median": median, "chiSquare": round(chi), "chiSquareP": round(if length > 0 { chi_p(chi) * 100.0 } else { 0.0 }),
        "monteCarloPi": round(pi), "monteCarloError": round(if mc_tries > 0 { (pi - std::f64::consts::PI).abs() / std::f64::consts::PI * 100.0 } else { 0.0 }),
        "serialCorrelation": round(serial),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::no_progress;

    #[test]
    fn entropy_extremes() {
        let zeros = vec![0u8; 5000];
        let r = stats(&zeros, &json!({}), &mut no_progress()).unwrap();
        assert_eq!(r["entropy"], json!(0.0));
        assert_eq!(r["zero"], json!(5000));
        assert_eq!(r["distinct"], json!(1));
        let all: Vec<u8> = (0..256 * 40).map(|i| i as u8).collect();
        let r = stats(&all, &json!({ "blocks": 10 }), &mut no_progress()).unwrap();
        assert_eq!(r["entropy"], json!(8.0));
        assert_eq!(r["blockEntropy"].as_array().unwrap().len(), 10);
        assert_eq!(r["blockSize"], json!(1024));
        assert_eq!(r["chiSquare"], json!(0.0));
        assert_eq!(r["mean"], json!(127.5));
        assert_eq!(r["printable"], json!(95 * 40));
    }

    #[test]
    fn random_looks_random() {
        let mut x = 0x1234_5678_9abc_def1u64;
        let data: Vec<u8> = (0..600_000).map(|_| { x ^= x << 13; x ^= x >> 7; x ^= x << 17; (x >> 24) as u8 }).collect();
        let r = stats(&data, &json!({ "offset": 0 }), &mut no_progress()).unwrap();
        assert!(r["entropy"].as_f64().unwrap() > 7.99);
        assert!((r["monteCarloPi"].as_f64().unwrap() - std::f64::consts::PI).abs() < 0.05);
        assert!(r["serialCorrelation"].as_f64().unwrap().abs() < 0.02);
    }
}
