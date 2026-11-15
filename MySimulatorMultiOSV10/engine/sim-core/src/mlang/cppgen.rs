//! MATLAB / Octave script to C++. The generated program uses msim.hpp and
//! writes a JSON result (text, scalars, line charts, surfaces) for the GUI.
//! Constructs this translator does not cover produce an error that names them.

use super::syntax::{Bin, Expr, Function, Stmt};

pub const HEADER: &str = include_str!("../../cpp/msim.hpp");
pub const RUNTIME: &str = include_str!("../../cpp/msim.cpp");

pub fn generate(code: &str, seed: u64) -> Result<String, String> {
    let prog = super::syntax::parse(code)?;
    if !prog.classes.is_empty() {
        return Err("classdef is not in the C++ translation. Classes still run in the built-in MATLAB engine.".into());
    }
    let mut g = Gen { seq: 0 };
    let mut body = String::new();
    for f in &prog.functions {
        body.push_str(&g.function(f)?);
    }
    for stmt in &prog.body {
        body.push_str(&g.stmt(stmt, 2)?);
    }
    Ok(format!(
        "#include \"msim.hpp\"\n\nint main(int argc, char** argv) {{\n  msim::Ctx ctx;\n  ctx.seed_rng({seed}ull);\n  const char* out_path = argc > 1 ? argv[1] : \"result.json\";\n  try {{\n{body}    ctx.finish(out_path);\n  }} catch (const msim::ReturnSignal&) {{\n    ctx.finish(out_path);\n  }} catch (const std::exception& ex) {{\n    ctx.fail(out_path, ex.what());\n    return 1;\n  }}\n  return 0;\n}}\n"
    ))
}

struct Gen {
    seq: i32,
}

impl Gen {
    fn fresh(&mut self, prefix: &str) -> String {
        self.seq += 1;
        format!("{prefix}_{}", self.seq)
    }

    fn function(&mut self, f: &Function) -> Result<String, String> {
        let mut binds = String::new();
        for (i, p) in f.params.iter().enumerate() {
            binds.push_str(&format!("    ctx.bind({}, args.size() > {i} ? args[{i}] : msim::empty());\n", cpp_string(p)));
        }
        binds.push_str("    ctx.bind(\"nargin\", msim::num(static_cast<double>(args.size())));\n");
        let mut statements = String::new();
        for stmt in &f.body {
            statements.push_str(&self.stmt(stmt, 3)?);
        }
        let outs: Vec<String> = f.outputs.iter().map(|n| format!("ctx.get({})", cpp_string(n))).collect();
        let ret = if f.outputs.is_empty() { "msim::empty()".to_string() } else { format!("msim::pack({{{}}})", outs.join(", ")) };
        let name = cpp_string(&f.name);
        let nargin = f.params.len();
        Ok(format!(
            "    ctx.set({name}, msim::lambda({nargin}, [&](msim::Ctx& ctx, const std::vector<msim::Val>& args) -> msim::Val {{\n      msim::Frame frame(ctx);\n{binds}      msim::Val ret = msim::empty();\n      try {{\n{statements}        ret = {ret};\n      }} catch (const msim::ReturnSignal&) {{\n        ret = {ret};\n      }}\n      return ret;\n    }}));\n"
        ))
    }

    fn stmt(&mut self, stmt: &Stmt, indent: usize) -> Result<String, String> {
        let pad = "  ".repeat(indent);
        let marked = |line: usize| if line > 0 { format!("{pad}ctx.mark({line});\n") } else { String::new() };
        match stmt {
            Stmt::Expr(e, print, line) => {
                let expr = self.expr(e, 1)?;
                let show = if *print { format!("{pad}ctx.show(msim_ans);\n") } else { String::new() };
                let m = marked(*line);
                Ok(format!("{m}{pad}{{\n{pad}  msim::Val msim_ans = {expr};\n{pad}  ctx.set(\"ans\", msim_ans);\n{show}{pad}}}\n"))
            }
            Stmt::Assign(targets, rhs, print, line) => {
                let m = marked(*line);
                if targets.len() == 1 {
                    let rhs = self.expr(rhs, 1)?;
                    let Some(target) = &targets[0] else {
                        return Err(format!("line {line}: nothing to assign"));
                    };
                    let store = self.store(target, "msim_rhs", indent + 1)?;
                    let show = if *print { self.show_target(target, indent + 1)? } else { String::new() };
                    return Ok(format!("{m}{pad}{{\n{pad}  msim::Val msim_rhs = {rhs};\n{store}{show}{pad}}}\n"));
                }
                let nout = targets.len() as i32;
                let rhs = self.expr(rhs, nout)?;
                let mut lines = format!("{m}{pad}{{\n{pad}  msim::Val msim_mr = {rhs};\n");
                for (i, target) in targets.iter().enumerate() {
                    if let Some(t) = target {
                        let Expr::Ident(name) = t else {
                            return Err(format!("line {line}: only names can take one of several outputs in the C++ translation"));
                        };
                        let quoted = cpp_string(name);
                        lines.push_str(&format!("{pad}  ctx.set({quoted}, msim::nth(msim_mr, {i}));\n"));
                        if *print {
                            lines.push_str(&format!("{pad}  ctx.show_named({quoted}, ctx.get({quoted}));\n"));
                        }
                    }
                }
                lines.push_str(&format!("{pad}}}\n"));
                Ok(lines)
            }
            Stmt::If(arms, otherwise) => {
                let mut out = String::new();
                for (i, (cond, body)) in arms.iter().enumerate() {
                    let cond = self.expr(cond, 1)?;
                    let kw = if i == 0 { "if" } else { "else if" };
                    out.push_str(&format!("{pad}{kw} (msim::is_true({cond})) {{\n"));
                    for s in body {
                        out.push_str(&self.stmt(s, indent + 1)?);
                    }
                    out.push_str(&format!("{pad}}}\n"));
                }
                if !otherwise.is_empty() {
                    out.push_str(&format!("{pad}else {{\n"));
                    for s in otherwise {
                        out.push_str(&self.stmt(s, indent + 1)?);
                    }
                    out.push_str(&format!("{pad}}}\n"));
                }
                Ok(out)
            }
            Stmt::For(var, range, body, line) => {
                let Expr::Ident(name) = var else {
                    return Err(format!("line {line}: the C++ translation only loops over a name"));
                };
                let range = self.expr(range, 1)?;
                let seq = self.fresh("msim_seq");
                let n = self.fresh("msim_n");
                let k = self.fresh("msim_k");
                let quoted = cpp_string(name);
                let m = marked(*line);
                let mut out = format!("{m}{pad}{{\n{pad}  msim::Val {seq} = {range};\n{pad}  const int {n} = msim::ncolumns({seq});\n{pad}  for (int {k} = 0; {k} < {n}; ++{k}) {{\n{pad}    ctx.set({quoted}, msim::column({seq}, {k}));\n");
                for s in body {
                    out.push_str(&self.stmt(s, indent + 2)?);
                }
                out.push_str(&format!("{pad}  }}\n{pad}}}\n"));
                Ok(out)
            }
            Stmt::While(cond, body) => {
                let cond = self.expr(cond, 1)?;
                let guard = self.fresh("msim_guard");
                let mut out = format!("{pad}{{\n{pad}  int {guard} = 0;\n{pad}  while (msim::is_true({cond})) {{\n{pad}    if (++{guard} > 20000000) throw std::runtime_error(\"while loop exceeded 20000000 iterations\");\n");
                for s in body {
                    out.push_str(&self.stmt(s, indent + 2)?);
                }
                out.push_str(&format!("{pad}  }}\n{pad}}}\n"));
                Ok(out)
            }
            Stmt::Switch(subject, cases, otherwise) => {
                let subject = self.expr(subject, 1)?;
                let sw = self.fresh("msim_sw");
                let mut out = format!("{pad}{{\n{pad}  msim::Val {sw} = {subject};\n");
                for (i, (value, body)) in cases.iter().enumerate() {
                    let value = self.expr(value, 1)?;
                    let kw = if i == 0 { "if" } else { "else if" };
                    out.push_str(&format!("{pad}  {kw} (msim::switch_eq({sw}, {value})) {{\n"));
                    for s in body {
                        out.push_str(&self.stmt(s, indent + 2)?);
                    }
                    out.push_str(&format!("{pad}  }}\n"));
                }
                if !otherwise.is_empty() {
                    out.push_str(&format!("{pad}  else {{\n"));
                    for s in otherwise {
                        out.push_str(&self.stmt(s, indent + 2)?);
                    }
                    out.push_str(&format!("{pad}  }}\n"));
                }
                out.push_str(&format!("{pad}}}\n"));
                Ok(out)
            }
            Stmt::Try(body, var, handler) => {
                let mut out = format!("{pad}try {{\n");
                for s in body {
                    out.push_str(&self.stmt(s, indent + 1)?);
                }
                out.push_str(&format!("{pad}}} catch (const std::exception& msim_ex) {{\n"));
                if let Some(name) = var {
                    out.push_str(&format!("{pad}  ctx.set({}, msim::str(msim_ex.what()));\n", cpp_string(name)));
                }
                for s in handler {
                    out.push_str(&self.stmt(s, indent + 1)?);
                }
                out.push_str(&format!("{pad}}}\n"));
                Ok(out)
            }
            Stmt::Break => Ok(format!("{pad}break;\n")),
            Stmt::Continue => Ok(format!("{pad}continue;\n")),
            Stmt::Return => Ok(format!("{pad}throw msim::ReturnSignal();\n")),
            Stmt::Global(_) => Ok(String::new()),
        }
    }

    fn show_target(&self, target: &Expr, indent: usize) -> Result<String, String> {
        let pad = "  ".repeat(indent);
        if let Expr::Ident(name) = target {
            let quoted = cpp_string(name);
            return Ok(format!("{pad}ctx.show_named({quoted}, ctx.get({quoted}));\n"));
        }
        Ok(format!("{pad}ctx.show(msim_rhs);\n"))
    }

    fn store(&mut self, target: &Expr, rhs: &str, indent: usize) -> Result<String, String> {
        let pad = "  ".repeat(indent);
        match target {
            Expr::Ident(name) => Ok(format!("{pad}ctx.set({}, {rhs});\n", cpp_string(name))),
            Expr::Index(base, args) => {
                let Expr::Ident(name) = base.as_ref() else {
                    return Err("the C++ translation can assign into a name, a name(index), a cell or a field".into());
                };
                let subs = self.subs(args)?;
                Ok(format!("{pad}ctx.set_index_lazy({}, {{{subs}}}, {rhs});\n", cpp_string(name)))
            }
            Expr::CellIndex(base, args) => {
                let Expr::Ident(name) = base.as_ref() else {
                    return Err("the C++ translation can assign into a cell through its name".into());
                };
                let subs = self.subs(args)?;
                Ok(format!("{pad}ctx.set_cell_lazy({}, {{{subs}}}, {rhs});\n", cpp_string(name)))
            }
            Expr::Field(base, field) => {
                let Expr::Ident(name) = base.as_ref() else {
                    return Err("the C++ translation can assign one level of struct fields".into());
                };
                Ok(format!("{pad}ctx.set_field({}, {}, {rhs});\n", cpp_string(name), cpp_string(field)))
            }
            _ => Err("this left-hand side is not in the C++ translation".into()),
        }
    }

    fn subs(&mut self, args: &[Expr]) -> Result<String, String> {
        let mut parts = Vec::new();
        for a in args {
            let expr = self.expr(a, 1)?;
            parts.push(format!("[&](msim::Ctx& ctx) {{ return {expr}; }}"));
        }
        Ok(parts.join(", "))
    }

    fn expr(&mut self, e: &Expr, nargout: i32) -> Result<String, String> {
        match e {
            Expr::Num(v) => Ok(num_literal(*v)),
            Expr::Imag(v) => Ok(format!("msim::imag_num({})", num_token(*v))),
            Expr::Str(s) => Ok(format!("msim::str({})", cpp_string(s))),
            Expr::Colon => Ok("msim::all()".into()),
            Expr::End => Ok("msim::end_mark(ctx)".into()),
            Expr::Ident(name) => Ok(format!("ctx.get({})", cpp_string(name))),
            Expr::Matrix(rows) => {
                if rows.is_empty() {
                    return Ok("msim::empty()".into());
                }
                let mut parts = Vec::new();
                for row in rows {
                    let mut items = Vec::new();
                    for x in row {
                        items.push(self.expr(x, 1)?);
                    }
                    parts.push(format!("msim::horzcat({{{}}})", items.join(", ")));
                }
                Ok(format!("msim::vertcat({{{}}})", parts.join(", ")))
            }
            Expr::Cell(rows) => {
                if rows.is_empty() {
                    return Ok("msim::make_cell({})".into());
                }
                let mut parts = Vec::new();
                for row in rows {
                    let mut items = Vec::new();
                    for x in row {
                        items.push(self.expr(x, 1)?);
                    }
                    parts.push(format!("msim::cell_row({{{}}})", items.join(", ")));
                }
                Ok(format!("msim::make_cell({{{}}})", parts.join(", ")))
            }
            Expr::Range(a, step, b) => {
                let start = self.expr(a, 1)?;
                let stop = self.expr(b, 1)?;
                let step = match step {
                    Some(s) => self.expr(s, 1)?,
                    None => "msim::empty()".into(),
                };
                Ok(format!("msim::colon({start}, {step}, {stop})"))
            }
            Expr::Bin(op, a, b) => self.binary(*op, a, b),
            Expr::Neg(a) => {
                let a = self.expr(a, 1)?;
                Ok(format!("msim::uminus({a})"))
            }
            Expr::Not(a) => {
                let a = self.expr(a, 1)?;
                Ok(format!("msim::unot({a})"))
            }
            Expr::Transpose(a, conj) => {
                let a = self.expr(a, 1)?;
                Ok(format!("msim::transpose({a}, {})", if *conj { "true" } else { "false" }))
            }
            Expr::Index(base, args) => {
                let Expr::Ident(name) = base.as_ref() else {
                    return Err("indexing a call result directly is not in the C++ translation; store it in a name first".into());
                };
                let subs = self.subs(args)?;
                Ok(format!("msim::index_or_call_lazy(ctx, {}, {{{subs}}}, {nargout})", cpp_string(name)))
            }
            Expr::CellIndex(base, args) => {
                let base = self.expr(base, 1)?;
                let subs = self.subs(args)?;
                Ok(format!("msim::cell_index_lazy(ctx, {base}, {{{subs}}})"))
            }
            Expr::Field(base, name) => {
                let base = self.expr(base, 1)?;
                Ok(format!("msim::field_get({base}, {})", cpp_string(name)))
            }
            Expr::DynField(base, key) => {
                let base = self.expr(base, 1)?;
                let key = self.expr(key, 1)?;
                Ok(format!("msim::dyn_field({base}, {key})"))
            }
            Expr::Anon(params, body) => {
                let body = self.expr(body, 1)?;
                let mut binds = String::new();
                for (i, p) in params.iter().enumerate() {
                    binds.push_str(&format!("ctx.bind({}, args.size() > {i} ? args[{i}] : msim::empty()); ", cpp_string(p)));
                }
                Ok(format!(
                    "msim::lambda({}, [&](msim::Ctx& ctx, const std::vector<msim::Val>& args) -> msim::Val {{ msim::Frame frame(ctx); {binds}return {body}; }})",
                    params.len()
                ))
            }
            Expr::Handle(name) => Ok(format!("msim::handle(ctx, {})", cpp_string(name))),
            Expr::SuperCall(_, _, _) => Err("class methods are not in the C++ translation".into()),
        }
    }

    fn binary(&mut self, op: Bin, a: &Expr, b: &Expr) -> Result<String, String> {
        if matches!(op, Bin::AndAnd | Bin::OrOr) {
            let name = if op == Bin::AndAnd { "andand" } else { "oror" };
            let left = self.expr(a, 1)?;
            let right = self.expr(b, 1)?;
            return Ok(format!("msim::{name}(ctx, [&](msim::Ctx& ctx) {{ return {left}; }}, [&](msim::Ctx& ctx) {{ return {right}; }})"));
        }
        let name = match op {
            Bin::Add => "add",
            Bin::Sub => "sub",
            Bin::Mul => "mul",
            Bin::Div => "div",
            Bin::LDiv => "ldiv",
            Bin::Pow => "pow",
            Bin::EMul => "emul",
            Bin::EDiv => "ediv",
            Bin::ELDiv => "eldiv",
            Bin::EPow => "epow",
            Bin::Eq => "cmp_eq",
            Bin::Ne => "cmp_ne",
            Bin::Lt => "cmp_lt",
            Bin::Le => "cmp_le",
            Bin::Gt => "cmp_gt",
            Bin::Ge => "cmp_ge",
            Bin::And => "band",
            Bin::Or => "bor",
            Bin::AndAnd | Bin::OrOr => unreachable!(),
        };
        let left = self.expr(a, 1)?;
        let right = self.expr(b, 1)?;
        Ok(format!("msim::{name}({left}, {right})"))
    }
}

fn num_literal(v: f64) -> String {
    format!("msim::num({})", num_token(v))
}

fn num_token(v: f64) -> String {
    if v.is_nan() {
        return "std::numeric_limits<double>::quiet_NaN()".into();
    }
    if v.is_infinite() {
        return if v.is_sign_negative() { "(-std::numeric_limits<double>::infinity())".into() } else { "std::numeric_limits<double>::infinity()".into() };
    }
    let mut s = format!("{:?}", v);
    if !s.contains('.') && !s.contains('e') && !s.contains('E') {
        s.push_str(".0");
    }
    s
}

fn cpp_string(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '\\' => o.push_str("\\\\"),
            '"' => o.push_str("\\\""),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

/// Every built-in MATLAB example the C++ runner must be able to translate.
pub fn examples() -> &'static [(&'static str, &'static str)] {
    &EXAMPLES
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn examples_translate() {
        for (name, code) in examples() {
            generate(code, 1).unwrap_or_else(|e| panic!("{name}: {e}"));
        }
    }
}

const EXAMPLES: &[(&str, &str)] = &[
    ("basics", "% Matrices, solving and eigenvalues\nA = [4 -2 1; -2 4 -2; 1 -2 4];\nb = [11; -16; 17];\nx = A \\ b\nlambda = eig(A)'\n[Q, R] = qr(A);\nresidual = norm(Q*R - A)\ncondition = cond(A)\nfprintf('det(A) = %.4f\\n', det(A));"),
    ("ode", "% Van der Pol oscillator with ode45\nmu = 2;\nf = @(t, y) [y(2); mu*(1 - y(1)^2)*y(2) - y(1)];\n[t, y] = ode45(f, [0 20], [2; 0]);\nplot(t, y(:, 1)); hold on; plot(t, y(:, 2));\ntitle('Van der Pol'); xlabel('t'); legend('x', 'dx/dt');\nperiod_estimate = mean(diff(t(find(diff(sign(y(:, 1))) > 0))))"),
    ("signal", "% Noisy two-tone signal, Butterworth low-pass, FFT\nfs = 1000; t = (0:999)/fs;\nx = sin(2*pi*50*t) + 0.5*sin(2*pi*200*t) + 0.2*randn(size(t));\n[b, a] = butter(4, 100/(fs/2));\ny = filtfilt(b, a, x);\nN = numel(x); f = (0:N/2-1)*fs/N;\nX = abs(fft(x))/N*2; Y = abs(fft(y))/N*2;\nplot(f, X(1:N/2)); hold on; plot(f, Y(1:N/2));\ntitle('Spectrum'); xlabel('f (Hz)'); legend('raw', 'filtered');\n[~, k] = max(Y(1:N/2)); peak_Hz = f(k)"),
    ("fit", "% Fit a cubic, interpolate with a spline\nx = 0:0.5:5;\ny = 2*x.^3 - 3*x.^2 + x + 1 + 0.5*sin(5*x);\np = polyfit(x, y, 3)\nxi = linspace(0, 5, 200);\nplot(xi, polyval(p, xi)); hold on;\nplot(xi, interp1(x, y, xi, 'spline'));\ntitle('Cubic fit and spline'); legend('polyfit', 'spline');\narea = integral(@(s) polyval(p, s), 0, 5)"),
    ("control", "% Mass-spring-damper with LQR state feedback\nm = 1; c = 0.2; k = 2;\nA = [0 1; -k/m -c/m]; B = [0; 1/m];\nK = lqr(A, B, diag([10 1]), 0.1)\nAcl = A - B*K;\npoles = eig(Acl)\n[t, x] = ode45(@(t, x) Acl*x, [0 10], [1; 0]);\nplot(t, x); title('Closed loop'); legend('position', 'velocity');"),
    ("surface", "% A surface over a grid\n[X, Y] = meshgrid(linspace(-3, 3, 41));\nZ = 3*(1 - X).^2 .* exp(-X.^2 - (Y + 1).^2) - 10*(X/5 - X.^3 - Y.^5) .* exp(-X.^2 - Y.^2) - 1/3*exp(-(X + 1).^2 - Y.^2);\nsurf(X, Y, Z); title('peaks');\n[zmax, k] = max(Z(:));\nfprintf('maximum %.3f at (%.2f, %.2f)\\n', zmax, X(k), Y(k));"),
    ("table", "t = (0:99)'/100;\ny = sin((0:99)'/10);\ndata = struct('t', t, 'y', y);\nvars = fieldnames(data)';\ndisp(vars);\ncols = struct2cell(data);\nfirst = cols{1};\nsummary = [mean(first), std(first), min(first), max(first)]\nnormalised = (first - mean(first)) / std(first);"),
    ("damped", "x = linspace(0, 2*pi, 100);\ny = sin(x) .* exp(-x/4);\nplot(x, y); title('damped sine');\npeak = max(y)"),
];
