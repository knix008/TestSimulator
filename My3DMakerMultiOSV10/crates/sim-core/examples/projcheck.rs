// Debug: projection accuracy of surface nodes that end up off the surface.
fn main() {
    let f = std::env::args().nth(1).expect("job");
    let job: sim_core::model::Job = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap();
    let solid = sim_core::geom::Solid::new(&job.bodies[0].shape).unwrap();
    let h = job.mesh.size;
    let model = sim_core::model::Model::build(job, &mut sim_core::Ctx::silent()).unwrap();
    let m = &model.mesh;
    let mut shown = 0;
    for t in &m.tris {
        for &n in t {
            let p = m.nodes[n as usize];
            let d = solid.sdf(p);
            if d.abs() > 0.34 * h && shown < 8 {
                let q = solid.project(p, h * 1e-3);
                println!("p {:?} sdf {:.3} -> q {:?} sdf(q) {:.4} |q-p| {:.3}", p.map(|v| (v * 100.0).round() / 100.0), d / h, q.map(|v| (v * 100.0).round() / 100.0), solid.sdf(q) / h, sim_core::geom::norm(sim_core::geom::sub(q, p)) / h);
                shown += 1;
            }
        }
    }
}
