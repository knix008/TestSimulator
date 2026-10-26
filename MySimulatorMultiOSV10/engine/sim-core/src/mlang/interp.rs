//! The M language interpreter: workspaces, indexing and indexed assignment
//! (with growth and deletion), cell and structure access, comma-separated
//! lists, control flow, user and anonymous functions, and the figures that
//! plot() and friends fill.

use super::syntax::{Bin, Expr, Function, Program, Stmt};
use super::value::*;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

pub enum Flow {
    Normal,
    Break,
    Continue,
    Return,
}

#[derive(Clone, Debug, Default)]
pub struct Series {
    pub name: String,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    /// The MATLAB line spec ('r--', 'o', 'k:' …).
    pub style: String,
    /// The handle id within its figure, and properties set through the handle (Color, LineWidth …).
    pub id: u32,
    pub props: super::graphics::Props,
}

#[derive(Clone, Debug, Default)]
pub struct Surface {
    pub name: String,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    /// z[j * nx + i]
    pub z: Vec<f64>,
    pub id: u32,
    pub props: super::graphics::Props,
}

#[derive(Clone, Debug, Default)]
pub struct Figure {
    pub title: String,
    pub xlabel: String,
    pub ylabel: String,
    pub kind: String,
    pub series: Vec<Series>,
    pub surfaces: Vec<Surface>,
    pub legend: Vec<String>,
    /// The figure number (its handle), the last id given to an object in it, figure and axes properties.
    pub id: u32,
    pub next: u32,
    pub props: super::graphics::Props,
    pub axes: super::graphics::Props,
    /// uicontrol / ui* components, text and constant lines.
    pub controls: Vec<super::graphics::Control>,
    pub annots: Vec<super::graphics::Annot>,
    /// Made by uifigure.
    pub uifig: bool,
}

pub struct Interp<'a> {
    pub funcs: HashMap<String, Rc<Function>>,
    pub scopes: Vec<HashMap<String, Value>>,
    pub global_names: Vec<HashSet<String>>,
    pub globals: HashMap<String, Value>,
    pub out: String,
    pub figures: Vec<Figure>,
    pub current: usize,
    pub hold: bool,
    pub rng: crate::rng::Rng,
    pub steps: usize,
    pub cancel: &'a dyn Fn() -> bool,
    pub host: &'a dyn crate::Host,
    pub depth: usize,
    /// Value of `end` inside index brackets.
    end_stack: Vec<usize>,
    pub warnings: Vec<String>,
    pub last_error: String,
    /// Script files callable by name (they run in the caller's workspace).
    pub scripts: HashMap<String, Rc<Vec<Stmt>>>,
    /// clc was called: the command window is cleared.
    pub clc: bool,
    pub classdefs: HashMap<String, Rc<super::syntax::ClassDef>>,
    pub class_cache: HashMap<String, Rc<super::classes::ClassInfo>>,
    /// Constant properties and enumeration members, made once.
    pub constants: HashMap<String, Value>,
    pub enum_names: HashMap<usize, String>,
    /// set.Prop accessors running (inside one, obj.Prop = … sets the property itself).
    pub in_setter: Vec<String>,
    /// Graphics functions are handing a call to the ordinary plotting function.
    pub gfx_inner: bool,
    /// msgbox, errordlg … shown by the desktop after the command.
    pub dialogs: Vec<serde_json::Value>,
}

impl<'a> Interp<'a> {
    pub fn new(cancel: &'a dyn Fn() -> bool, host: &'a dyn crate::Host, seed: u64) -> Self {
        Interp {
            funcs: HashMap::new(),
            scopes: vec![HashMap::new()],
            global_names: vec![HashSet::new()],
            globals: HashMap::new(),
            out: String::new(),
            figures: Vec::new(),
            current: 0,
            hold: false,
            rng: crate::rng::Rng::new(seed),
            steps: 0,
            cancel,
            host,
            depth: 0,
            end_stack: Vec::new(),
            warnings: Vec::new(),
            last_error: String::new(),
            scripts: HashMap::new(),
            clc: false,
            classdefs: HashMap::new(),
            class_cache: HashMap::new(),
            constants: HashMap::new(),
            enum_names: HashMap::new(),
            in_setter: Vec::new(),
            gfx_inner: false,
            dialogs: Vec::new(),
        }
    }

    pub fn print(&mut self, s: &str) {
        if self.out.len() < 2_000_000 {
            self.out.push_str(s);
        }
    }

    pub fn get_var(&self, name: &str) -> Option<&Value> {
        if self.global_names.last().is_some_and(|g| g.contains(name)) {
            return self.globals.get(name);
        }
        self.scopes.last().and_then(|s| s.get(name))
    }

    pub fn set_var(&mut self, name: &str, v: Value) {
        if self.global_names.last().is_some_and(|g| g.contains(name)) {
            self.globals.insert(name.to_string(), v);
            return;
        }
        self.scopes.last_mut().unwrap().insert(name.to_string(), v);
    }

    pub fn workspace(&self) -> &HashMap<String, Value> {
        &self.scopes[0]
    }

    pub fn run(&mut self, prog: &Program) -> R<()> {
        for f in &prog.functions {
            self.funcs.insert(f.name.clone(), f.clone());
        }
        for c in &prog.classes {
            self.register_class(c.clone());
        }
        match self.block(&prog.body)? {
            Flow::Normal | Flow::Return => Ok(()),
            Flow::Break | Flow::Continue => Ok(()),
        }
    }

    fn tick(&mut self) -> R<()> {
        self.steps += 1;
        if self.steps % 4096 == 0 && (self.cancel)() {
            return Err("cancelled".into());
        }
        Ok(())
    }

    pub fn block(&mut self, stmts: &[Stmt]) -> R<Flow> {
        for s in stmts {
            match self.stmt(s)? {
                Flow::Normal => {}
                other => return Ok(other),
            }
        }
        Ok(Flow::Normal)
    }

    fn stmt(&mut self, s: &Stmt) -> R<Flow> {
        self.tick()?;
        match s {
            Stmt::Expr(e, print, line) => {
                let r: R<()> = (|| {
                    if let Expr::Ident(n) = e {
                        if let Some(v) = self.get_var(n).cloned() {
                            if *print {
                                let t = self.show(n, &v)?;
                                self.print(&t);
                            }
                            return Ok(());
                        }
                    }
                    let vals = self.eval_multi(e, if *print { 1 } else { 0 }, true)?;
                    if let Some(v) = vals.into_iter().next() {
                        if *print {
                            let t = self.show("ans", &v)?;
                            self.print(&t);
                        }
                        self.set_var("ans", v);
                    }
                    Ok(())
                })();
                r.map_err(|e| with_line(e, *line))?;
            }
            Stmt::Assign(targets, rhs, print, line) => {
                let r: R<()> = (|| {
                    let vals = if targets.len() == 1 {
                        vec![self.eval(rhs)?]
                    } else {
                        self.eval_multi(rhs, targets.len(), false)?
                    };
                    if vals.len() < targets.iter().filter(|t| t.is_some()).count().min(targets.len()) {
                        return Err("too many output arguments".into());
                    }
                    for (t, v) in targets.iter().zip(vals) {
                        if let Some(t) = t {
                            self.assign(t, v)?;
                            if *print {
                                let name = root_name(t);
                                if let Some(val) = self.get_var(&name).cloned() {
                                    let txt = self.show(&name, &val)?;
                                    self.print(&txt);
                                }
                            }
                        }
                    }
                    Ok(())
                })();
                r.map_err(|e| with_line(e, *line))?;
            }
            Stmt::If(arms, otherwise) => {
                for (cond, body) in arms {
                    if self.eval(cond)?.truthy()? {
                        return self.block(body);
                    }
                }
                return self.block(otherwise);
            }
            Stmt::For(var, range, body, line) => {
                let rv = self.eval(range).map_err(|e| with_line(e, *line))?;
                let (r, c) = rv.dims();
                let count = if r == 0 { 0 } else { c };
                for j in 0..count {
                    let item = match &rv {
                        Value::Num(a) => {
                            let col: Vec<usize> = (0..a.r).map(|i| j * a.r + i).collect();
                            let mut x = Arr::new(a.r, 1, col.iter().map(|&k| a.re[k]).collect());
                            x.im = a.im.as_ref().map(|im| col.iter().map(|&k| im[k]).collect());
                            x.logical = a.logical;
                            x.simplify();
                            Value::Num(x)
                        }
                        Value::Str(s) => Value::Str(s.chars().nth(j).map(|ch| ch.to_string()).unwrap_or_default()),
                        Value::Cell { r, items, .. } => Value::Cell { r: *r, c: 1, items: items[j * r..(j + 1) * r].to_vec() },
                        Value::Struct { r, fields, items, .. } => Value::Struct { r: *r, c: 1, fields: fields.clone(), items: items[j * r..(j + 1) * r].to_vec() },
                        Value::Func(_) | Value::Obj(_) => rv.clone(),
                    };
                    self.assign(var, item)?;
                    match self.block(body)? {
                        Flow::Break => break,
                        Flow::Return => return Ok(Flow::Return),
                        _ => {}
                    }
                }
            }
            Stmt::While(cond, body) => {
                while self.eval(cond)?.truthy()? {
                    self.tick()?;
                    match self.block(body)? {
                        Flow::Break => break,
                        Flow::Return => return Ok(Flow::Return),
                        _ => {}
                    }
                }
            }
            Stmt::Switch(subject, cases, otherwise) => {
                let v = self.eval(subject)?;
                for (case, body) in cases {
                    let cv = self.eval(case)?;
                    let options: Vec<Value> = match cv {
                        Value::Cell { items, .. } => items,
                        other => vec![other],
                    };
                    let hit = options.iter().any(|o| match (&v, o) {
                        (Value::Str(a), Value::Str(b)) => a == b,
                        (Value::Str(_), _) | (_, Value::Str(_)) => false,
                        (a, b) => a.scalar().ok() == b.scalar().ok() && a.scalar().is_ok(),
                    });
                    if hit {
                        return self.block(body);
                    }
                }
                return self.block(otherwise);
            }
            Stmt::Try(body, var, handler) => match self.block(body) {
                Ok(f) => return Ok(f),
                Err(e) if e != "cancelled" => {
                    self.last_error = e.clone();
                    if let Some(v) = var {
                        let (id, msg) = split_error(&e);
                        let st = Value::Struct { r: 1, c: 1, fields: vec!["message".into(), "identifier".into(), "stack".into()], items: vec![vec![Value::Str(msg), Value::Str(id), Value::empty()]] };
                        self.set_var(v, st);
                    }
                    return self.block(handler);
                }
                Err(e) => return Err(e),
            },
            Stmt::Break => return Ok(Flow::Break),
            Stmt::Continue => return Ok(Flow::Continue),
            Stmt::Return => return Ok(Flow::Return),
            Stmt::Global(names) => {
                for n in names {
                    self.global_names.last_mut().unwrap().insert(n.clone());
                    self.globals.entry(n.clone()).or_insert_with(Value::empty);
                }
            }
        }
        Ok(Flow::Normal)
    }

    // ───────────────────────── expressions

    pub fn eval(&mut self, e: &Expr) -> R<Value> {
        let mut v = self.eval_multi(e, 1, false)?;
        if v.is_empty() {
            return Err(match e {
                Expr::Index(_, _) | Expr::Ident(_) => "the function returned no value".into(),
                _ => "the expression gives no value (an empty comma-separated list)".into(),
            });
        }
        Ok(v.swap_remove(0))
    }

    /// Evaluates to a list: calls may return several outputs, c{:} and s.f several values.
    pub fn eval_multi(&mut self, e: &Expr, nargout: usize, statement: bool) -> R<Vec<Value>> {
        Ok(match e {
            Expr::Num(v) => vec![Value::num(*v)],
            Expr::Imag(v) => vec![Value::Num(Arr::complex(1, 1, vec![0.0], vec![*v]))],
            Expr::Str(s) => vec![Value::Str(s.clone())],
            Expr::Colon => vec![Value::Str(":".into())],
            Expr::End => vec![Value::num(*self.end_stack.last().ok_or("'end' outside an index")? as f64)],
            Expr::Ident(n) => match self.get_var(n) {
                Some(v) => vec![v.clone()],
                None => self.call_name(n, Vec::new(), nargout, statement)?,
            },
            Expr::Matrix(rows) => vec![self.matrix(rows)?],
            Expr::Cell(rows) => vec![self.cell_literal(rows)?],
            Expr::Range(a, step, b) => {
                let a = self.eval(a)?.scalar()?;
                let s = match step {
                    Some(s) => self.eval(s)?.scalar()?,
                    None => 1.0,
                };
                let b = self.eval(b)?.scalar()?;
                vec![Value::Num(range(a, s, b)?)]
            }
            Expr::Bin(Bin::AndAnd, a, b) => {
                let l = self.eval(a)?.truthy()?;
                vec![Value::boolean(l && self.eval(b)?.truthy()?)]
            }
            Expr::Bin(Bin::OrOr, a, b) => {
                let l = self.eval(a)?.truthy()?;
                vec![Value::boolean(l || self.eval(b)?.truthy()?)]
            }
            Expr::Bin(op, a, b) => {
                let l = self.eval(a)?;
                let r = self.eval(b)?;
                if let (Some(x), Some(y), Bin::Eq | Bin::Ne) = (super::graphics::refs(&l), super::graphics::refs(&r), op) {
                    let same = x.len() == y.len() || x.len() == 1 || y.len() == 1;
                    if !same {
                        return Err("sizes do not match".into());
                    }
                    let n = x.len().max(y.len());
                    let v: Vec<bool> = (0..n).map(|k| (x[if x.len() == 1 { 0 } else { k }] == y[if y.len() == 1 { 0 } else { k }]) == matches!(op, Bin::Eq)).collect();
                    return Ok(vec![Value::Num(Arr::boolean(1, n, v))]);
                }
                if super::classes::instance(&l).is_some() || super::classes::instance(&r).is_some() {
                    let method = match op {
                        Bin::Add => "plus",
                        Bin::Sub => "minus",
                        Bin::Mul => "mtimes",
                        Bin::EMul => "times",
                        Bin::Div => "mrdivide",
                        Bin::EDiv => "rdivide",
                        Bin::LDiv => "mldivide",
                        Bin::ELDiv => "ldivide",
                        Bin::Pow => "mpower",
                        Bin::EPow => "power",
                        Bin::Eq => "eq",
                        Bin::Ne => "ne",
                        Bin::Lt => "lt",
                        Bin::Le => "le",
                        Bin::Gt => "gt",
                        Bin::Ge => "ge",
                        Bin::And => "and",
                        Bin::Or => "or",
                        Bin::AndAnd | Bin::OrOr => "",
                    };
                    if let Some(v) = self.operator(method, &l, &r) {
                        return Ok(vec![v?]);
                    }
                    if matches!(op, Bin::Eq | Bin::Ne) {
                        // Handles compare by identity.
                        let same = super::classes::obj_key(&l) == super::classes::obj_key(&r) && super::classes::obj_key(&l) != 0;
                        return Ok(vec![Value::boolean(if *op == Bin::Eq { same } else { !same })]);
                    }
                    return Err(format!("Operator '{}' is not supported for operands of type '{}' (define a {method} method).", super::session::bin_symbol(*op), match (&l, &r) { (Value::Obj(o), _) | (_, Value::Obj(o)) => o.class.clone(), _ => String::new() }));
                }
                vec![binop(*op, &l, &r)?]
            }
            Expr::Neg(a) => {
                let v = self.eval(a)?;
                if super::classes::instance(&v).is_some() {
                    return Ok(vec![self.unary_operator("uminus", &v).ok_or("define a uminus method")??]);
                }
                if let Some(g) = super::lti::as_lti(&v) {
                    return Ok(vec![super::lti::wrap(g.neg())]);
                }
                vec![Value::Num(negate(&v.arr()?))]
            }
            Expr::Not(a) => {
                let v = self.eval(a)?;
                if super::classes::instance(&v).is_some() {
                    return Ok(vec![self.unary_operator("not", &v).ok_or("define a not method")??]);
                }
                let v = v.arr()?;
                let mut out = Arr::boolean(v.r, v.c, v.re.iter().map(|x| *x == 0.0).collect());
                out.nd = v.nd.clone();
                vec![Value::Num(out)]
            }
            Expr::Transpose(a, conj) => {
                let v = self.eval(a)?;
                if super::classes::instance(&v).is_some() {
                    if let Some(r) = self.unary_operator(if *conj { "ctranspose" } else { "transpose" }, &v) {
                        return Ok(vec![r?]);
                    }
                }
                vec![transpose_value(&v, *conj)?]
            }
            Expr::SuperCall(var, sup, args) => {
                let a = self.args(args, None)?;
                return self.super_call(var, sup, a, nargout);
            }
            Expr::Anon(params, body) => {
                // Capture the variables the body uses.
                let mut captured = HashMap::new();
                let mut names = Vec::new();
                free_names(body, &mut names);
                for n in names {
                    if !params.contains(&n) {
                        if let Some(v) = self.get_var(&n) {
                            captured.insert(n.clone(), v.clone());
                        }
                    }
                }
                vec![Value::Func(Func::Anon { params: params.clone(), body: body.clone(), captured: Rc::new(captured) })]
            }
            Expr::Handle(n) => vec![Value::Func(match self.funcs.get(n) {
                Some(f) => Func::User(f.clone()),
                None => Func::Named(n.clone()),
            })],
            Expr::Index(base, args) => {
                // A function call when the base names no variable.
                if let Expr::Ident(n) = base.as_ref() {
                    if self.get_var(n).is_none() {
                        let a = self.args(args, None)?;
                        return self.call_name(n, a, nargout, statement);
                    }
                }
                let bases = if let Expr::Field(inner, m) = base.as_ref() {
                    // ClassName.staticMethod(args) / ClassName.CONSTANT(i)
                    if let Expr::Ident(n) = inner.as_ref() {
                        if self.get_var(n).is_none() && self.is_class(n) {
                            let a = self.args(args, None)?;
                            return self.static_access(n, m, Some(a), nargout);
                        }
                    }
                    let obj = self.eval(inner)?;
                    if let Some(inst) = super::classes::instance(&obj) {
                        let is_prop = inst.info.prop_index(m).is_some() || inst.info.method(&format!("get.{m}")).is_some();
                        if !is_prop {
                            if let Some(method) = inst.info.method(m) {
                                // obj.method(args) is method(obj, args).
                                let mut a = vec![obj.clone()];
                                a.extend(self.args(args, None)?);
                                return self.call_user(&method, a, nargout);
                            }
                        }
                        self.obj_field(&obj, m)?
                    } else if let Some(rs) = super::graphics::refs(&obj) {
                        vec![self.gfx_field(rs, m)?]
                    } else {
                        field_values(&obj, m)?
                    }
                } else {
                    self.eval_multi(base, 1, false)?
                };
                let b = bases.into_iter().next().ok_or("indexing an empty list")?;
                if let Value::Func(f) = &b {
                    let a = self.args(args, None)?;
                    return self.call_func(&f.clone(), a, nargout);
                }
                let idx = self.args(args, Some(&b))?;
                vec![index_value(&b, &idx)?]
            }
            Expr::CellIndex(base, args) => {
                let b = self.eval(base)?;
                let idx = self.args(args, Some(&b))?;
                match b {
                    Value::Cell { .. } => {
                        let sub = index_value(&b, &idx)?;
                        match sub {
                            Value::Cell { items, .. } => items,
                            other => vec![other],
                        }
                    }
                    other => return Err(format!("brace indexing {{}} needs a cell array, not a {}", other.class())),
                }
            }
            Expr::Field(base, f) => {
                if let Expr::Ident(n) = base.as_ref() {
                    if self.get_var(n).is_none() && self.is_class(n) {
                        return self.static_access(n, f, None, nargout);
                    }
                }
                let b = self.eval(base)?;
                if super::classes::instance(&b).is_some() {
                    return self.obj_field(&b, f);
                }
                if let Some(rs) = super::graphics::refs(&b) {
                    return Ok(vec![self.gfx_field(rs, f)?]);
                }
                field_values(&b, f)?
            }
            Expr::DynField(base, f) => {
                let b = self.eval(base)?;
                let name = self.eval(f)?.text()?;
                field_values(&b, &name)?
            }
        })
    }

    /// One item of an argument list or matrix row: c{:} and s.f expand to all their values,
    /// a function call gives only its first output.
    fn eval_list(&mut self, e: &Expr) -> R<Vec<Value>> {
        match e {
            Expr::CellIndex(..) | Expr::Field(..) | Expr::DynField(..) => self.eval_multi(e, 1, false),
            _ => {
                let mut v = self.eval_multi(e, 1, false)?;
                v.truncate(1);
                Ok(v)
            }
        }
    }

    /// Evaluates call or index arguments, expanding comma-separated lists; `of` sets `end`.
    pub fn args(&mut self, args: &[Expr], of: Option<&Value>) -> R<Vec<Value>> {
        let mut out = Vec::with_capacity(args.len());
        let n = args.len();
        for (k, a) in args.iter().enumerate() {
            if let Some(v) = of {
                let d = v.full_dims();
                let end = if n == 1 { d.iter().product() } else { super::value::fold_dims(&d, n)[k] };
                self.end_stack.push(end);
            }
            let vals = self.eval_list(a);
            if of.is_some() {
                self.end_stack.pop();
            }
            out.extend(vals?);
        }
        Ok(out)
    }

    fn matrix(&mut self, rows: &[Vec<Expr>]) -> R<Value> {
        let mut row_vals: Vec<Value> = Vec::new();
        for row in rows {
            let mut items = Vec::new();
            for e in row {
                items.extend(self.eval_list(e)?);
            }
            row_vals.push(concat(&items, true)?);
        }
        if row_vals.is_empty() {
            return Ok(Value::empty());
        }
        concat(&row_vals, false)
    }

    fn cell_literal(&mut self, rows: &[Vec<Expr>]) -> R<Value> {
        let mut grid: Vec<Vec<Value>> = Vec::new();
        for row in rows {
            let mut items = Vec::new();
            for e in row {
                for v in self.eval_list(e)? {
                    // A cell inside {} concatenates (as MATLAB) only when written [c1, c2]; here it nests.
                    items.push(v);
                }
            }
            grid.push(items);
        }
        if grid.is_empty() {
            return Ok(Value::Cell { r: 0, c: 0, items: Vec::new() });
        }
        let c = grid[0].len();
        if grid.iter().any(|r| r.len() != c) {
            return Err("the rows of a cell literal have different lengths".into());
        }
        let r = grid.len();
        let mut items = Vec::with_capacity(r * c);
        for j in 0..c {
            for row in &grid {
                items.push(row[j].clone());
            }
        }
        Ok(Value::Cell { r, c, items })
    }

    // ───────────────────────── calls

    pub fn call_name(&mut self, name: &str, args: Vec<Value>, nargout: usize, statement: bool) -> R<Vec<Value>> {
        // A method of an object argument comes first, then a class constructor (as in MATLAB).
        if let Some(m) = self.object_method(name, &args) {
            return self.call_user(&m, args, nargout);
        }
        if self.is_class(name) {
            return Ok(vec![self.construct(name, args)?]);
        }
        if let Some(r) = self.class_builtin(name, &args, nargout) {
            return r;
        }
        if let Some(f) = self.funcs.get(name).cloned() {
            return self.call_user(&f, args, nargout);
        }
        if let Some(body) = self.scripts.get(name).cloned() {
            if !args.is_empty() {
                return Err(format!("{name} is a script: it takes no arguments"));
            }
            self.depth += 1;
            if self.depth > 64 {
                self.depth -= 1;
                return Err("scripts call each other too deep".into());
            }
            let r = self.block(&body);
            self.depth -= 1;
            r.map_err(|e| if e == "cancelled" { e } else { format!("in {name}: {e}") })?;
            return Ok(Vec::new());
        }
        match super::builtins::call(self, name, args, nargout, statement) {
            Some(r) => r,
            None => Err(format!("Unrecognized function or variable '{name}'.")),
        }
    }

    /// h.Prop on graphics handles (several handles give a cell of values).
    fn gfx_field(&mut self, rs: &[super::graphics::GRef], name: &str) -> R<Value> {
        if rs.len() == 1 {
            return super::graphics::get_prop(self, &rs[0], name);
        }
        let items: Vec<Value> = rs.iter().map(|r| super::graphics::get_prop(self, r, name)).collect::<R<_>>()?;
        Ok(Value::Cell { r: items.len(), c: 1, items })
    }

    pub fn call_func(&mut self, f: &Func, args: Vec<Value>, nargout: usize) -> R<Vec<Value>> {
        match f {
            Func::Named(n) => self.call_name(n, args, nargout, false),
            Func::User(u) => self.call_user(u, args, nargout),
            Func::Anon { params, body, captured } => {
                if args.len() > params.len() && !params.iter().any(|p| p == "varargin") {
                    return Err(format!("too many input arguments ({} for {})", args.len(), params.len()));
                }
                self.depth += 1;
                if self.depth > 256 {
                    self.depth -= 1;
                    return Err("recursion is too deep (256 levels)".into());
                }
                let mut scope: HashMap<String, Value> = (**captured).clone();
                let mut args = args.into_iter();
                for p in params.iter() {
                    if p == "varargin" {
                        let rest: Vec<Value> = args.by_ref().collect();
                        scope.insert(p.clone(), Value::Cell { r: 1, c: rest.len(), items: rest });
                        break;
                    }
                    if let Some(a) = args.next() {
                        scope.insert(p.clone(), a);
                    }
                }
                self.scopes.push(scope);
                self.global_names.push(HashSet::new());
                let r = self.eval_multi(body, nargout.max(1), false);
                self.scopes.pop();
                self.global_names.pop();
                self.depth -= 1;
                r
            }
        }
    }

    pub fn call_user(&mut self, f: &Rc<Function>, args: Vec<Value>, nargout: usize) -> R<Vec<Value>> {
        self.call_user_preset(f, args, nargout, None)
    }

    /// A user function; `preset` gives an output variable its starting value (a constructor's object).
    pub fn call_user_preset(&mut self, f: &Rc<Function>, args: Vec<Value>, nargout: usize, preset: Option<(String, Value)>) -> R<Vec<Value>> {
        let varargin = f.params.last().is_some_and(|p| p == "varargin");
        let fixed = if varargin { f.params.len() - 1 } else { f.params.len() };
        if args.len() > fixed && !varargin {
            return Err(format!("{}: too many input arguments ({} for {})", f.name, args.len(), fixed));
        }
        self.depth += 1;
        if self.depth > 256 {
            self.depth -= 1;
            return Err("recursion is too deep (256 levels)".into());
        }
        let mut scope = HashMap::new();
        if let Some((k, v)) = preset {
            scope.insert(k, v);
        }
        let nargin = args.len();
        let mut it = args.into_iter();
        for p in f.params.iter().take(fixed) {
            if let Some(a) = it.next() {
                if p != "~" {
                    scope.insert(p.clone(), a);
                }
            }
        }
        if varargin {
            let rest: Vec<Value> = it.collect();
            scope.insert("varargin".into(), Value::Cell { r: 1, c: rest.len(), items: rest });
        }
        scope.insert("nargin".into(), Value::num(nargin as f64));
        scope.insert("nargout".into(), Value::num(nargout as f64));
        self.scopes.push(scope);
        self.global_names.push(HashSet::new());
        let r = self.block(&f.body);
        let scope = self.scopes.pop().unwrap();
        self.global_names.pop();
        self.depth -= 1;
        r.map_err(|e| if e.starts_with("cancelled") { e } else { format!("in {}: {e}", f.name) })?;
        let mut outs = Vec::new();
        let varargout = f.outputs.last().is_some_and(|o| o == "varargout");
        let fixed_out = if varargout { f.outputs.len() - 1 } else { f.outputs.len() };
        for (k, o) in f.outputs.iter().take(fixed_out).enumerate() {
            match scope.get(o) {
                Some(v) => outs.push(v.clone()),
                None => {
                    if k < nargout.max(1) && (k > 0 || nargout > 0) {
                        return Err(format!("{}: the output \"{o}\" was never assigned", f.name));
                    }
                    break;
                }
            }
        }
        if varargout {
            if let Some(Value::Cell { items, .. }) = scope.get("varargout") {
                outs.extend(items.iter().cloned());
            }
        }
        Ok(outs)
    }

    // ───────────────────────── assignment

    pub fn assign(&mut self, target: &Expr, rhs: Value) -> R<()> {
        let mut path = Vec::new();
        let mut e = target;
        loop {
            match e {
                Expr::Ident(_) => break,
                Expr::Index(b, a) => {
                    path.push(Access::Paren(a.clone()));
                    e = b;
                }
                Expr::CellIndex(b, a) => {
                    path.push(Access::Brace(a.clone()));
                    e = b;
                }
                Expr::Field(b, f) => {
                    path.push(Access::Field(f.clone()));
                    e = b;
                }
                Expr::DynField(b, f) => {
                    let name = self.eval(f)?.text()?;
                    path.push(Access::Field(name));
                    e = b;
                }
                _ => return Err("this cannot be assigned".into()),
            }
        }
        path.reverse();
        let name = root_name(target);
        let cur = self.get_var(&name).cloned();
        let new = self.assign_path(cur, &path, rhs)?;
        self.set_var(&name, new);
        Ok(())
    }

    fn assign_path(&mut self, cur: Option<Value>, path: &[Access], rhs: Value) -> R<Value> {
        let Some(first) = path.first() else { return Ok(rhs) };
        let rest = &path[1..];
        match first {
            Access::Paren(args) => {
                let base = cur.clone().unwrap_or_else(|| match (&rhs, rest.first()) {
                    (_, Some(Access::Field(_))) => Value::Struct { r: 0, c: 0, fields: Vec::new(), items: Vec::new() },
                    (Value::Cell { .. }, _) => Value::Cell { r: 0, c: 0, items: Vec::new() },
                    (Value::Struct { fields, .. }, _) => Value::Struct { r: 0, c: 0, fields: fields.clone(), items: Vec::new() },
                    (Value::Str(_), _) => Value::Str(String::new()),
                    _ => Value::empty(),
                });
                let idx = self.args(args, Some(&base))?;
                if rest.is_empty() {
                    return assign_index(base, &idx, rhs);
                }
                // s(2).f = v: work on the selected element.
                let elem = index_value(&base, &idx).ok().filter(|v| !v.is_empty());
                let new_elem = self.assign_path(elem, rest, rhs)?;
                assign_index(base, &idx, new_elem)
            }
            Access::Brace(args) => {
                let base = match cur {
                    Some(v @ Value::Cell { .. }) => v,
                    Some(v) if v.is_empty() => Value::Cell { r: 0, c: 0, items: Vec::new() },
                    None => Value::Cell { r: 0, c: 0, items: Vec::new() },
                    Some(other) => return Err(format!("brace assignment {{}} needs a cell array, not a {}", other.class())),
                };
                let idx = self.args(args, Some(&base))?;
                let inner = if rest.is_empty() {
                    rhs
                } else {
                    let old = index_value(&base, &idx).ok().and_then(|v| match v {
                        Value::Cell { items, .. } if items.len() == 1 => Some(items[0].clone()),
                        _ => None,
                    });
                    self.assign_path(old, rest, rhs)?
                };
                assign_index(base, &idx, Value::Cell { r: 1, c: 1, items: vec![inner] })
            }
            Access::Field(name) => {
                if let Some(obj) = cur.as_ref().filter(|v| super::graphics::is_gfx(v)).cloned() {
                    let rs = super::graphics::refs(&obj).unwrap().clone();
                    let old = rs.first().and_then(|r| super::graphics::get_prop(self, r, name).ok());
                    let new = self.assign_path(old, rest, rhs)?;
                    for r in &rs {
                        super::graphics::set_prop(self, r, name, new.clone())?;
                    }
                    return Ok(obj);
                }
                if let Some(obj) = cur.as_ref().filter(|v| super::classes::instance(v).is_some()).cloned() {
                    let inst = super::classes::instance(&obj).unwrap();
                    let old = inst.info.prop_index(name).map(|k| inst.props.borrow()[k].clone()).filter(|v| !(v.is_empty() && matches!(v, Value::Num(_))));
                    let new = self.assign_path(old, rest, rhs)?;
                    return self.set_obj_field(obj, name, new);
                }
                let (r, c, mut fields, mut items) = match cur {
                    Some(Value::Struct { r, c, fields, items }) => (r, c, fields, items),
                    Some(v) if v.is_empty() => (1, 1, Vec::new(), vec![Vec::new()]),
                    None => (1, 1, Vec::new(), vec![Vec::new()]),
                    Some(other) => return Err(format!("field assignment needs a structure, not a {}", other.class())),
                };
                let (r, c) = if items.is_empty() { (1, 1) } else { (r, c) };
                if items.is_empty() {
                    items.push(vec![Value::empty(); fields.len()]);
                }
                if items.len() != 1 {
                    return Err(format!("s.{name} = … needs a single structure; index the element first: s(k).{name}"));
                }
                let k = match fields.iter().position(|f| f == name) {
                    Some(k) => k,
                    None => {
                        fields.push(name.clone());
                        for it in items.iter_mut() {
                            it.push(Value::empty());
                        }
                        fields.len() - 1
                    }
                };
                let old = items[0].get(k).cloned().filter(|v| !(v.is_empty() && matches!(v, Value::Num(_))));
                let new = self.assign_path(old, rest, rhs)?;
                items[0][k] = new;
                Ok(Value::Struct { r, c, fields, items })
            }
        }
    }
}

#[derive(Clone, Debug)]
enum Access {
    Paren(Vec<Expr>),
    Brace(Vec<Expr>),
    Field(String),
}

fn root_name(e: &Expr) -> String {
    match e {
        Expr::Ident(n) => n.clone(),
        Expr::Index(b, _) | Expr::CellIndex(b, _) | Expr::Field(b, _) | Expr::DynField(b, _) => root_name(b),
        _ => String::new(),
    }
}

fn with_line(e: String, line: usize) -> String {
    if e.starts_with("line ") || e == "cancelled" {
        e
    } else {
        format!("line {line}: {e}")
    }
}

/// "id:part: message" → (identifier, message).
pub fn split_error(e: &str) -> (String, String) {
    let body = e.trim_start_matches(|c: char| c != ':' && !c.is_whitespace()).to_string();
    let _ = body;
    // Strip "line N: " prefixes.
    let mut msg = e.to_string();
    while let Some(rest) = msg.strip_prefix("line ") {
        match rest.split_once(": ") {
            Some((_, m)) => msg = m.to_string(),
            None => break,
        }
    }
    if let Some((id, m)) = msg.split_once('\u{1}') {
        return (id.to_string(), m.to_string());
    }
    (String::new(), msg)
}

fn free_names(e: &Expr, out: &mut Vec<String>) {
    match e {
        Expr::Ident(n) => out.push(n.clone()),
        Expr::Matrix(rows) | Expr::Cell(rows) => rows.iter().flatten().for_each(|x| free_names(x, out)),
        Expr::Range(a, s, b) => {
            free_names(a, out);
            if let Some(s) = s {
                free_names(s, out);
            }
            free_names(b, out);
        }
        Expr::Bin(_, a, b) => {
            free_names(a, out);
            free_names(b, out);
        }
        Expr::Neg(a) | Expr::Not(a) | Expr::Transpose(a, _) => free_names(a, out),
        Expr::Index(b, a) | Expr::CellIndex(b, a) => {
            free_names(b, out);
            a.iter().for_each(|x| free_names(x, out));
        }
        Expr::Field(b, _) => free_names(b, out),
        Expr::DynField(b, f) => {
            free_names(b, out);
            free_names(f, out);
        }
        Expr::Anon(_, body) => free_names(body, out),
        Expr::SuperCall(v, _, a) => {
            out.push(v.clone());
            a.iter().for_each(|x| free_names(x, out));
        }
        _ => {}
    }
}

pub fn range(a: f64, s: f64, b: f64) -> R<Arr> {
    if s == 0.0 || (s > 0.0 && a > b) || (s < 0.0 && a < b) || !a.is_finite() || !b.is_finite() {
        return Ok(Arr::zeros(1, 0));
    }
    let n = ((b - a) / s + 1e-10).floor() as usize + 1;
    if n > 50_000_000 {
        return Err(format!("the range {a}:{s}:{b} has too many elements"));
    }
    Ok(Arr::row((0..n).map(|k| a + k as f64 * s).collect()))
}

pub fn binop(op: Bin, l: &Value, r: &Value) -> R<Value> {
    if let Some(v) = super::lti::binop(op, l, r) {
        return v;
    }
    // String comparisons element-wise by character codes work through arr().
    let a = l.arr()?;
    let b = r.arr()?;
    Ok(Value::Num(binary(op, &a, &b)?))
}

pub fn transpose_value(v: &Value, conj: bool) -> R<Value> {
    Ok(match v {
        Value::Num(a) if !a.nd.is_empty() => return Err("transpose is not defined for N-D arrays; use permute".into()),
        Value::Num(a) => Value::Num(a.transpose(conj)),
        Value::Str(s) => {
            // A column of characters: as numbers (char arrays with several rows are not kept).
            Value::Num(Arr::col(s.chars().map(|c| c as u32 as f64).collect()))
        }
        Value::Cell { r, c, items } => {
            let mut out = Vec::with_capacity(items.len());
            for i in 0..*r {
                for j in 0..*c {
                    out.push(items[j * r + i].clone());
                }
            }
            Value::Cell { r: *c, c: *r, items: out }
        }
        Value::Struct { r, c, fields, items } => {
            let mut out = Vec::with_capacity(items.len());
            for i in 0..*r {
                for j in 0..*c {
                    out.push(items[j * r + i].clone());
                }
            }
            Value::Struct { r: *c, c: *r, fields: fields.clone(), items: out }
        }
        Value::Func(_) | Value::Obj(_) => v.clone(),
    })
}

fn field_values(b: &Value, f: &str) -> R<Vec<Value>> {
    match b {
        Value::Struct { fields, items, .. } => {
            let k = fields.iter().position(|x| x == f).ok_or_else(|| format!("reference to non-existent field '{f}'"))?;
            Ok(items.iter().map(|it| it[k].clone()).collect())
        }
        other => Err(format!("dot indexing .{f} needs a structure, not a {}", other.class())),
    }
}

// ───────────────────────── concatenation

/// Horizontal (row = true) or vertical concatenation.
pub fn concat(items: &[Value], row: bool) -> R<Value> {
    let items: Vec<&Value> = items.iter().filter(|v| !(v.is_empty() && matches!(v, Value::Num(_)))).collect();
    if items.is_empty() {
        return Ok(Value::empty());
    }
    if items.len() == 1 {
        return Ok(items[0].clone());
    }
    if items.iter().all(|v| super::graphics::is_gfx(v)) {
        let class = match items[0] { Value::Obj(o) => o.class.clone(), _ => String::new() };
        return Ok(super::graphics::make_handle(class, items.iter().flat_map(|v| super::graphics::refs(v).unwrap().clone()).collect()));
    }
    // Strings join as strings; cells join as cells; structures as struct arrays.
    if items.iter().all(|v| matches!(v, Value::Str(_))) && row {
        return Ok(Value::Str(items.iter().map(|v| if let Value::Str(s) = v { s.as_str() } else { "" }).collect()));
    }
    if items.iter().any(|v| matches!(v, Value::Cell { .. })) {
        let cells: Vec<(usize, usize, Vec<Value>)> = items.iter().map(|v| match v {
            Value::Cell { r, c, items } => (*r, *c, items.clone()),
            other => (1, 1, vec![(*other).clone()]),
        }).collect();
        return join_generic(cells, row, |r, c, items| Value::Cell { r, c, items });
    }
    if items.iter().all(|v| matches!(v, Value::Struct { .. })) {
        let fields = if let Value::Struct { fields, .. } = items[0] { fields.clone() } else { unreachable!() };
        let parts: Vec<(usize, usize, Vec<Vec<Value>>)> = items.iter().map(|v| match v {
            Value::Struct { r, c, fields: f2, items } => {
                if *f2 == fields {
                    Ok((*r, *c, items.clone()))
                } else {
                    // Reorder to the first's field order.
                    let mut out = Vec::new();
                    for it in items {
                        let mut row = Vec::new();
                        for f in &fields {
                            let k = f2.iter().position(|x| x == f).ok_or("structures with different fields cannot be joined")?;
                            row.push(it[k].clone());
                        }
                        out.push(row);
                    }
                    Ok((*r, *c, out))
                }
            }
            _ => unreachable!(),
        }).collect::<R<_>>()?;
        return join_generic(parts, row, |r, c, items| Value::Struct { r, c, fields: fields.clone(), items });
    }
    let any_str = items.iter().any(|v| matches!(v, Value::Str(_)));
    let arrs: Vec<Arr> = items.iter().map(|v| v.arr()).collect::<R<_>>()?;
    let complex = arrs.iter().any(|a| a.is_complex());
    let logical = arrs.iter().all(|a| a.logical);
    let parts: Vec<(usize, usize, Vec<(f64, f64)>)> = arrs.iter().map(|a| (a.r, a.c, (0..a.len()).map(|k| (a.re[k], a.im.as_ref().map_or(0.0, |im| im[k]))).collect())).collect();
    let joined = join_generic(parts, row, |r, c, items| {
        let re = items.iter().map(|p| p.0).collect();
        let mut a = Arr::new(r, c, re);
        if complex {
            a.im = Some(items.iter().map(|p| p.1).collect());
        }
        a.logical = logical;
        Value::Num(a)
    })?;
    if any_str && row {
        if let Value::Num(a) = &joined {
            if a.r == 1 {
                return Ok(Value::Str(a.re.iter().map(|v| char::from_u32(*v as u32).unwrap_or('?')).collect()));
            }
        }
    }
    Ok(joined)
}

fn join_generic<T: Clone>(parts: Vec<(usize, usize, Vec<T>)>, row: bool, make: impl Fn(usize, usize, Vec<T>) -> Value) -> R<Value> {
    if row {
        let r = parts[0].0;
        if parts.iter().any(|p| p.0 != r) {
            return Err(format!("horizontal concatenation needs the same number of rows ({})", parts.iter().map(|p| p.0.to_string()).collect::<Vec<_>>().join(", ")));
        }
        let c: usize = parts.iter().map(|p| p.1).sum();
        let items: Vec<T> = parts.into_iter().flat_map(|p| p.2).collect();
        Ok(make(r, c, items))
    } else {
        let c = parts[0].1;
        if parts.iter().any(|p| p.1 != c) {
            return Err(format!("vertical concatenation needs the same number of columns ({})", parts.iter().map(|p| p.1.to_string()).collect::<Vec<_>>().join(", ")));
        }
        let r: usize = parts.iter().map(|p| p.0).sum();
        let mut items = Vec::with_capacity(r * c);
        for j in 0..c {
            for p in &parts {
                for i in 0..p.0 {
                    items.push(p.2[j * p.0 + i].clone());
                }
            }
        }
        Ok(make(r, c, items))
    }
}

// ───────────────────────── indexing

/// Resolved positions of one index argument for an extent.
fn positions(v: &Value, extent: usize) -> R<Vec<usize>> {
    if let Value::Str(s) = v {
        if s == ":" {
            return Ok((0..extent).collect());
        }
    }
    let a = v.arr()?;
    if a.logical {
        if a.len() > extent && a.re[extent..].iter().any(|x| *x != 0.0) {
            return Err(format!("the logical index has true values beyond the {extent} elements"));
        }
        return Ok(a.re.iter().enumerate().filter(|(_, x)| **x != 0.0).map(|(k, _)| k).collect());
    }
    a.re.iter()
        .map(|x| {
            if *x >= 1.0 && x.fract() == 0.0 && x.is_finite() {
                Ok(*x as usize - 1)
            } else {
                Err(format!("array indices must be positive whole numbers (got {})", format_num(*x)))
            }
        })
        .collect()
}

fn is_colon(v: &Value) -> bool {
    matches!(v, Value::Str(s) if s == ":")
}

/// The element positions and the result shape of A(idx…).
fn selection(r: usize, c: usize, idx: &[Value]) -> R<(Vec<usize>, usize, usize)> {
    let n = r * c;
    match idx.len() {
        0 => Ok(((0..n).collect(), r, c)),
        1 => {
            let p = positions(&idx[0], n)?;
            if let Some(&bad) = p.iter().find(|&&k| k >= n) {
                return Err(format!("index {} exceeds the number of elements ({n})", bad + 1));
            }
            let k = p.len();
            let (ir, ic) = idx[0].dims();
            let shape = if is_colon(&idx[0]) {
                (n, 1)
            } else if matches!(&idx[0], Value::Num(a) if a.logical) {
                if r == 1 { (1, k) } else { (k, 1) }
            } else if r == 1 && (ir == 1 || ic == 1) {
                (1, k)
            } else if c == 1 && (ir == 1 || ic == 1) {
                (k, 1)
            } else {
                (ir, ic)
            };
            Ok((p, shape.0, shape.1))
        }
        _ => {
            for extra in &idx[2..] {
                let p = positions(extra, 1)?;
                if p.iter().any(|&k| k != 0) {
                    return Err("only two dimensions are supported".into());
                }
            }
            let rows = positions(&idx[0], r)?;
            let cols = positions(&idx[1], c)?;
            if let Some(&bad) = rows.iter().find(|&&k| k >= r) {
                return Err(format!("row index {} exceeds the {r} rows", bad + 1));
            }
            if let Some(&bad) = cols.iter().find(|&&k| k >= c) {
                return Err(format!("column index {} exceeds the {c} columns", bad + 1));
            }
            let mut p = Vec::with_capacity(rows.len() * cols.len());
            for &j in &cols {
                for &i in &rows {
                    p.push(j * r + i);
                }
            }
            Ok((p, rows.len(), cols.len()))
        }
    }
}

/// Positions and result dimensions of A(i, j, k, …) with three or more subscripts.
fn nd_select(d: &[usize], idx: &[Value]) -> R<(Vec<usize>, Vec<usize>)> {
    let e = super::value::fold_dims(d, idx.len());
    let mut subs = Vec::with_capacity(idx.len());
    for (k, v) in idx.iter().enumerate() {
        let p = positions(v, e[k])?;
        if let Some(&bad) = p.iter().find(|&&q| q >= e[k]) {
            return Err(format!("index {} in position {} exceeds the dimension ({})", bad + 1, k + 1, e[k]));
        }
        subs.push(p);
    }
    let shape: Vec<usize> = subs.iter().map(|s| s.len()).collect();
    Ok((super::value::nd_positions(&e, &subs), shape))
}

/// A(i, j, k, …) = rhs on numeric arrays, growing along any dimension.
fn nd_assign(a: Arr, idx: &[Value], b: Arr) -> R<Value> {
    let n = idx.len();
    let full = a.dims();
    let old = super::value::fold_dims(&full, n);
    let bd = b.dims();
    let mut subs = Vec::with_capacity(n);
    for (k, v) in idx.iter().enumerate() {
        subs.push(if is_colon(v) && old[k] == 0 { (0..*bd.get(k).unwrap_or(&1)).collect() } else { positions(v, old[k])? });
    }
    let new: Vec<usize> = (0..n).map(|k| old[k].max(subs[k].iter().copied().max().map_or(0, |m| m + 1))).collect();
    let grows = new != old;
    if grows && full.len() > n && a.len() > 0 {
        return Err(format!("cannot grow a {}-D array with {n} subscripts", full.len()));
    }
    let complex = a.is_complex() || b.is_complex();
    let total: usize = new.iter().product();
    let (mut re, mut im) = (a.re.clone(), if complex { Some(a.im.clone().unwrap_or_else(|| vec![0.0; a.len()])) } else { None });
    if grows {
        // Every old element moves to the same subscripts in the larger array.
        let all: Vec<Vec<usize>> = old.iter().map(|&m| (0..m).collect()).collect();
        let dest = super::value::nd_positions(&new, &all);
        let mut nre = vec![0.0; total];
        let mut nim = im.as_ref().map(|_| vec![0.0; total]);
        for (q, &p) in dest.iter().enumerate() {
            nre[p] = re[q];
            if let (Some(t), Some(s)) = (nim.as_mut(), im.as_ref()) {
                t[p] = s[q];
            }
        }
        re = nre;
        im = nim;
    }
    let targets = super::value::nd_positions(&new, &subs);
    let rn = b.len();
    if rn != 1 && rn != targets.len() {
        return Err(format!("cannot assign {rn} elements to {} positions", targets.len()));
    }
    for (k, &q) in targets.iter().enumerate() {
        let s = if rn == 1 { 0 } else { k };
        re[q] = b.re[s];
        if let Some(t) = im.as_mut() {
            t[q] = b.im.as_ref().map_or(0.0, |v| v[s]);
        }
    }
    let mut out = Arr::with_dims(re, if grows { &new } else if full.len() > n { &full } else { &new });
    out.im = im;
    out.logical = a.logical && b.logical || (a.is_empty() && b.logical);
    out.simplify();
    Ok(Value::Num(out))
}

/// A(:, :, k) = [] with three or more subscripts: one subscript selects what goes.
fn nd_delete(a: Arr, idx: &[Value]) -> R<Value> {
    let e = super::value::fold_dims(&a.dims(), idx.len());
    let mut subs: Vec<Vec<usize>> = Vec::with_capacity(idx.len());
    let mut cut = None;
    for (k, v) in idx.iter().enumerate() {
        let p = positions(v, e[k])?;
        let del: HashSet<usize> = p.into_iter().collect();
        if is_colon(v) || (0..e[k]).all(|q| del.contains(&q)) {
            subs.push((0..e[k]).collect());
        } else {
            if cut.is_some() {
                return Err("deletion needs every subscript but one to be ':'".into());
            }
            cut = Some(k);
            subs.push((0..e[k]).filter(|q| !del.contains(q)).collect());
        }
    }
    if cut.is_none() {
        return Ok(Value::Num(Arr::zeros(0, 0)));
    }
    let keep = super::value::nd_positions(&e, &subs);
    let shape: Vec<usize> = subs.iter().map(|s| s.len()).collect();
    let mut out = Arr::with_dims(keep.iter().map(|&k| a.re[k]).collect(), &shape);
    out.im = a.im.as_ref().map(|im| keep.iter().map(|&k| im[k]).collect());
    out.logical = a.logical;
    Ok(Value::Num(out))
}

pub fn index_value(b: &Value, idx: &[Value]) -> R<Value> {
    if let (Some(rs), Value::Obj(o)) = (super::graphics::refs(b), b) {
        let (p, _, _) = selection(1, rs.len(), idx)?;
        return Ok(super::graphics::make_handle(o.class.clone(), p.into_iter().map(|k| rs[k].clone()).collect()));
    }
    if let Value::Num(a) = b {
        if idx.is_empty() {
            return Ok(b.clone());
        }
        if idx.len() >= 3 {
            let (p, shape) = nd_select(&a.dims(), idx)?;
            let mut out = Arr::with_dims(p.iter().map(|&k| a.re[k]).collect(), &shape);
            out.im = a.im.as_ref().map(|im| p.iter().map(|&k| im[k]).collect());
            out.logical = a.logical;
            out.simplify();
            return Ok(Value::Num(out));
        }
    }
    let (r, c) = b.dims();
    let (p, rr, cc) = selection(r, c, idx)?;
    Ok(match b {
        Value::Num(a) => {
            let mut out = Arr::new(rr, cc, p.iter().map(|&k| a.re[k]).collect());
            out.im = a.im.as_ref().map(|im| p.iter().map(|&k| im[k]).collect());
            out.logical = a.logical;
            out.simplify();
            Value::Num(out)
        }
        Value::Str(s) => {
            let chars: Vec<char> = s.chars().collect();
            Value::Str(p.iter().map(|&k| chars[k]).collect())
        }
        Value::Cell { items, .. } => Value::Cell { r: rr, c: cc, items: p.iter().map(|&k| items[k].clone()).collect() },
        Value::Struct { fields, items, .. } => Value::Struct { r: rr, c: cc, fields: fields.clone(), items: p.iter().map(|&k| items[k].clone()).collect() },
        Value::Func(_) => return Err("a function handle cannot be indexed".into()),
        Value::Obj(o) => return Err(format!("a {} object cannot be indexed with ( )", o.class)),
    })
}

/// A(idx…) = rhs with growth (zero / empty fill) and deletion (rhs = []).
pub fn assign_index(base: Value, idx: &[Value], rhs: Value) -> R<Value> {
    let deleting = matches!(&rhs, Value::Num(a) if a.r == 0 && a.c == 0) && !matches!(base, Value::Cell { .. } if false);
    let (r, c) = base.dims();
    if idx.len() >= 3 {
        if let Value::Num(a) = &base {
            if deleting {
                return nd_delete(a.clone(), idx);
            }
            if matches!(rhs, Value::Num(_) | Value::Str(_)) {
                return nd_assign(a.clone(), idx, rhs.arr()?);
            }
        }
    }
    if deleting && !matches!(base, Value::Struct { .. }) || (deleting && matches!(base, Value::Struct { .. })) {
        return delete(base, idx);
    }
    // Target positions, growing the array as needed.
    let (mut nr, mut nc) = (r, c);
    let targets: Vec<(usize, usize)>; // (row, col)
    let out_shape: (usize, usize);
    match idx.len() {
        1 => {
            let n = r * c;
            let p = positions(&idx[0], n)?;
            let max = p.iter().copied().max().map_or(0, |m| m + 1);
            if max > n {
                if r <= 1 {
                    nr = 1;
                    nc = max;
                } else if c == 1 {
                    nr = max;
                } else {
                    return Err(format!("cannot grow a {r}×{c} matrix with a linear index; use A(i, j)"));
                }
            }
            let rr = nr.max(1);
            targets = p.iter().map(|&k| (k % rr, k / rr)).collect();
            out_shape = (p.len(), 1);
        }
        _ => {
            let rows = if is_colon(&idx[0]) && r == 0 { (0..rhs.dims().0.max(1)).collect() } else { positions(&idx[0], r)? };
            let cols = if is_colon(&idx[1]) && c == 0 { (0..rhs.dims().1.max(1)).collect() } else { positions(&idx[1], c)? };
            nr = nr.max(rows.iter().copied().max().map_or(0, |m| m + 1));
            nc = nc.max(cols.iter().copied().max().map_or(0, |m| m + 1));
            let mut t = Vec::with_capacity(rows.len() * cols.len());
            for &j in &cols {
                for &i in &rows {
                    t.push((i, j));
                }
            }
            targets = t;
            out_shape = (rows.len(), cols.len());
        }
    }
    let count = targets.len();
    let rn = rhs.numel();
    if rn != 1 && rn != count {
        return Err(format!("cannot assign {} elements to {count} positions ({}×{} vs {}×{})", rn, rhs.dims().0, rhs.dims().1, out_shape.0, out_shape.1));
    }
    let pick = |k: usize| if rn == 1 { 0 } else { k };
    // Re-layout to the grown size.
    fn regrow<T: Clone>(data: Vec<T>, r: usize, c: usize, nr: usize, nc: usize, fill: T) -> Vec<T> {
        if r == nr && c == nc {
            return data;
        }
        let mut out = vec![fill; nr * nc];
        for j in 0..c {
            for i in 0..r {
                out[j * nr + i] = data[j * r + i].clone();
            }
        }
        out
    }
    Ok(match (base, rhs) {
        (Value::Cell { items, .. }, Value::Cell { items: src, .. }) => {
            let mut items = regrow(items, r, c, nr, nc, Value::empty());
            for (k, (i, j)) in targets.iter().enumerate() {
                items[j * nr + i] = src[pick(k)].clone();
            }
            Value::Cell { r: nr, c: nc, items }
        }
        (Value::Cell { .. }, other) => return Err(format!("use braces to put a {} into a cell: c{{i}} = …", other.class())),
        (Value::Struct { fields, items, .. }, Value::Struct { fields: f2, items: src, .. }) => {
            // Merge field lists.
            let mut fields = fields;
            let mut items = items;
            for f in &f2 {
                if !fields.contains(f) {
                    fields.push(f.clone());
                    for it in items.iter_mut() {
                        it.push(Value::empty());
                    }
                }
            }
            let mut items = regrow(items, r, c, nr, nc, vec![Value::empty(); fields.len()]);
            for (k, (i, j)) in targets.iter().enumerate() {
                let s = &src[pick(k)];
                let mut row = vec![Value::empty(); fields.len()];
                for (q, f) in f2.iter().enumerate() {
                    let pos = fields.iter().position(|x| x == f).unwrap();
                    row[pos] = s[q].clone();
                }
                items[j * nr + i] = row;
            }
            Value::Struct { r: nr, c: nc, fields, items }
        }
        (Value::Str(s), Value::Str(src)) if nr <= 1 => {
            let chars: Vec<char> = s.chars().collect();
            let mut chars = regrow(chars, r.max(if c > 0 { 1 } else { 0 }), c, 1, nc, ' ');
            let src: Vec<char> = src.chars().collect();
            for (k, (_, j)) in targets.iter().enumerate() {
                chars[*j] = src[pick(k)];
            }
            Value::Str(chars.into_iter().collect())
        }
        (base, rhs) => {
            let a = base.arr()?;
            let b = rhs.arr()?;
            let complex = a.is_complex() || b.is_complex();
            let re = regrow(a.re.clone(), r, c, nr, nc, 0.0);
            let im = if complex { Some(regrow(a.im.clone().unwrap_or_else(|| vec![0.0; a.len()]), r, c, nr, nc, 0.0)) } else { None };
            let mut out = Arr { r: nr, c: nc, re, im, logical: a.logical && b.logical || (a.is_empty() && b.logical), nd: Vec::new() };
            for (k, (i, j)) in targets.iter().enumerate() {
                let q = j * nr + i;
                out.re[q] = b.re[pick(k)];
                if let Some(im) = out.im.as_mut() {
                    im[q] = b.im.as_ref().map_or(0.0, |v| v[pick(k)]);
                }
            }
            if nr == r && nc == c {
                out.nd = a.nd.clone();
            }
            out.simplify();
            Value::Num(out)
        }
    })
}

fn delete(base: Value, idx: &[Value]) -> R<Value> {
    let (r, c) = base.dims();
    let keep: Vec<usize>;
    let (nr, nc);
    if idx.len() == 1 {
        let del: HashSet<usize> = positions(&idx[0], r * c)?.into_iter().collect();
        keep = (0..r * c).filter(|k| !del.contains(k)).collect();
        if r == 1 || c != 1 && del.len() < r * c {
            (nr, nc) = (if keep.is_empty() { 0 } else { 1 }, keep.len());
        } else {
            (nr, nc) = (keep.len(), if keep.is_empty() { 0 } else { 1 });
        }
    } else {
        let rows_all = is_colon(&idx[0]) || positions(&idx[0], r)?.len() == r && r > 0;
        let cols_all = is_colon(&idx[1]) || positions(&idx[1], c)?.len() == c && c > 0;
        if rows_all {
            let del: HashSet<usize> = positions(&idx[1], c)?.into_iter().collect();
            let cols: Vec<usize> = (0..c).filter(|j| !del.contains(j)).collect();
            keep = cols.iter().flat_map(|&j| (0..r).map(move |i| j * r + i)).collect();
            (nr, nc) = (r, cols.len());
        } else if cols_all {
            let del: HashSet<usize> = positions(&idx[0], r)?.into_iter().collect();
            let rows: Vec<usize> = (0..r).filter(|i| !del.contains(i)).collect();
            keep = (0..c).flat_map(|j| rows.iter().map(move |&i| j * r + i)).collect();
            (nr, nc) = (rows.len(), c);
        } else {
            return Err("deletion needs a whole row or column: A(i, :) = [] or A(:, j) = []".into());
        }
    }
    Ok(match base {
        Value::Num(a) => {
            let mut out = Arr::new(nr, nc, keep.iter().map(|&k| a.re[k]).collect());
            out.im = a.im.as_ref().map(|im| keep.iter().map(|&k| im[k]).collect());
            out.logical = a.logical;
            out.simplify();
            Value::Num(out)
        }
        Value::Str(s) => {
            let chars: Vec<char> = s.chars().collect();
            Value::Str(keep.iter().map(|&k| chars[k]).collect())
        }
        Value::Cell { items, .. } => Value::Cell { r: nr, c: nc, items: keep.iter().map(|&k| items[k].clone()).collect() },
        Value::Struct { fields, items, .. } => Value::Struct { r: nr, c: nc, fields, items: keep.iter().map(|&k| items[k].clone()).collect() },
        Value::Func(_) => return Err("a function handle cannot be indexed".into()),
        Value::Obj(o) => return Err(format!("a {} object cannot be indexed with ( )", o.class)),
    })
}
