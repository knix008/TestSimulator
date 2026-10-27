export type StudioMode =
  | 'mesh'        // Blender: Poly modeling & Sculpt
  | 'interactive' // Spline: Interactive events & Physics
  | 'voxel'       // Blockbench: Low-poly box & pixel UV
  | 'cad'         // FreeCAD: Parametric sketch & feature tree
  | 'scad'        // OpenSCAD: Code CAD & CSG
  | 'sdf'         // Womp: Liquid clay SDF boolean
  | 'ai';         // Meshy: Generative Text/Image to 3D

export type TransformTool = 'select' | 'translate' | 'rotate' | 'scale';

export type ShadingMode = 'solid' | 'wireframe' | 'rendered' | 'matcap';

export interface SceneObject {
  id: string;
  name: string;
  type: 'cube' | 'sphere' | 'cylinder' | 'torus' | 'sdf-blob' | 'voxel-box' | 'cad-feature' | 'scad-mesh' | 'ai-mesh';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  roughness: number;
  metalness: number;
  visible: boolean;
  locked: boolean;
  // Specific payload for modes
  meta?: Record<string, any>;
}

export interface SdfNodeData {
  id: string;
  type: 'sphere' | 'box' | 'capsule' | 'torus';
  position: [number, number, number];
  size: [number, number, number];
  op: 'union' | 'subtract' | 'intersect' | 'smooth-union';
  smoothness: number;
  color: string;
}

export interface VoxelBoxData {
  id: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}

export interface CadFeatureData {
  id: string;
  name: string;
  type: 'sketch' | 'pad' | 'pocket' | 'fillet';
  params: Record<string, any>;
}
