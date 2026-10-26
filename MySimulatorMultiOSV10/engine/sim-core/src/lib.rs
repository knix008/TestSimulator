//! MySimulator numerical engine.
//!
//! A model (`.mysim`) is a pipeline: nodes (a source, a filter, an ODE, a
//! regression …) joined by links from an output port to an input port.
//! `run(model_json, progress, cancel, host)` checks the graph, runs the nodes
//! in dependency order and returns every node's output encoded as described
//! in ARCHITECTURE.md ("Result bytes"). It never panics outward.
//!
//! The engine has no platform code: reading files and starting external
//! programs (Python, a command-line tool) go through the `Host` the caller
//! gives (the desktop app's; the web build's refuses them).

pub mod data;
pub mod expr;
pub mod fft;
pub mod formats;
pub mod linalg;
pub mod matfile;
pub mod mlang;
pub mod nodes;
pub mod ode;
pub mod result;
pub mod rng;
pub mod special;

use data::Dataset;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap, HashSet};

pub use result::{encode, NodeOutcome, RunResult};

/// Progress report passed to the host.
#[derive(Clone, Debug)]
pub struct Progress {
    pub phase: String,
    pub fraction: f64,
    pub message: String,
}

/// An external program run for an `io.python` or `io.command` node.
#[derive(Clone, Debug)]
pub struct ExternalCall {
    /// "python" or "command".
    pub kind: String,
    /// The program (command node) or the interpreter ("" = find Python).
    pub program: String,
    /// Arguments; `{in}` and `{out}` are replaced by the data file paths.
    pub args: Vec<String>,
    /// Python code (python node).
    pub code: String,
    /// The input table as CSV (empty when nothing is connected).
    pub input_csv: String,
    pub timeout_s: f64,
}

/// What the program printed and the table it wrote.
#[derive(Clone, Debug, Default)]
pub struct ExternalOutput {
    pub csv: String,
    pub stdout: String,
    pub stderr: String,
}

/// Platform services. The default methods refuse (the web build).
pub trait Host {
    fn read_file(&self, path: &str) -> Result<String, String> {
        let _ = path;
        Err("reading files from a path works in the desktop app only (in the browser, paste or import the data into a Table node)".into())
    }
    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        self.read_file(path).map(String::into_bytes)
    }
    fn write_file(&self, path: &str, text: &str) -> Result<(), String> {
        let _ = (path, text);
        Err("writing files works in the desktop app only".into())
    }
    /// Binary files (.mat). Hosts that only write text refuse.
    fn write_bytes(&self, path: &str, bytes: &[u8]) -> Result<(), String> {
        let _ = (path, bytes);
        Err("writing binary files works in the desktop app only".into())
    }
    fn external(&self, call: &ExternalCall, cancel: &dyn Fn() -> bool) -> Result<ExternalOutput, String> {
        let _ = (call, cancel);
        Err("external programs (Python, command-line tools) run in the desktop app only".into())
    }
}

/// The browser's host: no files, no programs.
pub struct NoHost;
impl Host for NoHost {}

// ───────────────────────── model

#[derive(Clone, Debug)]
pub struct Node {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub params: Map<String, Value>,
    pub disabled: bool,
}

#[derive(Clone, Debug)]
pub struct Link {
    pub from: String,
    pub from_port: String,
    pub to: String,
    pub to_port: String,
}

#[derive(Clone, Debug)]
pub struct Model {
    pub name: String,
    pub nodes: Vec<Node>,
    pub links: Vec<Link>,
    pub seed: u64,
}

fn text(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

pub fn parse_model(json: &str) -> Result<Model, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| format!("the model is not valid JSON: {e}"))?;
    let obj = v.as_object().ok_or("the model must be a JSON object")?;
    let mut nodes = Vec::new();
    let mut seen = HashSet::new();
    for (i, n) in obj.get("nodes").and_then(|n| n.as_array()).cloned().unwrap_or_default().into_iter().enumerate() {
        let n = n.as_object().ok_or_else(|| format!("node {} is not an object", i + 1))?.clone();
        let id = text(n.get("id"));
        if id.is_empty() {
            return Err(format!("node {} has no id", i + 1));
        }
        if !seen.insert(id.clone()) {
            return Err(format!("two nodes have the id \"{id}\""));
        }
        let kind = text(n.get("type"));
        nodes.push(Node {
            name: { let s = text(n.get("name")); if s.is_empty() { id.clone() } else { s } },
            id,
            kind,
            params: n.get("params").and_then(|p| p.as_object()).cloned().unwrap_or_default(),
            disabled: n.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false),
        });
    }
    let mut links = Vec::new();
    for l in obj.get("links").and_then(|n| n.as_array()).cloned().unwrap_or_default() {
        let l = match l.as_object() {
            Some(l) => l.clone(),
            None => continue,
        };
        links.push(Link {
            from: text(l.get("from")),
            from_port: { let s = text(l.get("fromPort")); if s.is_empty() { "out".into() } else { s } },
            to: text(l.get("to")),
            to_port: { let s = text(l.get("toPort")); if s.is_empty() { "in".into() } else { s } },
        });
    }
    let seed = obj.get("settings").and_then(|s| s.get("seed")).and_then(|s| s.as_u64()).unwrap_or(1);
    Ok(Model { name: text(obj.get("name")), nodes, links, seed })
}

/// Problems that stop a run, as text (empty = runnable).
pub fn validate(json: &str) -> Vec<String> {
    let model = match parse_model(json) {
        Ok(m) => m,
        Err(e) => return vec![e],
    };
    let mut problems = Vec::new();
    for node in &model.nodes {
        match nodes::spec(&node.kind) {
            None => problems.push(format!("{}: unknown node type \"{}\"", node.name, node.kind)),
            Some(spec) => {
                for port in spec.required {
                    if !model.links.iter().any(|l| l.to == node.id && l.to_port == *port) && !node.disabled {
                        problems.push(format!("{}: the input \"{port}\" is not connected", node.name));
                    }
                }
            }
        }
    }
    for link in &model.links {
        let from = model.nodes.iter().find(|n| n.id == link.from);
        let to = model.nodes.iter().find(|n| n.id == link.to);
        match (from, to) {
            (None, _) | (_, None) => problems.push(format!("a link joins a missing node ({} → {})", link.from, link.to)),
            (Some(_), Some(to)) => {
                if let Some(spec) = nodes::spec(&to.kind) {
                    if !spec.inputs.contains(&link.to_port.as_str()) {
                        problems.push(format!("{}: there is no input \"{}\"", to.name, link.to_port));
                    }
                }
            }
        }
    }
    let mut ports = HashSet::new();
    for link in &model.links {
        if !ports.insert((link.to.clone(), link.to_port.clone())) {
            let name = model.nodes.iter().find(|n| n.id == link.to).map(|n| n.name.clone()).unwrap_or_default();
            problems.push(format!("{name}: the input \"{}\" has more than one link", link.to_port));
        }
    }
    if let Err(e) = order(&model, None) {
        problems.push(e);
    }
    problems
}

/// Execution order (Kahn); only `targets` and what they depend on when given.
fn order(model: &Model, targets: Option<&HashSet<String>>) -> Result<Vec<usize>, String> {
    let index: HashMap<&str, usize> = model.nodes.iter().enumerate().map(|(i, n)| (n.id.as_str(), i)).collect();
    let mut keep: Vec<bool> = vec![targets.is_none(); model.nodes.len()];
    if let Some(targets) = targets {
        let mut stack: Vec<usize> = targets.iter().filter_map(|t| index.get(t.as_str()).copied()).collect();
        while let Some(i) = stack.pop() {
            if keep[i] {
                continue;
            }
            keep[i] = true;
            for l in model.links.iter().filter(|l| l.to == model.nodes[i].id) {
                if let Some(&j) = index.get(l.from.as_str()) {
                    stack.push(j);
                }
            }
        }
    }
    let mut indegree = vec![0usize; model.nodes.len()];
    let mut next: Vec<Vec<usize>> = vec![Vec::new(); model.nodes.len()];
    for l in &model.links {
        if let (Some(&a), Some(&b)) = (index.get(l.from.as_str()), index.get(l.to.as_str())) {
            if keep[a] && keep[b] {
                indegree[b] += 1;
                next[a].push(b);
            }
        }
    }
    // Ties keep the order of the node list (a stable, predictable order).
    let mut ready: std::collections::BTreeSet<usize> = (0..model.nodes.len()).filter(|&i| keep[i] && indegree[i] == 0).collect();
    let mut out = Vec::new();
    while let Some(&i) = ready.iter().next() {
        ready.remove(&i);
        out.push(i);
        for &j in &next[i] {
            indegree[j] -= 1;
            if indegree[j] == 0 {
                ready.insert(j);
            }
        }
    }
    let wanted = keep.iter().filter(|k| **k).count();
    if out.len() < wanted {
        let stuck: Vec<String> = (0..model.nodes.len()).filter(|&i| keep[i] && indegree[i] > 0).map(|i| model.nodes[i].name.clone()).collect();
        return Err(format!("the links form a loop through {}", stuck.join(", ")));
    }
    Ok(out)
}

// ───────────────────────── running

/// What a node gets: its parameters, its inputs and the run's services.
pub struct Ctx<'a> {
    pub node: &'a Node,
    pub inputs: BTreeMap<String, &'a Dataset>,
    pub seed: u64,
    pub host: &'a dyn Host,
    pub cancel: &'a dyn Fn() -> bool,
    pub progress: &'a mut dyn FnMut(f64, &str),
    pub warnings: Vec<String>,
    /// The whole model and the depth of nested runs (parameter sweeps).
    pub model: &'a Model,
    pub depth: usize,
}

impl Ctx<'_> {
    pub fn input(&self, port: &str) -> Option<&Dataset> {
        self.inputs.get(port).copied()
    }

    pub fn need(&self, port: &str) -> Result<&Dataset, String> {
        self.input(port).ok_or_else(|| format!("the input \"{port}\" is not connected"))
    }

    pub fn warn(&mut self, text: impl Into<String>) {
        self.warnings.push(text.into());
    }

    pub fn check(&self) -> Result<(), String> {
        if (self.cancel)() {
            Err("cancelled".into())
        } else {
            Ok(())
        }
    }

    pub fn report(&mut self, fraction: f64, message: &str) {
        (self.progress)(fraction, message);
    }

    // Parameters (missing or empty → the default; numbers may be strings with an expression).
    pub fn num(&self, key: &str, default: f64) -> Result<f64, String> {
        match self.node.params.get(key) {
            None | Some(Value::Null) => Ok(default),
            Some(Value::Number(n)) => Ok(n.as_f64().unwrap_or(default)),
            Some(Value::Bool(b)) => Ok(if *b { 1.0 } else { 0.0 }),
            Some(Value::String(s)) if s.trim().is_empty() => Ok(default),
            Some(Value::String(s)) => {
                let e = expr::Expr::with_names(s, &[]).map_err(|e| format!("{key}: {e}"))?;
                Ok(e.value(&[]))
            }
            Some(_) => Err(format!("{key}: not a number")),
        }
    }

    pub fn int(&self, key: &str, default: i64) -> Result<i64, String> {
        let v = self.num(key, default as f64)?;
        if !v.is_finite() {
            return Err(format!("{key}: not a number"));
        }
        Ok(v.round() as i64)
    }

    /// An integer within [lo, hi].
    pub fn count(&self, key: &str, default: i64, lo: i64, hi: i64) -> Result<usize, String> {
        let v = self.int(key, default)?;
        if v < lo || v > hi {
            return Err(format!("{key}: {v} is outside {lo} … {hi}"));
        }
        Ok(v as usize)
    }

    pub fn positive(&self, key: &str, default: f64) -> Result<f64, String> {
        let v = self.num(key, default)?;
        if !(v > 0.0) || !v.is_finite() {
            return Err(format!("{key} must be a positive number"));
        }
        Ok(v)
    }

    pub fn str(&self, key: &str, default: &str) -> String {
        match self.node.params.get(key) {
            None | Some(Value::Null) => default.to_string(),
            Some(v) => {
                let s = text(Some(v));
                if s.is_empty() && !default.is_empty() {
                    default.to_string()
                } else {
                    s
                }
            }
        }
    }

    pub fn flag(&self, key: &str, default: bool) -> bool {
        match self.node.params.get(key) {
            Some(Value::Bool(b)) => *b,
            Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0) != 0.0,
            Some(Value::String(s)) => matches!(s.trim().to_ascii_lowercase().as_str(), "true" | "1" | "yes" | "on"),
            _ => default,
        }
    }

    /// The seed: the node's own, or the model's mixed with the node id (so two sources differ).
    pub fn rng(&self) -> rng::Rng {
        let own = self.node.params.get("seed").and_then(|v| match v {
            Value::Number(n) => n.as_f64(),
            Value::String(s) => s.trim().parse::<f64>().ok(),
            _ => None,
        });
        match own {
            Some(s) if s.is_finite() && s >= 0.0 => rng::Rng::new(s as u64),
            _ => {
                let mut h: u64 = self.seed ^ 0xcbf29ce484222325;
                for b in self.node.id.bytes() {
                    h = (h ^ b as u64).wrapping_mul(0x100000001b3);
                }
                rng::Rng::new(h)
            }
        }
    }
}

/// Overrides of node parameters for a nested run: (node id, key) → value.
pub type Overrides = HashMap<(String, String), Value>;

/// Runs the nodes (all, or `targets` and their inputs) and collects every outcome.
pub fn execute(
    model: &Model,
    targets: Option<&HashSet<String>>,
    host: &dyn Host,
    cancel: &dyn Fn() -> bool,
    progress: &mut dyn FnMut(&Progress),
    depth: usize,
) -> Result<Vec<NodeOutcome>, String> {
    let order = order(model, targets)?;
    let mut outputs: HashMap<String, Dataset> = HashMap::new();
    let mut outcomes = Vec::new();
    let total = order.len().max(1);
    for (step, &i) in order.iter().enumerate() {
        let node = &model.nodes[i];
        if cancel() {
            return Err("cancelled".into());
        }
        let started = clock();
        let base = step as f64 / total as f64;
        progress(&Progress { phase: "node".into(), fraction: base, message: node.name.clone() });
        let incoming: Vec<&Link> = model.links.iter().filter(|l| l.to == node.id).collect();
        let mut missing = Vec::new();
        let mut inputs = BTreeMap::new();
        for l in &incoming {
            match outputs.get(&l.from) {
                Some(d) => {
                    inputs.insert(l.to_port.clone(), d);
                }
                None => missing.push(model.nodes.iter().find(|n| n.id == l.from).map(|n| n.name.clone()).unwrap_or_else(|| l.from.clone())),
            }
        }
        let mut outcome = NodeOutcome { id: node.id.clone(), ok: false, error: None, warnings: Vec::new(), elapsed_ms: 0.0, data: None, skipped: false };
        if !missing.is_empty() {
            outcome.error = Some(format!("an input failed: {}", missing.join(", ")));
            outcome.skipped = true;
            outcomes.push(outcome);
            continue;
        }
        let result: Result<Dataset, String> = if node.disabled {
            // A disabled node passes its first input through (bypass) or gives nothing.
            match inputs.values().next() {
                Some(d) => Ok((*d).clone()),
                None => Err("disabled".into()),
            }
        } else {
            match nodes::spec(&node.kind) {
                None => Err(format!("unknown node type \"{}\"", node.kind)),
                Some(spec) => {
                    let missing_required: Vec<&str> = spec.required.iter().copied().filter(|p| !inputs.contains_key(*p)).collect();
                    if !missing_required.is_empty() {
                        Err(format!("connect the input{} {}", if missing_required.len() > 1 { "s" } else { "" }, missing_required.join(", ")))
                    } else {
                        let mut report = |f: f64, msg: &str| {
                            progress(&Progress { phase: "node".into(), fraction: base + f.clamp(0.0, 1.0) / total as f64, message: if msg.is_empty() { node.name.clone() } else { format!("{} · {msg}", node.name) } });
                        };
                        let mut ctx = Ctx { node, inputs, seed: model.seed, host, cancel, progress: &mut report, warnings: Vec::new(), model, depth };
                        let r = (spec.run)(&mut ctx);
                        outcome.warnings = std::mem::take(&mut ctx.warnings);
                        r
                    }
                }
            }
        };
        outcome.elapsed_ms = clock() - started;
        match result {
            Ok(mut data) => {
                sanitize(&mut data);
                outcome.ok = true;
                outputs.insert(node.id.clone(), data.clone());
                outcome.data = Some(data);
            }
            Err(e) => {
                if e == "cancelled" {
                    return Err(e);
                }
                if node.disabled {
                    outcome.skipped = true;
                }
                outcome.error = Some(e);
            }
        }
        outcomes.push(outcome);
    }
    progress(&Progress { phase: "done".into(), fraction: 1.0, message: String::new() });
    Ok(outcomes)
}

/// Columns must have equal lengths; text columns keep NaN values.
fn sanitize(data: &mut Dataset) {
    for t in &mut data.tables {
        let n = t.rows();
        for c in &mut t.columns {
            if c.values.len() < n {
                c.values.resize(n, f64::NAN);
            }
            if let Some(labels) = &mut c.labels {
                labels.resize(n, String::new());
            }
        }
        if t.x.is_some_and(|x| x >= t.columns.len()) {
            t.x = None;
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn clock() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

/// WebAssembly has no clock: the page times the whole run.
#[cfg(target_arch = "wasm32")]
fn clock() -> f64 {
    0.0
}

/// Parses, runs and returns the structured result (the CLI uses this directly).
pub fn run_model(json: &str, progress: &mut dyn FnMut(&Progress), cancel: &dyn Fn() -> bool, host: &dyn Host) -> RunResult {
    let started = clock();
    let mut result = RunResult::default();
    match parse_model(json) {
        Err(e) => result.error = Some(e),
        Ok(model) => {
            result.name = model.name.clone();
            match execute(&model, None, host, cancel, progress, 0) {
                Ok(outcomes) => {
                    result.ok = true;
                    result.nodes = outcomes;
                }
                Err(e) => result.error = Some(e),
            }
        }
    }
    result.elapsed_ms = clock() - started;
    result
}

/// Runs a model and returns the result bytes (ARCHITECTURE.md).
pub fn run(json: &str, progress: &mut dyn FnMut(&Progress), cancel: &dyn Fn() -> bool, host: &dyn Host) -> Vec<u8> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_model(json, progress, cancel, host)));
    match result {
        Ok(r) => encode(&r),
        Err(panic) => {
            let message = panic.downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| panic.downcast_ref::<String>().cloned()).unwrap_or_else(|| "internal error".into());
            encode(&RunResult { error: Some(format!("internal error: {message}")), ..Default::default() })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_and_loops() {
        let m = parse_model(r#"{"nodes":[{"id":"b","type":"data.expression"},{"id":"a","type":"source.signal"}],"links":[{"from":"a","to":"b"}]}"#).unwrap();
        let o = order(&m, None).unwrap();
        assert_eq!(o, vec![1, 0]);
        let looped = parse_model(r#"{"nodes":[{"id":"a","type":"data.expression"},{"id":"b","type":"data.expression"}],"links":[{"from":"a","to":"b"},{"from":"b","to":"a"}]}"#).unwrap();
        assert!(order(&looped, None).unwrap_err().contains("loop"));
        assert!(validate(r#"{"nodes":[{"id":"a","type":"nope"}]}"#)[0].contains("unknown node type"));
    }
}
