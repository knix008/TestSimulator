// cargo run --release --example runjobs -- <dir>: runs every job file and prints the time and a summary.
fn main() {
    let dir = std::env::args().nth(1).expect("dir");
    let mut files: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map_or(false, |x| x == "json")).collect();
    files.sort();
    for f in files {
        let text = std::fs::read_to_string(&f).unwrap();
        let t = std::time::Instant::now();
        // SIM_PROGRESS=1 prints the progress keys (with seconds) as they change.
        let verbose = std::env::var_os("SIM_PROGRESS").is_some();
        let mut last = String::new();
        let r = sim_core::run_job_json(&text, &mut |fr, k| { if verbose && k != last { eprintln!("  {:>7.1} s {:>5.1}% {k}", t.elapsed().as_secs_f64(), 100.0 * fr); last = k.to_string(); } true });
        let ms = t.elapsed().as_millis();
        match r {
            Ok(b) => { let (v, _) = sim_core::out::decode(&b).unwrap(); println!("OK   {:>7} ms  {:<16} nodes {:>7} q {:.3} {} max {}", ms, f.file_stem().unwrap().to_string_lossy(), v["mesh"]["nodes"], v["mesh"]["quality"]["min"].as_f64().unwrap_or(0.0), v["mesh"]["quality"]["histogram"], v["result"]["max"].to_string().chars().take(110).collect::<String>()); }
            Err(e) => println!("FAIL {:>7} ms  {:<16} {}", ms, f.file_stem().unwrap().to_string_lossy(), e),
        }
    }
}
