// Designs to start from (start screen › New icon). Each builds a fresh design with new ids.
import { createObject, DEFAULT_FX } from './iconCanvas.js';
import { emptyDesign } from './project.js';

const obj = (type, props) => {
  const o = createObject(type, 0, 0);
  const { fx, ...rest } = props;
  return { ...o, ...rest, fx: { ...DEFAULT_FX, ...(fx ?? {}) } };
};
const box = (x, y, w, h) => ({ x, y, w, h });

export const TEMPLATES = [
  { id: 'blank', icon: 'tplBlank', build: () => emptyDesign() },
  {
    id: 'appSquare', icon: 'tplApp',
    build: () => ({ ...emptyDesign(), objects: [
      obj('rect', { ...box(40, 40, 432, 432), rx: 96, fill: '#3b82f6', fill2: '#1e3a8a', fillType: 'linear', gradAngle: 90, fx: { shadow: true, gloss: true } }),
      obj('star', { ...box(136, 130, 240, 240), fill: '#fde047', fill2: '#f59e0b', fillType: 'linear', fx: { threeD: true } }),
    ] }),
  },
  {
    id: 'circleBadge', icon: 'tplBadge',
    build: () => ({ ...emptyDesign(), objects: [
      obj('ellipse', { ...box(36, 36, 440, 440), fill: '#22c55e', fill2: '#15803d', fillType: 'radial', fx: { shadow: true } }),
      obj('ellipse', { ...box(76, 76, 360, 360), hasFill: false, hasStroke: true, stroke: '#ffffff', strokeWidth: 14, dash: 'dash' }),
      obj('check', { ...box(146, 156, 220, 200), fill: '#ffffff', fx: { threeD: true } }),
    ] }),
  },
  {
    id: 'folder', icon: 'tplFolder',
    build: () => ({ ...emptyDesign(), objects: [
      obj('folder', { ...box(40, 70, 432, 380), fill: '#fbbf24', fill2: '#d97706', fillType: 'linear', fx: { shadow: true, gloss: true } }),
      obj('heart', { ...box(196, 220, 120, 110), fill: '#ef4444' }),
    ] }),
  },
  {
    id: 'document', icon: 'tplDocument',
    build: () => ({ ...emptyDesign(), objects: [
      obj('document', { ...box(86, 30, 340, 452), fill: '#f8fafc', fill2: '#cbd5e1', fillType: 'linear', hasStroke: true, stroke: '#64748b', strokeWidth: 6, fx: { shadow: true } }),
      obj('rect', { ...box(250, 330, 200, 110), rx: 18, fill: '#2563eb' }),
      obj('text', { ...box(266, 340, 180, 96), text: 'DOC', fontSize: 72, fill: '#ffffff' }),
    ] }),
  },
  {
    id: 'settings', icon: 'tplSettings',
    build: () => ({ ...emptyDesign(), background: '#334155', background2: '#0f172a', bgGradient: true, bgRadius: 24, objects: [
      obj('gear', { ...box(96, 96, 320, 320), fill: '#e2e8f0', fill2: '#94a3b8', fillType: 'radial', fx: { threeD: true, shadow: true } }),
    ] }),
  },
  {
    id: 'mail', icon: 'tplMail',
    build: () => ({ ...emptyDesign(), objects: [
      obj('rect', { ...box(40, 40, 432, 432), rx: 110, fill: '#0ea5e9', fill2: '#0369a1', fillType: 'linear', fx: { gloss: true } }),
      obj('envelope', { ...box(106, 140, 300, 230), fill: '#ffffff', fx: { shadow: true } }),
      obj('ellipse', { ...box(356, 60, 96, 96), fill: '#ef4444', hasStroke: true, stroke: '#ffffff', strokeWidth: 8 }),
    ] }),
  },
  {
    id: 'weather', icon: 'tplWeather',
    build: () => ({ ...emptyDesign(), background: '#7dd3fc', background2: '#0284c7', bgGradient: true, bgShape: 'circle', objects: [
      obj('sun', { ...box(196, 70, 220, 220), fill: '#fde047', fx: { glow: true, glowColor: '#fef08a' } }),
      obj('cloud', { ...box(70, 190, 330, 220), fill: '#ffffff', fill2: '#e2e8f0', fillType: 'linear', fx: { shadow: true } }),
    ] }),
  },
  {
    id: 'music', icon: 'tplMusic',
    build: () => ({ ...emptyDesign(), objects: [
      obj('rect', { ...box(40, 40, 432, 432), rx: 96, fill: '#ec4899', fill2: '#7c3aed', fillType: 'linear', gradAngle: 45, fx: { shadow: true } }),
      obj('musicNote', { ...box(150, 110, 210, 290), fill: '#ffffff', fx: { threeD: true } }),
    ] }),
  },
  {
    id: 'shield', icon: 'tplShield',
    build: () => ({ ...emptyDesign(), objects: [
      obj('shield', { ...box(76, 36, 360, 440), fill: '#10b981', fill2: '#065f46', fillType: 'linear', fx: { shadow: true, gloss: true } }),
      obj('lock', { ...box(186, 150, 140, 190), fill: '#ffffff' }),
    ] }),
  },
  {
    id: 'cube3d', icon: 'tplCube',
    build: () => ({ ...emptyDesign(), objects: [
      obj('cube', { ...box(96, 96, 320, 320), fill: '#f97316', fx: { shadow: true } }),
    ] }),
  },
  {
    id: 'letter', icon: 'tplLetter',
    build: () => ({ ...emptyDesign(), objects: [
      obj('squircle', { ...box(40, 40, 432, 432), fill: '#6366f1', fill2: '#312e81', fillType: 'radial', fx: { shadow: true, gloss: true } }),
      obj('text', { ...box(146, 96, 240, 300), text: 'A', fontSize: 300, fontWeight: 800, fill: '#ffffff', fx: { shadow: true, shadowDy: 6, shadowBlur: 6 } }),
    ] }),
  },
  {
    id: 'location', icon: 'tplPin',
    build: () => ({ ...emptyDesign(), objects: [
      obj('ellipse', { ...box(156, 420, 200, 50), fill: '#000000', opacity: 0.25, fx: { blur: 8 } }),
      obj('pin', { ...box(126, 40, 260, 400), fill: '#ef4444', fill2: '#991b1b', fillType: 'linear', fx: { threeD: true, gloss: true } }),
    ] }),
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((template) => [template.id, template]));
