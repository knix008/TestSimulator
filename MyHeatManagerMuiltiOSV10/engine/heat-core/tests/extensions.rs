//! Validation of the phase-4 extensions: time-dependent boundary conditions,
//! cp(T) enthalpy formulation, surface-to-surface radiation, thin layers and
//! convection correlations.

use heat_core::convection::{h_correlation, nu_horizontal_down, nu_horizontal_up, nu_plate, nu_vertical, rayleigh};
use heat_core::model::HMode;
use heat_core::{conduction, decode, mesh, model, run, Decoded};
use serde_json::{json, Value};

const SIGMA: f64 = 5.670374e-8;

fn solve(model: &Value) -> Decoded {
    let bytes = run(&model.to_string(), &mut |_| {}, &|| false);
    let d = decode(&bytes).expect("decodable result");
    assert!(d.ok(), "run failed: {}", d.header["error"]);
    d
}

fn bc<'a>(d: &'a Decoded, id: &str) -> &'a Value {
    d.header["boundaries"].as_array().unwrap().iter().find(|b| b["id"] == id).unwrap()
}

fn heat(d: &Decoded, id: &str) -> f64 {
    bc(d, id)["heat"].as_f64().unwrap()
}

fn balance(d: &Decoded) -> f64 {
    d.header["balance"]["error"].as_f64().unwrap()
}

/// erfc (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7).
fn erfc(x: f64) -> f64 {
    if x < 0.0 {
        return 2.0 - erfc(-x);
    }
    let t = 1.0 / (1.0 + 0.3275911 * x);
    let p = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    p * (-x * x).exp()
}

// ------------------------------------------------- time-dependent boundaries

/// 1D slab (k = 1, ρcp = 10⁶ → α = 1e-6 m²/s), 100 mm, 0.5 mm cells.
fn slab(left: Value, end: f64, dt: f64, frames: usize) -> Value {
    json!({
        "domain": { "dim": 2, "width": 100, "height": 1, "depth": 1, "nx": 200, "ny": 1, "background": "m" },
        "ambient": 0,
        "materials": [{ "id": "m", "k": 1, "rho": 1000, "cp": 1000 }],
        "boundaries": [left],
        "study": { "type": "transient", "endTime": end, "dt": dt, "frames": frames, "initialT": 0, "tolerance": 1e-12 }
    })
}

#[test]
fn temperature_ramp_matches_semi_infinite_solution() {
    // Surface temperature T = c·t (c = 1 K/s): T(x, t) = c t [(1 + 2η²) erfc η − 2η e^(−η²)/√π],
    // η = x / (2√(αt)).
    let left = json!({ "id": "ramp", "target": "left", "type": "temperature", "T": 999, "Tt": [[0, 0], [100, 100]] });
    let d = solve(&slab(left, 100.0, 0.1, 10));
    let t = d.field("T", 10).unwrap();
    let alpha = 1e-6;
    for &i in &[4usize, 10, 20, 40] {
        let x = (i as f64 + 0.5) * 0.5e-3;
        let eta = x / (2.0 * (alpha * 100.0f64).sqrt());
        let exact = 100.0 * ((1.0 + 2.0 * eta * eta) * erfc(eta) - 2.0 * eta * (-eta * eta).exp() / std::f64::consts::PI.sqrt());
        assert!((t[i] as f64 - exact).abs() < 0.3, "x = {x}: {} vs {exact}", t[i]);
    }
    // The table overrides the constant T (999) at every time.
    let t5 = d.field("T", 5).unwrap();
    assert!((t5[0] as f64) < 50.0 && (t5[0] as f64) > 40.0, "{}", t5[0]);
    assert!(balance(&d) < 1e-6, "balance {}", balance(&d));
}

#[test]
fn flux_step_and_energy_bookkeeping() {
    // Flux switched on at t = 50 s: T(x, τ) = (2q/k)√(ατ/π) e^(−x²/4ατ) − (qx/k) erfc(x/2√(ατ)).
    let left = json!({ "id": "q", "target": "left", "type": "flux", "q": 0, "qt": [[0, 0], [50, 0], [50, 1000]] });
    // One frame per step: Σ heat·dt over the frames must equal the stored energy exactly.
    let d = solve(&slab(left, 150.0, 0.5, 300));
    let frames = d.frames("T");
    let t = d.field("T", frames - 1).unwrap();
    let (q, k, alpha, tau): (f64, f64, f64, f64) = (1000.0, 1.0, 1e-6, 100.0);
    for &i in &[0usize, 4, 10] {
        let x = (i as f64 + 0.5) * 0.5e-3;
        let s = (alpha * tau).sqrt();
        let exact = 2.0 * q / k * (s * s / std::f64::consts::PI).sqrt() * (-x * x / (4.0 * s * s)).exp() - q * x / k * erfc(x / (2.0 * s));
        assert!(((t[i] as f64) - exact).abs() < 0.02 * exact, "x = {x}: {} vs {exact}", t[i]);
    }
    let hist: Vec<f64> = bc(&d, "q")["history"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
    assert_eq!(hist[0], 0.0);
    assert!(hist[100].abs() < 1e-12, "before the step: {}", hist[100]);
    let input: f64 = hist[1..].iter().sum::<f64>() * 0.5;
    let stored: f64 = t.iter().map(|&v| v as f64 * 1e6 * 0.5e-3 * 1e-3 * 1e-3).sum();
    assert!((input - 1000.0 * 1e-6 * 100.0).abs() < 1e-9, "input {input}");
    assert!((input - stored).abs() < 1e-5 * input, "input {input} stored {stored}");
}

#[test]
fn convection_coefficient_and_fluid_temperature_tables() {
    // Lumped block (high k): adiabatic until h switches on at t = 10 s, then
    // T = 100 exp(−hA(t − 10)/(ρcV)) towards Tinf = 0 (Tinft table).
    let m = json!({
        "domain": { "dim": 2, "width": 10, "height": 10, "depth": 10, "nx": 4, "ny": 4, "background": "cu" },
        "ambient": 0,
        "materials": [{ "id": "cu", "k": 1e5, "rho": 1000, "cp": 1000 }],
        "boundaries": [{ "id": "c", "target": "right", "type": "convection", "h": 7, "Tinf": 55,
                         "ht": [[0, 0], [10, 0], [10, 50]], "Tinft": [[0, 0]] }],
        "study": { "type": "transient", "endTime": 110, "dt": 0.05, "frames": 11, "initialT": 100, "tolerance": 1e-12 }
    });
    let d = solve(&m);
    let t1 = d.field("T", 1).unwrap()[0] as f64; // t = 10 s
    assert!((t1 - 100.0).abs() < 1e-6, "{t1}");
    let tend = d.field("T", 11).unwrap()[5] as f64;
    let tau: f64 = 1000.0 * 1000.0 * 0.01 * 0.01 * 0.01 / (50.0 * 0.01 * 0.01);
    let exact = 100.0 * (-100.0 / tau).exp();
    assert!((tend - exact).abs() < 0.01 * exact, "{tend} vs {exact}");
}

#[test]
fn steady_studies_use_the_table_value_at_time_zero() {
    let base = |bcv: Value| {
        json!({
            "domain": { "dim": 2, "width": 20, "height": 10, "depth": 10, "nx": 20, "ny": 2, "background": "m" },
            "ambient": 0,
            "materials": [{ "id": "m", "k": 10, "emissivity": 0.9 }],
            "boundaries": [{ "id": "h", "target": "left", "type": "temperature", "T": 300 }, bcv],
            "study": { "type": "steady", "tolerance": 1e-12 }
        })
    };
    let a = solve(&base(json!({ "id": "r", "target": "right", "type": "radiation", "emissivity": 0.9, "Tamb": 100 })));
    let b = solve(&base(json!({ "id": "r", "target": "right", "type": "radiation", "emissivity": 0.9, "Tamb": 0,
                                 "Tambt": [[0, 100], [10, 0]] })));
    assert!((heat(&a, "r") - heat(&b, "r")).abs() < 1e-9 * heat(&a, "r").abs());
    let c = solve(&base(json!({ "id": "r", "target": "right", "type": "temperature", "T": 0, "Tt": [[0, 100], [5, 0]] })));
    let e = solve(&base(json!({ "id": "r", "target": "right", "type": "temperature", "T": 100 })));
    assert!((heat(&c, "h") - heat(&e, "h")).abs() < 1e-9 * heat(&e, "h").abs());
}

// ------------------------------------------------------------- cp(T)

fn cpt_block(cpt: Value) -> Value {
    json!({
        "domain": { "dim": 2, "width": 10, "height": 10, "depth": 10, "nx": 5, "ny": 5, "background": null },
        "ambient": 0,
        "materials": [{ "id": "m", "k": 50, "rho": 1000, "cp": 777, "cpT": cpt }],
        "bodies": [{ "id": "b", "shape": "rect", "x": 0, "y": 0, "w": 10, "h": 10, "material": "m", "power": 1 }],
        "boundaries": [],
        "study": { "type": "transient", "endTime": 100, "dt": 5, "frames": 2, "initialT": 0 }
    })
}

#[test]
fn cp_of_t_conserves_energy_in_an_adiabatic_block() {
    // m = 1e-3 kg, P = 1 W, cp = 500 + 10 T → h(T) = 500 T + 5 T².
    // E = 50 J → T = (−100 + √50000)/2 = 61.803…; E = 100 J → T = 100.
    let d = solve(&cpt_block(json!([[0, 500], [100, 1500]])));
    let t50 = d.field("T", 1).unwrap()[12] as f64;
    let t100 = d.field("T", 2).unwrap()[12] as f64;
    let e50 = (-100.0 + 50000f64.sqrt()) / 2.0;
    assert!((t50 - e50).abs() < 2e-3, "{t50} vs {e50}");
    assert!((t100 - 100.0).abs() < 2e-3, "{t100}");
    assert!(balance(&d) < 1e-4, "balance {}", balance(&d));
    // Beyond the table cp is clamped (1500): 50 J more → +33.33 K.
    let mut m = cpt_block(json!([[0, 500], [100, 1500]]));
    m["study"]["endTime"] = json!(150);
    m["study"]["frames"] = json!(3);
    let d = solve(&m);
    let t150 = d.field("T", 3).unwrap()[12] as f64;
    assert!((t150 - (100.0 + 50.0 / 1.5)).abs() < 2e-3, "{t150}");
    // A constant table gives the constant-cp answer.
    let d = solve(&cpt_block(json!([[0, 1000], [100, 1000]])));
    assert!((d.field("T", 2).unwrap()[12] as f64 - 100.0).abs() < 1e-3);
}

// ------------------------------------------------ surface-to-surface radiation

fn thermal_of(m: &Value) -> (model::Model, mesh::Mesh) {
    let (mo, errs) = model::parse(&m.to_string());
    assert!(errs.is_empty(), "{errs:?}");
    let mo = mo.unwrap();
    let me = mesh::build(&mo);
    (mo, me)
}

#[test]
fn s2s_parallel_plates_match_the_infinite_plate_formula() {
    let (t1, t2, e): (f64, f64, f64) = (500.0, 100.0, 0.8);
    let m = json!({
        "domain": { "dim": 2, "width": 400, "height": 4, "depth": 10, "nx": 400, "ny": 4, "background": null },
        "ambient": 25,
        "materials": [{ "id": "p", "k": 1e4, "emissivity": e }],
        "bodies": [
            { "id": "lo", "shape": "rect", "x": 0, "y": 0, "w": 400, "h": 1, "material": "p" },
            { "id": "hi", "shape": "rect", "x": 0, "y": 3, "w": 400, "h": 1, "material": "p" }
        ],
        "boundaries": [
            { "id": "hot", "target": "bottom", "type": "temperature", "T": t1 },
            { "id": "cold", "target": "top", "type": "temperature", "T": t2 }
        ],
        "study": { "type": "steady", "s2s": true, "tolerance": 1e-10 }
    });
    let d = solve(&m);
    let (k1, k2) = (t1 + 273.15, t2 + 273.15);
    let q = SIGMA * (k1.powi(4) - k2.powi(4)) / (1.0 / e + 1.0 / e - 1.0);
    let qr = d.field("qrad", 0).unwrap();
    let mid = 200;
    let qhot = -(qr[mid] as f64);
    let qcold = qr[3 * 400 + mid] as f64;
    assert!((qhot / q - 1.0).abs() < 0.03, "hot {qhot} vs {q}");
    assert!((qcold / q - 1.0).abs() < 0.03, "cold {qcold} vs {q}");
    // Void cells: NaN; the heat entering at the hot side leaves at the cold side
    // (a little escapes through the 2 mm side openings).
    assert!(qr[400 + mid].is_nan());
    let (hh, hc) = (heat(&d, "hot"), heat(&d, "cold"));
    assert!(hh > 0.0 && hc < 0.0 && (hh + hc).abs() < 0.03 * hh, "{hh} {hc}");
    assert!(balance(&d) < 1e-4, "balance {}", balance(&d));
    assert!(d.header["s2s"]["patches"].as_u64().unwrap() > 0);
}

#[test]
fn s2s_enclosure_reciprocity_and_closure_2d() {
    // 40 × 40 mm square cavity inside a solid frame (closed: no openings).
    let m = json!({
        "domain": { "dim": 2, "width": 60, "height": 60, "depth": 10, "nx": 30, "ny": 30, "background": "s" },
        "ambient": 25,
        "materials": [{ "id": "s", "k": 10, "emissivity": 0.5 }, { "id": "v", "k": 1 }],
        "bodies": [],
        "boundaries": [{ "id": "t", "target": "left", "type": "temperature", "T": 25 }],
        "study": { "type": "steady", "s2s": true }
    });
    // Carve the cavity: background void with a solid frame drawn as four bodies.
    let mut m = m;
    m["domain"]["background"] = Value::Null;
    m["bodies"] = json!([
        { "id": "b", "shape": "rect", "x": 0, "y": 0, "w": 60, "h": 10, "material": "s" },
        { "id": "t", "shape": "rect", "x": 0, "y": 50, "w": 60, "h": 10, "material": "s" },
        { "id": "l", "shape": "rect", "x": 0, "y": 10, "w": 10, "h": 40, "material": "s" },
        { "id": "r", "shape": "rect", "x": 50, "y": 10, "w": 10, "h": 40, "material": "s" }
    ]);
    let (mo, me) = thermal_of(&m);
    let th = conduction::Thermal::new(&mo, &me);
    let r = th.s2s.as_ref().expect("s2s built");
    assert!(r.open_area.is_empty());
    let n = r.patches();
    // 20 faces per wall (cell indices 5…24) in grid-aligned blocks of 4: 1+4+1 runs.
    assert_eq!(n, 4 * 6);
    for i in 0..n {
        assert!((r.row_sum(i) - 1.0).abs() < 1e-9, "row {i}: {}", r.row_sum(i));
        assert!(r.f_amb[i] < 1e-6, "row {i} leaks {}", r.f_amb[i]);
        for j in 0..n {
            let (a, b) = (r.area[i] * r.f(i, j), r.area[j] * r.f(j, i));
            assert!((a - b).abs() < 1e-12 * r.area[i], "reciprocity {i} {j}");
        }
    }
    // Opposite walls of a square: F = √2 − 1; adjacent walls: 1 − √2/2.
    let wall = |i: usize| -> usize {
        let f = &r.faces.iter().find(|f| f.patch as usize == i).unwrap();
        f.d as usize
    };
    let (mut opp, mut adj, mut abot) = (0.0, 0.0, 0.0);
    for i in 0..n {
        if wall(i) != 3 {
            continue; // bottom wall faces point up (+y)
        }
        abot += r.area[i];
        for j in 0..n {
            match wall(j) {
                2 => opp += r.area[i] * r.f(i, j),
                0 => adj += r.area[i] * r.f(i, j),
                _ => {}
            }
        }
    }
    assert!((opp / abot - (2f64.sqrt() - 1.0)).abs() < 2e-3, "opposite {}", opp / abot);
    assert!((adj / abot - (1.0 - 0.5 * 2f64.sqrt())).abs() < 2e-3, "adjacent {}", adj / abot);
}

#[test]
fn s2s_obstruction_blocks_the_view() {
    // Two plates facing each other with an opaque wall between them see (almost) nothing.
    let mk = |wall: bool| {
        let mut bodies = vec![
            json!({ "id": "a", "shape": "rect", "x": 0, "y": 0, "w": 40, "h": 2, "material": "s" }),
            json!({ "id": "b", "shape": "rect", "x": 0, "y": 38, "w": 40, "h": 2, "material": "s" }),
        ];
        if wall {
            bodies.push(json!({ "id": "w", "shape": "rect", "x": 0, "y": 19, "w": 40, "h": 2, "material": "s" }));
        }
        json!({
            "domain": { "dim": 2, "width": 40, "height": 40, "depth": 10, "nx": 20, "ny": 20, "background": null },
            "ambient": 25, "materials": [{ "id": "s", "k": 10, "emissivity": 0.9 }], "bodies": bodies,
            "boundaries": [], "study": { "type": "steady", "s2s": true }
        })
    };
    for (wall, expect_low) in [(false, false), (true, true)] {
        let (mo, me) = thermal_of(&mk(wall));
        let th = conduction::Thermal::new(&mo, &me);
        let r = th.s2s.as_ref().unwrap();
        // Sum of A·F from the bottom plate's top face to the top plate's bottom face.
        let mut s = 0.0;
        for f in r.faces.iter().filter(|f| f.d == 3 && (f.cell as usize) < 20 * 1 + 20) {
            let i = f.patch as usize;
            for g in r.faces.iter().filter(|g| g.d == 2 && (g.cell as usize) >= 20 * 19) {
                s += r.f(i, g.patch as usize) * f.area / r.faces.iter().filter(|x| x.patch == f.patch).count() as f64;
            }
        }
        if expect_low {
            assert!(s < 1e-12, "blocked view {s}");
        } else {
            assert!(s > 0.0);
        }
    }
}

#[test]
fn s2s_cube_cavity_3d_is_sane() {
    // 20 mm cube cavity in a 40 mm solid block; hot floor, cold ceiling.
    let m = json!({
        "domain": { "dim": 3, "width": 40, "height": 40, "depth": 40, "nx": 20, "ny": 20, "nz": 20, "background": null },
        "ambient": 25,
        "materials": [{ "id": "s", "k": 1, "emissivity": 0.9 }],
        "bodies": [
            { "id": "f", "shape": "rect", "x": 0, "y": 0, "w": 40, "h": 10, "z0": 0, "z1": 40, "material": "s" },
            { "id": "c", "shape": "rect", "x": 0, "y": 30, "w": 40, "h": 10, "z0": 0, "z1": 40, "material": "s" },
            { "id": "l", "shape": "rect", "x": 0, "y": 10, "w": 10, "h": 20, "z0": 0, "z1": 40, "material": "s" },
            { "id": "r", "shape": "rect", "x": 30, "y": 10, "w": 10, "h": 20, "z0": 0, "z1": 40, "material": "s" },
            { "id": "fr", "shape": "rect", "x": 10, "y": 10, "w": 20, "h": 20, "z0": 0, "z1": 10, "material": "s" },
            { "id": "bk", "shape": "rect", "x": 10, "y": 10, "w": 20, "h": 20, "z0": 30, "z1": 40, "material": "s" }
        ],
        "boundaries": [
            { "id": "hot", "target": "bottom", "type": "temperature", "T": 400 },
            { "id": "cold", "target": "top", "type": "temperature", "T": 20 }
        ],
        "study": { "type": "steady", "s2s": true }
    });
    let (mo, me) = thermal_of(&m);
    let th = conduction::Thermal::new(&mo, &me);
    let r = th.s2s.as_ref().unwrap();
    let n = r.patches();
    assert_eq!(n, 6 * 9); // 10×10 faces per wall in 4×4 blocks → 3×3 patches
    let (mut ff, mut afl) = (0.0, 0.0);
    for i in 0..n {
        assert!((r.row_sum(i) - 1.0).abs() < 1e-6, "row {i}");
        assert!(r.f_amb[i] < 1e-3, "row {i} leaks {}", r.f_amb[i]);
        let fi = r.faces.iter().find(|f| f.patch as usize == i).unwrap();
        if fi.d == 3 {
            afl += r.area[i];
            for j in 0..n {
                let fj = r.faces.iter().find(|f| f.patch as usize == j).unwrap();
                if fj.d == 2 {
                    ff += r.area[i] * r.f(i, j);
                }
                let (a, b) = (r.area[i] * r.f(i, j), r.area[j] * r.f(j, i));
                assert!((a - b).abs() < 1e-9 * r.area[i]);
            }
        }
    }
    // Parallel squares at unit spacing: F = 0.19982.
    assert!((ff / afl - 0.19982).abs() < 0.02, "floor → ceiling {}", ff / afl);
    let d = solve(&m);
    assert!(balance(&d) < 1e-3, "balance {}", balance(&d));
    let qr = d.field("qrad", 0).unwrap();
    assert!(qr.iter().any(|v| v.is_finite() && *v < -100.0) && qr.iter().any(|v| v.is_finite() && *v > 100.0));
    // Radiation adds a parallel path: more heat than conduction through the side walls alone.
    let mut m2 = m.clone();
    m2["study"]["s2s"] = json!(false);
    let d2 = solve(&m2);
    assert!(heat(&d, "hot") > heat(&d2, "hot") * 1.05, "{} vs {}", heat(&d, "hot"), heat(&d2, "hot"));
    // Closed cavity: no exchange with the ambient.
    assert!(d.header["s2s"]["heat"].as_f64().unwrap().abs() < 1e-3 * heat(&d, "hot"));
}

// ------------------------------------------------------------- thin layers

fn two_blocks(extra: Value) -> Value {
    json!({
        "domain": { "dim": 2, "width": 20, "height": 10, "depth": 10, "nx": 20, "ny": 5, "background": null },
        "ambient": 0,
        "materials": [{ "id": "a", "k": 10 }, { "id": "b", "k": 20 }],
        "bodies": [
            { "id": "A", "shape": "rect", "x": 0, "y": 0, "w": 10, "h": 10, "material": "a" },
            { "id": "B", "shape": "rect", "x": 10, "y": 0, "w": 10, "h": 10, "material": "b" }
        ],
        "boundaries": [
            { "id": "hot", "target": "left", "type": "temperature", "T": 100 },
            { "id": "cold", "target": "right", "type": "temperature", "T": 0 },
            extra
        ],
        "study": { "type": "steady", "tolerance": 1e-12 }
    })
}

#[test]
fn resistive_thin_layer_equals_contact_resistance() {
    let c = solve(&two_blocks(json!({ "id": "tl", "target": "body:A", "type": "contact", "resistance": 1e-3 })));
    // A body target covers the whole body surface; the region keeps only the interface.
    let l = solve(&two_blocks(json!({ "id": "tl", "target": "body:A", "type": "thinLayer", "thickness": 0.5, "k": 0.5,
                                       "region": [9, 0, 11, 10] })));
    let q = 100.0 / (0.01 / 10.0 + 0.01 / 20.0 + 1e-3) * 1e-4;
    assert!((heat(&l, "hot") - q).abs() < 1e-8, "{}", heat(&l, "hot"));
    assert!((heat(&l, "hot") - heat(&c, "hot")).abs() < 1e-10);
    assert!((heat(&l, "tl") + q).abs() < 1e-8, "{}", heat(&l, "tl"));
    assert!((bc(&l, "tl")["area"].as_f64().unwrap() - 1e-4).abs() < 1e-15);
    assert!(balance(&l) < 1e-9);
    let tc = c.field("T", 0).unwrap();
    let tl = l.field("T", 0).unwrap();
    for i in 0..tc.len() {
        assert!((tc[i] - tl[i]).abs() < 1e-4);
    }
    // Without the region the layer also sits under the hot edge condition: two resistances.
    let w = solve(&two_blocks(json!({ "id": "tl", "target": "body:A", "type": "thinLayer", "thickness": 0.5, "k": 0.5 })));
    let q2 = 100.0 / (0.01 / 10.0 + 0.01 / 20.0 + 2e-3) * 1e-4;
    assert!((heat(&w, "hot") - q2).abs() < 1e-8, "{}", heat(&w, "hot"));
}

#[test]
fn thin_layers_in_series_on_an_edge_and_an_interface() {
    // Layer on the hot edge (R1 = 0.2 mm / 0.1) plus layers on both sides of the
    // interface (R2 = 1 mm / 2 and R3 = 0.3 mm / 1): Q = ΔT / (ΣR + L1/k1 + L2/k2) · A.
    let mut m = two_blocks(json!({ "id": "e", "target": "left", "type": "thinLayer", "thickness": 0.2, "k": 0.1 }));
    m["boundaries"].as_array_mut().unwrap().push(json!({ "id": "ia", "target": "body:A", "type": "thinLayer", "thickness": 1, "k": 2,
        "region": [9, 0, 11, 10] }));
    m["boundaries"].as_array_mut().unwrap().push(json!({ "id": "ib", "target": "body:B", "type": "thinLayer", "thickness": 0.3, "k": 1,
        "region": [9, 0, 11, 10] }));
    let d = solve(&m);
    let r = 0.2e-3 / 0.1 + 1e-3 / 2.0 + 0.3e-3 / 1.0 + 0.01 / 10.0 + 0.01 / 20.0;
    let q = 100.0 / r * 1e-4;
    assert!((heat(&d, "hot") - q).abs() < 1e-9, "{} vs {q}", heat(&d, "hot"));
    assert!((heat(&d, "e") - q).abs() < 1e-9, "{}", heat(&d, "e"));
    // The A-side layer of the interface reports heat leaving A.
    assert!((heat(&d, "ia") + q).abs() < 1e-9, "{}", heat(&d, "ia"));
    assert!(balance(&d) < 1e-9);
}

#[test]
fn conductive_thin_layer_adds_in_plane_conduction() {
    // Copper ends at 100 / 0 °C joined by a poorly conducting 40 mm middle; a
    // conductive layer (k·d = 400 · 0.5 mm) on the bottom edge bridges it.
    let mk = |mode: &str| {
        json!({
            "domain": { "dim": 2, "width": 60, "height": 10, "depth": 10, "nx": 60, "ny": 10, "background": null },
            "ambient": 0,
            "materials": [{ "id": "cu", "k": 40000 }, { "id": "ins", "k": 0.1 }],
            "bodies": [
                { "id": "L", "shape": "rect", "x": 0, "y": 0, "w": 10, "h": 10, "material": "cu" },
                { "id": "M", "shape": "rect", "x": 10, "y": 0, "w": 40, "h": 10, "material": "ins" },
                { "id": "R", "shape": "rect", "x": 50, "y": 0, "w": 10, "h": 10, "material": "cu" }
            ],
            "boundaries": [
                { "id": "hot", "target": "left", "type": "temperature", "T": 100 },
                { "id": "cold", "target": "right", "type": "temperature", "T": 0 },
                { "id": "film", "target": "bottom", "type": "thinLayer", "thickness": 0.5, "k": 400, "mode": mode }
            ],
            "study": { "type": "steady", "tolerance": 1e-12 }
        })
    };
    let res = solve(&mk("resistive"));
    let con = solve(&mk("conductive"));
    // Resistive on an adiabatic edge changes nothing: Q = ΔT k A / L through the insulator (+ copper).
    let q_ins = 100.0 / (0.040 / 0.1 + 0.02 / 40000.0) * 1e-4;
    assert!((heat(&res, "hot") / q_ins - 1.0).abs() < 1e-6, "{}", heat(&res, "hot"));
    // Conductive: the layer conducts k·d·depth/L · ΔT in parallel, L = 41 mm between the
    // centres of the last copper cells (the layer is attached to cell centres).
    let q_layer = 400.0 * 0.5e-3 * 0.01 / 0.041 * 100.0;
    let q = heat(&con, "hot");
    assert!((q / (q_ins + q_layer) - 1.0).abs() < 0.02, "{q} vs {}", q_ins + q_layer);
    assert!(balance(&con) < 1e-8);
}

// ------------------------------------------------------ convection correlations

#[test]
fn correlations_match_textbook_values() {
    // Vertical plate 0.5 m, ΔT = 30 K in 25 °C air: h ≈ 4.5 W/m²K.
    let h = h_correlation(HMode::NaturalVertical, 55.0, 25.0, 0.5, 0.0);
    assert!(h > 4.0 && h < 5.0, "vertical {h}");
    let (ra, k, pr) = rayleigh(55.0, 25.0, 0.5);
    assert!((ra / 2.8e8 - 1.0).abs() < 0.05, "Ra {ra}");
    assert!((h - nu_vertical(ra, pr) * k / 0.5).abs() < 1e-12);
    // Churchill–Chu, Incropera Example 9.2: Ra = 1.813e9, Pr = 0.69 → Nu = 147.
    assert!((nu_vertical(1.813e9, 0.69) - 147.0).abs() < 1.0, "{}", nu_vertical(1.813e9, 0.69));
    // Horizontal plates: 0.54 Ra^¼ / 0.15 Ra^⅓ (up), 0.27 Ra^¼ (down).
    assert!((nu_horizontal_up(1e6) - 0.54 * 1e6f64.powf(0.25)).abs() < 1e-9);
    assert!((nu_horizontal_up(1e9) - 0.15 * 1e3).abs() < 1e-9);
    assert!((nu_horizontal_down(1e8) - 0.27 * 100.0).abs() < 1e-9);
    let up = h_correlation(HMode::NaturalHorizontalUp, 80.0, 20.0, 0.25, 0.0);
    let down = h_correlation(HMode::NaturalHorizontalDown, 80.0, 20.0, 0.25, 0.0);
    assert!(up > 1.8 * down && up > 5.0 && up < 9.0, "up {up} down {down}");
    // A cold plate facing up behaves like a hot plate facing down.
    let cold_up = h_correlation(HMode::NaturalHorizontalUp, 0.0, 20.0, 0.25, 0.0);
    let (ra_c, kc, _) = rayleigh(0.0, 20.0, 0.25);
    assert!((cold_up - nu_horizontal_down(ra_c) * kc / 0.25).abs() < 1e-12);
    // Flat plate: Re = 1e5 laminar Nu = 0.664·√Re·Pr^⅓; Re = 1e6 mixed (0.037 Re^0.8 − 871) Pr^⅓.
    assert!((nu_plate(1e5, 0.7) - 0.664 * 1e5f64.sqrt() * 0.7f64.powf(1.0 / 3.0)).abs() < 1e-9);
    assert!((nu_plate(1e6, 0.7) - (0.037 * 1e6f64.powf(0.8) - 871.0) * 0.7f64.powf(1.0 / 3.0)).abs() < 1e-9);
    // Air at 300 K, U = 5 m/s, L = 0.3 m: Re ≈ 94 400 (laminar), h ≈ 16 W/m²K.
    let hf = h_correlation(HMode::ForcedPlate, 27.0, 27.0, 0.3, 5.0);
    assert!((hf - 16.0).abs() < 1.0, "forced {hf}");
}

#[test]
fn natural_convection_run_converges_and_reports_h_mean() {
    // A 100 mm aluminium plate (2D section) with 5 W, cooled by natural convection on both faces.
    let m = json!({
        "domain": { "dim": 2, "width": 4, "height": 100, "depth": 100, "nx": 2, "ny": 50, "background": "al" },
        "ambient": 25,
        "materials": [{ "id": "al", "k": 167, "rho": 2700, "cp": 896 }],
        "bodies": [{ "id": "p", "shape": "rect", "x": 0, "y": 0, "w": 4, "h": 100, "material": "al", "power": 5 }],
        "boundaries": [{ "id": "nc", "target": "left", "type": "convection", "hMode": "naturalVertical", "length": 100, "h": 999 },
                       { "id": "nc2", "target": "right", "type": "convection", "hMode": "naturalVertical", "length": 100 }],
        "study": { "type": "steady" }
    });
    let d = solve(&m);
    assert!(d.header["warnings"].as_array().unwrap().is_empty(), "{}", d.header["warnings"]);
    let hm = bc(&d, "nc")["hMean"].as_f64().unwrap();
    let tmax = d.stat("Tmax");
    // Energy: 5 W = h·A·ΔT with A = 2 · 0.1 · 0.1 m².
    let dt = 5.0 / (hm * 0.02);
    assert!((tmax - 25.0 - dt).abs() < 0.5, "Tmax {tmax}, h {hm}, ΔT {dt}");
    assert!((hm - h_correlation(HMode::NaturalVertical, 25.0 + dt, 25.0, 0.1, 0.0)).abs() < 0.02 * hm);
    assert!(hm > 4.0 && hm < 12.0, "{hm}");
    assert!(balance(&d) < 1e-6, "balance {}", balance(&d));
    assert!(bc(&d, "nc")["hMean"].is_number() && bc(&d, "nc2")["hMean"].is_number());
    // Boundaries without hMode carry no hMean.
    let mut m2 = m.clone();
    m2["boundaries"][1]["hMode"] = json!("fixed");
    let d2 = solve(&m2);
    assert!(bc(&d2, "nc2").get("hMean").is_none());
}

#[test]
fn forced_plate_transient_with_time_dependent_fluid_temperature() {
    let m = json!({
        "domain": { "dim": 2, "width": 10, "height": 10, "depth": 10, "nx": 5, "ny": 5, "background": "al" },
        "ambient": 20,
        "materials": [{ "id": "al", "k": 167, "rho": 2700, "cp": 896 }],
        "boundaries": [{ "id": "f", "target": "top", "type": "convection", "hMode": "forcedPlate", "length": 200, "velocity": 3,
                         "Tinft": [[0, 20], [60, 80]] }],
        "study": { "type": "transient", "endTime": 120, "dt": 1, "frames": 4, "initialT": 20 }
    });
    let d = solve(&m);
    let t = d.stat("Tmax");
    assert!(t > 20.5 && t < 80.0, "{t}");
    assert!(bc(&d, "f")["hMean"].as_f64().unwrap() > 5.0);
    assert!(balance(&d) < 1e-4, "balance {}", balance(&d));
}

// ------------------------------------------------------------- validation

#[test]
fn new_fields_are_validated() {
    let base = json!({
        "domain": { "dim": 2, "width": 10, "height": 10, "nx": 5, "ny": 5, "background": "m" },
        "materials": [{ "id": "m", "k": 1 }],
        "boundaries": [],
        "study": { "type": "steady" }
    });
    let check = |patch: &dyn Fn(&mut Value), needle: &str| {
        let mut m = base.clone();
        patch(&mut m);
        let errs = heat_core::validate(&m.to_string());
        assert!(errs.iter().any(|e| e.contains(needle)), "{needle}: {errs:?}");
    };
    check(&|m| m["materials"][0]["cpT"] = json!([[0, -1]]), "cpT");
    check(&|m| m["boundaries"] = json!([{ "id": "x", "target": "left", "type": "convection", "hMode": "magic" }]), "hMode");
    check(&|m| m["boundaries"] = json!([{ "id": "x", "target": "left", "type": "convection", "hMode": "forcedPlate", "length": 0 }]), "length");
    check(&|m| m["boundaries"] = json!([{ "id": "x", "target": "exterior", "type": "thinLayer" }]), "thin layer");
    check(&|m| m["boundaries"] = json!([{ "id": "x", "target": "left", "type": "thinLayer", "k": 0 }]), "thickness and k");
    check(&|m| m["boundaries"] = json!([{ "id": "x", "target": "left", "type": "thinLayer", "mode": "x" }]), "mode");
    check(&|m| m["boundaries"] = json!([{ "id": "x", "target": "left", "type": "temperature", "Tt": "abc" }]), "Tt");
    check(&|m| m["study"]["s2sMedium"] = json!("glass"), "s2sMedium");
}

/// Every example model in examples/models solves.
#[test]
fn example_models_solve() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("examples").join("models");
    let mut n = 0;
    for e in std::fs::read_dir(&dir).unwrap() {
        let p = e.unwrap().path();
        if p.extension().map_or(false, |x| x == "myheat") {
            let json: Value = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
            let d = solve(&json);
            assert!(balance(&d) < 1e-3, "{}: balance {}", p.display(), balance(&d));
            n += 1;
        }
    }
    assert!(n >= 5);
}
