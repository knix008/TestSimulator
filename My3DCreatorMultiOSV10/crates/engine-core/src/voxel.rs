use crate::types::{MeshData, Vec3};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoxElement {
    pub id: String,
    pub name: String,
    pub from: Vec3,
    pub to: Vec3,
    pub origin: Vec3, // Pivot point
    pub rotation: Vec3,
    pub color: [f32; 4],
    pub visible: bool,
}

impl BoxElement {
    pub fn new(id: String, name: String, from: Vec3, to: Vec3) -> Self {
        let center = Vec3::new(
            (from.x + to.x) * 0.5,
            (from.y + to.y) * 0.5,
            (from.z + to.z) * 0.5,
        );
        Self {
            id,
            name,
            from,
            to,
            origin: center,
            rotation: Vec3::ZERO,
            color: [0.8, 0.8, 0.8, 1.0],
            visible: true,
        }
    }

    pub fn to_mesh_data(&self) -> MeshData {
        let mut mesh = MeshData::new();
        let (min, max) = (self.from, self.to);

        // 8 corners
        let corners = [
            Vec3::new(min.x, min.y, max.z), // 0: Front-bottom-left
            Vec3::new(max.x, min.y, max.z), // 1: Front-bottom-right
            Vec3::new(max.x, max.y, max.z), // 2: Front-top-right
            Vec3::new(min.x, max.y, max.z), // 3: Front-top-left
            Vec3::new(min.x, min.y, min.z), // 4: Back-bottom-left
            Vec3::new(max.x, min.y, min.z), // 5: Back-bottom-right
            Vec3::new(max.x, max.y, min.z), // 6: Back-top-right
            Vec3::new(min.x, max.y, min.z), // 7: Back-top-left
        ];

        // 6 faces (each has 4 vertices & 2 triangles)
        let faces = [
            ([0, 1, 2, 3], Vec3::new(0.0, 0.0, 1.0)),   // Front (+Z)
            ([5, 4, 7, 6], Vec3::new(0.0, 0.0, -1.0)),  // Back (-Z)
            ([4, 0, 3, 7], Vec3::new(-1.0, 0.0, 0.0)),  // Left (-X)
            ([1, 5, 6, 2], Vec3::new(1.0, 0.0, 0.0)),   // Right (+X)
            ([3, 2, 6, 7], Vec3::new(0.0, 1.0, 0.0)),   // Top (+Y)
            ([4, 5, 1, 0], Vec3::new(0.0, -1.0, 0.0)),  // Bottom (-Y)
        ];

        let mut v_offset = 0;
        for (f_indices, normal) in faces.iter() {
            for &idx in f_indices.iter() {
                let p = corners[idx];
                mesh.vertices.extend_from_slice(&[p.x, p.y, p.z]);
                mesh.normals.extend_from_slice(&[normal.x, normal.y, normal.z]);
            }
            // Standard square UVs for each face
            mesh.uvs.extend_from_slice(&[
                0.0, 1.0,
                1.0, 1.0,
                1.0, 0.0,
                0.0, 0.0,
            ]);

            mesh.indices.extend_from_slice(&[
                v_offset, v_offset + 1, v_offset + 2,
                v_offset, v_offset + 2, v_offset + 3,
            ]);
            v_offset += 4;
        }

        mesh
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoxelModel {
    pub elements: Vec<BoxElement>,
}

impl VoxelModel {
    pub fn new() -> Self {
        Self { elements: Vec::new() }
    }
}
