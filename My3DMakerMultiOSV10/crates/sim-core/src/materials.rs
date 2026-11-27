//! Built-in engineering data (SI). The user interface has the same table (src/sim/materials.js)
//! and sends the user's edited copies with each job; these are the fallbacks.

use crate::model::Material;

#[allow(clippy::too_many_arguments)]
fn solid(name: &str, density: f64, young_gpa: f64, poisson: f64, cte: f64, k: f64, cp: f64, yield_mpa: f64, ult_mpa: f64, sf_mpa: f64, b: f64, rho_e: f64, mu_r: f64) -> Material {
    Material {
        name: name.into(), density, young: young_gpa * 1e9, poisson, cte, conductivity: k, specific_heat: cp,
        yield_strength: yield_mpa * 1e6, ultimate: ult_mpa * 1e6, tangent: young_gpa * 1e9 / 100.0,
        fatigue_sf: sf_mpa * 1e6, fatigue_b: b, endurance: 0.0, resistivity: rho_e, permittivity: 1.0, permeability: mu_r,
        viscosity: 0.0, sound_speed: 0.0, expansion: 0.0, emissivity: 0.8,
        ..Material::default()
    }
}

pub fn structural_steel() -> Material { solid("Structural steel", 7850.0, 200.0, 0.3, 1.2e-5, 60.5, 434.0, 250.0, 460.0, 920.0, -0.106, 1.7e-7, 1000.0) }

pub fn library(id: &str) -> Option<Material> {
    Some(match id {
        "steel" | "structuralSteel" => structural_steel(),
        "stainless" => solid("Stainless steel", 7750.0, 193.0, 0.31, 1.7e-5, 15.1, 480.0, 207.0, 586.0, 1000.0, -0.1, 7.7e-7, 1.0),
        "aluminum" => solid("Aluminium alloy", 2770.0, 71.0, 0.33, 2.3e-5, 144.0, 875.0, 280.0, 310.0, 500.0, -0.11, 4.3e-8, 1.0),
        "titanium" => solid("Titanium alloy", 4620.0, 96.0, 0.36, 9.4e-6, 21.9, 522.0, 930.0, 1070.0, 1400.0, -0.09, 1.7e-6, 1.0),
        "copper" => solid("Copper alloy", 8300.0, 110.0, 0.34, 1.8e-5, 401.0, 385.0, 280.0, 430.0, 600.0, -0.1, 1.72e-8, 1.0),
        "castIron" => solid("Gray cast iron", 7200.0, 110.0, 0.28, 1.1e-5, 52.0, 447.0, 150.0, 240.0, 400.0, -0.1, 9.6e-7, 300.0),
        "magnesium" => solid("Magnesium alloy", 1800.0, 45.0, 0.35, 2.6e-5, 156.0, 1024.0, 150.0, 250.0, 380.0, -0.11, 4.4e-8, 1.0),
        "concrete" => solid("Concrete", 2300.0, 30.0, 0.18, 1.4e-5, 0.72, 780.0, 30.0, 3.0, 0.0, -0.1, 1e3, 1.0),
        "abs" => solid("ABS plastic", 1040.0, 2.2, 0.35, 9.0e-5, 0.17, 1400.0, 40.0, 45.0, 0.0, -0.1, 1e14, 1.0),
        "nylon" => solid("Nylon", 1140.0, 2.7, 0.39, 8.0e-5, 0.25, 1700.0, 60.0, 75.0, 0.0, -0.1, 1e13, 1.0),
        "pcb" => solid("FR-4 board", 1850.0, 22.0, 0.15, 1.4e-5, 0.3, 1100.0, 300.0, 310.0, 0.0, -0.1, 1e14, 1.0),
        "silicon" => solid("Silicon", 2330.0, 130.0, 0.28, 2.6e-6, 148.0, 712.0, 7000.0, 7000.0, 0.0, -0.1, 6.4e2, 1.0),
        "rubber" => { let mut m = solid("Rubber", 1000.0, 0.0036, 0.49, 2.0e-4, 0.16, 2000.0, 10.0, 15.0, 0.0, -0.1, 1e13, 1.0); m.c10 = 0.5e6; m.c01 = 0.1e6; m.d1 = 3.33e-8; m }
        "creepSteel" => { let mut m = solid("Heat-resistant steel (550 °C)", 7900.0, 170.0, 0.3, 1.4e-5, 25.0, 560.0, 180.0, 450.0, 700.0, -0.1, 9e-7, 1.0); m.creep_a = 2e-49; m.creep_n = 5.0; m.creep_m = 0.0; m }
        "glass" => solid("Glass", 2500.0, 70.0, 0.22, 9.0e-6, 1.05, 840.0, 50.0, 50.0, 0.0, -0.1, 1e12, 1.0),
        "wood" => solid("Wood", 600.0, 11.0, 0.3, 5.0e-6, 0.12, 1700.0, 40.0, 80.0, 0.0, -0.1, 1e14, 1.0),
        "ferrite" => { let mut m = solid("Soft iron", 7870.0, 200.0, 0.29, 1.2e-5, 80.0, 450.0, 50.0, 250.0, 0.0, -0.1, 1e-7, 4000.0); m.permittivity = 1.0; m }
        "magnetNdFeB" => solid("NdFeB magnet", 7500.0, 160.0, 0.24, 5.0e-6, 9.0, 440.0, 80.0, 80.0, 0.0, -0.1, 1.5e-6, 1.05),
        "air" => Material { name: "Air".into(), density: 1.225, young: 0.0, poisson: 0.0, cte: 0.0, conductivity: 0.0262, specific_heat: 1006.0, yield_strength: 0.0, ultimate: 0.0, tangent: 0.0, fatigue_sf: 0.0, fatigue_b: 0.0, endurance: 0.0, resistivity: 1e16, permittivity: 1.0, permeability: 1.0, viscosity: 1.81e-5, sound_speed: 343.0, expansion: 3.43e-3, emissivity: 0.0, ..Material::default() },
        "water" => Material { name: "Water".into(), density: 998.0, young: 0.0, poisson: 0.0, cte: 0.0, conductivity: 0.6, specific_heat: 4182.0, yield_strength: 0.0, ultimate: 0.0, tangent: 0.0, fatigue_sf: 0.0, fatigue_b: 0.0, endurance: 0.0, resistivity: 2e5, permittivity: 80.0, permeability: 1.0, viscosity: 1.0e-3, sound_speed: 1482.0, expansion: 2.1e-4, emissivity: 0.0, ..Material::default() },
        "oil" => Material { name: "Engine oil".into(), density: 880.0, young: 0.0, poisson: 0.0, cte: 0.0, conductivity: 0.145, specific_heat: 1880.0, yield_strength: 0.0, ultimate: 0.0, tangent: 0.0, fatigue_sf: 0.0, fatigue_b: 0.0, endurance: 0.0, resistivity: 1e12, permittivity: 2.2, permeability: 1.0, viscosity: 0.2, sound_speed: 1450.0, expansion: 7.0e-4, emissivity: 0.0, ..Material::default() },
        _ => return None,
    })
}

pub const IDS: &[&str] = &["steel", "stainless", "aluminum", "titanium", "copper", "castIron", "magnesium", "concrete", "abs", "nylon", "pcb", "silicon", "rubber", "creepSteel", "glass", "wood", "ferrite", "magnetNdFeB", "air", "water", "oil"];
