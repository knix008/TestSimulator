//! Design exploration: design-of-experiments tables (full factorial, Latin hypercube, central
//! composite), quadratic response surfaces (least squares, R²), sensitivities, and an optimum
//! search on the surfaces with constraints.

use crate::dense::lstsq;
use crate::out::Out;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Param {
    pub name: String,
    pub min: f64,
    pub max: f64,
    #[serde(default = "three")]
    pub levels: usize,
}
fn three() -> usize { 3 }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DoeJob {
    parameters: Vec<Param>,
    #[serde(default)]
    method: String,
    #[serde(default)]
    samples: usize,
    #[serde(default)]
    seed: u64,
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> f64 { self.0 ^= self.0 << 13; self.0 ^= self.0 >> 7; self.0 ^= self.0 << 17; (self.0 >> 11) as f64 / (1u64 << 53) as f64 }
}

/// Points in [0, 1]^p.
pub fn design(params: &[Param], method: &str, samples: usize, seed: u64) -> Vec<Vec<f64>> {
    let p = params.len();
    let mut rng = Rng(seed.max(1).wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
    match method {
        "lhs" => {
            let n = samples.max(p + 2);
            let mut cols: Vec<Vec<f64>> = (0..p).map(|_| {
                let mut perm: Vec<usize> = (0..n).collect();
                for i in (1..n).rev() { let j = (rng.next() * (i + 1) as f64) as usize; perm.swap(i, j.min(i)); }
                perm.iter().map(|&k| (k as f64 + rng.next()) / n as f64).collect()
            }).collect();
            (0..n).map(|i| cols.iter_mut().map(|c| c[i]).collect()).collect()
        }
        "ccd" => {
            // Centre, 2^p corners (fractional above 5 parameters is not attempted), 2p face centres.
            let mut pts = vec![vec![0.5; p]];
            for mask in 0..(1usize << p.min(5)) { pts.push((0..p).map(|i| if i < 5 && mask & (1 << i) != 0 { 1.0 } else if i < 5 { 0.0 } else { 0.5 }).collect()); }
            for i in 0..p { for v in [0.0, 1.0] { let mut q = vec![0.5; p]; q[i] = v; pts.push(q); } }
            pts
        }
        _ => {
            // Full factorial.
            let mut pts = vec![vec![]];
            for prm in params {
                let l = prm.levels.max(2);
                let mut next = Vec::new();
                for base in &pts { for k in 0..l { let mut q = base.clone(); q.push(k as f64 / (l - 1) as f64); next.push(q); } }
                pts = next;
                if pts.len() > 5000 { break; }
            }
            pts
        }
    }
}

fn actual(params: &[Param], u: &[f64]) -> Vec<f64> { params.iter().zip(u.iter()).map(|(p, t)| p.min + (p.max - p.min) * t).collect() }

pub fn run_doe(json_text: &str) -> Result<Vec<u8>, String> {
    let job: DoeJob = serde_json::from_str(json_text).map_err(|e| format!("job.invalid:{e}"))?;
    if job.parameters.is_empty() { return Err("doe.noParameters".into()); }
    let unit = design(&job.parameters, &job.method, job.samples.max(10), job.seed);
    let pts: Vec<Vec<f64>> = unit.iter().map(|u| actual(&job.parameters, u)).collect();
    let mut out = Out::new();
    out.set("analysis", json!("doe"));
    out.set("points", json!(pts));
    Ok(out.finish())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Constraint { output: String, #[serde(default)] min: Option<f64>, #[serde(default)] max: Option<f64> }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Objective { output: String, #[serde(default)] goal: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FitJob {
    parameters: Vec<Param>,
    inputs: Vec<Vec<f64>>,
    outputs: HashMap<String, Vec<f64>>,
    #[serde(default)]
    objective: Option<Objective>,
    #[serde(default)]
    constraints: Vec<Constraint>,
}

/// Basis row for normalised inputs t ∈ [−1, 1]: 1, t_i, then t_i t_j (i ≤ j) when quadratic.
fn basis(t: &[f64], quadratic: bool) -> Vec<f64> {
    let mut r = vec![1.0];
    r.extend_from_slice(t);
    if quadratic { for i in 0..t.len() { for j in i..t.len() { r.push(t[i] * t[j]); } } }
    r
}

struct Surface { coef: Vec<f64>, quadratic: bool, r2: f64 }

impl Surface {
    fn eval(&self, t: &[f64]) -> f64 { basis(t, self.quadratic).iter().zip(self.coef.iter()).map(|(a, b)| a * b).sum() }
}

pub fn run_fit(json_text: &str) -> Result<Vec<u8>, String> {
    let job: FitJob = serde_json::from_str(json_text).map_err(|e| format!("job.invalid:{e}"))?;
    let p = job.parameters.len();
    if p == 0 || job.inputs.is_empty() { return Err("doe.noData".into()); }
    let norm = |x: &[f64]| -> Vec<f64> { job.parameters.iter().zip(x.iter()).map(|(q, v)| if q.max > q.min { 2.0 * (v - q.min) / (q.max - q.min) - 1.0 } else { 0.0 }).collect() };
    let t: Vec<Vec<f64>> = job.inputs.iter().map(|x| norm(x)).collect();
    let nq = 1 + p + p * (p + 1) / 2;
    let mut surfaces: HashMap<String, Surface> = HashMap::new();
    let mut report = serde_json::Map::new();
    for (name, y) in &job.outputs {
        let rows: Vec<(Vec<f64>, f64)> = t.iter().zip(y.iter()).filter(|(_, v)| v.is_finite()).map(|(a, b)| (a.clone(), *b)).collect();
        if rows.len() < p + 1 { continue; }
        let quadratic = rows.len() >= nq + 1;
        let x: Vec<Vec<f64>> = rows.iter().map(|r| basis(&r.0, quadratic)).collect();
        let yy: Vec<f64> = rows.iter().map(|r| r.1).collect();
        let Some(coef) = lstsq(&x, &yy) else { continue };
        let mean = yy.iter().sum::<f64>() / yy.len() as f64;
        let sst: f64 = yy.iter().map(|v| (v - mean).powi(2)).sum();
        let s = Surface { coef, quadratic, r2: 0.0 };
        let sse: f64 = rows.iter().map(|r| (s.eval(&r.0) - r.1).powi(2)).sum();
        let r2 = if sst > 0.0 { 1.0 - sse / sst } else { 1.0 };
        let sd = (sst / yy.len() as f64).sqrt().max(1e-300);
        // Sensitivity: change over each parameter's range (others at the centre), relative to the spread.
        let sens: Vec<f64> = (0..p).map(|i| { let mut a = vec![0.0; p]; let mut b = vec![0.0; p]; a[i] = -1.0; b[i] = 1.0; (s.eval(&b) - s.eval(&a)) / (2.0 * sd) }).collect();
        let predicted: Vec<f64> = t.iter().map(|r| s.eval(r)).collect();
        report.insert(name.clone(), json!({ "r2": r2, "quadratic": quadratic, "coefficients": s.coef, "sensitivity": sens, "predicted": predicted }));
        surfaces.insert(name.clone(), Surface { r2, ..s });
    }
    let mut out = Out::new();
    out.set("analysis", json!("fit"));
    out.set("surfaces", Value::Object(report));
    // Optimum on the surfaces by sampling (Latin hypercube + local refinement).
    if let Some(obj) = &job.objective {
        if let Some(sobj) = surfaces.get(&obj.output) {
            let sign = if obj.goal == "max" { -1.0 } else { 1.0 };
            let feasible = |t: &[f64]| job.constraints.iter().all(|c| match surfaces.get(&c.output) {
                Some(s) => { let v = s.eval(t); c.min.map_or(true, |m| v >= m) && c.max.map_or(true, |m| v <= m) }
                None => true,
            });
            let unit = design(&job.parameters, "lhs", 4000, 7);
            let mut best: Option<(f64, Vec<f64>)> = None;
            for u in &unit {
                let t: Vec<f64> = u.iter().map(|v| 2.0 * v - 1.0).collect();
                if !feasible(&t) { continue; }
                let v = sign * sobj.eval(&t);
                if best.as_ref().map_or(true, |b| v < b.0) { best = Some((v, t)); }
            }
            if let Some((_, mut t)) = best {
                // Coordinate refinement.
                let mut step = 0.1;
                for _ in 0..60 {
                    let mut improved = false;
                    for i in 0..p {
                        for d in [-step, step] {
                            let mut q = t.clone();
                            q[i] = (q[i] + d).clamp(-1.0, 1.0);
                            if feasible(&q) && sign * sobj.eval(&q) < sign * sobj.eval(&t) { t = q; improved = true; }
                        }
                    }
                    if !improved { step *= 0.5; if step < 1e-4 { break; } }
                }
                let x: Vec<f64> = job.parameters.iter().zip(t.iter()).map(|(q, v)| q.min + (v + 1.0) / 2.0 * (q.max - q.min)).collect();
                let outputs: serde_json::Map<String, Value> = surfaces.iter().map(|(k, s)| (k.clone(), json!(s.eval(&t)))).collect();
                out.set("optimum", json!({ "inputs": x, "outputs": Value::Object(outputs), "r2": sobj.r2 }));
            } else {
                out.set("optimum", Value::Null);
            }
            // A 2D chart of the objective over the first two parameters.
            if p >= 2 {
                let n = 25;
                let mut grid = Vec::with_capacity(n * n);
                for j in 0..n { for i in 0..n {
                    let mut t = vec![0.0; p];
                    t[0] = -1.0 + 2.0 * i as f64 / (n - 1) as f64;
                    t[1] = -1.0 + 2.0 * j as f64 / (n - 1) as f64;
                    grid.push(sobj.eval(&t));
                } }
                let g = out.f32s(&grid);
                out.set("chart", json!({ "size": [n, n], "values": g, "x": [job.parameters[0].min, job.parameters[0].max], "y": [job.parameters[1].min, job.parameters[1].max] }));
            }
        }
    }
    Ok(out.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::out::decode;

    #[test]
    fn designs_have_expected_sizes() {
        let p = vec![Param { name: "a".into(), min: 0.0, max: 1.0, levels: 3 }, Param { name: "b".into(), min: 0.0, max: 1.0, levels: 4 }];
        assert_eq!(design(&p, "fullFactorial", 0, 1).len(), 12);
        assert_eq!(design(&p, "ccd", 0, 1).len(), 1 + 4 + 4);
        assert_eq!(design(&p, "lhs", 20, 1).len(), 20);
    }

    #[test]
    fn fit_recovers_a_quadratic_and_finds_its_minimum() {
        let mut inputs = Vec::new();
        let mut y = Vec::new();
        for i in 0..5 { for j in 0..5 {
            let (a, b) = (i as f64, j as f64);
            inputs.push(vec![a, b]);
            y.push((a - 1.5).powi(2) + 2.0 * (b - 2.5).powi(2) + 3.0);
        } }
        let job = json!({ "parameters": [{ "name": "a", "min": 0, "max": 4 }, { "name": "b", "min": 0, "max": 4 }], "inputs": inputs, "outputs": { "f": y }, "objective": { "output": "f", "goal": "min" } });
        let (v, _) = decode(&run_fit(&job.to_string()).unwrap()).unwrap();
        assert!((v["surfaces"]["f"]["r2"].as_f64().unwrap() - 1.0).abs() < 1e-9);
        let x = &v["optimum"]["inputs"];
        assert!((x[0].as_f64().unwrap() - 1.5).abs() < 0.01 && (x[1].as_f64().unwrap() - 2.5).abs() < 0.01, "{x}");
    }
}
