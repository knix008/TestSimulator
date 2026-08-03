export type PrimitiveType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'plane'
  | 'capsule'
  | 'pyramid'
  | 'dodecahedron'
  | 'icosahedron'
  | 'octahedron'
  | 'tetrahedron'
  | 'torusKnot'
  | 'ring'
  | 'circle'
  | 'hexPrism'
  | 'triangularPrism'
  | 'pipe'
  | 'halfSphere'
  | 'truncatedCone';

export const ALL_PRIMITIVES: PrimitiveType[] = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'capsule',
  'pyramid',
  'dodecahedron',
  'icosahedron',
  'octahedron',
  'tetrahedron',
  'torusKnot',
  'ring',
  'circle',
  'hexPrism',
  'triangularPrism',
  'pipe',
  'halfSphere',
  'truncatedCone',
];

export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'fbx' | 'ply' | 'image';
export type TextFontId = 'helvetiker' | 'gentilis' | 'optimer' | 'droidSans' | 'droidSerif';
export type ShapeType = PrimitiveType | 'model' | 'image' | 'text';

export type ToolType =
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'text'
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
  /** preset id, 'custom', or 'none' */
  textureId?: string;
  /** data URL for color map */
  textureUrl?: string;
  /** UV repeat for texture map */
  textureRepeat?: number;
  /** data URL or blob URL for imported assets */
  modelUrl?: string;
  modelFormat?: ModelFormat;
  sourceFileName?: string;
  text?: string;
  textFont?: TextFontId;
  textSize?: number;
  textDepth?: number;
  textOutlineColor?: string;
  textBold?: boolean;
  textItalic?: boolean;
  textUnderline?: boolean;
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

export type LightKind = 'directional' | 'point';

export interface ViewportSettings {
  showGrid: boolean;
  showAxes: boolean;
  showLightMarkers: boolean;
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

export interface AppErrorInfo {
  title: string;
  message: string;
  details?: string;
}

export type ThemeMode = 'dark' | 'light';
export type Language = 'en' | 'ko';
