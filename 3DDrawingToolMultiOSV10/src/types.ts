export type PrimitiveType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'fbx' | 'ply' | 'image';
export type ShapeType = PrimitiveType | 'model' | 'image';

export type ToolType =
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale'
  | PrimitiveType;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SceneObject {
  id: string;
  name: string;
  type: ShapeType;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  opacity: number;
  visible: boolean;
  metalness: number;
  roughness: number;
  wireframe: boolean;
  emissive: string;
  emissiveIntensity: number;
  flatShading: boolean;
  /** data URL or blob URL for imported assets */
  modelUrl?: string;
  modelFormat?: ModelFormat;
  sourceFileName?: string;
}

export interface LightSettings {
  ambientIntensity: number;
  ambientColor: string;
  directionalIntensity: number;
  directionalColor: string;
  directionalPosition: Vec3;
  pointIntensity: number;
  pointColor: string;
  pointPosition: Vec3;
}

export interface ViewportSettings {
  showGrid: boolean;
  showAxes: boolean;
  backgroundColor: string;
  cameraPosition: Vec3;
}

export interface ProjectData {
  version: string;
  name: string;
  objects: SceneObject[];
  selectedId: string | null;
  lights: LightSettings;
  viewport: ViewportSettings;
  createdAt: string;
  updatedAt: string;
}

export type ThemeMode = 'dark' | 'light';
export type Language = 'en' | 'ko';
