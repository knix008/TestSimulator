//! Linear and integer programming (MATLAB's linprog and intlinprog: a
//! two-phase simplex with branch and bound) and systems of nonlinear
//! equations (fsolve / fzero: Levenberg–Marquardt with a numerical Jacobian).

use crate::data::{format_number, Column, Dataset, Table};
use crate::expr::{constants, statements, valid_name, Expr};
use crate::Ctx;

struct LpVar {
    name: String,
    lo: f64,
    hi: f64,
    integer: bool,
}

/// "x: 0 .. 10 int" (range optional, default 0 .. ∞; "int" or "integer" marks integers).
fn parse_vars(text: &str, consts: &[(String, f64)]) -> Result<Vec<LpVar>, String> {
    let cn: Vec<String> = consts.iter().map(|c| c.0.clone()).collect();
    let cv: Vec<f64> = consts.iter().map(|c| c.1).collect();
    let num = |s: &str| -> Result<f64, String> {
        match s.trim() {
            "inf" | "+inf" | "∞" => Ok(f64::INFINITY),
            "-inf" | "-∞" => Ok(f64::NEG_INFINITY),
            t => Ok(Expr::with_names(t, &cn)?.value(&cv)),
        }
    };
    let mut out = Vec::new();
    for stmt in statements(&text.replace(',', ";")) {
        let (name, rest) = stmt.split_once(':').map(|(a, b)| (a.trim().to_string(), b.trim().to_string())).unwrap_or((stmt.trim().to_string(), String::new()));
        if !valid_name(&name) {
            return Err(format!("\"{name}\" cannot be a variable name"));
        }
        let (rest, integer) = match rest.strip_suffix("integer").or_else(|| rest.strip_suffix("int")) {
            Some(r) if r.is_empty() || r.ends_with(' ') => (r.trim().to_string(), true),
            _ => (rest.clone(), false),
        };
        let (lo, hi) = if rest.is_empty() {
            (0.0, f64::INFINITY)
        } else {
            let (a, b) = rest.split_once("..").ok_or_else(|| format!("\"{stmt}\": write the range as low .. high"))?;
            (num(a)?, num(b)?)
        };
        if lo > hi {
            return Err(format!("{name}: the lower bound is above the upper one"));
        }
        out.push(LpVar { name, lo, hi, integer });
    }
    if out.is_empty() {
        return Err("list the variables, e.g. x: 0 .. 10".into());
    }
    Ok(out)
}

/// The coefficients and constant of an expression that must be linear in the variables.
fn linear(e: &Expr, n: usize, base: &[f64], what: &str) -> Result<(Vec<f64>, f64), String> {
    let at = |x: &[f64]| {
        let mut v = base.to_vec();
        v[..n].copy_from_slice(x);
        e.value(&v)
    };
    let zero = vec![0.0; n];
    let c0 = at(&zero);
    let coef: Vec<f64> = (0..n).map(|j| {
        let mut x = zero.clone();
        x[j] = 1.0;
        at(&x) - c0
    }).collect();
    // Check at two other points.
    for scale in [3.7, -2.3] {
        let x: Vec<f64> = (0..n).map(|j| scale * (j as f64 + 1.0)).collect();
        let lin = c0 + coef.iter().zip(&x).map(|(a, b)| a * b).sum::<f64>();
        let v = at(&x);
        if (v - lin).abs() > 1e-7 * (1.0 + v.abs()) {
            return Err(format!("{what} is not linear in the variables"));
        }
    }
    Ok((coef, c0))
}

#[derive(Debug, Clone, PartialEq)]
enum Status {
    Optimal,
    Infeasible,
    Unbounded,
}

/// min cᵀx subject to A x ≤ b, E x = f, x ≥ 0 (dense two-phase simplex, Bland's rule).
fn simplex(c: &[f64], a: &[Vec<f64>], b: &[f64], e: &[Vec<f64>], f: &[f64]) -> (Status, Vec<f64>, f64) {
    let n = c.len();
    let m1 = a.len();
    let m2 = e.len();
    let m = m1 + m2;
    // Columns: x (n), slacks (m1), artificials (m). Rows made b ≥ 0.
    let cols = n + m1 + m;
    let mut t: Vec<Vec<f64>> = vec![vec![0.0; cols + 1]; m];
    let mut basis = vec![0usize; m];
    for i in 0..m {
        let (row, rhs, slack) = if i < m1 { (&a[i], b[i], Some(i)) } else { (&e[i - m1], f[i - m1], None) };
        let sign = if rhs < 0.0 { -1.0 } else { 1.0 };
        for j in 0..n {
            t[i][j] = sign * row[j];
        }
        if let Some(s) = slack {
            t[i][n + s] = sign;
        }
        t[i][n + m1 + i] = 1.0;
        t[i][cols] = sign * rhs;
        basis[i] = n + m1 + i;
    }
    let pivot = |t: &mut Vec<Vec<f64>>, basis: &mut Vec<usize>, r: usize, c: usize| {
        let p = t[r][c];
        for v in t[r].iter_mut() {
            *v /= p;
        }
        for i in 0..t.len() {
            if i != r {
                let k = t[i][c];
                if k != 0.0 {
                    for j in 0..t[i].len() {
                        t[i][j] -= k * t[r][j];
                    }
                }
            }
        }
        basis[r] = c;
    };
    // Runs the simplex on cost vector `cost` over the allowed columns; false = unbounded.
    let run = |t: &mut Vec<Vec<f64>>, basis: &mut Vec<usize>, cost: &[f64], allowed: usize| -> bool {
        for _ in 0..50_000 {
            // Reduced costs.
            let mut enter = None;
            for j in 0..allowed {
                if basis.contains(&j) {
                    continue;
                }
                let rc = cost[j] - (0..m).map(|i| cost[basis[i]] * t[i][j]).sum::<f64>();
                if rc < -1e-10 {
                    enter = Some(j);
                    break;
                }
            }
            let Some(c) = enter else { return true };
            let mut leave: Option<(usize, f64)> = None;
            for i in 0..m {
                if t[i][c] > 1e-12 {
                    let ratio = t[i][cols] / t[i][c];
                    if leave.is_none_or(|(li, lr)| ratio < lr - 1e-12 || ((ratio - lr).abs() <= 1e-12 && basis[i] < basis[li])) {
                        leave = Some((i, ratio));
                    }
                }
            }
            match leave {
                Some((r, _)) => pivot(t, basis, r, c),
                None => return false,
            }
        }
        true
    };
    // Phase 1: minimise the artificials.
    let mut cost1 = vec![0.0; cols];
    for j in n + m1..cols {
        cost1[j] = 1.0;
    }
    run(&mut t, &mut basis, &cost1, cols);
    let infeas: f64 = (0..m).filter(|&i| basis[i] >= n + m1).map(|i| t[i][cols]).sum();
    if infeas > 1e-7 {
        return (Status::Infeasible, vec![0.0; n], f64::NAN);
    }
    // Drive remaining (zero) artificials out of the basis.
    for i in 0..m {
        if basis[i] >= n + m1 {
            if let Some(j) = (0..n + m1).find(|&j| t[i][j].abs() > 1e-9 && !basis.contains(&j)) {
                pivot(&mut t, &mut basis, i, j);
            }
        }
    }
    // Phase 2.
    let mut cost2 = vec![0.0; cols];
    cost2[..n].copy_from_slice(c);
    if !run(&mut t, &mut basis, &cost2, n + m1) {
        return (Status::Unbounded, vec![0.0; n], f64::NEG_INFINITY);
    }
    let mut x = vec![0.0; n];
    for i in 0..m {
        if basis[i] < n {
            x[basis[i]] = t[i][cols];
        }
    }
    let obj = c.iter().zip(&x).map(|(p, q)| p * q).sum();
    (Status::Optimal, x, obj)
}

/// An LP in the user's variables: min cᵀx + c0, rows (coef, kind, rhs) with kind −1 ≤, 0 =, 1 ≥, bounds lo..hi.
struct Lp {
    c: Vec<f64>,
    rows: Vec<(Vec<f64>, i8, f64)>,
}

/// Solves with bounds by substitution (x = lo + x′, x = hi − x′ or x = x⁺ − x⁻).
fn solve_lp(lp: &Lp, lo: &[f64], hi: &[f64]) -> (Status, Vec<f64>, f64) {
    let n = lp.c.len();
    // Map each user variable to (column, sign, offset) or two columns for a free variable.
    let mut cols: Vec<Vec<(usize, f64)>> = Vec::new();
    let mut offset = vec![0.0; n];
    let mut ncol = 0;
    let mut extra_ub: Vec<(usize, f64)> = Vec::new();
    for j in 0..n {
        if lo[j].is_finite() {
            offset[j] = lo[j];
            cols.push(vec![(ncol, 1.0)]);
            if hi[j].is_finite() {
                extra_ub.push((ncol, hi[j] - lo[j]));
            }
            ncol += 1;
        } else if hi[j].is_finite() {
            offset[j] = hi[j];
            cols.push(vec![(ncol, -1.0)]);
            ncol += 1;
        } else {
            cols.push(vec![(ncol, 1.0), (ncol + 1, -1.0)]);
            ncol += 2;
        }
    }
    let expand = |coef: &[f64]| -> (Vec<f64>, f64) {
        let mut row = vec![0.0; ncol];
        let mut shift = 0.0;
        for j in 0..n {
            for &(k, s) in &cols[j] {
                row[k] += coef[j] * s;
            }
            shift += coef[j] * offset[j];
        }
        (row, shift)
    };
    let (c, _) = expand(&lp.c);
    let (mut a, mut b, mut e, mut f) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for (coef, kind, rhs) in &lp.rows {
        let (row, shift) = expand(coef);
        match kind {
            -1 => {
                a.push(row);
                b.push(rhs - shift);
            }
            1 => {
                a.push(row.iter().map(|v| -v).collect());
                b.push(shift - rhs);
            }
            _ => {
                e.push(row);
                f.push(rhs - shift);
            }
        }
    }
    for (k, ub) in extra_ub {
        let mut row = vec![0.0; ncol];
        row[k] = 1.0;
        a.push(row);
        b.push(ub);
    }
    let (status, xs, _) = simplex(&c, &a, &b, &e, &f);
    if status != Status::Optimal {
        return (status, vec![f64::NAN; n], f64::NAN);
    }
    let x: Vec<f64> = (0..n).map(|j| offset[j] + cols[j].iter().map(|&(k, s)| s * xs[k]).sum::<f64>()).collect();
    let obj = lp.c.iter().zip(&x).map(|(p, q)| p * q).sum();
    (Status::Optimal, x, obj)
}

/// Branch and bound on the integer variables (depth first, best-bound pruning).
fn branch_and_bound(lp: &Lp, lo: &[f64], hi: &[f64], integer: &[bool], nodes: &mut usize, best: &mut Option<(Vec<f64>, f64)>, cancel: &dyn Fn() -> bool) -> Result<(), String> {
    *nodes += 1;
    if *nodes > 20_000 {
        return Err("branch and bound stopped after 20 000 nodes".into());
    }
    if *nodes % 100 == 0 && cancel() {
        return Err("cancelled".into());
    }
    let (status, x, obj) = solve_lp(lp, lo, hi);
    if status == Status::Unbounded && best.is_none() {
        return Err("the relaxation is unbounded".into());
    }
    if status != Status::Optimal {
        return Ok(());
    }
    if let Some((_, b)) = best {
        if obj >= *b - 1e-9 {
            return Ok(());
        }
    }
    // The most fractional integer variable.
    let frac = (0..x.len()).filter(|&j| integer[j]).map(|j| (j, (x[j] - x[j].round()).abs())).filter(|(_, f)| *f > 1e-7).max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    match frac {
        None => {
            let xr: Vec<f64> = x.iter().enumerate().map(|(j, v)| if integer[j] { v.round() } else { *v }).collect();
            *best = Some((xr, obj));
        }
        Some((j, _)) => {
            let (fl, ce) = (x[j].floor(), x[j].ceil());
            let mut hi2 = hi.to_vec();
            hi2[j] = fl;
            let mut lo2 = lo.to_vec();
            lo2[j] = ce;
            // Explore the nearer branch first.
            if x[j] - fl < 0.5 {
                if fl >= lo[j] {
                    branch_and_bound(lp, lo, &hi2, integer, nodes, best, cancel)?;
                }
                if ce <= hi[j] {
                    branch_and_bound(lp, &lo2, hi, integer, nodes, best, cancel)?;
                }
            } else {
                if ce <= hi[j] {
                    branch_and_bound(lp, &lo2, hi, integer, nodes, best, cancel)?;
                }
                if fl >= lo[j] {
                    branch_and_bound(lp, lo, &hi2, integer, nodes, best, cancel)?;
                }
            }
        }
    }
    Ok(())
}

pub fn linprog(ctx: &mut Ctx) -> Result<Dataset, String> {
    let consts = constants(&ctx.str("constants", ""))?;
    let vars = parse_vars(&ctx.str("variables", "x: 0 .. inf\ny: 0 .. inf"), &consts)?;
    let n = vars.len();
    let mut names: Vec<String> = vars.iter().map(|v| v.name.clone()).collect();
    names.extend(consts.iter().map(|c| c.0.clone()));
    let mut base = vec![0.0; names.len()];
    for (i, c) in consts.iter().enumerate() {
        base[n + i] = c.1;
    }
    let maximize = ctx.str("goal", "minimize") == "maximize";
    let obj_text = ctx.str("objective", "-x - 2*y");
    let (c, c0) = linear(&Expr::with_names(&obj_text, &names)?, n, &base, "the objective")?;
    let c_min: Vec<f64> = if maximize { c.iter().map(|v| -v).collect() } else { c.clone() };
    let mut rows = Vec::new();
    let mut texts = Vec::new();
    for stmt in statements(&ctx.str("constraints", "x + y <= 4\nx + 3*y <= 6")) {
        let (op, kind) = if stmt.contains("<=") { ("<=", -1i8) } else if stmt.contains(">=") { (">=", 1) } else if stmt.contains("==") { ("==", 0) } else if stmt.contains('=') { ("=", 0) } else if stmt.contains('<') { ("<", -1) } else if stmt.contains('>') { (">", 1) } else {
            return Err(format!("\"{stmt}\" is not a constraint (use <=, >= or =)"));
        };
        let (l, r) = stmt.split_once(op).unwrap();
        let diff = Expr::with_names(&format!("({l}) - ({r})"), &names)?;
        let (coef, k0) = linear(&diff, n, &base, &format!("\"{stmt}\""))?;
        rows.push((coef, kind, -k0));
        texts.push(stmt.clone());
    }
    let lp = Lp { c: c_min.clone(), rows };
    let lo: Vec<f64> = vars.iter().map(|v| v.lo).collect();
    let hi: Vec<f64> = vars.iter().map(|v| v.hi).collect();
    let integer: Vec<bool> = vars.iter().map(|v| v.integer).collect();
    let any_int = integer.iter().any(|b| *b);
    let mut nodes = 0usize;
    let (status, x, obj) = if any_int {
        let mut best = None;
        branch_and_bound(&lp, &lo, &hi, &integer, &mut nodes, &mut best, ctx.cancel)?;
        match best {
            Some((x, o)) => (Status::Optimal, x, o),
            None => (Status::Infeasible, vec![f64::NAN; n], f64::NAN),
        }
    } else {
        solve_lp(&lp, &lo, &hi)
    };
    match status {
        Status::Infeasible => return Err("the problem is infeasible: no point satisfies every constraint".into()),
        Status::Unbounded => return Err("the problem is unbounded: the objective improves without limit".into()),
        Status::Optimal => {}
    }
    let value = if maximize { -obj } else { obj } + c0;
    let mut res = Table::new("optimum");
    res.push(Column::text("variable", vars.iter().map(|v| v.name.clone()).collect()));
    res.push(Column::new("value", "", x.clone()));
    res.push(Column::new("cost", "", c.clone()));
    res.push(Column::text("type", vars.iter().map(|v| if v.integer { "integer".into() } else { "continuous".into() }).collect()));
    // Constraint activity, slack and (LP only) the shadow price by re-solving with a nudged right side.
    let mut ct = Table::new("constraints");
    let activity: Vec<f64> = lp.rows.iter().map(|(coef, _, _)| coef.iter().zip(&x).map(|(a, b)| a * b).sum()).collect();
    ct.push(Column::text("constraint", texts.clone()));
    ct.push(Column::new("activity", "", activity.clone()));
    ct.push(Column::new("bound", "", lp.rows.iter().map(|r| r.2).collect()));
    ct.push(Column::new("slack", "", lp.rows.iter().zip(&activity).map(|(r, a)| match r.1 { -1 => r.2 - a, 1 => a - r.2, _ => 0.0 }).collect()));
    if !any_int {
        let mut prices = Vec::new();
        for i in 0..lp.rows.len() {
            let d = 1e-6 * lp.rows[i].2.abs().max(1.0);
            let mut lp2 = Lp { c: lp.c.clone(), rows: lp.rows.clone() };
            lp2.rows[i].2 += d;
            let (s2, _, o2) = solve_lp(&lp2, &lo, &hi);
            let price = if s2 == Status::Optimal { (o2 - obj) / d } else { f64::NAN };
            prices.push(if maximize { -price } else { price });
        }
        ct.push(Column::new("shadow price", "", prices));
    }
    let mut out = Dataset { tables: vec![res, ct], ..Default::default() };
    out.scalar("optimum", value, "");
    for (v, xv) in vars.iter().zip(&x) {
        out.scalar(&v.name, *xv, "");
    }
    if any_int {
        out.scalar("branch-and-bound nodes", nodes as f64, "");
    }
    out.text = format!("{} = {} at {}", if maximize { "max" } else { "min" }, format_number(value), vars.iter().zip(&x).map(|(v, xv)| format!("{} = {}", v.name, format_number(*xv))).collect::<Vec<_>>().join(", "));
    Ok(out)
}

// ───────────────────────── nonlinear equations

pub fn fsolve(ctx: &mut Ctx) -> Result<Dataset, String> {
    let consts = constants(&ctx.str("constants", ""))?;
    let start = constants(&ctx.str("variables", "x = 1, y = 1"))?;
    let n = start.len();
    if n == 0 {
        return Err("list the unknowns with starting values, e.g. x = 1, y = 1".into());
    }
    let mut names: Vec<String> = start.iter().map(|s| s.0.clone()).collect();
    names.extend(consts.iter().map(|c| c.0.clone()));
    let mut eqs = Vec::new();
    let mut texts = Vec::new();
    for stmt in statements(&ctx.str("equations", "x^2 + y^2 = 4\nx*y = 1")) {
        let src = match stmt.split_once('=') {
            Some((l, r)) if !r.starts_with('=') && !l.ends_with(['<', '>', '!']) => format!("({l}) - ({r})"),
            _ => stmt.clone(),
        };
        eqs.push(Expr::with_names(&src, &names)?);
        texts.push(stmt);
    }
    if eqs.is_empty() {
        return Err("write the equations, one per line (f(x) = g(x))".into());
    }
    let m = eqs.len();
    let mut base = vec![0.0; names.len()];
    for (i, c) in consts.iter().enumerate() {
        base[n + i] = c.1;
    }
    let resid = |x: &[f64]| -> Vec<f64> {
        let mut v = base.clone();
        v[..n].copy_from_slice(x);
        eqs.iter().map(|e| e.value(&v)).collect()
    };
    let tol = ctx.positive("tolerance", 1e-12)?;
    let max_iter = ctx.count("maxIterations", 200, 1, 100_000)?;
    let mut x: Vec<f64> = start.iter().map(|s| s.1).collect();
    let mut r = resid(&x);
    let norm = |r: &[f64]| r.iter().map(|v| v * v).sum::<f64>();
    let mut lambda = 1e-3;
    let mut iters = 0;
    let mut hist_it = vec![0.0];
    let mut hist_res = vec![norm(&r).sqrt()];
    for it in 1..=max_iter {
        iters = it;
        if norm(&r).sqrt() <= tol {
            break;
        }
        // Numerical Jacobian.
        let mut j = vec![vec![0.0; n]; m];
        for k in 0..n {
            let h = 1e-7 * x[k].abs().max(1.0);
            let mut xp = x.clone();
            xp[k] += h;
            let rp = resid(&xp);
            for i in 0..m {
                j[i][k] = (rp[i] - r[i]) / h;
            }
        }
        // (JᵀJ + λ diag) δ = −Jᵀr
        let mut improved = false;
        for _ in 0..30 {
            let mut a = vec![vec![0.0; n]; n];
            let mut g = vec![0.0; n];
            for p in 0..n {
                for q in 0..n {
                    a[p][q] = (0..m).map(|i| j[i][p] * j[i][q]).sum();
                }
                g[p] = -(0..m).map(|i| j[i][p] * r[i]).sum::<f64>();
            }
            for p in 0..n {
                a[p][p] += lambda * a[p][p].max(1e-12);
            }
            let Ok(d) = crate::linalg::solve(&a, &g) else {
                lambda *= 10.0;
                continue;
            };
            let xn: Vec<f64> = x.iter().zip(&d).map(|(a, b)| a + b).collect();
            let rn = resid(&xn);
            if norm(&rn) < norm(&r) || !norm(&r).is_finite() {
                x = xn;
                r = rn;
                lambda = (lambda * 0.3).max(1e-15);
                improved = true;
                break;
            }
            lambda *= 10.0;
        }
        hist_it.push(it as f64);
        hist_res.push(norm(&r).sqrt());
        if !improved {
            break;
        }
    }
    let res_norm = norm(&r).sqrt();
    let converged = res_norm <= tol.max(1e-9 * (1.0 + x.iter().fold(0.0f64, |a, v| a.max(v.abs()))));
    if !converged {
        ctx.warn(format!("not solved: the residual is {} (try another starting point)", format_number(res_norm)));
    }
    let mut sol = Table::new("solution");
    sol.push(Column::text("unknown", start.iter().map(|s| s.0.clone()).collect()));
    sol.push(Column::new("value", "", x.clone()));
    sol.push(Column::new("start", "", start.iter().map(|s| s.1).collect()));
    let mut rt = Table::new("residuals");
    rt.push(Column::text("equation", texts));
    rt.push(Column::new("residual", "", r.clone()));
    let mut ht = Table::new("history").with_x(Column::new("iteration", "", hist_it));
    ht.push(Column::new("|residual|", "", hist_res));
    let mut out = Dataset { tables: vec![sol, rt, ht], ..Default::default() };
    for (s, v) in start.iter().zip(&x) {
        out.scalar(&s.0, *v, "");
    }
    out.scalar("residual norm", res_norm, "").scalar("iterations", iters as f64, "").scalar("converged", if converged { 1.0 } else { 0.0 }, "");
    out.text = start.iter().zip(&x).map(|(s, v)| format!("{} = {}", s.0, format_number(*v))).collect::<Vec<_>>().join(", ");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simplex_textbook() {
        // max 3x + 5y, x ≤ 4, 2y ≤ 12, 3x + 2y ≤ 18 → x = 2, y = 6, 36.
        let lp = Lp { c: vec![-3.0, -5.0], rows: vec![(vec![1.0, 0.0], -1, 4.0), (vec![0.0, 2.0], -1, 12.0), (vec![3.0, 2.0], -1, 18.0)] };
        let (s, x, o) = solve_lp(&lp, &[0.0, 0.0], &[f64::INFINITY, f64::INFINITY]);
        assert_eq!(s, Status::Optimal);
        assert!((x[0] - 2.0).abs() < 1e-9 && (x[1] - 6.0).abs() < 1e-9 && (o + 36.0).abs() < 1e-9);
        // Equality and ≥ rows with a free variable: min x + y, x − y = 1, x + y ≥ 3, y free → x = 2, y = 1.
        let lp = Lp { c: vec![1.0, 1.0], rows: vec![(vec![1.0, -1.0], 0, 1.0), (vec![1.0, 1.0], 1, 3.0)] };
        let (s, x, _) = solve_lp(&lp, &[0.0, f64::NEG_INFINITY], &[f64::INFINITY, f64::INFINITY]);
        assert_eq!(s, Status::Optimal);
        assert!((x[0] - 2.0).abs() < 1e-9 && (x[1] - 1.0).abs() < 1e-9);
        // Infeasible.
        let lp = Lp { c: vec![1.0], rows: vec![(vec![1.0], -1, 1.0), (vec![1.0], 1, 2.0)] };
        assert_eq!(solve_lp(&lp, &[0.0], &[f64::INFINITY]).0, Status::Infeasible);
    }
}
