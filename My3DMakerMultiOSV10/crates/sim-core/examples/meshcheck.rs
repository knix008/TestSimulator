// cargo run --release --example meshcheck -- <dir>: meshes every job and prints how far the surface
// nodes are from the true surface (in local element sizes) and the worst element quality.
fn main() {
    let dir = std::env::args().nth(1).expect("dir");
    let mut files: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map_or(false, |x| x == "json")).collect();
    files.sort();
    for f in files {
        let job: sim_core::model::Job = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap();
        let solids: Vec<sim_core::geom::Solid> = job.bodies.iter().map(|b| sim_core::geom::Solid::new(&b.shape).unwrap()).collect();
        let h = job.mesh.size;
        let model = sim_core::model::Model::build(job, &mut sim_core::Ctx::silent()).unwrap();
        let m = &model.mesh;
        let mut worst = 0.0f64;
        let mut bad = 0;
        let mut out_n = 0;
        for (ti, t) in m.tris.iter().enumerate() {
            let r = m.tri_region[ti] as usize;
            if r >= solids.len() { continue; }
            for &n in t {
                let sd = solids[r].sdf(m.nodes[n as usize]) / h;
                let d = sd.abs();
                if d > 0.34 { bad += 1; if sd > 0.0 { out_n += 1; } }
                worst = worst.max(d);
            }
        }
        let qmin = (0..m.tets.len()).map(|e| m.quality(e)).fold(1.0, f64::min);
        println!("{:<16} h {:>6.2} worst {:>5.2} h  off-surface nodes {:>4} (outside {:>4})  q min {:.3}", f.file_stem().unwrap().to_string_lossy(), h, worst, bad, out_n, qmin);
    }
}
