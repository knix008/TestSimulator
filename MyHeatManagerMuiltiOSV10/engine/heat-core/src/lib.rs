//! MyHeatManager numerical engine.
//!
//! `run(model_json, progress, cancel)` parses a `.myheat` model, solves the
//! requested study (conduction, phase change, 2D/3D conjugate heat transfer
//! with flow, thermal stress) and returns the binary result described in
//! ARCHITECTURE.md. It never panics outward and always returns result bytes.

pub mod conduction;
pub mod convection;
pub mod flow;
pub mod linalg;
pub mod mesh;
pub mod model;
pub mod result;
pub mod stress;
pub mod turbulence;
pub mod electric;
pub mod modal;
pub mod s2s;
pub mod solar;

pub use result::{decode, field_csv, Decoded};

/// Progress report passed to the host.
#[derive(Clone, Debug)]
pub struct Progress {
    pub phase: String,
    pub fraction: f64,
    pub message: String,
}

#[derive(Debug)]
pub enum Error {
    Cancelled,
    Msg(String),
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Msg(s)
    }
}

/// Solver log line (header "log").
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub phase: String,
    pub iterations: usize,
    pub residual: f64,
}

/// Convergence history: one row per recorded iteration.
#[derive(Default, Clone)]
pub struct Residuals {
    pub iterations: Vec<usize>,
    pub names: Vec<String>,
    /// series[name][row]; None where a series was not recorded in that row.
    pub series: Vec<Vec<Option<f64>>>,
    counter: usize,
}

impl Residuals {
    /// Record one row (raw, unnormalised values).
    pub fn push(&mut self, vals: &[(&str, f64)]) {
        self.counter += 1;
        let row = self.iterations.len();
        self.iterations.push(self.counter);
        for s in self.series.iter_mut() {
            s.push(None);
        }
        for &(name, v) in vals {
            if !v.is_finite() {
                continue;
            }
            let idx = match self.names.iter().position(|n| n == name) {
                Some(i) => i,
                None => {
                    self.names.push(name.to_string());
                    self.series.push(vec![None; row + 1]);
                    self.names.len() - 1
                }
            };
            self.series[idx][row] = Some(v);
        }
    }

    /// Down-sampled (≤ max_points rows) and normalised by each series' first
    /// non-zero value.
    pub fn export(&self, max_points: usize) -> (Vec<usize>, Vec<(String, Vec<Option<f64>>)>) {
        let n = self.iterations.len();
        let rows: Vec<usize> = if n <= max_points {
            (0..n).collect()
        } else {
            let mut v: Vec<usize> = (0..max_points).map(|i| i * (n - 1) / (max_points - 1)).collect();
            v.dedup();
            v
        };
        let iters = rows.iter().map(|&r| self.iterations[r]).collect();
        let mut out = Vec::new();
        for (name, s) in self.names.iter().zip(self.series.iter()) {
            let first = s.iter().flatten().cloned().find(|v| *v != 0.0).unwrap_or(1.0).abs();
            let vals = rows.iter().map(|&r| s[r].map(|v| v / first)).collect();
            out.push((name.clone(), vals));
        }
        (iters, out)
    }
}

/// Per-run context: progress/cancel plumbing, warnings and log.
pub struct Ctx<'a> {
    progress: &'a mut dyn FnMut(&Progress),
    cancel: &'a dyn Fn() -> bool,
    phase: String,
    ticks: u64,
    pub fraction: f64,
    pub warnings: Vec<String>,
    pub log: Vec<LogEntry>,
    pub residuals: Residuals,
}

impl<'a> Ctx<'a> {
    pub fn new(progress: &'a mut dyn FnMut(&Progress), cancel: &'a dyn Fn() -> bool) -> Self {
        Ctx { progress, cancel, phase: "setup".into(), ticks: 0, fraction: 0.0, warnings: Vec::new(), log: Vec::new(), residuals: Residuals::default() }
    }

    pub fn phase(&mut self, phase: &str) {
        self.phase = phase.to_string();
        self.fraction = 0.0;
    }

    /// Unconditional progress report + cancel check.
    pub fn report(&mut self, fraction: f64, message: &str) -> Result<(), Error> {
        self.fraction = fraction.clamp(0.0, 1.0);
        (self.progress)(&Progress { phase: self.phase.clone(), fraction: self.fraction, message: message.to_string() });
        if (self.cancel)() {
            return Err(Error::Cancelled);
        }
        Ok(())
    }

    /// Cheap, rate-limited report for inner loops (one call per solver iteration).
    pub fn tick(&mut self, message: &dyn Fn() -> String) -> Result<(), Error> {
        self.ticks += 1;
        if self.ticks % 16 == 0 {
            let f = self.fraction;
            return self.report(f, &message());
        }
        if self.ticks % 4 == 0 && (self.cancel)() {
            return Err(Error::Cancelled);
        }
        Ok(())
    }

    pub fn warn(&mut self, msg: impl Into<String>) {
        let m = msg.into();
        if !self.warnings.contains(&m) {
            self.warnings.push(m);
        }
    }

    pub fn log(&mut self, phase: &str, iterations: usize, residual: f64) {
        self.log.push(LogEntry { phase: phase.into(), iterations, residual });
    }
}

/// Portable millisecond timer (0 on wasm32-unknown-unknown, which has no clock).
struct Timer {
    #[cfg(not(target_arch = "wasm32"))]
    start: std::time::Instant,
}

impl Timer {
    fn start() -> Timer {
        Timer {
            #[cfg(not(target_arch = "wasm32"))]
            start: std::time::Instant::now(),
        }
    }
    fn ms(&self) -> f64 {
        #[cfg(not(target_arch = "wasm32"))]
        {
            return self.start.elapsed().as_secs_f64() * 1000.0;
        }
        #[allow(unreachable_code)]
        0.0
    }
}

/// Validate a model; returns human-readable problems (empty = OK).
pub fn validate(model_json: &str) -> Vec<String> {
    let (model, mut errs) = model::parse(model_json);
    if let (Some(m), true) = (model, errs.is_empty()) {
        // Mesh-level checks that make a run impossible.
        let mesh = mesh::build(&m);
        if !mesh.mat.iter().any(|&x| x != mesh::VOID) {
            errs.push("No cell is simulated: every cell is void".into());
        }
    }
    errs
}

/// Run a study. Always returns result bytes; failures give `ok:false`.
pub fn run(model_json: &str, progress: &mut dyn FnMut(&Progress), cancel: &dyn Fn() -> bool) -> Vec<u8> {
    let timer = Timer::start();
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut ctx = Ctx::new(progress, cancel);
        let r = run_inner(model_json, &mut ctx);
        (r, ctx.warnings.clone())
    }));
    let elapsed = timer.ms();
    match outcome {
        Ok((Ok(mut res), _)) => {
            res.set_elapsed(elapsed);
            res.encode()
        }
        Ok((Err(Error::Cancelled), w)) => result::error_bytes("cancelled", &w, elapsed),
        Ok((Err(Error::Msg(m)), w)) => result::error_bytes(&m, &w, elapsed),
        Err(p) => {
            let msg = if let Some(s) = p.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = p.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown".into()
            };
            result::error_bytes(&format!("internal solver error: {msg}"), &[], elapsed)
        }
    }
}

/// Fluid cells above which a 3D flow study warns about run time.
const FLOW_CELLS_3D_WARN: usize = 1_000_000;

fn run_inner(json: &str, ctx: &mut Ctx) -> Result<result::Output, Error> {
    ctx.phase("setup");
    ctx.report(0.0, "Reading model")?;
    let (model, errs) = model::parse(json);
    if !errs.is_empty() || model.is_none() {
        let mut e = errs.clone();
        if e.len() > 6 {
            let more = e.len() - 6;
            e.truncate(6);
            e.push(format!("… and {more} more"));
        }
        return Err(Error::Msg(e.join("; ")));
    }
    let model = model.unwrap();
    ctx.report(0.2, "Meshing")?;
    let mesh = mesh::build(&model);
    for (bi, cells) in mesh.body_cells.iter().enumerate() {
        if cells.is_empty() {
            ctx.warn(format!("Body \"{}\" covers no cell centre (too small or outside the domain or painted over)", model.bodies[bi].id));
        }
    }
    let th = conduction::Thermal::new(&model, &mesh);
    if th.n == 0 {
        return Err(Error::Msg("No cell is simulated: every cell is void".into()));
    }
    if model.study.s2s {
        match &th.s2s {
            None => ctx.warn("Surface-to-surface radiation is on but no opaque face borders a transparent (void) cell"),
            Some(r) => {
                if r.patches() >= s2s::MAX_PATCHES {
                    ctx.warn(format!("Surface-to-surface radiation uses {} patches (coarsened)", r.patches()));
                }
            }
        }
        if th.s2s_overridden > 0 {
            ctx.warn(format!(
                "{} boundary faces radiate through surface-to-surface radiation; their own emissivity is ignored there",
                th.s2s_overridden
            ));
        }
    }
    let flow_cells = (0..th.n).filter(|&u| model.materials[th.mat_of[u] as usize].kind.is_flowing()).count();
    let flow_on = model.study.flow && flow_cells > 0;
    if model.study.flow && flow_cells == 0 {
        ctx.warn("Flow is enabled but no cell is fluid or porous");
    }
    if flow_on && model.dim == 3 && flow_cells > FLOW_CELLS_3D_WARN {
        ctx.warn(format!(
            "The 3D flow has {flow_cells} fluid cells; a solve of this size can take a long time and much memory (consider a coarser mesh)"
        ));
    }
    if !model.study.flow {
        if model.boundaries.iter().any(|b| matches!(b.btype, model::BType::Inlet | model::BType::Outlet | model::BType::Open)) {
            ctx.warn("Inlet/outlet/open boundaries are ignored (adiabatic) because flow is off");
        }
        if model.boundaries.iter().any(|b| matches!(b.btype, model::BType::Fan | model::BType::InternalFan)) {
            ctx.warn("Fans are ignored because flow is off");
        }
    }

    if model.study.electric {
        ctx.phase("electric");
        ctx.report(0.0, "Electric field")?;
        if let Some(e) = electric::Electric::new(&th, ctx)? {
            *th.electric.borrow_mut() = Some(e);
            let t0 = vec![model.study.initial_t; th.n];
            th.update_joule(&t0, ctx, true)?;
        }
    }

    let sol = if flow_on { flow::run_cht(&th, ctx)? } else { conduction::run(&th, ctx)? };

    // Final electric solution at the final temperature (fields and header).
    let esol = {
        let e = th.electric.borrow();
        match e.as_ref() {
            Some(e) => {
                ctx.phase("electric");
                let s = e.solve(&th, &sol.t, ctx)?;
                ctx.log("electric", s.iterations, 0.0);
                Some(s)
            }
            None => None,
        }
    };

    let st = if model.study.run_stress() {
        ctx.phase("stress");
        ctx.report(0.0, "Thermal stress")?;
        stress::solve(&model, &mesh, &th, &sol.t, ctx)?
    } else {
        None
    };
    let md = if model.study.modal_modes > 0 {
        ctx.phase("modal");
        ctx.report(0.0, "Modal analysis")?;
        modal::solve(&model, &mesh, ctx)?
    } else {
        None
    };
    ctx.phase("results");
    ctx.report(1.0, "Writing results")?;
    Ok(result::build(&model, &mesh, &th, sol, st, esol, md, ctx))
}
