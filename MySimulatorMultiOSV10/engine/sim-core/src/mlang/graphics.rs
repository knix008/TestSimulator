//! Graphics handles and app controls: figure, axes, line, surface, text and
//! uicontrol / ui* component objects with get, set and dot access, findobj,
//! dialogs, and the callbacks the MATLAB desktop runs when a control changes
//! (it sends `__uievent(figure, control, value)` as an ordinary command).

use super::interp::{Figure, Interp};
use super::value::*;
use serde_json::{json, Value as J};
use std::collections::BTreeMap;
use std::rc::Rc;

pub type Props = BTreeMap<String, J>;

/// A uicontrol or a ui* component.
#[derive(Clone, Debug, Default)]
pub struct Control {
    pub id: u32,
    /// uicontrol styles (pushbutton, slider, edit, text, popupmenu, checkbox, radiobutton,
    /// togglebutton, listbox) or components (button, statebutton, slider, label, editfield,
    /// numericfield, dropdown, checkbox, spinner, textarea, gauge, switch).
    pub style: String,
    /// true for ui* components (Value is typed: text, logical), false for uicontrol.
    pub component: bool,
    /// The position was chosen here (stacked down the left edge), not by the script.
    pub auto: bool,
    pub props: Props,
    pub callbacks: BTreeMap<String, Value>,
}

/// text(x, y, 'label'), xline(v), yline(v).
#[derive(Clone, Debug, Default)]
pub struct Annot {
    pub id: u32,
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub text: String,
    pub props: Props,
}

/// One graphics object: its kind, the figure's number and the object's id in that figure.
#[derive(Clone, Debug, PartialEq)]
pub struct GRef {
    pub kind: String,
    pub fig: u32,
    pub item: u32,
}

const ORDER: [[f64; 3]; 7] = [[0.0, 0.447, 0.741], [0.85, 0.325, 0.098], [0.929, 0.694, 0.125], [0.494, 0.184, 0.556], [0.466, 0.674, 0.188], [0.301, 0.745, 0.933], [0.635, 0.078, 0.184]];

const LINE_PROPS: [&str; 10] = ["color", "linewidth", "linestyle", "marker", "markersize", "markerfacecolor", "markeredgecolor", "displayname", "tag", "visible"];

const PLOTS: [&str; 20] = ["plot", "semilogx", "semilogy", "loglog", "stairs", "stem", "scatter", "bar", "area", "plot3", "errorbar", "fplot", "histogram", "surf", "mesh", "contour", "contourf", "imagesc", "pcolor", "heatmap"];

/// Functions that take an axes or figure handle first (plot(ax, …), title(ax, …), hold(ax, 'on') …).
const TAKES_AXES: [&str; 14] = ["title", "xlabel", "ylabel", "legend", "hold", "grid", "axis", "xlim", "ylim", "cla", "text", "xline", "yline", "subtitle"];

// ───────────────────────── handles

pub fn refs(v: &Value) -> Option<&Vec<GRef>> {
    match v {
        Value::Obj(o) => match &o.data {
            ObjData::Gfx(r) => Some(r),
            _ => None,
        },
        _ => None,
    }
}

pub fn is_gfx(v: &Value) -> bool {
    refs(v).is_some()
}

fn handle(it: &Interp, refs: Vec<GRef>) -> Value {
    let class = refs.first().map(|r| class_of(it, r)).unwrap_or_else(|| "matlab.graphics.GraphicsPlaceholder".into());
    Value::Obj(Rc::new(Object { class, data: ObjData::Gfx(refs) }))
}

fn one_ref(kind: &str, fig: u32, item: u32) -> GRef {
    GRef { kind: kind.into(), fig, item }
}

/// Short type names as get(h, 'Type') gives them.
fn type_of(it: &Interp, r: &GRef) -> String {
    match r.kind.as_str() {
        "control" => control(it, r).map(|c| if c.component { format!("ui{}", c.style) } else { "uicontrol".into() }).unwrap_or_else(|| "uicontrol".into()),
        "annot" => annot(it, r).map(|a| if a.kind == "text" { "text".into() } else { "constantline".into() }).unwrap_or_else(|| "text".into()),
        "label" => "text".into(),
        k => k.into(),
    }
}

fn class_of(it: &Interp, r: &GRef) -> String {
    let t = type_of(it, r);
    match t.as_str() {
        "figure" => "matlab.ui.Figure".into(),
        "axes" => "matlab.graphics.axis.Axes".into(),
        "line" => "matlab.graphics.chart.primitive.Line".into(),
        "surface" => "matlab.graphics.chart.primitive.Surface".into(),
        "text" => "matlab.graphics.primitive.Text".into(),
        "constantline" => "matlab.graphics.chart.decoration.ConstantLine".into(),
        "uicontrol" => "matlab.ui.control.UIControl".into(),
        other => {
            let name = match other.trim_start_matches("ui") {
                "button" => "Button",
                "statebutton" => "StateButton",
                "slider" => "Slider",
                "label" => "Label",
                "editfield" => "EditField",
                "numericfield" => "NumericEditField",
                "dropdown" => "DropDown",
                "checkbox" => "CheckBox",
                "spinner" => "Spinner",
                "textarea" => "TextArea",
                "gauge" => "Gauge",
                "switch" => "Switch",
                _ => "Component",
            };
            format!("matlab.ui.control.{name}")
        }
    }
}

/// The display name ("Line", "Figure", "Button" …).
fn kind_title(class: &str) -> String {
    let last = class.rsplit('.').next().unwrap_or(class);
    if last == "UIControl" { "UIControl".into() } else { last.into() }
}

pub fn fig_index(it: &Interp, id: u32) -> Option<usize> {
    it.figures.iter().position(|f| f.id == id)
}

fn fig_of<'a>(it: &'a Interp, r: &GRef) -> Option<&'a Figure> {
    fig_index(it, r.fig).map(|k| &it.figures[k])
}

fn control<'a>(it: &'a Interp, r: &GRef) -> Option<&'a Control> {
    fig_of(it, r)?.controls.iter().find(|c| c.id == r.item)
}

fn annot<'a>(it: &'a Interp, r: &GRef) -> Option<&'a Annot> {
    fig_of(it, r)?.annots.iter().find(|c| c.id == r.item)
}

/// The object still exists.
fn alive(it: &Interp, r: &GRef) -> bool {
    let Some(f) = fig_of(it, r) else { return false };
    match r.kind.as_str() {
        "figure" | "axes" | "label" => true,
        "line" => f.series.iter().any(|s| s.id == r.item),
        "surface" => f.surfaces.iter().any(|s| s.id == r.item),
        "control" => f.controls.iter().any(|s| s.id == r.item),
        "annot" => f.annots.iter().any(|s| s.id == r.item),
        _ => false,
    }
}

/// Gives every figure a number and every plotted object an id (plot() and friends add them without).
pub fn ensure_ids(it: &mut Interp) {
    for k in 0..it.figures.len() {
        if it.figures[k].id == 0 {
            let used: Vec<u32> = it.figures.iter().map(|f| f.id).collect();
            it.figures[k].id = (1..).find(|n| !used.contains(n)).unwrap();
        }
        let f = &mut it.figures[k];
        let mut next = f.next.max(f.series.iter().map(|s| s.id).chain(f.surfaces.iter().map(|s| s.id)).chain(f.controls.iter().map(|s| s.id)).chain(f.annots.iter().map(|s| s.id)).max().unwrap_or(0));
        for s in f.series.iter_mut().filter(|s| s.id == 0) {
            next += 1;
            s.id = next;
        }
        for s in f.surfaces.iter_mut().filter(|s| s.id == 0) {
            next += 1;
            s.id = next;
        }
        f.next = next;
    }
}

/// The current figure (made if there is none).
fn current(it: &mut Interp) -> usize {
    if it.figures.is_empty() {
        it.figures.push(Figure::default());
        it.current = 0;
    }
    it.current = it.current.min(it.figures.len() - 1);
    ensure_ids(it);
    it.current
}

fn new_figure(it: &mut Interp, component: bool) -> usize {
    it.figures.push(Figure { uifig: component, ..Default::default() });
    it.current = it.figures.len() - 1;
    it.hold = false;
    ensure_ids(it);
    it.current
}

fn next_id(f: &mut Figure) -> u32 {
    f.next += 1;
    f.next
}

fn select(it: &mut Interp, r: &GRef) -> R<usize> {
    let k = fig_index(it, r.fig).ok_or("Invalid or deleted object.")?;
    it.current = k;
    Ok(k)
}

// ───────────────────────── property values

fn prop_key(name: &str) -> String {
    // Canonical spelling for the common properties (get/set are case-insensitive).
    const NAMES: [&str; 60] = [
        "Name", "Color", "Position", "Visible", "Tag", "UserData", "Type", "Parent", "Children", "Number", "NumberTitle", "Units", "XData", "YData", "ZData", "LineStyle", "LineWidth", "Marker",
        "MarkerSize", "MarkerFaceColor", "MarkerEdgeColor", "DisplayName", "XLim", "YLim", "ZLim", "XGrid", "YGrid", "XScale", "YScale", "Title", "XLabel", "YLabel", "Box", "FontSize", "NextPlot",
        "CurrentAxes", "String", "Value", "Min", "Max", "Style", "Enable", "Callback", "Text", "Limits", "Items", "Placeholder", "ButtonPushedFcn", "ValueChangedFcn", "Step", "Label", "FontWeight",
        "HorizontalAlignment", "BackgroundColor", "ForegroundColor", "Editable", "ItemsData", "XLimMode", "YLimMode", "WindowStyle",
    ];
    NAMES.iter().find(|n| n.eq_ignore_ascii_case(name)).map(|n| n.to_string()).unwrap_or_else(|| name.to_string())
}

/// Simple values as plain JSON (numbers, text, lists of text) so the desktop can draw them; anything else wrapped.
pub fn to_prop(v: &Value) -> J {
    match v {
        Value::Num(a) if a.im.is_none() && a.nd.is_empty() && (a.r <= 1 || a.c <= 1) => {
            if a.logical && a.len() == 1 {
                return J::Bool(a.re[0] != 0.0);
            }
            if a.len() == 1 && !a.logical {
                return json!(a.re[0]);
            }
            json!({ "$row": a.re, "col": a.c == 1 && a.r > 1, "l": a.logical })
        }
        Value::Str(s) => J::String(s.clone()),
        Value::Cell { items, .. } if items.iter().all(|x| matches!(x, Value::Str(_))) => J::Array(items.iter().map(|x| J::String(x.text().unwrap_or_default())).collect()),
        other => json!({ "$v": super::session::value_json(other) }),
    }
}

pub fn from_prop(j: &J) -> Value {
    match j {
        J::Bool(b) => Value::boolean(*b),
        J::Number(n) => Value::num(n.as_f64().unwrap_or(f64::NAN)),
        J::String(s) => Value::Str(s.clone()),
        J::Array(items) => Value::Cell { r: 1, c: items.len(), items: items.iter().map(from_prop).collect() },
        J::Object(m) => {
            if let Some(row) = m.get("$row").and_then(J::as_array) {
                let v: Vec<f64> = row.iter().map(|x| x.as_f64().unwrap_or(f64::NAN)).collect();
                let mut a = if m.get("col").and_then(J::as_bool).unwrap_or(false) { Arr::col(v) } else { Arr::row(v) };
                a.logical = m.get("l").and_then(J::as_bool).unwrap_or(false);
                return Value::Num(a);
            }
            m.get("$v").map(super::session::json_value).unwrap_or_else(Value::empty)
        }
        J::Null => Value::empty(),
    }
}

fn rgb(c: [f64; 3]) -> Value {
    Value::row(c.to_vec())
}

/// 'r', 'red', '#ff0000', [1 0 0] → [r g b]; 'none' stays text.
fn parse_color(v: &Value) -> R<Option<[f64; 3]>> {
    if let Value::Str(s) = v {
        let s = s.trim().to_ascii_lowercase();
        let named = match s.as_str() {
            "r" | "red" => Some([1.0, 0.0, 0.0]),
            "g" | "green" => Some([0.0, 1.0, 0.0]),
            "b" | "blue" => Some([0.0, 0.0, 1.0]),
            "c" | "cyan" => Some([0.0, 1.0, 1.0]),
            "m" | "magenta" => Some([1.0, 0.0, 1.0]),
            "y" | "yellow" => Some([1.0, 1.0, 0.0]),
            "k" | "black" => Some([0.0, 0.0, 0.0]),
            "w" | "white" => Some([1.0, 1.0, 1.0]),
            "none" | "flat" | "interp" | "auto" => None,
            hex if hex.starts_with('#') && hex.len() == 7 => {
                let p = |k: usize| u8::from_str_radix(&hex[k..k + 2], 16).map(|x| x as f64 / 255.0).map_err(|_| format!("'{hex}' is not a colour"));
                Some([p(1)?, p(3)?, p(5)?])
            }
            other => return Err(format!("'{other}' is not a valid colour")),
        };
        return Ok(named);
    }
    let a = v.arr()?;
    if a.len() != 3 || a.re.iter().any(|x| !(0.0..=1.0).contains(x)) {
        return Err("a colour is an RGB triplet of values between 0 and 1".into());
    }
    Ok(Some([a.re[0], a.re[1], a.re[2]]))
}

fn style_color(style: &str) -> Option<[f64; 3]> {
    style.chars().find_map(|c| parse_color(&Value::Str(c.to_string())).ok().flatten().filter(|_| "rgbcmykw".contains(c)))
}

fn style_line(style: &str) -> String {
    for l in ["--", "-.", ":", "-"] {
        if style.contains(l) && !(l == "-" && style.contains("-.")) {
            return l.into();
        }
    }
    if style.chars().any(|c| "o+*.xsd^v<>ph".contains(c)) { "none".into() } else { "-".into() }
}

fn style_marker(style: &str) -> String {
    let s = style.replace("-.", "");
    s.chars().find(|c| "o+*.xsd^v<>ph".contains(*c)).map(|c| c.to_string()).unwrap_or_else(|| "none".into())
}

fn data_range(v: &[f64]) -> Value {
    let lo = v.iter().copied().filter(|x| x.is_finite()).fold(f64::INFINITY, f64::min);
    let hi = v.iter().copied().filter(|x| x.is_finite()).fold(f64::NEG_INFINITY, f64::max);
    if lo.is_finite() { Value::row(vec![lo, if hi > lo { hi } else { lo + 1.0 }]) } else { Value::row(vec![0.0, 1.0]) }
}

// ───────────────────────── get

/// The properties shown by disp and get(h) (in this order).
fn listed(it: &Interp, r: &GRef) -> Vec<&'static str> {
    match type_of(it, r).as_str() {
        "figure" => vec!["Number", "Name", "Color", "Position", "Units", "Visible", "Children"],
        "axes" => vec!["XLim", "YLim", "XScale", "YScale", "XGrid", "YGrid", "Title", "XLabel", "YLabel", "NextPlot", "Position", "Children"],
        "line" => vec!["Color", "LineStyle", "LineWidth", "Marker", "MarkerSize", "DisplayName", "XData", "YData", "Visible"],
        "surface" => vec!["XData", "YData", "ZData", "Visible"],
        "text" => vec!["String", "Position", "Color", "FontSize"],
        "constantline" => vec!["Value", "Label", "Color", "LineStyle", "LineWidth"],
        "uicontrol" => vec!["Style", "String", "Value", "Min", "Max", "Position", "Callback", "Enable", "Visible"],
        t => match t {
            "uibutton" => vec!["Text", "ButtonPushedFcn", "Position", "Enable", "Visible"],
            "uistatebutton" => vec!["Text", "Value", "ValueChangedFcn", "Position"],
            "uilabel" => vec!["Text", "Position", "FontSize", "Visible"],
            "uidropdown" | "uiswitch" => vec!["Value", "Items", "ValueChangedFcn", "Position"],
            "uitextarea" | "uieditfield" => vec!["Value", "Placeholder", "ValueChangedFcn", "Position"],
            _ => vec!["Value", "Limits", "ValueChangedFcn", "Position", "Enable"],
        },
    }
}

pub fn get_prop(it: &Interp, r: &GRef, name: &str) -> R<Value> {
    if !alive(it, r) {
        return Err("Invalid or deleted object.".into());
    }
    let key = prop_key(name);
    let f = fig_of(it, r).unwrap();
    let stored = |props: &Props| props.get(&key).map(from_prop);
    let fig_h = || handle(it, vec![one_ref("figure", r.fig, 0)]);
    let ax_h = || handle(it, vec![one_ref("axes", r.fig, 0)]);
    if key == "Type" {
        return Ok(Value::Str(type_of(it, r)));
    }
    let v = match r.kind.as_str() {
        "figure" => match key.as_str() {
            "Number" => Some(Value::num(f.id as f64)),
            "Name" => Some(stored(&f.props).unwrap_or_else(|| Value::Str(String::new()))),
            "Children" => {
                let mut kids: Vec<GRef> = f.controls.iter().rev().map(|c| one_ref("control", r.fig, c.id)).collect();
                kids.push(one_ref("axes", r.fig, 0));
                Some(handle(it, kids))
            }
            "CurrentAxes" => Some(ax_h()),
            _ => stored(&f.props).or_else(|| match key.as_str() {
                "Color" => Some(rgb([0.94, 0.94, 0.94])),
                "Position" => Some(Value::row(if f.uifig { vec![100.0, 100.0, 640.0, 480.0] } else { vec![100.0, 100.0, 560.0, 420.0] })),
                "Units" => Some(Value::Str("pixels".into())),
                "Visible" | "NumberTitle" => Some(Value::Str("on".into())),
                "Tag" => Some(Value::Str(String::new())),
                "UserData" => Some(Value::empty()),
                "WindowStyle" => Some(Value::Str("normal".into())),
                _ => None,
            }),
        },
        "axes" => match key.as_str() {
            "Title" => Some(handle(it, vec![one_ref("label", r.fig, 1)])),
            "XLabel" => Some(handle(it, vec![one_ref("label", r.fig, 2)])),
            "YLabel" => Some(handle(it, vec![one_ref("label", r.fig, 3)])),
            "Parent" => Some(fig_h()),
            "NextPlot" => Some(Value::Str(if it.hold { "add" } else { "replace" }.into())),
            "Children" => {
                let mut kids: Vec<GRef> = f.annots.iter().map(|a| one_ref("annot", r.fig, a.id)).collect();
                kids.extend(f.surfaces.iter().map(|s| one_ref("surface", r.fig, s.id)));
                kids.extend(f.series.iter().map(|s| one_ref("line", r.fig, s.id)));
                kids.reverse();
                Some(handle(it, kids))
            }
            _ => stored(&f.axes).or_else(|| match key.as_str() {
                "XLim" => Some(data_range(&f.series.iter().flat_map(|s| s.x.iter().copied()).chain(f.surfaces.iter().flat_map(|s| s.x.iter().copied())).collect::<Vec<_>>())),
                "YLim" => Some(data_range(&f.series.iter().flat_map(|s| s.y.iter().copied()).chain(f.surfaces.iter().flat_map(|s| s.y.iter().copied())).collect::<Vec<_>>())),
                "XLimMode" | "YLimMode" => Some(Value::Str(if f.axes.contains_key(&key[..4]) { "manual" } else { "auto" }.into())),
                "XScale" => Some(Value::Str(if matches!(f.kind.as_str(), "semilogx" | "loglog") { "log" } else { "linear" }.into())),
                "YScale" => Some(Value::Str(if matches!(f.kind.as_str(), "semilogy" | "loglog") { "log" } else { "linear" }.into())),
                "XGrid" | "YGrid" | "Box" => Some(Value::Str("off".into())),
                "FontSize" => Some(Value::num(10.0)),
                "Color" => Some(rgb([1.0, 1.0, 1.0])),
                "Position" => Some(Value::row(vec![0.13, 0.11, 0.775, 0.815])),
                "Visible" => Some(Value::Str("on".into())),
                "Tag" => Some(Value::Str(String::new())),
                _ => None,
            }),
        },
        "label" => match key.as_str() {
            "String" => Some(Value::Str(match r.item { 1 => f.title.clone(), 2 => f.xlabel.clone(), _ => f.ylabel.clone() })),
            "Parent" => Some(ax_h()),
            "FontSize" => Some(Value::num(if r.item == 1 { 11.0 } else { 11.0 })),
            "Color" => Some(rgb([0.15, 0.15, 0.15])),
            "Visible" => Some(Value::Str("on".into())),
            _ => None,
        },
        "line" => {
            let (k, s) = f.series.iter().enumerate().find(|(_, s)| s.id == r.item).unwrap();
            match key.as_str() {
                "XData" => Some(Value::row(s.x.clone())),
                "YData" => Some(Value::row(s.y.clone())),
                "ZData" => Some(Value::empty()),
                "DisplayName" => Some(Value::Str(s.name.clone())),
                "Parent" => Some(ax_h()),
                _ => stored(&s.props).or_else(|| match key.as_str() {
                    "Color" => Some(rgb(style_color(&s.style).unwrap_or(ORDER[k % ORDER.len()]))),
                    "LineStyle" => Some(Value::Str(style_line(&s.style))),
                    "Marker" => Some(Value::Str(style_marker(&s.style))),
                    "LineWidth" => Some(Value::num(0.5)),
                    "MarkerSize" => Some(Value::num(6.0)),
                    "Visible" => Some(Value::Str("on".into())),
                    "Tag" => Some(Value::Str(String::new())),
                    "UserData" => Some(Value::empty()),
                    _ => None,
                }),
            }
        }
        "surface" => {
            let s = f.surfaces.iter().find(|s| s.id == r.item).unwrap();
            match key.as_str() {
                "XData" => Some(Value::row(s.x.clone())),
                "YData" => Some(Value::col(s.y.clone())),
                "ZData" => {
                    let (nx, ny) = (s.x.len(), s.y.len());
                    Some(Value::Num(Arr::new(ny, nx, (0..nx).flat_map(|j| (0..ny).map(move |i| (i, j))).map(|(i, j)| s.z[i * nx + j]).collect())))
                }
                "Parent" => Some(ax_h()),
                _ => stored(&s.props).or_else(|| match key.as_str() {
                    "Visible" => Some(Value::Str("on".into())),
                    "FaceColor" => Some(Value::Str("flat".into())),
                    _ => None,
                }),
            }
        }
        "annot" => {
            let a = annot(it, r).unwrap();
            match (a.kind.as_str(), key.as_str()) {
                ("text", "String") => Some(Value::Str(a.text.clone())),
                ("text", "Position") => Some(Value::row(vec![a.x, a.y, 0.0])),
                (_, "Label") => Some(Value::Str(a.text.clone())),
                ("xline", "Value") => Some(Value::num(a.x)),
                ("yline", "Value") => Some(Value::num(a.y)),
                (_, "Parent") => Some(ax_h()),
                _ => stored(&a.props).or_else(|| match key.as_str() {
                    "Color" => Some(rgb([0.15, 0.15, 0.15])),
                    "FontSize" => Some(Value::num(10.0)),
                    "LineStyle" => Some(Value::Str("-".into())),
                    "LineWidth" => Some(Value::num(0.5)),
                    "Visible" => Some(Value::Str("on".into())),
                    _ => None,
                }),
            }
        }
        "control" => {
            let c = control(it, r).unwrap();
            if let Some(cb) = c.callbacks.get(&key) {
                Some(cb.clone())
            } else if key == "Parent" {
                Some(fig_h())
            } else if key == "Style" && !c.component {
                Some(Value::Str(c.style.clone()))
            } else {
                stored(&c.props).or_else(|| match key.as_str() {
                    "Enable" | "Visible" => Some(Value::Str("on".into())),
                    "Tag" => Some(Value::Str(String::new())),
                    "UserData" => Some(Value::empty()),
                    "Callback" | "ButtonPushedFcn" | "ValueChangedFcn" => Some(Value::empty()),
                    "FontSize" => Some(Value::num(if c.component { 12.0 } else { 8.0 })),
                    _ => None,
                })
            }
        }
        _ => None,
    };
    v.ok_or_else(|| format!("Unrecognized property '{name}' for class '{}'.", kind_title(&class_of(it, r))))
}

// ───────────────────────── set

fn is_callback(key: &str) -> bool {
    key == "Callback" || key.ends_with("Fcn")
}

pub fn set_prop(it: &mut Interp, r: &GRef, name: &str, v: Value) -> R<()> {
    if !alive(it, r) {
        return Err("Invalid or deleted object.".into());
    }
    let key = prop_key(name);
    if matches!(key.as_str(), "Type" | "Parent" | "Children" | "Number") {
        return Err(format!("You cannot set the read-only property '{key}'."));
    }
    let k = fig_index(it, r.fig).unwrap();
    // Colours are kept as RGB triplets.
    let colour = key.ends_with("Color") && !matches!(v, Value::Str(ref s) if ["none", "flat", "interp", "auto"].contains(&s.to_ascii_lowercase().as_str()));
    let v = if colour {
        match parse_color(&v)? {
            Some(c) => rgb(c),
            None => v,
        }
    } else {
        v
    };
    // A text handle given back (ax.Title = t after t.String = …) changes nothing.
    if is_gfx(&v) && matches!(key.as_str(), "Title" | "XLabel" | "YLabel") {
        return Ok(());
    }
    if r.kind == "axes" && key == "NextPlot" {
        it.hold = v.text()? == "add";
        return Ok(());
    }
    let f = &mut it.figures[k];
    match r.kind.as_str() {
        "figure" => {
            if key == "Name" {
                let t = v.text()?;
                if f.title.is_empty() || f.props.get("Name").and_then(J::as_str) == Some(f.title.as_str()) {
                    f.title = t;
                }
            }
            f.props.insert(key, to_prop(&v));
        }
        "axes" => match key.as_str() {
            "Title" => f.title = v.text()?,
            "XLabel" => f.xlabel = v.text()?,
            "YLabel" => f.ylabel = v.text()?,
            "XLim" | "YLim" | "ZLim" => {
                let a = v.arr()?;
                if a.len() != 2 || a.re[1] <= a.re[0] {
                    return Err(format!("{key} must be a 1×2 vector of increasing values"));
                }
                f.axes.insert(key, to_prop(&v));
            }
            "XLimMode" | "YLimMode" => {
                if v.text()? == "auto" {
                    f.axes.remove(&key[..4]);
                }
            }
            "XScale" | "YScale" => {
                let log = v.text()? == "log";
                let (lx, ly) = (matches!(f.kind.as_str(), "semilogx" | "loglog"), matches!(f.kind.as_str(), "semilogy" | "loglog"));
                let (lx, ly) = if key == "XScale" { (log, ly) } else { (lx, log) };
                if f.kind.is_empty() || matches!(f.kind.as_str(), "plot" | "semilogx" | "semilogy" | "loglog") {
                    f.kind = match (lx, ly) { (true, true) => "loglog", (true, false) => "semilogx", (false, true) => "semilogy", _ => "plot" }.into();
                }
                f.axes.insert(key, to_prop(&v));
            }
            _ => {
                f.axes.insert(key, to_prop(&v));
            }
        },
        "label" => match key.as_str() {
            "String" => {
                let t = v.text()?;
                match r.item {
                    1 => f.title = t,
                    2 => f.xlabel = t,
                    _ => f.ylabel = t,
                }
            }
            _ => {}
        },
        "line" => {
            let s = f.series.iter_mut().find(|s| s.id == r.item).unwrap();
            match key.as_str() {
                "XData" => s.x = v.arr()?.re,
                "YData" => s.y = v.arr()?.re,
                "DisplayName" => s.name = v.text()?,
                _ => {
                    s.props.insert(key, to_prop(&v));
                }
            }
        }
        "surface" => {
            let s = f.surfaces.iter_mut().find(|s| s.id == r.item).unwrap();
            match key.as_str() {
                "ZData" => {
                    let z = v.arr()?;
                    if z.r != s.y.len() || z.c != s.x.len() {
                        return Err("ZData must keep the size of the surface".into());
                    }
                    s.z = (0..z.r).flat_map(|i| (0..z.c).map(move |j| (i, j))).map(|(i, j)| z.get(i, j)).collect();
                }
                _ => {
                    s.props.insert(key, to_prop(&v));
                }
            }
        }
        "annot" => {
            let a = f.annots.iter_mut().find(|s| s.id == r.item).unwrap();
            match key.as_str() {
                "String" | "Label" => a.text = v.text()?,
                "Value" if a.kind == "xline" => a.x = v.scalar()?,
                "Value" => a.y = v.scalar()?,
                "Position" => {
                    let p = v.arr()?.re;
                    a.x = *p.first().unwrap_or(&a.x);
                    a.y = *p.get(1).unwrap_or(&a.y);
                }
                _ => {
                    a.props.insert(key, to_prop(&v));
                }
            }
        }
        "control" => {
            let c = f.controls.iter_mut().find(|s| s.id == r.item).unwrap();
            if is_callback(&key) {
                c.callbacks.insert(key, v);
            } else if key == "Style" && !c.component {
                c.style = v.text()?.to_ascii_lowercase();
            } else {
                if key == "Position" {
                    c.auto = false;
                }
                let v = if key == "Value" && c.component && matches!(c.style.as_str(), "checkbox" | "statebutton") { Value::boolean(v.truthy()?) } else { v };
                c.props.insert(key, to_prop(&v));
            }
        }
        _ => {}
    }
    Ok(())
}

// ───────────────────────── display

fn prop_text(v: &Value) -> String {
    match v {
        Value::Str(s) => format!("'{s}'"),
        Value::Func(_) => short(v),
        Value::Obj(o) => match &o.data {
            ObjData::Gfx(r) if r.len() == 1 => format!("[1×1 {}]", kind_title(&o.class)),
            ObjData::Gfx(r) => format!("[{}×1 Graphics]", r.len()),
            _ => short(v),
        },
        Value::Num(a) if a.len() > 1 && a.len() <= 6 && (a.r == 1 || a.c == 1) => format!("[{}]", a.re.iter().map(|x| format_num(*x)).collect::<Vec<_>>().join(" ")),
        Value::Num(a) if a.len() > 6 => format!("[1×{} double]", a.len()),
        _ => short(v),
    }
}

pub fn display_handle(it: &Interp, name: &str, v: &Value) -> String {
    let Value::Obj(o) = v else { return String::new() };
    let rs = refs(v).unwrap();
    let title = kind_title(&o.class);
    if rs.is_empty() {
        return format!("{name} = \n\n  0×0 empty GraphicsPlaceholder array.\n");
    }
    if rs.len() > 1 {
        let kinds: Vec<String> = rs.iter().map(|r| kind_title(&class_of(it, r))).collect();
        return format!("{name} = \n\n  {}×1 graphics array:\n\n{}\n", rs.len(), kinds.iter().map(|k| format!("  {k}")).collect::<Vec<_>>().join("\n"));
    }
    let r = &rs[0];
    if !alive(it, r) {
        return format!("{name} = \n\n  handle to deleted {title}\n");
    }
    let names = listed(it, r);
    let width = names.iter().map(|n| n.len()).max().unwrap_or(0);
    let mut out = format!("{name} = \n\n  {title} with properties:\n\n");
    for n in names {
        if let Ok(p) = get_prop(it, r, n) {
            out.push_str(&format!("    {n:>width$}: {}\n", prop_text(&p)));
        }
    }
    out
}

fn get_all(it: &Interp, r: &GRef) -> Value {
    let mut fields = Vec::new();
    let mut items = Vec::new();
    let mut names: Vec<String> = listed(it, r).iter().map(|s| s.to_string()).collect();
    names.push("Type".into());
    if let Some(f) = fig_of(it, r) {
        let extra: Vec<&Props> = match r.kind.as_str() {
            "figure" => vec![&f.props],
            "axes" => vec![&f.axes],
            "line" => f.series.iter().filter(|s| s.id == r.item).map(|s| &s.props).collect(),
            "control" => f.controls.iter().filter(|s| s.id == r.item).map(|s| &s.props).collect(),
            _ => Vec::new(),
        };
        for p in extra {
            for k in p.keys() {
                if !names.contains(k) {
                    names.push(k.clone());
                }
            }
        }
    }
    for n in names {
        if let Ok(v) = get_prop(it, r, &n) {
            fields.push(n);
            items.push(v);
        }
    }
    Value::Struct { r: 1, c: 1, fields, items: vec![items] }
}

// ───────────────────────── creation

/// Name-value pairs from args[start..].
fn pairs(args: &[Value], start: usize, what: &str) -> R<Vec<(String, Value)>> {
    let rest = &args[start.min(args.len())..];
    if rest.len() % 2 == 1 {
        return Err(format!("{what}: properties come in name-value pairs"));
    }
    rest.chunks(2).map(|p| Ok((p[0].text().map_err(|_| format!("{what}: expected a property name"))?, p[1].clone()))).collect()
}

/// The figure a control goes into: its first argument (a figure, panel or layout) or the current one.
fn parent_of(it: &mut Interp, args: &[Value], component: bool) -> R<(usize, usize)> {
    if let Some(r) = args.first().and_then(refs).and_then(|r| r.first()).cloned() {
        return Ok((select(it, &r)?, 1));
    }
    if it.figures.is_empty() || (component && !it.figures[it.current.min(it.figures.len() - 1)].uifig) {
        return Ok((new_figure(it, component), 0));
    }
    Ok((current(it), 0))
}

fn make_control(it: &mut Interp, args: &[Value], style: &str, component: bool, what: &str) -> R<Value> {
    let (k, mut start) = parent_of(it, args, component)?;
    let mut style = style.to_string();
    // uibutton(fig, 'state'), uieditfield(fig, 'numeric').
    if component {
        if let Some(Value::Str(s)) = args.get(start) {
            let s = s.to_ascii_lowercase();
            if (args.len() - start) % 2 == 1 && ["push", "state", "numeric", "text"].contains(&s.as_str()) {
                style = match (style.as_str(), s.as_str()) {
                    ("button", "state") => "statebutton".into(),
                    ("editfield", "numeric") => "numericfield".into(),
                    (st, _) => st.into(),
                };
                start += 1;
            }
        }
    }
    let ps = pairs(args, start, what)?;
    let f = &mut it.figures[k];
    let id = next_id(f);
    let mut c = Control { id, style: style.clone(), component, auto: true, ..Default::default() };
    // Defaults as MATLAB gives them.
    let d = |c: &mut Control, k: &str, v: Value| {
        c.props.insert(k.into(), to_prop(&v));
    };
    if component {
        match style.as_str() {
            "button" => d(&mut c, "Text", Value::Str("Button".into())),
            "statebutton" => {
                d(&mut c, "Text", Value::Str("State Button".into()));
                d(&mut c, "Value", Value::boolean(false));
            }
            "label" => d(&mut c, "Text", Value::Str("Label".into())),
            "slider" | "gauge" => {
                d(&mut c, "Limits", Value::row(vec![0.0, 100.0]));
                d(&mut c, "Value", Value::num(0.0));
            }
            "spinner" => {
                d(&mut c, "Limits", Value::row(vec![f64::NEG_INFINITY, f64::INFINITY]));
                d(&mut c, "Value", Value::num(0.0));
                d(&mut c, "Step", Value::num(1.0));
            }
            "numericfield" => d(&mut c, "Value", Value::num(0.0)),
            "editfield" => d(&mut c, "Value", Value::Str(String::new())),
            "textarea" => d(&mut c, "Value", Value::Str(String::new())),
            "checkbox" => {
                d(&mut c, "Text", Value::Str("Check Box".into()));
                d(&mut c, "Value", Value::boolean(false));
            }
            "dropdown" => {
                let items: Vec<Value> = (1..=4).map(|k| Value::Str(format!("Option {k}"))).collect();
                d(&mut c, "Items", Value::Cell { r: 1, c: 4, items });
                d(&mut c, "Value", Value::Str("Option 1".into()));
            }
            "switch" => {
                d(&mut c, "Items", Value::Cell { r: 1, c: 2, items: vec![Value::Str("Off".into()), Value::Str("On".into())] });
                d(&mut c, "Value", Value::Str("Off".into()));
            }
            _ => {}
        }
    } else {
        d(&mut c, "String", Value::Str(String::new()));
        d(&mut c, "Value", Value::num(0.0));
        d(&mut c, "Min", Value::num(0.0));
        d(&mut c, "Max", Value::num(1.0));
    }
    // Stacked down the left edge until the script gives a position.
    let fig_h = f.props.get("Position").map(from_prop).and_then(|p| p.arr().ok()).and_then(|a| a.re.get(3).copied()).unwrap_or(if f.uifig { 480.0 } else { 420.0 });
    let slot = f.controls.iter().filter(|c| c.auto).count() as f64;
    let h = if style == "textarea" { 60.0 } else { 24.0 };
    d(&mut c, "Position", Value::row(vec![20.0, (fig_h - 44.0 - slot * 34.0).max(4.0), 170.0, h]));
    f.controls.push(c);
    let r = one_ref("control", it.figures[k].id, id);
    for (p, v) in ps {
        let key = prop_key(&p);
        if key == "Style" && !component {
            let st = v.text()?.to_ascii_lowercase();
            let st = match st.as_str() {
                "push" | "pushbutton" => "pushbutton",
                "popup" | "popupmenu" => "popupmenu",
                "edit" | "text" | "slider" | "checkbox" | "radiobutton" | "togglebutton" | "listbox" | "frame" => st.as_str(),
                other => return Err(format!("uicontrol: unknown style '{other}'")),
            }
            .to_string();
            let fig = &mut it.figures[k];
            let ctl = fig.controls.iter_mut().find(|c| c.id == id).unwrap();
            if st == "popupmenu" || st == "listbox" {
                ctl.props.insert("Value".into(), json!(1.0));
            }
            ctl.style = st;
            continue;
        }
        set_prop(it, &r, &p, v)?;
    }
    Ok(handle(it, vec![r]))
}

fn figure_props(it: &mut Interp, k: usize, ps: Vec<(String, Value)>) -> R<()> {
    let r = one_ref("figure", it.figures[k].id, 0);
    for (p, v) in ps {
        set_prop(it, &r, &p, v)?;
    }
    Ok(())
}

// ───────────────────────── callbacks

/// Runs a callback: a function handle (src, event), {handle, extra…}, or text to evaluate.
pub fn run_callback(it: &mut Interp, cb: &Value, src: Value, event: Value) -> R<()> {
    match cb {
        Value::Func(f) => {
            let want = match f {
                Func::Anon { params, .. } => {
                    if params.iter().any(|p| p == "varargin") { 2 } else { params.len() }
                }
                Func::User(u) => u.params.len(),
                Func::Named(n) => it.funcs.get(n).map(|u| u.params.len()).unwrap_or(2),
            };
            let args: Vec<Value> = vec![src, event].into_iter().take(want).collect();
            it.call_func(&f.clone(), args, 0)?;
        }
        Value::Cell { items, .. } if !items.is_empty() => {
            if let Value::Func(f) = &items[0] {
                let mut args = vec![src, event];
                args.extend(items[1..].iter().cloned());
                it.call_func(&f.clone(), args, 0)?;
            }
        }
        Value::Str(code) if !code.trim().is_empty() => {
            let prog = super::syntax::parse(code)?;
            it.run(&prog)?;
        }
        _ => {}
    }
    Ok(())
}

/// __uievent(figure, control, value): the desktop reports a change; the value is set and the callback runs.
fn ui_event(it: &mut Interp, a: &[Value]) -> R<()> {
    let (fid, cid) = (a.first().ok_or("__uievent: figure")?.scalar()? as u32, a.get(1).ok_or("__uievent: control")?.scalar()? as u32);
    let r = one_ref("control", fid, cid);
    let c = control(it, &r).ok_or("the control no longer exists")?.clone();
    let previous = c.props.get("Value").map(from_prop).unwrap_or_else(Value::empty);
    if let Some(v) = a.get(2) {
        let v = match (c.component, c.style.as_str()) {
            (false, "edit") => {
                set_prop(it, &r, "String", Value::Str(v.text()?))?;
                None
            }
            (true, "checkbox" | "statebutton") => Some(Value::boolean(v.truthy()?)),
            (true, "editfield" | "textarea" | "dropdown" | "switch") => Some(Value::Str(v.text()?)),
            (_, "pushbutton" | "button") => None,
            _ => Some(Value::num(v.scalar()?)),
        };
        if let Some(v) = v {
            set_prop(it, &r, "Value", v)?;
        }
    }
    let (cb_name, event) = if c.component {
        if c.style == "button" { ("ButtonPushedFcn", "ButtonPushed") } else { ("ValueChangedFcn", "ValueChanged") }
    } else {
        ("Callback", "Action")
    };
    let cb = c.callbacks.get(cb_name).cloned().unwrap_or_else(Value::empty);
    if cb.is_empty() && !matches!(cb, Value::Func(_)) {
        return Ok(());
    }
    let src = handle(it, vec![r.clone()]);
    let value = control(it, &r).and_then(|c| c.props.get("Value")).map(from_prop).unwrap_or_else(Value::empty);
    let evt = Value::Struct { r: 1, c: 1, fields: vec!["Source".into(), "EventName".into(), "Value".into(), "PreviousValue".into()], items: vec![vec![src.clone(), Value::Str(event.into()), value, previous]] };
    run_callback(it, &cb, src, evt)
}

// ───────────────────────── findobj

fn all_refs(it: &Interp, only: Option<u32>) -> Vec<GRef> {
    let mut out = Vec::new();
    for f in it.figures.iter().filter(|f| only.map_or(true, |id| f.id == id)) {
        out.push(one_ref("figure", f.id, 0));
        out.push(one_ref("axes", f.id, 0));
        out.extend(f.series.iter().map(|s| one_ref("line", f.id, s.id)));
        out.extend(f.surfaces.iter().map(|s| one_ref("surface", f.id, s.id)));
        out.extend(f.annots.iter().map(|s| one_ref("annot", f.id, s.id)));
        out.extend(f.controls.iter().map(|s| one_ref("control", f.id, s.id)));
    }
    out
}

fn matches_prop(have: &Value, want: &Value) -> bool {
    match (have, want) {
        (Value::Str(a), Value::Str(b)) => a.eq_ignore_ascii_case(b),
        _ => super::builtins::values_equal(have, want),
    }
}

// ───────────────────────── dispatch

/// Graphics functions; None when `name` is not one (or plotting is being delegated back).
pub fn call(it: &mut Interp, name: &str, args: &[Value], nargout: usize) -> Option<R<Vec<Value>>> {
    let known = matches!(
        name,
        "figure" | "uifigure" | "gcf" | "gca" | "gco" | "groot" | "close" | "clf" | "cla" | "axes" | "uiaxes" | "set" | "get" | "delete" | "isvalid" | "ishandle" | "isgraphics" | "ishghandle" | "findobj" | "findall"
            | "allchild" | "xlim" | "ylim" | "zlim" | "grid" | "axis" | "text" | "xline" | "yline" | "line" | "uicontrol" | "uibutton" | "uislider" | "uilabel" | "uieditfield" | "uidropdown" | "uicheckbox"
            | "uispinner" | "uitextarea" | "uigauge" | "uiswitch" | "uipanel" | "uigridlayout" | "uitabgroup" | "uitab" | "msgbox" | "errordlg" | "warndlg" | "helpdlg" | "uialert" | "uiconfirm" | "questdlg"
            | "inputdlg" | "listdlg" | "uigetfile" | "uiputfile" | "uigetdir" | "drawnow" | "uiwait" | "uiresume" | "waitfor" | "refreshdata" | "shg" | "movegui" | "__uievent" | "title" | "xlabel" | "ylabel"
            | "legend" | "hold" | "subtitle" | "class" | "isprop" | "properties" | "fieldnames"
    ) || PLOTS.contains(&name);
    if !known || it.gfx_inner {
        return None;
    }
    let mut a: Vec<Value> = args.to_vec();
    // An axes or figure first: draw there.
    if (PLOTS.contains(&name) || TAKES_AXES.contains(&name)) && a.first().is_some_and(|v| refs(v).is_some_and(|r| r.len() == 1 && matches!(r[0].kind.as_str(), "axes" | "figure"))) {
        let r = refs(&a[0]).unwrap()[0].clone();
        if let Err(e) = select(it, &r) {
            return Some(Err(e));
        }
        a.remove(0);
    }
    let r = (|| -> R<Option<Vec<Value>>> {
        let any_gfx = a.first().is_some_and(is_gfx);
        Ok(Some(match name {
            "class" | "isprop" | "properties" | "fieldnames" if !any_gfx => return Ok(None),
            "class" => vec![Value::Str(match &a[0] { Value::Obj(o) => o.class.clone(), _ => String::new() })],
            "isprop" => {
                let r = refs(&a[0]).unwrap();
                let p = a.get(1).map(|v| v.text()).transpose()?.unwrap_or_default();
                vec![Value::boolean(r.first().is_some_and(|r| get_prop(it, r, &p).is_ok()))]
            }
            "properties" | "fieldnames" => {
                let r = refs(&a[0]).unwrap().first().cloned().ok_or("an empty graphics array")?;
                let Value::Struct { fields, .. } = get_all(it, &r) else { unreachable!() };
                if nargout == 0 && name == "properties" {
                    let t = format!("\nProperties for class {}:\n\n{}\n", class_of(it, &r), fields.iter().map(|p| format!("    {p}")).collect::<Vec<_>>().join("\n"));
                    it.print(&t);
                    return Ok(Some(Vec::new()));
                }
                vec![Value::Cell { r: fields.len(), c: 1, items: fields.into_iter().map(Value::Str).collect() }]
            }
            "figure" | "uifigure" => {
                let component = name == "uifigure";
                // figure(n) or figure(h) selects (or makes figure n).
                if let Some(first) = a.first().filter(|v| !matches!(v, Value::Str(_))) {
                    let id = match refs(first) {
                        Some(r) => r.first().map(|r| r.fig).ok_or("figure: an empty handle")?,
                        None => first.scalar()?.max(1.0) as u32,
                    };
                    ensure_ids(it);
                    let k = match fig_index(it, id) {
                        Some(k) => k,
                        None => {
                            it.figures.push(Figure { id, uifig: component, ..Default::default() });
                            it.figures.len() - 1
                        }
                    };
                    it.current = k;
                    figure_props(it, k, pairs(&a, 1, name)?)?;
                    if nargout == 0 {
                        return Ok(Some(Vec::new()));
                    }
                    vec![handle(it, vec![one_ref("figure", it.figures[k].id, 0)])]
                } else {
                    ensure_ids(it);
                    let k = new_figure(it, component);
                    figure_props(it, k, pairs(&a, 0, name)?)?;
                    if nargout == 0 {
                        return Ok(Some(Vec::new()));
                    }
                    vec![handle(it, vec![one_ref("figure", it.figures[k].id, 0)])]
                }
            }
            "gcf" => {
                let k = current(it);
                vec![handle(it, vec![one_ref("figure", it.figures[k].id, 0)])]
            }
            "gca" | "axes" | "uiaxes" => {
                let k = if name == "gca" { current(it) } else { parent_of(it, &a, name == "uiaxes")?.0 };
                let start = if a.first().is_some_and(is_gfx) { 1 } else { 0 };
                let r = one_ref("axes", it.figures[k].id, 0);
                for (p, v) in pairs(&a, start, name)? {
                    set_prop(it, &r, &p, v)?;
                }
                if name == "uiaxes" && !it.figures[k].axes.contains_key("Position") {
                    it.figures[k].axes.insert("Position".into(), to_prop(&Value::row(vec![210.0, 40.0, 400.0, 300.0])));
                }
                vec![handle(it, vec![r])]
            }
            "gco" => vec![handle(it, Vec::new())],
            "groot" => vec![handle(it, Vec::new())],
            "close" => {
                ensure_ids(it);
                let all = matches!(a.first(), Some(Value::Str(s)) if s == "all");
                if all {
                    it.figures.clear();
                    it.current = 0;
                } else if !it.figures.is_empty() {
                    let ids: Vec<u32> = match a.first() {
                        Some(v) if is_gfx(v) => refs(v).unwrap().iter().map(|r| r.fig).collect(),
                        Some(v) if !matches!(v, Value::Str(_)) => v.arr()?.re.iter().map(|x| *x as u32).collect(),
                        _ => vec![it.figures[it.current.min(it.figures.len() - 1)].id],
                    };
                    it.figures.retain(|f| !ids.contains(&f.id));
                    it.current = it.figures.len().saturating_sub(1);
                }
                it.hold = false;
                Vec::new()
            }
            "clf" | "cla" => {
                let k = current(it);
                let f = &mut it.figures[k];
                f.series.clear();
                f.surfaces.clear();
                f.annots.clear();
                f.legend.clear();
                f.title.clear();
                f.xlabel.clear();
                f.ylabel.clear();
                f.axes.clear();
                if name == "clf" {
                    f.controls.clear();
                }
                Vec::new()
            }
            "set" => {
                let target = a.first().ok_or("set: give a graphics handle")?;
                let rs = refs(target).ok_or("set: the first argument must be a graphics handle")?.clone();
                // set(h, struct) or set(h, 'Name', value, …).
                let ps: Vec<(String, Value)> = match a.get(1) {
                    Some(Value::Struct { fields, items, .. }) => fields.iter().cloned().zip(items[0].iter().cloned()).collect(),
                    _ => pairs(&a, 1, "set")?,
                };
                for r in &rs {
                    for (p, v) in &ps {
                        set_prop(it, r, p, v.clone())?;
                    }
                }
                Vec::new()
            }
            "get" => {
                let target = a.first().ok_or("get: give a graphics handle")?;
                let rs = refs(target).ok_or("get: the first argument must be a graphics handle")?.clone();
                match a.get(1) {
                    None => {
                        if rs.len() != 1 {
                            return Err("get(h) needs a single object".into());
                        }
                        let all = get_all(it, &rs[0]);
                        if nargout == 0 {
                            let t = super::value::display("ans", &all).replacen("ans =\n", "", 1);
                            it.print(&t);
                            return Ok(Some(Vec::new()));
                        }
                        vec![all]
                    }
                    Some(p) => {
                        let names: Vec<String> = match p {
                            Value::Cell { items, .. } => items.iter().map(|x| x.text()).collect::<R<_>>()?,
                            other => vec![other.text()?],
                        };
                        if rs.len() == 1 && names.len() == 1 {
                            vec![get_prop(it, &rs[0], &names[0])?]
                        } else {
                            let mut items = Vec::new();
                            for n in &names {
                                for r in &rs {
                                    items.push(get_prop(it, r, n)?);
                                }
                            }
                            vec![Value::Cell { r: rs.len(), c: names.len(), items }]
                        }
                    }
                }
            }
            "delete" if any_gfx => {
                for r in refs(&a[0]).unwrap().clone() {
                    let Some(k) = fig_index(it, r.fig) else { continue };
                    if r.kind == "figure" {
                        it.figures.remove(k);
                        it.current = it.figures.len().saturating_sub(1);
                        continue;
                    }
                    let f = &mut it.figures[k];
                    match r.kind.as_str() {
                        "line" => f.series.retain(|s| s.id != r.item),
                        "surface" => f.surfaces.retain(|s| s.id != r.item),
                        "annot" => f.annots.retain(|s| s.id != r.item),
                        "control" => f.controls.retain(|s| s.id != r.item),
                        _ => {}
                    }
                }
                Vec::new()
            }
            "isvalid" | "ishandle" | "isgraphics" | "ishghandle" if any_gfx => {
                let rs = refs(&a[0]).unwrap();
                let v: Vec<bool> = rs.iter().map(|r| alive(it, r)).collect();
                vec![Value::Num(Arr::boolean(1, v.len(), v))]
            }
            "ishandle" | "isgraphics" | "ishghandle" => {
                // Figure numbers count as handles.
                let ok = match a.first() {
                    Some(Value::Num(x)) if x.len() == 1 => {
                        ensure_ids(it);
                        fig_index(it, x.re[0] as u32).is_some()
                    }
                    _ => false,
                };
                vec![Value::boolean(ok)]
            }
            "delete" | "isvalid" => return Ok(None),
            "findobj" | "findall" | "allchild" => {
                ensure_ids(it);
                let (scope, start) = match a.first().and_then(refs) {
                    Some(r) => (r.first().map(|r| r.fig), 1),
                    None => (None, 0),
                };
                if name == "allchild" {
                    let k = scope.and_then(|id| fig_index(it, id)).ok_or("allchild: give a figure")?;
                    return Ok(Some(vec![get_prop(it, &one_ref("figure", it.figures[k].id, 0), "Children")?]));
                }
                let ps = pairs(&a, start, name)?;
                let found: Vec<GRef> = all_refs(it, scope).into_iter().filter(|r| ps.iter().all(|(p, v)| get_prop(it, r, p).is_ok_and(|have| matches_prop(&have, v)))).collect();
                vec![handle(it, found)]
            }
            "xlim" | "ylim" | "zlim" => {
                let k = current(it);
                let key = format!("{}Lim", name[..1].to_ascii_uppercase());
                let r = one_ref("axes", it.figures[k].id, 0);
                match a.first() {
                    None => vec![get_prop(it, &r, &key)?],
                    Some(Value::Str(m)) if m == "auto" => {
                        it.figures[k].axes.remove(&key);
                        Vec::new()
                    }
                    Some(Value::Str(m)) if m == "manual" => Vec::new(),
                    Some(v) => {
                        set_prop(it, &r, &key, v.clone())?;
                        Vec::new()
                    }
                }
            }
            "grid" => {
                let k = current(it);
                let on = match a.first() {
                    Some(v) => !matches!(v.text()?.as_str(), "off"),
                    None => it.figures[k].axes.get("XGrid").and_then(J::as_str) != Some("on"),
                };
                let s = if on { "on" } else { "off" };
                it.figures[k].axes.insert("XGrid".into(), json!(s));
                it.figures[k].axes.insert("YGrid".into(), json!(s));
                Vec::new()
            }
            "axis" => {
                let k = current(it);
                match a.first() {
                    Some(Value::Num(x)) if x.len() >= 4 => {
                        let r = one_ref("axes", it.figures[k].id, 0);
                        set_prop(it, &r, "XLim", Value::row(x.re[0..2].to_vec()))?;
                        set_prop(it, &r, "YLim", Value::row(x.re[2..4].to_vec()))?;
                    }
                    Some(Value::Str(m)) => match m.as_str() {
                        "equal" | "image" | "square" => {
                            it.figures[k].axes.insert("DataAspectRatio".into(), json!("equal"));
                        }
                        "auto" | "tight" | "normal" => {
                            let ax = &mut it.figures[k].axes;
                            ax.remove("XLim");
                            ax.remove("YLim");
                            ax.remove("DataAspectRatio");
                        }
                        "off" | "on" => {
                            it.figures[k].axes.insert("Visible".into(), json!(m));
                        }
                        _ => {}
                    },
                    None if nargout > 0 => {
                        let r = one_ref("axes", it.figures[k].id, 0);
                        let (x, y) = (get_prop(it, &r, "XLim")?.arr()?.re, get_prop(it, &r, "YLim")?.arr()?.re);
                        return Ok(Some(vec![Value::row(vec![x[0], x[1], y[0], y[1]])]));
                    }
                    _ => {}
                }
                Vec::new()
            }
            "text" | "xline" | "yline" => {
                let k = current(it);
                let (x, y, label, start) = match name {
                    "text" => (a.first().ok_or("text: x, y and the text")?.scalar()?, a.get(1).ok_or("text: x, y and the text")?.scalar()?, a.get(2).ok_or("text: x, y and the text")?.text()?, 3),
                    _ => {
                        let v = a.first().ok_or(format!("{name}: give the value"))?.scalar()?;
                        // xline(v, 'r--', 'label')
                        let mut start = 1;
                        let mut style = None;
                        let mut label = String::new();
                        if let Some(Value::Str(s)) = a.get(1) {
                            if !LINE_PROPS.contains(&s.to_ascii_lowercase().as_str()) && !s.eq_ignore_ascii_case("label") {
                                style = Some(s.clone());
                                start = 2;
                                if let Some(Value::Str(l)) = a.get(2) {
                                    if (a.len() - 3) % 2 == 0 {
                                        label = l.clone();
                                        start = 3;
                                    }
                                }
                            }
                        }
                        let f = &mut it.figures[k];
                        let id = next_id(f);
                        let mut an = Annot { id, kind: name.into(), x: if name == "xline" { v } else { 0.0 }, y: if name == "yline" { v } else { 0.0 }, text: label, ..Default::default() };
                        if let Some(st) = style {
                            if let Some(c) = style_color(&st) {
                                an.props.insert("Color".into(), to_prop(&rgb(c)));
                            }
                            an.props.insert("LineStyle".into(), json!(style_line(&st)));
                        }
                        f.annots.push(an);
                        let r = one_ref("annot", f.id, id);
                        for (p, v) in pairs(&a, start, name)? {
                            set_prop(it, &r, &p, v)?;
                        }
                        return Ok(Some(if nargout > 0 { vec![handle(it, vec![r])] } else { Vec::new() }));
                    }
                };
                let f = &mut it.figures[k];
                let id = next_id(f);
                f.annots.push(Annot { id, kind: "text".into(), x, y, text: label, ..Default::default() });
                let r = one_ref("annot", f.id, id);
                for (p, v) in pairs(&a, start, name)? {
                    set_prop(it, &r, &p, v)?;
                }
                if nargout > 0 { vec![handle(it, vec![r])] } else { Vec::new() }
            }
            "line" => {
                // line(x, y) adds to the axes without clearing them.
                let hold = it.hold;
                it.hold = true;
                let r = plot_like(it, "plot", &a, nargout);
                it.hold = hold;
                return r.map(Some);
            }
            "title" | "xlabel" | "ylabel" | "subtitle" => {
                let k = current(it);
                if name == "subtitle" {
                    return Ok(Some(Vec::new()));
                }
                let t = match a.first() {
                    Some(Value::Cell { items, .. }) => items.iter().map(|x| x.text()).collect::<R<Vec<_>>>()?.join("\n"),
                    Some(v) => v.text()?,
                    None => String::new(),
                };
                let f = &mut it.figures[k];
                match name {
                    "xlabel" => f.xlabel = t,
                    "ylabel" => f.ylabel = t,
                    _ => {
                        if f.title.starts_with("subplot(") {
                            f.title = format!("{t} [{}]", f.title);
                        } else if let Some(p) = f.title.find(" [subplot(") {
                            f.title = format!("{t}{}", &f.title[p..]);
                        } else {
                            f.title = t;
                        }
                    }
                }
                let item = match name { "title" => 1, "xlabel" => 2, _ => 3 };
                let r = one_ref("label", f.id, item);
                for (p, v) in pairs(&a, 1, name)? {
                    if !p.eq_ignore_ascii_case("String") {
                        let _ = set_prop(it, &r, &p, v);
                    }
                }
                if nargout > 0 { vec![handle(it, vec![r])] } else { Vec::new() }
            }
            "legend" => {
                // legend(handles, names) names those lines; anything else goes to the plain legend.
                if any_gfx {
                    let rs = refs(&a[0]).unwrap().clone();
                    let names: Vec<String> = match a.get(1) {
                        Some(Value::Cell { items, .. }) => items.iter().map(|x| x.text()).collect::<R<_>>()?,
                        Some(_) => a[1..].iter().take_while(|v| matches!(v, Value::Str(s) if !s.eq_ignore_ascii_case("location"))).map(|v| v.text()).collect::<R<_>>()?,
                        None => rs.iter().map(|r| get_prop(it, r, "DisplayName").and_then(|v| v.text())).collect::<R<_>>()?,
                    };
                    for (r, n) in rs.iter().zip(&names) {
                        set_prop(it, r, "DisplayName", Value::Str(n.clone()))?;
                    }
                    let k = current(it);
                    it.figures[k].legend = names;
                    return Ok(Some(Vec::new()));
                }
                return delegate(it, name, &a);
            }
            "hold" => {
                if let Some(Value::Str(_)) | None = a.first() {
                    return delegate(it, name, &a);
                }
                Vec::new()
            }
            "uicontrol" => vec![make_control(it, &a, "pushbutton", false, name)?],
            "uibutton" | "uislider" | "uilabel" | "uieditfield" | "uidropdown" | "uicheckbox" | "uispinner" | "uitextarea" | "uigauge" | "uiswitch" => vec![make_control(it, &a, &name[2..], true, name)?],
            "uipanel" | "uigridlayout" | "uitabgroup" | "uitab" => {
                // Containers lay their children out on the figure itself.
                let (k, _) = parent_of(it, &a, true)?;
                vec![handle(it, vec![one_ref("figure", it.figures[k].id, 0)])]
            }
            "msgbox" | "errordlg" | "warndlg" | "helpdlg" | "uialert" => {
                let texts: Vec<String> = a.iter().filter(|v| !is_gfx(v)).take(2).map(|v| match v {
                    Value::Cell { items, .. } => items.iter().filter_map(|x| x.text().ok()).collect::<Vec<_>>().join("\n"),
                    other => other.text().unwrap_or_default(),
                }).collect();
                let kind = match name { "errordlg" => "error", "warndlg" => "warning", "helpdlg" => "help", _ => "info" };
                it.dialogs.push(json!({ "kind": kind, "message": texts.first().cloned().unwrap_or_default(), "title": texts.get(1).cloned().unwrap_or_default() }));
                if nargout > 0 { vec![handle(it, Vec::new())] } else { Vec::new() }
            }
            "questdlg" | "uiconfirm" => {
                // No one can answer while a script runs: the default answer is taken, as if pressed.
                let texts: Vec<String> = a.iter().filter(|v| !is_gfx(v)).filter_map(|v| v.text().ok()).collect();
                let options: Vec<String> = if name == "uiconfirm" {
                    let p = a.iter().position(|v| matches!(v, Value::Str(s) if s.eq_ignore_ascii_case("Options")));
                    p.and_then(|p| a.get(p + 1)).map(|v| match v { Value::Cell { items, .. } => items.iter().filter_map(|x| x.text().ok()).collect(), _ => Vec::new() }).unwrap_or_else(|| vec!["OK".into(), "Cancel".into()])
                } else if texts.len() > 2 {
                    texts[2..texts.len().saturating_sub(1).max(3)].to_vec()
                } else {
                    vec!["Yes".into(), "No".into(), "Cancel".into()]
                };
                let answer = if name == "questdlg" && texts.len() > 3 { texts.last().cloned().unwrap() } else { options.first().cloned().unwrap_or_default() };
                it.dialogs.push(json!({ "kind": "question", "message": texts.first().cloned().unwrap_or_default(), "title": texts.get(1).cloned().unwrap_or_default(), "answer": answer }));
                it.warnings.push(format!("{name}: answered '{answer}' (the default) — scripts cannot wait for a reply"));
                vec![Value::Str(answer)]
            }
            "inputdlg" => {
                let prompts: Vec<String> = match a.first() { Some(Value::Cell { items, .. }) => items.iter().filter_map(|x| x.text().ok()).collect(), Some(v) => vec![v.text()?], None => vec![String::new()] };
                let defaults: Vec<String> = match a.get(3) { Some(Value::Cell { items, .. }) => items.iter().filter_map(|x| x.text().ok()).collect(), _ => Vec::new() };
                let answers: Vec<Value> = (0..prompts.len()).map(|k| Value::Str(defaults.get(k).cloned().unwrap_or_default())).collect();
                it.warnings.push("inputdlg: the default answers were used — scripts cannot wait for a reply".into());
                vec![Value::Cell { r: answers.len(), c: 1, items: answers }]
            }
            "listdlg" => {
                it.warnings.push("listdlg: the first item was chosen — scripts cannot wait for a reply".into());
                vec![Value::num(1.0), Value::num(1.0)]
            }
            "uigetfile" | "uiputfile" | "uigetdir" => vec![Value::num(0.0), Value::num(0.0), Value::num(0.0)],
            "drawnow" | "uiwait" | "uiresume" | "waitfor" | "refreshdata" | "shg" | "movegui" => Vec::new(),
            "__uievent" => {
                ui_event(it, &a)?;
                Vec::new()
            }
            _ if PLOTS.contains(&name) => return plot_like(it, name, &a, nargout).map(Some),
            _ => return Ok(None),
        }))
    })();
    match r {
        Ok(Some(v)) => Some(Ok(v)),
        Ok(None) => {
            // Not ours after all (a non-graphics argument): the ordinary function, with the handle stripped.
            if a.len() != args.len() { delegate(it, name, &a).transpose() } else { None }
        }
        Err(e) => Some(Err(e)),
    }
}

fn delegate(it: &mut Interp, name: &str, a: &[Value]) -> R<Option<Vec<Value>>> {
    it.gfx_inner = true;
    let r = super::builtins::call(it, name, a.to_vec(), 0, false);
    it.gfx_inner = false;
    r.transpose()
}

/// plot() and friends through the ordinary functions, then the line properties and the handles.
fn plot_like(it: &mut Interp, name: &str, a: &[Value], nargout: usize) -> R<Vec<Value>> {
    let k = current(it);
    let before: Vec<u32> = it.figures[k].series.iter().map(|s| s.id).chain(it.figures[k].surfaces.iter().map(|s| s.id)).collect();
    // Line properties are applied here; the plain arguments go to the plotting function.
    let cut = a.iter().position(|v| matches!(v, Value::Str(s) if LINE_PROPS.contains(&s.to_ascii_lowercase().as_str()))).unwrap_or(a.len());
    let mut plain: Vec<Value> = a[..cut].to_vec();
    let ps = pairs(a, cut, name)?;
    if let Some((_, v)) = ps.iter().find(|(p, _)| p.eq_ignore_ascii_case("DisplayName")) {
        plain.push(Value::Str("DisplayName".into()));
        plain.push(v.clone());
    }
    delegate(it, name, &plain)?;
    ensure_ids(it);
    let k = it.current.min(it.figures.len().saturating_sub(1));
    let Some(f) = it.figures.get(k) else { return Ok(Vec::new()) };
    let mut fresh: Vec<GRef> = f.series.iter().filter(|s| !before.contains(&s.id)).map(|s| one_ref("line", f.id, s.id)).collect();
    fresh.extend(f.surfaces.iter().filter(|s| !before.contains(&s.id)).map(|s| one_ref("surface", f.id, s.id)));
    for r in fresh.iter().filter(|r| r.kind == "line") {
        for (p, v) in &ps {
            if !p.eq_ignore_ascii_case("DisplayName") {
                set_prop(it, r, p, v.clone())?;
            }
        }
    }
    Ok(if nargout > 0 { vec![handle(it, fresh)] } else { Vec::new() })
}

// ───────────────────────── session

pub fn ref_json(r: &GRef) -> J {
    json!([r.kind, r.fig, r.item])
}

pub fn json_ref(j: &J) -> Option<GRef> {
    let a = j.as_array()?;
    Some(GRef { kind: a.first()?.as_str()?.into(), fig: a.get(1)?.as_u64()? as u32, item: a.get(2)?.as_u64()? as u32 })
}

pub fn make_handle(class: String, refs: Vec<GRef>) -> Value {
    Value::Obj(Rc::new(Object { class, data: ObjData::Gfx(refs) }))
}
