//! 3D flow, conjugate heat transfer, natural convection, fans (edge and
//! internal) and k-ω SST, plus a 2D regression check.

use heat_core::{decode, run, Decoded};
use serde_json::{json, Value};

fn solve(model: &Value) -> Decoded {
    let t = std::time::Instant::now();
    let bytes = run(&model.to_string(), &mut |_| {}, &|| false);
    let d = decode(&bytes).expect("decodable result");
    assert!(d.ok(), "run failed: {}", d.header["error"]);
    eprintln!(
        "  [{:.2} s] warnings {}  log {}",
        t.elapsed().as_secs_f64(),
        d.header["warnings"],
        d.header["log"]
    );
    d
}

fn bc<'a>(d: &'a Decoded, id: &str) -> &'a Value {
    d.header["boundaries"].as_array().unwrap().iter().find(|b| b["id"] == id).unwrap()
}

fn num(v: &Value) -> f64 {
    v.as_f64().unwrap_or(f64::NAN)
}

/// Mean of a field over the cross-section (fluid cells) at x index i.
fn section_mean(d: &Decoded, name: &str, i: usize) -> f64 {
    let (_, nx, ny, nz, _, _, _) = d.grid();
    let f = d.field(name, 0).unwrap();
    let (mut s, mut n) = (0.0, 0usize);
    for k in 0..nz {
        for j in 0..ny {
            s += f[i + nx * (j + ny * k)] as f64;
            n += 1;
        }
    }
    s / n as f64
}

fn liquid(mu: f64) -> Value {
    json!({ "id": "liq", "kind": "fluid", "k": 0.6, "rho": 1000, "cp": 4180, "mu": mu, "beta": 2e-4 })
}

/// Square duct (side a mm, length l mm) along x, inlet left, outlet right.
fn square_duct(a: f64, l: f64, nx: usize, n: usize, mu: f64, inlet: Value, study: Value) -> Value {
    json!({
        "domain": { "dim": 3, "width": l, "height": a, "depth": a, "nx": nx, "ny": n, "nz": n, "background": "liq" },
        "ambient": 20,
        "materials": [liquid(mu)],
        "bodies": [],
        "boundaries": [inlet, { "id": "out", "target": "right", "type": "outlet" }],
        "study": study
    })
}

// ------------------------------------------------------------- laminar duct

/// Fully developed laminar flow in a square duct: f·Re = 56.91 (Darcy, Shah &
/// London), i.e. dp/dx = 28.455 μ U / Dh².
#[test]
fn laminar_square_duct_pressure_drop() {
    let (a, l, mu) = (10.0, 120.0, 1e-3);
    let u = 2e-3; // Re = U Dh / ν = 20
    let m = square_duct(
        a,
        l,
        48,
        10,
        mu,
        json!({ "id": "in", "target": "left", "type": "inlet", "velocity": u, "Tin": 20 }),
        json!({ "type": "steady", "flow": true, "flowSteps": 4000 }),
    );
    let d = solve(&m);
    let (_, nx, ny, nz, dx, _, _) = d.grid();
    assert_eq!((nx, ny, nz), (48, 10, 10));
    assert!(d.header["fields"]["w"].is_object(), "3D result carries w");
    assert!(d.header["fields"]["speed"].is_object(), "3D result carries speed");
    let (i0, i1) = (nx / 2, nx * 9 / 10);
    let dpdx = (section_mean(&d, "p", i1) - section_mean(&d, "p", i0)) / ((i1 - i0) as f64 * dx * 1e-3);
    let dh = a * 1e-3;
    let exact = -28.455 * mu * u / (dh * dh);
    let umean = section_mean(&d, "u", nx * 3 / 4);
    eprintln!("dp/dx {dpdx:.5} exact {exact:.5} ratio {:.4}; mean u {umean:.6e} (U {u:e})", dpdx / exact);
    assert!((dpdx / exact - 1.0).abs() < 0.04, "dp/dx {dpdx} vs {exact}");
    assert!((umean / u - 1.0).abs() < 1e-3, "mean velocity {umean} vs {u}");
    // centreline / mean velocity of the fully developed square duct: 2.096
    let f = d.field("u", 0).unwrap();
    let ic = nx * 3 / 4;
    let uc = (f[ic + nx * (4 + ny * 4)] + f[ic + nx * (5 + ny * 4)] + f[ic + nx * (4 + ny * 5)] + f[ic + nx * (5 + ny * 5)]) as f64 / 4.0;
    eprintln!("centre/mean {:.4}", uc / u);
    assert!(uc / u > 1.9 && uc / u < 2.15, "centre/mean {}", uc / u);
    // mass balance in / out
    let (mi, mo) = (num(&bc(&d, "in")["massFlow"]), num(&bc(&d, "out")["massFlow"]));
    let expect = 1000.0 * u * (a * 1e-3) * (a * 1e-3);
    eprintln!("mass in {mi:e} out {mo:e} expect {expect:e}  pressureDrop {}", d.header["flow"]["pressureDrop"]);
    assert!((mi / expect - 1.0).abs() < 1e-9 && (mi + mo).abs() < 1e-6 * mi);
    let res = &d.header["residuals"]["series"];
    assert!(res["w"].is_array(), "3D residual history has a w series");
}

/// The same duct turned along z: front inlet, back outlet (3D face targets).
#[test]
fn laminar_duct_along_z_front_to_back() {
    let (a, l, mu, u) = (10.0, 80.0, 1e-3, 2e-3);
    let m = json!({
        "domain": { "dim": 3, "width": a, "height": a, "depth": l, "nx": 10, "ny": 10, "nz": 32, "background": "liq" },
        "ambient": 20,
        "materials": [liquid(mu)],
        "bodies": [],
        "boundaries": [
            { "id": "in", "target": "front", "type": "inlet", "velocity": u, "Tin": 20 },
            { "id": "out", "target": "back", "type": "outlet" }
        ],
        "study": { "type": "steady", "flow": true, "flowSteps": 4000 }
    });
    let d = solve(&m);
    let (_, nx, ny, nz, _, _, dz) = d.grid();
    let p = d.field("p", 0).unwrap();
    let w = d.field("w", 0).unwrap();
    let mean = |f: &[f32], k: usize| -> f64 { (0..nx * ny).map(|c| f[c + nx * ny * k] as f64).sum::<f64>() / (nx * ny) as f64 };
    let (k0, k1) = (nz / 2, nz * 9 / 10);
    let dpdz = (mean(p, k1) - mean(p, k0)) / ((k1 - k0) as f64 * dz * 1e-3);
    let exact = -28.455 * mu * u / 1e-4;
    eprintln!("dp/dz {dpdz:.5} exact {exact:.5}; mean w {:.6e}", mean(w, nz * 3 / 4));
    assert!((dpdz / exact - 1.0).abs() < 0.05, "dp/dz {dpdz} vs {exact}");
    assert!((mean(w, nz * 3 / 4) / u - 1.0).abs() < 1e-3);
}

// ------------------------------------------------------------- natural convection

/// Differentially heated cubical cavity at Ra ≈ 1e4 (hot −x, cold +x, the
/// other walls adiabatic). Benchmark (Fusegi et al. 1991, Tric et al. 2000):
/// mean Nu ≈ 2.05–2.10.
#[test]
fn natural_convection_cubical_cavity() {
    let l = 20.0; // mm
    let (k, rho, cp, mu, beta) = (0.026, 1.2, 1000.0, 1.8e-5, 1.0 / 300.0);
    let nu = mu / rho;
    let alpha = k / (rho * cp);
    let ra = 1e4;
    let dt = ra * nu * alpha / (9.81 * beta * (l * 1e-3f64).powi(3));
    let m = json!({
        "domain": { "dim": 3, "width": l, "height": l, "depth": l, "nx": 16, "ny": 16, "nz": 16, "background": "air" },
        "ambient": 20,
        "gravity": [0, -9.81, 0],
        "materials": [{ "id": "air", "kind": "fluid", "k": k, "rho": rho, "cp": cp, "mu": mu, "beta": beta }],
        "bodies": [],
        "boundaries": [
            { "id": "hot", "target": "left", "type": "temperature", "T": 20.0 + dt / 2.0 },
            { "id": "cold", "target": "right", "type": "temperature", "T": 20.0 - dt / 2.0 }
        ],
        "study": { "type": "steady", "flow": true, "natural": true, "Tref": 20, "flowSteps": 6000 }
    });
    let d = solve(&m);
    let qh = num(&bc(&d, "hot")["heat"]);
    let qc = num(&bc(&d, "cold")["heat"]);
    let nusselt = qh / (k * dt * l * 1e-3);
    let err = num(&d.header["balance"]["error"]);
    eprintln!("ΔT {dt:.3} K  Q hot {qh:.5e} cold {qc:.5e}  Nu {nusselt:.4}  balance {err:e}  vmax {}", d.stat("vmax"));
    assert!(nusselt > 1.85 && nusselt < 2.35, "Nu {nusselt}");
    assert!(err < 1e-4, "energy balance {err}");
    let tmin = d.stat("Tmin");
    let tmax = d.stat("Tmax");
    assert!(tmin >= 20.0 - dt / 2.0 - 1e-6 && tmax <= 20.0 + dt / 2.0 + 1e-6);
    // the flow rises at the hot wall: v > 0 near −x mid-height
    let (_, nx, ny, nz, _, _, _) = d.grid();
    let v = d.field("v", 0).unwrap();
    assert!(v[1 + nx * (ny / 2 + ny * (nz / 2))] > 0.0);
    assert!(v[nx - 2 + nx * (ny / 2 + ny * (nz / 2))] < 0.0);
}

// ------------------------------------------------------------- CHT

/// Water channel (6×6 mm) through a heated aluminium block (60×20×20 mm, 10 W),
/// all outer faces adiabatic: the heat leaves with the water.
#[test]
fn cht_channel_through_heated_block() {
    let u = 0.05;
    let m = json!({
        "domain": { "dim": 3, "width": 60, "height": 20, "depth": 20, "nx": 30, "ny": 10, "nz": 10, "background": "al" },
        "ambient": 20,
        "materials": [
            { "id": "al", "kind": "solid", "k": 167, "rho": 2700, "cp": 896 },
            liquid(1e-3)
        ],
        "bodies": [
            { "id": "ch", "shape": "rect", "x": 0, "y": 6, "w": 60, "h": 6, "z0": 6, "z1": 12, "material": "liq" },
            { "id": "heat", "shape": "rect", "x": 20, "y": 14, "w": 20, "h": 6, "z0": 0, "z1": 20, "material": "al", "power": 10 }
        ],
        "boundaries": [
            { "id": "in", "target": "left", "type": "inlet", "velocity": u, "Tin": 20 },
            { "id": "out", "target": "right", "type": "outlet" }
        ],
        "study": { "type": "steady", "flow": true }
    });
    let d = solve(&m);
    let err = num(&d.header["balance"]["error"]);
    let qin = num(&bc(&d, "in")["heat"]);
    let qout = num(&bc(&d, "out")["heat"]);
    let tout = num(&bc(&d, "out")["temperatureAvg"]);
    let mdot = 1000.0 * u * 36e-6;
    let rise = 10.0 / (mdot * 4180.0);
    eprintln!("balance {err:e}  heat in {qin:.5} out {qout:.5}  Tout {tout:.4} (expected {:.4})  Tmax {:.3}", 20.0 + rise, d.stat("Tmax"));
    assert!(err <= 1e-3, "energy balance {err}");
    assert!((tout - 20.0 - rise).abs() < 0.01 * rise, "outlet temperature {tout}");
    assert!(d.stat("Tmax") > 20.0 + rise);
}

// ------------------------------------------------------------- fans

const DUCT_MU: f64 = 0.01; // ν = 1e-5: Re ≈ 10, entrance effects ≈ 2 %

/// Laminar square-duct resistance Δp = 28.455 μ U L / Dh² against the linear
/// fan curve Δp = p0 (1 − Q/Qmax): the operating point.
fn duct_operating_point(p0: f64, qmax: f64, l: f64) -> (f64, f64) {
    let (dh, area) = (0.01, 1e-4);
    let r = 28.455 * DUCT_MU * (l * 1e-3) / (dh * dh) / area; // Pa per m³/s
    let q = p0 / (r + p0 / qmax);
    (q, r * q)
}

#[test]
fn fan_on_a_3d_face_finds_the_operating_point() {
    let (p0, qmax, l) = (6.0, 2e-6, 100.0);
    let m = square_duct(
        10.0,
        l,
        40,
        8,
        DUCT_MU,
        json!({ "id": "fan", "target": "left", "type": "fan", "curve": [[0, p0], [qmax, 0]], "Tin": 20 }),
        json!({ "type": "steady", "flow": true, "flowSteps": 6000 }),
    );
    let d = solve(&m);
    let op = &bc(&d, "fan")["operatingPoint"];
    let (q, dp) = (num(&op["flow"]), num(&op["pressure"]));
    let (qa, dpa) = duct_operating_point(p0, qmax, l);
    let on_curve = p0 * (1.0 - q / qmax);
    eprintln!("fan Q {q:.5e} dp {dp:.4}  curve {on_curve:.4}  analytic Q {qa:.5e} dp {dpa:.4}  volumeFlow {}", bc(&d, "fan")["volumeFlow"]);
    assert!((dp - on_curve).abs() < 0.01 * p0, "operating point off the curve");
    assert!((q / qa - 1.0).abs() < 0.05, "Q {q} vs {qa}");
    assert!((num(&bc(&d, "fan")["volumeFlow"]) / q - 1.0).abs() < 1e-3);
}

/// Internal fan (pressure jump) in the middle of a duct that is open at both
/// ends: it draws fluid in through one end and pushes it out of the other.
fn internal_fan_duct(dim: usize, p0: f64, qmax: f64, l: f64) -> Value {
    let (domain, region) = if dim == 3 {
        (
            json!({ "dim": 3, "width": l, "height": 10, "depth": 10, "nx": 40, "ny": 8, "nz": 8, "background": "liq" }),
            json!([l / 2.0 - 5.0, 0, 0, l / 2.0 + 5.0, 10, 10]),
        )
    } else {
        (
            json!({ "dim": 2, "width": l, "height": 10, "depth": 10, "nx": 80, "ny": 16, "background": "liq" }),
            json!([l / 2.0 - 5.0, 0, l / 2.0 + 5.0, 10]),
        )
    };
    json!({
        "domain": domain,
        "ambient": 20,
        "materials": [liquid(DUCT_MU)],
        "bodies": [],
        "boundaries": [
            { "id": "a", "target": "left", "type": "open" },
            { "id": "b", "target": "right", "type": "outlet" },
            { "id": "fan", "target": "interior", "region": region, "type": "internalFan", "direction": "+x", "curve": [[0, p0], [qmax, 0]] }
        ],
        "study": { "type": "steady", "flow": true, "flowSteps": 8000 }
    })
}

#[test]
fn internal_fan_3d_operating_point() {
    let (p0, qmax, l) = (6.0, 2e-6, 100.0);
    let d = solve(&internal_fan_duct(3, p0, qmax, l));
    let f = bc(&d, "fan");
    let (q, dp) = (num(&f["operatingPoint"]["flow"]), num(&f["operatingPoint"]["pressure"]));
    let (qa, dpa) = duct_operating_point(p0, qmax, l);
    let on_curve = p0 * (1.0 - q / qmax);
    let mb = num(&bc(&d, "b")["volumeFlow"]);
    eprintln!("internal fan Q {q:.5e} dp {dp:.4} curve {on_curve:.4}  analytic Q {qa:.5e} dp {dpa:.4}  outlet {mb:.5e}  area {}", f["area"]);
    assert!((dp - on_curve).abs() < 0.01 * p0, "operating point off the curve");
    assert!((q / qa - 1.0).abs() < 0.06, "Q {q} vs {qa}");
    assert!((-mb / q - 1.0).abs() < 1e-3, "outflow {mb} vs fan flow {q}");
    assert!((num(&f["area"]) - 1e-4).abs() < 1e-12);
    assert!((num(&f["massFlow"]) / (1000.0 * q) - 1.0).abs() < 1e-9);
}

#[test]
fn internal_fan_2d_operating_point_and_reverse_direction() {
    let (p0, qmax, l) = (2.0, 2e-6, 100.0);
    // 2D parallel plates, gap H = 10 mm, depth 10 mm: Δp = 12 μ U L / H².
    let r = 12.0 * DUCT_MU * (l * 1e-3) / (0.01f64 * 0.01) / 1e-4;
    let qa = p0 / (r + p0 / qmax);
    for dir in ["+x", "-x"] {
        let mut m = internal_fan_duct(2, p0, qmax, l);
        m["boundaries"][2]["direction"] = json!(dir);
        m["boundaries"][0]["type"] = json!("outlet");
        let d = solve(&m);
        let f = bc(&d, "fan");
        let (q, dp) = (num(&f["operatingPoint"]["flow"]), num(&f["operatingPoint"]["pressure"]));
        let on_curve = p0 * (1.0 - q / qmax);
        let mb = num(&bc(&d, "b")["volumeFlow"]);
        eprintln!("2D internal fan {dir}: Q {q:.5e} dp {dp:.4} curve {on_curve:.4} analytic Q {qa:.5e}  right {mb:.4e}");
        assert!((dp - on_curve).abs() < 0.01 * p0);
        assert!((q / qa - 1.0).abs() < 0.05, "Q {q} vs {qa}");
        let sign = if dir == "+x" { -1.0 } else { 1.0 };
        assert!((sign * mb / q - 1.0).abs() < 1e-3, "right boundary flow {mb}");
    }
}

// ------------------------------------------------------------- turbulence

/// Turbulent square duct, Re_Dh = 20 000, wall functions: sanity of the 3D SST
/// solution (friction factor near Blasius, eddy viscosity, y+).
#[test]
fn turbulent_square_duct_sanity() {
    let u = 1.0;
    let m = square_duct(
        20.0,
        600.0,
        60,
        10,
        1e-3,
        json!({ "id": "in", "target": "left", "type": "inlet", "velocity": u, "Tin": 20 }),
        json!({ "type": "steady", "flow": true, "turbulence": "kOmegaSST", "flowSteps": 4000 }),
    );
    let d = solve(&m);
    let (_, nx, ny, nz, dx, _, _) = d.grid();
    let (i0, i1) = (nx * 6 / 10, nx * 9 / 10);
    let dpdx = (section_mean(&d, "p", i1) - section_mean(&d, "p", i0)) / ((i1 - i0) as f64 * dx * 1e-3);
    let f = -dpdx * 0.02 / (0.5 * 1000.0 * u * u);
    let blasius = 0.316 * 20000f64.powf(-0.25);
    let nut = d.field("nut", 0).unwrap();
    let ic = nx * 3 / 4 + nx * (ny / 2 + ny * (nz / 2));
    let yp = d.stat("yPlusMax");
    eprintln!("f {f:.5} Blasius {blasius:.5}  nut/nu centre {:.1}  y+max {yp:.1}  k series {}", nut[ic] as f64 / 1e-6, d.header["residuals"]["series"]["k"].is_array());
    assert!(f > 0.65 * blasius && f < 1.5 * blasius, "friction factor {f}");
    assert!(nut[ic] as f64 / 1e-6 > 10.0, "eddy viscosity in the core");
    assert!(yp > 5.0 && yp < 300.0, "y+ {yp}");
    assert!(d.header["fields"]["k"].is_object() && d.header["fields"]["omega"].is_object());
}

// ------------------------------------------------------------- 2D regression

/// A 2D CHT model gives the numbers of the 2D-only solver (values from the
/// solver before the 3D generalisation; identical to the printed digits).
#[test]
fn two_d_flow_unchanged() {
    let m = json!({
        "domain": { "dim": 2, "width": 60, "height": 12, "depth": 10, "nx": 60, "ny": 12, "background": "liq" },
        "ambient": 20,
        "gravity": [0, -9.81],
        "materials": [
            { "id": "al", "kind": "solid", "k": 167, "rho": 2700, "cp": 896 },
            liquid(1e-3)
        ],
        "bodies": [{ "id": "chip", "shape": "rect", "x": 20, "y": 0, "w": 10, "h": 3, "material": "al", "power": 5 }],
        "boundaries": [
            { "id": "in", "target": "left", "type": "inlet", "velocity": 0.02, "Tin": 20 },
            { "id": "out", "target": "right", "type": "outlet" }
        ],
        "study": { "type": "steady", "flow": true, "natural": true }
    });
    let d = solve(&m);
    eprintln!(
        "Tmax {:.12} vmax {:.12} dp {:.12e} out T {:.12}",
        d.stat("Tmax"),
        d.stat("vmax"),
        num(&d.header["flow"]["pressureDrop"]),
        num(&bc(&d, "out")["temperatureAvg"])
    );
    assert!(d.header["fields"]["w"].is_null(), "no w in 2D");
    let expect = REGRESSION_2D;
    let got = [d.stat("Tmax"), d.stat("vmax"), num(&d.header["flow"]["pressureDrop"]), num(&bc(&d, "out")["temperatureAvg"])];
    for (g, e) in got.iter().zip(expect.iter()) {
        assert!((g - e).abs() <= 1e-9 * e.abs().max(1e-12), "{g} vs {e}");
    }
}

const REGRESSION_2D: [f64; 4] = [51.840950302737475, 0.03441420712509578, 0.3778791421651608, 20.498871840678248];

// ------------------------------------------------------------- exploration

/// Grid refinement of the laminar duct, the cavity and the turbulent duct
/// (prints; `cargo test --release --test flow3d -- --ignored --nocapture`).
#[cfg(feature = "slow-tests")]
#[test]
fn grid_refinement_explore() {
    let (a, l, mu, u) = (10.0, 120.0, 1e-3, 2e-3);
    for n in [8usize, 10, 16, 20] {
        let m = square_duct(a, l, 48, n, mu, json!({ "id": "in", "target": "left", "type": "inlet", "velocity": u, "Tin": 20 }), json!({ "type": "steady", "flow": true, "flowSteps": 4000 }));
        let d = solve(&m);
        let (_, nx, _, _, dx, _, _) = d.grid();
        let (i0, i1) = (nx / 2, nx * 9 / 10);
        let dpdx = (section_mean(&d, "p", i1) - section_mean(&d, "p", i0)) / ((i1 - i0) as f64 * dx * 1e-3);
        eprintln!("duct n={n}: dp/dx ratio {:.4}", dpdx / (-28.455 * mu * u / 1e-4));
    }
    for (n, l, nxx) in [(10usize, 600.0, 60usize), (16, 600.0, 60), (12, 1600.0, 160)] {
        let m = square_duct(20.0, l, nxx, n, 1e-3, json!({ "id": "in", "target": "left", "type": "inlet", "velocity": 1.0, "Tin": 20 }), json!({ "type": "steady", "flow": true, "turbulence": "kOmegaSST", "flowSteps": 4000 }));
        let d = solve(&m);
        let (_, nx, _, _, dx, _, _) = d.grid();
        for (f0, f1) in [(0.3, 0.5), (0.6, 0.9)] {
            let (i0, i1) = ((nx as f64 * f0) as usize, (nx as f64 * f1) as usize);
            let dpdx = (section_mean(&d, "p", i1) - section_mean(&d, "p", i0)) / ((i1 - i0) as f64 * dx * 1e-3);
            eprintln!("turbulent duct n={n} L={l} x {f0}-{f1}: f {:.5} (Blasius 0.02657) y+ {:.1}", -dpdx * 0.02 / 500.0, d.stat("yPlusMax"));
        }
    }
}

/// A 3D slab with slip (symmetry) front/back faces reproduces the 2D solution
/// of the same section: laminar CHT with natural convection, and k-ω SST.
#[test]
fn slab_with_slip_faces_matches_2d() {
    let base = |dim: usize, turb: bool| -> Value {
        let mut bcs = vec![
            json!({ "id": "in", "target": "left", "type": "inlet", "velocity": if turb { 0.5 } else { 0.02 }, "Tin": 20 }),
            json!({ "id": "out", "target": "right", "type": "outlet" }),
        ];
        if dim == 3 {
            bcs.push(json!({ "id": "f", "target": "front", "type": "slip" }));
            bcs.push(json!({ "id": "b", "target": "back", "type": "slip" }));
        }
        json!({
            "domain": { "dim": dim, "width": 300, "height": 12, "depth": 10, "nx": 100, "ny": 12, "nz": 2, "background": "liq" },
            "ambient": 20,
            "gravity": [0, -9.81, 0],
            "materials": [{ "id": "al", "kind": "solid", "k": 167, "rho": 2700, "cp": 896 }, liquid(1e-3)],
            "bodies": [{ "id": "chip", "shape": "rect", "x": 60, "y": 0, "w": 30, "h": 2, "z0": 0, "z1": 10, "material": "al", "power": 5 }],
            "boundaries": bcs,
            "study": { "type": "steady", "flow": true, "natural": !turb, "turbulence": if turb { "kOmegaSST" } else { "laminar" }, "flowSteps": 4000 }
        })
    };
    for turb in [false, true] {
        let d2 = solve(&base(2, turb));
        let d3 = solve(&base(3, turb));
        let (t2, t3) = (d2.stat("Tmax"), d3.stat("Tmax"));
        let (v2, v3) = (d2.stat("vmax"), d3.stat("vmax"));
        let (p2, p3) = (num(&d2.header["flow"]["pressureDrop"]), num(&d3.header["flow"]["pressureDrop"]));
        // u field: 2D cell (i, j) against the 3D cells (i, j, 0/1)
        let (u2, u3) = (d2.field("u", 0).unwrap(), d3.field("u", 0).unwrap());
        let n2 = u2.len();
        let du = (0..n2).map(|c| (u2[c] - u3[c]).abs().max((u2[c] - u3[c + n2]).abs())).fold(0.0f32, f32::max);
        let wmax = d3.field("w", 0).unwrap().iter().fold(0.0f32, |m, x| m.max(x.abs()));
        eprintln!("turb={turb}: Tmax {t2:.6} / {t3:.6}  vmax {v2:.6} / {v3:.6}  dp {p2:.6} / {p3:.6}  max|du| {du:.2e}  max|w| {wmax:.2e}");
        assert!((t2 - t3).abs() < 3e-3 * (t2 - 20.0), "Tmax");
        assert!((v2 / v3 - 1.0).abs() < 2e-3 && (p2 / p3 - 1.0).abs() < 1.5e-2, "flow");
        assert!((du as f64) < 1e-2 * v2, "u field");
        assert!((wmax as f64) < 2e-3 * v2, "w stays (numerically) zero");
        if turb {
            let (y2, y3) = (d2.stat("yPlusMax"), d3.stat("yPlusMax"));
            assert!((y2 / y3 - 1.0).abs() < 1e-2, "y+ {y2} / {y3}");
        }
    }
}

/// Square duct against the 2D channel of the same height and resolution
/// (prints; separates the corner effect from the grid resolution).
#[cfg(feature = "slow-tests")]
#[test]
fn turbulent_duct_vs_channel_explore() {
    for n in [10usize, 16] {
        let mut m = square_duct(20.0, 1000.0, 100, n, 1e-3, json!({ "id": "in", "target": "left", "type": "inlet", "velocity": 1.0, "Tin": 20 }), json!({ "type": "steady", "flow": true, "turbulence": "kOmegaSST", "flowSteps": 4000 }));
        m["domain"]["dim"] = json!(2);
        let d = solve(&m);
        let (_, nx, ny, _, dx, _, _) = d.grid();
        let p = d.field("p", 0).unwrap();
        let mean = |i: usize| (0..ny).map(|j| p[i + nx * j] as f64).sum::<f64>() / ny as f64;
        let (i0, i1) = (nx * 6 / 10, nx * 9 / 10);
        let dpdx = (mean(i1) - mean(i0)) / ((i1 - i0) as f64 * dx * 1e-3);
        // parallel plates: Dh = 2H = 40 mm, Re = 40 000; Dean Cf = 0.073 Re^-0.25 → f = 4 Cf
        let f = -dpdx * 0.04 / 500.0;
        eprintln!("2D channel n={n}: f {f:.5}  Dean {:.5}  y+ {:.1}", 4.0 * 0.073 * 40000f64.powf(-0.25), d.stat("yPlusMax"));
    }
}

/// Heat sink in an air duct on a 60×40×30 grid: forced (laminar and SST) and
/// natural convection (prints timings; run in release with --ignored).
#[cfg(feature = "slow-tests")]
fn heatsink_60x40x30(study: Value, natural: bool) -> Value {
    let mut bodies = vec![
        json!({ "id": "base", "shape": "rect", "x": 40, "y": 0, "w": 40, "h": 6, "z0": 10, "z1": 50, "material": "al" }),
        json!({ "id": "chip", "shape": "rect", "x": 52, "y": 0, "w": 16, "h": 2, "z0": 22, "z1": 38, "material": "si", "power": 20 }),
    ];
    for f in 0..6 {
        let z = 12.0 + f as f64 * 6.8;
        bodies.push(json!({ "id": format!("fin{f}"), "shape": "rect", "x": 40, "y": 6, "w": 40, "h": 40, "z0": z, "z1": z + 2.0, "material": "al" }));
    }
    let bcs = if natural {
        json!([
            { "id": "cold1", "target": "left", "type": "temperature", "T": 25 },
            { "id": "cold2", "target": "right", "type": "temperature", "T": 25 }
        ])
    } else {
        json!([
            { "id": "in", "target": "left", "type": "inlet", "velocity": 1.0, "Tin": 25 },
            { "id": "out", "target": "right", "type": "outlet" }
        ])
    };
    json!({
        "domain": { "dim": 3, "width": 120, "height": 80, "depth": 60, "nx": 60, "ny": 40, "nz": 30, "background": "air" },
        "ambient": 25,
        "gravity": [0, -9.81, 0],
        "materials": [
            { "id": "air", "kind": "fluid", "k": 0.026, "rho": 1.18, "cp": 1006, "mu": 1.85e-5, "beta": 0.00335 },
            { "id": "al", "kind": "solid", "k": 200, "rho": 2700, "cp": 900 },
            { "id": "si", "kind": "solid", "k": 150, "rho": 2330, "cp": 700 }
        ],
        "bodies": bodies,
        "boundaries": bcs,
        "study": study
    })
}

#[cfg(feature = "slow-tests")]
#[test]
fn perf_heatsink_60x40x30() {
    for (name, study, natural) in [
        ("forced laminar", json!({ "type": "steady", "flow": true }), false),
        ("forced kOmegaSST", json!({ "type": "steady", "flow": true, "turbulence": "kOmegaSST" }), false),
        ("natural", json!({ "type": "steady", "flow": true, "natural": true }), true),
    ] {
        let t = std::time::Instant::now();
        let d = solve(&heatsink_60x40x30(study, natural));
        eprintln!(
            "{name}: {:.2} s  Tmax {:.3}  vmax {:.4}  balance {:e}  y+ {:.1}",
            t.elapsed().as_secs_f64(),
            d.stat("Tmax"),
            d.stat("vmax"),
            num(&d.header["balance"]["error"]),
            d.stat("yPlusMax")
        );
        assert!(num(&d.header["balance"]["error"]) < 1e-3);
    }
}
