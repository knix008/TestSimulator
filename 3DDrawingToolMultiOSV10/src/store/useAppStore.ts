import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  Language,
  LightSettings,
  ModelFormat,
  PrimitiveType,
  ProjectData,
  SceneObject,
  ThemeMode,
  ToolType,
  ViewportSettings,
} from '../types';

const defaultLights: LightSettings = {
  ambientIntensity: 0.45,
  ambientColor: '#ffffff',
  directionalIntensity: 1.1,
  directionalColor: '#ffffff',
  directionalPosition: { x: 5, y: 8, z: 5 },
  pointIntensity: 0.4,
  pointColor: '#ffd9a0',
  pointPosition: { x: -4, y: 3, z: 2 },
};

const defaultViewport: ViewportSettings = {
  showGrid: true,
  showAxes: true,
  backgroundColor: '#1a1f26',
  cameraPosition: { x: 6, y: 5, z: 8 },
};

function createShape(type: PrimitiveType, index: number): SceneObject {
  const colors: Record<PrimitiveType, string> = {
    box: '#4f8cff',
    sphere: '#ff6b6b',
    cylinder: '#51cf66',
    cone: '#fcc419',
    torus: '#cc5de8',
    plane: '#868e96',
  };

  return {
    id: uuidv4(),
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${index}`,
    type,
    position: { x: (Math.random() - 0.5) * 4, y: type === 'plane' ? 0 : 0.5, z: (Math.random() - 0.5) * 4 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: colors[type],
    opacity: 1,
    visible: true,
    metalness: 0.15,
    roughness: 0.45,
    wireframe: false,
    emissive: '#000000',
    emissiveIntensity: 0,
    flatShading: false,
  };
}

interface AppState {
  theme: ThemeMode;
  language: Language;
  tool: ToolType;
  objects: SceneObject[];
  selectedId: string | null;
  lights: LightSettings;
  viewport: ViewportSettings;
  projectName: string;
  projectPath: string | null;
  showAbout: boolean;
  showLightsPanel: boolean;
  shapeCounter: number;

  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  setTool: (tool: ToolType) => void;
  setSelectedId: (id: string | null) => void;
  addShape: (type: PrimitiveType) => void;
  addImportedAsset: (input: {
    name: string;
    format: ModelFormat;
    dataUrl: string;
    sourceFileName: string;
  }) => SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  setLights: (patch: Partial<LightSettings>) => void;
  setViewport: (patch: Partial<ViewportSettings>) => void;
  setShowAbout: (show: boolean) => void;
  setShowLightsPanel: (show: boolean) => void;
  setProjectName: (name: string) => void;
  exportProject: () => ProjectData;
  importProject: (data: ProjectData, filePath?: string | null) => void;
  newProject: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('theme') as ThemeMode) || 'dark',
  language: (localStorage.getItem('language') as Language) || 'ko',
  tool: 'select',
  objects: [],
  selectedId: null,
  lights: { ...defaultLights },
  viewport: { ...defaultViewport },
  projectName: 'Untitled',
  projectPath: null,
  showAbout: false,
  showLightsPanel: localStorage.getItem('showLightsPanel') !== 'false',
  shapeCounter: 1,

  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  setLanguage: (language) => {
    localStorage.setItem('language', language);
    set({ language });
  },

  setTool: (tool) => set({ tool }),

  setSelectedId: (id) => set({ selectedId: id }),

  addShape: (type) => {
    const counter = get().shapeCounter;
    const obj = createShape(type, counter);
    set({
      objects: [...get().objects, obj],
      selectedId: obj.id,
      tool: 'select',
      shapeCounter: counter + 1,
    });
  },

  addImportedAsset: ({ name, format, dataUrl, sourceFileName }) => {
    const counter = get().shapeCounter;
    const isImage = format === 'image';
    const obj: SceneObject = {
      id: uuidv4(),
      name: name || `Import ${counter}`,
      type: isImage ? 'image' : 'model',
      position: { x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#ffffff',
      opacity: 1,
      visible: true,
      metalness: isImage ? 0 : 0.1,
      roughness: isImage ? 0.85 : 0.5,
      wireframe: false,
      emissive: '#000000',
      emissiveIntensity: 0,
      flatShading: false,
      modelUrl: dataUrl,
      modelFormat: format,
      sourceFileName,
    };
    set({
      objects: [...get().objects, obj],
      selectedId: obj.id,
      tool: 'move',
      shapeCounter: counter + 1,
    });
    return obj;
  },

  updateObject: (id, patch) => {
    set({
      objects: get().objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  },

  deleteSelected: () => {
    const { selectedId, objects } = get();
    if (!selectedId) return;
    set({
      objects: objects.filter((o) => o.id !== selectedId),
      selectedId: null,
    });
  },

  duplicateSelected: () => {
    const { selectedId, objects } = get();
    const src = objects.find((o) => o.id === selectedId);
    if (!src) return;
    const copy: SceneObject = {
      ...structuredClone(src),
      id: uuidv4(),
      name: `${src.name} Copy`,
      position: {
        x: src.position.x + 0.5,
        y: src.position.y,
        z: src.position.z + 0.5,
      },
    };
    set({ objects: [...objects, copy], selectedId: copy.id });
  },

  setLights: (patch) => set({ lights: { ...get().lights, ...patch } }),

  setViewport: (patch) => set({ viewport: { ...get().viewport, ...patch } }),

  setShowAbout: (show) => set({ showAbout: show }),

  setShowLightsPanel: (show) => {
    localStorage.setItem('showLightsPanel', String(show));
    set({ showLightsPanel: show });
  },

  setProjectName: (name) => set({ projectName: name }),

  exportProject: () => {
    const state = get();
    return {
      version: '1.0.0',
      name: state.projectName,
      objects: state.objects,
      selectedId: state.selectedId,
      lights: state.lights,
      viewport: state.viewport,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  importProject: (data, filePath = null) => {
    const objects = (data.objects || []).map((o) => ({
      wireframe: false,
      emissive: '#000000',
      emissiveIntensity: 0,
      flatShading: false,
      ...o,
    }));
    set({
      projectName: data.name || 'Untitled',
      objects,
      selectedId: data.selectedId ?? null,
      lights: { ...defaultLights, ...data.lights },
      viewport: { ...defaultViewport, ...data.viewport },
      projectPath: filePath,
      shapeCounter: objects.length + 1,
    });
  },

  newProject: () => {
    set({
      objects: [],
      selectedId: null,
      lights: { ...defaultLights },
      viewport: { ...defaultViewport },
      projectName: 'Untitled',
      projectPath: null,
      shapeCounter: 1,
      tool: 'select',
    });
  },
}));
