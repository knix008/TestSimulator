//! Every node type run in a small pipeline, checked against known answers.

use serde_json::{json, Value};
use sim_core::data::Dataset;
use sim_core::{run_model, validate, Host, NoHost, RunResult};

fn run(model: Value) -> RunResult {
    run_with(model, &NoHost)
}

fn run_with(model: Value, host: &dyn Host) -> RunResult {
    let text = model.to_string();
    let r = run_model(&text, &mut |_| {}, &|| false, host);
    assert!(r.ok, "run failed: {:?}", r.error);
    r
}

fn data<'a>(r: &'a RunResult, id: &str) -> &'a Dataset {
    let n = r.node(id).unwrap_or_else(|| panic!("no node {id}"));
    n.data.as_ref().unwrap_or_else(|| panic!("node {id} failed: {:?}", n.error))
}

fn scalar(r: &RunResult, id: &str, name: &str) -> f64 {
    data(r, id).get_scalar(name).unwrap_or_else(|| panic!("node {id} has no scalar {name}: {:?}", data(r, id).scalars))
}

fn col<'a>(d: &'a Dataset, table: usize, name: &str) -> &'a [f64] {
    &d.tables[table].column(name).unwrap().values
}

fn node(id: &str, kind: &str, params: Value) -> Value {
    json!({ "id": id, "type": kind, "name": id, "params": params })
}

fn link(from: &str, to: &str) -> Value {
    json!({ "from": from, "to": to })
}

fn link_port(from: &str, to: &str, port: &str) -> Value {
    json!({ "from": from, "to": to, "toPort": port })
}

fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol
}

#[test]
fn signal_fft_finds_the_tone_and_filter_removes_noise() {
    let r = run(json!({
        "nodes": [
            node("sig", "source.signal", json!({ "waveform": "sine", "frequency": 50, "amplitude": 2, "fs": 1000, "duration": 2, "noise": 0.5, "seed": 3, "components": "120:0.5" })),
            node("fft", "signal.fft", json!({ "window": "hann" })),
            node("lp", "signal.filter", json!({ "design": "butterworth", "type": "lowpass", "order": 6, "cutoff": 80 })),
            node("fft2", "signal.fft", json!({ "column": "filtered" })),
            node("psd", "signal.psd", json!({ "segment": 512 })),
        ],
        "links": [link("sig", "fft"), link("sig", "lp"), link("lp", "fft2"), link("sig", "psd")],
    }));
    let f0 = scalar(&r, "fft", "dominant frequency");
    assert!(close(f0, 50.0, 0.1), "dominant {f0}");
    let a = scalar(&r, "fft", "amplitude at peak");
    assert!(close(a, 2.0, 0.1), "amplitude {a}");
    // After the low pass the 120 Hz component is gone: its bin is far below the 50 Hz one.
    let d = data(&r, "fft2");
    let f = col(d, 0, "f");
    let amp = col(d, 0, "amplitude");
    let at = |hz: f64| f.iter().zip(amp).filter(|(fv, _)| (**fv - hz).abs() <= 1.0).map(|(_, a)| *a).fold(0.0, f64::max);
    assert!(at(120.0) < 0.01, "120 Hz left: {}", at(120.0));
    assert!(at(50.0) > 1.5);
    // Filtered RMS ≈ 2/√2 (noise mostly removed).
    let rms_out = scalar(&r, "lp", "RMS out");
    assert!(close(rms_out, 2.0 / 2f64.sqrt(), 0.08), "rms {rms_out}");
    assert_eq!(data(&r, "lp").tables[1].name, "response");
    assert!(close(scalar(&r, "psd", "peak frequency"), 50.0, 2.0));
}

#[test]
fn other_filters_spectrogram_peaks_envelope_correlation() {
    let r = run(json!({
        "nodes": [
            node("chirp", "source.signal", json!({ "waveform": "chirp", "frequency": 10, "frequency2": 200, "fs": 1000, "duration": 2 })),
            node("spec", "signal.spectrogram", json!({ "segment": 128 })),
            node("fir", "signal.filter", json!({ "design": "fir", "type": "bandpass", "cutoff": 40, "cutoff2": 80, "taps": 101 })),
            node("ma", "signal.filter", json!({ "design": "movingAverage", "width": 5 })),
            node("med", "signal.filter", json!({ "design": "median", "width": 5 })),
            node("exp", "signal.filter", json!({ "design": "exponential", "cutoff": 20 })),
            node("am", "source.function", json!({ "from": 0, "to": 1, "points": 2001, "expression": "y = (1 + 0.5*cos(2*pi*3*x)) * sin(2*pi*100*x)" })),
            node("env", "signal.envelope", json!({ "fs": 2000 })),
            node("damped", "source.function", json!({ "from": 0, "to": 10, "points": 5001, "expression": "y = exp(-0.3*x)*cos(2*pi*x)" })),
            node("pk", "signal.peaks", json!({ "minProminence": 0.01 })),
            node("s1", "source.signal", json!({ "waveform": "noise", "fs": 100, "duration": 20, "seed": 9 })),
            node("shift", "data.expression", json!({ "expressions": "z = y" })),
            node("xc", "signal.correlate", json!({ "column": "y", "columnB": "z" })),
        ],
        "links": [link("chirp", "spec"), link("chirp", "fir"), link("chirp", "ma"), link("chirp", "med"), link("chirp", "exp"), link("am", "env"), link("damped", "pk"),
                  link("s1", "shift"), link_port("s1", "xc", "a"), link_port("shift", "xc", "b")],
    }));
    let spec = &data(&r, "spec").grids[0];
    assert_eq!(spec.z.len(), spec.x.len() * spec.y.len());
    for id in ["fir", "ma", "med", "exp"] {
        assert!(data(&r, id).tables[0].column("filtered").is_ok(), "{id}");
    }
    let env = data(&r, "env");
    let e = col(env, 0, "envelope");
    // Envelope at x = 0.5 (row 1000): 1 + 0.5·cos(3π) = 0.5.
    assert!(close(e[1000], 0.5, 0.05), "envelope {}", e[1000]);
    // Damped cosine: peaks every 1 s, ζ from the log decrement: δ = 0.3 → ζ = δ/√(4π²+δ²).
    assert!(close(scalar(&r, "pk", "mean spacing"), 1.0, 0.01));
    let zeta = scalar(&r, "pk", "damping ratio (log decrement)");
    assert!(close(zeta, 0.3 / (4.0 * std::f64::consts::PI.powi(2) + 0.09).sqrt(), 1e-3), "zeta {zeta}");
    assert!(close(scalar(&r, "xc", "max |r|"), 1.0, 1e-9));
    assert!(close(scalar(&r, "xc", "lag at max"), 0.0, 1e-12));
}

#[test]
fn table_operations() {
    let csv = "t (s),v,label\n0,1,a\n1,4,b\n2,9,c\n3,16,d\n4,25,e\n";
    let r = run(json!({
        "nodes": [
            node("tab", "source.table", json!({ "data": csv })),
            node("ex", "data.expression", json!({ "expressions": "w = 2*v + i\nz = w - v_mean" })),
            node("fl", "data.filter", json!({ "condition": "v > 3 && t < 4" })),
            node("sel", "data.select", json!({ "columns": "t, v", "sortBy": "v", "descending": true, "limit": 2 })),
            node("rs", "data.resample", json!({ "points": 9 })),
            node("dv", "data.calculus", json!({ "operation": "derivative", "columns": "v" })),
            node("in", "data.calculus", json!({ "operation": "integral", "columns": "v" })),
            node("other", "source.function", json!({ "from": 0, "to": 4, "points": 5, "expression": "q = x*10" })),
            node("mg", "data.merge", json!({ "mode": "columns" })),
            node("mr", "data.merge", json!({ "mode": "rows" })),
        ],
        "links": [link("tab", "ex"), link("tab", "fl"), link("tab", "sel"), link("tab", "rs"), link("tab", "dv"), link("tab", "in"),
                  link_port("tab", "mg", "a"), link_port("other", "mg", "b"), link_port("tab", "mr", "a"), link_port("tab", "mr", "b")],
    }));
    let ex = data(&r, "ex");
    assert_eq!(col(ex, 0, "w"), &[2.0, 9.0, 20.0, 35.0, 54.0]);
    assert_eq!(col(ex, 0, "z")[0], 2.0 - 11.0);
    assert_eq!(data(&r, "fl").tables[0].rows(), 3);
    assert_eq!(col(data(&r, "sel"), 0, "v"), &[25.0, 16.0]);
    assert_eq!(col(data(&r, "rs"), 0, "v")[1], 2.5);
    assert_eq!(col(data(&r, "dv"), 0, "d_v")[2], 6.0);
    assert!(close(scalar(&r, "in", "∫v"), 2.5 + 6.5 + 12.5 + 20.5, 1e-12));
    assert!(data(&r, "mg").tables[0].column("q").is_ok());
    assert_eq!(data(&r, "mr").tables[0].rows(), 10);
    assert!(data(&r, "tab").tables[0].columns[2].is_text());
}

#[test]
fn ode_damped_oscillator_and_lorenz() {
    let r = run(json!({
        "nodes": [
            node("msd", "dyn.ode", json!({
                "equations": "x' = v\nv' = -k/m*x - c/m*v\nE = 0.5*m*v^2 + 0.5*k*x^2",
                "constants": "m = 1, k = 4, c = 0", "initial": "x = 1, v = 0", "tEnd": 10, "dt": 0.01, "method": "rk45", "tolerance": 1e-9,
            })),
            node("lor", "dyn.ode", json!({
                "equations": "x' = s*(y - x)\ny' = x*(r - z) - y\nz' = x*y - b*z", "constants": "s = 10, r = 28, b = 8/3",
                "initial": "x = 1, y = 1, z = 1", "tEnd": 20, "dt": 0.01,
            })),
            node("rk4", "dyn.ode", json!({ "equations": "x' = -x", "initial": "x = 1", "tEnd": 1, "dt": 0.1, "method": "rk4", "substeps": 10 })),
        ],
        "links": [],
    }));
    let d = data(&r, "msd");
    let x = col(d, 0, "x");
    // Undamped: x = cos(2t); energy stays 2.
    assert!(close(x[1000], (20.0f64).cos(), 1e-6), "{}", x[1000]);
    let e = col(d, 0, "E");
    assert!(e.iter().all(|v| close(*v, 2.0, 1e-6)));
    let z = col(data(&r, "lor"), 0, "z");
    assert!(z.iter().cloned().fold(0.0, f64::max) > 30.0);
    assert!(close(scalar(&r, "rk4", "x (end)"), (-1.0f64).exp(), 1e-7));
}

#[test]
fn ode_with_an_input_signal() {
    // x' = −x + u with u = 1 (a step from a source): x → 1 − e^{−t}.
    let r = run(json!({
        "nodes": [
            node("u", "source.signal", json!({ "waveform": "dc", "fs": 100, "duration": 5 })),
            node("sys", "dyn.ode", json!({ "equations": "x' = -x + u", "tEnd": 5, "dt": 0.05 })),
        ],
        "links": [link_port("u", "sys", "u")],
    }));
    assert!(close(scalar(&r, "sys", "x (end)"), 1.0 - (-5.0f64).exp(), 1e-5));
}

#[test]
fn control_step_bode_pid_statespace() {
    let r = run(json!({
        "nodes": [
            node("step", "ctrl.step", json!({ "num": "1", "den": "1, 0.6, 1", "tEnd": 30, "dt": 0.001 })),
            node("imp", "ctrl.step", json!({ "num": "1", "den": "1, 1", "input": "impulse", "tEnd": 5, "dt": 0.01 })),
            node("bode", "ctrl.bode", json!({ "num": "1", "den": "1, 3, 3, 1", "from": 0.01, "to": 100, "points": 4000 })),
            node("pid", "ctrl.pid", json!({ "num": "1", "den": "1, 3, 3, 1", "kp": 2, "ki": 1, "kd": 1, "tEnd": 40, "dt": 0.005 })),
            node("ss", "ctrl.statespace", json!({ "A": "0 1; -2 -3", "B": "0; 1", "C": "1 0", "input": "step", "tEnd": 10, "dt": 0.01 })),
        ],
        "links": [],
    }));
    let os = scalar(&r, "step", "overshoot");
    let expected = (-std::f64::consts::PI * 0.3 / (1.0f64 - 0.09).sqrt()).exp() * 100.0;
    assert!(close(os, expected, 0.1), "overshoot {os} vs {expected}");
    // Impulse of 1/(s+1) = e^{−t}.
    let y = col(data(&r, "imp"), 0, "y");
    assert!(close(y[100], (-1.0f64).exp(), 1e-6));
    // 1/(s+1)³: phase −180° at ω = √3, |G| = 1/8 → GM = 18.06 dB.
    let gm = scalar(&r, "bode", "gain margin");
    assert!(close(gm, 20.0 * 8f64.log10(), 0.02), "gm {gm}");
    assert!(close(scalar(&r, "bode", "phase crossover"), 3f64.sqrt(), 0.01));
    assert!(close(scalar(&r, "bode", "Z-N Kp"), 0.6 * 8.0, 0.02));
    assert_eq!(data(&r, "bode").tables[1].name, "nyquist");
    // PID with integral action: no steady-state error.
    assert!(scalar(&r, "pid", "steady-state error").abs() < 1e-3);
    assert!(scalar(&r, "pid", "IAE") > 0.0);
    // ss: DC gain 1/2, eigenvalues −1, −2, full rank.
    assert!(close(scalar(&r, "ss", "DC gain (y1)"), 0.5, 1e-12));
    assert!(close(*col(data(&r, "ss"), 0, "y1").last().unwrap(), 0.5, 1e-3));
    assert_eq!(scalar(&r, "ss", "controllability rank"), 2.0);
    assert_eq!(scalar(&r, "ss", "stable"), 1.0);
}

#[test]
fn statistics_and_regression() {
    let r = run(json!({
        "nodes": [
            node("data", "source.function", json!({ "from": 0, "to": 10, "points": 101, "expression": "y = 3 + 2*x - 0.5*x^2\ne = 1.5*exp(0.3*x)\np = 2*x^1.5\nl = 1 + 3*ln(x + 1)" })),
            node("poly", "stat.regression", json!({ "model": "polynomial", "degree": 2, "y": "y" })),
            node("expo", "stat.regression", json!({ "model": "exponential", "y": "e" })),
            node("pow", "stat.regression", json!({ "model": "power", "y": "p" })),
            node("multi", "stat.regression", json!({ "model": "multiple", "y": "y", "x": "x, e" })),
            node("desc", "stat.describe", json!({})),
            node("corr", "stat.correlation", json!({ "method": "spearman" })),
            node("rnd", "source.random", json!({ "distribution": "normal", "p1": 5, "p2": 2, "count": 50000, "seed": 1 })),
            node("hist", "stat.histogram", json!({ "bins": 40 })),
        ],
        "links": [link("data", "poly"), link("data", "expo"), link("data", "pow"), link("data", "multi"), link("data", "desc"), link("data", "corr"), link("rnd", "hist")],
    }));
    let coefs = col(data(&r, "poly"), 2, "value");
    assert!(close(coefs[0], 3.0, 1e-9) && close(coefs[1], 2.0, 1e-9) && close(coefs[2], -0.5, 1e-9), "{coefs:?}");
    assert!(close(scalar(&r, "poly", "R²"), 1.0, 1e-12));
    assert!(close(scalar(&r, "expo", "coef 1"), 0.3, 1e-9));
    assert!(close(scalar(&r, "pow", "coef 0"), 2.0, 1e-9));
    assert!(scalar(&r, "multi", "R²") > 0.9);
    assert_eq!(col(data(&r, "desc"), 0, "n")[0], 101.0);
    assert!(close(col(data(&r, "desc"), 0, "mean")[0], 3.0 + 2.0 * 5.0 - 0.5 * 33.5, 1e-9));
    assert!(close(scalar(&r, "hist", "mean"), 5.0, 0.05));
    assert!(close(scalar(&r, "hist", "std"), 2.0, 0.05));
    assert!(scalar(&r, "hist", "KS distance to normal") < scalar(&r, "hist", "KS 5% critical value"));
    let g = &data(&r, "corr").grids[0];
    assert_eq!(g.x_names.as_ref().unwrap().len(), 4);
}

#[test]
fn machine_learning() {
    // Three blobs → k-means; a noisy curve → MLP; correlated columns → PCA.
    let r = run(json!({
        "nodes": [
            node("n", "source.random", json!({ "distribution": "normal", "p1": 0, "p2": 0.3, "count": 600, "columns": 2, "seed": 4 })),
            node("blobs", "data.expression", json!({ "expressions": "cls = floor(i / 200)\nx = x1 + 4*(cls == 1) - 4*(cls == 2)\ny = x2 + 4*(cls == 2)" })),
            node("km", "ml.kmeans", json!({ "columns": "x, y", "k": 3 })),
            node("pca", "ml.pca", json!({ "columns": "x, y", "components": 2 })),
            node("cls", "ml.mlp", json!({ "features": "x, y", "target": "cls", "task": "classification", "hidden": "8", "epochs": 60, "learningRate": 0.02, "seed": 2 })),
            node("curve", "source.function", json!({ "from": -3, "to": 3, "points": 300, "expression": "y = sin(x)" })),
            node("reg", "ml.mlp", json!({ "features": "x", "target": "y", "hidden": "16, 16", "epochs": 400, "learningRate": 0.01, "seed": 5 })),
        ],
        "links": [link("n", "blobs"), link("blobs", "km"), link("blobs", "pca"), link("blobs", "cls"), link("curve", "reg")],
    }));
    assert!(scalar(&r, "km", "silhouette") > 0.7);
    let sizes = col(data(&r, "km"), 1, "size");
    assert!(sizes.iter().all(|s| (*s - 200.0).abs() < 10.0), "{sizes:?}");
    assert!(scalar(&r, "pca", "PC1+PC2 explain") > 99.99);
    assert!(scalar(&r, "cls", "test accuracy") > 95.0);
    assert!(data(&r, "cls").grids.iter().any(|g| g.name == "confusion"));
    assert!(scalar(&r, "reg", "train R²") > 0.98, "{}", scalar(&r, "reg", "train R²"));
}

#[test]
fn monte_carlo_and_processes() {
    let r = run(json!({
        "nodes": [
            node("mc", "mc.simulate", json!({
                "model": "a ~ normal(10, 0.1)\nb ~ normal(20, 0.2)\nc ~ uniform(-0.1, 0.1)\ngap = b - a + c",
                "samples": 200000, "seed": 7, "condition": "gap < 9.7",
            })),
            node("lhs", "mc.simulate", json!({ "model": "u ~ uniform(0, 1)\nv = u", "samples": 1000, "sampling": "lhs" })),
            node("gbm", "mc.process", json!({ "process": "gbm", "paths": 4000, "steps": 100, "x0": 100, "mu": 0.1, "sigma": 0.2, "horizon": 1, "seed": 2 })),
            node("ou", "mc.process", json!({ "process": "ou", "paths": 2000, "steps": 200, "x0": 5, "mu": 0, "theta": 2, "sigma": 1, "horizon": 5 })),
        ],
        "links": [],
    }));
    // gap ~ N(10, √(0.1² + 0.2² + 0.2²/12)).
    let sd = (0.01f64 + 0.04 + 0.04 / 12.0).sqrt();
    assert!(close(scalar(&r, "mc", "mean gap"), 10.0, 0.002));
    assert!(close(scalar(&r, "mc", "std gap"), sd, 0.002));
    let p = scalar(&r, "mc", "P(condition)") / 100.0;
    let expected = sim_core::rng::normal_cdf((9.7 - 10.0) / sd);
    assert!(close(p, expected, 0.002), "{p} vs {expected}");
    // Rank correlation: b dominates.
    let sens = &data(&r, "mc").tables.iter().find(|t| t.name == "sensitivity").unwrap();
    let share = &sens.column("share of variance").unwrap().values;
    assert!(share[1] > share[0] && share[0] > share[2]);
    // LHS of a uniform: the mean is 0.5 almost exactly.
    assert!(close(scalar(&r, "lhs", "mean v"), 0.5, 1e-3));
    assert!(close(scalar(&r, "gbm", "mean final"), 100.0 * 0.1f64.exp(), 1.5));
    assert!(close(scalar(&r, "ou", "mean final"), 0.0, 0.05));
}

#[test]
fn optimisation_fit_and_sweep() {
    let r = run(json!({
        "nodes": [
            node("nm", "opt.minimize", json!({ "variables": "x: -2 .. 2 = -1\ny: -1 .. 3 = 2", "objective": "(1 - x)^2 + 100*(y - x^2)^2", "method": "nelderMead", "maxIterations": 5000 })),
            node("de", "opt.minimize", json!({ "variables": "x: -5 .. 5\ny: -5 .. 5", "objective": "(x - 1)^2 + (y - 2)^2", "constraints": "x + y <= 2", "method": "de", "maxIterations": 500, "seed": 1 })),
            node("max", "opt.minimize", json!({ "variables": "x: 0 .. 3", "objective": "x*exp(-x)", "goal": "maximize", "method": "bfgs" })),
            node("noisy", "source.function", json!({ "from": 0, "to": 5, "points": 200, "expression": "y = 3*exp(-0.7*x) + 0.5" })),
            node("fit", "opt.fit", json!({ "model": "a*exp(-b*x) + c", "parameters": "a = 1, b = 1, c = 0" })),
            node("plant", "ctrl.step", json!({ "num": "1", "den": "1, 0.4, 1", "tEnd": 30, "dt": 0.01 })),
            node("sw", "opt.sweep", json!({ "node": "plant", "param": "den", "values": "", "from": 0, "to": 1, "steps": 3, "metricNode": "plant", "metric": "overshoot" })),
        ],
        "links": [link("noisy", "fit")],
    }));
    assert!(close(scalar(&r, "nm", "x"), 1.0, 1e-3) && close(scalar(&r, "nm", "y"), 1.0, 2e-3));
    // Constrained optimum: projection of (1, 2) onto x + y = 2 → (0.5, 1.5).
    assert!(close(scalar(&r, "de", "x"), 0.5, 5e-3) && close(scalar(&r, "de", "y"), 1.5, 5e-3), "{} {}", scalar(&r, "de", "x"), scalar(&r, "de", "y"));
    assert!(close(scalar(&r, "max", "x"), 1.0, 1e-3));
    assert!(close(scalar(&r, "max", "optimum"), (-1.0f64).exp(), 1e-6));
    assert!(close(scalar(&r, "fit", "a"), 3.0, 1e-6) && close(scalar(&r, "fit", "b"), 0.7, 1e-6) && close(scalar(&r, "fit", "c"), 0.5, 1e-6));
    // The sweep sets "den" to a number (a 0th-order plant) — every run still yields a value or a warning, never a crash.
    assert!(r.node("sw").unwrap().ok || r.node("sw").unwrap().error.is_some());
}

#[test]
fn sweep_of_damping_reduces_overshoot() {
    let r = run(json!({
        "nodes": [
            node("pid", "ctrl.pid", json!({ "num": "1", "den": "1, 2, 1", "kp": 4, "ki": 2, "kd": 0, "tEnd": 30, "dt": 0.01 })),
            node("sw", "opt.sweep", json!({ "node": "pid", "param": "kd", "from": 0, "to": 3, "steps": 4, "metricNode": "pid", "metric": "overshoot" })),
            node("sw2", "opt.sweep", json!({ "node": "pid", "param": "kp", "values": "1, 2", "node2": "pid", "param2": "ki", "2values": "0.5, 1, 1.5", "metricNode": "pid", "metric": "y", "aggregate": "max" })),
        ],
        "links": [],
    }));
    let m = col(data(&r, "sw"), 0, "pid · overshoot");
    assert_eq!(m.len(), 4);
    assert!(m[0] > m[3], "more derivative should damp the overshoot: {m:?}");
    let g = &data(&r, "sw2").grids[0];
    assert_eq!((g.x.len(), g.y.len(), g.z.len()), (2, 3, 6));
}

#[test]
fn outputs_kpi_and_plot() {
    let r = run(json!({
        "nodes": [
            node("s", "source.signal", json!({ "waveform": "sine", "frequency": 1, "amplitude": 3, "fs": 100, "duration": 2 })),
            node("plot", "out.plot", json!({ "chart": "line" })),
            node("kpi", "out.kpi", json!({ "source": "y", "aggregate": "max", "label": "peak", "high": 2.5 })),
            node("kpi2", "out.kpi", json!({ "source": "fs", "label": "rate" })),
        ],
        "links": [link("s", "plot"), link("s", "kpi"), link("s", "kpi2")],
    }));
    assert_eq!(data(&r, "plot").tables[0].rows(), 201);
    assert!(close(scalar(&r, "kpi", "peak"), 3.0, 1e-9));
    assert_eq!(scalar(&r, "kpi", "status"), 2.0);
    assert_eq!(scalar(&r, "kpi2", "rate"), 100.0);
}

#[test]
fn failures_are_contained_and_reported() {
    let r = run(json!({
        "nodes": [
            node("bad", "data.expression", json!({ "expressions": "z = nope + 1" })),
            node("src", "source.function", json!({ "expression": "y = x" })),
            node("after", "stat.describe", json!({})),
            node("py", "io.python", json!({ "code": "out = data" })),
            node("off", "signal.fft", json!({})),
        ],
        "links": [link("src", "bad"), link("bad", "after"), link("src", "py")],
    }));
    let bad = r.node("bad").unwrap();
    assert!(!bad.ok && bad.error.as_ref().unwrap().contains("unknown name nope"));
    let after = r.node("after").unwrap();
    assert!(after.skipped && after.error.as_ref().unwrap().contains("an input failed"));
    // The browser host refuses external programs with a readable message.
    assert!(r.node("py").unwrap().error.as_ref().unwrap().contains("desktop app"));
    assert!(r.node("off").unwrap().error.as_ref().unwrap().contains("connect the input"));
    assert!(r.node("src").unwrap().ok);
    let problems = validate(&json!({ "nodes": [node("a", "signal.fft", json!({}))], "links": [] }).to_string());
    assert!(problems.iter().any(|p| p.contains("not connected")));
}

#[test]
fn disabled_node_passes_its_input_through() {
    let mut model = json!({
        "nodes": [
            node("s", "source.function", json!({ "expression": "y = x" })),
            node("f", "data.filter", json!({ "condition": "y > 5" })),
            node("d", "stat.describe", json!({})),
        ],
        "links": [link("s", "f"), link("f", "d")],
    });
    model["nodes"][1]["disabled"] = json!(true);
    let r = run(model);
    assert_eq!(col(data(&r, "d"), 0, "n")[0], 201.0);
}

struct FakeHost;
impl Host for FakeHost {
    fn read_file(&self, path: &str) -> Result<String, String> {
        assert_eq!(path, "data.csv");
        Ok("a,b\n1,2\n3,4\n".into())
    }
    fn write_file(&self, _path: &str, text: &str) -> Result<(), String> {
        assert!(text.starts_with("a,b"));
        Ok(())
    }
    fn external(&self, call: &sim_core::ExternalCall, _cancel: &dyn Fn() -> bool) -> Result<sim_core::ExternalOutput, String> {
        assert!(call.input_csv.starts_with("a,b"), "{}", call.input_csv);
        assert!(!call.input_csv.contains('('), "units in the header: {}", call.input_csv);
        Ok(sim_core::ExternalOutput { csv: "s\n3\n7\n".into(), stdout: "hello\n@result total = 10\n".into(), stderr: String::new() })
    }
}

#[test]
fn host_services() {
    let r = run_with(json!({
        "nodes": [
            node("rd", "io.readFile", json!({ "path": "data.csv" })),
            node("wr", "io.writeFile", json!({ "path": "out.csv" })),
            node("py", "io.python", json!({ "code": "out['s'] = [a + b for a, b in zip(data['a'], data['b'])]" })),
            node("cmd", "io.command", json!({ "program": "tool", "arguments": "{in} {out}" })),
        ],
        "links": [link("rd", "wr"), link("rd", "py"), link("rd", "cmd")],
    }), &FakeHost);
    assert_eq!(data(&r, "rd").tables[0].rows(), 2);
    assert_eq!(col(data(&r, "py"), 0, "s"), &[3.0, 7.0]);
    assert_eq!(scalar(&r, "py", "total"), 10.0);
    assert_eq!(data(&r, "py").text, "hello");
    assert!(r.node("cmd").unwrap().ok);
}

#[test]
fn encoded_bytes_round_trip_the_header() {
    let text = json!({ "name": "enc", "nodes": [node("s", "source.function", json!({ "expression": "y = x", "points": 11 }))], "links": [] }).to_string();
    let bytes = sim_core::run(&text, &mut |_| {}, &|| false, &NoHost);
    let header = sim_core::result::decode_header(&bytes).unwrap();
    assert_eq!(header["ok"], json!(true));
    let col = &header["nodes"][0]["tables"][0]["columns"][1];
    assert_eq!(col["length"], json!(11));
    let len = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    let start = (8 + len + 7) / 8 * 8;
    let offset = col["offset"].as_u64().unwrap() as usize;
    let at = start + (offset + 10) * 8;
    let v = f64::from_le_bytes(bytes[at..at + 8].try_into().unwrap());
    assert_eq!(v, 10.0);
}

#[test]
fn every_catalogue_type_is_known() {
    // The frontend catalogue (src/core/catalog.js) must list exactly these.
    let kinds: Vec<&str> = sim_core::nodes::SPECS.iter().map(|s| s.kind).collect();
    assert_eq!(kinds.len(), 65);
    let mut sorted = kinds.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), kinds.len());
}

#[test]
fn block_diagrams_with_feedback() {
    let r = run(json!({
        "nodes": [
            // y' = -y via a feedback loop through an integrator: y = e^{-t}.
            node("decay", "dyn.blocks", json!({ "diagram": "y = integrator(-y, x0 = 1)", "tEnd": 2, "dt": 0.01 })),
            // Unity feedback around 1/(s(s+1)) with gain 1: the closed loop 1/(s²+s+1), ζ = 0.5 → 16.3 % overshoot.
            node("loop", "dyn.blocks", json!({ "diagram": "r = step(t0 = 0)\ne = r - y\ny = tf(e, num = [1], den = [1, 1, 0])", "tEnd": 30, "dt": 0.005, "measure": "y" })),
            // PID with saturation on a first-order plant: no steady-state error.
            node("pid", "dyn.blocks", json!({ "diagram": "r = step(t0 = 1, a = 2)\nu = pid(r - y, kp = 3, ki = 2, umin = -5, umax = 5)\ny = tf(u, num = [1], den = [2, 1])", "tEnd": 20, "dt": 0.01 })),
            // A transport delay and a unit delay.
            node("delays", "dyn.blocks", json!({ "diagram": "s = ramp(slope = 1)\nd = delay(s, t = 0.5)\nz = unitdelay(s, ts = 0.1)\nq = zoh(s, ts = 0.25)", "tEnd": 2, "dt": 0.01 })),
            node("algebraic", "dyn.blocks", json!({ "diagram": "a = 2*b\nb = a + 1" })),
            node("relay", "dyn.blocks", json!({ "diagram": "x = sine(f = 1)\nr = relay(x, on = 0.5, off = -0.5, high = 1, low = -1)", "tEnd": 1, "dt": 0.001 })),
        ],
        "links": [],
    }));
    let y = col(data(&r, "decay"), 0, "y");
    assert!(close(*y.last().unwrap(), (-2.0f64).exp(), 1e-8), "{}", y.last().unwrap());
    let os = scalar(&r, "loop", "overshoot");
    let expected = (-std::f64::consts::PI * 0.5 / 0.75f64.sqrt()).exp() * 100.0;
    assert!(close(os, expected, 0.1), "overshoot {os} vs {expected}");
    assert!(close(scalar(&r, "pid", "y (end)"), 2.0, 1e-3));
    let d = data(&r, "delays");
    let dcol = col(d, 0, "d");
    assert!(close(dcol[100], 0.5, 1e-6), "delay at t = 1: {}", dcol[100]); // s(1 − 0.5)
    assert!(close(col(d, 0, "z")[100], 0.9, 1e-6), "unit delay {}", col(d, 0, "z")[100]);
    assert!(close(col(d, 0, "q")[110], 1.0, 1e-6), "zoh {}", col(d, 0, "q")[110]);
    let err = r.node("algebraic").unwrap().error.clone().unwrap();
    assert!(err.contains("algebraic loop"), "{err}");
    let relay = col(data(&r, "relay"), 0, "r");
    assert_eq!(relay[100], 1.0); // sin(2π·0.1) = 0.59 ≥ 0.5
    assert_eq!(relay[300], 1.0); // falling but above −0.5: still on (hysteresis)
    assert_eq!(relay[700], -1.0);
}

#[test]
fn discrete_event_queues_match_theory() {
    let r = run(json!({
        "nodes": [
            // M/M/1 with λ = 0.8, μ = 1: Wq = ρ/(μ − λ) = 4, utilization 80 %.
            node("mm1", "des.process", json!({ "model": "source a: interval = exponential(1.25)\nstation s: servers = 1, time = exponential(1)\nsink out\nroute a -> s\nroute s -> out", "tEnd": 200000, "seed": 3 })),
            // Routing by probability and a full queue losing entities.
            node("net", "des.process", json!({ "model": "source a: interval = 1, count = 10000\nstation s: servers = 1, time = 0.5\nsink good\nsink bad\nroute a -> s\nroute s -> good 0.7, bad 0.3", "tEnd": 20000 })),
            node("full", "des.process", json!({ "model": "source a: interval = 0.5\nstation s: servers = 1, time = 1, capacity = 3\nsink out\nroute a -> s\nroute s -> out", "tEnd": 1000 })),
            node("bad", "des.process", json!({ "model": "source a: interval = 1\nstation s: time = 1\nroute a -> s" })),
        ],
        "links": [],
    }));
    let wait = scalar(&r, "mm1", "s mean wait");
    let util = scalar(&r, "mm1", "s utilization");
    assert!(close(wait, 4.0, 0.25), "M/M/1 wait {wait}");
    assert!(close(util, 80.0, 1.0), "utilization {util}");
    let sinks = &data(&r, "net").tables[2];
    let counts = &sinks.column("count").unwrap().values;
    assert!(close(counts[0] / (counts[0] + counts[1]), 0.7, 0.02), "{counts:?}");
    assert!(close(scalar(&r, "net", "s mean wait"), 0.0, 1e-12), "deterministic service never waits");
    let lost = data(&r, "full").tables[0].column("lost").unwrap().values[0];
    assert!(lost > 900.0, "lost {lost}");
    assert!(r.node("bad").unwrap().error.as_ref().unwrap().contains("no route"));
}

#[test]
fn spice_circuits_match_circuit_theory() {
    let r = run(json!({
        "nodes": [
            node("div", "circuit.spice", json!({ "netlist": "V1 in 0 DC 10\nR1 in out 3k\nR2 out 0 1k\n.op" })),
            node("rc", "circuit.spice", json!({ "netlist": "V1 in 0 PULSE(0 1 0 1n 1n 1 2) AC 1\nR1 in out 1k\nC1 out 0 1u\n.tran 1u 5m\n.ac dec 50 10 100k" })),
            node("diode", "circuit.spice", json!({ "netlist": "V1 a 0 5\nR1 a k 1k\nD1 k 0 IS=1e-14\n.op\n.dc V1 0 5 0.5" })),
            node("inv", "circuit.spice", json!({ "netlist": "Vin in 0 DC 0.2\nR1 in m 1k\nR2 m out 10k\nE1 out 0 0 m 1e6\n.op" })),
            node("rlc", "circuit.spice", json!({ "netlist": "V1 in 0 AC 1\nR1 in a 10\nL1 a b 10m\nC1 b 0 1u\n.ac dec 200 100 100k", "probes": "b" })),
            node("lc", "circuit.spice", json!({ "netlist": "L1 a 0 1m\nC1 a 0 1u IC=1\n.tran 1u 2m UIC" })),
            node("bad", "circuit.spice", json!({ "netlist": "V1 a 0 1\nR1 b c 1k" })),
            node("wave", "source.table", json!({ "data": "t,v\n0,0\n0.001,2\n0.01,2\n" })),
            node("driven", "circuit.spice", json!({ "netlist": "V1 in 0 INPUT(v)\nR1 in out 1k\nC1 out 0 1u\n.tran 10u 10m" })),
        ],
        "links": [link("wave", "driven")],
    }));
    assert!(close(scalar(&r, "div", "V(out)"), 2.5, 1e-6), "div {:?}", data(&r, "div").scalars);
    assert!(close(scalar(&r, "div", "I(v1)"), -2.5e-3, 1e-9), "{}", scalar(&r, "div", "I(v1)"));
    // RC charging: v(1 ms) = 1 − e^{−1}.
    let tr = &data(&r, "rc").tables[0];
    assert_eq!(tr.name, "transient");
    let v = &tr.column("V(out)").unwrap().values;
    assert!(close(v[1000], 1.0 - (-1.0f64).exp(), 2e-3), "rc {}", v[1000]);
    let f3 = scalar(&r, "rc", "−3 dB frequency");
    assert!(close(f3, 1.0 / (2.0 * std::f64::consts::PI * 1e-3), 6.0), "f3 {f3}");
    // Diode: V_D = n·V_T·ln(I/Is) with I ≈ (5 − 0.69)/1k.
    let vd = scalar(&r, "diode", "V(k)");
    let i = (5.0 - vd) / 1000.0;
    assert!(close(vd, 0.025852 * (i / 1e-14).ln(), 1e-4), "vd {vd}");
    let sweep = &data(&r, "diode").tables.iter().find(|t| t.name == "dc sweep").unwrap().column("V(k)").unwrap().values;
    assert!(sweep[0].abs() < 1e-6 && sweep[10] > 0.6);
    // A source driven by an input column: the ramp to 2 V settles on the capacitor.
    let dv = &data(&r, "driven").tables[0].column("V(out)").unwrap().values;
    assert!(close(*dv.last().unwrap(), 2.0, 1e-3), "driven {}", dv.last().unwrap());
    assert!(dv[50] < 1.0, "driven early {}", dv[50]);
    // Inverting amplifier: −R2/R1 · Vin = −2 V.
    assert!(close(scalar(&r, "inv", "V(out)"), -2.0, 1e-4));
    // Series RLC: resonance at 1/(2π√LC) ≈ 1591.5 Hz, the capacitor voltage peaks there (Q = 10).
    let ac = &data(&r, "rlc").tables[0];
    let f = &ac.x_column().unwrap().values;
    let db = &ac.column("V(b) dB").unwrap().values;
    let peak = (0..db.len()).max_by(|&a, &b| db[a].partial_cmp(&db[b]).unwrap()).unwrap();
    assert!(close(f[peak], 1591.5, 25.0), "resonance {}", f[peak]);
    assert!(close(db[peak], 20.0, 0.5), "Q peak {}", db[peak]);
    // LC tank with an initial 1 V: v = cos(t/√LC), period 2π√LC = 0.1987 ms.
    let lc = &data(&r, "lc").tables[0].column("V(a)").unwrap().values;
    let quarter = (std::f64::consts::PI / 2.0 * (1e-3f64 * 1e-6).sqrt() / 1e-6).round() as usize;
    assert!(lc[quarter].abs() < 0.03, "lc at a quarter period {}", lc[quarter]);
    assert!(lc.iter().cloned().fold(0.0, f64::max) < 1.01, "trapezoidal keeps the energy");
    assert!(r.node("bad").unwrap().warnings[0].contains("floating nodes b, c"), "{:?}", r.node("bad").unwrap().warnings);
}

#[test]
fn digital_logic_counts_and_adds() {
    let r = run(json!({
        "nodes": [
            node("adder", "circuit.logic", json!({ "mode": "truth", "circuit": "inputs a b cin: binary\nsum = a ^ b ^ cin\ncout = a & b | cin & (a ^ b)\nbus total = cout sum" })),
            node("cnt", "circuit.logic", json!({ "circuit": "clock clk: period = 10\ninput rst: 1@0, 0@3\nc[4] = counter(clk, rst)\nbus n = c\nq, qn = dff(c3, clk, rst)\nt1 = tff(1, clk)", "tEnd": 400, "delay": 0 })),
            node("sr", "circuit.logic", json!({ "circuit": "clock clk: period = 10\ninput din: 1101, step = 10\ns[4] = shift(din, clk)\nbus v = s", "tEnd": 45, "delay": 0 })),
            node("loop", "circuit.logic", json!({ "circuit": "x = ~x", "tEnd": 50, "delay": 5 })),
            node("bad", "circuit.logic", json!({ "circuit": "y = a & b" })),
        ],
        "links": [],
    }));
    // Full adder: total = a + b + cin for every row.
    let tt = &data(&r, "adder").tables[0];
    assert_eq!(tt.rows(), 8);
    for row in 0..8 {
        let bits = ["a", "b", "cin"].map(|c| tt.column(c).unwrap().values[row]);
        assert_eq!(tt.column("total").unwrap().values[row], bits.iter().sum::<f64>(), "row {row}");
    }
    assert!(data(&r, "adder").text.contains("sum = Σm(1, 2, 4, 7)"), "{}", data(&r, "adder").text);
    // A 4-bit counter: bit k toggles at f_clk / 2^(k+1); edges at 10 … 400 ns after the reset → 40 mod 16 = 8.
    let st = data(&r, "cnt").tables.iter().find(|t| t.name == "signals").unwrap();
    let sigs = st.column("signal").unwrap().labels.clone().unwrap();
    let f = |name: &str| st.column("frequency").unwrap().values[sigs.iter().position(|s| s == name).unwrap()];
    assert!(close(f("c0"), 1.0 / 20.0, 1e-9), "c0 {}", f("c0"));
    assert!(close(f("c2"), 1.0 / 80.0, 1e-9), "c2 {}", f("c2"));
    assert!(close(f("t1"), 1.0 / 20.0, 1e-9));
    assert_eq!(scalar(&r, "cnt", "n (end)"), 8.0);
    // Shift register, edges at 0 … 40 with din 1,1,0,1,1 (bit0 newest): s3 s2 s1 s0 = 1 0 1 1 → 11.
    assert_eq!(scalar(&r, "sr", "v (end)"), 11.0);
    // A ring of one inverter oscillates with period 2·delay.
    assert!(close(scalar(&r, "loop", "events"), 10.0, 1.0), "loop {}", scalar(&r, "loop", "events"));
    let bad = r.nodes.iter().find(|n| n.id == "bad").unwrap().error.clone().unwrap_or_default();
    assert!(bad.contains("not driven"), "{bad}");
}

#[test]
fn finite_elements_match_analytic_solutions() {
    let r = run(json!({
        "nodes": [
            node("lin", "fem.field", json!({ "physics": "heat", "model": "domain: width = 1, height = 0.5, nx = 10, ny = 4\nmaterial: k = 2\nleft: T = 100\nright: T = 0\nprobe mid: 0.5, 0.25" })),
            node("src", "fem.field", json!({ "physics": "heat", "model": "domain: width = 1, height = 0.2, nx = 8, ny = 2\nmaterial: k = 1, q = 1000\nleft: T = 0\nright: T = 0\nprobe mid: 0.5, 0.1" })),
            node("conv", "fem.field", json!({ "physics": "heat", "model": "domain: width = 1, height = 0.2, nx = 8, ny = 2\nmaterial: k = 1\nleft: T = 100\nright: convection h = 10, Tinf = 20\nprobe end: 1, 0.1" })),
            node("cap", "fem.field", json!({ "physics": "electrostatics", "model": "domain: width = 0.1, height = 0.01, nx = 10, ny = 2\nmaterial: epsr = 4\nbottom: V = 0\ntop: V = 10" })),
            node("bar", "fem.field", json!({ "physics": "elasticity", "model": "domain: width = 1, height = 0.2, nx = 10, ny = 2\nmaterial: E = 200e9, nu = 0.3\nleft: ux = 0\nbottom: uy = 0\nright: traction tx = 1e8" })),
            node("beam", "fem.field", json!({ "physics": "elasticity", "model": "domain: width = 1, height = 0.1, nx = 40, ny = 4\nmaterial: E = 200e9, nu = 0.3\nleft: fixed\nright: traction ty = -1e4\nprobe tip: 1, 0.05" })),
            node("hole", "fem.field", json!({ "physics": "heat", "model": "domain: width = 1, height = 0.5, nx = 20, ny = 10\nhole bore: circle 0.5 0.25 0.1\nbore: T = 200\nleft: T = 0" })),
            node("tr", "fem.field", json!({ "physics": "transient", "tEnd": 2, "steps": 200, "T0": 0, "model": "domain: width = 1, height = 0.1, nx = 10, ny = 1\nmaterial: k = 1, rho = 1, c = 1\nleft: T = 100\nright: T = 0\nprobe mid: 0.5, 0.05" })),
            node("kirsch", "fem.field", json!({ "physics": "elasticity", "model": "domain: width = 1, height = 0.5, nx = 80, ny = 40\nmaterial: E = 200e9, nu = 0.3\nhole bore: circle 0.5 0.25 0.05\nleft: ux = 0\nbottom: uy = 0\nright: traction tx = 50e6" })),
            node("loose", "fem.field", json!({ "physics": "elasticity", "model": "right: traction tx = 1" })),
        ],
        "links": [],
    }));
    // Linear conduction: T(mid) = 50, heat flow k·ΔT/L·H = 100 W/m.
    assert!(close(scalar(&r, "lin", "T(mid)"), 50.0, 1e-6));
    assert!(close(scalar(&r, "lin", "heat in (left)"), 100.0, 1e-6), "{:?}", data(&r, "lin").scalars);
    assert!(close(scalar(&r, "lin", "heat in (right)"), -100.0, 1e-6));
    // Uniform source between two cold ends: T max = qL²/8k = 125.
    assert!(close(scalar(&r, "src", "T(mid)"), 125.0, 1e-6), "src {}", scalar(&r, "src", "T(mid)"));
    // Wall with convection: q = ΔT / (L/k + 1/h).
    let q = 80.0 / 1.1;
    assert!(close(scalar(&r, "conv", "T(end)"), 100.0 - q, 1e-6));
    assert!(close(scalar(&r, "conv", "heat in (left)"), q * 0.2, 1e-6));
    assert!(close(scalar(&r, "conv", "heat in (right)"), -q * 0.2, 1e-6));
    // Parallel plates: C = ε0 εr w / d per metre of depth.
    let c = 8.8541878128e-12 * 4.0 * 0.1 / 0.01;
    assert!(close(scalar(&r, "cap", "capacitance"), c, c * 1e-9), "cap {}", scalar(&r, "cap", "capacitance"));
    // Bar in tension: u = σL/E, von Mises = σ, reaction = −σ·A.
    assert!(close(scalar(&r, "bar", "ux max"), 5e-4, 1e-12));
    assert!(close(scalar(&r, "bar", "von Mises max"), 1e8, 1e2));
    assert!(close(scalar(&r, "bar", "reaction x (left)"), -2e7, 1.0));
    // Cantilever with a 1 kN end load: Timoshenko δ = PL³/3EI + PL/κGA ≈ 2.016e-5 m.
    let i = 0.1f64.powi(3) / 12.0;
    let g = 200e9 / (2.0 * 1.3);
    let delta = 1000.0 / (3.0 * 200e9 * i) + 1000.0 / (5.0 / 6.0 * g * 0.1);
    let tip = -scalar(&r, "beam", "uy(tip)");
    assert!((tip - delta).abs() / delta < 0.03, "tip {tip} vs {delta}");
    assert!(close(scalar(&r, "beam", "reaction y (left)"), 1000.0, 1.0), "{}", scalar(&r, "beam", "reaction y (left)"));
    // A hole boundary takes its own condition; the hot bore heats the plate.
    assert!(close(scalar(&r, "hole", "T max"), 200.0, 1e-9));
    assert!(scalar(&r, "hole", "heat in (bore)") > 0.0);
    assert!(data(&r, "hole").grids[0].z.iter().any(|v| v.is_nan()), "the hole is not empty");
    // Transient conduction settles to the linear profile (time constant L²/π² ≈ 0.1 s).
    assert!(close(scalar(&r, "tr", "T(mid)"), 50.0, 0.05), "tr {}", scalar(&r, "tr", "T(mid)"));
    let hist = data(&r, "tr").tables.iter().find(|t| t.name == "history").unwrap();
    assert!(hist.column("T(mid)").unwrap().values[5] < 30.0);
    // A small hole in a plate under tension: the edge stress is about 3 × the far field (≈ 3.1 here).
    let k = scalar(&r, "kirsch", "von Mises max") / 50e6;
    assert!((2.9..3.3).contains(&k), "Kirsch {k}");
    let loose = r.node("loose").unwrap().error.clone().unwrap_or_default();
    assert!(loose.contains("hold the body"), "{loose}");
}

#[test]
fn robots_sense_drive_and_swing() {
    let r = run(json!({
        "nodes": [
            node("scan", "robot.mobile", json!({ "world": "arena: width = 5, height = 8\nrobot: x = 1, y = 2, heading = 0\nlidar: rays = 3, fov = 180, range = 10", "controller": "v = 0\nw = 0", "tEnd": 0.1 })),
            node("goal", "robot.mobile", json!({ "world": "arena: width = 10, height = 8\ngoal: 8 6\nrobot: x = 1, y = 1, heading = 0, wmax = 4", "controller": "v = min(vmax, goal_dist)\nw = 4*goal_angle", "tEnd": 40 })),
            node("crash", "robot.mobile", json!({ "world": "arena: width = 4, height = 4\nrobot: x = 1, y = 2, radius = 0.2", "controller": "v = 1\nw = 0\nn = n + bump", "tEnd": 6 })),
            node("avoid", "robot.mobile", json!({ "world": "arena: width = 10, height = 8\nbox: 3.5 2 4.5 6\ncircle: 6.5 4.5 0.7\nwall: 7 1 7 3\ngoal: 9 6.5\nrobot: x = 1, y = 2, heading = 0, wmax = 3\nlidar: rays = 31, fov = 240, range = 3, clear = 1.2", "controller": "w = clamp(3*gap_angle, -wmax, wmax)\nv = min(0.8, goal_dist) * clamp((nearest - 0.15)/0.6, 0.1, 1) * clamp(1 - abs(gap_angle)/2, 0.2, 1)", "tEnd": 60 })),
            node("pend", "robot.arm", json!({ "arm": "link: length = 1, mass = 1", "q0": "-80", "mode": "free", "tEnd": 6, "dt": 0.001 })),
            node("double", "robot.arm", json!({ "arm": "link: length = 1, mass = 1\nlink: length = 1, mass = 1", "q0": "30, 40", "mode": "free", "tEnd": 3, "dt": 0.0005 })),
            node("hold", "robot.arm", json!({ "arm": "link: length = 1, mass = 2", "q0": "-30", "mode": "joint", "targets": "q1 = 0", "kp": "200", "kd": "40", "tEnd": 4, "dt": 0.001 })),
            node("circle", "robot.arm", json!({ "arm": "link: length = 0.6, mass = 2\nlink: length = 0.5, mass = 1\npayload: mass = 0.5", "q0": "20, 60", "mode": "cartesian", "targets": "x = 0.6 + 0.15*cos(t)\ny = 0.4 + 0.15*sin(t)", "kp": "400", "kd": "60", "tEnd": 6, "dt": 0.001 })),
        ],
        "links": [],
    }));
    // Lidar: right wall 2 m below, front wall 4 m ahead, left wall 6 m above.
    let lidar = data(&r, "scan").tables.iter().find(|t| t.name == "lidar").unwrap();
    let dist = &lidar.column("distance").unwrap().values;
    assert!(close(dist[0], 2.0, 1e-9) && close(dist[1], 4.0, 1e-9) && close(dist[2], 6.0, 1e-9), "{dist:?}");
    // Go to goal: reached, along a nearly straight path (√(7² + 5²) minus the goal radius).
    assert_eq!(scalar(&r, "goal", "reached"), 1.0);
    let straight = (49.0f64 + 25.0).sqrt() - 0.25;
    let len = scalar(&r, "goal", "path length");
    assert!(len > straight - 0.01 && len < straight * 1.05, "path {len} vs {straight}");
    // Driving into a wall: one collision, stopped a radius away from it.
    assert_eq!(scalar(&r, "crash", "collisions"), 1.0);
    let x = &data(&r, "crash").tables.iter().find(|t| t.name == "trajectory").unwrap().column("x").unwrap().values;
    assert!(close(*x.last().unwrap(), 3.8, 0.02), "stopped at {}", x.last().unwrap());
    // Steering into the open direction nearest the goal gets round the obstacles without touching.
    assert_eq!(scalar(&r, "avoid", "reached"), 1.0);
    assert_eq!(scalar(&r, "avoid", "collisions"), 0.0);
    assert!(scalar(&r, "avoid", "min clearance") > 0.05);
    // A rod pendulum: T = 2π √(2L / 3g) (+0.2 % for a 10° swing).
    let j = &data(&r, "pend").tables.iter().find(|t| t.name == "joints").unwrap();
    let t = &j.x_column().unwrap().values;
    let q = &j.column("q1").unwrap().values;
    let mut ups = Vec::new();
    for k in 1..q.len() {
        let (a, b) = (q[k - 1] + 90.0, q[k] + 90.0);
        if a < 0.0 && b >= 0.0 {
            ups.push(t[k - 1] + (t[k] - t[k - 1]) * (-a) / (b - a));
        }
    }
    let period = (ups[ups.len() - 1] - ups[0]) / (ups.len() - 1) as f64;
    let theory = 2.0 * std::f64::consts::PI * (2.0 / (3.0 * 9.81f64)).sqrt() * 1.0019;
    assert!((period - theory).abs() / theory < 0.003, "period {period} vs {theory}");
    // The double pendulum (chaotic) still keeps its energy.
    assert!(scalar(&r, "double", "energy drift").abs() < 1e-4, "drift {}", scalar(&r, "double", "energy drift"));
    // Holding a 2 kg, 1 m link level takes m g L / 2 = 9.81 N·m.
    assert!(scalar(&r, "hold", "q1 (end)").abs() < 0.05, "hold q {}", scalar(&r, "hold", "q1 (end)"));
    let tau = &j_col(&r, "hold", "tau1");
    assert!(close(*tau.last().unwrap(), 9.81, 0.05), "tau {}", tau.last().unwrap());
    // Following a circle with the tip by inverse kinematics.
    assert!(scalar(&r, "circle", "rms tip error") < 0.005, "tip error {}", scalar(&r, "circle", "rms tip error"));
}

fn j_col(r: &RunResult, id: &str, name: &str) -> Vec<f64> {
    data(r, id).tables.iter().find(|t| t.name == "joints").unwrap().column(name).unwrap().values.clone()
}

/// A unit cube moved by (2, 0, 0) as a triangle table (outward normals).
fn cube_csv() -> String {
    let faces: [[[f64; 3]; 3]; 12] = [
        [[0., 0., 0.], [0., 1., 0.], [1., 1., 0.]], [[0., 0., 0.], [1., 1., 0.], [1., 0., 0.]],
        [[0., 0., 1.], [1., 0., 1.], [1., 1., 1.]], [[0., 0., 1.], [1., 1., 1.], [0., 1., 1.]],
        [[0., 0., 0.], [1., 0., 0.], [1., 0., 1.]], [[0., 0., 0.], [1., 0., 1.], [0., 0., 1.]],
        [[0., 1., 0.], [0., 1., 1.], [1., 1., 1.]], [[0., 1., 0.], [1., 1., 1.], [1., 1., 0.]],
        [[0., 0., 0.], [0., 0., 1.], [0., 1., 1.]], [[0., 0., 0.], [0., 1., 1.], [0., 1., 0.]],
        [[1., 0., 0.], [1., 1., 0.], [1., 1., 1.]], [[1., 0., 0.], [1., 1., 1.], [1., 0., 1.]],
    ];
    let mut csv = String::from("x1,y1,z1,x2,y2,z2,x3,y3,z3\n");
    for f in faces {
        let row: Vec<String> = f.iter().flat_map(|p| [p[0] + 2.0, p[1], p[2]]).map(|v| v.to_string()).collect();
        csv.push_str(&row.join(","));
        csv.push('\n');
    }
    csv
}

#[test]
fn cad_parts_have_exact_mass_properties() {
    let r = run(json!({
        "nodes": [
            node("box", "cad.part", json!({ "part": "units: mm\nmaterial: steel\nbase: box 0 0 0 100 60 10" })),
            node("ball", "cad.part", json!({ "part": "material: density = 1000\nbase: sphere 0 0 0 20", "resolution": 600 })),
            node("tube", "cad.part", json!({ "part": "base: cylinder z 0 0 0 50 20\ncut bore: cylinder z 0 0 -1 52 10", "resolution": 600 })),
            node("ring", "cad.part", json!({ "part": "base: box -50 -50 0 50 50 10\ncut holes: cylinder z 30 0 -1 12 5, around = 0 0, count = 6", "resolution": 800 })),
            node("torus", "cad.part", json!({ "part": "base: torus 0 0 0 30 10", "resolution": 600 })),
            node("cone", "cad.part", json!({ "part": "base: cone x 0 0 0 40 10 5", "resolution": 600 })),
            node("ribs", "cad.part", json!({ "part": "base: box 0 0 0 100 10 10\nadd rib: box 10 0 10 20 10 30, mirror = x 50" })),
            node("cube", "source.table", json!({ "data": cube_csv() })),
            node("mesh", "cad.part", json!({ "part": "units: m\nmaterial: density = 1000" })),
        ],
        "links": [link("cube", "mesh")],
    }));
    let pi = std::f64::consts::PI;
    // A 100 × 60 × 10 mm steel plate: exact on the grid.
    assert!(close(scalar(&r, "box", "volume"), 60000.0, 1e-6));
    let m = 60000e-9 * 7850.0;
    assert!(close(scalar(&r, "box", "mass"), m, 1e-9));
    assert!(close(scalar(&r, "box", "Izz"), m * (0.1f64.powi(2) + 0.06f64.powi(2)) / 12.0, 1e-9));
    assert!(close(scalar(&r, "box", "Ixx"), m * (0.06f64.powi(2) + 0.01f64.powi(2)) / 12.0, 1e-9));
    assert!(close(scalar(&r, "box", "centre of gravity x"), 50.0, 1e-9));
    let rel = |id: &str, name: &str, exact: f64| (scalar(&r, id, name) - exact).abs() / exact;
    // Curved solids converge with the grid.
    assert!(rel("ball", "volume", 4.0 / 3.0 * pi * 8000.0) < 2e-3, "ball {}", scalar(&r, "ball", "volume"));
    assert!(rel("ball", "principal I1", 0.4 * (4.0 / 3.0 * pi * 8000e-9 * 1000.0) * 0.02f64.powi(2)) < 5e-3);
    assert!(rel("tube", "volume", pi * (400.0 - 100.0) * 50.0) < 2e-3, "tube {}", scalar(&r, "tube", "volume"));
    assert!(rel("ring", "volume", 100000.0 - 6.0 * pi * 25.0 * 10.0) < 1e-3, "ring {}", scalar(&r, "ring", "volume"));
    assert!(scalar(&r, "ring", "centre of gravity x").abs() < 0.05, "symmetric pattern");
    assert!(rel("torus", "volume", 2.0 * pi * pi * 30.0 * 100.0) < 2e-3, "torus {}", scalar(&r, "torus", "volume"));
    assert!(rel("cone", "volume", pi * 40.0 / 3.0 * (100.0 + 50.0 + 25.0)) < 2e-3, "cone {}", scalar(&r, "cone", "volume"));
    assert!(close(scalar(&r, "ribs", "volume"), 10000.0 + 2.0 * 2000.0, 1e-6));
    let feats = data(&r, "ribs").tables.iter().find(|t| t.name == "features").unwrap();
    assert_eq!(feats.column("solids").unwrap().values, vec![1.0, 2.0]);
    // A closed mesh: volume 1 m³, centre (2.5, 0.5, 0.5), I = m (1 + 1) / 12, area 6 m².
    assert!(close(scalar(&r, "mesh", "volume"), 1.0, 1e-12));
    assert!(close(scalar(&r, "mesh", "centre of gravity x"), 2.5, 1e-12));
    assert!(close(scalar(&r, "mesh", "Ixx"), 1000.0 / 6.0, 1e-9));
    assert!(close(scalar(&r, "mesh", "Ixy"), 0.0, 1e-9));
    assert!(close(scalar(&r, "mesh", "surface area"), 6.0e4, 1e-6));
}

/// Serves the files in tests/fixtures (written by make_fixtures.py with scipy, PIL, numpy, zipfile).
struct Fixtures;
impl Host for Fixtures {
    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join(path);
        std::fs::read(&p).map_err(|e| format!("{}: {e}", p.display()))
    }
}

#[test]
fn data_files_of_many_formats_are_read() {
    let file = |id: &str, path: &str, extra: Value| {
        let mut params = json!({ "path": path });
        params.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        node(id, "io.readFile", params)
    };
    let r = run_with(json!({
        "nodes": [
            file("stl", "cube.stl", json!({})),
            file("stla", "cube_ascii.stl", json!({})),
            node("mass", "cad.part", json!({ "part": "units: mm\nmaterial: density = 1000" })),
            file("wav", "tone16.wav", json!({})),
            file("wavf", "tone_float.wav", json!({})),
            file("mat", "vars.mat", json!({})),
            file("matraw", "vars_raw.mat", json!({})),
            file("png", "gradient.png", json!({})),
            file("pal", "palette.png", json!({})),
            file("g16", "grey16.png", json!({})),
            file("xl", "book.xlsx", json!({})),
            file("xl2", "book.xlsx", json!({ "sheet": "Parts & prices" })),
            node("fft", "signal.fft", json!({})),
        ],
        "links": [link("stl", "mass"), link("wav", "fft")],
    }), &Fixtures);
    // STL: 12 triangles of a 10 mm cube at x = 20 … 30, binary and text alike.
    for id in ["stl", "stla"] {
        assert_eq!(scalar(&r, id, "triangles"), 12.0);
    }
    assert_eq!(data(&r, "stla").tables[0].column("x1").unwrap().values, data(&r, "stl").tables[0].column("x1").unwrap().values);
    assert!(close(scalar(&r, "mass", "volume"), 1000.0, 1e-3));
    assert!(close(scalar(&r, "mass", "centre of gravity x"), 25.0, 1e-4));
    // WAV: 8 kHz, 0.25 s, a 440 Hz tone at 0.5 (left) and 0.25 (right).
    assert_eq!(scalar(&r, "wav", "sample rate"), 8000.0);
    assert!(close(scalar(&r, "wav", "duration"), 0.25, 1e-9));
    let audio = &data(&r, "wav").tables[0];
    let peak = |c: &str| audio.column(c).unwrap().values.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    assert!(close(peak("left"), 0.5, 1e-3) && close(peak("right"), 0.25, 1e-3));
    assert!(close(scalar(&r, "fft", "dominant frequency"), 440.0, 4.0), "fft {:?}", data(&r, "fft").scalars);
    let f = &data(&r, "wavf").tables[0].column("y").unwrap().values;
    assert!(close(f[10], 0.5 * (2.0 * std::f64::consts::PI * 440.0 * 10.0 / 8000.0).sin(), 1e-6));
    // MATLAB (compressed and plain): scalar, vectors, a matrix, an int16 vector and a cell of text.
    for id in ["mat", "matraw"] {
        assert_eq!(scalar(&r, id, "gain"), 3.5);
        let v = &data(&r, id).tables[0];
        assert_eq!(v.column("t").unwrap().values.len(), 101);
        assert!(close(v.column("t").unwrap().values[100], 1.0, 1e-12));
        assert!(close(v.column("y").unwrap().values[25], 1.0, 1e-12));
        assert_eq!(&v.column("counts").unwrap().values[..3], &[1.0, -2.0, 3.0]);
        let m = data(&r, id).grids.iter().find(|g| g.name == "M").unwrap();
        assert_eq!(m.z[4 + 2], 6.0, "M(2,3) = 6");
        assert!(data(&r, id).text.contains("notes{2} = 'bc'"), "{}", data(&r, id).text);
    }
    // PNG: 40 × 30; red rises left to right, green top to bottom (row 0 of the grid is the bottom).
    assert_eq!(scalar(&r, "png", "width"), 40.0);
    let red = data(&r, "png").grids.iter().find(|g| g.name == "red").unwrap();
    assert!(close(red.z[39], 1.0, 1e-9) && close(red.z[0], 0.0, 1e-9));
    let green = data(&r, "png").grids.iter().find(|g| g.name == "green").unwrap();
    assert!(close(green.z[0], 1.0, 1e-9) && close(green.z[29 * 40], 0.0, 1e-9));
    assert!((scalar(&r, "pal", "mean brightness") - scalar(&r, "png", "mean brightness")).abs() < 0.05);
    let g16 = &data(&r, "g16").grids[0];
    assert!(close(g16.z[39], 1.0, 1e-9) && close(g16.z[0], 0.0, 1e-9));
    // Excel: shared, rich and inline strings, a formula's value, a named second sheet with booleans.
    let xl = &data(&r, "xl").tables[0];
    assert_eq!(xl.name, "Measurements");
    assert_eq!(xl.column("time").unwrap().unit, "s");
    assert_eq!(xl.column("pressure").unwrap().values[3], 2.0 * xl.column("temperature").unwrap().values[3]);
    let xl2 = &data(&r, "xl2").tables[0];
    assert_eq!(xl2.column("part").unwrap().labels.as_ref().unwrap(), &vec!["bolt, M6".to_string(), "nut".to_string()]);
    assert_eq!(xl2.column("price").unwrap().values, vec![0.12, 0.05]);
    assert_eq!(xl2.column("stock").unwrap().values, vec![1.0, 0.0]);
}

#[test]
fn spice_devices_and_cards_of_ltspice_netlists() {
    let r = run(json!({
        "nodes": [
            // Title line, ; comments, .param {…}, a diode model with RS.
            node("title", "circuit.spice", json!({ "netlist": "My test circuit\n.param rval=1k\nV1 in 0 10 ; supply\nR1 in out {2*rval}\nR2 out 0 {rval}\n.op\n.end" })),
            // BJT in the active region: Ic = BF·Ib exactly (the reverse junction is off).
            node("bjt", "circuit.spice", json!({ "netlist": "* bias\nVcc vcc 0 10\nRb vcc b 470k\nRc vcc c 1k\nQ1 c b 0 Qn\n.model Qn NPN(IS=1e-14 BF=150 BR=2)\n.op" })),
            node("pnp", "circuit.spice", json!({ "netlist": "* pnp mirror image\nVee vee 0 -10\nRb vee b 470k\nRc vee c 1k\nQ1 c b 0 Qp\n.model Qp PNP(IS=1e-14 BF=150 BR=2)\n.op" })),
            // NMOS in saturation: Id = KP/2 (Vgs − Vt)² = 4 mA → Vd = 6 V; PMOS the mirror image.
            node("nmos", "circuit.spice", json!({ "netlist": "* nmos\nVdd vdd 0 10\nVg g 0 3\nRd vdd d 1k\nM1 d g 0 0 Mn\n.model Mn NMOS(LEVEL=1 VTO=1 KP=2m LAMBDA=0)\n.op" })),
            node("pmos", "circuit.spice", json!({ "netlist": "* pmos\nVss vss 0 -10\nVg g 0 -3\nRd vss d 1k\nM1 d g 0 0 Mp\n.model Mp PMOS(LEVEL=1 VTO=-1 KP=2m)\n.op" })),
            // A subcircuit op-amp (behavioural, clipped at the rails) in an inverting amplifier.
            node("sub", "circuit.spice", json!({ "netlist": "* inverting\nVin in 0 0.2\nVp vp 0 15\nVn vn 0 -15\nR1 in m 1k\nR2 m out 10k\nX1 0 m out vp vn OA\n.subckt OA inp inn o p n\nB1 o 0 V=max(min(1e5*(V(inp)-V(inn)), V(p)), V(n))\n.ends\n.op" })),
            // F mirrors twice the current of a 0 V sense source; H turns it into a voltage.
            node("ctrl", "circuit.spice", json!({ "netlist": "* controlled\nV1 a 0 5\nVs a b 0\nR1 b 0 1k\nF1 0 c Vs 2\nR2 c 0 1k\nH1 h 0 Vs 500\nRh h 0 1meg\n.op" })),
            // A behavioural current source and a SIN with a phase (90° → starts at the peak).
            node("bi", "circuit.spice", json!({ "netlist": "* bi\nV1 a 0 2\nB1 0 o I=V(a)**2*1m\nRo o 0 1k\nV2 s 0 SIN(0 1 50 0 0 90)\nRs s 0 1k\n.op\n.tran 1m 10m" })),
        ],
        "links": [],
    }));
    assert!(close(scalar(&r, "title", "V(out)"), 10.0 / 3.0, 1e-6));
    assert_eq!(data(&r, "title").text, "My test circuit");
    let ib = (10.0 - scalar(&r, "bjt", "V(b)")) / 470e3;
    let ic = (10.0 - scalar(&r, "bjt", "V(c)")) / 1e3;
    assert!(close(ic / ib, 150.0, 0.05), "beta {}", ic / ib);
    assert!(close(scalar(&r, "pnp", "V(c)"), -scalar(&r, "bjt", "V(c)"), 1e-6));
    assert!(close(scalar(&r, "nmos", "V(d)"), 6.0, 1e-6), "nmos {}", scalar(&r, "nmos", "V(d)"));
    assert!(close(scalar(&r, "pmos", "V(d)"), -6.0, 1e-6), "pmos {}", scalar(&r, "pmos", "V(d)"));
    assert!(close(scalar(&r, "sub", "V(out)"), -2.0, 1e-3), "sub {}", scalar(&r, "sub", "V(out)"));
    assert!(data(&r, "sub").scalars.iter().all(|s| !s.name.contains('.')), "inner nodes are hidden");
    assert!(close(scalar(&r, "ctrl", "V(c)"), 10.0, 1e-6), "F {}", scalar(&r, "ctrl", "V(c)"));
    // I(Vs) is positive into its + node, so V(h) = 500 · 5 mA.
    assert!(close(scalar(&r, "ctrl", "V(h)"), 2.5, 1e-6), "H {}", scalar(&r, "ctrl", "V(h)"));
    assert!(close(scalar(&r, "bi", "V(o)"), 4.0, 1e-6), "B I= {}", scalar(&r, "bi", "V(o)"));
    let s0 = data(&r, "bi").tables[0].column("V(s)").unwrap().values[0];
    assert!(close(s0, 1.0, 1e-9), "phase {s0}");
}

#[test]
fn mycircuit_netlists_match_mycircuit() {
    // Netlists written by MyCircuit's "Export SPICE" and MyCircuit's own operating points (make_mycircuit_fixtures.mjs).
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures");
    let expected: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("mycircuit-op.json")).unwrap()).unwrap();
    // The exporter's node names: unusual characters become _, a leading + - . too.
    let sanitize = |n: &str| -> String {
        let mut s: String = n.chars().map(|c| if c.is_ascii_alphanumeric() || "_+-.".contains(c) { c } else { '_' }).collect();
        if s.starts_with(['+', '-', '.']) {
            s.replace_range(..1, "_");
        }
        s.to_ascii_lowercase()
    };
    let mut nodes = Vec::new();
    let names: Vec<String> = expected.as_object().unwrap().keys().cloned().collect();
    for (k, name) in names.iter().enumerate() {
        let text = std::fs::read_to_string(dir.join(format!("mycircuit-{name}.cir"))).unwrap();
        nodes.push(node(&format!("m{k}"), "circuit.spice", json!({ "netlist": format!("{text}\n.op\n") })));
    }
    let r = run(json!({ "nodes": nodes, "links": [] }));
    let mut checked = 0;
    for (k, name) in names.iter().enumerate() {
        let id = format!("m{k}");
        let volts = expected[name].as_object().unwrap();
        let sanitized: Vec<String> = volts.keys().map(|n| sanitize(n)).collect();
        for (net, v) in volts {
            let s = sanitize(net);
            // Skip ground and names that two nets share after sanitizing (the exporter adds _ to one).
            if s == "gnd" || s == "0" || sanitized.iter().filter(|x| **x == s).count() > 1 {
                continue;
            }
            let want = v.as_f64().unwrap();
            let got = scalar(&r, &id, &format!("V({s})"));
            assert!((got - want).abs() <= 2e-3 + 1e-3 * want.abs(), "{name}: V({net}) = {got}, MyCircuit {want}");
            checked += 1;
        }
    }
    assert!(checked >= 25, "only {checked} voltages compared");
}

#[test]
fn myheatmanager_results_become_tables_maps_and_values() {
    // MyHeatManager's own engine, built in: the model from disk (desktop) and kept in the node (web).
    let text = std::fs::read(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/thin_layer.myheat")).unwrap();
    let b64 = base64(&text);
    let r = run_with(json!({ "nodes": [
        node("heat", "io.myheat", json!({ "model": "thin_layer.myheat", "field": "T" })),
        node("kept", "io.myheat", json!({ "content": b64, "field": "T" })),
    ], "links": [] }), &Fixtures);
    assert_eq!(scalar(&r, "heat", "Tmax"), scalar(&r, "kept", "Tmax"));
    let d = data(&r, "heat");
    // An 80 × 20 grid of 1 mm cells: board 160 + chip 40 + heat sink 240 solid cells, the rest empty space.
    let g = &d.grids[0];
    assert_eq!((g.x.len(), g.y.len()), (80, 20));
    assert_eq!(g.z.iter().filter(|v| v.is_finite()).count(), 440);
    let field = d.tables.iter().find(|t| t.name == "field").unwrap();
    assert_eq!(field.rows(), 1600);
    let tmax = field.column("T").unwrap().values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    assert!((scalar(&r, "heat", "Tmax") - tmax).abs() < 1e-3, "Tmax {} vs {tmax}", scalar(&r, "heat", "Tmax"));
    // The chip's 3 W leave through the boundaries.
    assert!(close(scalar(&r, "heat", "heat generated"), 3.0, 1e-6));
    assert!(close(scalar(&r, "heat", "heat through boundaries"), -3.0, 1e-3));
    let bodies = d.tables.iter().find(|t| t.name == "bodies").unwrap();
    assert_eq!(bodies.column("id").unwrap().labels.as_ref().unwrap().len(), 3);
}

fn base64(bytes: &[u8]) -> String {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for k in 0..4 {
            if k <= c.len() {
                out.push(A[(n >> (18 - 6 * k) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[test]
fn rigid_body_physics_matches_mechanics() {
    let w = |id: &str, world: &str, t_end: f64, dt: f64| node(id, "physics.rigid", json!({ "world": world, "tEnd": t_end, "dt": dt, "iterations": 30 }));
    let r = run(json!({
        "nodes": [
            // Free fall for 1 s from 10 m.
            w("fall", "body b: sphere r = 0.1, mass = 1, pos = 0 0 10", 1.0, 1e-3),
            // Restitution 0.5 from 1 m: the first rebound reaches e²·h = 0.25 m above the resting height.
            w("bounce", "ground: friction = 0, restitution = 0.5\nbody b: sphere r = 0.05, mass = 1, pos = 0 0 1.05, restitution = 0", 0.9, 1e-4),
            // A projectile at 45°, 10 m/s, lands at v² sin 2θ / g.
            node("throw", "physics.rigid", json!({ "world": "ground: restitution = 0, friction = 1\nbody b: sphere r = 0.01, mass = 1, pos = 0 0 0.01, vel = 7.0710678 0 7.0710678, restitution = 0", "tEnd": 1.6, "dt": 1e-4, "fps": 2000 })),
            // A box sliding at 3 m/s with μ = 0.3 stops after v² / 2μg.
            w("slide", "ground: friction = 0.3, restitution = 0\nbody b: box size = 0.2 0.2 0.1, mass = 2, pos = 0 0 0.05, vel = 3 0 0, friction = 0.3, restitution = 0", 2.0, 1e-3),
            // Equal spheres, head-on, perfectly elastic: the velocities swap; momentum and energy are kept.
            w("hit", "gravity: 0 0 0\nbody a: sphere r = 0.1, mass = 1, pos = 0 0 0, vel = 1 0 0, restitution = 1, friction = 0\nbody b: sphere r = 0.1, mass = 1, pos = 1 0 0, restitution = 1, friction = 0", 1.5, 1e-3),
            // A small ball on a 1 m ball joint: T = 2π √(L/g) for a 5° swing.
            w("pend", "body bob: sphere r = 0.01, mass = 1, pos = 0.0871557 0 0.0038053\njoint j: ball a = bob, b = world, at = 0 0 1", 8.0, 5e-4),
            // Mass on a spring: T = 2π √(m/k).
            w("spring", "gravity: 0 0 0\nbody m: sphere r = 0.05, mass = 2, pos = 0.1 0 0\nspring s: a = m, b = world, at = 0.1 0 0, to = 0 0 0, k = 50, rest = 0", 4.0, 1e-4),
            // Three stacked boxes stay put.
            w("stack", "ground: friction = 0.8, restitution = 0\nbody b1: box size = 0.4 0.4 0.2, mass = 2, pos = 0 0 0.1, restitution = 0, friction = 0.8\nbody b2: box size = 0.4 0.4 0.2, mass = 2, pos = 0 0 0.3, restitution = 0, friction = 0.8\nbody b3: box size = 0.4 0.4 0.2, mass = 2, pos = 0 0 0.5, restitution = 0, friction = 0.8", 3.0, 1.0 / 240.0),
            // A wheel on a hinge motor reaches the set speed (2 rad/s about y).
            w("motor", "gravity: 0 0 0\nbody wheel: box size = 0.4 0.05 0.4, mass = 1, pos = 0 0 1\njoint h: hinge a = wheel, b = world, at = 0 0 1, axis = 0 1 0, motor = 2, torque = 10", 1.0, 1e-3),
        ],
        "links": [],
    }));
    assert!(close(scalar(&r, "fall", "b.z (end)"), 10.0 - 9.81 / 2.0, 0.01), "fall {}", scalar(&r, "fall", "b.z (end)"));
    let z = j_traj(&r, "bounce", "b.z");
    let t = j_traj(&r, "bounce", "t");
    // The highest point after the first bounce (t > 0.5 s).
    let rebound = (0..z.len()).filter(|&k| t[k] > 0.5).map(|k| z[k]).fold(f64::NEG_INFINITY, f64::max) - 0.05;
    assert!((rebound - 0.25).abs() < 0.02, "rebound {rebound}");
    // Where it lands (it rolls on afterwards: a sphere with friction keeps 5/7 of its speed).
    let (tx, tz) = (j_traj(&r, "throw", "b.x"), j_traj(&r, "throw", "b.z"));
    let k = (11..tz.len()).find(|&k| tz[k] <= 0.0100001 && tz[k - 1] > 0.0100001).unwrap();
    let range = tx[k - 1] + (tx[k] - tx[k - 1]) * (tz[k - 1] - 0.01) / (tz[k - 1] - tz[k]);
    assert!((range - 100.0 / 9.81).abs() < 0.05, "range {range}");
    let stop = scalar(&r, "slide", "b.x (end)");
    assert!((stop - 9.0 / (2.0 * 0.3 * 9.81)).abs() < 0.05, "stop {stop}");
    assert!(close(scalar(&r, "hit", "a speed (end)"), 0.0, 0.01) && close(scalar(&r, "hit", "b speed (end)"), 1.0, 0.01), "{:?}", data(&r, "hit").scalars);
    // Pendulum period from the crossings of x = 0.
    let px = j_traj(&r, "pend", "bob.x");
    let pt = j_traj(&r, "pend", "t");
    let mut downs = Vec::new();
    for k in 1..px.len() {
        if px[k - 1] > 0.0 && px[k] <= 0.0 {
            downs.push(pt[k - 1] + (pt[k] - pt[k - 1]) * px[k - 1] / (px[k - 1] - px[k]));
        }
    }
    let period = (downs[downs.len() - 1] - downs[0]) / (downs.len() - 1) as f64;
    let theory = 2.0 * std::f64::consts::PI * (1.0f64 / 9.81).sqrt() * 1.0005;
    assert!((period - theory).abs() / theory < 0.01, "pendulum {period} vs {theory}");
    let sx = j_traj(&r, "spring", "m.x");
    let st = j_traj(&r, "spring", "t");
    let mut ups = Vec::new();
    for k in 1..sx.len() {
        if sx[k - 1] < 0.0 && sx[k] >= 0.0 {
            ups.push(st[k - 1] + (st[k] - st[k - 1]) * -sx[k - 1] / (sx[k] - sx[k - 1]));
        }
    }
    let sp = (ups[ups.len() - 1] - ups[0]) / (ups.len() - 1) as f64;
    let st_theory = 2.0 * std::f64::consts::PI * (2.0f64 / 50.0).sqrt();
    assert!((sp - st_theory).abs() / st_theory < 0.01, "spring {sp} vs {st_theory}");
    for (b, z) in [("b1", 0.1), ("b2", 0.3), ("b3", 0.5)] {
        let zz = scalar(&r, "stack", &format!("{b}.z (end)"));
        let xx = scalar(&r, "stack", &format!("{b}.x (end)"));
        assert!((zz - z).abs() < 0.01 && xx.abs() < 0.01, "stack {b}: x {xx}, z {zz}");
    }
    let tor = &data(&r, "motor").tables.iter().find(|t| t.name == "joints").unwrap();
    let ang = &tor.column("h angle").unwrap().values;
    let tt = &tor.x_column().unwrap().values;
    let n = ang.len();
    let mut d = ang[n - 1] - ang[n - 11];
    while d < -180.0 {
        d += 360.0;
    }
    while d > 180.0 {
        d -= 360.0;
    }
    let speed = d.to_radians() / (tt[n - 1] - tt[n - 11]);
    assert!((speed.abs() - 2.0).abs() < 0.05, "motor {speed}");
}

fn j_traj(r: &RunResult, id: &str, col: &str) -> Vec<f64> {
    let t = data(r, id).tables.iter().find(|t| t.name == "trajectories").unwrap();
    if col == "t" {
        t.x_column().unwrap().values.clone()
    } else {
        t.column(col).unwrap().values.clone()
    }
}

#[test]
fn solid_finite_elements_match_beam_theory() {
    let r = run(json!({
        "nodes": [
            // A 1 m bar, 0.1 × 0.1 m, pulled with 100 kN on rollers: u = F L / E A, σ = F / A everywhere.
            node("bar", "fem.solid", json!({ "part": "units: m\nmaterial: E = 200e9, nu = 0.3, density = 7850\nbase: box 0 0 0 1 0.1 0.1\nmesh: n = 20\nfix: x-, dir = x\nfix: y-, dir = y\nfix: z-, dir = z\nload: x+, f = 100000 0 0\nprobe end: 1 0.05 0.05" })),
            // A cantilever with 1 kN at the tip: δ = PL³/3EI + PL/κGA.
            node("beam", "fem.solid", json!({ "part": "units: m\nmaterial: E = 200e9, nu = 0.3\nbase: box 0 0 0 1 0.1 0.1\nmesh: n = 40\nfix: x-\nload: x+, f = 0 0 -1000\nprobe tip: 1 0.05 0.05" })),
            // Heat through a bar between 100 °C and 0 °C: T(mid) = 50, Q = k A ΔT / L.
            node("heat", "fem.solid", json!({ "physics": "heat", "part": "units: m\nmaterial: density = 2700, k = 50\nbase: box 0 0 0 1 0.1 0.1\nmesh: n = 20\ntemperature: x-, T = 100\ntemperature: x+, T = 0\nprobe mid: 0.5 0.05 0.05" })),
            // A part from the CAD feature language: a plate with a hole, under its own weight.
            node("plate", "fem.solid", json!({ "part": "units: mm\nmaterial: aluminium\nbase: box 0 0 0 200 100 10\ncut hole: cylinder z 100 50 -1 12 20\nmesh: n = 40\nfix: x-\ngravity: 0 0 -9.81\nload: x+, f = 0 0 -200" })),
        ],
        "links": [],
    }));
    let u = scalar(&r, "bar", "ux(end)");
    assert!(close(u, 100000.0 / (200e9 * 0.01), 1e-9), "bar u {u}");
    assert!(close(scalar(&r, "bar", "von Mises max"), 1e7, 1e3), "bar σ {}", scalar(&r, "bar", "von Mises max"));
    assert!(close(scalar(&r, "bar", "reaction x (fix 1)"), -100000.0, 1.0));
    let i = 0.1f64.powi(4) / 12.0;
    let delta = 1000.0 / (3.0 * 200e9 * i) + 1000.0 / (5.0 / 6.0 * 200e9 / 2.6 * 0.01);
    let tip = -scalar(&r, "beam", "uz(tip)");
    assert!((tip - delta).abs() / delta < 0.04, "tip {tip} vs {delta}");
    assert!(close(scalar(&r, "beam", "reaction z (fix 1)"), 1000.0, 1.0));
    assert!(close(scalar(&r, "heat", "T(mid)"), 50.0, 1e-6));
    assert!(close(scalar(&r, "heat", "heat in (temperature 1)"), 50.0 * 0.01 * 100.0, 1e-6), "Q {}", scalar(&r, "heat", "heat in (temperature 1)"));
    // The hole takes material away: the mass is the plate's minus the hole's (within a cell).
    let m = scalar(&r, "plate", "mass");
    let exact = 2700.0 * (0.2 * 0.1 * 0.01 - std::f64::consts::PI * 0.02 * 0.02 * 0.01);
    assert!((m - exact).abs() / exact < 0.03, "mass {m} vs {exact}");
    assert!(scalar(&r, "plate", "von Mises max") > 0.0);
    let pts = &data(&r, "plate").tables[0];
    assert_eq!(pts.name, "field points");
}

#[test]
fn microcontroller_firmware_drives_the_logic() {
    let r = run(json!({
        "nodes": [
            // Blink: toggle bit 0 every 10 cycles (period 1) → a square wave of period 2 · (10 + 2 cycles).
            node("blink", "circuit.logic", json!({ "circuit": "mcu u1: period = 1, out = led\nprogram u1:\nloop: tgl 0\n  delay 10\n  jmp loop\nend", "tEnd": 500, "delay": 0 })),
            // A counter on four pins, and a button copied to a pin by polling.
            node("count", "circuit.logic", json!({ "circuit": "input btn: 0@0, 1@100\nmcu u2: period = 2, out = q0 q1 q2 q3 lamp, in = btn\nbus n = q3 q2 q1 q0\nprogram u2:\n  ldi r1, 0\nloop: inc r1\n  mov r2, r1\n  and r2, 15\n  sbis 0\n  jmp off\n  or r2, 16\noff: out r2\n  jmp loop\nend", "tEnd": 200, "delay": 0 })),
            node("bad", "circuit.logic", json!({ "circuit": "mcu u3: out = x\nprogram u3:\n  foo r1\nend" })),
        ],
        "links": [],
    }));
    let st = data(&r, "blink").tables.iter().find(|t| t.name == "signals").unwrap();
    let f = st.column("frequency").unwrap().values[0];
    assert!((1.0 / f - 24.0).abs() < 0.01, "blink period {}", 1.0 / f);
    // The lamp follows the button (pressed from t = 100).
    let tl = data(&r, "count").tables.iter().find(|t| t.name == "timing").unwrap();
    let t = &tl.x_column().unwrap().values;
    let lamp = &tl.column("lamp").unwrap().values;
    let at = |time: f64| lamp[(0..t.len()).rev().find(|&k| t[k] <= time).unwrap()];
    assert_eq!(at(90.0), 0.0);
    assert_eq!(at(150.0), 1.0);
    assert!(scalar(&r, "count", "u2 instructions") > 90.0);
    let bad = r.node("bad").unwrap().error.clone().unwrap_or_default();
    assert!(bad.contains("unknown instruction"), "{bad}");
}

#[test]
fn flow_matches_benchmarks() {
    let r = run(json!({
        "nodes": [
            // Lid-driven cavity, Re = 100: Ghia et al. (1982) give min u = −0.2109 on the vertical centre line.
            node("cavity", "cfd.flow", json!({ "model": "domain: width = 1, height = 1, nx = 48, ny = 48\nfluid: rho = 1, nu = 0.01\ntop: wall, u = 1", "tEnd": 40, "steady": 1e-5 })),
            // A channel at Re = 10: the developed profile is parabolic (centre 1.5 U) with dp/dx = −12 μ U / H².
            node("channel", "cfd.flow", json!({ "model": "domain: width = 6, height = 1, nx = 90, ny = 20\nfluid: rho = 1, nu = 0.1\nleft: inlet, u = 1\nright: outlet", "tEnd": 40, "steady": 1e-6 })),
            // A square cavity heated from the left, Ra = 10³, Pr = 0.71: de Vahl Davis (1983) Nu = 1.118.
            node("natural", "cfd.flow", json!({ "model": "domain: width = 1, height = 1, nx = 32, ny = 32\nfluid: rho = 1, nu = 0.026646, alpha = 0.037530, cp = 1, beta = 1, tref = 0.5\ngravity: 0 -1\nleft: wall, T = 1\nright: wall, T = 0", "tEnd": 80, "steady": 1e-6 })),
        ],
        "links": [],
    }));
    let vl = data(&r, "cavity").tables.iter().find(|t| t.name == "vertical centre line").unwrap();
    let umin = vl.column("u").unwrap().values.iter().cloned().fold(f64::INFINITY, f64::min);
    assert!((umin + 0.2109).abs() < 0.015, "cavity min u {umin}");
    assert_eq!(scalar(&r, "cavity", "steady"), 1.0);
    let hl = data(&r, "channel").tables.iter().find(|t| t.name == "horizontal centre line").unwrap();
    let x = &hl.x_column().unwrap().values;
    let uc = &hl.column("u").unwrap().values;
    let pc = &hl.column("p").unwrap().values;
    let k = x.iter().position(|v| *v > 5.0).unwrap();
    assert!((uc[k] - 1.5).abs() < 0.04, "channel centre u {}", uc[k]);
    let k4 = x.iter().position(|v| *v > 4.0).unwrap();
    let grad = (pc[k] - pc[k4]) / (x[k] - x[k4]);
    assert!((grad + 1.2).abs() < 0.06, "dp/dx {grad}");
    assert!((scalar(&r, "channel", "flow in (left)") - scalar(&r, "channel", "flow in (right)") * -1.0).abs() < 0.01);
    let nu = scalar(&r, "natural", "Nusselt (left)");
    assert!((nu - 1.118).abs() < 0.06, "Nusselt {nu}");
    assert!((scalar(&r, "natural", "Rayleigh number") - 1000.0).abs() < 1.0);
}

#[test]
fn modal_analysis_matches_beam_theory() {
    // A steel cantilever 1 m × 0.1 × 0.1: f₁ = (1.8751² / 2π) √(EI / ρA L⁴) ≈ 81.5 Hz, twice (square section).
    let r = run(json!({ "nodes": [node("m", "fem.solid", json!({ "physics": "modal", "modes": 3, "part": "units: m\nmaterial: E = 200e9, nu = 0.3, density = 7850\nbase: box 0 0 0 1 0.1 0.1\nmesh: n = 40\nfix: x-" }))], "links": [] }));
    let i = 0.1f64.powi(4) / 12.0;
    let f1 = 1.8751f64.powi(2) / (2.0 * std::f64::consts::PI) * (200e9 * i / (7850.0 * 0.01)).sqrt();
    for k in ["f1", "f2"] {
        let f = scalar(&r, "m", k);
        assert!((f - f1).abs() / f1 < 0.04, "{k} = {f} vs {f1}");
    }
    // The third: the second bending pair is far higher, a torsion mode lies between.
    assert!(scalar(&r, "m", "f3") > 1.5 * f1);
}

#[test]
fn frame_matches_beam_theory() {
    // A steel cantilever 2 m, rect 0.05 × 0.1, tip load 1 kN down: δ = P L³ / 3 E I.
    let model = "material: E = 200e9, nu = 0.3, density = 0, yield = 250e6\nsection s: rect b = 0.05, h = 0.1\nnode a: 0 0 0\nnode b: 2 0 0\nbeam c: a b, section = s\nsupport a: fixed\nload b: 0 0 -1000";
    let r = run(json!({ "nodes": [node("f", "frame.struct", json!({ "frame": model }))], "links": [] }));
    let i = 0.05 * 0.1f64.powi(3) / 12.0;
    let exact = 1000.0 * 8.0 / (3.0 * 200e9 * i);
    let uz = scalar(&r, "f", "uz(b)");
    assert!((uz + exact).abs() / exact < 1e-6, "uz = {uz} vs {exact}");
    // Root moment P L over the section modulus.
    let s = scalar(&r, "f", "stress max");
    assert!((s - 2000.0 * 0.05 / i).abs() / s < 1e-6, "stress {s}");

    // Euler: a cantilever column, P_cr = π² E I / (4 L²); the load factor for a 1 kN push.
    let col = "material: E = 200e9, nu = 0.3, density = 0\nsection s: pipe d = 0.1, t = 0.005\nnode a: 0 0 0\nnode b: 0 0 3\nbeam c: a b, section = s\nsupport a: fixed\nload b: 0 0 -1000";
    let r = run(json!({ "nodes": [node("f", "frame.struct", json!({ "frame": col }))], "links": [] }));
    let ip = std::f64::consts::PI / 64.0 * (0.1f64.powi(4) - 0.09f64.powi(4));
    let pcr = std::f64::consts::PI.powi(2) * 200e9 * ip / (4.0 * 9.0);
    let lf = scalar(&r, "f", "buckling load factor");
    assert!((lf * 1000.0 - pcr).abs() / pcr < 0.01, "λ = {lf} vs {}", pcr / 1000.0);

    // A two-bar truss (45°): each bar carries P / √2, the apex drops by P L / (E A) · √2 … checked by statics.
    let truss = "material: steel\nsection s: custom A = 1e-4, Iy = 1e-8\nnode l: -1 0 0\nnode r: 1 0 0\nnode t: 0 0 1\ntruss a: l t, section = s\ntruss b: r t, section = s\nsupport l: pinned\nsupport r: pinned\nsupport t: dofs = uy\nload t: 0 0 -10000";
    let r = run(json!({ "nodes": [node("f", "frame.struct", json!({ "frame": truss }))], "links": [] }));
    let force = 10000.0 / 2f64.sqrt();
    let l = 2f64.sqrt();
    // Bar shortening P L / E A along 45° → vertical drop = shortening · √2.
    let drop = force * l / (200e9 * 1e-4) * 2f64.sqrt();
    let uz = scalar(&r, "f", "uz(t)");
    assert!((uz + drop).abs() / drop < 1e-6, "truss uz {uz} vs {drop}");
    assert!((scalar(&r, "f", "stress max") - force / 1e-4).abs() < 1.0);
    // Both bars are pushed: each buckles on its own at π² E I / L².
    let bar = std::f64::consts::PI.powi(2) * 200e9 * 1e-8 / (l * l * force);
    let lf = scalar(&r, "f", "buckling load factor");
    assert!((lf - bar).abs() / bar < 1e-9, "bar λ = {lf} vs {bar}");
}
