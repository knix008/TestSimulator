//! The `math` module of the YARA engine (src/yara.rs). One pass over a range (in 1 MiB chunks, with progress) gives
//! every statistic; the formulas are YARA's (serial correlation without wrap-around, -100000 when undefined;
//! monte_carlo_pi = |pi estimate - pi| / pi from 6-byte groups).
use super::{bv, Val};
use crate::doc::Bytes;
use crate::util::{for_each_chunk, Progress};

#[derive(Clone, Debug)]
pub struct Stats {
    counts: [u64; 256],
    total: u64,
    scc: f64,
    monte: Option<f64>,
}

struct Acc {
    counts: [u64; 256],
    total: u64,
    last: f64,
    t1: f64,
    t2: f64,
    t3: f64,
    monte: [u8; 6],
    mcount: u64,
    inmont: u64,
}

impl Acc {
    fn new() -> Acc {
        Acc { counts: [0; 256], total: 0, last: 0.0, t1: 0.0, t2: 0.0, t3: 0.0, monte: [0; 6], mcount: 0, inmont: 0 }
    }
    fn feed(&mut self, data: &[u8]) {
        let incirc = (256f64.powi(3) - 1.0).powi(2);
        for &b in data {
            self.counts[b as usize] += 1;
            let u = b as f64;
            self.t1 += self.last * u;
            self.t2 += u;
            self.t3 += u * u;
            self.last = u;
            let k = (self.total % 6) as usize;
            self.monte[k] = b;
            if k == 5 {
                self.mcount += 1;
                let (mut mx, mut my) = (0f64, 0f64);
                for j in 0..3 {
                    mx = mx * 256.0 + self.monte[j] as f64;
                    my = my * 256.0 + self.monte[j + 3] as f64;
                }
                if mx * mx + my * my <= incirc {
                    self.inmont += 1;
                }
            }
            self.total += 1;
        }
    }
    fn finish(self) -> Stats {
        let n = self.total as f64;
        let t2 = self.t2 * self.t2;
        let d = n * self.t3 - t2;
        let scc = if d == 0.0 { -100000.0 } else { (n * self.t1 - t2) / d };
        let pi = std::f64::consts::PI;
        let monte = (self.mcount > 0).then(|| ((4.0 * self.inmont as f64 / self.mcount as f64 - pi) / pi).abs());
        Stats { counts: self.counts, total: self.total, scc, monte }
    }
}

pub fn of_range(src: &dyn Bytes, offset: u64, length: u64, progress: &mut Progress) -> Result<Stats, String> {
    let mut a = Acc::new();
    for_each_chunk(src, offset, length, 1 << 20, progress, |_, c| {
        a.feed(c);
        true
    })?;
    Ok(a.finish())
}

pub fn of_bytes(b: &[u8]) -> Stats {
    let mut a = Acc::new();
    a.feed(b);
    a.finish()
}

/// A statistic (`extra`: the byte of count / percentage, the mean of deviation).
pub fn stat(name: &str, s: &Stats, extra: &[Val]) -> Val {
    use Val::*;
    let n = s.total as f64;
    let empty = s.total == 0;
    let byte = || extra.first().and_then(Val::int).filter(|b| (0..256).contains(b)).map(|b| s.counts[b as usize]);
    match name {
        "entropy" => Float(if empty { 0.0 } else { s.counts.iter().filter(|&&c| c > 0).map(|&c| -(c as f64 / n) * (c as f64 / n).log2()).sum() }),
        "mean" if !empty => Float(s.counts.iter().enumerate().map(|(b, &c)| b as f64 * c as f64).sum::<f64>() / n),
        "deviation" if !empty => match extra.first() {
            Some(m) => Float(s.counts.iter().enumerate().map(|(b, &c)| (b as f64 - m.float()).abs() * c as f64).sum::<f64>() / n),
            None => Undef,
        },
        "serial_correlation" => Float(s.scc),
        "monte_carlo_pi" => s.monte.map_or(Undef, Float),
        "count" => byte().map_or(Undef, |c| Int(c as i64)),
        "percentage" if !empty => byte().map_or(Undef, |c| Float(c as f64 / n)),
        "mode" if !empty => Int((0..256usize).max_by_key(|&b| (s.counts[b], std::cmp::Reverse(b))).unwrap_or(0) as i64),
        _ => Undef,
    }
}

/// The functions that do not read data.
pub fn pure(name: &str, a: &[Val]) -> Val {
    use Val::*;
    match (name, a) {
        ("in_range", [t, lo, hi]) => bv(lo.float() <= t.float() && t.float() <= hi.float()),
        ("to_number", [x]) => Int(x.truthy() as i64),
        ("abs", [Int(x)]) => Int(x.wrapping_abs()),
        ("abs", [x]) => Float(x.float().abs()),
        ("min", [Int(x), Int(y)]) => Int(*x.min(y)),
        ("max", [Int(x), Int(y)]) => Int(*x.max(y)),
        ("min", [x, y]) => Float(x.float().min(y.float())),
        ("max", [x, y]) => Float(x.float().max(y.float())),
        ("to_string", [Int(x)]) => Str(x.to_string().into_bytes()),
        ("to_string", [Int(x), Int(base)]) => match base {
            10 => Str(x.to_string().into_bytes()),
            8 => Str(format!("{x:o}").into_bytes()),
            16 => Str(format!("{x:x}").into_bytes()),
            _ => Undef,
        },
        _ => Undef,
    }
}
