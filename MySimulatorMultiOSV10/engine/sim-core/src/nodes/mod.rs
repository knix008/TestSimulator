//! The node catalogue: every node type with its ports and its run function.
//! The frontend's catalogue (src/core/catalog.js) lists the same types with
//! their parameters, names and help in both languages.

use crate::data::Dataset;
use crate::Ctx;

pub mod blocks;
pub mod cad;
pub mod cfd;
pub mod des;
pub mod dynamics;
pub mod fem;
pub mod fem3d;
pub mod frame;
pub mod logic;
pub mod mcu;
pub mod io;
pub mod mc;
pub mod ml;
pub mod optimize;
pub mod output;
pub mod physics;
pub mod robot;
pub mod signal;
pub mod source;
pub mod spice;
pub mod stats;
pub mod table;

pub type RunFn = fn(&mut Ctx) -> Result<Dataset, String>;

pub struct Spec {
    pub kind: &'static str,
    pub inputs: &'static [&'static str],
    pub required: &'static [&'static str],
    pub run: RunFn,
}

const IN: &[&str] = &["in"];
const NONE: &[&str] = &[];
const AB: &[&str] = &["a", "b"];

pub static SPECS: &[Spec] = &[
    // Sources
    Spec { kind: "source.signal", inputs: NONE, required: NONE, run: source::signal },
    Spec { kind: "source.table", inputs: NONE, required: NONE, run: source::table },
    Spec { kind: "source.file", inputs: NONE, required: NONE, run: source::file },
    Spec { kind: "source.random", inputs: NONE, required: NONE, run: source::random },
    Spec { kind: "source.function", inputs: NONE, required: NONE, run: source::function },
    // Table operations
    Spec { kind: "data.expression", inputs: IN, required: IN, run: table::expression },
    Spec { kind: "data.filter", inputs: IN, required: IN, run: table::filter_rows },
    Spec { kind: "data.select", inputs: IN, required: IN, run: table::select },
    Spec { kind: "data.merge", inputs: AB, required: AB, run: table::merge },
    Spec { kind: "data.resample", inputs: IN, required: IN, run: table::resample },
    Spec { kind: "data.calculus", inputs: IN, required: IN, run: table::calculus },
    // Signal processing
    Spec { kind: "signal.fft", inputs: IN, required: IN, run: signal::fft },
    Spec { kind: "signal.psd", inputs: IN, required: IN, run: signal::psd },
    Spec { kind: "signal.filter", inputs: IN, required: IN, run: signal::filter },
    Spec { kind: "signal.spectrogram", inputs: IN, required: IN, run: signal::spectrogram },
    Spec { kind: "signal.peaks", inputs: IN, required: IN, run: signal::peaks },
    Spec { kind: "signal.correlate", inputs: AB, required: &["a"], run: signal::correlate },
    Spec { kind: "signal.envelope", inputs: IN, required: IN, run: signal::envelope },
    // Dynamics and control
    Spec { kind: "dyn.ode", inputs: &["u"], required: NONE, run: dynamics::ode },
    Spec { kind: "ctrl.step", inputs: NONE, required: NONE, run: dynamics::step },
    Spec { kind: "ctrl.bode", inputs: NONE, required: NONE, run: dynamics::bode },
    Spec { kind: "ctrl.pid", inputs: &["r"], required: NONE, run: dynamics::pid },
    Spec { kind: "ctrl.statespace", inputs: &["u"], required: NONE, run: dynamics::state_space },
    Spec { kind: "dyn.blocks", inputs: &["u"], required: NONE, run: blocks::simulate },
    Spec { kind: "circuit.spice", inputs: IN, required: NONE, run: spice::simulate },
    Spec { kind: "circuit.logic", inputs: IN, required: NONE, run: logic::simulate },
    Spec { kind: "fem.field", inputs: NONE, required: NONE, run: fem::simulate },
    Spec { kind: "fem.solid", inputs: NONE, required: NONE, run: fem3d::simulate },
    Spec { kind: "cfd.flow", inputs: NONE, required: NONE, run: cfd::simulate },
    Spec { kind: "frame.struct", inputs: NONE, required: NONE, run: frame::simulate },
    Spec { kind: "robot.mobile", inputs: NONE, required: NONE, run: robot::mobile },
    Spec { kind: "robot.arm", inputs: NONE, required: NONE, run: robot::arm },
    Spec { kind: "physics.rigid", inputs: NONE, required: NONE, run: physics::simulate },
    Spec { kind: "cad.part", inputs: IN, required: NONE, run: cad::part },
    // Statistics and machine learning
    Spec { kind: "stat.describe", inputs: IN, required: IN, run: stats::describe },
    Spec { kind: "stat.histogram", inputs: IN, required: IN, run: stats::histogram },
    Spec { kind: "stat.regression", inputs: IN, required: IN, run: stats::regression },
    Spec { kind: "stat.correlation", inputs: IN, required: IN, run: stats::correlation },
    Spec { kind: "ml.kmeans", inputs: IN, required: IN, run: ml::kmeans },
    Spec { kind: "ml.pca", inputs: IN, required: IN, run: ml::pca },
    Spec { kind: "ml.mlp", inputs: IN, required: IN, run: ml::mlp },
    // Monte Carlo and optimisation
    Spec { kind: "mc.simulate", inputs: NONE, required: NONE, run: mc::simulate },
    Spec { kind: "mc.process", inputs: NONE, required: NONE, run: mc::process },
    Spec { kind: "des.process", inputs: NONE, required: NONE, run: des::simulate },
    Spec { kind: "opt.minimize", inputs: NONE, required: NONE, run: optimize::minimize },
    Spec { kind: "opt.fit", inputs: IN, required: IN, run: optimize::fit },
    Spec { kind: "opt.sweep", inputs: NONE, required: NONE, run: optimize::sweep },
    // Integration (files, Python, command-line tools)
    Spec { kind: "io.python", inputs: IN, required: NONE, run: io::python },
    Spec { kind: "io.command", inputs: IN, required: NONE, run: io::command },
    Spec { kind: "io.readFile", inputs: NONE, required: NONE, run: io::read_file },
    Spec { kind: "io.writeFile", inputs: IN, required: IN, run: io::write_file },
    Spec { kind: "io.myheat", inputs: NONE, required: NONE, run: io::myheat },
    // Output
    Spec { kind: "out.plot", inputs: IN, required: IN, run: output::plot },
    Spec { kind: "out.kpi", inputs: IN, required: IN, run: output::kpi },
];

pub fn spec(kind: &str) -> Option<&'static Spec> {
    SPECS.iter().find(|s| s.kind == kind)
}

/// The input table of a one-input node (param "table" picks one of several).
pub fn input_table<'a>(ctx: &'a Ctx, port: &str) -> Result<&'a crate::data::Table, String> {
    let name = ctx.str("table", "");
    ctx.need(port)?.pick_table(&name)
}

/// Column names from a comma separated list; empty = every numeric column but x.
pub fn column_list(table: &crate::data::Table, list: &str) -> Result<Vec<usize>, String> {
    let names: Vec<&str> = list.split(|c| c == ',' || c == ';' || c == '\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if names.is_empty() {
        let cols = table.value_columns();
        if cols.is_empty() {
            return Err("the table has no numeric column".into());
        }
        return Ok(cols);
    }
    names
        .iter()
        .map(|n| table.find(n).ok_or_else(|| {
            let all: Vec<&str> = table.columns.iter().map(|c| c.name.as_str()).collect();
            format!("no column \"{n}\" (columns: {})", all.join(", "))
        }))
        .collect()
}
