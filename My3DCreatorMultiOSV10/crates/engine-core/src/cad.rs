use crate::types::{MeshData, Vec3};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Sketch2DEntity {
    Line { start: [f32; 2], end: [f32; 2] },
    Circle { center: [f32; 2], radius: f32 },
    Rect { min: [f32; 2], max: [f32; 2] },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Constraint2D {
    Horizontal { entity_id: usize },
    Vertical { entity_id: usize },
    Length { entity_id: usize, length: f32 },
    Distance { entity_a: usize, entity_b: usize, dist: f32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sketch2D {
    pub plane: String, // "XY", "XZ", "YZ"
    pub entities: Vec<Sketch2DEntity>,
    pub constraints: Vec<Constraint2D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CadFeature {
    Sketch(Sketch2D),
    Pad {
        sketch_idx: usize,
        height: f32,
        symmetric: bool,
    },
    Pocket {
        sketch_idx: usize,
        depth: f32,
    },
    Chamfer {
        edge_indices: Vec<usize>,
        size: f32,
    },
    Fillet {
        edge_indices: Vec<usize>,
        radius: f32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CadPart {
    pub name: String,
    pub features: Vec<CadFeature>,
}

impl CadPart {
    pub fn new(name: String) -> Self {
        Self {
            name,
            features: Vec::new(),
        }
    }

    /// Generates triangulated 3D mesh for simple extrusions (Pad)
    pub fn evaluate_mesh(&self) -> MeshData {
        let mut mesh = MeshData::new();

        for feature in &self.features {
            if let CadFeature::Pad { sketch_idx, height, .. } = feature {
                if let Some(CadFeature::Sketch(sketch)) = self.features.get(*sketch_idx) {
                    for entity in &sketch.entities {
                        if let Sketch2DEntity::Rect { min, max } = entity {
                            // Extrude 2D rect into 3D box
                            let (_w, _d, h) = (max[0] - min[0], max[1] - min[1], *height);
                            let corners = [
                                Vec3::new(min[0], 0.0, min[1]),
                                Vec3::new(max[0], 0.0, min[1]),
                                Vec3::new(max[0], 0.0, max[1]),
                                Vec3::new(min[0], 0.0, max[1]),
                                Vec3::new(min[0], h, min[1]),
                                Vec3::new(max[0], h, min[1]),
                                Vec3::new(max[0], h, max[1]),
                                Vec3::new(min[0], h, max[1]),
                            ];

                            // Add cube vertices and faces
                            for c in &corners {
                                mesh.vertices.extend_from_slice(&[c.x, c.y, c.z]);
                                mesh.normals.extend_from_slice(&[0.0, 1.0, 0.0]);
                                mesh.uvs.extend_from_slice(&[0.0, 0.0]);
                            }

                            let indices = [
                                0, 1, 2, 0, 2, 3, // Bottom
                                4, 6, 5, 4, 7, 6, // Top
                                0, 4, 5, 0, 5, 1, // Front
                                1, 5, 6, 1, 6, 2, // Right
                                2, 6, 7, 2, 7, 3, // Back
                                3, 7, 4, 3, 4, 0, // Left
                            ];
                            mesh.indices.extend_from_slice(&indices);
                        }
                    }
                }
            }
        }

        mesh
    }
}
