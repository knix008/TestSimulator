// The .myuml file (a project) and .mumlt (a template: the same content, kept as
// a starting point) — UTF-8 JSON:
//   { "format": "myumlmaker", "version": 1, "kind": "project" | "template", "saved": "…", "project": { _type: "Project", … } }
// A bare StarUML project ({ "_type": "Project", … }, .mdj) is read too.
// Reading repairs what it can (missing ids and collections, duplicate ids,
// views of missing elements, lines whose ends are gone) and refuses what is
// not a project.
import { buildIndex, childLists, FORMAT, isEdgeView, newId, ref, refId, removeDeadViews, VERSION, walk } from './model.js';
import { DIAGRAM_BG_FITS, DIAGRAM_BG_KINDS, DIAGRAM_BG_PATTERNS, isDiagramType, TYPES } from './meta.js';

export const PROJECT_EXTENSION = 'myuml';
export const TEMPLATE_EXTENSION = 'mumlt';

export class FormatError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop();
export const directoryOf = (path) => {
  const text = String(path ?? '');
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return index > 0 ? text.slice(0, index) : '';
};
export const extensionOf = (name) => (/\.([^./\\]+)$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();
export const stripExtension = (name) => String(name ?? '').replace(/\.[^./\\]+$/, '');
export const withExtension = (path, extension) => (extensionOf(path) === extension ? path : `${stripExtension(path)}.${extension}`);
export const isProjectFileName = (name) => ['myuml', 'mumlt', 'muml', 'json'].includes(extensionOf(name));
export const isTemplateFileName = (name) => extensionOf(name) === 'mumlt';
export const isStarUmlFileName = (name) => extensionOf(name) === 'mdj';
export const isFragmentFileName = (name) => extensionOf(name) === 'mfj';
export const isImageFileName = (name) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(extensionOf(name));
export const isSourceFileName = (name) => ['java', 'cs', 'py', 'ts', 'tsx', 'js', 'sql', 'kt', 'kts', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hh', 'hxx', 'php'].includes(extensionOf(name));
export const isTextModelFileName = (name) => ['mmd', 'mermaid', 'puml', 'plantuml', 'pu'].includes(extensionOf(name));
/** XMI 2.x (Enterprise Architect, MagicDraw, Papyrus .uml): read into a new project. */
export const isXmiFileName = (name) => ['xmi', 'xml', 'uml'].includes(extensionOf(name));
/** Files the app opens as a project. */
export const isOpenableFileName = (name) => isProjectFileName(name) || isStarUmlFileName(name) || isXmiFileName(name);

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** A diagram's background fields (meta.js BACKGROUND_FIELDS): known values, numbers in range, pictures only as data: URLs. */
export function normalizeBackground(diagram) {
  const enums = { backgroundKind: DIAGRAM_BG_KINDS, backgroundFit: DIAGRAM_BG_FITS, backgroundPattern: DIAGRAM_BG_PATTERNS };
  for (const [key, options] of Object.entries(enums)) if (diagram[key] !== undefined && !options.includes(diagram[key])) delete diagram[key];
  const ranges = { backgroundColorOpacity: [0, 100], backgroundOpacity: [0, 100], backgroundPatternOpacity: [0, 100], backgroundPatternScale: [50, 300], backgroundImageWidth: [0, 100000], backgroundImageHeight: [0, 100000] };
  for (const [key, [min, max]] of Object.entries(ranges)) if (diagram[key] !== undefined) diagram[key] = Math.round(Math.min(max, Math.max(min, num(diagram[key], key.endsWith('Scale') || key.endsWith('Opacity') ? 100 : 0))));
  for (const key of ['backgroundColor', 'backgroundPatternColor']) if (diagram[key] !== undefined && (typeof diagram[key] !== 'string' || /[<>"]/.test(diagram[key]))) delete diagram[key];
  if (diagram.backgroundImage !== undefined && !(typeof diagram.backgroundImage === 'string' && (diagram.backgroundImage === '' || /^data:image\/[\w.+-]+[;,]/.test(diagram.backgroundImage)))) delete diagram.backgroundImage;
  return diagram;
}

/** Repairs a project in place (ids, parents, collections, views) and returns it. */
export function normalizeProject(project) {
  if (!project || typeof project !== 'object' || project._type !== 'Project') throw new FormatError('format.notProject');
  project.name ??= 'Untitled';
  project.ownedElements = Array.isArray(project.ownedElements) ? project.ownedElements : [];
  // Baselines (domain/baseline.js): keep the well-formed ones, drop the key when none are left.
  if (project.baselines !== undefined) {
    const kept = Array.isArray(project.baselines) ? project.baselines.filter((b) => b && typeof b === 'object' && typeof b.snapshot === 'string' && b._id) : [];
    if (kept.length) project.baselines = kept; else delete project.baselines;
  }
  const seen = new Set();
  // Unique ids and parent links for elements and views.
  const fix = (element, parent) => {
    if (!element || typeof element !== 'object') return;
    if (!element._id || seen.has(element._id)) element._id = newId();
    seen.add(element._id);
    if (parent) element._parent = ref(parent);
    for (const [key, list] of childLists(element)) element[key] = list.filter((child) => child && typeof child === 'object' && typeof child._type === 'string');
    for (const [, list] of childLists(element)) for (const child of list) fix(child, element);
    for (const key of ['end1', 'end2']) if (element[key] && typeof element[key] === 'object') fix(element[key], element);
  };
  fix(project, null);
  const index = buildIndex(project);
  walk(project, (element) => {
    if (isDiagramType(element._type)) {
      element.ownedViews = Array.isArray(element.ownedViews) ? element.ownedViews : [];
      for (const view of element.ownedViews) {
        if (isEdgeView(view)) {
          view.points = Array.isArray(view.points) ? view.points.filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))).map((p) => ({ x: num(p.x), y: num(p.y) })) : [];
          if (view.y !== undefined) view.y = num(view.y);
        } else for (const key of ['left', 'top', 'width', 'height']) view[key] = num(view[key]);
      }
      const gone = new Set(element.ownedViews.filter((v) => v.model && !index.get(refId(v.model))).map((v) => refId(v.model)));
      removeDeadViews(element, gone);
      normalizeBackground(element);
    }
    // Association ends must exist.
    if (TYPES[element._type]?.ends === 'association') {
      for (const key of ['end1', 'end2']) if (!element[key] || typeof element[key] !== 'object') element[key] = { _type: element._type === 'ERDRelationship' ? 'ERDRelationshipEnd' : 'UMLAssociationEnd', _id: newId(), _parent: ref(element) };
    }
  });
  return project;
}

/** The project as file text. */
export function serialize(project, { template = false } = {}) {
  // A template starts new projects: it carries no baselines (snapshots of the project it was made from).
  const content = template && project.baselines ? { ...project, baselines: undefined } : project;
  return `${JSON.stringify({ format: FORMAT, version: VERSION, kind: template ? 'template' : 'project', saved: new Date().toISOString(), project: content }, null, 1)}\n`;
}

/** Parses file text: { project, template, starUml }. */
export function parseProject(source) {
  let data;
  try {
    data = JSON.parse(String(source ?? '').replace(/^﻿/, ''));
  } catch (error) {
    throw new FormatError('format.notJson', error.message);
  }
  if (data && data._type === 'Project') return { project: normalizeProject(data), template: false, starUml: true };
  if (!data || data.format !== FORMAT || !data.project) throw new FormatError('format.notProject');
  if (Number(data.version) > VERSION) throw new FormatError('format.newer', String(data.version));
  return { project: normalizeProject(data.project), template: data.kind === 'template', starUml: false };
}
