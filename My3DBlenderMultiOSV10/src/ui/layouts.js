// Workspaces and their default screen layouts. A layout is a tree:
//   { split: 'h' | 'v', ratio, a, b }  or  { editor: 'view3d', ...initial state }.
const A = (editor, extra = {}) => ({ editor, ...extra });
const H = (ratio, a, b) => ({ split: 'h', ratio, a, b });
const V = (ratio, a, b) => ({ split: 'v', ratio, a, b });
const side = (ratio = 0.33) => V(ratio, A('outliner'), A('properties'));

export const WORKSPACES = [
  { id: 'layout', en: 'Layout', ko: '레이아웃', mode: 'OBJECT', make: () => H(0.78, V(0.8, A('view3d'), A('timeline')), side()) },
  { id: 'modeling', en: 'Modeling', ko: '모델링', mode: 'EDIT', make: () => H(0.8, A('view3d'), side()) },
  { id: 'sculpting', en: 'Sculpting', ko: '스컬프팅', mode: 'SCULPT', make: () => H(0.8, A('view3d', { shading: 'MATERIAL' }), side()) },
  { id: 'uv', en: 'UV', ko: 'UV', mode: 'EDIT', make: () => H(0.78, H(0.45, A('uv'), A('view3d')), side()) },
  { id: 'paint', en: 'Paint', ko: '페인트', mode: 'TEXTURE_PAINT', make: () => H(0.78, H(0.4, A('image'), A('view3d')), side()) },
  { id: 'shading', en: 'Shading', ko: '셰이딩', mode: 'OBJECT', make: () => H(0.78, V(0.55, H(0.28, A('image'), A('view3d', { shading: 'MATERIAL' })), A('nodes', { tree: 'SHADER' })), side()) },
  { id: 'animation', en: 'Animation', ko: '애니메이션', mode: 'OBJECT', make: () => H(0.78, V(0.6, A('view3d'), A('dopesheet')), side()) },
  { id: 'rendering', en: 'Rendering', ko: '렌더링', mode: 'OBJECT', make: () => H(0.72, A('image'), V(0.33, A('outliner'), A('properties', { tab: 'render' }))) },
  { id: 'compositing', en: 'Compositing', ko: '합성', mode: 'OBJECT', make: () => H(0.78, V(0.75, A('nodes', { tree: 'COMPOSITOR' }), A('timeline')), side()) },
  { id: 'geonodes', en: 'Geo Nodes', ko: '지오 노드', mode: 'OBJECT', make: () => H(0.78, V(0.55, H(0.45, A('spreadsheet'), A('view3d')), A('nodes', { tree: 'GEOMETRY' })), side()) },
  { id: 'video', en: 'Video', ko: '영상', mode: 'OBJECT', make: () => H(0.78, A('sequencer'), side()) },
  { id: 'tracking', en: 'Tracking', ko: '트래킹', mode: 'OBJECT', make: () => H(0.78, V(0.68, A('clip'), A('view3d')), side()) },
  { id: 'assets', en: 'Assets', ko: '애셋', mode: 'OBJECT', make: () => H(0.78, V(0.62, A('view3d'), A('assets')), side()) },
  { id: 'scripting', en: 'Scripting', ko: '스크립팅', mode: 'OBJECT', make: () => H(0.78, H(0.42, V(0.6, A('view3d'), A('console')), V(0.72, A('text'), A('info'))), side()) },
];

export const workspaceById = (id) => WORKSPACES.find((w) => w.id === id) ?? WORKSPACES[0];
