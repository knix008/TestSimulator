//! Output nodes for the dashboard: a chart (its settings are read by the
//! frontend; the data passes through) and a KPI tile (one value with limits).

use crate::data::{aggregate, Dataset};
use crate::Ctx;

pub fn plot(ctx: &mut Ctx) -> Result<Dataset, String> {
    Ok(ctx.need("in")?.clone())
}

pub fn kpi(ctx: &mut Ctx) -> Result<Dataset, String> {
    let data = ctx.need("in")?;
    let source = ctx.str("source", "");
    let how = ctx.str("aggregate", "last");
    let value = match data.get_scalar(&source) {
        Some(v) if !source.trim().is_empty() => v,
        _ => {
            let table = data.pick_table(&ctx.str("table", ""))?;
            let col = table.pick(&source)?;
            aggregate(&col.values, &how)?
        }
    };
    let lo = ctx.num("low", f64::NEG_INFINITY)?;
    let hi = ctx.num("high", f64::INFINITY)?;
    let scale = ctx.num("scale", 1.0)?;
    let v = value * scale;
    let status = if v < lo || v > hi { 2.0 } else { 0.0 };
    let mut d = Dataset::default();
    let unit = ctx.str("unit", "");
    let label = ctx.str("label", "KPI");
    d.scalar(&label, v, &unit).scalar("status", status, "");
    if status > 0.0 {
        d.text = format!("{label} = {} {unit} is outside {lo} … {hi}", crate::data::g(v, 6));
    }
    Ok(d)
}
