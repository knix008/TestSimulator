//! Validation of the solar load (study.solar): absorbed power on lit faces,
//! the cosine law, shadows, the 1D temperature rise it drives and 3D faces.

use heat_core::{decode, run, Decoded};
use serde_json::{json, Value};

fn solve(model: &Value) -> Decoded {
    let bytes = run(&model.to_string(), &mut |_| {}, &|| false);
    let d = decode(&bytes).expect("decodable result");
    assert!(d.ok(), "run failed: {}", d.header["error"]);
    d
}

fn absorbed(d: &Decoded) -> f64 {
    d.header["solar"]["absorbed"].as_f64().expect("solar entry")
}

/// A 2D block (100 × 20 mm, depth 1000 mm) in a void domain, cooled at its bottom face to 20 °C.
fn block(sun: Value, extra_bodies: Vec<Value>) -> Value {
    let mut bodies = vec![json!({ "id": "plate", "shape": "rect", "x": 10, "y": 10, "w": 100, "h": 20, "material": "al" })];
    bodies.extend(extra_bodies);
    json!({
        "domain": { "dim": 2, "width": 120, "height": 80, "depth": 1000, "nx": 120, "ny": 80, "background": null },
        "ambient": 20,
        "materials": [{ "id": "al", "kind": "solid", "k": 100, "rho": 2700, "cp": 900, "absorptivity": 0.5 }],
        "bodies": bodies,
        "boundaries": [{ "id": "sink", "target": "body:plate", "type": "temperature", "T": 20, "region": [0, 9, 120, 11] }],
        "study": { "type": "steady", "solar": sun, "tolerance": 1e-12 }
    })
}

#[test]
fn overhead_sun_on_a_plate_absorbs_alpha_g_a_and_raises_the_top_by_q_l_over_k() {
    let d = solve(&block(json!({ "irradiance": 1000, "elevation": 90 }), vec![]));
    // α·G·A = 0.5 × 1000 W/m² × (0.100 m × 1.0 m)
    let q = absorbed(&d);
    assert!((q - 50.0).abs() < 1e-9, "absorbed {q}");
    assert_eq!(d.header["solar"]["shadedFaces"].as_u64(), Some(0));
    // 1D conduction through 20 mm of k = 100: ΔT = q''·L/k = 500 × 0.020 / 100 = 0.1 K (the top cell sits half a cell lower).
    let tmax = d.stat("Tmax");
    let expected = 20.0 + 500.0 * 0.0195 / 100.0;
    assert!((tmax - expected).abs() < 2e-3, "Tmax {tmax:.6} vs {expected:.6}");
    assert!(d.header["balance"]["error"].as_f64().unwrap() < 1e-6, "balance {} boundaries {}", d.header["balance"], d.header["boundaries"]);
}

#[test]
fn oblique_sun_follows_the_cosine_law_on_the_top_and_the_side() {
    // Elevation 30° from +x (azimuth 0): the top sees sin 30° = 0.5, the +x side cos 30°.
    let d = solve(&block(json!({ "irradiance": 1000, "elevation": 30, "azimuth": 0 }), vec![]));
    let top = 0.5 * 1000.0 * 0.5 * 0.100;
    let side = 0.5 * 1000.0 * (30f64).to_radians().cos() * 0.020;
    let q = absorbed(&d);
    assert!((q - (top + side)).abs() < 1e-9, "absorbed {q} vs {}", top + side);
    // The sun below the horizon heats nothing.
    let night = solve(&block(json!({ "irradiance": 1000, "elevation": -10 }), vec![]));
    assert!(absorbed(&night).abs() < 1e-12);
}

#[test]
fn a_shade_above_the_plate_casts_its_shadow() {
    // A 40 mm wide shade 20 mm above the middle of the plate, under an overhead sun.
    let shade = json!({ "id": "shade", "shape": "rect", "x": 40, "y": 50, "w": 40, "h": 2, "material": "al" });
    let d = solve(&block(json!({ "irradiance": 1000, "elevation": 90 }), vec![shade]));
    // Lit: the plate outside the shadow (60 mm) and the shade's top (40 mm).
    let q = absorbed(&d);
    assert!((q - 0.5 * 1000.0 * 0.100).abs() < 1e-9, "absorbed {q}");
    assert_eq!(d.header["solar"]["shadedFaces"].as_u64(), Some(40), "40 shaded faces of 1 mm");
}

#[test]
fn a_cube_in_3d_takes_sun_on_the_top_and_the_faces_turned_to_it() {
    let model = json!({
        "domain": { "dim": 3, "width": 40, "height": 40, "depth": 40, "nx": 20, "ny": 20, "nz": 20, "background": null },
        "ambient": 20,
        "materials": [{ "id": "al", "kind": "solid", "k": 150, "rho": 2700, "cp": 900, "absorptivity": 0.8 }],
        "bodies": [{ "id": "cube", "shape": "rect", "x": 10, "y": 10, "w": 20, "h": 20, "z0": 10, "z1": 30, "material": "al" }],
        "boundaries": [{ "id": "air", "target": "exterior", "type": "convection", "h": 10, "Tinf": 20 }],
        "study": { "type": "steady", "solar": { "irradiance": 800, "elevation": 45, "azimuth": 90 } }
    });
    let d = solve(&model);
    // s = (0, sin 45°, cos 45°): the top (+y) and the back (+z) faces, each 20 × 20 mm, at cos 45°.
    let face = 0.020 * 0.020;
    let expected = 2.0 * 0.8 * 800.0 * (45f64).to_radians().cos() * face;
    let q = absorbed(&d);
    assert!((q - expected).abs() < 1e-9 * expected.max(1.0), "absorbed {q} vs {expected}");
    // Steady state: everything absorbed leaves through the convection boundary.
    let out = -d.header["boundaries"][0]["heat"].as_f64().unwrap();
    assert!((out - q).abs() < 1e-3 * q, "convected {out} vs absorbed {q}");
}
