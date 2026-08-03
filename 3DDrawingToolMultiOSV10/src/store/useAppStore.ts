import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  AppErrorInfo,
  Language,
  LightKind,
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
  ambientIntensity: 0.32,
  ambientColor: '#ffffff',
  directionalIntensity: 1.35,
  directionalColor: '#ffffff',
  directionalPosition: { x: 5, y: 8, z: 5 },
  pointIntensity: 2.2,
  pointColor: '#ffd9a0',
  pointPosition: { x: -4, y: 3, z: 2 },
};

const defaultViewport: ViewportSettings = {
  showGrid: true,
  showAxes: true,
  showLightMarkers: true,
  backgroundColor: '#1a1f26',
  cameraPosition: { x: 6, y: 5, z: 8 },
};

const MAX_HISTORY = 60;
const HISTORY_COALESCE_MS = 400;

type HistorySnapshot = {
  objects: SceneObject[];
  copiedObject: SceneObject | null;
  selectedId: string | null;
  lights: LightSettings;
  shapeCounter: number;
  projectName: string;
};

function createShape(type: PrimitiveType, index: number): SceneObject {
  const colors: Record<PrimitiveType, string> = {
    box: '#4f8cff',
    sphere: '#ff6b6b',
    cylinder: '#51cf66',
    cone: '#fcc419',
    torus: '#cc5de8',
    plane: '#868e96',
    capsule: '#20c997',
    pyramid: '#ff922b',
    dodecahedron: '#845ef7',
    icosahedron: '#15aabf',
    octahedron: '#f06595',
    tetrahedron: '#fab005',
    torusKnot: '#7950f2',
    ring: '#748ffc',
    circle: '#91a7ff',
    hexPrism: '#38d9a9',
    triangularPrism: '#ffa94d',
    pipe: '#66d9e8',
    halfSphere: '#ff8787',
    truncatedCone: '#e599f7',
  };

  const label = type.charAt(0).toUpperCase() + type.slice(1);

  return {
    id: uuidv4(),
    name: `${label} ${index}`,
    type,
    position: { x: (Math.random() - 0.5) * 4, y: type === 'plane' || type === 'ring' || type === 'circle' ? 0 : 0.5, z: (Math.random() - 0.5) * 4 },
    rotation: {
      x: type === 'ring' || type === 'circle' ? -Math.PI / 2 : 0,
      y: 0,
      z: 0,
    },
    scale: { x: 1, y: 1, z: 1 },
    color: colors[type],
    opacity: 1,
    visible: true,
    metalness: 0.15,
    roughness: 0.45,
    wireframe: false,
    emissive: '#000000',
    emissiveIntensity: 0,
    flatShading: type === 'tetrahedron' || type === 'pyramid' || type === 'octahedron' || type === 'hexPrism' || type === 'triangularPrism',
    textureId: 'none',
    textureRepeat: 2,
  };
}

function takeSnapshot(state: {
  objects: SceneObject[];
  selectedId: string | null;
  lights: LightSettings;
  shapeCounter: number;
  projectName: string;
}): HistorySnapshot {
  return {
    objects: structuredClone(state.objects),
    selectedId: state.selectedId,
    lights: structuredClone(state.lights),
    shapeCounter: state.shapeCounter,
    projectName: state.projectName,
  };
}

let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let coalesceOpen = true;

interface AppState {
  theme: ThemeMode;
  language: Language;
  tool: ToolType;
  objects: SceneObject[];
  copiedObject: SceneObject | null;
  selectedId: string | null;
  selectedLight: LightKind | null;
  lights: LightSettings;
  viewport: ViewportSettings;
  projectName: string;
  projectPath: string | null;
  showAbout: boolean;
  showLightsPanel: boolean;
  showTemplates: boolean;
  showExportImage: boolean;
  errorDialog: AppErrorInfo | null;
  viewScale: number;
  shapeCounter: number;
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  setTool: (tool: ToolType) => void;
  setSelectedId: (id: string | null) => void;
  setSelectedLight: (light: LightKind | null) => void;
  addShape: (type: PrimitiveType) => void;
  addText: () => void;
  addImportedAsset: (input: {
    name: string;
    format: ModelFormat;
    dataUrl: string;
    sourceFileName: string;
  }) => SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  copySelected: () => void;
  pasteCopiedObject: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  setLights: (patch: Partial<LightSettings>) => void;
  setViewport: (patch: Partial<ViewportSettings>) => void;
  setShowAbout: (show: boolean) => void;
  setShowLightsPanel: (show: boolean) => void;
  setShowTemplates: (show: boolean) => void;
  setShowExportImage: (show: boolean) => void;
  showError: (error: AppErrorInfo) => void;
  clearError: () => void;
  setViewScale: (scale: number) => void;
  setProjectName: (name: string) => void;
  exportProject: () => ProjectData;
  importProject: (data: ProjectData, filePath?: string | null) => void;
  newProject: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function pushHistory(get: () => AppState, set: (partial: Partial<AppState>) => void) {
  const state = get();
  const snap = takeSnapshot(state);
  const past = [...state.past, snap].slice(-MAX_HISTORY);
  set({ past, future: [] });
  coalesceOpen = false;
  if (coalesceTimer) clearTimeout(coalesceTimer);
  coalesceTimer = setTimeout(() => {
    coalesceOpen = true;
    coalesceTimer = null;
  }, HISTORY_COALESCE_MS);
}

function pushHistoryImmediate(get: () => AppState, set: (partial: Partial<AppState>) => void) {
  const state = get();
  const snap = takeSnapshot(state);
  const past = [...state.past, snap].slice(-MAX_HISTORY);
  set({ past, future: [] });
  coalesceOpen = true;
  if (coalesceTimer) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('theme') as ThemeMode) || 'dark',
  language: (localStorage.getItem('language') as Language) || 'ko',
  tool: 'select',
  objects: [],
  copiedObject: null,
  selectedId: null,
  selectedLight: null,
  lights: { ...defaultLights },
  viewport: { ...defaultViewport },
  projectName: 'Untitled',
  projectPath: null,
  showAbout: false,
  showLightsPanel: localStorage.getItem('showLightsPanel') !== 'false',
  showTemplates: false,
  showExportImage: false,
  errorDialog: null,
  viewScale: 100,
  shapeCounter: 1,
  past: [],
  future: [],

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

  setSelectedId: (id) => set({ selectedId: id, selectedLight: id ? null : get().selectedLight }),

  setSelectedLight: (light) => set({ selectedLight: light, selectedId: light ? null : get().selectedId }),

  addShape: (type) => {
    pushHistoryImmediate(get, set);
    const counter = get().shapeCounter;
    const obj = createShape(type, counter);
    set({
      objects: [...get().objects, obj],
      selectedId: obj.id,
      selectedLight: null,
      tool: 'select',
      shapeCounter: counter + 1,
    });
  },

  addText: () => {
    pushHistoryImmediate(get, set);
    const counter = get().shapeCounter;
    const obj: SceneObject = {
      id: uuidv4(),
      name: `Text ${counter}`,
      type: 'text',
      position: { x: (Math.random() - 0.5) * 3, y: 0.6, z: (Math.random() - 0.5) * 3 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#f8f9fa',
      opacity: 1,
      visible: true,
      metalness: 0.05,
      roughness: 0.35,
      wireframe: false,
      emissive: '#000000',
      emissiveIntensity: 0,
      flatShading: false,
      text: 'Text',
      textFont: 'helvetiker',
      textSize: 0.55,
      textDepth: 0.08,
      textOutlineColor: '#1f2937',
      textBold: false,
      textItalic: false,
      textUnderline: false,
    };
    set({
      objects: [...get().objects, obj],
      selectedId: obj.id,
      selectedLight: null,
      tool: 'select',
      shapeCounter: counter + 1,
    });
  },

  addImportedAsset: ({ name, format, dataUrl, sourceFileName }) => {
    pushHistoryImmediate(get, set);
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
      selectedLight: null,
      tool: 'move',
      shapeCounter: counter + 1,
    });
    return obj;
  },

  updateObject: (id, patch) => {
    if (coalesceOpen) pushHistory(get, set);
    else {
      // keep coalescing window open while edits continue
      if (coalesceTimer) clearTimeout(coalesceTimer);
      coalesceTimer = setTimeout(() => {
        coalesceOpen = true;
        coalesceTimer = null;
      }, HISTORY_COALESCE_MS);
    }
    set({
      objects: get().objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  },

  copySelected: () => {
    const { selectedId, objects } = get();
    const src = objects.find((o) => o.id === selectedId);
    if (!src) return;
    set({ copiedObject: structuredClone(src) });
  },

  pasteCopiedObject: () => {
    const { copiedObject, objects } = get();
    if (!copiedObject) return;
    pushHistoryImmediate(get, set);
    const copy: SceneObject = {
      ...structuredClone(copiedObject),
      id: uuidv4(),
      name: `${copiedObject.name} Copy`,
      position: {
        x: copiedObject.position.x + 0.5,
        y: copiedObject.position.y,
        z: copiedObject.position.z + 0.5,
      },
    };
    set({ objects: [...objects, copy], selectedId: copy.id, selectedLight: null });
  },

  deleteSelected: () => {
    const { selectedId, objects } = get();
    if (!selectedId) return;
    pushHistoryImmediate(get, set);
    set({
      objects: objects.filter((o) => o.id !== selectedId),
      selectedId: null,
    });
  },

  duplicateSelected: () => {
    const { selectedId, objects } = get();
    const src = objects.find((o) => o.id === selectedId);
    if (!src) return;
    pushHistoryImmediate(get, set);
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

  setLights: (patch) => {
    if (coalesceOpen) pushHistory(get, set);
    else {
      if (coalesceTimer) clearTimeout(coalesceTimer);
      coalesceTimer = setTimeout(() => {
        coalesceOpen = true;
        coalesceTimer = null;
      }, HISTORY_COALESCE_MS);
    }
    set({ lights: { ...get().lights, ...patch } });
  },

  setViewport: (patch) => set({ viewport: { ...get().viewport, ...patch } }),

  setShowAbout: (show) => set({ showAbout: show }),

  setShowLightsPanel: (show) => {
    localStorage.setItem('showLightsPanel', String(show));
    set({ showLightsPanel: show });
  },

  setShowTemplates: (show) => set({ showTemplates: show }),

  setShowExportImage: (show) => set({ showExportImage: show }),

  showError: (error) => set({ errorDialog: error }),

  clearError: () => set({ errorDialog: null }),

  setViewScale: (scale) => set({ viewScale: scale }),

  setProjectName: (name) => {
    if (name === get().projectName) return;
    pushHistoryImmediate(get, set);
    set({ projectName: name });
  },

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
      textureId: 'none',
      textureRepeat: 2,
      textFont: 'helvetiker',
      textSize: 0.55,
      textDepth: 0.08,
      textOutlineColor: '#1f2937',
      textBold: false,
      textItalic: false,
      textUnderline: false,
      ...o,
    }));
    set({
      projectName: data.name || 'Untitled',
      objects,
      selectedId: data.selectedId ?? null,
      selectedLight: null,
      lights: { ...defaultLights, ...data.lights },
      viewport: { ...defaultViewport, ...data.viewport },
      projectPath: filePath,
      shapeCounter: objects.length + 1,
      past: [],
      future: [],
    });
    coalesceOpen = true;
    if (coalesceTimer) {
      clearTimeout(coalesceTimer);
      coalesceTimer = null;
    }
  },

  newProject: () => {
    set({
      objects: [],
      selectedId: null,
      selectedLight: null,
      lights: { ...defaultLights },
      viewport: { ...defaultViewport },
      projectName: 'Untitled',
      projectPath: null,
      shapeCounter: 1,
      tool: 'select',
      past: [],
      future: [],
    });
    coalesceOpen = true;
    if (coalesceTimer) {
      clearTimeout(coalesceTimer);
      coalesceTimer = null;
    }
  },

  undo: () => {
    const state = get();
    if (state.past.length === 0) return;
    const previous = state.past[state.past.length - 1];
    const current = takeSnapshot(state);
    const applied = takeSnapshot({
      objects: previous.objects,
      selectedId: previous.selectedId,
      lights: previous.lights,
      shapeCounter: previous.shapeCounter,
      projectName: previous.projectName,
    });
    set({
      objects: applied.objects,
      selectedId: applied.selectedId,
      lights: applied.lights,
      shapeCounter: applied.shapeCounter,
      projectName: applied.projectName,
      past: state.past.slice(0, -1),
      future: [current, ...state.future].slice(0, MAX_HISTORY),
    });
    coalesceOpen = true;
  },

  redo: () => {
    const state = get();
    if (state.future.length === 0) return;
    const next = state.future[0];
    const current = takeSnapshot(state);
    const applied = takeSnapshot({
      objects: next.objects,
      selectedId: next.selectedId,
      lights: next.lights,
      shapeCounter: next.shapeCounter,
      projectName: next.projectName,
    });
    set({
      objects: applied.objects,
      selectedId: applied.selectedId,
      lights: applied.lights,
      shapeCounter: applied.shapeCounter,
      projectName: applied.projectName,
      past: [...state.past, current].slice(-MAX_HISTORY),
      future: state.future.slice(1),
    });
    coalesceOpen = true;
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));
