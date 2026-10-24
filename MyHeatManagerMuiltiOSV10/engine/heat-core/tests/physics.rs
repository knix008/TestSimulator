//! Analytic and behavioural validation of the engine through the public API.

use heat_core::{decode, field_csv, run, validate, Decoded};
use serde_json::{json, Value};
use std::cell::Cell;

const SIGMA: f64 = 5.670374e-8;

fn solve(model: &Value) -> Decoded {
    let bytes = run(&model.to_string(), &mut |_| {}, &|| false);
    let d = decode(&bytes).expect("decodable result");
    assert!(d.ok(), "run failed: {}", d.header["error"]);
    d
}

fn solid(id: &str, k: f64) -> Value {
    json!({ "id": id, "kind": "solid", "k": k, "rho": 1000.0, "cp": 1000.0, "E": 1e11, "nu": 0.3, "alpha": 1e-5 })
}

/// 1D-like slab along x: width L mm, one row of cells.
fn slab(l_mm: f64, nx: usize, k: f64, boundaries: Value) -> Value {
    json!({
        "format": "myheat", "version": 1,
        "domain": { "dim": 2, "width": l_mm, "height": 10, "depth": 10, "nx": nx, "ny": 1, "background": "s" },
        "ambient": 0,
        "materials": [solid("s", k)],
        "bodies": [],
        "boundaries": boundaries,
        "study": { "type": "steady", "tolerance": 1e-12 }
    })
}

fn bc_heat(d: &Decoded, id: &str) -> f64 {
    d.header["boundaries"].as_array().unwrap().iter().find(|b| b["id"] == id).unwrap()["heat"].as_f64().unwrap()
}

fn bc_area(d: &Decoded, id: &str) -> f64 {
    d.header["boundaries"].as_array().unwrap().iter().find(|b| b["id"] == id).unwrap()["area"].as_f64().unwrap()
}

#[test]
fn slab_fixed_temperatures_linear_profile() {
    let m = slab(100.0, 50, 10.0, json!([
        { "id": "l", "target": "left", "type": "temperature", "T": 100 },
        { "id": "r", "target": "right", "type": "temperature", "T": 0 }
    ]));
    let d = solve(&m);
    let t = d.field("T", 0).unwrap();
    for i in 0..50 {
        let x = (i as f64 + 0.5) * 2.0e-3;
        let exact = 100.0 * (1.0 - x / 0.1);
        assert!((t[i] as f64 - exact).abs() < 1e-4, "cell {i}: {} vs {exact}", t[i]); // f32 storage
    }
    // Heat flow: k ΔT / L · A, A = 10 mm × 10 mm.
    let q = 10.0 * 100.0 / 0.1 * 1e-4;
    assert!((bc_heat(&d, "l") - q).abs() < 1e-9 * q);
    assert!((bc_heat(&d, "r") + q).abs() < 1e-9 * q);
    assert!(d.header["balance"]["error"].as_f64().unwrap() < 1e-9);
}

#[test]
fn slab_internal_generation_parabola() {
    let mut m = slab(100.0, 100, 5.0, json!([
        { "id": "l", "target": "left", "type": "temperature", "T": 0 },
        { "id": "r", "target": "right", "type": "temperature", "T": 0 }
    ]));
    m["bodies"] = json!([{ "id": "b", "shape": "rect", "x": 0, "y": 0, "w": 100, "h": 10, "material": "s", "power": 10.0 }]);
    let d = solve(&m);
    let t = d.field("T", 0).unwrap();
    let qv = 10.0 / (0.1 * 0.01 * 0.01);
    let mut maxerr: f64 = 0.0;
    for i in 0..100 {
        let x = (i as f64 + 0.5) * 1e-3;
        let exact = qv / (2.0 * 5.0) * x * (0.1 - x);
        maxerr = maxerr.max((t[i] as f64 - exact).abs());
    }
    let tmax = qv / (8.0 * 5.0) * 0.01;
    assert!(maxerr < 1e-3 * tmax, "max error {maxerr} vs Tmax {tmax}");
    assert!((bc_heat(&d, "l") + 5.0).abs() < 1e-6 && (bc_heat(&d, "r") + 5.0).abs() < 1e-6);
    assert!(d.header["balance"]["error"].as_f64().unwrap() < 1e-6);
}

#[test]
fn convection_biot_series_resistance() {
    let m = slab(100.0, 40, 10.0, json!([
        { "id": "l", "target": "left", "type": "temperature", "T": 100 },
        { "id": "r", "target": "right", "type": "convection", "h": 50, "Tinf": 0 }
    ]));
    let d = solve(&m);
    let q = 100.0 / (0.1 / 10.0 + 1.0 / 50.0); // W/m²
    assert!((bc_heat(&d, "l") - q * 1e-4).abs() < 1e-8 * q);
    assert!((bc_heat(&d, "r") + q * 1e-4).abs() < 1e-8 * q);
    let t = d.field("T", 0).unwrap();
    for i in 0..40 {
        let x = (i as f64 + 0.5) * 2.5e-3;
        assert!((t[i] as f64 - (100.0 - q * x / 10.0)).abs() < 1e-4);
    }
}

#[test]
fn anisotropic_conductivity_uses_axis_k() {
    let base = |bcs: Value| {
        json!({
            "domain": { "dim": 2, "width": 20, "height": 20, "depth": 10, "nx": 20, "ny": 20, "background": "a" },
            "ambient": 0,
            "materials": [{ "id": "a", "k": 1, "kx": 10, "ky": 1 }],
            "boundaries": bcs,
            "study": { "type": "steady", "tolerance": 1e-12 }
        })
    };
    let dx = solve(&base(json!([
        { "id": "l", "target": "left", "type": "temperature", "T": 10 },
        { "id": "r", "target": "right", "type": "temperature", "T": 0 }
    ])));
    let dy = solve(&base(json!([
        { "id": "b", "target": "bottom", "type": "temperature", "T": 10 },
        { "id": "t", "target": "top", "type": "temperature", "T": 0 }
    ])));
    let a = 0.02 * 0.01;
    assert!((bc_heat(&dx, "l") - 10.0 * 10.0 / 0.02 * a).abs() < 1e-8);
    assert!((bc_heat(&dy, "b") - 1.0 * 10.0 / 0.02 * a).abs() < 1e-8);
}

fn plate_2d3d(dim: usize) -> Value {
    json!({
        "domain": { "dim": dim, "width": 40, "height": 20, "depth": 8, "nx": 20, "ny": 10, "nz": 4, "background": "s" },
        "ambient": 20,
        "materials": [solid("s", 15.0), solid("c", 150.0)],
        "bodies": [{ "id": "chip", "shape": "rect", "x": 10, "y": 0, "w": 10, "h": 6, "material": "c", "power": 3.0 }],
        "boundaries": [
            { "id": "top", "target": "top", "type": "convection", "h": 25, "Tinf": 20 },
            { "id": "left", "target": "left", "type": "temperature", "T": 30 },
            { "id": "rad", "target": "right", "type": "radiation", "emissivity": 0.9, "Tamb": 20 }
        ],
        "probes": [{ "id": "p", "x": 15, "y": 3, "z": 4 }],
        "study": { "type": "steady", "tolerance": 1e-11 }
    })
}

#[test]
fn three_d_with_uniform_z_matches_two_d() {
    let d2 = solve(&plate_2d3d(2));
    let d3 = solve(&plate_2d3d(3));
    let t2 = d2.field("T", 0).unwrap();
    let t3 = d3.field("T", 0).unwrap();
    for k in 0..4 {
        for c in 0..200 {
            assert!((t2[c] - t3[c + 200 * k]).abs() < 1e-4, "cell {c} layer {k}: {} vs {}", t2[c], t3[c + 200 * k]);
        }
    }
    for id in ["top", "left", "rad"] {
        assert!((bc_heat(&d2, id) - bc_heat(&d3, id)).abs() < 1e-6, "{id}");
    }
    assert!(d3.field("qz", 0).is_some() && d2.field("qz", 0).is_none());
}

#[test]
fn radiation_only_equilibrium() {
    let q = 1000.0;
    let m = slab(20.0, 20, 50.0, json!([
        { "id": "in", "target": "left", "type": "flux", "q": q },
        { "id": "rad", "target": "right", "type": "radiation", "emissivity": 0.8, "Tamb": 20 }
    ]));
    let d = solve(&m);
    let t = d.field("T", 0).unwrap();
    // Surface temperature from the last cell centre (half cell, k = 50).
    let ts = t[19] as f64 - q * 0.5e-3 / 50.0;
    let ta: f64 = 20.0 + 273.15;
    let exact = (q / (0.8 * SIGMA) + ta.powi(4)).powf(0.25) - 273.15;
    assert!((ts - exact).abs() < 1e-3, "Ts {ts} vs {exact}");
    assert!((bc_heat(&d, "rad") + q * 1e-4).abs() < 1e-6);
}

#[test]
fn lumped_transient_cooling_matches_exponential() {
    let m = json!({
        "domain": { "dim": 2, "width": 10, "height": 10, "depth": 10, "nx": 10, "ny": 10, "background": "cu" },
        "ambient": 20,
        "materials": [{ "id": "cu", "k": 2000, "rho": 1000, "cp": 1000 }],
        "boundaries": [{ "id": "c", "target": "exterior", "type": "convection", "h": 10, "Tinf": 20 }],
        "probes": [{ "id": "p", "x": 5, "y": 5 }],
        "study": { "type": "transient", "initialT": 100, "endTime": 500, "dt": 1, "frames": 10 }
    });
    let d = solve(&m);
    // τ = ρc·(w·h)/(h·perimeter) (2D: front/back faces are not exterior)
    let tau = 1e6 * 1e-4 / (10.0 * 0.04);
    let times: Vec<f64> = d.header["times"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
    assert_eq!(times.len(), 11);
    let vals = d.header["probes"][0]["values"].as_array().unwrap();
    for (f, t) in times.iter().enumerate() {
        let exact = 20.0 + 80.0 * (-t / tau).exp();
        let got = vals[f].as_f64().unwrap();
        assert!(((got - 20.0) - (exact - 20.0)).abs() < 0.02 * (exact - 20.0) + 1e-9, "t={t}: {got} vs {exact}");
    }
    // Transient balance: boundaries = stored rate at the end.
    assert!(d.header["balance"]["error"].as_f64().unwrap() < 1e-3, "{}", d.header["balance"]);
}

#[test]
fn steady_energy_balance() {
    let d = solve(&plate_2d3d(2));
    let b = &d.header["balance"];
    assert!(b["error"].as_f64().unwrap() < 1e-3, "{b}");
    assert!((b["generated"].as_f64().unwrap() - 3.0).abs() < 1e-12);
    // body stats exist
    let body = &d.header["bodies"][0];
    assert!(body["max"].as_f64().unwrap() >= body["avg"].as_f64().unwrap());
}

#[test]
fn pcm_plateau_near_melting_point() {
    let m = json!({
        "domain": { "dim": 2, "width": 10, "height": 10, "depth": 10, "nx": 5, "ny": 5, "background": "wax" },
        "ambient": 20,
        "materials": [{ "id": "wax", "kind": "pcm", "k": 100, "kLiquid": 50, "rho": 800, "cp": 2000,
                        "Tmelt": 30, "meltRange": 1, "latent": 2e5 }],
        "bodies": [{ "id": "heater", "shape": "rect", "x": 0, "y": 0, "w": 10, "h": 10, "material": "wax", "power": 1.0 }],
        "boundaries": [],
        "probes": [{ "id": "p", "x": 5, "y": 5 }],
        "study": { "type": "transient", "initialT": 20, "endTime": 300, "dt": 1, "frames": 300 }
    });
    let d = solve(&m);
    let vals: Vec<f64> = d.header["probes"][0]["values"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
    // m·cp = 1.6 J/K, latent 160 J, P = 1 W.
    // Solidus 29.5 reached at t≈15.2 s, liquidus 30.5 at ≈176.8 s.
    for &t in &[40usize, 100, 160] {
        assert!((vals[t] - 30.0).abs() < 0.6, "t={t}: {}", vals[t]);
    }
    let end = 20.0 + (300.0 - 160.0) / 1.6;
    assert!((vals[300] - end).abs() < 0.01 * end, "final {} vs {end}", vals[300]);
    let liq = d.field("liquid", 300).unwrap();
    assert!(liq.iter().all(|&x| (x - 1.0).abs() < 1e-6));
    let liq_mid = d.field("liquid", 100).unwrap();
    assert!(liq_mid[12] > 0.2 && liq_mid[12] < 0.8, "liquid at t=100: {}", liq_mid[12]);
    assert_eq!(d.frames("liquid"), 301);
}

#[test]
fn poiseuille_channel_profile() {
    let m = json!({
        "domain": { "dim": 2, "width": 20, "height": 4, "depth": 10, "nx": 40, "ny": 16, "background": "oil" },
        "ambient": 20,
        "materials": [{ "id": "oil", "kind": "fluid", "k": 0.15, "rho": 1000, "cp": 2000, "mu": 1.0 }],
        "boundaries": [
            { "id": "in", "target": "left", "type": "inlet", "velocity": 0.01, "Tin": 20 },
            { "id": "out", "target": "right", "type": "outlet" }
        ],
        "study": { "type": "steady", "flow": true, "flowSteps": 6000 }
    });
    let d = solve(&m);
    assert!(d.header["warnings"].as_array().unwrap().is_empty(), "{}", d.header["warnings"]);
    let u = d.field("u", 0).unwrap();
    let i = 30; // well downstream
    let col: Vec<f64> = (0..16).map(|j| u[i + 40 * j] as f64).collect();
    let mean = col.iter().sum::<f64>() / 16.0;
    let max = col.iter().cloned().fold(0.0, f64::max);
    assert!((mean - 0.01).abs() < 0.01 * 0.01, "mean {mean}");
    // cell-centre maximum of the parabola at y/H = 0.5 ± 1/32 is 1.494·mean
    assert!((max / mean - 1.5).abs() < 0.03, "max/mean {}", max / mean);
    assert!(u.iter().all(|x| x.is_finite()));
    // symmetric profile
    for j in 0..8 {
        assert!((col[j] - col[15 - j]).abs() < 1e-3 * max);
    }
}

#[test]
fn porous_darcy_pressure_drop() {
    let (mu, k, u0) = (1e-3, 1e-9, 1e-3);
    let m = json!({
        "domain": { "dim": 2, "width": 20, "height": 4, "depth": 10, "nx": 40, "ny": 8, "background": "bed" },
        "ambient": 20,
        "materials": [
            { "id": "water", "kind": "fluid", "k": 0.6, "rho": 1000, "cp": 4180, "mu": mu },
            { "id": "bed", "kind": "porous", "k": 2.0, "rho": 2500, "cp": 800, "porosity": 0.4, "permeability": k, "fluid": "water" }
        ],
        "boundaries": [
            { "id": "in", "target": "left", "type": "inlet", "velocity": u0, "Tin": 20 },
            { "id": "out", "target": "right", "type": "outlet" },
            { "id": "s1", "target": "top", "type": "slip" },
            { "id": "s2", "target": "bottom", "type": "slip" }
        ],
        "study": { "type": "steady", "flow": true, "flowSteps": 4000 }
    });
    let d = solve(&m);
    assert!(d.header["warnings"].as_array().unwrap().is_empty(), "{}", d.header["warnings"]);
    let p = d.field("p", 0).unwrap();
    let dp = (p[0] - p[39]) as f64; // first to last cell centre: 39 dx
    let exact = mu * u0 * 0.0195 / k;
    assert!((dp - exact).abs() < 0.02 * exact, "dp {dp} vs {exact}");
    // pressure at the last cell = half a cell from p = 0
    assert!(((p[39] as f64) - mu * u0 * 0.00025 / k).abs() < 0.05 * mu * u0 * 0.00025 / k + 1e-3);
}

#[test]
fn natural_convection_cavity_converges() {
    let m = json!({
        "domain": { "dim": 2, "width": 20, "height": 20, "depth": 10, "nx": 20, "ny": 20, "background": "air" },
        "ambient": 25,
        "gravity": [0, -9.81],
        "materials": [{ "id": "air", "kind": "fluid", "k": 0.026, "rho": 1.18, "cp": 1006, "mu": 1.85e-5, "beta": 3.4e-3 }],
        "boundaries": [
            { "id": "hot", "target": "left", "type": "temperature", "T": 35 },
            { "id": "cold", "target": "right", "type": "temperature", "T": 15 }
        ],
        "study": { "type": "steady", "flow": true, "natural": true, "flowSteps": 3000 }
    });
    let d = solve(&m);
    assert!(d.header["warnings"].as_array().unwrap().is_empty(), "{}", d.header["warnings"]);
    let v = d.field("v", 0).unwrap();
    let t = d.field("T", 0).unwrap();
    assert!(v.iter().chain(t.iter()).all(|x| x.is_finite()));
    let mid = 10 * 20;
    assert!(v[mid] > 0.0, "hot side flow goes up: {}", v[mid]);
    assert!(v[mid + 19] < 0.0, "cold side flow goes down: {}", v[mid + 19]);
    assert!(d.stat("vmax") > 1e-4 && d.stat("vmax") < 1.0);
    // Heat in at the hot wall ≈ heat out at the cold wall.
    assert!((bc_heat(&d, "hot") + bc_heat(&d, "cold")).abs() < 0.02 * bc_heat(&d, "hot").abs());
    // Convection beats pure conduction: k ΔT/L · A
    let cond = 0.026 * 20.0 / 0.02 * 0.02 * 0.01;
    assert!(bc_heat(&d, "hot") > 1.2 * cond, "Nu > 1.2: {} vs {cond}", bc_heat(&d, "hot"));
}

#[test]
fn forced_cht_energy_balance() {
    let m = json!({
        "domain": { "dim": 2, "width": 40, "height": 10, "depth": 10, "nx": 40, "ny": 10, "background": "water" },
        "ambient": 20,
        "materials": [
            { "id": "water", "kind": "fluid", "k": 0.6, "rho": 1000, "cp": 4180, "mu": 1e-3 },
            { "id": "al", "kind": "solid", "k": 200, "rho": 2700, "cp": 900 }
        ],
        "bodies": [{ "id": "blk", "shape": "rect", "x": 15, "y": 0, "w": 10, "h": 3, "material": "al", "power": 5 }],
        "boundaries": [
            { "id": "in", "target": "left", "type": "inlet", "velocity": 0.01, "Tin": 20 },
            { "id": "out", "target": "right", "type": "outlet" }
        ],
        "study": { "type": "steady", "flow": true, "flowSteps": 3000 }
    });
    let d = solve(&m);
    assert!(d.header["warnings"].as_array().unwrap().is_empty(), "{}", d.header["warnings"]);
    let b = &d.header["balance"];
    assert!(b["error"].as_f64().unwrap() < 1e-2, "{b}");
    // Outlet carries the heat: ṁ cp ΔT = 5 W
    assert!((bc_heat(&d, "out") + 5.0).abs() < 0.1, "outlet {}", bc_heat(&d, "out"));
    assert!(d.stat("Tmax") > 20.0);
}

fn stress_block(bcs: Value, w: f64, h: f64, nx: usize, ny: usize) -> Value {
    let mut all = vec![json!({ "id": "temp", "target": "exterior", "type": "temperature", "T": 125 })];
    all.extend(bcs.as_array().unwrap().iter().cloned());
    json!({
        "domain": { "dim": 2, "width": w, "height": h, "depth": 10, "nx": nx, "ny": ny, "background": "s" },
        "ambient": 25,
        "materials": [solid("s", 50.0)],
        "boundaries": all,
        "study": { "type": "steady", "stress": true, "Tref": 25, "tolerance": 1e-10 }
    })
}

#[test]
fn free_thermal_expansion_is_stress_free() {
    let d = solve(&stress_block(json!([]), 20.0, 10.0, 20, 10));
    let vm = d.field("vonMises", 0).unwrap();
    let scale = 1e11 * 1e-5 * 100.0;
    let vmax = vm.iter().cloned().fold(0.0f32, f32::max) as f64;
    assert!(vmax < 1e-6 * scale, "von Mises {vmax}");
    let ux = d.field("dispX", 0).unwrap();
    let uy = d.field("dispY", 0).unwrap();
    // left/right cell centres are L − dx apart
    let row = 5 * 20;
    let du = (ux[row + 19] - ux[row]) as f64;
    let exact = 1e-5 * 100.0 * 0.019;
    assert!((du - exact).abs() < 1e-3 * exact, "du {du} vs {exact}");
    let dv = (uy[9 * 20 + 3] - uy[3]) as f64;
    assert!((dv - 1e-5 * 100.0 * 0.009).abs() < 1e-3 * 1e-5 * 100.0 * 0.009);
}

#[test]
fn constrained_bar_compressive_stress() {
    let d = solve(&stress_block(
        json!([
            { "id": "fl", "target": "left", "type": "fixed" },
            { "id": "fr", "target": "right", "type": "fixed" }
        ]),
        100.0, 5.0, 100, 5,
    ));
    let sxx = d.field("sxx", 0).unwrap();
    let exact = -1e11 * 1e-5 * 100.0;
    let mid = sxx[2 * 100 + 50] as f64;
    assert!((mid - exact).abs() < 0.03 * exact.abs(), "sxx {mid} vs {exact}");
    // Exact uniaxial state with rollers.
    let d = solve(&stress_block(
        json!([
            { "id": "rl", "target": "left", "type": "rollerX" },
            { "id": "rr", "target": "right", "type": "rollerX" },
            { "id": "rb", "target": "bottom", "type": "rollerY" }
        ]),
        100.0, 5.0, 50, 5,
    ));
    let sxx = d.field("sxx", 0).unwrap();
    let syy = d.field("syy", 0).unwrap();
    for c in 0..250 {
        assert!(((sxx[c] as f64) - exact).abs() < 1e-5 * exact.abs(), "cell {c}: {}", sxx[c]);
        assert!((syy[c] as f64).abs() < 1e-5 * exact.abs());
    }
    assert!(bc_area(&d, "rl") > 0.0);
}

#[test]
fn plane_strain_and_3d_stress() {
    let mut m = stress_block(json!([]), 10.0, 10.0, 10, 10);
    m["study"]["planeStrain"] = json!(true);
    let d = solve(&m);
    assert!(d.field("szz", 0).is_some());
    // free expansion in plane strain: szz = −EαΔT (in-plane stress free)
    let szz = d.field("szz", 0).unwrap();
    assert!(((szz[55] as f64) + 1e11 * 1e-5 * 100.0).abs() < 1e-3 * 1e8);
    let mut m3 = stress_block(json!([]), 10.0, 10.0, 6, 6);
    m3["domain"]["dim"] = json!(3);
    m3["domain"]["nz"] = json!(4);
    let d3 = solve(&m3);
    let vm = d3.field("vonMises", 0).unwrap();
    assert!(vm.iter().all(|&v| (v as f64) < 1e-6 * 1e8));
    let uz = d3.field("dispZ", 0).unwrap();
    let du = (uz[3 * 36 + 7] - uz[7]) as f64;
    assert!((du - 1e-5 * 100.0 * 0.0075).abs() < 1e-3 * 1e-5 * 100.0 * 0.0075, "dz {du}");
}

#[test]
fn boundary_priority_body_edge_exterior() {
    let m = json!({
        "domain": { "dim": 2, "width": 50, "height": 30, "depth": 10, "nx": 50, "ny": 30, "background": null },
        "ambient": 20,
        "materials": [solid("plate", 20.0), solid("chip", 100.0)],
        "bodies": [
            { "id": "plate", "shape": "rect", "x": 0, "y": 0, "w": 50, "h": 30, "material": "plate" },
            { "id": "chip", "shape": "rect", "x": 0, "y": 0, "w": 10, "h": 10, "material": "chip" }
        ],
        "boundaries": [
            { "id": "ext", "target": "exterior", "type": "convection", "h": 10, "Tinf": 20 },
            { "id": "left", "target": "left", "type": "temperature", "T": 50 },
            { "id": "chipq", "target": "body:chip", "type": "convection", "h": 100, "Tinf": 80 }
        ],
        "study": { "type": "steady" }
    });
    let d = solve(&m);
    let dep = 0.01;
    // chip: left 10 + bottom 10 (edges) + right 10 + top 10 (interfaces with the plate)
    assert!((bc_area(&d, "chipq") - 0.04 * dep).abs() < 1e-12);
    assert!((bc_area(&d, "left") - 0.02 * dep).abs() < 1e-12);
    assert!((bc_area(&d, "ext") - (0.04 + 0.05 + 0.03) * dep).abs() < 1e-12);
    // The body condition replaces the chip–plate contact on the interfaces:
    // the chip only exchanges heat with Tinf, so it sits at Tinf.
    assert!((bc_heat(&d, "chipq")).abs() < 1e-6);
    let t = d.field("T", 0).unwrap();
    assert!((t[5 * 50 + 5] as f64 - 80.0).abs() < 1e-4);
    assert!(d.header["balance"]["error"].as_f64().unwrap() < 1e-3);
}

#[test]
fn region_splits_exterior() {
    let m = json!({
        "domain": { "dim": 2, "width": 64, "height": 20, "depth": 10, "nx": 64, "ny": 20, "background": "s" },
        "ambient": 20,
        "materials": [solid("s", 1.0)],
        "boundaries": [
            { "id": "outside", "target": "exterior", "type": "convection", "h": 25, "Tinf": 0, "region": [0, 0, 32, 20] },
            { "id": "inside", "target": "exterior", "type": "convection", "h": 8, "Tinf": 20, "region": [32, 0, 64, 20] }
        ],
        "study": { "type": "steady" }
    });
    let d = solve(&m);
    // faces with centre x = 32 exactly do not exist on top/bottom (centres at k+0.5)
    assert!((bc_area(&d, "outside") - (0.02 + 0.032 + 0.032) * 0.01).abs() < 1e-12);
    assert!((bc_area(&d, "inside") - (0.02 + 0.032 + 0.032) * 0.01).abs() < 1e-12);
    assert!(bc_heat(&d, "inside") > 0.0 && bc_heat(&d, "outside") < 0.0);
}

#[test]
fn void_cells_are_excluded() {
    let m = json!({
        "domain": { "dim": 2, "width": 30, "height": 10, "depth": 10, "nx": 30, "ny": 10, "background": null },
        "ambient": 20,
        "materials": [solid("s", 10.0)],
        "bodies": [
            { "id": "a", "shape": "rect", "x": 0, "y": 0, "w": 10, "h": 10, "material": "s", "power": 1 },
            { "id": "b", "shape": "circle", "cx": 25, "cy": 5, "r": 4, "material": "s" }
        ],
        "boundaries": [
            { "id": "ext", "target": "exterior", "type": "convection", "h": 20, "Tinf": 20 }
        ],
        "probes": [{ "id": "void", "x": 15, "y": 5 }, { "id": "out", "x": 500, "y": 5 }, { "id": "a", "x": 5, "y": 5 }],
        "study": { "type": "steady" }
    });
    let d = solve(&m);
    let t = d.field("T", 0).unwrap();
    let mat = d.field("mat", 0).unwrap();
    assert_eq!(mat[5 * 30 + 15], 255.0);
    assert!(t[5 * 30 + 15].is_nan());
    assert!(d.header["probes"][0]["values"][0].is_null());
    assert!(d.header["probes"][1]["values"][0].is_null());
    assert!(d.header["probes"][2]["values"][0].as_f64().unwrap() > 20.0);
    // The isolated circle has no source: it stays at ambient.
    assert!((t[5 * 30 + 25] as f64 - 20.0).abs() < 1e-6);
    // Body "a" loses exactly its 1 W.
    assert!((bc_heat(&d, "ext") + 1.0).abs() < 1e-6);
}

#[test]
fn temperature_dependent_conductivity() {
    // k = 10(1 + 0.01 T): Kirchhoff → q = (1/L)∫k dT
    let mut m = slab(50.0, 100, 10.0, json!([
        { "id": "l", "target": "left", "type": "temperature", "T": 200 },
        { "id": "r", "target": "right", "type": "temperature", "T": 0 }
    ]));
    m["materials"][0]["kT"] = json!([[0, 10], [200, 30]]);
    let d = solve(&m);
    let q = (10.0 * 200.0 + 0.5 * 0.1 * 200.0 * 200.0) / 0.05 * 1e-4;
    assert!((bc_heat(&d, "l") - q).abs() < 1e-3 * q, "{} vs {q}", bc_heat(&d, "l"));
    assert!(d.header["log"].as_array().unwrap().iter().any(|l| l["phase"] == "picard"));
}

#[test]
fn joule_heating_and_power_profile() {
    let mut m = slab(20.0, 10, 10.0, json!([
        { "id": "l", "target": "left", "type": "temperature", "T": 0 }
    ]));
    m["bodies"] = json!([{ "id": "r", "shape": "rect", "x": 0, "y": 0, "w": 20, "h": 10, "material": "s",
                          "current": [[0, 2.0]], "resistance": 0.5, "powerProfile": [[0, 1], [10, 3]] }]);
    let d = solve(&m);
    // steady uses t = 0: P = 1 W + I²R = 2 W
    assert!((d.header["balance"]["generated"].as_f64().unwrap() - 3.0).abs() < 1e-12);
    m["study"] = json!({ "type": "transient", "endTime": 20, "dt": 1, "frames": 4 });
    let d = solve(&m);
    // clamped profile at t = 20: 3 W + 2 W
    assert!((d.header["balance"]["generated"].as_f64().unwrap() - 5.0).abs() < 1e-12);
    assert!(d.header["balance"]["error"].as_f64().unwrap() < 1e-3);
}

#[test]
fn result_encoding_round_trip() {
    let m = plate_2d3d(2);
    let bytes = run(&m.to_string(), &mut |_| {}, &|| false);
    assert_eq!(u32::from_le_bytes(bytes[0..4].try_into().unwrap()), 0x54484D48);
    let hl = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    assert_eq!(hl % 4, 0);
    let d = decode(&bytes).unwrap();
    let mut total = 0;
    for (_, f) in d.header["fields"].as_object().unwrap() {
        total += f["length"].as_u64().unwrap() * f["frames"].as_u64().unwrap();
    }
    assert_eq!(total as usize, d.data.len());
    assert_eq!((bytes.len() - 8 - hl) / 4, d.data.len());
    assert_eq!(d.header["materials"], json!(["s", "c"]));
    assert_eq!(d.header["grid"]["dx"].as_f64().unwrap(), 2.0);
    for key in ["ok", "error", "warnings", "elapsedMs", "grid", "materials", "times", "fields", "probes", "bodies", "boundaries", "balance", "log", "stats"] {
        assert!(d.header.get(key).is_some(), "missing {key}");
    }
    let csv = field_csv(&bytes, "T", 0);
    let lines: Vec<&str> = csv.lines().collect();
    assert_eq!(lines[0], "x,y,z,T");
    assert_eq!(lines.len(), 201);
    assert!(lines[1].starts_with("1,1,4,"));
}

#[test]
fn cancel_and_errors() {
    let m = plate_2d3d(3);
    let bytes = run(&m.to_string(), &mut |_| {}, &|| true);
    let d = decode(&bytes).unwrap();
    assert!(!d.ok());
    assert_eq!(d.header["error"], "cancelled");
    assert!(d.data.is_empty());
    // cancel after some progress
    let calls = Cell::new(0);
    let mut big = plate_2d3d(2);
    big["study"] = json!({ "type": "transient", "endTime": 1000, "dt": 0.1, "frames": 10 });
    let bytes = run(&big.to_string(), &mut |_| {}, &|| {
        calls.set(calls.get() + 1);
        calls.get() > 50
    });
    let d = decode(&bytes).unwrap();
    assert_eq!(d.header["error"], "cancelled");
    // invalid JSON / model
    let d = decode(&run("{oops", &mut |_| {}, &|| false)).unwrap();
    assert!(!d.ok() && d.header["error"].as_str().unwrap().contains("JSON"));
}

#[test]
fn validate_reports_problems() {
    assert!(validate(&plate_2d3d(2).to_string()).is_empty());
    let bad = json!({
        "domain": { "dim": 4, "width": -1, "nx": 0, "background": "nope" },
        "materials": [{ "id": "f", "kind": "fluid" }, { "id": "p", "kind": "porous", "fluid": "zz" }],
        "bodies": [{ "id": "b", "shape": "circle", "r": 0, "material": "missing" }],
        "boundaries": [{ "id": "x", "target": "body:none", "type": "weird" }],
        "study": { "type": "steady", "flow": true }
    });
    let errs = validate(&bad.to_string());
    let all = errs.join("\n");
    for needle in ["dim", "width", "nx", "background", "viscosity", "porosity", "zz", "radius", "missing", "none", "weird"] {
        assert!(all.contains(needle), "expected a message about {needle}: {all}");
    }
    // unknown fields are ignored, kind defaults to solid
    let ok = json!({
        "format": "myheat", "view": { "zoom": 2 }, "reliability": {}, "description": "x",
        "domain": { "dim": 2, "width": 10, "height": 10, "nx": 5, "ny": 5, "background": "a" },
        "materials": [{ "id": "a", "name": "A", "color": "#fff", "category": "metal", "k": 5 }],
        "bodies": [{ "id": "b", "name": "B", "hidden": true, "shape": "polygon", "points": [[0,0],[10,0],[5,8]], "material": "a" }],
        "boundaries": [{ "id": "t", "name": "T", "target": "top", "type": "temperature", "T": 10 }],
        "probes": [{ "id": "p", "name": "P", "x": 5, "y": 5 }]
    });
    assert!(validate(&ok.to_string()).is_empty(), "{:?}", validate(&ok.to_string()));
}

#[test]
fn progress_is_reported() {
    let mut phases: Vec<String> = Vec::new();
    let m = plate_2d3d(2);
    let _ = run(&m.to_string(), &mut |p| phases.push(p.phase.clone()), &|| false);
    assert!(phases.iter().any(|p| p == "conduction"));
}

// ------------------------------------------------------------- timing (ignored)

fn timed(model: &Value) -> (Decoded, f64) {
    let t = std::time::Instant::now();
    let d = solve(model);
    (d, t.elapsed().as_secs_f64())
}

fn big_conduction(nx: usize, ny: usize, nz: usize, dim: usize) -> Value {
    json!({
        "domain": { "dim": dim, "width": 100, "height": 100, "depth": 30, "nx": nx, "ny": ny, "nz": nz, "background": "s" },
        "ambient": 20,
        "materials": [solid("s", 20.0), solid("c", 200.0)],
        "bodies": [{ "id": "chip", "shape": "rect", "x": 40, "y": 40, "w": 20, "h": 20, "z0": 10, "z1": 20, "material": "c", "power": 50 }],
        "boundaries": [
            { "id": "top", "target": "top", "type": "convection", "h": 20, "Tinf": 20 },
            { "id": "bottom", "target": "bottom", "type": "temperature", "T": 20 }
        ],
        "study": { "type": "steady" }
    })
}

#[test]
#[ignore]
fn timing_conduction() {
    for (nx, ny, nz, dim) in [(200, 200, 1, 2), (400, 400, 1, 2), (100, 100, 30, 3)] {
        let (d, s) = timed(&big_conduction(nx, ny, nz, dim));
        println!("conduction {dim}D {nx}x{ny}x{nz}: {s:.2} s, log {}", d.header["log"]);
    }
}

fn cht_model(nx: usize, ny: usize, steps: usize) -> Value {
    json!({
        "domain": { "dim": 2, "width": 200, "height": 100, "depth": 10, "nx": nx, "ny": ny, "background": "air" },
        "ambient": 20,
        "materials": [
            { "id": "air", "kind": "fluid", "k": 0.026, "rho": 1.18, "cp": 1006, "mu": 1.85e-5, "beta": 3.4e-3 },
            { "id": "al", "kind": "solid", "k": 200, "rho": 2700, "cp": 900 }
        ],
        "bodies": [
            { "id": "base", "shape": "rect", "x": 50, "y": 0, "w": 60, "h": 8, "material": "al", "power": 10 },
            { "id": "fin1", "shape": "rect", "x": 60, "y": 8, "w": 4, "h": 40, "material": "al" },
            { "id": "fin2", "shape": "rect", "x": 80, "y": 8, "w": 4, "h": 40, "material": "al" },
            { "id": "fin3", "shape": "rect", "x": 100, "y": 8, "w": 4, "h": 40, "material": "al" }
        ],
        "boundaries": [
            { "id": "in", "target": "left", "type": "inlet", "velocity": 0.5, "Tin": 20 },
            { "id": "out", "target": "right", "type": "outlet" }
        ],
        "study": { "type": "steady", "flow": true, "flowSteps": steps }
    })
}

#[test]
#[ignore]
fn timing_cht() {
    for (nx, ny, steps) in [(120, 60, 3000), (200, 100, 3000)] {
        let (d, s) = timed(&cht_model(nx, ny, steps));
        println!(
            "CHT {nx}x{ny} {steps} steps: {s:.2} s, Tmax {:.2}, vmax {:.3}, balance {}, log {}, warnings {}",
            d.stat("Tmax"), d.stat("vmax"), d.header["balance"], d.header["log"], d.header["warnings"]
        );
    }
}
