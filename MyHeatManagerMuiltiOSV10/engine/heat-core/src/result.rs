//! Result statistics, energy balance and the binary result format.
//!
//! ```text
//! u32 magic 0x54484D48 | u32 headerLength | header JSON (space padded to 4 bytes,
//! headerLength includes the padding) | f32 LE data block
//! ```

use serde_json::{json, Map, Value};

use crate::conduction::{Solution, Thermal};
use crate::mesh::{Mesh, VOID};
use crate::model::Model;
use crate::stress::StressOut;
use crate::Ctx;

pub const MAGIC: u32 = 0x54484D48;

/// A finished result: header + data, ready to encode.
pub struct Output {
    pub header: Map<String, Value>,
    pub data: Vec<f32>,
}

impl Output {
    pub fn set_elapsed(&mut self, ms: f64) {
        self.header.insert("elapsedMs".into(), json!(ms.round()));
    }

    pub fn encode(&self) -> Vec<u8> {
        encode(&Value::Object(self.header.clone()), &self.data)
    }
}

fn encode(header: &Value, data: &[f32]) -> Vec<u8> {
    let mut h = serde_json::to_vec(header).unwrap_or_else(|_| b"{\"ok\":false,\"error\":\"encode\"}".to_vec());
    while h.len() % 4 != 0 {
        h.push(b' ');
    }
    let mut out = Vec::with_capacity(8 + h.len() + data.len() * 4);
    out.extend_from_slice(&MAGIC.to_le_bytes());
    out.extend_from_slice(&(h.len() as u32).to_le_bytes());
    out.extend_from_slice(&h);
    for v in data {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

/// `ok:false` result with an empty data block.
pub fn error_bytes(msg: &str, warnings: &[String], elapsed: f64) -> Vec<u8> {
    let h = json!({
        "ok": false, "error": msg, "warnings": warnings, "elapsedMs": elapsed.round(),
        "grid": null, "materials": [], "times": [], "fields": {}, "probes": [], "bodies": [],
        "boundaries": [], "balance": null, "log": [], "stats": null
    });
    encode(&h, &[])
}

/// JSON number or null for non-finite values.
fn jn(v: f64) -> Value {
    if v.is_finite() {
        json!(v)
    } else {
        Value::Null
    }
}

fn jopt(v: Option<f64>) -> Value {
    v.map(jn).unwrap_or(Value::Null)
}

struct Fields<'a> {
    data: &'a mut Vec<f32>,
    index: Map<String, Value>,
}

impl<'a> Fields<'a> {
    fn add(&mut self, name: &str, length: usize, frames: &[&[f32]]) {
        let offset = self.data.len();
        for f in frames {
            debug_assert_eq!(f.len(), length);
            self.data.extend_from_slice(f);
        }
        self.index.insert(name.into(), json!({ "offset": offset, "length": length, "frames": frames.len() }));
    }
}

#[allow(clippy::too_many_arguments)]
pub fn build(
    model: &Model,
    mesh: &Mesh,
    th: &Thermal,
    sol: Solution,
    st: Option<StressOut>,
    esol: Option<crate::electric::ESol>,
    md: Option<crate::modal::ModalOut>,
    ctx: &mut Ctx,
) -> Output {
    let g = &mesh.grid;
    let n = g.n();
    let mut data: Vec<f32> = Vec::new();
    let mut fields = Fields { data: &mut data, index: Map::new() };

    let mat: Vec<f32> = mesh.mat.iter().map(|&m| m as f32).collect();
    fields.add("mat", n, &[&mat]);
    let tf: Vec<&[f32]> = sol.rec.t_frames.iter().map(|v| v.as_slice()).collect();
    fields.add("T", n, &tf);
    let q = th.heat_flux(&sol.t, sol.time_end);
    let mut qc = [vec![0.0f32; n], vec![0.0f32; n], vec![0.0f32; n]];
    for u in 0..th.n {
        let c = th.cell_of[u] as usize;
        for a in 0..3 {
            qc[a][c] = q[u][a] as f32;
        }
    }
    fields.add("qx", n, &[&qc[0]]);
    fields.add("qy", n, &[&qc[1]]);
    if g.dim == 3 {
        fields.add("qz", n, &[&qc[2]]);
    }
    if let Some(qr) = th.qrad_field(&sol.t, sol.time_end) {
        fields.add("qrad", n, &[&qr]);
    }
    if !sol.rec.liquid_frames.is_empty() {
        let lf: Vec<&[f32]> = sol.rec.liquid_frames.iter().map(|v| v.as_slice()).collect();
        fields.add("liquid", n, &lf);
    }
    let mut vmax = 0.0;
    if let Some(fo) = &sol.flow {
        fields.add("u", n, &[&fo.u]);
        fields.add("v", n, &[&fo.v]);
        fields.add("p", n, &[&fo.p]);
        vmax = fo.vmax;
        if let (Some(k), Some(w), Some(nt)) = (&fo.k, &fo.omega, &fo.nut) {
            fields.add("k", n, &[k]);
            fields.add("omega", n, &[w]);
            fields.add("nut", n, &[nt]);
        }
    }
    let mut vm_max = 0.0;
    if let Some(s) = &st {
        fields.add("dispX", n, &[&s.disp[0]]);
        fields.add("dispY", n, &[&s.disp[1]]);
        if s.dim == 3 {
            fields.add("dispZ", n, &[&s.disp[2]]);
        }
        fields.add("sxx", n, &[&s.sxx]);
        fields.add("syy", n, &[&s.syy]);
        if let Some(z) = &s.szz {
            fields.add("szz", n, &[z]);
        }
        fields.add("sxy", n, &[&s.sxy]);
        fields.add("vonMises", n, &[&s.von_mises]);
        vm_max = s.max_vm;
    }
    if let Some(e) = &esol {
        let mut vf = vec![f32::NAN; n];
        let mut jf = vec![0.0f32; n];
        for u in 0..th.n {
            let c = th.cell_of[u] as usize;
            vf[c] = e.v[u] as f32;
            jf[c] = e.j[u] as f32;
        }
        fields.add("V", n, &[&vf]);
        fields.add("J", n, &[&jf]);
    }
    if let Some(m) = &md {
        for (k, mode) in m.shapes.iter().enumerate() {
            fields.add(&format!("modeX_{}", k + 1), n, &[&mode[0]]);
            fields.add(&format!("modeY_{}", k + 1), n, &[&mode[1]]);
            if m.dim == 3 {
                fields.add(&format!("modeZ_{}", k + 1), n, &[&mode[2]]);
            }
        }
    }
    let field_index = std::mem::take(&mut fields.index);

    // Probes.
    let probes: Vec<Value> = model
        .probes
        .iter()
        .enumerate()
        .map(|(i, p)| json!({ "id": p.id, "values": sol.rec.probes[i].iter().map(|v| jopt(*v)).collect::<Vec<_>>() }))
        .collect();
    // Bodies.
    let bodies: Vec<Value> = model
        .bodies
        .iter()
        .enumerate()
        .map(|(bi, b)| {
            let us = &th.body_unknowns[bi];
            let (mut lo, mut hi, mut sum) = (f64::INFINITY, f64::NEG_INFINITY, 0.0);
            for &u in us {
                let t = sol.t[u as usize];
                lo = lo.min(t);
                hi = hi.max(t);
                sum += t;
            }
            let has = !us.is_empty();
            json!({
                "id": b.id,
                "min": if has { jn(lo) } else { Value::Null },
                "max": if has { jn(hi) } else { Value::Null },
                "avg": if has { jn(sum / us.len() as f64) } else { Value::Null },
                "maxHistory": sol.rec.body_max[bi].iter().map(|v| jopt(*v)).collect::<Vec<_>>(),
            })
        })
        .collect();
    // Boundaries.
    let heats = th.bc_heats(&sol.t, sol.adv.as_ref(), sol.time_end);
    let hmean = th.bc_hmean(&sol.t, sol.time_end);
    let mut areas = th.bc_areas();
    if let Some(fo) = &sol.flow {
        for (i, a) in fo.areas.iter().enumerate() {
            areas[i] += a;
        }
    }
    if let Some(s) = &st {
        for (i, a) in s.areas.iter().enumerate() {
            areas[i] += a;
        }
    }
    let boundaries: Vec<Value> = model
        .boundaries
        .iter()
        .enumerate()
        .map(|(i, b)| {
            let mut o = json!({
                "id": b.id, "heat": jn(heats[i]), "area": jn(areas[i]),
                "history": sol.rec.bc_hist[i].iter().map(|v| jn(*v)).collect::<Vec<_>>(),
            });
            if let Some(hm) = hmean[i] {
                o["hMean"] = jn(hm);
            }
            if let Some(e) = &esol {
                if let Some(cur) = e.bc_current[i] {
                    o["current"] = jn(cur);
                }
            }
            if let Some(fo) = &sol.flow {
                if let Some((q, dp)) = fo.fan_points[i] {
                    o["operatingPoint"] = json!({ "flow": jn(q), "pressure": jn(dp) });
                }
                if let Some(m) = fo.metrics[i] {
                    o["massFlow"] = jn(m[0]);
                    o["volumeFlow"] = jn(m[1]);
                    o["pressureAvg"] = jn(m[2]);
                    o["temperatureAvg"] = jn(m[3]);
                }
            }
            o
        })
        .collect();
    // Energy balance: generated + boundaries = stored.
    let generated = th.generated(sol.time_end) + th.bioheat_power(&sol.t);
    // Contact resistances and thin layers move heat inside the domain: not part of the balance.
    let external = |i: usize| !matches!(model.boundaries[i].btype, crate::model::BType::Contact | crate::model::BType::ThinLayer);
    // S2S: exchange between surfaces nets to zero; the rest is exchanged with the ambient.
    let s2s_heat: f64 = th.s2s_heat(&sol.t, sol.time_end).iter().sum();
    let bsum: f64 = (0..heats.len()).filter(|&i| external(i)).map(|i| heats[i]).sum::<f64>() + s2s_heat;
    let babs: f64 = (0..heats.len()).filter(|&i| external(i)).map(|i| heats[i].abs()).sum::<f64>() + s2s_heat.abs();
    let stored = sol.stored;
    // Normalise by the largest heat flow of the run (history included), so a
    // nearly idle final state does not turn round-off into a large "error".
    let peak_hist = (0..sol.rec.times.len())
        .map(|f| sol.rec.bc_hist.iter().enumerate().filter(|(i, _)| external(*i)).map(|(_, h)| h.get(f).map_or(0.0, |v| v.abs())).sum::<f64>())
        .fold(0.0f64, f64::max);
    let scale = generated.abs().max(babs).max(stored.abs()).max(peak_hist);
    let err = if scale > 1e-12 { (generated + bsum - stored).abs() / scale } else { 0.0 };
    // Stats.
    let (mut tmin, mut tmax) = (f64::INFINITY, f64::NEG_INFINITY);
    for &t in &sol.t {
        tmin = tmin.min(t);
        tmax = tmax.max(t);
    }
    let materials: Vec<Value> = model.materials.iter().map(|m| json!(m.id)).collect();
    let log: Vec<Value> = ctx
        .log
        .iter()
        .map(|l| json!({ "phase": l.phase, "iterations": l.iterations, "residual": jn(l.residual) }))
        .collect();
    let _ = VOID;

    let mut h = Map::new();
    h.insert("ok".into(), json!(true));
    h.insert("error".into(), Value::Null);
    h.insert("warnings".into(), json!(ctx.warnings));
    h.insert("elapsedMs".into(), json!(0));
    h.insert(
        "grid".into(),
        json!({ "dim": g.dim, "nx": g.nx, "ny": g.ny, "nz": g.nz, "dx": g.dx * 1e3, "dy": g.dy * 1e3, "dz": g.dz * 1e3 }),
    );
    h.insert("materials".into(), Value::Array(materials));
    h.insert("times".into(), json!(sol.rec.times));
    h.insert("fields".into(), Value::Object(field_index));
    h.insert("probes".into(), Value::Array(probes));
    h.insert("bodies".into(), Value::Array(bodies));
    h.insert("boundaries".into(), Value::Array(boundaries));
    h.insert(
        "balance".into(),
        json!({ "generated": jn(generated), "boundaries": jn(bsum), "stored": jn(stored), "error": jn(err) }),
    );
    h.insert("log".into(), Value::Array(log));
    {
        let (iters, series) = ctx.residuals.export(400);
        let mut m = Map::new();
        for (name, vals) in series {
            m.insert(name, Value::Array(vals.into_iter().map(|v| v.map(jn).unwrap_or(Value::Null)).collect()));
        }
        h.insert("residuals".into(), json!({ "iterations": iters, "series": Value::Object(m) }));
    }
    h.insert(
        "stats".into(),
        json!({ "Tmin": jn(tmin), "Tmax": jn(tmax), "vmax": jn(vmax), "vonMisesMax": jn(vm_max),
                "yPlusMax": jn(sol.flow.as_ref().map_or(0.0, |f| f.yplus_max)) }),
    );
    if let Some(e) = &esol {
        let mut bl = Vec::new();
        let mut total = 0.0;
        let (mut vmin, mut vmax) = (f64::INFINITY, f64::NEG_INFINITY);
        for (bi, b) in model.boundaries.iter().enumerate() {
            if let Some(i) = e.bc_current[bi] {
                let volt = match b.btype {
                    crate::model::BType::Voltage => Some(b.voltage),
                    crate::model::BType::Ground => Some(0.0),
                    _ => None,
                };
                if let Some(vv) = volt {
                    if i.abs() > 0.0 {
                        vmin = vmin.min(vv);
                        vmax = vmax.max(vv);
                    }
                }
                total += i.max(0.0);
                bl.push(json!({ "id": b.id, "current": jn(i), "voltage": volt.map(jn).unwrap_or(Value::Null) }));
            }
        }
        let resistance = if total > 0.0 && vmax > vmin { jn((vmax - vmin) / total) } else { Value::Null };
        h.insert("electric".into(), json!({ "current": jn(total), "power": jn(e.power), "resistance": resistance, "boundaries": bl }));
    }
    if let Some(m) = &md {
        let modes: Vec<Value> = m
            .modes
            .iter()
            .map(|x| json!({ "frequency": jn(x.frequency), "participation": x.participation.iter().map(|v| jn(*v)).collect::<Vec<_>>() }))
            .collect();
        h.insert("modes".into(), Value::Array(modes));
    }
    if let Some(r) = &th.s2s {
        h.insert(
            "s2s".into(),
            json!({ "patches": r.patches(), "openings": r.open_area.len(), "faces": r.faces.len(), "heat": jn(s2s_heat) }),
        );
    }
    if let Some(fo) = &sol.flow {
        h.insert("flow".into(), json!({ "pressureDrop": fo.pressure_drop.map(jn).unwrap_or(Value::Null) }));
    }
    Output { header: h, data }
}

// ------------------------------------------------------------------ decoding

/// Decoded result bytes (for tests and the CLI).
pub struct Decoded {
    pub header: Value,
    pub data: Vec<f32>,
}

impl Decoded {
    pub fn ok(&self) -> bool {
        self.header["ok"].as_bool().unwrap_or(false)
    }

    /// Field values of one frame (None if the field/frame does not exist).
    pub fn field(&self, name: &str, frame: usize) -> Option<&[f32]> {
        let f = self.header.get("fields")?.get(name)?;
        let off = f["offset"].as_u64()? as usize;
        let len = f["length"].as_u64()? as usize;
        let frames = f["frames"].as_u64()? as usize;
        if frame >= frames {
            return None;
        }
        let s = off + frame * len;
        self.data.get(s..s + len)
    }

    /// Number of frames of a field.
    pub fn frames(&self, name: &str) -> usize {
        self.header["fields"][name]["frames"].as_u64().unwrap_or(0) as usize
    }

    pub fn grid(&self) -> (usize, usize, usize, usize, f64, f64, f64) {
        let g = &self.header["grid"];
        (
            g["dim"].as_u64().unwrap_or(2) as usize,
            g["nx"].as_u64().unwrap_or(0) as usize,
            g["ny"].as_u64().unwrap_or(0) as usize,
            g["nz"].as_u64().unwrap_or(1) as usize,
            g["dx"].as_f64().unwrap_or(0.0),
            g["dy"].as_f64().unwrap_or(0.0),
            g["dz"].as_f64().unwrap_or(0.0),
        )
    }

    pub fn stat(&self, key: &str) -> f64 {
        self.header["stats"][key].as_f64().unwrap_or(f64::NAN)
    }
}

/// Parse result bytes.
pub fn decode(bytes: &[u8]) -> Result<Decoded, String> {
    if bytes.len() < 8 {
        return Err("result too short".into());
    }
    let magic = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if magic != MAGIC {
        return Err(format!("bad magic {magic:#x}"));
    }
    let hl = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    if bytes.len() < 8 + hl {
        return Err("truncated header".into());
    }
    let header: Value = serde_json::from_slice(&bytes[8..8 + hl]).map_err(|e| format!("header JSON: {e}"))?;
    let start = 8 + ((hl + 3) & !3);
    let rest = &bytes[start.min(bytes.len())..];
    let data = rest.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    Ok(Decoded { header, data })
}

/// CSV of one field frame: x,y,z (mm, cell centres) and the value.
pub fn field_csv(result: &[u8], field: &str, frame: usize) -> String {
    let d = match decode(result) {
        Ok(d) => d,
        Err(e) => return format!("error: {e}\n"),
    };
    let Some(vals) = d.field(field, frame) else {
        return format!("error: no field \"{field}\" frame {frame}\n");
    };
    let (_dim, nx, ny, _nz, dx, dy, dz) = d.grid();
    let mut s = String::with_capacity(vals.len() * 32);
    s.push_str(&format!("x,y,z,{field}\n"));
    for (c, v) in vals.iter().enumerate() {
        let i = c % nx;
        let j = (c / nx) % ny;
        let k = c / (nx * ny);
        let val = if v.is_finite() { format!("{v}") } else { String::new() };
        s.push_str(&format!(
            "{},{},{},{}\n",
            (i as f64 + 0.5) * dx,
            (j as f64 + 0.5) * dy,
            (k as f64 + 0.5) * dz,
            val
        ));
    }
    s
}
