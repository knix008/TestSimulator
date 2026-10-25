//! Convection heat transfer coefficients from textbook correlations
//! (boundary field `hMode`), with air properties at the film temperature.
//!
//! - `naturalVertical`: Churchill & Chu (1975), whole Ra range,
//!   Nu = {0.825 + 0.387 Ra^(1/6) / [1 + (0.492/Pr)^(9/16)]^(8/27)}².
//! - `naturalHorizontalUp` (hot surface facing up / cold facing down):
//!   McAdams / Lloyd & Moran, Nu = 0.54 Ra^(1/4) (Ra ≤ 10⁷), 0.15 Ra^(1/3) above.
//! - `naturalHorizontalDown` (hot surface facing down / cold facing up):
//!   Nu = 0.27 Ra^(1/4).
//!   When the surface is colder than the fluid the two horizontal cases swap.
//! - `forcedPlate`: flat plate, average over the length, Re_c = 5·10⁵:
//!   laminar Nu = 0.664 Re^(1/2) Pr^(1/3), mixed Nu = (0.037 Re^(4/5) − 871) Pr^(1/3).
//!
//! Ra = g β |Ts − T∞| L³ / (ν α), β = 1/T_film (K), α = ν/Pr, g = 9.81 m/s².
//! The temperature difference used for h is at least `MIN_DT` so a surface at
//! the fluid temperature still has a finite (small) coefficient.

use crate::model::HMode;

pub const G: f64 = 9.81;
/// Smallest |Ts − T∞| (K) used to evaluate natural-convection coefficients.
pub const MIN_DT: f64 = 0.1;
const KELVIN: f64 = 273.15;

/// Dry air at 1 atm (Incropera, Table A.4): T (K), ν (m²/s), k (W/mK), Pr.
const AIR: [(f64, f64, f64, f64); 12] = [
    (200.0, 7.590e-6, 0.0181, 0.737),
    (250.0, 11.44e-6, 0.0223, 0.720),
    (300.0, 15.89e-6, 0.0263, 0.707),
    (350.0, 20.92e-6, 0.0300, 0.700),
    (400.0, 26.41e-6, 0.0338, 0.690),
    (450.0, 32.39e-6, 0.0373, 0.686),
    (500.0, 38.79e-6, 0.0407, 0.684),
    (600.0, 52.69e-6, 0.0469, 0.685),
    (700.0, 68.10e-6, 0.0524, 0.695),
    (800.0, 84.93e-6, 0.0573, 0.709),
    (900.0, 102.9e-6, 0.0620, 0.717),
    (1000.0, 121.9e-6, 0.0667, 0.726),
];

/// Air properties at T (K), linear in the table, clamped: (k W/mK, ν m²/s, Pr).
pub fn air(tk: f64) -> (f64, f64, f64) {
    let t = tk.clamp(AIR[0].0, AIR[AIR.len() - 1].0);
    for w in AIR.windows(2) {
        let (t0, n0, k0, p0) = w[0];
        let (t1, n1, k1, p1) = w[1];
        if t <= t1 {
            let s = (t - t0) / (t1 - t0);
            return (k0 + s * (k1 - k0), n0 + s * (n1 - n0), p0 + s * (p1 - p0));
        }
    }
    let l = AIR[AIR.len() - 1];
    (l.2, l.1, l.3)
}

/// Rayleigh number for surface ts and fluid tinf (°C), length l (m), with film properties.
pub fn rayleigh(ts: f64, tinf: f64, l: f64) -> (f64, f64, f64) {
    let tf = 0.5 * (ts + tinf) + KELVIN;
    let (k, nu, pr) = air(tf);
    let dt = (ts - tinf).abs().max(MIN_DT);
    let alpha = nu / pr;
    (G * dt * l * l * l / (tf * nu * alpha), k, pr)
}

/// Churchill–Chu average Nusselt number of a vertical plate.
pub fn nu_vertical(ra: f64, pr: f64) -> f64 {
    let d = (1.0 + (0.492 / pr).powf(9.0 / 16.0)).powf(8.0 / 27.0);
    let s = 0.825 + 0.387 * ra.max(0.0).powf(1.0 / 6.0) / d;
    s * s
}

/// Upper surface of a hot plate (or lower surface of a cold plate).
pub fn nu_horizontal_up(ra: f64) -> f64 {
    if ra <= 1e7 {
        0.54 * ra.max(0.0).powf(0.25)
    } else {
        0.15 * ra.powf(1.0 / 3.0)
    }
}

/// Lower surface of a hot plate (or upper surface of a cold plate).
pub fn nu_horizontal_down(ra: f64) -> f64 {
    0.27 * ra.max(0.0).powf(0.25)
}

/// Average Nusselt number of a flat plate in parallel flow (laminar / mixed, Re_c = 5·10⁵).
pub fn nu_plate(re: f64, pr: f64) -> f64 {
    let p3 = pr.powf(1.0 / 3.0);
    if re <= 5e5 {
        0.664 * re.max(0.0).sqrt() * p3
    } else {
        (0.037 * re.powf(0.8) - 871.0) * p3
    }
}

/// Heat transfer coefficient (W/m²K) for surface temperature ts and fluid
/// temperature tinf (°C), characteristic length l (m), velocity (m/s).
pub fn h_correlation(mode: HMode, ts: f64, tinf: f64, l: f64, velocity: f64) -> f64 {
    let l = l.max(1e-6);
    match mode {
        HMode::Fixed => 0.0,
        HMode::ForcedPlate => {
            let tf = 0.5 * (ts + tinf) + KELVIN;
            let (k, nu, pr) = air(tf);
            let re = velocity.abs() * l / nu;
            nu_plate(re, pr) * k / l
        }
        HMode::NaturalVertical | HMode::NaturalHorizontalUp | HMode::NaturalHorizontalDown => {
            let (ra, k, pr) = rayleigh(ts, tinf, l);
            let hot = ts >= tinf;
            let nu = match (mode, hot) {
                (HMode::NaturalVertical, _) => nu_vertical(ra, pr),
                (HMode::NaturalHorizontalUp, true) | (HMode::NaturalHorizontalDown, false) => nu_horizontal_up(ra),
                _ => nu_horizontal_down(ra),
            };
            nu * k / l
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn air_table_interpolates() {
        let (k, nu, pr) = air(300.0);
        assert_eq!((k, nu, pr), (0.0263, 15.89e-6, 0.707));
        let (k, _, _) = air(325.0);
        assert!((k - 0.02815).abs() < 1e-12);
        assert_eq!(air(100.0).0, 0.0181);
    }
}
