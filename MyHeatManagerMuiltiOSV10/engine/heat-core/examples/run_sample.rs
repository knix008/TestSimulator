//! Run a .myheat file and print a summary (development aid).
//! cargo run --release --example run_sample -- <file.myheat> [<file2> …]
fn main() {
    for path in std::env::args().skip(1) {
        let json = std::fs::read_to_string(&path).expect("read model");
        let t = std::time::Instant::now();
        let bytes = heat_core::run(&json, &mut |_| {}, &|| false);
        let el = t.elapsed().as_secs_f64();
        let d = heat_core::decode(&bytes).expect("decode");
        if let Ok(dir) = std::env::var("HM_SAVE") {
            // Keep the raw result for `compare_results` (before/after checks).
            let name = std::path::Path::new(&path).file_stem().unwrap().to_string_lossy().to_string();
            std::fs::write(format!("{dir}/{name}.hmht"), &bytes).expect("save result");
        }
        let h = &d.header;
        println!(
            "{path}: ok={} {:.2} s  Tmax={:.10} vmax={:.4}  balance={}  log={}  warnings={}  error={}",
            h["ok"], el, d.stat("Tmax"), d.stat("vmax"), h["balance"]["error"], h["log"], h["warnings"], h["error"]
        );
        if std::env::var("HM_COLS").is_ok() {
            let (_, nx, ny, _, _, _, _) = d.grid();
            for name in ["T", "u", "nut"] {
                if let Some(f) = d.field(name, d.frames(name).saturating_sub(1)) {
                    let cols: Vec<String> = [0usize, 1, 2, 5, 10, nx / 2, nx - 1]
                        .iter()
                        .map(|&i| {
                            let m: f64 = (0..ny).map(|j| f[j * nx + i] as f64).sum::<f64>() / ny as f64;
                            format!("{i}:{m:.4}")
                        })
                        .collect();
                    println!("  {name} column means {}", cols.join(" "));
                }
            }
        }
        if std::env::var("HM_SHOW_BC").is_ok() {
            println!("  balance {}", h["balance"]);
            for b in h["boundaries"].as_array().unwrap() {
                let mut b = b.clone();
                b.as_object_mut().unwrap().remove("history");
                println!("  {b}");
            }
        }
    }
}
