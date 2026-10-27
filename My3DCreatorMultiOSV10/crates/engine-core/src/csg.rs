use crate::types::{MeshData, Vec3};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum CsgOperation {
    Union,
    Difference,
    Intersection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsgSolid {
    pub mesh: MeshData,
}

impl CsgSolid {
    pub fn from_box(size: Vec3) -> Self {
        let (hx, hy, hz) = (size.x * 0.5, size.y * 0.5, size.z * 0.5);
        let mut mesh = MeshData::new();

        let corners = [
            [-hx, -hy,  hz], [ hx, -hy,  hz], [ hx,  hy,  hz], [-hx,  hy,  hz],
            [-hx, -hy, -hz], [ hx, -hy, -hz], [ hx,  hy, -hz], [-hx,  hy, -hz],
        ];

        for c in &corners {
            mesh.vertices.extend_from_slice(c);
            mesh.normals.extend_from_slice(&[0.0, 1.0, 0.0]);
            mesh.uvs.extend_from_slice(&[0.0, 0.0]);
        }

        let indices = [
            0, 1, 2, 0, 2, 3, // Front
            5, 4, 7, 5, 7, 6, // Back
            4, 0, 3, 4, 3, 7, // Left
            1, 5, 6, 1, 6, 2, // Right
            3, 2, 6, 3, 6, 7, // Top
            4, 5, 1, 4, 1, 0, // Bottom
        ];
        mesh.indices.extend_from_slice(&indices);

        Self { mesh }
    }
}
