//! The M language (MATLAB / Octave scripts) as a node: the input table's
//! columns become variables, the script runs, and the workspace (numbers,
//! vectors, matrices, text, cells, structures) and every figure drawn with
//! plot / surf … come back as tables, grids and result values, with the
//! command window text.

pub mod builtins;
pub mod interp;
pub mod syntax;
pub mod value;

use crate::data::{Column, Dataset, Grid, Table};
use crate::expr::sanitize_name;
use crate::Ctx;
use value::{Arr, Value};

/// Parses and runs; returns the interpreter state (workspace, figures, text) or the error with the text so far.
pub fn run_with<'a>(code: &str, inputs: Vec<(String, Value)>, cancel: &'a dyn Fn() -> bool, host: &'a dyn crate::Host, seed: u64) -> Result<interp::Interp<'a>, (String, String)> {
    let prog = syntax::parse(code).map_err(|e| (e, String::new()))?;
    let mut it = interp::Interp::new(cancel, host, seed);
    for (n, v) in inputs {
        it.set_var(&n, v);
    }
    match it.run(&prog) {
        Ok(()) => Ok(it),
        Err(e) => {
            let (_, msg) = interp::split_error(&e);
            let shown = if e.starts_with("line ") { format!("{}{}", e.split(": ").next().map(|l| format!("{l}: ")).unwrap_or_default(), msg) } else { msg };
            Err((shown, it.out.clone()))
        }
    }
}

pub fn script(ctx: &mut Ctx) -> Result<Dataset, String> {
    let code = ctx.str("code", "");
    if code.trim().is_empty() {
        return Err("write the M script (MATLAB/Octave)".into());
    }
    // The input table's columns as variables, the whole table as a structure `data`, upstream results as variables.
    let mut inputs: Vec<(String, Value)> = Vec::new();
    if let Some(d) = ctx.input("in") {
        if let Ok(t) = d.pick_table(&ctx.str("table", "")) {
            let mut fields = Vec::new();
            let mut vals = Vec::new();
            for c in &t.columns {
                let name = sanitize_name(&c.name);
                let v = match &c.labels {
                    Some(l) => Value::Cell { r: l.len(), c: 1, items: l.iter().map(|s| Value::Str(s.clone())).collect() },
                    None => Value::Num(Arr::col(c.values.clone())),
                };
                inputs.push((name.clone(), v.clone()));
                fields.push(name);
                vals.push(v);
            }
            inputs.push(("data".into(), Value::Struct { r: 1, c: 1, fields, items: vec![vals] }));
        }
        for s in &d.scalars {
            inputs.push((sanitize_name(&s.name), Value::num(s.value)));
        }
    }
    let seed = ctx.int("seed", 1)?.max(0) as u64;
    let cancel = ctx.cancel;
    let host = ctx.host;
    let it = match run_with(&code, inputs.clone(), cancel, host, seed) {
        Ok(it) => it,
        Err((e, out)) => {
            return Err(if out.trim().is_empty() { e } else { format!("{e}\n--- output so far ---\n{}", tail(&out, 1500)) });
        }
    };
    for w in &it.warnings {
        ctx.warn(w.clone());
    }
    let mut out = Dataset::default();
    // Figures first: what the script drew.
    for (k, fig) in it.figures.iter().enumerate() {
        let title = if fig.title.is_empty() { format!("Figure {}", k + 1) } else { fig.title.clone() };
        if !fig.series.is_empty() {
            let same_x = fig.series.iter().all(|s| s.x == fig.series[0].x);
            if same_x {
                let xname = if fig.xlabel.is_empty() { "x".to_string() } else { fig.xlabel.clone() };
                let mut t = Table::new(&title).with_x(Column::new(&xname, "", fig.series[0].x.clone()));
                for (q, s) in fig.series.iter().enumerate() {
                    let name = if fig.series.len() == 1 && !fig.ylabel.is_empty() && s.name.starts_with('y') && s.name[1..].chars().all(|c| c.is_ascii_digit()) { fig.ylabel.clone() } else { s.name.clone() };
                    let name = if t.find(&name).is_some() { format!("{name}_{q}") } else { name };
                    let mut v = s.y.clone();
                    v.resize(fig.series[0].x.len(), f64::NAN);
                    t.push(Column::new(&name, "", v));
                }
                out.tables.push(t);
            } else {
                for s in &fig.series {
                    let mut t = Table::new(&format!("{title}: {}", s.name)).with_x(Column::new(if fig.xlabel.is_empty() { "x" } else { &fig.xlabel }, "", s.x.clone()));
                    let mut v = s.y.clone();
                    v.resize(s.x.len(), f64::NAN);
                    t.push(Column::new(&s.name, "", v));
                    out.tables.push(t);
                }
            }
        }
        for s in &fig.surfaces {
            out.grids.push(Grid { name: format!("{title}: {}", s.name), x: s.x.clone(), y: s.y.clone(), z: s.z.clone(), x_label: if fig.xlabel.is_empty() { "x".into() } else { fig.xlabel.clone() }, y_label: if fig.ylabel.is_empty() { "y".into() } else { fig.ylabel.clone() }, z_label: "z".into(), x_names: None, y_names: None });
        }
    }
    // The workspace (inputs left out unless the script changed them).
    let wanted: Vec<String> = ctx.str("variables", "").split([',', ' ', ';', '\n']).map(str::trim).filter(|s| !s.is_empty()).map(String::from).collect();
    let mut names: Vec<&String> = it.workspace().keys().filter(|n| n.as_str() != "ans" && (wanted.is_empty() || wanted.contains(n))).collect();
    names.sort();
    let mut vars = Vec::new();
    for n in names {
        let v = &it.workspace()[n];
        if wanted.is_empty() {
            if let Some((_, orig)) = inputs.iter().find(|(k, _)| k == n) {
                if builtins::values_equal(orig, v) {
                    continue;
                }
            }
        }
        if let Some(m) = builtins::value_to_mat(v) {
            vars.push((n.clone(), m));
        }
    }
    let ws = crate::matfile::to_dataset(&vars);
    out.tables.extend(ws.tables);
    out.grids.extend(ws.grids);
    out.scalars.extend(ws.scalars.into_iter().filter(|s| s.name != "variables"));
    let mut text = it.out.clone();
    if !ws.text.is_empty() {
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(&ws.text);
    }
    out.text = tail(&text, 20_000);
    out.scalar("statements run", it.steps as f64, "");
    Ok(out)
}

fn tail(s: &str, n: usize) -> String {
    let count = s.chars().count();
    if count <= n {
        s.to_string()
    } else {
        format!("…{}", s.chars().skip(count - n).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(code: &str) -> interp::Interp<'static> {
        static NO: fn() -> bool = || false;
        static HOST: crate::NoHost = crate::NoHost;
        match run_with(code, Vec::new(), &NO, &HOST, 1) {
            Ok(it) => it,
            Err((e, out)) => panic!("{e}\n{out}"),
        }
    }

    fn num(it: &interp::Interp, name: &str) -> f64 {
        it.workspace().get(name).unwrap_or_else(|| panic!("no {name}")).scalar().unwrap()
    }

    fn vector(it: &interp::Interp, name: &str) -> Vec<f64> {
        it.workspace()[name].arr().unwrap().re
    }

    #[test]
    fn arithmetic_and_matrices() {
        let it = run("A = [1 2; 3 4];\nB = A';\nC = A*B;\nd = det(A);\nx = A \\ [5; 6];\ne = A.^2 - 1;\nk = 2^-1;\nn = -2^2;\nr = 1:3;\ns = 10:-2:4;\nm = mean([1 2 3 4]);\nz = sqrt(-4);\n");
        assert_eq!(vector(&it, "C"), vec![5.0, 11.0, 11.0, 25.0]);
        assert!((num(&it, "d") + 2.0).abs() < 1e-12);
        let x = vector(&it, "x");
        assert!((x[0] + 4.0).abs() < 1e-12 && (x[1] - 4.5).abs() < 1e-12);
        assert_eq!(vector(&it, "e"), vec![0.0, 8.0, 3.0, 15.0]);
        assert_eq!((num(&it, "k"), num(&it, "n")), (0.5, -4.0));
        assert_eq!(vector(&it, "s"), vec![10.0, 8.0, 6.0, 4.0]);
        assert_eq!(num(&it, "m"), 2.5);
        let z = it.workspace()["z"].arr().unwrap();
        assert_eq!(z.im.unwrap()[0], 2.0);
    }

    #[test]
    fn indexing_assignment_and_growth() {
        let it = run("v = [];\nfor k = 1:5\n  v(k) = k^2;\nend\nv(end+1) = 0;\nw = v(v > 4);\nM = magic(4);\nc = M(2:3, [1 end]);\nM(:, 2) = [];\nq = numel(M);\nlast = v(end);\ns = 'hello';\nt = s([1 end]);\nu = upper(s(2:3));\n");
        assert_eq!(vector(&it, "v"), vec![1.0, 4.0, 9.0, 16.0, 25.0, 0.0]);
        assert_eq!(vector(&it, "w"), vec![9.0, 16.0, 25.0]);
        assert_eq!(vector(&it, "c"), vec![5.0, 9.0, 8.0, 12.0]);
        assert_eq!(num(&it, "q"), 12.0);
        assert_eq!(it.workspace()["t"].text().unwrap(), "ho");
        assert_eq!(it.workspace()["u"].text().unwrap(), "EL");
    }

    #[test]
    fn control_flow_functions_cells_structs() {
        let it = run("total = 0;\nk = 0;\nwhile true\n  k = k + 1;\n  if mod(k, 2) == 0, continue; end\n  total = total + k;\n  if k >= 9, break; end\nend\nswitch 'b'\n  case {'a', 'b'}\n    sw = 1;\n  otherwise\n    sw = 2;\nend\ntry\n  error('my:id', 'bad %d', 3);\ncatch err\n  msg = err.message;\nend\n[m, i] = maxk2([3 9 4]);\nf = @(x) x.^2 + 1;\ny = f(3);\ng = cellfun(@numel, {'ab', 'cde', ''});\ns.name = 'pump';\ns.flow(3) = 7;\np(2).val = 5;\nn = numel(p);\nc = {1, 'two', [3 4]};\nc{end+1} = 'x';\nlen = numel(c);\nfib = fibr(10);\nfunction [m, i] = maxk2(v)\n  [m, i] = max(v);\nend\nfunction r = fibr(n)\n  if n < 2\n    r = n;\n  else\n    r = fibr(n-1) + fibr(n-2);\n  end\nend\n");
        assert_eq!(num(&it, "total"), 25.0);
        assert_eq!(num(&it, "sw"), 1.0);
        assert_eq!(it.workspace()["msg"].text().unwrap(), "bad 3");
        assert_eq!((num(&it, "m"), num(&it, "i")), (9.0, 2.0));
        assert_eq!(num(&it, "y"), 10.0);
        assert_eq!(vector(&it, "g"), vec![2.0, 3.0, 0.0]);
        assert_eq!(num(&it, "n"), 2.0);
        assert_eq!(num(&it, "len"), 4.0);
        assert_eq!(num(&it, "fib"), 55.0);
        if let Value::Struct { fields, items, .. } = &it.workspace()["s"] {
            assert_eq!(fields, &vec!["name".to_string(), "flow".to_string()]);
            assert_eq!(items[0][1].arr().unwrap().re, vec![0.0, 0.0, 7.0]);
        } else {
            panic!("s is not a struct");
        }
    }

    #[test]
    fn numerics_ode_optimisation_and_output() {
        let it = run("[t, y] = ode45(@(t, y) [y(2); -y(1)], [0 pi], [1; 0]);\nyend = y(end, 1);\nr = fzero(@(x) cos(x) - x, [0 1]);\nxm = fminsearch(@(p) (p(1)-1)^2 + (p(2)+2)^2, [0 0]);\nq = integral(@(x) exp(-x.^2), -Inf, Inf);\np = polyfit(1:5, [2 4 6 8 10], 1);\nrt = roots([1 -3 2]);\nyi = interp1([0 1 2], [0 10 20], 1.5);\nfprintf('%d apples and %.2f pears\\n', 3, 2.5);\nX = fft([1 0 0 0]);\n[b, a] = butter(2, 0.5);\nK = lqr([0 1; 0 0], [0; 1], eye(2), 1);\nplot(t, y(:, 1)); hold on; plot(t, y(:, 2)); title('oscillator'); legend('x', 'v');\n");
        assert!((num(&it, "yend") + 1.0).abs() < 1e-3);
        assert!((num(&it, "r") - 0.7390851332).abs() < 1e-9);
        let xm = vector(&it, "xm");
        assert!((xm[0] - 1.0).abs() < 1e-4 && (xm[1] + 2.0).abs() < 1e-4);
        assert!((num(&it, "q") - std::f64::consts::PI.sqrt()).abs() < 1e-6);
        let p = vector(&it, "p");
        assert!((p[0] - 2.0).abs() < 1e-12 && p[1].abs() < 1e-10);
        assert_eq!(vector(&it, "rt"), vec![1.0, 2.0]);
        assert_eq!(num(&it, "yi"), 15.0);
        assert!(it.out.contains("3 apples and 2.50 pears"));
        assert_eq!(vector(&it, "X"), vec![1.0; 4]);
        // butter(2, 0.5): b = [0.2929 0.5858 0.2929], a = [1 0 0.1716].
        let b = vector(&it, "b");
        let a = vector(&it, "a");
        assert!((b[0] - 0.292893218813).abs() < 1e-9 && (a[2] - 0.171572875254).abs() < 1e-9 && a[1].abs() < 1e-12, "{b:?} {a:?}");
        let k = vector(&it, "K");
        assert!((k[0] - 1.0).abs() < 1e-9 && (k[1] - 3f64.sqrt()).abs() < 1e-9);
        assert_eq!(it.figures.len(), 1);
        assert_eq!(it.figures[0].series.len(), 2);
        assert_eq!(it.figures[0].series[1].name, "v");
        assert_eq!(it.figures[0].title, "oscillator");
    }

    #[test]
    fn everyday_idioms() {
        let code = r#"
x = [5 3 8 1 9 2];
col = x(:)';
tailv = x(end-1:end);
A = magic(3);
A(2, :) = [];
Z = zeros(size(A));
s1 = sprintf('%5.2f|', [1 2]);
parts = strsplit('a,b,c', ',');
np = num2str(pi, 4);
e1 = isempty([]);
big = any(x > 8) & ~isempty(x);
sq = arrayfun(@(k) k^2, 1:3);
up = cellfun(@(s) upper(s), {'ab', 'c'}, 'UniformOutput', false);
cs = cumsum(1:4);
ds = sort(x, 'descend');
first = find(x > 4, 1);
m = mod(-1, 3);
R = repmat([1 2], 2, 2);
B = [2 0; 0 4];
D = [1 2; 3 4] / B;
cnt = 3:-1:1;
greet = ['x = ' num2str(3)];
z = abs(3 + 4i);
w = exp(1i*pi);
[q, r] = deconv([1 5 6], [1 2]);
st = struct('a', {1, 2});
nst = numel(st);
has = isfield(st, 'a');
total = addall(1, 2, 3);
if numel(x) > 10
    branch = 1;
elseif numel(x) > 5
    branch = 2;
else
    branch = 3;
end
k = 0;
while k < numel(x) && x(k+1) ~= 1
    k = k + 1;
end
names = {};
names{end+1} = 'one';
names{end+1} = 'two';
joined = strjoin(names, '+');
M = eye(3); M(2, 3) = 7;
tr = M';
fprintf('%s=%d\n', 'n', 4);
function s = addall(varargin)
    s = 0;
    for i = 1:nargin
        s = s + varargin{i};
    end
end
"#;
        let it = run(code);
        assert_eq!(vector(&it, "col"), vec![5.0, 3.0, 8.0, 1.0, 9.0, 2.0]);
        assert_eq!(vector(&it, "tailv"), vec![9.0, 2.0]);
        assert_eq!(it.workspace()["A"].dims(), (2, 3));
        assert_eq!(it.workspace()["Z"].dims(), (2, 3));
        assert_eq!(it.workspace()["s1"].text().unwrap(), " 1.00| 2.00|");
        assert_eq!(it.workspace()["parts"].numel(), 3);
        assert_eq!(it.workspace()["np"].text().unwrap(), "3.142");
        assert_eq!(num(&it, "e1"), 1.0);
        assert_eq!(num(&it, "big"), 1.0);
        assert_eq!(vector(&it, "sq"), vec![1.0, 4.0, 9.0]);
        if let Value::Cell { items, .. } = &it.workspace()["up"] {
            assert_eq!(items[0].text().unwrap(), "AB");
        } else {
            panic!("up");
        }
        assert_eq!(vector(&it, "cs"), vec![1.0, 3.0, 6.0, 10.0]);
        assert_eq!(vector(&it, "ds"), vec![9.0, 8.0, 5.0, 3.0, 2.0, 1.0]);
        assert_eq!(num(&it, "first"), 1.0);
        assert_eq!(num(&it, "m"), 2.0);
        assert_eq!(it.workspace()["R"].dims(), (2, 4));
        assert_eq!(vector(&it, "D"), vec![0.5, 1.5, 0.5, 1.0]);
        assert_eq!(vector(&it, "cnt"), vec![3.0, 2.0, 1.0]);
        assert_eq!(it.workspace()["greet"].text().unwrap(), "x = 3");
        assert_eq!(num(&it, "z"), 5.0);
        let w = it.workspace()["w"].arr().unwrap();
        assert!((w.re[0] + 1.0).abs() < 1e-12 && w.im.map_or(0.0, |v| v[0]).abs() < 1e-12);
        assert_eq!(vector(&it, "q"), vec![1.0, 3.0]);
        assert_eq!(vector(&it, "r"), vec![0.0, 0.0, 0.0]);
        assert_eq!(num(&it, "nst"), 2.0);
        assert_eq!(num(&it, "has"), 1.0);
        assert_eq!(num(&it, "total"), 6.0);
        assert_eq!(num(&it, "branch"), 2.0);
        assert_eq!(num(&it, "k"), 3.0);
        assert_eq!(it.workspace()["joined"].text().unwrap(), "one+two");
        assert_eq!(it.workspace()["tr"].arr().unwrap().get(2, 1), 7.0);
        assert!(it.out.contains("n=4\n"));
    }

    #[test]
    fn calls_in_lists_give_one_value() {
        let it = run("s = [min([3 1 2]), max([3 1 2]), size([1 2 3])];\nn = numel(max([4 5]));\nc = {10, 20, 30};\nv = [c{:}];\nq = plus(c{2:3});\n");
        assert_eq!(vector(&it, "s"), vec![1.0, 3.0, 1.0, 3.0]);
        assert_eq!(num(&it, "n"), 1.0);
        assert_eq!(vector(&it, "v"), vec![10.0, 20.0, 30.0]);
        assert_eq!(num(&it, "q"), 50.0);
    }

    #[test]
    fn errors_name_the_line() {
        static NO: fn() -> bool = || false;
        static HOST: crate::NoHost = crate::NoHost;
        let e = run_with("x = 1;\ny = undefinedThing + 1;", Vec::new(), &NO, &HOST, 1).err().unwrap().0;
        assert!(e.contains("line 2") && e.contains("undefinedThing"), "{e}");
        let e = run_with("A = [1 2 3];\nb = A(5);", Vec::new(), &NO, &HOST, 1).err().unwrap().0;
        assert!(e.contains("exceeds"), "{e}");
    }
}
