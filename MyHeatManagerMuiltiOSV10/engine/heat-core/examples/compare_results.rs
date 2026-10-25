//! Compare two saved result files field by field (development aid).
//! cargo run --release --example compare_results -- <before.hmht> <after.hmht>
//! Prints, per field, the largest absolute difference relative to the field's
//! range, plus header statistics and boundary figures side by side.
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let a = heat_core::decode(&std::fs::read(&args[0]).expect("read a")).expect("decode a");
    let b = heat_core::decode(&std::fs::read(&args[1]).expect("read b")).expect("decode b");
    let fa = a.header["fields"].as_object().unwrap();
    let fb = b.header["fields"].as_object().unwrap();
    let mut worst: f64 = 0.0;
    for (name, _) in fa {
        if !fb.contains_key(name) {
            println!("  field {name}: missing in the second result");
            continue;
        }
        let fr = a.frames(name).min(b.frames(name));
        let mut md: f64 = 0.0;
        let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
        for f in 0..fr {
            let (x, y) = (a.field(name, f).unwrap(), b.field(name, f).unwrap());
            for (p, q) in x.iter().zip(y.iter()) {
                if p.is_finite() {
                    lo = lo.min(*p as f64);
                    hi = hi.max(*p as f64);
                }
                if p.is_finite() != q.is_finite() {
                    md = f64::INFINITY;
                } else if p.is_finite() {
                    md = md.max((p - q).abs() as f64);
                }
            }
        }
        let rel = md / (hi - lo).abs().max(1e-30);
        worst = worst.max(if name == "mat" { 0.0 } else { rel });
        println!("  field {name:8} max|diff| {md:.3e}  range {:.3e}  rel {rel:.2e}", hi - lo);
    }
    for k in ["Tmin", "Tmax", "vmax", "yPlusMax"] {
        println!("  stat {k:8} {:.8}  {:.8}", a.stat(k), b.stat(k));
    }
    println!("  balance {}  |  {}", a.header["balance"]["error"], b.header["balance"]["error"]);
    println!("  flow    {}  |  {}", a.header["flow"], b.header["flow"]);
    let ba = a.header["boundaries"].as_array().unwrap();
    let bb = b.header["boundaries"].as_array().unwrap();
    for (x, y) in ba.iter().zip(bb.iter()) {
        let pick = |v: &serde_json::Value| -> String {
            ["heat", "massFlow", "pressureAvg", "temperatureAvg"]
                .iter()
                .filter_map(|k| v.get(*k).and_then(|z| z.as_f64()).map(|z| format!("{k}={z:.6e}")))
                .collect::<Vec<_>>()
                .join(" ")
        };
        println!("  bc {:10} {}  |  {}", x["id"].as_str().unwrap_or(""), pick(x), pick(y));
    }
    println!("  log {}  |  {}", a.header["log"], b.header["log"]);
    println!("WORST relative field difference: {worst:.3e}");
}
