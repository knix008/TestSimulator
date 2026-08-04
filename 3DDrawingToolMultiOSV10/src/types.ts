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
  | 'truncatedCone'
  | 'slab'
  | 'wall'
  | 'rod'
  | 'disk'
  | 'pentagonalPrism'
  | 'octagonalPrism'
  | 'diamond'
  | 'thinTorus'
  | 'arc'
  | 'halfCylinder'
  | 'table'
  | 'chair'
  | 'sofa'
  | 'bed'
  | 'door'
  | 'windowFrame'
  | 'bookshelf'
  | 'laptop'
  | 'cup'
  | 'bottle'
  | 'plantPot'
  | 'deskLamp'
  | 'networkRouter'
  | 'networkSwitch'
  | 'serverRack'
  | 'firewallAppliance'
  | 'wifiAccessPoint'
  | 'modem'
  | 'nasStorage'
  | 'patchPanel'
  | 'antennaTower'
  | 'networkCable';

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
  'slab',
  'wall',
  'rod',
  'disk',
  'pentagonalPrism',
  'octagonalPrism',
  'diamond',
  'thinTorus',
  'arc',
  'halfCylinder',
  'table',
  'chair',
  'sofa',
  'bed',
  'door',
  'windowFrame',
  'bookshelf',
  'laptop',
  'cup',
  'bottle',
  'plantPot',
  'deskLamp',
  'networkRouter',
  'networkSwitch',
  'serverRack',
  'firewallAppliance',
  'wifiAccessPoint',
  'modem',
  'nasStorage',
  'patchPanel',
  'antennaTower',
  'networkCable',
];

export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'fbx' | 'ply' | 'image';
export type TextFontId = 'helvetiker' | 'gentilis' | 'optimer' | 'droidSans' | 'droidSerif';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type LinePathType = 'straight' | 'elbow' | 'curve';
export type LineEndpoint = 'none' | 'circle' | 'arrow';
export type ShapeType = PrimitiveType | 'model' | 'image' | 'text' | 'connection';

export type ToolType =
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'connection'
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
  connectionStartId?: string;
  connectionEndId?: string;
  lineThickness?: number;
  lineStyle?: LineStyle;
  linePathType?: LinePathType;
  lineStartEndpoint?: LineEndpoint;
  lineEndEndpoint?: LineEndpoint;
}

export interface LightSettings {
  ambientIntensity: number;
  ambientColor: string;
  directionalEnabled: boolean;
  directionalIntensity: number;
  directionalColor: string;
  directionalPosition: Vec3;
  pointEnabled: boolean;
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
