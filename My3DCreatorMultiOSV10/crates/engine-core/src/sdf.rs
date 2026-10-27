use crate::types::Vec3;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SdfPrimitive {
    Sphere { radius: f32 },
    Box { size: Vec3 },
    Capsule { radius: f32, height: f32 },
    Torus { major_r: f32, minor_r: f32 },
    Cylinder { radius: f32, height: f32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SdfBlendOp {
    Union,
    Subtract,
    Intersect,
    SmoothUnion { smoothness: f32 },
    SmoothSubtract { smoothness: f32 },
    SmoothIntersect { smoothness: f32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdfNode {
    pub id: String,
    pub primitive: SdfPrimitive,
    pub position: Vec3,
    pub rotation: Vec3,
    pub op: SdfBlendOp,
    pub color: [f32; 3],
}

impl SdfNode {
    pub fn distance(&self, p: Vec3) -> f32 {
        // Transform p by local position
        let p_local = p.sub(&self.position);

        match &self.primitive {
            SdfPrimitive::Sphere { radius } => p_local.length() - radius,
            SdfPrimitive::Box { size } => {
                let q = Vec3::new(
                    p_local.x.abs() - size.x * 0.5,
                    p_local.y.abs() - size.y * 0.5,
                    p_local.z.abs() - size.z * 0.5,
                );
                let outside = Vec3::new(q.x.max(0.0), q.y.max(0.0), q.z.max(0.0)).length();
                let inside = q.x.max(q.y.max(q.z)).min(0.0);
                outside + inside
            }
            SdfPrimitive::Capsule { radius, height } => {
                let half_h = height * 0.5;
                let cy = p_local.y.clamp(-half_h, half_h);
                let diff = Vec3::new(p_local.x, p_local.y - cy, p_local.z);
                diff.length() - radius
            }
            SdfPrimitive::Torus { major_r, minor_r } => {
                let q_x = (p_local.x * p_local.x + p_local.z * p_local.z).sqrt() - major_r;
                let q_y = p_local.y;
                (q_x * q_x + q_y * q_y).sqrt() - minor_r
            }
            SdfPrimitive::Cylinder { radius, height } => {
                let d_x = (p_local.x * p_local.x + p_local.z * p_local.z).sqrt() - radius;
                let d_y = p_local.y.abs() - height * 0.5;
                let outside = Vec3::new(d_x.max(0.0), d_y.max(0.0), 0.0).length();
                let inside = d_x.max(d_y).min(0.0);
                outside + inside
            }
        }
    }
}

pub fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = (0.5 + 0.5 * (b - a) / k).clamp(0.0, 1.0);
    b * (1.0 - h) + a * h - k * h * (1.0 - h)
}

pub fn smax(a: f32, b: f32, k: f32) -> f32 {
    let h = (0.5 - 0.5 * (b - a) / k).clamp(0.0, 1.0);
    b * (1.0 - h) + a * h + k * h * (1.0 - h)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdfScene {
    pub nodes: Vec<SdfNode>,
}

impl SdfScene {
    pub fn new() -> Self {
        Self { nodes: Vec::new() }
    }

    pub fn evaluate(&self, p: Vec3) -> f32 {
        if self.nodes.is_empty() {
            return 1000.0;
        }

        let mut d = self.nodes[0].distance(p);

        for node in self.nodes.iter().skip(1) {
            let nd = node.distance(p);
            d = match node.op {
                SdfBlendOp::Union => d.min(nd),
                SdfBlendOp::Subtract => d.max(-nd),
                SdfBlendOp::Intersect => d.max(nd),
                SdfBlendOp::SmoothUnion { smoothness } => smin(d, nd, smoothness),
                SdfBlendOp::SmoothSubtract { smoothness } => smax(d, -nd, smoothness),
                SdfBlendOp::SmoothIntersect { smoothness } => smax(d, nd, smoothness),
            };
        }

        d
    }

    pub fn normal_at(&self, p: Vec3) -> Vec3 {
        let eps = 0.001;
        let d = self.evaluate(p);
        let nx = self.evaluate(Vec3::new(p.x + eps, p.y, p.z)) - d;
        let ny = self.evaluate(Vec3::new(p.x, p.y + eps, p.z)) - d;
        let nz = self.evaluate(Vec3::new(p.x, p.y, p.z + eps)) - d;
        Vec3::new(nx, ny, nz).normalize()
    }
}
