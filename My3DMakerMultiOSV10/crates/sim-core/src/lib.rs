//! My3DMaker solver core: geometry, meshing and the physics solvers. The desktop backend calls
//! `run_job_json` natively, the web build through WebAssembly (crates/sim-wasm); both return the
//! same binary container (out.rs).
pub mod cfd;
pub mod dense;
pub mod doe;
pub mod eigen;
pub mod explicit;
pub mod fem;
pub mod fields;
pub mod geom;
pub mod magnetic;
pub mod materials;
pub mod mesh;
pub mod model;
pub mod nonlinear;
pub mod out;
pub mod slice;
pub mod sparse;
pub mod structural;
pub mod topo;
pub mod report;

use model::{Job, Model};
use out::Out;

/// Progress and cancellation: `progress(fraction, message key)` returns false to cancel.
pub struct Ctx<'a> {
    progress: Box<dyn FnMut(f64, &str) -> bool + 'a>,
    pub base: f64,
    pub span: f64,
}

impl<'a> Ctx<'a> {
    pub fn new(progress: impl FnMut(f64, &str) -> bool + 'a) -> Ctx<'a> { Ctx { progress: Box::new(progress), base: 0.0, span: 1.0 } }
    pub fn silent() -> Ctx<'static> { Ctx { progress: Box::new(|_, _| true), base: 0.0, span: 1.0 } }
    pub fn step(&mut self, fraction: f64, key: &str) -> Result<(), String> {
        let f = self.base + self.span * fraction.clamp(0.0, 1.0);
        if (self.progress)(f, key) { Ok(()) } else { Err("cancelled".into()) }
    }
    /// Runs `job` with progress mapped into [a, b] of the current range.
    pub fn sub<T>(&mut self, a: f64, b: f64, job: impl FnOnce(&mut Ctx<'a>) -> T) -> T {
        let (base, span) = (self.base, self.span);
        self.base = base + span * a;
        self.span = span * (b - a);
        let r = job(self);
        self.base = base;
        self.span = span;
        r
    }
}

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Runs one job (JSON) and returns the result container. Errors are message keys
/// ("mesh.tooLarge", "solver.noConvergence", …) the user interface translates.
pub fn run_job_json(json: &str, progress: &mut dyn FnMut(f64, &str) -> bool) -> Result<Vec<u8>, String> {
    let started = now_ms();
    let mut ctx = Ctx::new(|f, k| progress(f, k));
    // Design exploration works on tables, not on a model.
    if let Ok(head) = serde_json::from_str::<serde_json::Value>(json) {
        match head.get("analysis").and_then(|v| v.as_str()) {
            Some("doe") => return doe::run_doe(json),
            Some("fit") => return doe::run_fit(json),
            _ => {}
        }
    }
    let job: Job = serde_json::from_str(json).map_err(|e| format!("job.invalid:{e}"))?;
    let analysis = job.analysis.clone();
    let mut out = Out::new();
    out.set("analysis", serde_json::json!(analysis));
    let model = ctx.sub(0.0, 0.15, |c| Model::build(job, c))?;
    report::mesh_info(&model, &mut out);
    match analysis.as_str() {
        "mesh" => {}
        "static" => ctx.sub(0.15, 1.0, |c| structural::run_static(&model, &mut out, c))?,
        "modal" => ctx.sub(0.15, 1.0, |c| structural::run_modal(&model, &mut out, c))?,
        "buckling" => ctx.sub(0.15, 1.0, |c| structural::run_buckling(&model, &mut out, c))?,
        "harmonic" => ctx.sub(0.15, 1.0, |c| structural::run_harmonic(&model, &mut out, c))?,
        "transient" => ctx.sub(0.15, 1.0, |c| structural::run_transient(&model, &mut out, c))?,
        "spectrum" => ctx.sub(0.15, 1.0, |c| structural::run_spectrum(&model, &mut out, c))?,
        "random" => ctx.sub(0.15, 1.0, |c| structural::run_random(&model, &mut out, c))?,
        "nonlinear" => ctx.sub(0.15, 1.0, |c| nonlinear::run_nonlinear(&model, &mut out, c))?,
        "explicit" => ctx.sub(0.15, 1.0, |c| explicit::run_explicit(&model, &mut out, c))?,
        "topology" => ctx.sub(0.15, 1.0, |c| topo::run_topology(&model, &mut out, c))?,
        "fluid" => ctx.sub(0.15, 1.0, |c| cfd::run_fluid(&model, &mut out, c))?,
        "thermal" => { ctx.sub(0.15, 1.0, |c| fields::run_thermal(&model, &mut out, c))?; }
        "thermalTransient" => ctx.sub(0.15, 1.0, |c| fields::run_thermal_transient(&model, &mut out, c))?,
        "thermalStress" => {
            let mut tout = Out::new();
            let t = ctx.sub(0.15, 0.5, |c| fields::run_thermal(&model, &mut tout, c))?;
            ctx.sub(0.5, 1.0, |c| structural::run_thermal_stress(&model, &t, &mut out, c))?;
            let (tsys_out, _) = (fields::put_thermal_only(&model, &mut out, &t)?, ());
            out.set("thermal", tsys_out);
        }
        "electrostatic" => ctx.sub(0.15, 1.0, |c| fields::run_electrostatic(&model, &mut out, c))?,
        "conduction" => ctx.sub(0.15, 1.0, |c| fields::run_conduction(&model, &mut out, c))?,
        "magnetostatic" => ctx.sub(0.15, 1.0, |c| magnetic::run_magnetostatic(&model, &mut out, c))?,
        "acousticModal" => ctx.sub(0.15, 1.0, |c| fields::run_acoustic_modal(&model, &mut out, c))?,
        "acousticHarmonic" => ctx.sub(0.15, 1.0, |c| fields::run_acoustic_harmonic(&model, &mut out, c))?,
        other => return Err(format!("job.unknownAnalysis:{other}")),
    }
    ctx.step(1.0, "progress.done")?;
    out.set("elapsedMs", serde_json::json!(now_ms() - started));
    out.set("solverVersion", serde_json::json!(VERSION));
    Ok(out.finish())
}

#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> f64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0) }
#[cfg(target_arch = "wasm32")]
fn now_ms() -> f64 { 0.0 }
