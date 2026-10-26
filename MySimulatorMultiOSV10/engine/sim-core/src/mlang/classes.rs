//! classdef classes at run time: inheritance, value classes (copy on write)
//! and handle classes (shared), constructors with obj@Super(…), properties
//! with get./set. accessors, Constant properties, methods called as
//! obj.m(x) or m(obj, x), Static methods, enumerations, operator
//! overloading (plus, mtimes …), an overloaded disp, and events with
//! addlistener / notify.

use super::interp::Interp;
use super::syntax::{ClassDef, Expr, Function, Stmt};
use super::value::*;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;

/// A class with its superclasses resolved.
#[derive(Debug)]
pub struct ClassInfo {
    pub name: String,
    /// The class first, then its superclasses (depth first).
    pub chain: Vec<Rc<ClassDef>>,
    /// Instance properties (inherited ones included) and the class that declares each.
    pub props: Vec<(String, usize)>,
    pub handle: bool,
}

#[derive(Debug)]
pub struct Instance {
    pub info: Rc<ClassInfo>,
    pub props: RefCell<Vec<Value>>,
    pub listeners: RefCell<Vec<(String, Value)>>,
    pub valid: Cell<bool>,
}

impl ClassInfo {
    pub fn prop_index(&self, name: &str) -> Option<usize> {
        self.props.iter().position(|(p, _)| p == name)
    }

    /// An instance method by name, searching the class then its superclasses.
    pub fn method(&self, name: &str) -> Option<Rc<Function>> {
        self.chain.iter().find_map(|c| c.methods.iter().find(|m| m.name == name).cloned())
    }

    pub fn static_method(&self, name: &str) -> Option<Rc<Function>> {
        self.chain.iter().find_map(|c| c.statics.iter().find(|m| m.name == name).cloned())
    }

    pub fn is_a(&self, class: &str) -> bool {
        class == self.name || self.chain.iter().any(|c| c.name == class || c.supers.iter().any(|s| s == class)) || (class == "handle" && self.handle)
    }

    pub fn has_event(&self, ev: &str) -> bool {
        self.chain.iter().any(|c| c.events.iter().any(|e| e == ev))
    }
}

pub fn instance(v: &Value) -> Option<&Instance> {
    match v {
        Value::Obj(o) => match &o.data {
            ObjData::User(i) => Some(i),
            _ => None,
        },
        _ => None,
    }
}

fn new_obj(info: Rc<ClassInfo>, props: Vec<Value>) -> Value {
    let class = info.name.clone();
    Value::Obj(Rc::new(Object { class, data: ObjData::User(Instance { info, props: RefCell::new(props), listeners: RefCell::new(Vec::new()), valid: Cell::new(true) }) }))
}

/// A copy with one property changed (value classes) — handles change in place.
fn with_prop(obj: &Value, k: usize, v: Value) -> Value {
    let inst = instance(obj).unwrap();
    if inst.info.handle {
        inst.props.borrow_mut()[k] = v;
        return obj.clone();
    }
    let mut props = inst.props.borrow().clone();
    props[k] = v;
    let copy = new_obj(inst.info.clone(), props);
    if let Some(i) = instance(&copy) {
        *i.listeners.borrow_mut() = inst.listeners.borrow().clone();
    }
    copy
}

fn mentions_super(stmts: &[Stmt], sup: &str) -> bool {
    fn expr(e: &Expr, sup: &str) -> bool {
        match e {
            Expr::SuperCall(_, s, _) => s == sup,
            Expr::Bin(_, a, b) => expr(a, sup) || expr(b, sup),
            Expr::Index(b, a) | Expr::CellIndex(b, a) => expr(b, sup) || a.iter().any(|x| expr(x, sup)),
            _ => false,
        }
    }
    stmts.iter().any(|s| match s {
        Stmt::Expr(e, _, _) | Stmt::Assign(_, e, _, _) => expr(e, sup),
        Stmt::If(arms, other) => arms.iter().any(|(c, b)| expr(c, sup) || mentions_super(b, sup)) || mentions_super(other, sup),
        Stmt::Try(b, _, h) => mentions_super(b, sup) || mentions_super(h, sup),
        _ => false,
    })
}

impl<'a> Interp<'a> {
    pub fn register_class(&mut self, def: Rc<ClassDef>) {
        self.class_cache.clear();
        self.classdefs.insert(def.name.clone(), def);
    }

    pub fn is_class(&self, name: &str) -> bool {
        self.classdefs.contains_key(name)
    }

    pub fn class_info(&mut self, name: &str) -> R<Rc<ClassInfo>> {
        if let Some(c) = self.class_cache.get(name) {
            return Ok(c.clone());
        }
        let def = self.classdefs.get(name).cloned().ok_or_else(|| format!("Unrecognized class '{name}'."))?;
        let mut chain = vec![def.clone()];
        let mut handle = false;
        let mut props: Vec<(String, usize)> = Vec::new();
        for sup in &def.supers {
            match sup.as_str() {
                "handle" | "dynamicprops" | "matlab.mixin.Copyable" | "matlab.mixin.SetGet" | "hgsetget" => handle = true,
                s if s.starts_with("matlab.") => {}
                s => {
                    let info = self.class_info(s)?;
                    handle |= info.handle;
                    for c in &info.chain {
                        if !chain.iter().any(|x| Rc::ptr_eq(x, c)) {
                            chain.push(c.clone());
                        }
                    }
                }
            }
        }
        // Properties: the superclasses' first, then the class's own.
        for (k, c) in chain.iter().enumerate().rev() {
            for p in c.props.iter().filter(|p| !p.constant) {
                if !props.iter().any(|(n, _)| *n == p.name) {
                    props.push((p.name.clone(), k));
                }
            }
        }
        let info = Rc::new(ClassInfo { name: name.to_string(), chain, props, handle });
        self.class_cache.insert(name.to_string(), info.clone());
        Ok(info)
    }

    /// A new object with the default property values, before any constructor runs.
    fn blank(&mut self, info: &Rc<ClassInfo>) -> R<Value> {
        let mut vals = Vec::with_capacity(info.props.len());
        for (name, k) in &info.props {
            let def = &info.chain[*k];
            let p = def.props.iter().find(|p| p.name == *name).unwrap();
            vals.push(match &p.default {
                Some(e) => self.eval_isolated(e)?,
                None => Value::empty(),
            });
        }
        Ok(new_obj(info.clone(), vals))
    }

    /// Evaluates a default value or constant in its own empty workspace.
    fn eval_isolated(&mut self, e: &Expr) -> R<Value> {
        self.scopes.push(HashMap::new());
        self.global_names.push(Default::default());
        let r = self.eval(e);
        self.scopes.pop();
        self.global_names.pop();
        r
    }

    /// ClassName(args): the defaults, the superclass constructors, then the class's constructor.
    pub fn construct(&mut self, class: &str, args: Vec<Value>) -> R<Value> {
        let info = self.class_info(class)?;
        if info.chain[0].abstract_class {
            return Err(format!("cannot create an instance of the abstract class '{class}'"));
        }
        let obj = self.blank(&info)?;
        self.run_constructor(&info.chain[0].clone(), obj, args)
    }

    fn run_constructor(&mut self, def: &Rc<ClassDef>, mut obj: Value, args: Vec<Value>) -> R<Value> {
        let ctor = def.methods.iter().find(|m| m.name == def.name).cloned();
        // Superclass constructors the constructor does not call itself run first, with no arguments.
        for sup in &def.supers {
            if let Some(sdef) = self.classdefs.get(sup).cloned() {
                let explicit = ctor.as_ref().is_some_and(|c| mentions_super(&c.body, sup));
                if !explicit {
                    obj = self.run_constructor(&sdef, obj, Vec::new())?;
                }
            }
        }
        let Some(ctor) = ctor else {
            if !args.is_empty() {
                return Err(format!("{} has no constructor that takes arguments", def.name));
            }
            return Ok(obj);
        };
        let out = ctor.outputs.first().cloned().ok_or_else(|| format!("the constructor of {} has no output", def.name))?;
        let r = self.call_user_preset(&ctor, args, 1, Some((out, obj)))?;
        r.into_iter().next().ok_or_else(|| format!("the constructor of {} returned nothing", def.name))
    }

    /// obj@Super(args) (a superclass constructor) or method@Super(args).
    pub fn super_call(&mut self, var: &str, sup: &str, args: Vec<Value>, nargout: usize) -> R<Vec<Value>> {
        let sdef = self.classdefs.get(sup).cloned().ok_or_else(|| format!("'{sup}' is not a class"))?;
        if let Some(obj) = self.get_var(var).cloned().filter(|v| instance(v).is_some()) {
            if !sdef.methods.iter().any(|m| m.name == var) {
                // A constructor call: the superclass constructor works on the object.
                let r = self.run_constructor(&sdef, obj, args)?;
                return Ok(vec![r]);
            }
        }
        let info = self.class_info(sup)?;
        let m = info.method(var).ok_or_else(|| format!("{sup} has no method '{var}'"))?;
        self.call_user(&m, args, nargout)
    }

    /// The method `name` of the first object argument, if it has one.
    pub fn object_method(&self, name: &str, args: &[Value]) -> Option<Rc<Function>> {
        args.iter().find_map(|a| instance(a)).and_then(|i| i.info.method(name))
    }

    /// obj.name: a property (through get.name), a method called with no arguments, or an event.
    pub fn obj_field(&mut self, obj: &Value, name: &str) -> R<Vec<Value>> {
        let inst = instance(obj).unwrap();
        if !inst.valid.get() {
            return Err(format!("Invalid or deleted object ({}).", inst.info.name));
        }
        let info = inst.info.clone();
        if let Some(get) = info.method(&format!("get.{name}")) {
            return self.call_user(&get, vec![obj.clone()], 1);
        }
        if let Some(k) = info.prop_index(name) {
            return Ok(vec![inst.props.borrow()[k].clone()]);
        }
        if let Some(c) = self.constant(&info.name.clone(), name)? {
            return Ok(vec![c]);
        }
        if let Some(m) = info.method(name) {
            return self.call_user(&m, vec![obj.clone()], 1);
        }
        Err(format!("Unrecognized method, property, or field '{name}' for class '{}'.", info.name))
    }

    /// A Constant property or an enumeration member of a class.
    pub fn constant(&mut self, class: &str, name: &str) -> R<Option<Value>> {
        let key = format!("{class}.{name}");
        if let Some(v) = self.constants.get(&key) {
            return Ok(Some(v.clone()));
        }
        let info = self.class_info(class)?;
        for def in info.chain.clone() {
            if let Some(p) = def.props.iter().find(|p| p.constant && p.name == name) {
                let v = match &p.default {
                    Some(e) => self.eval_isolated(e)?,
                    None => Value::empty(),
                };
                self.constants.insert(key, v.clone());
                return Ok(Some(v));
            }
            if let Some((_, args)) = def.enums.iter().find(|(n, _)| n == name) {
                let mut vals = Vec::new();
                for a in args.clone() {
                    vals.push(self.eval_isolated(&a)?);
                }
                let v = self.construct(&def.name, vals)?;
                // An enumeration member remembers its name.
                self.enum_names.insert(obj_key(&v), name.to_string());
                self.constants.insert(key, v.clone());
                return Ok(Some(v));
            }
        }
        Ok(None)
    }

    /// ClassName.member(args): a static method, a constant or an enumeration member.
    pub fn static_access(&mut self, class: &str, member: &str, args: Option<Vec<Value>>, nargout: usize) -> R<Vec<Value>> {
        let info = self.class_info(class)?;
        if let Some(m) = info.static_method(member) {
            return self.call_user(&m, args.unwrap_or_default(), nargout);
        }
        if let Some(c) = self.constant(class, member)? {
            return match args {
                Some(a) if !a.is_empty() => Ok(vec![super::interp::index_value(&c, &a)?]),
                _ => Ok(vec![c]),
            };
        }
        Err(format!("'{member}' is not a static method or constant property of {class}"))
    }

    /// obj.name = value (through set.name when the class has one).
    pub fn set_obj_field(&mut self, obj: Value, name: &str, value: Value) -> R<Value> {
        let inst = instance(&obj).unwrap();
        let info = inst.info.clone();
        if let Some(set) = info.method(&format!("set.{name}")) {
            // The accessor sees the plain property assignment of its own class.
            if !self.in_setter.contains(&format!("{}.{name}", info.name)) {
                let key = format!("{}.{name}", info.name);
                self.in_setter.push(key);
                let r = self.call_user(&set, vec![obj.clone(), value], 1);
                self.in_setter.pop();
                let r = r?;
                return Ok(if info.handle { obj } else { r.into_iter().next().unwrap_or(obj) });
            }
        }
        let k = info.prop_index(name).ok_or_else(|| format!("Unrecognized property '{name}' for class '{}'.", info.name))?;
        Ok(with_prop(&obj, k, value))
    }

    /// The overloaded operator method for a binary operation on objects, if any.
    pub fn operator(&mut self, method: &str, l: &Value, r: &Value) -> Option<R<Value>> {
        let m = self.object_method(method, &[l.clone(), r.clone()])?;
        Some(self.call_user(&m, vec![l.clone(), r.clone()], 1).and_then(|v| v.into_iter().next().ok_or_else(|| format!("{method} returned nothing"))))
    }

    pub fn unary_operator(&mut self, method: &str, v: &Value) -> Option<R<Value>> {
        let m = self.object_method(method, std::slice::from_ref(v))?;
        Some(self.call_user(&m, vec![v.clone()], 1).and_then(|v| v.into_iter().next().ok_or_else(|| format!("{method} returned nothing"))))
    }

    /// Display of a value, through the class's own disp when it has one.
    pub fn show(&mut self, name: &str, v: &Value) -> R<String> {
        if super::graphics::is_gfx(v) {
            return Ok(super::graphics::display_handle(self, name, v));
        }
        if let Some(inst) = instance(v) {
            if let Some(d) = inst.info.method("disp").or_else(|| inst.info.method("display")) {
                let before = self.out.len();
                self.call_user(&d, vec![v.clone()], 0)?;
                let printed = self.out.split_off(before);
                return Ok(format!("{name} =\n\n{printed}"));
            }
            if let Some(n) = self.enum_names.get(&obj_key(v)) {
                return Ok(format!("{name} = \n  {} enumeration\n\n    {n}\n", inst.info.name));
            }
        }
        Ok(display(name, v))
    }

    /// The class builtins: isa, isobject, isprop, ismethod, properties, methods, isvalid, delete, addlistener, notify, events.
    pub fn class_builtin(&mut self, name: &str, a: &[Value], nargout: usize) -> Option<R<Vec<Value>>> {
        let first = a.first();
        let inst = first.and_then(instance);
        let r: R<Vec<Value>> = match name {
            "class" => match first {
                Some(Value::Obj(o)) => Ok(vec![Value::Str(o.class.clone())]),
                _ => return None,
            },
            "isa" => match (inst, a.get(1).and_then(|v| v.text().ok())) {
                (Some(i), Some(c)) => Ok(vec![Value::boolean(i.info.is_a(&c))]),
                _ => match (first, a.get(1).and_then(|v| v.text().ok())) {
                    (Some(Value::Obj(o)), Some(c)) => Ok(vec![Value::boolean(o.class == c || c == "lti" || (c == "DynamicSystem"))]),
                    _ => return None,
                },
            },
            "isobject" => Ok(vec![Value::boolean(matches!(first, Some(Value::Obj(_))))]),
            "isprop" => match inst {
                Some(i) => Ok(vec![Value::boolean(a.get(1).and_then(|v| v.text().ok()).is_some_and(|p| i.info.prop_index(&p).is_some()))]),
                None if first.is_some_and(super::graphics::is_gfx) => return None,
                None => Ok(vec![Value::boolean(false)]),
            },
            "ismethod" => match inst {
                Some(i) => Ok(vec![Value::boolean(a.get(1).and_then(|v| v.text().ok()).is_some_and(|m| i.info.method(&m).is_some()))]),
                None => Ok(vec![Value::boolean(false)]),
            },
            "properties" | "fieldnames" if inst.is_some() => {
                let names: Vec<Value> = inst.unwrap().info.props.iter().map(|(p, _)| Value::Str(p.clone())).collect();
                if nargout == 0 && name == "properties" {
                    let text = format!("\nProperties for class {}:\n\n{}\n", inst.unwrap().info.name, inst.unwrap().info.props.iter().map(|(p, _)| format!("    {p}")).collect::<Vec<_>>().join("\n"));
                    self.print(&text);
                    return Some(Ok(Vec::new()));
                }
                Ok(vec![Value::Cell { r: names.len(), c: 1, items: names }])
            }
            "methods" => {
                let class = match (inst, first) {
                    (Some(i), _) => i.info.name.clone(),
                    (None, Some(Value::Str(s))) if self.is_class(s) => s.clone(),
                    _ => return None,
                };
                let info = match self.class_info(&class) {
                    Ok(i) => i,
                    Err(e) => return Some(Err(e)),
                };
                let mut names: Vec<String> = info.chain.iter().flat_map(|c| c.methods.iter().chain(c.statics.iter()).map(|m| m.name.clone())).filter(|n| !n.contains('.')).collect();
                names.sort();
                names.dedup();
                if nargout == 0 {
                    let text = format!("\nMethods for class {class}:\n\n{}\n", names.join("  "));
                    self.print(&text);
                    return Some(Ok(Vec::new()));
                }
                Ok(vec![Value::Cell { r: names.len(), c: 1, items: names.into_iter().map(Value::Str).collect() }])
            }
            "isvalid" => match inst {
                Some(i) => Ok(vec![Value::boolean(i.valid.get())]),
                None => return None,
            },
            "delete" => match inst {
                Some(i) if i.info.handle => {
                    if let Some(d) = i.info.method("delete") {
                        if let Err(e) = self.call_user(&d, vec![first.unwrap().clone()], 0) {
                            return Some(Err(e));
                        }
                    }
                    instance(first.unwrap()).unwrap().valid.set(false);
                    Ok(Vec::new())
                }
                _ => return None,
            },
            "addlistener" => match inst {
                Some(i) => {
                    let ev = a.get(1).and_then(|v| v.text().ok()).unwrap_or_default();
                    if !i.info.has_event(&ev) {
                        return Some(Err(format!("'{ev}' is not an event of class {}", i.info.name)));
                    }
                    let cb = a.get(2).cloned().unwrap_or_else(Value::empty);
                    i.listeners.borrow_mut().push((ev, cb));
                    Ok(Vec::new())
                }
                None => return None,
            },
            "notify" => match inst {
                Some(i) => {
                    let ev = a.get(1).and_then(|v| v.text().ok()).unwrap_or_default();
                    let callbacks: Vec<Value> = i.listeners.borrow().iter().filter(|(e, _)| *e == ev).map(|(_, c)| c.clone()).collect();
                    let data = Value::Struct { r: 1, c: 1, fields: vec!["EventName".into(), "Source".into()], items: vec![vec![Value::Str(ev.clone()), first.unwrap().clone()]] };
                    for cb in callbacks {
                        if let Value::Func(f) = cb {
                            if let Err(e) = self.call_func(&f, vec![first.unwrap().clone(), data.clone()], 0) {
                                return Some(Err(e));
                            }
                        }
                    }
                    Ok(Vec::new())
                }
                None => return None,
            },
            "events" => match inst {
                Some(i) => {
                    let names: Vec<Value> = i.info.chain.iter().flat_map(|c| c.events.iter().cloned()).map(Value::Str).collect();
                    Ok(vec![Value::Cell { r: names.len(), c: 1, items: names }])
                }
                None => return None,
            },
            "copy" => match inst {
                Some(i) => Ok(vec![new_obj(i.info.clone(), i.props.borrow().clone())]),
                None => return None,
            },
            _ => return None,
        };
        Some(r)
    }
}

pub fn obj_key(v: &Value) -> usize {
    match v {
        Value::Obj(o) => Rc::as_ptr(o) as *const u8 as usize,
        _ => 0,
    }
}

/// The default display of an object: its class and properties.
pub fn display_instance(name: &str, i: &Instance) -> String {
    let mut out = format!("{name} = \n  {} with properties:\n\n", i.info.name);
    let props = i.props.borrow();
    let w = i.info.props.iter().map(|(p, _)| p.chars().count()).max().unwrap_or(0);
    for ((p, _), v) in i.info.props.iter().zip(props.iter()) {
        out.push_str(&format!("    {p:>w$}: {}\n", short(v)));
    }
    out
}

pub fn new_instance(info: Rc<ClassInfo>, props: Vec<Value>) -> Value {
    new_obj(info, props)
}
