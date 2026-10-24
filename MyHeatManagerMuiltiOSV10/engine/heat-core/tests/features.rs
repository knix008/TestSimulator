//! Validation of the extended features: turbulence, residual history, flow
//! metrics, contact resistance, electric conduction, structural loads, modal.

use heat_core::{decode, run, Decoded};
use serde_json::{json, Value};

fn solve(model: &Value) -> Decoded {
    let bytes = run(&model.to_string(), &mut |_| {}, &|| false);
    let d = decode(&bytes).expect("decodable result");
    assert!(d.ok(), "run failed: {}", d.header["error"]);
    d
}

fn bc<'a>(d: &'a Decoded, id: &str) -> &'a Value {
    d.header["boundaries"].as_array().unwrap().iter().find(|b| b["id"] == id).unwrap()
}

// ------------------------------------------------------------- turbulence

/// Half channel (symmetry at the top), Re_Dh = 20 000, Pr = 0.71 fluid.
/// A one-cell copper wall carries a uniform heat flux.
fn turbulent_channel(ny_fluid: usize, heated: bool) -> Value {
    // full height H = 20 mm → Dh = 40 mm; U = Re ν / Dh
    let h_half = 10.0; // mm
    let dy = h_half / ny_fluid as f64;
    let mut bcs = vec![
        json!({ "id": "in", "target": "left", "type": "inlet", "velocity": 0.5, "Tin": 20, "range": [dy, h_half + dy] }),
        json!({ "id": "out", "target": "right", "type": "outlet", "range": [dy, h_half + dy] }),
        json!({ "id": "sym", "target": "top", "type": "slip" }),
    ];
    if heated {
        bcs.push(json!({ "id": "q", "target": "bottom", "type": "flux", "q": 2000 }));
    }
    json!({
        "domain": { "dim": 2, "width": 1600, "height": h_half + dy, "depth": 10, "nx": 160, "ny": ny_fluid + 1, "background": "fl" },
        "ambient": 20,
        "materials": [
            { "id": "fl", "kind": "fluid", "k": 1.4, "rho": 1000, "cp": 1000, "mu": 1e-3 },
            { "id": "cu", "kind": "solid", "k": 400, "rho": 8900, "cp": 385 }
        ],
        "bodies": [{ "id": "wall", "shape": "rect", "x": 0, "y": 0, "w": 1600, "h": dy, "material": "cu" }],
        "boundaries": bcs,
        "study": { "type": "steady", "flow": true, "turbulence": "kOmegaSST", "flowSteps": 4000 }
    })
}

#[test]
#[ignore]
fn turbulent_channel_explore() {
    for ny in [8usize, 12, 20] {
        let t = std::time::Instant::now();
        let d = solve(&turbulent_channel(ny, true));
        let (_, nx, nyy, _, dx, dy, _) = d.grid();
        let p = d.field("p", 0).unwrap();
        let u = d.field("u", 0).unwrap();
        let tf = d.field("T", 0).unwrap();
        let row = nyy / 2;
        let (i0, i1) = (nx * 6 / 10, nx * 9 / 10);
        let dpdx = (p[row * nx + i1] - p[row * nx + i0]) as f64 / ((i1 - i0) as f64 * dx * 1e-3);
        let tau = -dpdx * 0.010;
        let ub = 0.5;
        let cf = tau / (0.5 * 1000.0 * ub * ub);
        let re_m = ub * 0.020 / 1e-6;
        let cf_dean = 0.073 * re_m.powf(-0.25);
        // Nu at x = 0.85 L
        let i = nx * 85 / 100;
        let tw = tf[i] as f64; // copper wall cell
        let (mut num, mut den) = (0.0, 0.0);
        for j in 1..nyy {
            let c = j * nx + i;
            num += u[c] as f64 * tf[c] as f64;
            den += u[c] as f64;
        }
        let tb = num / den;
        let nu = 2000.0 * 0.040 / (1.4 * (tw - tb));
        let re = ub * 0.040 / 1e-6;
        let nu_db = 0.023 * re.powf(0.8) * 0.714f64.powf(0.4);
        println!(
            "ny {ny}: {:.1} s Cf {cf:.5} Dean {cf_dean:.5} ({:+.1}%)  Nu {nu:.1} DB {nu_db:.1} ({:+.1}%)  y+max {:.1} steps {} warnings {}",
            t.elapsed().as_secs_f64(), 100.0 * (cf / cf_dean - 1.0), 100.0 * (nu / nu_db - 1.0),
            d.stat("yPlusMax"), d.header["log"][0]["iterations"], d.header["warnings"]
        );
        let _ = dy;
    }
}

fn channel_metrics(d: &Decoded, ny: usize) -> (f64, f64) {
    let (_, nx, nyy, _, dx, _, _) = d.grid();
    let p = d.field("p", 0).unwrap();
    let u = d.field("u", 0).unwrap();
    let tf = d.field("T", 0).unwrap();
    let row = nyy / 2;
    let (i0, i1) = (nx * 6 / 10, nx * 9 / 10);
    let dpdx = (p[row * nx + i1] - p[row * nx + i0]) as f64 / ((i1 - i0) as f64 * dx * 1e-3);
    let cf = -dpdx * 0.010 / (0.5 * 1000.0 * 0.25);
    let i = nx * 85 / 100;
    let (mut num, mut den) = (0.0, 0.0);
    for j in 1..=ny {
        let c = j * nx + i;
        num += u[c] as f64 * tf[c] as f64;
        den += u[c] as f64;
    }
    let nu = 2000.0 * 0.040 / (1.4 * (tf[i] as f64 - num / den));
    (cf, nu)
}

#[test]
fn turbulent_channel_friction_and_heat_transfer() {
    let ny = 16;
    let d = solve(&turbulent_channel(ny, true));
    assert!(d.header["warnings"].as_array().unwrap().is_empty(), "{}", d.header["warnings"]);
    let (cf, nu) = channel_metrics(&d, ny);
    let cf_dean = 0.073 * 10000f64.powf(-0.25); // Re_m = U·H/ν = 10 000
    let nu_db = 0.023 * 20000f64.powf(0.8) * (1e-3 * 1000.0 / 1.4f64).powf(0.4);
    assert!((cf / cf_dean - 1.0).abs() < 0.15, "Cf {cf} vs Dean {cf_dean}");
    assert!((nu / nu_db - 1.0).abs() < 0.25, "Nu {nu} vs Dittus-Boelter {nu_db}");
    for f in ["k", "omega", "nut"] {
        let v = d.field(f, 0).unwrap();
        assert!(v.iter().all(|x| x.is_finite() && *x >= 0.0), "{f}");
    }
    let yp = d.stat("yPlusMax");
    assert!(yp > 1.0 && yp < 30.0, "y+ {yp}");
    assert!(cf > 5.0 * 6e-4, "turbulent friction far above laminar");
    let s = &d.header["residuals"]["series"];
    for key in ["continuity", "u", "v", "k", "omega"] {
        assert!(s[key].is_array(), "residual series {key}");
    }
}

fn poiseuille() -> Value {
    json!({
        "domain": { "dim": 2, "width": 20, "height": 4, "depth": 10, "nx": 40, "ny": 16, "background": "oil" },
        "ambient": 20,
        "materials": [{ "id": "oil", "kind": "fluid", "k": 0.15, "rho": 1000, "cp": 2000, "mu": 1.0 }],
        "boundaries": [
            { "id": "in", "target": "left", "type": "inlet", "velocity": 0.01, "Tin": 30 },
            { "id": "out", "target": "right", "type": "outlet" },
            { "id": "w", "target": "bottom", "type": "temperature", "T": 20 }
        ],
        "study": { "type": "steady", "flow": true, "flowSteps": 6000 }
    })
}

#[test]
fn residual_history_is_normalised_and_sampled() {
    let d = solve(&poiseuille());
    let r = &d.header["residuals"];
    let it = r["iterations"].as_array().unwrap();
    assert!(!it.is_empty() && it.len() <= 400);
    for key in ["continuity", "u", "v"] {
        let s = r["series"][key].as_array().unwrap();
        assert_eq!(s.len(), it.len());
        assert!((s[0].as_f64().unwrap() - 1.0).abs() < 1e-12, "{key} first = 1");
        let last = s.last().unwrap().as_f64().unwrap();
        assert!(last < 1e-2, "{key} decayed to {last}");
    }
    let m = json!({
        "domain": { "dim": 2, "width": 20, "height": 10, "nx": 20, "ny": 10, "background": "s" },
        "materials": [{ "id": "s", "k": 5, "kT": [[0, 5], [200, 20]] }],
        "boundaries": [{ "id": "l", "target": "left", "type": "temperature", "T": 200 },
                       { "id": "r", "target": "right", "type": "radiation", "emissivity": 0.9, "Tamb": 20 }],
        "study": { "type": "steady" }
    });
    let d = solve(&m);
    let t = d.header["residuals"]["series"]["T"].as_array().unwrap();
    assert!(t.len() >= 3 && t[0].as_f64().unwrap() == 1.0 && t.last().unwrap().as_f64().unwrap() < 1e-3, "{t:?}");
    let mut m2 = m.clone();
    m2["study"] = json!({ "type": "transient", "endTime": 1000, "dt": 1, "frames": 5 });
    let d = solve(&m2);
    assert_eq!(d.header["residuals"]["iterations"].as_array().unwrap().len(), 400);
}

#[test]
fn flow_boundary_metrics() {
    let d = solve(&poiseuille());
    let (bi, bo) = (bc(&d, "in"), bc(&d, "out"));
    let m = 1000.0 * 0.01 * 0.004 * 0.010;
    assert!((bi["massFlow"].as_f64().unwrap() - m).abs() < 1e-9);
    assert!((bo["massFlow"].as_f64().unwrap() + m).abs() < 1e-3 * m, "outlet {}", bo["massFlow"]);
    assert!((bi["volumeFlow"].as_f64().unwrap() - m / 1000.0).abs() < 1e-12);
    assert!((bi["temperatureAvg"].as_f64().unwrap() - 30.0).abs() < 1e-9);
    let tout = bo["temperatureAvg"].as_f64().unwrap();
    assert!(tout > 20.0 && tout < 30.0, "outlet T {tout}");
    assert_eq!(bo["pressureAvg"].as_f64().unwrap(), 0.0);
    let dp = d.header["flow"]["pressureDrop"].as_f64().unwrap();
    let exact = 12.0 * 1.0 * 0.01 / (0.004f64 * 0.004) * 0.01975;
    assert!((dp - exact).abs() < 0.1 * exact, "dp {dp} vs {exact}");
    assert!((bi["pressureAvg"].as_f64().unwrap() - dp).abs() < 1e-9);
    assert!(bc(&d, "w").get("massFlow").is_none());
}

#[test]
fn contact_resistance_in_series() {
    let m = json!({
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
            { "id": "tim", "target": "body:A", "type": "contact", "resistance": 1e-3 }
        ],
        "study": { "type": "steady", "tolerance": 1e-12 }
    });
    let d = solve(&m);
    let q = 100.0 / (0.01 / 10.0 + 0.01 / 20.0 + 1e-3) * 1e-4; // W
    assert!((bc(&d, "hot")["heat"].as_f64().unwrap() - q).abs() < 1e-8, "{}", bc(&d, "hot")["heat"]);
    assert!((bc(&d, "tim")["heat"].as_f64().unwrap() + q).abs() < 1e-8);
    assert!((bc(&d, "tim")["area"].as_f64().unwrap() - 1e-4).abs() < 1e-15);
    let t = d.field("T", 0).unwrap();
    let flux = q / 1e-4;
    let jump = (t[9] - t[10]) as f64 - flux * (0.0005 / 10.0 + 0.0005 / 20.0);
    assert!((jump - flux * 1e-3).abs() < 1e-3);
    let mut m2 = m.clone();
    m2["boundaries"].as_array_mut().unwrap().pop();
    let d2 = solve(&m2);
    assert!(bc(&d2, "hot")["heat"].as_f64().unwrap() > q * 1.5);
}

fn bar_electric(alpha_r: f64) -> Value {
    json!({
        "domain": { "dim": 2, "width": 100, "height": 10, "depth": 10, "nx": 50, "ny": 5, "background": "cu" },
        "ambient": 20,
        "materials": [{ "id": "cu", "k": 400, "rho": 8900, "cp": 385, "sigma": 5.96e7, "alphaR": alpha_r }],
        "boundaries": [
            { "id": "plus", "target": "left", "type": "voltage", "V": 0.01 },
            { "id": "gnd", "target": "right", "type": "ground" },
            { "id": "cool", "target": "top", "type": "convection", "h": 1000, "Tinf": 20 }
        ],
        "study": { "type": "steady", "electric": true, "tolerance": 1e-10 }
    })
}

#[test]
fn joule_heating_uniform_bar() {
    let d = solve(&bar_electric(0.0));
    let r = 0.1 / (5.96e7 * 1e-4);
    let i = 0.01 / r;
    let p = 0.01 * 0.01 / r;
    let e = &d.header["electric"];
    assert!((e["resistance"].as_f64().unwrap() / r - 1.0).abs() < 1e-6, "R {} vs {r}", e["resistance"]);
    assert!((e["current"].as_f64().unwrap() / i - 1.0).abs() < 1e-6);
    assert!((e["power"].as_f64().unwrap() / p - 1.0).abs() < 1e-6);
    assert!((d.header["balance"]["generated"].as_f64().unwrap() / p - 1.0).abs() < 1e-6);
    assert!(d.header["balance"]["error"].as_f64().unwrap() < 1e-6);
    assert!((bc(&d, "cool")["heat"].as_f64().unwrap() + p).abs() < 1e-3 * p);
    assert!((bc(&d, "plus")["current"].as_f64().unwrap() / i - 1.0).abs() < 1e-6);
    assert!((bc(&d, "gnd")["current"].as_f64().unwrap() / i + 1.0).abs() < 1e-6);
    let v = d.field("V", 0).unwrap();
    let j = d.field("J", 0).unwrap();
    assert!((v[0] as f64 - 0.01 * (1.0 - 0.001 / 0.1)).abs() < 1e-8);
    assert!(j.iter().all(|&x| ((x as f64) / (i / 1e-4) - 1.0).abs() < 1e-4));
    // σ(T): a hotter bar conducts less
    let d2 = solve(&bar_electric(0.0039));
    assert!(d2.header["electric"]["power"].as_f64().unwrap() < p);
    // current injection: potential of the injecting face = I·R
    let mut m = bar_electric(0.0);
    m["boundaries"][0] = json!({ "id": "plus", "target": "left", "type": "currentIn", "I": 100.0 });
    let d3 = solve(&m);
    let v3 = d3.field("V", 0).unwrap();
    let vleft = v3[0] as f64 + 100.0 * r * 0.01;
    assert!((vleft / (100.0 * r) - 1.0).abs() < 1e-3, "{vleft} vs {}", 100.0 * r);
}

fn beam(nx: usize, ny: usize, bcs: Value, study: Value) -> Value {
    json!({
        "domain": { "dim": 2, "width": 100, "height": 10, "depth": 10, "nx": nx, "ny": ny, "background": "steel" },
        "ambient": 20,
        "materials": [{ "id": "steel", "k": 50, "rho": 7800, "cp": 500, "E": 2e11, "nu": 0.3, "alpha": 1.2e-5 }],
        "boundaries": bcs,
        "study": study
    })
}

#[test]
fn cantilever_tip_deflection() {
    let f = 100.0;
    let d = solve(&beam(100, 10,
        json!([{ "id": "root", "target": "left", "type": "fixed" },
               { "id": "tip", "target": "right", "type": "force", "fy": -f }]),
        json!({ "type": "steady", "structural": true, "tolerance": 1e-10 })));
    let uy = d.field("dispY", 0).unwrap();
    let ei = 2e11 * 0.010 * 0.010f64.powi(3) / 12.0;
    let x = 0.1 - 0.0005;
    let exact = f * x * x * (3.0 * 0.1 - x) / (6.0 * ei);
    let tip: f64 = (0..10).map(|j| uy[j * 100 + 99] as f64).sum::<f64>() / 10.0;
    assert!((-tip / exact - 1.0).abs() < 0.1, "tip {tip} vs {exact}");
    assert!(d.header["warnings"].as_array().unwrap().is_empty(), "{}", d.header["warnings"]);
}

#[test]
fn axial_force_pressure_and_gravity() {
    let rollers = |extra: Value| {
        Value::Array(vec![
            json!({ "id": "rl", "target": "left", "type": "rollerX" }),
            json!({ "id": "rb", "target": "bottom", "type": "rollerY" }),
            extra,
        ])
    };
    let st = json!({ "type": "steady", "structural": true, "tolerance": 1e-10 });
    let d = solve(&beam(50, 5, rollers(json!({ "id": "pull", "target": "right", "type": "force", "fx": 1000.0 })), st.clone()));
    let sxx = d.field("sxx", 0).unwrap();
    let sigma = 1000.0 / (0.010 * 0.010);
    assert!(sxx.iter().all(|&s| ((s as f64) / sigma - 1.0).abs() < 1e-4), "{}", sxx[0]);
    let d = solve(&beam(50, 5, rollers(json!({ "id": "push", "target": "right", "type": "pressure", "p": 2e6 })), st.clone()));
    let sxx = d.field("sxx", 0).unwrap();
    assert!(sxx.iter().all(|&s| ((s as f64) / -2e6 - 1.0).abs() < 1e-4), "{}", sxx[0]);
    let m = json!({
        "domain": { "dim": 2, "width": 10, "height": 100, "depth": 10, "nx": 5, "ny": 50, "background": "steel" },
        "ambient": 20, "gravity": [0, -9.81],
        "materials": [{ "id": "steel", "rho": 7800, "E": 2e11, "nu": 0.3 }],
        "boundaries": [{ "id": "base", "target": "bottom", "type": "rollerY" }, { "id": "side", "target": "left", "type": "rollerX" }],
        "study": { "type": "steady", "structural": true, "gravityLoad": true, "tolerance": 1e-10 }
    });
    let d = solve(&m);
    let syy = d.field("syy", 0).unwrap();
    let j = 25;
    let exact = -7800.0 * 9.81 * (0.1 - (j as f64 + 0.5) * 0.002);
    assert!(((syy[j * 5 + 2] as f64) - exact).abs() < 0.02 * exact.abs(), "{} vs {exact}", syy[j * 5 + 2]);
    let mut m = beam(20, 4, json!([{ "id": "rl", "target": "left", "type": "fixed" }, { "id": "rr", "target": "right", "type": "fixed" },
        { "id": "hot", "target": "top", "type": "temperature", "T": 120 }]),
        json!({ "type": "steady", "stress": true, "Tref": 20 }));
    let d = solve(&m);
    assert!(d.stat("vonMisesMax") > 1e7);
    m["study"]["thermalStrain"] = json!(false);
    let d = solve(&m);
    assert!(d.stat("vonMisesMax") == 0.0);
}

#[test]
fn cantilever_first_bending_frequency() {
    let d = solve(&beam(100, 10, json!([{ "id": "root", "target": "left", "type": "fixed" }]),
        json!({ "type": "steady", "modal": { "enabled": true, "modes": 3 } })));
    let modes = d.header["modes"].as_array().unwrap();
    assert_eq!(modes.len(), 3);
    let ei = 2e11 * 0.010 * 0.010f64.powi(3) / 12.0;
    let m_l = 7800.0 * 0.010 * 0.010;
    let f_eb = |b: f64| b * b / (2.0 * std::f64::consts::PI) * (ei / (m_l * 0.1f64.powi(4))).sqrt();
    let f1 = modes[0]["frequency"].as_f64().unwrap();
    assert!((f1 / f_eb(1.8751) - 1.0).abs() < 0.1, "f1 {f1} vs {}", f_eb(1.8751));
    let f2 = modes[1]["frequency"].as_f64().unwrap();
    assert!(f2 > f1 && (f2 / f_eb(4.6941) - 1.0).abs() < 0.15, "f2 {f2} vs {}", f_eb(4.6941));
    let p = modes[0]["participation"].as_array().unwrap();
    assert!(p[1].as_f64().unwrap() > 0.5 && p[0].as_f64().unwrap() < 0.05, "{p:?}");
    let my = d.field("modeY_1", 0).unwrap().iter().map(|x| x.abs()).fold(0.0f32, f32::max);
    let mx = d.field("modeX_1", 0).unwrap().iter().map(|x| x.abs()).fold(0.0f32, f32::max);
    assert!((my.max(mx) - 1.0).abs() < 1e-5);
    assert!(d.field("modeY_3", 0).is_some() && d.field("modeY_4", 0).is_none());
}

#[test]
fn free_free_modes_skip_rigid_body_motion() {
    let d = solve(&beam(60, 6, json!([]), json!({ "type": "steady", "modal": { "enabled": true, "modes": 2 } })));
    let modes = d.header["modes"].as_array().unwrap();
    assert_eq!(modes.len(), 2);
    let ei = 2e11 * 0.010 * 0.010f64.powi(3) / 12.0;
    let m_l = 7800.0 * 0.010 * 0.010;
    let f_ff = 4.7300f64.powi(2) / (2.0 * std::f64::consts::PI) * (ei / (m_l * 0.1f64.powi(4))).sqrt();
    let f1 = modes[0]["frequency"].as_f64().unwrap();
    assert!((f1 / f_ff - 1.0).abs() < 0.1, "free-free f1 {f1} vs {f_ff}");
    assert!(d.header["warnings"].as_array().unwrap().iter().any(|w| w.as_str().unwrap().contains("rigid-body")));
}

// ------------------------------------------------------------- bioheat

fn tissue(study: Value) -> Value {
    json!({
        "domain": { "dim": 2, "width": 30, "height": 2, "depth": 10, "nx": 150, "ny": 1, "background": "tissue" },
        "ambient": 37,
        "materials": [{ "id": "tissue", "k": 0.5, "rho": 1050, "cp": 3600, "perfusion": 5e-4, "metabolic": 400 }],
        "boundaries": [{ "id": "skin", "target": "left", "type": "temperature", "T": 20 }],
        "study": study
    })
}

#[test]
fn pennes_bioheat_slab() {
    let d = solve(&tissue(json!({ "type": "steady", "tolerance": 1e-12 })));
    let t = d.field("T", 0).unwrap();
    let wpc: f64 = 5e-4 * 1060.0 * 3770.0;
    let m = (wpc / 0.5).sqrt();
    let tinf = 37.0 + 400.0 / wpc;
    let l = 0.030;
    let mut maxerr: f64 = 0.0;
    for i in 0..150 {
        let x = (i as f64 + 0.5) * 0.0002;
        let exact = tinf + (20.0 - tinf) * (m * (l - x)).cosh() / (m * l).cosh();
        maxerr = maxerr.max((t[i] as f64 - exact).abs());
    }
    assert!(maxerr < 0.01, "max error {maxerr} K");
    // perfusion + metabolic heat appears as generated heat and balances the skin loss
    assert!(d.header["balance"]["error"].as_f64().unwrap() < 1e-6, "{}", d.header["balance"]);
    // transient from 37 °C approaches the steady profile
    let d2 = solve(&tissue(json!({ "type": "transient", "initialT": 37, "endTime": 40000, "dt": 100, "frames": 4 })));
    let t2 = d2.field("T", 4).unwrap();
    for i in [0usize, 50, 149] {
        assert!((t2[i] - t[i]).abs() < 0.05, "cell {i}: {} vs {}", t2[i], t[i]);
    }
}

// ------------------------------------------------------------- fan curve

#[test]
fn fan_operating_point_with_porous_resistance() {
    // Darcy block: Δp = μ (Q/A) Lp / K = R Q with R = 2e8 Pa·s/m³;
    // fan Δp = 6000 (1 − Q / 2e-5) → Q* = 1.2e-5 m³/s, Δp* = 2400 Pa.
    let m = json!({
        "domain": { "dim": 2, "width": 100, "height": 10, "depth": 10, "nx": 100, "ny": 10, "background": "water" },
        "ambient": 20,
        "materials": [
            { "id": "water", "kind": "fluid", "k": 0.6, "rho": 1000, "cp": 4180, "mu": 1e-3 },
            { "id": "bed", "kind": "porous", "k": 1.0, "rho": 2000, "cp": 800, "porosity": 0.5, "permeability": 1e-9, "fluid": "water" }
        ],
        "bodies": [{ "id": "bed", "shape": "rect", "x": 40, "y": 0, "w": 20, "h": 10, "material": "bed" }],
        "boundaries": [
            { "id": "fan", "target": "left", "type": "fan", "curve": [[0, 6000], [2e-5, 0]], "Tin": 20 },
            { "id": "out", "target": "right", "type": "outlet" },
            { "id": "t", "target": "top", "type": "slip" },
            { "id": "b", "target": "bottom", "type": "slip" }
        ],
        "study": { "type": "steady", "flow": true, "flowSteps": 6000 }
    });
    let d = solve(&m);
    let f = bc(&d, "fan");
    let op = &f["operatingPoint"];
    let q = op["flow"].as_f64().unwrap();
    let dp = op["pressure"].as_f64().unwrap();
    assert!((q / 1.2e-5 - 1.0).abs() < 0.05, "Q {q}");
    assert!((dp / 2400.0 - 1.0).abs() < 0.05, "dp {dp}");
    assert!((f["volumeFlow"].as_f64().unwrap() / q - 1.0).abs() < 1e-6);
    assert!(d.header["warnings"].as_array().unwrap().is_empty(), "{}", d.header["warnings"]);
}
