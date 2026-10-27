use engine_core::scad::ScadParser;
use engine_core::sdf::SdfScene;

pub fn parse_scad_json(code: &str) -> String {
    let nodes = ScadParser::parse_simple(code);
    serde_json::to_string(&nodes).unwrap_or_else(|_| "[]".to_string())
}

pub fn evaluate_sdf_sample(scene_json: &str, x: f32, y: f32, z: f32) -> f32 {
    if let Ok(scene) = serde_json::from_str::<SdfScene>(scene_json) {
        scene.evaluate(engine_core::types::Vec3::new(x, y, z))
    } else {
        1000.0
    }
}
