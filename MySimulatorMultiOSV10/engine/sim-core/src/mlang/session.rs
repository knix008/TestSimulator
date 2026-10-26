//! An interactive MATLAB session for the command window and editor: each
//! request runs code against the workspace, figures and random stream the
//! previous request returned, with the folder's .m files (functions and
//! scripts) callable by name. Requests and replies are JSON; numbers travel
//! as base64 of little-endian f64 so NaN and Inf survive.
//!
//! Request: { code, files: [{ name, code }], state, seed }
//! Reply:   { ok, error, output, clc, state, vars: [{ name, class, size, value, bytes }], figures, current }

use super::interp::{Figure, Interp, Series, Surface};
use super::syntax::{parse, Bin, Expr, Stmt};
use super::value::{short, Arr, Func, Value};
use serde_json::{json, Map, Value as J};
use std::collections::HashMap;
use std::rc::Rc;

// ───────────────────────── source text of expressions (anonymous functions)

pub fn bin_symbol(op: Bin) -> &'static str {
    bin_op(op)
}

fn bin_op(op: Bin) -> &'static str {
    match op {
        Bin::Add => "+",
        Bin::Sub => "-",
        Bin::Mul => "*",
        Bin::Div => "/",
        Bin::LDiv => "\\",
        Bin::Pow => "^",
        Bin::EMul => ".*",
        Bin::EDiv => "./",
        Bin::ELDiv => ".\\",
        Bin::EPow => ".^",
        Bin::Eq => "==",
        Bin::Ne => "~=",
        Bin::Lt => "<",
        Bin::Le => "<=",
        Bin::Gt => ">",
        Bin::Ge => ">=",
        Bin::And => "&",
        Bin::Or => "|",
        Bin::AndAnd => "&&",
        Bin::OrOr => "||",
    }
}

fn num_src(v: f64) -> String {
    if v.is_infinite() {
        if v > 0.0 { "Inf".into() } else { "-Inf".into() }
    } else if v.is_nan() {
        "NaN".into()
    } else {
        format!("{v}")
    }
}

/// MATLAB source for an expression (parenthesised where needed).
pub fn expr_src(e: &Expr) -> String {
    fn inner(e: &Expr) -> String {
        match e {
            Expr::Bin(..) | Expr::Range(..) | Expr::Neg(_) | Expr::Not(_) => format!("({})", expr_src(e)),
            _ => expr_src(e),
        }
    }
    let list = |a: &[Expr]| a.iter().map(expr_src).collect::<Vec<_>>().join(", ");
    match e {
        Expr::Num(v) => num_src(*v),
        Expr::Imag(v) => format!("{}i", num_src(*v)),
        Expr::Str(s) => format!("'{}'", s.replace('\'', "''")),
        Expr::Colon => ":".into(),
        Expr::End => "end".into(),
        Expr::Ident(n) => n.clone(),
        Expr::Matrix(rows) => format!("[{}]", rows.iter().map(|r| list(r)).collect::<Vec<_>>().join("; ")),
        Expr::Cell(rows) => format!("{{{}}}", rows.iter().map(|r| list(r)).collect::<Vec<_>>().join("; ")),
        Expr::Range(a, s, b) => match s {
            Some(s) => format!("{}:{}:{}", inner(a), inner(s), inner(b)),
            None => format!("{}:{}", inner(a), inner(b)),
        },
        Expr::Bin(op, a, b) => format!("{} {} {}", inner(a), bin_op(*op), inner(b)),
        Expr::Neg(a) => format!("-{}", inner(a)),
        Expr::Not(a) => format!("~{}", inner(a)),
        Expr::Transpose(a, conj) => format!("{}{}", inner(a), if *conj { "'" } else { ".'" }),
        Expr::Index(b, a) => format!("{}({})", inner(b), list(a)),
        Expr::CellIndex(b, a) => format!("{}{{{}}}", inner(b), list(a)),
        Expr::Field(b, f) => format!("{}.{f}", inner(b)),
        Expr::DynField(b, f) => format!("{}.({})", inner(b), expr_src(f)),
        Expr::Anon(p, body) => format!("@({}) {}", p.join(", "), expr_src(body)),
        Expr::Handle(n) => format!("@{n}"),
        Expr::SuperCall(v, s, a) => format!("{v}@{s}({})", list(a)),
    }
}

// ───────────────────────── base64 of f64

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn b64_f64(v: &[f64]) -> String {
    let bytes: Vec<u8> = v.iter().flat_map(|x| x.to_le_bytes()).collect();
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

fn f64_b64(s: &str) -> Vec<f64> {
    let bytes = crate::formats::base64_decode(s).unwrap_or_default();
    bytes.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().unwrap())).collect()
}

// ───────────────────────── values ↔ JSON

pub fn value_json(v: &Value) -> J {
    value_json_ctx(v, &mut Vec::new())
}

/// `seen` holds the objects already written: a second reference becomes {t: "oref"} (shared handles, cycles).
pub fn value_json_ctx(v: &Value, seen: &mut Vec<usize>) -> J {
    match v {
        Value::Num(a) => {
            let mut m = Map::new();
            m.insert("t".into(), json!("n"));
            m.insert("r".into(), json!(a.r));
            m.insert("c".into(), json!(a.c));
            m.insert("re".into(), json!(b64_f64(&a.re)));
            if let Some(im) = &a.im {
                m.insert("im".into(), json!(b64_f64(im)));
            }
            if a.logical {
                m.insert("l".into(), json!(true));
            }
            if !a.nd.is_empty() {
                m.insert("nd".into(), json!(a.nd));
            }
            J::Object(m)
        }
        Value::Str(s) => json!({ "t": "s", "v": s }),
        Value::Cell { r, c, items } => json!({ "t": "c", "r": r, "c": c, "items": items.iter().map(|x| value_json_ctx(x, seen)).collect::<Vec<_>>() }),
        Value::Struct { r, c, fields, items } => json!({ "t": "st", "r": r, "c": c, "f": fields, "items": items.iter().map(|row| row.iter().map(|x| value_json_ctx(x, seen)).collect::<Vec<_>>()).collect::<Vec<_>>() }),
        Value::Func(Func::Named(n)) => json!({ "t": "fh", "name": n }),
        Value::Func(Func::User(u)) => json!({ "t": "fh", "name": u.name }),
        Value::Obj(o) => match &o.data {
            super::value::ObjData::Lti(g) => {
                let form = match g.form {
                    super::lti::Form::Tf => "tf",
                    super::lti::Form::Zpk => "zpk",
                    super::lti::Form::Ss => "ss",
                };
                let ss = g.ss.as_ref().map(|(a, b, c, d)| json!({ "a": a.iter().map(|r| b64_f64(r)).collect::<Vec<_>>(), "b": b64_f64(b), "c": b64_f64(c), "d": d }));
                json!({ "t": "lti", "num": b64_f64(&g.num), "den": b64_f64(&g.den), "ts": g.ts, "form": form, "delay": g.delay, "ss": ss })
            }
            super::value::ObjData::Gfx(rs) => json!({ "t": "gfx", "class": o.class, "refs": rs.iter().map(super::graphics::ref_json).collect::<Vec<_>>() }),
            super::value::ObjData::User(inst) => {
                let id = super::classes::obj_key(v);
                if seen.contains(&id) {
                    return json!({ "t": "oref", "id": id.to_string() });
                }
                seen.push(id);
                let props: Vec<J> = inst.props.borrow().iter().map(|x| value_json_ctx(x, seen)).collect();
                let names: Vec<&String> = inst.info.props.iter().map(|(n, _)| n).collect();
                json!({ "t": "obj", "class": inst.info.name, "id": id.to_string(), "names": names, "props": props, "valid": inst.valid.get() })
            }
        },
        Value::Func(Func::Anon { params, body, captured }) => {
            let mut keys: Vec<&String> = captured.keys().collect();
            keys.sort();
            let cap: Map<String, J> = keys.into_iter().map(|k| (k.clone(), value_json_ctx(&captured[k], seen))).collect();
            json!({ "t": "fa", "src": format!("@({}) {}", params.join(", "), expr_src(body)), "cap": cap })
        }
    }
}

/// Reading values back: classes are found through `classes` (objects of unknown classes become structures).
pub struct LoadCtx<'r> {
    pub classes: &'r mut dyn FnMut(&str) -> Option<Rc<super::classes::ClassInfo>>,
    pub objects: HashMap<String, Value>,
}

pub fn json_value(j: &J) -> Value {
    let mut none = |_: &str| None;
    let mut ctx = LoadCtx { classes: &mut none, objects: HashMap::new() };
    json_value_ctx(j, &mut ctx)
}

pub fn json_value_ctx(j: &J, ctx: &mut LoadCtx) -> Value {
    let us = |k: &str| j.get(k).and_then(J::as_u64).unwrap_or(0) as usize;
    match j.get("t").and_then(J::as_str).unwrap_or("") {
        "n" => {
            let re = f64_b64(j.get("re").and_then(J::as_str).unwrap_or(""));
            let im = j.get("im").and_then(J::as_str).map(f64_b64);
            let mut a = Arr { r: us("r"), c: us("c"), re, im, logical: j.get("l").and_then(J::as_bool).unwrap_or(false), nd: Vec::new() };
            if let Some(nd) = j.get("nd").and_then(J::as_array) {
                let d: Vec<usize> = nd.iter().filter_map(|v| v.as_u64().map(|x| x as usize)).collect();
                if d.iter().product::<usize>() == a.len() {
                    a.set_dims(&d);
                }
            }
            Value::Num(a)
        }
        "s" => Value::Str(j.get("v").and_then(J::as_str).unwrap_or("").to_string()),
        "c" => Value::Cell { r: us("r"), c: us("c"), items: j.get("items").and_then(J::as_array).map(|a| a.iter().map(|x| json_value_ctx(x, ctx)).collect()).unwrap_or_default() },
        "st" => Value::Struct {
            r: us("r"),
            c: us("c"),
            fields: j.get("f").and_then(J::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default(),
            items: j.get("items").and_then(J::as_array).map(|a| a.iter().map(|row| row.as_array().map(|r| r.iter().map(|x| json_value_ctx(x, ctx)).collect()).unwrap_or_default()).collect()).unwrap_or_default(),
        },
        "fh" => Value::Func(Func::Named(j.get("name").and_then(J::as_str).unwrap_or("").to_string())),
        "lti" => {
            let form = match j.get("form").and_then(J::as_str).unwrap_or("tf") {
                "zpk" => super::lti::Form::Zpk,
                "ss" => super::lti::Form::Ss,
                _ => super::lti::Form::Tf,
            };
            let ss = j.get("ss").filter(|v| !v.is_null()).map(|s| {
                let a: Vec<Vec<f64>> = s.get("a").and_then(J::as_array).map(|rows| rows.iter().map(|r| f64_b64(r.as_str().unwrap_or(""))).collect()).unwrap_or_default();
                (a, f64_b64(s.get("b").and_then(J::as_str).unwrap_or("")), f64_b64(s.get("c").and_then(J::as_str).unwrap_or("")), s.get("d").and_then(J::as_f64).unwrap_or(0.0))
            });
            super::lti::wrap(super::lti::Lti {
                num: f64_b64(j.get("num").and_then(J::as_str).unwrap_or("")),
                den: f64_b64(j.get("den").and_then(J::as_str).unwrap_or("")),
                ts: j.get("ts").and_then(J::as_f64).unwrap_or(0.0),
                form,
                ss,
                delay: j.get("delay").and_then(J::as_f64).unwrap_or(0.0),
            })
        }
        "gfx" => super::graphics::make_handle(
            j.get("class").and_then(J::as_str).unwrap_or("").to_string(),
            j.get("refs").and_then(J::as_array).map(|a| a.iter().filter_map(super::graphics::json_ref).collect()).unwrap_or_default(),
        ),
        "oref" => ctx.objects.get(j.get("id").and_then(J::as_str).unwrap_or("")).cloned().unwrap_or_else(Value::empty),
        "obj" => {
            let id = j.get("id").and_then(J::as_str).unwrap_or("").to_string();
            let class = j.get("class").and_then(J::as_str).unwrap_or("");
            let names: Vec<String> = j.get("names").and_then(J::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
            let raw: Vec<J> = j.get("props").and_then(J::as_array).cloned().unwrap_or_default();
            match (ctx.classes)(class) {
                Some(info) => {
                    // Made first (empty), then filled, so references back to it resolve.
                    let obj = super::classes::new_instance(info.clone(), vec![Value::empty(); info.props.len()]);
                    ctx.objects.insert(id, obj.clone());
                    let vals: Vec<Value> = raw.iter().map(|x| json_value_ctx(x, ctx)).collect();
                    if let Some(inst) = super::classes::instance(&obj) {
                        let mut props = inst.props.borrow_mut();
                        for (k, (p, _)) in info.props.iter().enumerate() {
                            if let Some(pos) = names.iter().position(|n| n == p) {
                                if let Some(v) = vals.get(pos) {
                                    props[k] = v.clone();
                                }
                            }
                        }
                        inst.valid.set(j.get("valid").and_then(J::as_bool).unwrap_or(true));
                    }
                    obj
                }
                None => {
                    let vals: Vec<Value> = raw.iter().map(|x| json_value_ctx(x, ctx)).collect();
                    Value::Struct { r: 1, c: 1, fields: names, items: vec![vals] }
                }
            }
        }
        "fa" => {
            let src = j.get("src").and_then(J::as_str).unwrap_or("@() []");
            let captured: HashMap<String, Value> = j.get("cap").and_then(J::as_object).map(|m| m.iter().map(|(k, v)| (k.clone(), json_value_ctx(v, ctx))).collect()).unwrap_or_default();
            match parse(&format!("__f = {src};")).ok().and_then(|p| p.body.into_iter().next()) {
                Some(Stmt::Assign(_, Expr::Anon(params, body), _, _)) => Value::Func(Func::Anon { params, body, captured: Rc::new(captured) }),
                _ => Value::empty(),
            }
        }
        _ => Value::empty(),
    }
}

fn props_json(p: &super::graphics::Props) -> J {
    J::Object(p.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
}

fn json_props(j: Option<&J>) -> super::graphics::Props {
    j.and_then(J::as_object).map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default()
}

fn figure_json(f: &Figure) -> J {
    json!({
        "title": f.title, "xlabel": f.xlabel, "ylabel": f.ylabel, "kind": f.kind, "legend": f.legend,
        "id": f.id, "next": f.next, "uifig": f.uifig, "props": props_json(&f.props), "axes": props_json(&f.axes),
        "series": f.series.iter().map(|s| json!({ "name": s.name, "x": b64_f64(&s.x), "y": b64_f64(&s.y), "style": s.style, "id": s.id, "props": props_json(&s.props) })).collect::<Vec<_>>(),
        "surfaces": f.surfaces.iter().map(|s| json!({ "name": s.name, "x": b64_f64(&s.x), "y": b64_f64(&s.y), "z": b64_f64(&s.z), "id": s.id, "props": props_json(&s.props) })).collect::<Vec<_>>(),
        "controls": f.controls.iter().map(|c| json!({
            "id": c.id, "style": c.style, "component": c.component, "auto": c.auto, "props": props_json(&c.props),
            "callbacks": c.callbacks.iter().map(|(k, v)| (k.clone(), value_json(v))).collect::<Map<String, J>>(),
        })).collect::<Vec<_>>(),
        "annots": f.annots.iter().map(|a| json!({ "id": a.id, "kind": a.kind, "x": a.x, "y": a.y, "text": a.text, "props": props_json(&a.props) })).collect::<Vec<_>>(),
    })
}

fn json_figure(j: &J) -> Figure {
    let s = |k: &str| j.get(k).and_then(J::as_str).unwrap_or("").to_string();
    let b = |o: &J, k: &str| f64_b64(o.get(k).and_then(J::as_str).unwrap_or(""));
    let id = |o: &J| o.get("id").and_then(J::as_u64).unwrap_or(0) as u32;
    let list = |k: &str| j.get(k).and_then(J::as_array).cloned().unwrap_or_default();
    Figure {
        id: id(j),
        next: j.get("next").and_then(J::as_u64).unwrap_or(0) as u32,
        uifig: j.get("uifig").and_then(J::as_bool).unwrap_or(false),
        props: json_props(j.get("props")),
        axes: json_props(j.get("axes")),
        controls: list("controls")
            .iter()
            .map(|c| super::graphics::Control {
                id: id(c),
                style: c.get("style").and_then(J::as_str).unwrap_or("").into(),
                component: c.get("component").and_then(J::as_bool).unwrap_or(false),
                auto: c.get("auto").and_then(J::as_bool).unwrap_or(false),
                props: json_props(c.get("props")),
                callbacks: c.get("callbacks").and_then(J::as_object).map(|m| m.iter().map(|(k, v)| (k.clone(), json_value(v))).collect()).unwrap_or_default(),
            })
            .collect(),
        annots: list("annots")
            .iter()
            .map(|a| super::graphics::Annot {
                id: id(a),
                kind: a.get("kind").and_then(J::as_str).unwrap_or("text").into(),
                x: a.get("x").and_then(J::as_f64).unwrap_or(0.0),
                y: a.get("y").and_then(J::as_f64).unwrap_or(0.0),
                text: a.get("text").and_then(J::as_str).unwrap_or("").into(),
                props: json_props(a.get("props")),
            })
            .collect(),
        title: s("title"),
        xlabel: s("xlabel"),
        ylabel: s("ylabel"),
        kind: s("kind"),
        legend: j.get("legend").and_then(J::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default(),
        series: j.get("series").and_then(J::as_array).map(|a| a.iter().map(|o| Series { name: o.get("name").and_then(J::as_str).unwrap_or("").into(), x: b(o, "x"), y: b(o, "y"), style: o.get("style").and_then(J::as_str).unwrap_or("").into(), id: id(o), props: json_props(o.get("props")) }).collect()).unwrap_or_default(),
        surfaces: j.get("surfaces").and_then(J::as_array).map(|a| a.iter().map(|o| Surface { name: o.get("name").and_then(J::as_str).unwrap_or("").into(), x: b(o, "x"), y: b(o, "y"), z: b(o, "z"), id: id(o), props: json_props(o.get("props")) }).collect()).unwrap_or_default(),
    }
}

fn size_text(v: &Value) -> String {
    match v {
        Value::Num(a) => a.dims().iter().map(|d| d.to_string()).collect::<Vec<_>>().join("×"),
        _ => {
            let (r, c) = v.dims();
            format!("{r}×{c}")
        }
    }
}

fn bytes_of(v: &Value) -> usize {
    match v {
        Value::Num(a) => a.len() * if a.logical { 1 } else if a.im.is_some() { 16 } else { 8 },
        Value::Str(s) => 2 * s.chars().count(),
        Value::Cell { items, .. } => items.iter().map(bytes_of).sum::<usize>() + 8 * items.len(),
        Value::Struct { items, .. } => items.iter().flatten().map(bytes_of).sum::<usize>() + 64,
        Value::Func(_) => 32,
        Value::Obj(_) => 64,
    }
}

/// The value column of the workspace browser.
fn value_text(v: &Value) -> String {
    match v {
        Value::Num(a) if a.len() > 1 && a.len() <= 10 && (a.r == 1 || a.c == 1) && a.im.is_none() => {
            let sep = if a.r == 1 { " " } else { ";" };
            format!("[{}]", a.re.iter().map(|x| super::value::format_num(*x)).collect::<Vec<_>>().join(sep))
        }
        Value::Num(a) if a.len() > 1 => format!("{}×{} {}", a.r, a.c, if a.logical { "logical" } else if a.im.is_some() { "complex double" } else { "double" }),
        Value::Obj(o) if super::graphics::is_gfx(v) => {
            let (r, c) = v.dims();
            format!("{r}×{c} {}", o.class.rsplit('.').next().unwrap_or(""))
        }
        other => short(other),
    }
}

/// The folder's .m files: function files register their functions, script files run by name.
fn load_files(it: &mut Interp, files: &[J]) -> Result<(), String> {
    for f in files {
        let name = f.get("name").and_then(J::as_str).unwrap_or("");
        let code = f.get("code").and_then(J::as_str).unwrap_or("");
        let stem = name.strip_suffix(".m").unwrap_or(name).to_string();
        let prog = parse(code).map_err(|e| format!("{name}: {e}"))?;
        for func in &prog.functions {
            it.funcs.insert(func.name.clone(), func.clone());
        }
        for c in &prog.classes {
            it.register_class(c.clone());
        }
        if prog.body.is_empty() && !prog.classes.is_empty() {
            continue;
        }
        if prog.body.is_empty() {
            // A function file: its first function answers to the file's name.
            if let Some(first) = prog.functions.first() {
                if first.name != stem && !stem.is_empty() {
                    it.funcs.insert(stem.clone(), first.clone());
                }
            }
        } else if !stem.is_empty() {
            it.scripts.insert(stem, Rc::new(prog.body));
        }
    }
    Ok(())
}

/// Runs one request (see the module comment) and returns the reply JSON.
pub fn session(request: &str, cancel: &dyn Fn() -> bool, host: &dyn crate::Host) -> String {
    let req: J = serde_json::from_str(request).unwrap_or(J::Null);
    let code = req.get("code").and_then(J::as_str).unwrap_or("");
    let state = req.get("state").cloned().unwrap_or(J::Null);
    let seed = req.get("seed").and_then(J::as_u64).unwrap_or(1);
    let mut it = Interp::new(cancel, host, seed);
    if let Some(rng) = state.get("rng").and_then(J::as_array) {
        let s: Vec<u64> = rng.iter().filter_map(|v| v.as_str().and_then(|t| t.parse().ok())).collect();
        if s.len() == 4 {
            it.rng = crate::rng::Rng::from_state([s[0], s[1], s[2], s[3]]);
        }
    }
    // The folder's files and the classes earlier commands defined, before the variables (objects need their classes).
    let files = req.get("files").and_then(J::as_array).cloned().unwrap_or_default();
    let mut error = String::new();
    if let Err(e) = load_files(&mut it, &files) {
        error = e;
    }
    let mut sources: Vec<String> = state.get("sources").and_then(J::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    for src in &sources {
        if let Ok(prog) = parse(src) {
            for c in &prog.classes {
                it.register_class(c.clone());
            }
        }
    }
    let (vars, globals) = {
        let mut resolver = |name: &str| it.class_info(name).ok();
        let mut ctx = LoadCtx { classes: &mut resolver, objects: HashMap::new() };
        let vars: Vec<(String, Value)> = state.get("vars").and_then(J::as_object).map(|m| m.iter().map(|(k, v)| (k.clone(), json_value_ctx(v, &mut ctx))).collect()).unwrap_or_default();
        let globals: Vec<(String, Value)> = state.get("globals").and_then(J::as_object).map(|m| m.iter().map(|(k, v)| (k.clone(), json_value_ctx(v, &mut ctx))).collect()).unwrap_or_default();
        (vars, globals)
    };
    for (k, v) in vars {
        it.scopes[0].insert(k, v);
    }
    for (k, v) in globals {
        it.globals.insert(k, v);
    }
    if let Some(figs) = state.get("figures").and_then(J::as_array) {
        it.figures = figs.iter().map(json_figure).collect();
    }
    it.current = state.get("current").and_then(J::as_u64).unwrap_or(0) as usize;
    it.hold = state.get("hold").and_then(J::as_bool).unwrap_or(false);
    if error.is_empty() {
        match parse(code) {
            Err(e) => error = e,
            Ok(prog) => {
                if !prog.classes.is_empty() {
                    sources.push(code.to_string());
                }
                if let Err(e) = it.run(&prog) {
                    let (_, msg) = super::interp::split_error(&e);
                    error = if e.starts_with("line ") { format!("{}: {msg}", e.split(": ").next().unwrap_or("")) } else { msg };
                }
            }
        }
    }
    let ws = it.scopes[0].clone();
    let mut names: Vec<&String> = ws.keys().collect();
    names.sort_by_key(|n| n.to_lowercase());
    // Byte order of the names, as the JSON map reads them back: shared objects are written once, then referenced.
    let mut seen = Vec::new();
    let mut keys: Vec<&String> = ws.keys().collect();
    keys.sort();
    let vars_state: Map<String, J> = keys.iter().map(|k| ((*k).clone(), value_json_ctx(&ws[*k], &mut seen))).collect();
    let mut gkeys: Vec<&String> = it.globals.keys().collect();
    gkeys.sort();
    let globals: Map<String, J> = gkeys.iter().map(|k| ((*k).clone(), value_json_ctx(&it.globals[*k], &mut seen))).collect();
    let rng = it.rng.state();
    super::graphics::ensure_ids(&mut it);
    let figures: Vec<J> = it.figures.iter().map(figure_json).collect();
    let current = it.current.min(it.figures.len().saturating_sub(1));
    let reply = json!({
        "ok": error.is_empty(),
        "error": error,
        "output": it.out,
        "clc": it.clc,
        "warnings": it.warnings,
        "dialogs": it.dialogs,
        "state": {
            "vars": vars_state,
            "globals": globals,
            "figures": figures,
            "current": current,
            "hold": it.hold,
            "rng": rng.iter().map(|v| v.to_string()).collect::<Vec<_>>(),
            "sources": sources,
        },
        "vars": names.iter().map(|n| {
            let v = &ws[*n];
            json!({ "name": n, "class": match v { Value::Obj(o) => o.class.clone(), _ => v.class().to_string() }, "size": size_text(v), "value": value_text(v), "bytes": bytes_of(v) })
        }).collect::<Vec<_>>(),
        "figures": figures,
        "current": current,
    });
    reply.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(code: &str, state: &J, files: J) -> J {
        let req = json!({ "code": code, "state": state, "files": files, "seed": 1 });
        serde_json::from_str(&session(&req.to_string(), &|| false, &crate::NoHost)).unwrap()
    }

    #[test]
    fn a_session_keeps_its_workspace_and_figures() {
        let r1 = call("x = [1 2 NaN Inf];\nf = @(t) t.^2 + k;\nk = 3;\nplot(1:3, [4 5 6]); title('first')", &J::Null, json!([]));
        assert!(r1["ok"].as_bool().unwrap(), "{}", r1["error"]);
        let r2 = call("y = sum(x(1:2)) + numel(x)\nr = rand(1);\nsq = square3(4)\nrunme\nhold on; plot(1:3, [1 1 1]);", &r1["state"], json!([
            { "name": "square3.m", "code": "function y = square3(v)\n  y = v^3;\nend\n" },
            { "name": "runme.m", "code": "fromScript = 42;\n" },
        ]));
        assert!(r2["ok"].as_bool().unwrap(), "{}", r2["error"]);
        let out = r2["output"].as_str().unwrap();
        assert!(out.contains("y = 7"), "{out}");
        let vars: Vec<String> = r2["vars"].as_array().unwrap().iter().map(|v| v["name"].as_str().unwrap().to_string()).collect();
        assert!(vars.contains(&"fromScript".to_string()) && vars.contains(&"sq".to_string()));
        assert!(out.contains("sq = 64"));
        let x = r2["vars"].as_array().unwrap().iter().find(|v| v["name"] == "x").unwrap();
        assert_eq!(x["size"], "1×4");
        assert_eq!(r2["figures"][0]["series"].as_array().unwrap().len(), 2);
        // The random stream continues: two requests draw different numbers.
        let r3 = call("r2 = rand(1);", &r2["state"], json!([]));
        let get = |r: &J, n: &str| json_value(&r["state"]["vars"][n]).scalar().unwrap();
        assert_ne!(get(&r2, "r"), get(&r3, "r2"));
        // NaN and Inf survive the round trip.
        let xv = json_value(&r3["state"]["vars"]["x"]).arr().unwrap();
        assert!(xv.re[2].is_nan() && xv.re[3].is_infinite());
        // clc and errors.
        let r4 = call("clc\nundefinedThing + 1", &r3["state"], json!([]));
        assert!(r4["clc"].as_bool().unwrap() && !r4["ok"].as_bool().unwrap());
        assert!(r4["error"].as_str().unwrap().contains("undefinedThing"));
    }

    #[test]
    fn objects_live_across_commands() {
        let files = json!([{ "name": "Counter.m", "code": "classdef Counter < handle\n  properties\n    n = 0\n  end\n  methods\n    function inc(obj)\n      obj.n = obj.n + 1;\n    end\n  end\nend\n" }]);
        let r1 = call("c = Counter(); c.inc();\nG = tf(1, [1 1]);", &J::Null, files.clone());
        assert!(r1["ok"].as_bool().unwrap(), "{}", r1["error"]);
        let r2 = call("d = c; d.inc();", &r1["state"], files.clone());
        assert!(r2["ok"].as_bool().unwrap(), "{}", r2["error"]);
        let r3 = call("d.inc(); k = c.n\nH = feedback(G, 1)", &r2["state"], files.clone());
        assert!(r3["ok"].as_bool().unwrap(), "{}", r3["error"]);
        let out = r3["output"].as_str().unwrap();
        assert!(out.contains("k = 3"), "{out}");
        assert!(out.contains("s + 2"), "{out}");
        // A class defined in a command (not a file) keeps working later.
        let r4 = call("classdef Pt\n properties\n  x = 1\n end\nend\n", &r3["state"], json!([]));
        assert!(r4["ok"].as_bool().unwrap(), "{}", r4["error"]);
        let r5 = call("p = Pt(); v = p.x + 1", &r4["state"], json!([]));
        assert!(r5["output"].as_str().unwrap().contains("v = 2"), "{}", r5["error"]);
    }

    #[test]
    fn graphics_handles_and_callbacks_live_across_commands() {
        let r1 = call("f = uifigure('Name', 'App');
n = 0;
s = uislider(f, 'Limits', [0 5], 'ValueChangedFcn', @(src, e) assignin('base', 'n', e.Value * 2));
h = plot(1:3);", &J::Null, json!([]));
        assert!(r1["ok"].as_bool().unwrap(), "{}", r1["error"]);
        let fig = &r1["state"]["figures"][0];
        assert_eq!(fig["controls"][0]["style"], "slider");
        let (fid, cid) = (fig["id"].as_u64().unwrap(), fig["controls"][0]["id"].as_u64().unwrap());
        let r2 = call(&format!("__uievent({fid}, {cid}, 4);"), &r1["state"], json!([]));
        assert!(r2["ok"].as_bool().unwrap(), "{}", r2["error"]);
        let r3 = call("v = n
h.LineWidth = 3;
w = h.LineWidth
msgbox('hi')", &r2["state"], json!([]));
        let out = r3["output"].as_str().unwrap();
        assert!(out.contains("v = 8") && out.contains("w = 3"), "{out} {}", r3["error"]);
        assert_eq!(r3["dialogs"][0]["message"], "hi");
        assert_eq!(r3["state"]["figures"][0]["controls"][0]["props"]["Value"], 4.0);
    }

    #[test]
    fn anonymous_functions_print_and_round_trip() {
        let r = call("a = 2;\ng = @(x, y) a*x.^2 + sin(y) - [1 2]*3;\n", &J::Null, json!([]));
        let g = json_value(&r["state"]["vars"]["g"]);
        let txt = super::super::value::short(&g);
        assert!(txt.starts_with("@(x, y) "), "{txt}");
        let r2 = call("v = g(1, 0)", &r["state"], json!([]));
        assert!(r2["output"].as_str().unwrap().contains("v ="), "{}", r2["error"]);
        let v = json_value(&r2["state"]["vars"]["v"]).arr().unwrap();
        assert_eq!(v.re, vec![-1.0, -4.0]);
    }
}
