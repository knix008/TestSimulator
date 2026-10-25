//! Discrete-event simulation (the AnyLogic / FlexSim way of modelling
//! processes): entities come from sources, wait in queues, are served by
//! stations with a number of servers, are routed on by probability and leave
//! at sinks. The model is a few lines of text:
//!
//! ```text
//! source orders: interval = exponential(1.2), count = 500
//! station cutting: servers = 2, time = triangular(0.8, 1, 1.5), capacity = 10
//! station painting: servers = 1, time = normal(0.9, 0.1)
//! sink shipped
//! sink scrap
//! route orders -> cutting
//! route cutting -> painting 0.95, scrap 0.05
//! route painting -> shipped
//! ```

use crate::data::{mean, quantile_sorted, Column, Dataset, Table};
use crate::expr::{statements, valid_name, Expr};
use crate::rng::{Dist, Rng};
use crate::Ctx;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, VecDeque};

#[derive(Debug, Clone)]
enum Elem {
    Source { interval: Dist, count: usize, first: f64, batch: usize, made: usize },
    Station { servers: usize, time: Dist, capacity: usize, queue: VecDeque<(usize, f64)>, busy: usize, stats: StationStats },
    Sink { done: Vec<f64> },
}

#[derive(Debug, Clone, Default)]
struct StationStats {
    arrivals: usize,
    served: usize,
    balked: usize,
    waits: Vec<f64>,
    // time-weighted integrals
    q_area: f64,
    busy_area: f64,
    last_t: f64,
    max_q: usize,
}

struct Element {
    name: String,
    elem: Elem,
    /// (target element, cumulative probability)
    routes: Vec<(usize, f64)>,
}

#[derive(PartialEq)]
struct Event {
    t: f64,
    seq: u64,
    kind: Ev,
}

#[derive(PartialEq, Clone, Copy)]
enum Ev {
    Arrive(usize),
    Done(usize, usize, f64),
}

impl Eq for Event {}
impl Ord for Event {
    fn cmp(&self, other: &Self) -> Ordering {
        // A min-heap on time, then on insertion order.
        other.t.partial_cmp(&self.t).unwrap_or(Ordering::Equal).then(other.seq.cmp(&self.seq))
    }
}
impl PartialOrd for Event {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// "exponential(1.2)", "normal(1, 0.1)", or a number (a constant time).
fn dist(text: &str, consts: &[(String, f64)]) -> Result<Dist, String> {
    let t = text.trim();
    let names: Vec<String> = consts.iter().map(|(n, _)| n.clone()).collect();
    let vals: Vec<f64> = consts.iter().map(|(_, v)| *v).collect();
    if let Some(open) = t.find('(') {
        if t.ends_with(')') {
            let name = t[..open].trim();
            let args: Vec<f64> = t[open + 1..t.len() - 1]
                .split(',')
                .filter(|s| !s.trim().is_empty())
                .map(|s| Expr::with_names(s, &names).map(|e| e.value(&vals)))
                .collect::<Result<_, _>>()?;
            // exponential(mean) here: a mean time is what a process modeller writes.
            if name.eq_ignore_ascii_case("exponential") || name.eq_ignore_ascii_case("exp") {
                if args.len() != 1 || args[0] <= 0.0 {
                    return Err("exponential(mean) needs one positive mean".into());
                }
                return Ok(Dist::Exponential(1.0 / args[0]));
            }
            return Dist::parse(name, &args);
        }
    }
    let v = Expr::with_names(t, &names)?.value(&vals);
    Ok(Dist::Constant(v))
}

/// "key = value, key = value" (values may hold commas inside brackets).
fn settings(text: &str) -> Result<HashMap<String, String>, String> {
    let mut out = HashMap::new();
    let mut depth = 0;
    let mut cur = String::new();
    let mut parts = Vec::new();
    for ch in text.chars() {
        match ch {
            '(' => {
                depth += 1;
                cur.push(ch);
            }
            ')' => {
                depth -= 1;
                cur.push(ch);
            }
            ',' if depth == 0 => parts.push(std::mem::take(&mut cur)),
            _ => cur.push(ch),
        }
    }
    parts.push(cur);
    for p in parts {
        let p = p.trim();
        if p.is_empty() {
            continue;
        }
        let (k, v) = p.split_once('=').ok_or_else(|| format!("\"{p}\" is not setting = value"))?;
        out.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
    }
    Ok(out)
}

fn sample(d: &Dist, rng: &mut Rng) -> f64 {
    d.sample(rng).max(0.0)
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let consts = crate::expr::constants(&ctx.str("constants", ""))?;
    let text = ctx.str("model", "");
    let t_end = ctx.positive("tEnd", 480.0)?;
    let warmup = ctx.num("warmup", 0.0)?.max(0.0);
    let points = ctx.count("points", 400, 10, 100_000)?;
    let mut rng = ctx.rng();
    let num = |s: &str| -> Result<f64, String> {
        let names: Vec<String> = consts.iter().map(|(n, _)| n.clone()).collect();
        let vals: Vec<f64> = consts.iter().map(|(_, v)| *v).collect();
        Ok(Expr::with_names(s, &names)?.value(&vals))
    };
    let mut elems: Vec<Element> = Vec::new();
    let mut routes_text: Vec<(String, String)> = Vec::new();
    for stmt in statements(&text) {
        let (head, rest) = stmt.split_once(char::is_whitespace).ok_or_else(|| format!("\"{stmt}\": start with source, station, sink or route"))?;
        let rest = rest.trim();
        match head.to_ascii_lowercase().as_str() {
            "route" => {
                let (from, to) = rest.split_once("->").ok_or_else(|| format!("\"{stmt}\": write route a -> b [p], c [p]"))?;
                routes_text.push((from.trim().to_string(), to.trim().to_string()));
            }
            kind @ ("source" | "station" | "sink" | "delay") => {
                let (name, body) = match rest.split_once(':') {
                    Some((n, b)) => (n.trim().to_string(), b.trim().to_string()),
                    None => (rest.to_string(), String::new()),
                };
                if !valid_name(&name) {
                    return Err(format!("\"{name}\" cannot be a name"));
                }
                if elems.iter().any(|e| e.name == name) {
                    return Err(format!("\"{name}\" is defined twice"));
                }
                let s = settings(&body)?;
                let allowed: &[&str] = match kind {
                    "source" => &["interval", "count", "first", "batch"],
                    "station" => &["servers", "time", "capacity"],
                    "delay" => &["time"],
                    _ => &[],
                };
                for k in s.keys() {
                    if !allowed.contains(&k.as_str()) {
                        return Err(format!("{name}: unknown setting \"{k}\" ({kind} takes {})", if allowed.is_empty() { "no settings".to_string() } else { allowed.join(", ") }));
                    }
                }
                let elem = match kind {
                    "source" => Elem::Source {
                        interval: dist(s.get("interval").map(|x| x.as_str()).unwrap_or("exponential(1)"), &consts)?,
                        count: s.get("count").map(|v| num(v)).transpose()?.map(|v| v.max(0.0) as usize).unwrap_or(usize::MAX),
                        first: s.get("first").map(|v| num(v)).transpose()?.unwrap_or(0.0),
                        batch: s.get("batch").map(|v| num(v)).transpose()?.map(|v| v.max(1.0) as usize).unwrap_or(1),
                        made: 0,
                    },
                    "station" | "delay" => {
                        let servers = match s.get("servers").map(|v| v.trim().to_ascii_lowercase()) {
                            None if kind == "delay" => usize::MAX,
                            None => 1,
                            Some(v) if v == "inf" || v == "infinite" => usize::MAX,
                            Some(v) => {
                                let n = num(&v)?;
                                if n < 1.0 {
                                    return Err(format!("{name}: servers must be at least 1"));
                                }
                                n as usize
                            }
                        };
                        Elem::Station {
                            servers,
                            time: dist(s.get("time").map(|x| x.as_str()).unwrap_or("1"), &consts)?,
                            capacity: match s.get("capacity").map(|v| v.trim().to_ascii_lowercase()) {
                                None => usize::MAX,
                                Some(v) if v == "inf" => usize::MAX,
                                Some(v) => num(&v)?.max(0.0) as usize,
                            },
                            queue: VecDeque::new(),
                            busy: 0,
                            stats: StationStats::default(),
                        }
                    }
                    _ => Elem::Sink { done: Vec::new() },
                };
                elems.push(Element { name, elem, routes: Vec::new() });
            }
            other => return Err(format!("\"{other}\": a line starts with source, station, delay, sink or route")),
        }
    }
    if !elems.iter().any(|e| matches!(e.elem, Elem::Source { .. })) {
        return Err("the model needs a source (source name: interval = exponential(1))".into());
    }
    let index: HashMap<String, usize> = elems.iter().enumerate().map(|(i, e)| (e.name.clone(), i)).collect();
    for (from, to) in &routes_text {
        let fi = *index.get(from).ok_or_else(|| format!("route: no element \"{from}\""))?;
        if matches!(elems[fi].elem, Elem::Sink { .. }) {
            return Err(format!("route: \"{from}\" is a sink (entities end there)"));
        }
        let mut targets = Vec::new();
        for part in to.split(',') {
            let mut words = part.split_whitespace();
            let name = words.next().ok_or("route: an empty target")?;
            let ti = *index.get(name).ok_or_else(|| format!("route: no element \"{name}\""))?;
            if matches!(elems[ti].elem, Elem::Source { .. }) {
                return Err(format!("route: \"{name}\" is a source"));
            }
            let p = match words.next() {
                Some(w) => num(w)?,
                None => f64::NAN,
            };
            targets.push((ti, p));
        }
        let given: f64 = targets.iter().filter(|t| t.1.is_finite()).map(|t| t.1).sum();
        let missing = targets.iter().filter(|t| !t.1.is_finite()).count();
        let share = if missing > 0 { ((1.0 - given) / missing as f64).max(0.0) } else { 0.0 };
        let total: f64 = targets.iter().map(|t| if t.1.is_finite() { t.1 } else { share }).sum();
        if total <= 0.0 {
            return Err(format!("route {from}: the probabilities add up to 0"));
        }
        let mut acc = 0.0;
        elems[fi].routes = targets.iter().map(|t| {
            acc += if t.1.is_finite() { t.1 } else { share } / total;
            (t.0, acc)
        }).collect();
    }
    for e in &elems {
        if !matches!(e.elem, Elem::Sink { .. }) && e.routes.is_empty() {
            return Err(format!("\"{}\" has no route: add route {} -> …", e.name, e.name));
        }
    }
    // Entities: created time, finish time, sink.
    let mut created: Vec<f64> = Vec::new();
    let mut finished: Vec<(f64, usize)> = Vec::new();
    let mut heap = BinaryHeap::new();
    let mut seq = 0u64;
    let mut push = |heap: &mut BinaryHeap<Event>, t: f64, kind: Ev| {
        seq += 1;
        heap.push(Event { t, seq, kind });
    };
    for (i, e) in elems.iter().enumerate() {
        if let Elem::Source { first, .. } = &e.elem {
            push(&mut heap, *first, Ev::Arrive(i));
        }
    }
    let route = |routes: &[(usize, f64)], rng: &mut Rng| -> usize {
        let u = rng.uniform();
        routes.iter().find(|r| u < r.1).map(|r| r.0).unwrap_or(routes.last().unwrap().0)
    };
    // Time series.
    let sample_dt = t_end / points as f64;
    let mut next_sample = 0.0;
    let station_ids: Vec<usize> = (0..elems.len()).filter(|&i| matches!(elems[i].elem, Elem::Station { .. })).collect();
    let mut series_t = Vec::new();
    let mut series_q: Vec<Vec<f64>> = vec![Vec::new(); station_ids.len()];
    let mut series_busy: Vec<Vec<f64>> = vec![Vec::new(); station_ids.len()];
    let mut series_wip = Vec::new();
    let mut in_system = 0usize;
    let mut steps = 0usize;
    // Sends entity `ent` (made at time `made`) into element `target` at time t.
    fn enter(elems: &mut [Element], target: usize, ent: usize, t: f64, rng: &mut Rng, finished: &mut Vec<(f64, usize)>, in_system: &mut usize, created: &[f64], pending: &mut Vec<(f64, Ev)>) {
        let routes = elems[target].routes.clone();
        match &mut elems[target].elem {
            Elem::Sink { done } => {
                done.push(t - created[ent]);
                finished.push((t, target));
                *in_system -= 1;
            }
            Elem::Station { servers, time, capacity, queue, busy, stats } => {
                stats.q_area += queue.len() as f64 * (t - stats.last_t);
                stats.busy_area += *busy as f64 * (t - stats.last_t);
                stats.last_t = t;
                stats.arrivals += 1;
                if *busy < *servers {
                    *busy += 1;
                    stats.waits.push(0.0);
                    pending.push((t + sample(time, rng), Ev::Done(target, ent, t)));
                } else if queue.len() < *capacity {
                    queue.push_back((ent, t));
                    stats.max_q = stats.max_q.max(queue.len());
                } else {
                    // Queue full: the entity is lost (balks) and leaves the system.
                    stats.balked += 1;
                    *in_system -= 1;
                }
                let _ = routes;
            }
            Elem::Source { .. } => {}
        }
    }
    while let Some(ev) = heap.pop() {
        if ev.t > t_end {
            break;
        }
        while next_sample <= ev.t && series_t.len() < points + 1 {
            series_t.push(next_sample);
            for (k, &si) in station_ids.iter().enumerate() {
                if let Elem::Station { queue, busy, .. } = &elems[si].elem {
                    series_q[k].push(queue.len() as f64);
                    series_busy[k].push(*busy as f64);
                }
            }
            series_wip.push(in_system as f64);
            next_sample += sample_dt;
        }
        let t = ev.t;
        let mut pending: Vec<(f64, Ev)> = Vec::new();
        match ev.kind {
            Ev::Arrive(src) => {
                let (interval, batch, more) = match &mut elems[src].elem {
                    Elem::Source { interval, count, batch, made, .. } => {
                        let n = (*batch).min(count.saturating_sub(*made));
                        *made += n;
                        (interval.clone(), n, *made < *count)
                    }
                    _ => unreachable!(),
                };
                for _ in 0..batch {
                    let ent = created.len();
                    created.push(t);
                    in_system += 1;
                    let target = route(&elems[src].routes, &mut rng);
                    enter(&mut elems, target, ent, t, &mut rng, &mut finished, &mut in_system, &created, &mut pending);
                }
                if more {
                    pending.push((t + sample(&interval, &mut rng), Ev::Arrive(src)));
                }
            }
            Ev::Done(st, ent, _started) => {
                let next_ent = match &mut elems[st].elem {
                    Elem::Station { queue, busy, stats, time, .. } => {
                        stats.q_area += queue.len() as f64 * (t - stats.last_t);
                        stats.busy_area += *busy as f64 * (t - stats.last_t);
                        stats.last_t = t;
                        stats.served += 1;
                        match queue.pop_front() {
                            Some((waiting, since)) => {
                                stats.waits.push(t - since);
                                Some((waiting, t + sample(&time.clone(), &mut rng)))
                            }
                            None => {
                                *busy -= 1;
                                None
                            }
                        }
                    }
                    _ => unreachable!(),
                };
                if let Some((w, done)) = next_ent {
                    pending.push((done, Ev::Done(st, w, t)));
                }
                let target = route(&elems[st].routes, &mut rng);
                enter(&mut elems, target, ent, t, &mut rng, &mut finished, &mut in_system, &created, &mut pending);
            }
        }
        for (pt, kind) in pending {
            push(&mut heap, pt, kind);
        }
        steps += 1;
        if steps % 20_000 == 0 {
            ctx.check()?;
            ctx.report(t / t_end, "");
        }
        if steps > 50_000_000 {
            ctx.warn("stopped after 50 million events");
            break;
        }
    }
    while series_t.len() < points + 1 {
        series_t.push(next_sample);
        for (k, &si) in station_ids.iter().enumerate() {
            if let Elem::Station { queue, busy, .. } = &elems[si].elem {
                series_q[k].push(queue.len() as f64);
                series_busy[k].push(*busy as f64);
            }
        }
        series_wip.push(in_system as f64);
        next_sample += sample_dt;
    }
    // Close the time-weighted integrals at t_end.
    for e in elems.iter_mut() {
        if let Elem::Station { queue, busy, stats, .. } = &mut e.elem {
            stats.q_area += queue.len() as f64 * (t_end - stats.last_t);
            stats.busy_area += *busy as f64 * (t_end - stats.last_t);
            stats.last_t = t_end;
        }
    }
    let span = t_end;
    let mut st = Table::new("stations");
    st.push(Column::text("station", station_ids.iter().map(|&i| elems[i].name.clone()).collect()));
    let mut cols: Vec<(&str, Vec<f64>)> = ["arrivals", "served", "lost", "mean wait", "max wait", "mean queue", "max queue", "utilization"].iter().map(|n| (*n, Vec::new())).collect();
    let mut d = Dataset::default();
    for &i in &station_ids {
        if let Elem::Station { servers, stats, .. } = &elems[i].elem {
            let waits: Vec<f64> = stats.waits.clone();
            let util = if *servers == usize::MAX { f64::NAN } else { stats.busy_area / (span * *servers as f64) * 100.0 };
            let vals = [stats.arrivals as f64, stats.served as f64, stats.balked as f64, mean(&waits), waits.iter().cloned().fold(0.0, f64::max), stats.q_area / span, stats.max_q as f64, util];
            for (c, v) in cols.iter_mut().zip(vals) {
                c.1.push(v);
            }
            d.scalar(&format!("{} utilization", elems[i].name), util, "%");
            d.scalar(&format!("{} mean wait", elems[i].name), mean(&waits), "");
        }
    }
    for (name, values) in cols {
        st.push(Column::new(name, if name == "utilization" { "%" } else { "" }, values));
    }
    let sink_ids: Vec<usize> = (0..elems.len()).filter(|&i| matches!(elems[i].elem, Elem::Sink { .. })).collect();
    let mut sk = Table::new("sinks");
    sk.push(Column::text("sink", sink_ids.iter().map(|&i| elems[i].name.clone()).collect()));
    let mut counts = Vec::new();
    let mut means = Vec::new();
    let mut p95 = Vec::new();
    let mut all_times = Vec::new();
    for &i in &sink_ids {
        if let Elem::Sink { done } = &elems[i].elem {
            let mut s = done.clone();
            s.sort_by(|a, b| a.partial_cmp(b).unwrap());
            counts.push(done.len() as f64);
            means.push(mean(&s));
            p95.push(quantile_sorted(&s, 0.95));
            all_times.extend(done.iter().copied());
        }
    }
    sk.push(Column::new("count", "", counts));
    sk.push(Column::new("mean time in system", "", means));
    sk.push(Column::new("p95 time in system", "", p95));
    let mut tl = Table::new("timeline").with_x(Column::new("t", "", series_t.clone()));
    for (k, &si) in station_ids.iter().enumerate() {
        tl.push(Column::new(&format!("{} queue", elems[si].name), "", std::mem::take(&mut series_q[k])));
        tl.push(Column::new(&format!("{} busy", elems[si].name), "", std::mem::take(&mut series_busy[k])));
    }
    tl.push(Column::new("in system", "", series_wip.clone()));
    // Throughput after the warm-up.
    let done_after: usize = finished.iter().filter(|f| f.0 >= warmup).count();
    let out_rate = done_after as f64 / (t_end - warmup).max(1e-12);
    // Cumulative output over time.
    let mut cum = Table::new("output").with_x(Column::new("t", "", series_t.clone()));
    let mut k = 0;
    let mut sorted_finish: Vec<f64> = finished.iter().map(|f| f.0).collect();
    sorted_finish.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let cumulative: Vec<f64> = series_t.iter().map(|&t| {
        while k < sorted_finish.len() && sorted_finish[k] <= t {
            k += 1;
        }
        k as f64
    }).collect();
    cum.push(Column::new("finished", "", cumulative));
    d.tables = vec![st, tl, sk, cum];
    d.scalar("created", created.len() as f64, "")
        .scalar("finished", finished.len() as f64, "")
        .scalar("throughput", out_rate, "/time")
        .scalar("mean time in system", mean(&all_times), "")
        .scalar("mean in system", mean(&series_wip), "")
        .scalar("events", steps as f64, "");
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distributions_and_settings() {
        assert_eq!(dist("exponential(2)", &[]).unwrap(), Dist::Exponential(0.5));
        assert_eq!(dist("1.5", &[]).unwrap(), Dist::Constant(1.5));
        assert!(matches!(dist("normal(1, 0.1)", &[]).unwrap(), Dist::Normal(..)));
        let s = settings("servers = 2, time = triangular(0.8, 1, 1.5)").unwrap();
        assert_eq!(s["time"], "triangular(0.8, 1, 1.5)");
    }
}
