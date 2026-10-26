//! The MATLAB / Simulink feature set: Simulink blocks (subsystems, buses,
//! switches, discrete transfer functions, Stateflow charts, solvers), ODE
//! solvers (stiff, events, delays) and control design, checked against
//! known answers.

use serde_json::{json, Value};
use sim_core::data::Dataset;
use sim_core::{run_model, NoHost, RunResult};

fn run(model: Value) -> RunResult {
    let r = run_model(&model.to_string(), &mut |_| {}, &|| false, &NoHost);
    assert!(r.ok, "run failed: {:?}", r.error);
    r
}

fn data<'a>(r: &'a RunResult, id: &str) -> &'a Dataset {
    let n = r.node(id).unwrap_or_else(|| panic!("no node {id}"));
    n.data.as_ref().unwrap_or_else(|| panic!("node {id} failed: {:?}", n.error))
}

fn error(r: &RunResult, id: &str) -> String {
    r.node(id).and_then(|n| n.error.clone()).unwrap_or_default()
}

fn scalar(r: &RunResult, id: &str, name: &str) -> f64 {
    data(r, id).get_scalar(name).unwrap_or_else(|| panic!("node {id} has no scalar {name}: {:?}", data(r, id).scalars))
}

fn col<'a>(d: &'a Dataset, table: usize, name: &str) -> &'a [f64] {
    &d.tables[table].column(name).unwrap_or_else(|e| panic!("{e}")).values
}

fn node(id: &str, kind: &str, params: Value) -> Value {
    json!({ "id": id, "type": kind, "name": id, "params": params })
}

fn single(kind: &str, params: Value) -> RunResult {
    run(json!({ "nodes": [node("n", kind, params)], "links": [] }))
}

fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol
}

#[test]
fn simulink_subsystems_buses_and_switches() {
    // The same first-order lag subsystem used twice in series: 1/(s+1)² step → 1 − (1 + t)e^−t.
    let diagram = "subsystem lag(u, tau = 1) -> y\n  y = integrator((u - y)/tau)\nend\nr = step(t0 = 0)\na = lag(r)\nb = lag(a)\nbus = mux(a, b, r)\n[p, q, w] = demux(bus)\nsel = demux(bus, 2)\nsw = switch(a, t, b, threshold = 2)\ng = gain(b, k = 3)\ns = sum(a, b, signs = \"+-\")";
    let r = single("dyn.blocks", json!({ "diagram": diagram, "tEnd": 4, "dt": 0.01 }));
    let d = data(&r, "n");
    let t = 3.0f64;
    let exact = 1.0 - (1.0 + t) * (-t).exp();
    let b = col(d, 0, "b");
    assert!(close(b[300], exact, 1e-6), "{} vs {exact}", b[300]);
    assert_eq!(col(d, 0, "q")[300], b[300]);
    assert_eq!(col(d, 0, "sel")[300], b[300]);
    assert_eq!(col(d, 0, "w")[300], 1.0);
    // Switch: a while t ≥ 2, else b.
    assert_eq!(col(d, 0, "sw")[100], b[100]);
    assert_eq!(col(d, 0, "sw")[300], col(d, 0, "a")[300]);
    assert!(close(col(d, 0, "g")[300], 3.0 * b[300], 1e-12));
    assert!(close(col(d, 0, "s")[300], col(d, 0, "a")[300] - b[300], 1e-12));
    // Subsystem internals are hidden.
    assert!(d.tables[0].columns.iter().all(|c| !c.name.starts_with('_')));
    // MATLAB-style header, nested use and settings.
    let nested = "function y = lag2(u, k = 1)\n  m = lagx(u)\n  y = k*lagx(m)\nend\nfunction out = lagx(v)\n  out = integrator(v - out)\nend\nr = step()\nz = lag2(r, k = 2)";
    let r = single("dyn.blocks", json!({ "diagram": nested, "tEnd": 4, "dt": 0.01 }));
    assert!(close(col(data(&r, "n"), 0, "z")[300], 2.0 * exact, 1e-6));
}

#[test]
fn simulink_discrete_tf_chart_and_solvers() {
    // dtf: y[k] = 0.5 y[k-1] + u[k-1] (1/(z − 0.5)) for a unit step → y[k] = 2(1 − 0.5^k).
    let r = single("dyn.blocks", json!({ "diagram": "u = step()\ny = dtf(u, num = [1], den = [1, -0.5], ts = 0.1)", "tEnd": 1, "dt": 0.1, "substeps": 4 }));
    let y = col(data(&r, "n"), 0, "y");
    for k in 0..=10 {
        assert!(close(y[k], 2.0 * (1.0 - 0.5f64.powi(k as i32)), 1e-12), "k {k}: {}", y[k]);
    }
    // A thermostat chart with hysteresis and a minimum on-time.
    let chart = "T = integrator((P*heat - k*(T - 5))/C, x0 = 15)\nheat = chart(states = [off, on], init = off, out = [0, 1], off -> on: T < 19, on -> off: T > 21 && after(60))";
    let r = single("dyn.blocks", json!({ "diagram": chart, "constants": "P = 2000, k = 50, C = 1e5", "tEnd": 20000, "dt": 5 }));
    let d = data(&r, "n");
    let temp = col(d, 0, "T");
    let late: Vec<f64> = temp[2000..].to_vec();
    let lo = late.iter().cloned().fold(f64::INFINITY, f64::min);
    let hi = late.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    assert!(lo > 18.8 && hi < 21.4 && hi > 20.9 && lo < 19.1, "{lo} … {hi}");
    let heat = col(d, 0, "heat");
    assert!(heat.iter().any(|v| *v == 1.0) && heat.iter().any(|v| *v == 0.0));
    // Euler (ode1) vs RK4 on x' = −x: Euler with h = 0.1 gives 0.9^10 at t = 1.
    let r = single("dyn.blocks", json!({ "diagram": "x = integrator(-x, x0 = 1)", "tEnd": 1, "dt": 0.1, "substeps": 1, "solver": "ode1" }));
    assert!(close(*col(data(&r, "n"), 0, "x").last().unwrap(), 0.9f64.powi(10), 1e-12));
    let r = single("dyn.blocks", json!({ "diagram": "x = integrator(-x, x0 = 1)", "tEnd": 1, "dt": 0.1, "substeps": 1, "solver": "ode2" }));
    assert!(close(*col(data(&r, "n"), 0, "x").last().unwrap(), 0.905f64.powi(10), 1e-12));
    // Errors name the problem.
    let r = run(json!({ "nodes": [node("n", "dyn.blocks", json!({ "diagram": "x = demux(b, 1)" }))], "links": [] }));
    assert!(error(&r, "n").contains("not a bus"), "{}", error(&r, "n"));
}

#[test]
fn ode_stiff_events_and_delays() {
    // Robertson kinetics with ode15s (TR-BDF2) and ode23s.
    for method in ["ode15s", "ode23s"] {
        let r = single("dyn.ode", json!({ "equations": "a' = -0.04*a + 1e4*b*c\nb' = 0.04*a - 1e4*b*c - 3e7*b^2\nc' = 3e7*b^2", "initial": "a = 1", "tEnd": 40, "dt": 1, "method": method, "tolerance": 1e-4 }));
        assert!(close(scalar(&r, "n", "a (end)"), 0.7158, 2e-3), "{method}");
        assert!(scalar(&r, "n", "steps") < 2000.0, "{method}");
    }
    // ode23 on the harmonic oscillator.
    let r = single("dyn.ode", json!({ "equations": "x' = v\nv' = -x", "initial": "x = 1", "tEnd": 10, "dt": 0.1, "method": "ode23", "tolerance": 1e-8 }));
    assert!(close(scalar(&r, "n", "x (end)"), 10f64.cos(), 1e-5));
    // A bouncing ball: every bounce keeps 80 % of the speed; the first impact at √(2h/g).
    let r = single("dyn.ode", json!({ "equations": "y' = v\nv' = -g", "constants": "g = 9.81", "initial": "y = 10", "tEnd": 8, "dt": 0.01, "events": "y, falling, v = -0.8*v" }));
    let d = data(&r, "n");
    let t1 = (20.0f64 / 9.81).sqrt();
    assert!(close(scalar(&r, "n", "first event time"), t1, 1e-6));
    let ev = &d.tables[1];
    assert!(ev.rows() >= 3);
    // Bounce k at t1 + 2·v1·(0.8 + … + 0.8^(k−1))/g with v1 = g·t1.
    let v1 = 9.81 * t1;
    let t2 = t1 + 2.0 * 0.8 * v1 / 9.81;
    assert!(close(ev.columns[1].values[1], t2, 1e-5), "{} vs {t2}", ev.columns[1].values[1]);
    assert!(col(d, 0, "y").iter().all(|v| *v > -1e-6));
    // A terminal event.
    let r = single("dyn.ode", json!({ "equations": "y' = v\nv' = -9.81", "initial": "y = 10", "tEnd": 5, "dt": 0.01, "events": "y, falling, stop" }));
    assert!(close(*col(data(&r, "n"), 0, "t").last().unwrap(), t1, 1e-6));
    // A delay equation (dde23): x' = −x(t − 1) with x = 1 before 0.
    let r = single("dyn.ode", json!({ "equations": "x' = -delay(x, tau)", "constants": "tau = 1", "initial": "x = 1", "tEnd": 2, "dt": 0.01, "method": "rk4", "substeps": 10 }));
    let t = 1.75;
    assert!(close(col(data(&r, "n"), 0, "x")[175], 1.0 - t + (t - 1.0) * (t - 1.0) / 2.0, 1e-6));
}

#[test]
fn control_design_root_locus_lqr_kalman_place() {
    // 1/(s(s+1)(s+2)): the locus crosses the imaginary axis at K = 6, ω = √2; breakaway at −0.4226.
    let r = single("ctrl.rlocus", json!({ "num": "1", "den": "1, 3, 2, 0", "points": 600 }));
    assert!(close(scalar(&r, "n", "critical gain"), 6.0, 1e-6), "{}", scalar(&r, "n", "critical gain"));
    assert!(close(scalar(&r, "n", "crossing frequency"), 2f64.sqrt(), 1e-4));
    assert!(close(scalar(&r, "n", "asymptote centroid"), -1.0, 1e-12));
    let d = data(&r, "n");
    let bp = d.tables.iter().find(|t| t.name == "breakaway points").unwrap();
    assert!(close(bp.columns[0].values[0], -1.0 + 1.0 / 3f64.sqrt(), 1e-6));
    // LQR of the double integrator (Q = I, R = 1): K = [1, √3].
    let r = single("ctrl.design", json!({ "mode": "lqr", "A": "0 1; 0 0", "B": "0; 1", "Q": "", "R": "" }));
    assert!(close(scalar(&r, "n", "K11"), 1.0, 1e-9) && close(scalar(&r, "n", "K12"), 3f64.sqrt(), 1e-9));
    assert_eq!(scalar(&r, "n", "closed loop stable"), 1.0);
    // Discrete LQR (scalar): x+ = 2x + u, Q = R = 1 → X = 2 + √5, K = 2X/(1 + X).
    let r = single("ctrl.design", json!({ "mode": "lqr", "domain": "discrete", "A": "2", "B": "1", "C": "1", "ts": 1 }));
    let x = 2.0 + 5f64.sqrt();
    assert!(close(scalar(&r, "n", "K11"), 2.0 * x / (1.0 + x), 1e-9));
    // Kalman filter (lqe) of x' = −x + w, y = x + v with Qn = Rn = 1: P = √2 − 1, L = P.
    let r = single("ctrl.design", json!({ "mode": "lqe", "A": "-1", "B": "1", "C": "1" }));
    assert!(close(scalar(&r, "n", "L11"), 2f64.sqrt() - 1.0, 1e-9));
    // Pole placement (controller and observer).
    let r = single("ctrl.design", json!({ "mode": "place", "A": "0 1; 0 0", "B": "0; 1", "poles": "-2±1i" }));
    assert!(close(scalar(&r, "n", "K11"), 5.0, 1e-9) && close(scalar(&r, "n", "K12"), 4.0, 1e-9));
    let r = single("ctrl.design", json!({ "mode": "place", "target": "observer", "A": "0 1; 0 0", "B": "0; 1", "C": "1 0", "poles": "-5, -6" }));
    assert!(close(scalar(&r, "n", "L11"), 11.0, 1e-9) && close(scalar(&r, "n", "L21"), 30.0, 1e-9));
}

#[test]
fn control_model_conversion_and_c2d() {
    // zpk → tf: 2(s + 1)/((s + 2)(s + 3)).
    let r = single("ctrl.convert", json!({ "form": "zpk", "zeros": "-1", "poles": "-2, -3", "gain": 2, "c2d": "zoh", "ts": 0.1, "tEnd": 5 }));
    let d = data(&r, "n");
    let tf = d.tables.iter().find(|t| t.name == "transfer function").unwrap();
    assert_eq!(tf.column("num").unwrap().values, vec![0.0, 2.0, 2.0]);
    assert_eq!(tf.column("den").unwrap().values, vec![1.0, 5.0, 6.0]);
    assert!(close(scalar(&r, "n", "DC gain"), 1.0 / 3.0, 1e-12));
    // ZOH is exact at the samples: the discrete and continuous step responses agree.
    let resp = &d.tables[0];
    let (yc, yd) = (&resp.column("continuous").unwrap().values, &resp.column("discrete").unwrap().values);
    assert!(yc.iter().zip(yd.iter()).all(|(a, b)| (a - b).abs() < 1e-9), "{:?} {:?}", &yc[..5], &yd[..5]);
    // ss → tf.
    let r = single("ctrl.convert", json!({ "form": "ss", "A": "0 1; -2 -3", "B": "0; 1", "C": "1 0", "D": 0, "c2d": "tustin", "ts": 0.05 }));
    let tf = data(&r, "n").tables.iter().find(|t| t.name == "transfer function").unwrap().clone();
    assert!(tf.column("den").unwrap().values.iter().zip([1.0, 3.0, 2.0]).all(|(a, b)| close(*a, b, 1e-9)));
    assert_eq!(scalar(&r, "n", "discrete stable"), 1.0);
}

fn table_node(id: &str, csv: &str) -> Value {
    node(id, "source.table", json!({ "data": csv }))
}

fn link(from: &str, to: &str) -> Value {
    json!({ "from": from, "to": to })
}

#[test]
fn hypothesis_tests_match_textbook_values() {
    // Student's sleep data (paired): mean difference 1.58, t = 4.062, p = 0.002833 (df 9).
    let csv = "a,b\n0.7,1.9\n-1.6,0.8\n-0.2,1.1\n-1.2,0.1\n-0.1,-0.1\n3.4,4.4\n3.7,5.5\n0.8,1.6\n0.0,4.6\n2.0,3.4\n";
    let run_test = |params: Value| run(json!({ "nodes": [table_node("d", csv), node("t", "stat.test", params)], "links": [link("d", "t")] }));
    let r = run_test(json!({ "test": "paired", "a": "b", "b": "a" }));
    assert!(close(scalar(&r, "t", "t"), 4.062127, 1e-5), "{}", scalar(&r, "t", "t"));
    assert!(close(scalar(&r, "t", "p"), 0.002832890, 1e-7), "{}", scalar(&r, "t", "p"));
    assert_eq!(scalar(&r, "t", "h"), 1.0);
    // Two-sample (pooled): t = −1.860813, p = 0.07918671 (df 18).
    let r = run_test(json!({ "test": "ttest2", "a": "a", "b": "b" }));
    assert!(close(scalar(&r, "t", "t"), -1.860813, 1e-5) && close(scalar(&r, "t", "p"), 0.07918671, 1e-6));
    // Welch: df = 17.776.
    let r = run_test(json!({ "test": "ttest2", "a": "a", "b": "b", "variance": "unequal" }));
    assert!(close(scalar(&r, "t", "df"), 17.77647, 1e-4));
    // One-way ANOVA of three groups.
    let csv3 = "g1,g2,g3\n6,8,13\n8,12,9\n4,9,11\n5,11,8\n3,6,7\n4,8,12\n";
    let r = run(json!({ "nodes": [table_node("d", csv3), node("t", "stat.test", json!({ "test": "anova1" }))], "links": [link("d", "t")] }));
    // Means 5, 9, 10; SSB = 84, SSW = 68, F = (84/2)/(68/15) = 9.264706.
    assert!(close(scalar(&r, "t", "F"), 9.264706, 1e-5), "{}", scalar(&r, "t", "F"));
    assert!(close(scalar(&r, "t", "p"), 0.002398, 1e-5), "{}", scalar(&r, "t", "p"));
    // χ² independence of a 2 × 2 table: χ² = 100·(20·40 − 30·10)²/(50·50·30·70) = 4.761905.
    let r = run(json!({ "nodes": [table_node("d", "x,y\n20,30\n10,40\n"), node("t", "stat.test", json!({ "test": "chi2" }))], "links": [link("d", "t")] }));
    assert!(close(scalar(&r, "t", "χ²"), 4.761905, 1e-5));
}

#[test]
fn svm_and_tree_classify_separable_data() {
    // Two Gaussian blobs and a third one for the multiclass case.
    let mut csv = String::from("x1,x2,label\n");
    let mut rng = sim_core::rng::Rng::new(7);
    for (cls, (cx, cy)) in [("a", (0.0, 0.0)), ("b", (4.0, 4.0)), ("c", (0.0, 5.0))] {
        for _ in 0..40 {
            csv.push_str(&format!("{},{},{cls}\n", cx + 0.6 * rng.normal(), cy + 0.6 * rng.normal()));
        }
    }
    for kernel in ["linear", "rbf"] {
        let r = run(json!({ "nodes": [table_node("d", &csv), node("m", "ml.svm", json!({ "target": "label", "kernel": kernel }))], "links": [link("d", "m")] }));
        assert!(scalar(&r, "m", "test accuracy") >= 95.0, "{kernel}: {}", scalar(&r, "m", "test accuracy"));
        assert_eq!(scalar(&r, "m", "classes"), 3.0);
        assert_eq!(data(&r, "m").grids.len(), 1);
    }
    let r = run(json!({ "nodes": [table_node("d", &csv), node("m", "ml.tree", json!({ "target": "label", "maxDepth": 4 }))], "links": [link("d", "m")] }));
    assert!(scalar(&r, "m", "test accuracy") >= 95.0);
    assert!(data(&r, "m").text.contains("if x"));
    // A regression tree on a step function finds the step exactly.
    let csv = (0..50).fold(String::from("x,y\n"), |s, i| s + &format!("{},{}\n", i, if i < 20 { 1.0 } else { 5.0 }));
    let r = run(json!({ "nodes": [table_node("d", &csv), node("m", "ml.tree", json!({ "target": "y", "task": "regression", "testFraction": 0 }))], "links": [link("d", "m")] }));
    assert!(close(scalar(&r, "m", "train R²"), 1.0, 1e-12));
    assert!(data(&r, "m").text.contains("x <= 19.5"));
}

#[test]
fn optimisation_lp_milp_fsolve_and_global_methods() {
    let r = single("opt.linprog", json!({ "variables": "x: 0 .. inf\ny: 0 .. inf", "objective": "3*x + 5*y", "goal": "maximize", "constraints": "x <= 4\n2*y <= 12\n3*x + 2*y <= 18" }));
    assert!(close(scalar(&r, "n", "optimum"), 36.0, 1e-9) && close(scalar(&r, "n", "x"), 2.0, 1e-9));
    // Shadow price of 3x + 2y ≤ 18 is 1, of 2y ≤ 12 is 1.5.
    let ct = &data(&r, "n").tables[1];
    let prices = &ct.column("shadow price").unwrap().values;
    assert!(close(prices[1], 1.5, 1e-5) && close(prices[2], 1.0, 1e-5), "{prices:?}");
    // Knapsack (intlinprog): values 10, 13, 7, 8, weights 5, 7, 4, 3, capacity 14 → items 1, 3, 4 (25)? best is 2+4+... check: 13+8 = 21 (w 10), 10+7+8 = 25 (w 12), 10+13 = 23 (w 12).
    let r = single("opt.linprog", json!({ "variables": "a: 0 .. 1 int\nb: 0 .. 1 int\nc: 0 .. 1 int\nd: 0 .. 1 int", "objective": "10*a + 13*b + 7*c + 8*d", "goal": "maximize", "constraints": "5*a + 7*b + 4*c + 3*d <= 14" }));
    assert!(close(scalar(&r, "n", "optimum"), 28.0, 1e-9), "{}", scalar(&r, "n", "optimum"));
    // fsolve: the circle and hyperbola meet at x = √(2 + √3) …
    let r = single("opt.fsolve", json!({ "variables": "x = 2, y = 0.5", "equations": "x^2 + y^2 = 4\nx*y = 1" }));
    let x = (2.0 + 3f64.sqrt()).sqrt();
    assert!(close(scalar(&r, "n", "x"), x, 1e-9) && close(scalar(&r, "n", "y"), 1.0 / x, 1e-9));
    assert_eq!(scalar(&r, "n", "converged"), 1.0);
    // The global methods find the minimum of the Rastrigin function in 2-D.
    for method in ["ga", "pso", "sa"] {
        let r = single("opt.minimize", json!({ "variables": "x: -5.12 .. 5.12 = 3\ny: -5.12 .. 5.12 = -3", "objective": "20 + x^2 - 10*cos(2*pi*x) + y^2 - 10*cos(2*pi*y)", "method": method, "maxIterations": 400, "seed": 3 }));
        assert!(scalar(&r, "n", "optimum") < 1e-3, "{method}: {}", scalar(&r, "n", "optimum"));
    }
    // Pattern search is a local method: a smooth bowl with a bound active.
    let r = single("opt.minimize", json!({ "variables": "x: -5 .. 5 = 4\ny: 0 .. 5 = 4", "objective": "(x - 1)^2 + (y + 2)^2", "method": "patternsearch" }));
    assert!(close(scalar(&r, "n", "x"), 1.0, 1e-5) && close(scalar(&r, "n", "y"), 0.0, 1e-9), "{} {}", scalar(&r, "n", "x"), scalar(&r, "n", "y"));
}

#[test]
fn signal_filters_wavelets_and_resampling() {
    // An elliptic low-pass removes a 300 Hz tone and keeps 20 Hz.
    let r = run(json!({
        "nodes": [
            node("s", "source.signal", json!({ "waveform": "sine", "frequency": 20, "fs": 2000, "duration": 1, "components": "300:1" })),
            node("f", "signal.filter", json!({ "design": "ellip", "type": "lowpass", "order": 6, "cutoff": 60, "ripple": 0.5, "attenuation": 60 })),
            node("w", "signal.wavelet", json!({ "wavelet": "db4", "levels": 5, "threshold": "soft" })),
            node("c", "signal.wavelet", json!({ "transform": "cwt", "fmin": 5, "fmax": 500, "scales": 48 })),
            node("d", "signal.multirate", json!({ "operation": "decimate", "factor": 4 })),
        ],
        "links": [link("s", "f"), link("s", "w"), link("s", "c"), link("s", "d")],
    }));
    let f = data(&r, "f");
    assert!(close(scalar(&r, "f", "RMS out"), (0.5f64).sqrt(), 0.01), "{}", scalar(&r, "f", "RMS out"));
    let _ = f;
    assert!(scalar(&r, "w", "reconstruction error") < 1e-9);
    let pf = scalar(&r, "c", "peak frequency");
    assert!(close(pf, 300.0, 30.0) || close(pf, 20.0, 3.0), "{pf}");
    // Decimating by 4 → 500 Hz; the 300 Hz tone is filtered out, 20 Hz stays.
    assert!(close(scalar(&r, "d", "sample rate out"), 500.0, 1e-6), "{}", scalar(&r, "d", "sample rate out"));
    let y = col(data(&r, "d"), 0, "y");
    let rms = (y[50..450].iter().map(|v| v * v).sum::<f64>() / 400.0).sqrt();
    assert!(close(rms, 0.5f64.sqrt(), 0.01), "{rms}");
}

struct Fixtures;
impl sim_core::Host for Fixtures {
    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join(path);
        std::fs::read(&p).map_err(|e| format!("{}: {e}", p.display()))
    }
}

#[test]
fn mat_files_of_every_kind_and_v73() {
    let model = json!({ "nodes": [
        node("v5", "io.readFile", json!({ "path": "kinds.mat" })),
        node("v73", "io.readFile", json!({ "path": "kinds73.mat" })),
    ], "links": [] });
    let r = run_model(&model.to_string(), &mut |_| {}, &|| false, &Fixtures);
    assert!(r.ok, "{:?}", r.error);
    let d = data(&r, "v5");
    assert!(d.text.contains("title = 'Bridge test'"), "{}", d.text);
    assert_eq!(d.get_scalar("c{1}"), Some(1.5));
    assert!(d.text.contains("c{2} = 'two'"));
    assert_eq!(d.get_scalar("p(2).age"), Some(47.0));
    assert!(d.text.contains("p(1).name = 'Ann'"));
    assert_eq!(d.get_scalar("opts.tol"), Some(1e-6));
    let s = d.tables.iter().find(|t| t.name == "S").expect("sparse S");
    assert_eq!(s.columns[2].values, vec![3.0, 0.0]);
    assert_eq!(s.columns[0].values, vec![0.0, 4.0]);
    let v = d.tables.iter().find(|t| t.name == "variables").unwrap();
    assert_eq!(v.column("z_im").unwrap().values[..2], [2.0, -1.0]);
    assert_eq!(v.column("ok").unwrap().values[..3], [1.0, 0.0, 1.0]);
    assert_eq!(v.column("n8").unwrap().values[..2], [-3.0, 7.0]);
    // 2 × 3 × 4 (column-major 0 … 23): page 3 starts at 12.
    let page = d.tables.iter().find(|t| t.name == "cube(:,:,3)").unwrap();
    assert_eq!(page.columns[0].values, vec![12.0, 13.0]);
    // v7.3 (HDF5).
    let d = data(&r, "v73");
    assert_eq!(d.get_scalar("gain"), Some(2.5));
    let m = d.tables.iter().find(|t| t.name == "M").unwrap();
    assert_eq!(m.columns[1].values, vec![1.0, 5.0, 9.0]);
    let v = d.tables.iter().find(|t| t.name == "variables").unwrap();
    let wave = &v.column("wave").unwrap().values;
    assert_eq!(wave.len(), 5000);
    assert!(close(wave[4999], 20f64.sin(), 1e-12));
    assert_eq!(v.column("flags").unwrap().values[..3], [1.0, 0.0, 1.0]);
    assert_eq!(v.column("i16").unwrap().values[..2], [-5.0, 6.0]);
    assert_eq!(v.column("z_im").unwrap().values[..2], [2.0, -1.0]);
    assert!(d.text.contains("name = 'Hello'"), "{}", d.text);
    assert_eq!(d.get_scalar("c{1}"), Some(7.0));
    assert!(d.text.contains("c{2} = 'cell text'"));
    assert_eq!(d.get_scalar("opts.tol"), Some(1e-6));
    assert!(d.text.contains("opts.method = 'ode45'"));
    assert!(d.text.contains("empty is empty"));
}

#[test]
fn svm_handles_large_data() {
    // 10 000 rows (the old solver stopped at 3 000): two overlapping rings, RBF kernel.
    let mut csv = String::from("x1,x2,label\n");
    let mut rng = sim_core::rng::Rng::new(11);
    for k in 0..10_000 {
        let inner = k % 2 == 0;
        let r = if inner { 1.0 } else { 2.2 } + 0.25 * rng.normal();
        let a = rng.uniform() * std::f64::consts::TAU;
        csv.push_str(&format!("{},{},{}\n", r * a.cos(), r * a.sin(), if inner { "in" } else { "out" }));
    }
    let started = std::time::Instant::now();
    let r = run(json!({ "nodes": [table_node("d", &csv), node("m", "ml.svm", json!({ "target": "label", "kernel": "rbf", "testFraction": 0.2, "map": false }))], "links": [link("d", "m")] }));
    let secs = started.elapsed().as_secs_f64();
    assert!(scalar(&r, "m", "test accuracy") > 97.0, "{}", scalar(&r, "m", "test accuracy"));
    assert!(secs < 60.0, "took {secs} s");
    eprintln!("svm 10k rows: {secs:.2} s, support vectors {}", scalar(&r, "m", "support vectors"));
}
