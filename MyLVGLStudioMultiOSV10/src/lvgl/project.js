// The project document and the pure operations on it. Nothing here touches the UI, so
// the same code runs in the app and in the tests.
import { DEFAULT_VERSION, isSupported } from "./versions.js";
import { CONTAINERS, DEVICES, WIDGETS } from "./schema.js";
import { validConfName, validConfValue } from "./lvconf.js";
import { checkMvvm, usesMvvm } from "./viewmodel.js";

export const FORMAT = "mylvgl";
export const FILE_EXTENSION = "mylvgl";
/** Format 2 adds ViewModels and bindings; a project without them is still written as 1. */
export const FORMAT_VERSION = 2;

export function newProject(name = "Untitled") {
  return {
    format: FORMAT,
    formatVersion: 1,
    name,
    lvgl: DEFAULT_VERSION,
    device: { w: DEVICES[0].w, h: DEVICES[0].h },
    images: [],
    theme: { dark: false, primary: "#2196f3", secondary: "#f44336" },
    nextId: 2,
    screens: [{ id: "n1", type: "screen", name: "Screen1", props: {}, events: [], children: [] }],
  };
}

/** A path inside the project folder: relative, "/" separators, never leaving the folder. */
export function safeRelativePath(path) {
  return /^[^\\:]+$/.test(path) && !path.startsWith("/") && path.split("/").every((part) => part && part !== "." && part !== "..");
}

/** A new, unique C-safe name for an image, from its file name. */
export function imageNameFor(project, file) {
  const base = sanitizeName(file.split(/[\\/]/).pop().replace(/\.[^.]+$/, "")) || "image";
  const taken = new Set((project.images ?? []).map((image) => image.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`.toLowerCase())) return `${base}_${n}`;
}

/** Removes an image, and the source of every image widget that showed it. */
export function removeImageFromProject(project, name) {
  project.images = (project.images ?? []).filter((image) => image.name !== name);
  walk(project, (node) => {
    if (node.props.src === name) delete node.props.src;
  });
}

/** Throws when a node is not what FILE_FORMAT.md describes. */
function checkNode(node, ids, isScreen) {
  const fail = (what) => {
    throw new Error(`invalid project file: ${what} (${node?.id ?? "?"})`);
  };
  if (!node || typeof node !== "object") fail("a node is not an object");
  if (typeof node.id !== "string" || !node.id) fail("a node has no id");
  if (ids.has(node.id)) fail("duplicate id");
  ids.add(node.id);
  if (!WIDGETS[node.type]) fail(`unknown widget type "${node.type}"`);
  if ((node.type === "screen") !== isScreen) fail(isScreen ? "a top-level node is not a screen" : "a screen inside a screen");
  if (typeof node.name !== "string" || !node.name) fail("a node has no name");
  if (!node.props || typeof node.props !== "object" || Array.isArray(node.props)) fail("props is not an object");
  if (!Array.isArray(node.events)) fail("events is not a list");
  if (!Array.isArray(node.children)) fail("children is not a list");
  if (node.children.length && !CONTAINERS.has(node.type)) fail(`a ${node.type} cannot have children`);
  for (const child of node.children) checkNode(child, ids, false);
}

/** Reads a .mylvgl file. See FILE_FORMAT.md. */
export function parseProject(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`invalid project file: not JSON (${error.message})`);
  }
  if (data?.format !== FORMAT) throw new Error("not a My LVGL Studio project file");
  if (!Number.isInteger(data.formatVersion) || data.formatVersion < 1) throw new Error("invalid project file: no format version");
  if (data.formatVersion > FORMAT_VERSION) {
    throw new Error(`this project needs a newer My LVGL Studio (format ${data.formatVersion}, this version reads up to ${FORMAT_VERSION})`);
  }
  if (!isSupported(data.lvgl)) throw new Error(`invalid project file: unsupported LVGL version "${data.lvgl}"`);
  const { w, h } = data.device ?? {};
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new Error("invalid project file: bad device size");
  if (data.device.shape !== undefined && (data.device.shape !== "round" || w !== h)) throw new Error("invalid project file: bad device shape");
  if (!data.theme || !/^#[0-9a-f]{6}$/i.test(data.theme.primary) || !/^#[0-9a-f]{6}$/i.test(data.theme.secondary)) {
    throw new Error("invalid project file: bad theme");
  }
  if (!Array.isArray(data.screens) || data.screens.length === 0) throw new Error("invalid project file: no screens");
  if (data.images === undefined) data.images = [];
  if (!Array.isArray(data.images)) throw new Error("invalid project file: images is not a list");
  const imageNames = new Set();
  for (const image of data.images) {
    if (typeof image?.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(image.name)) throw new Error("invalid project file: bad image name");
    if (imageNames.has(image.name)) throw new Error(`invalid project file: duplicate image "${image.name}"`);
    imageNames.add(image.name);
    if (typeof image.file !== "string" || !safeRelativePath(image.file)) throw new Error(`invalid project file: bad image path "${image.file}"`);
  }
  if (data.fonts !== undefined) {
    if (!Array.isArray(data.fonts)) throw new Error("invalid project file: fonts is not a list");
    const fontNames = new Set();
    for (const font of data.fonts) {
      if (typeof font?.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(font.name)) throw new Error("invalid project file: bad font name");
      if (fontNames.has(font.name)) throw new Error(`invalid project file: duplicate font "${font.name}"`);
      fontNames.add(font.name);
      if (typeof font.file !== "string" || !safeRelativePath(font.file)) throw new Error(`invalid project file: bad font path "${font.file}"`);
      if (!Number.isInteger(font.face) || font.face < 0) throw new Error(`invalid project file: bad font face "${font.name}"`);
    }
  }
  if (data.defaultFont !== undefined && (typeof data.defaultFont?.font !== "string" || !Number.isInteger(data.defaultFont.size) || data.defaultFont.size < 1)) {
    throw new Error("invalid project file: bad default font");
  }
  if (data.lvConf !== undefined) {
    if (typeof data.lvConf !== "object" || data.lvConf === null || Array.isArray(data.lvConf)) throw new Error("invalid project file: lvConf is not an object");
    for (const [name, value] of Object.entries(data.lvConf)) {
      if (!validConfName(name) || !validConfValue(value)) throw new Error(`invalid project file: bad lvConf entry "${name}"`);
    }
  }
  const ids = new Set();
  for (const screen of data.screens) checkNode(screen, ids, true);
  checkMvvm(data);
  // New ids must never collide, whatever nextId says.
  let highest = 0;
  for (const id of ids) highest = Math.max(highest, Number(/^n(\d+)$/.exec(id)?.[1] ?? 0));
  data.nextId = Math.max(Number(data.nextId) || 0, highest + 1);
  return data;
}

export const serializeProject = (project) => `${JSON.stringify({ ...project, formatVersion: usesMvvm(project) ? 2 : 1 }, null, 2)}\n`;

const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** True when a project name can be used as a folder and file name on every OS. */
export function validProjectName(name) {
  const text = String(name);
  return text.trim() === text && text.length > 0 && text.length <= 100
    && !/[<>:"/\\|?*\x00-\x1f]/.test(text) && !text.endsWith(".") && !RESERVED_NAMES.test(text);
}

/** The project folder inside `location`, with the separator `location` already uses. */
export function joinPath(location, name) {
  const separator = location.includes("\\") ? "\\" : "/";
  return location.endsWith(separator) ? `${location}${name}` : `${location}${separator}${name}`;
}

/** Visits every node, parents first. */
export function walk(project, visit) {
  const step = (node, parent) => {
    visit(node, parent);
    for (const child of node.children) step(child, node);
  };
  for (const screen of project.screens) step(screen, null);
}

export function findNode(project, id) {
  let found = null;
  walk(project, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

export function findParent(project, id) {
  let found = null;
  walk(project, (node, parent) => {
    if (node.id === id) found = parent;
  });
  return found;
}

export function screenOf(project, id) {
  for (const screen of project.screens) {
    let inside = false;
    const step = (node) => {
      if (node.id === id) inside = true;
      node.children.forEach(step);
    };
    step(screen);
    if (inside) return screen;
  }
  return null;
}

export function usedNames(project) {
  const names = new Set();
  walk(project, (node) => names.add(node.name));
  return names;
}

export function uniqueName(project, base) {
  const names = usedNames(project);
  const clean = sanitizeName(base).replace(/\d+$/, "") || "obj";
  for (let n = 1; ; n++) {
    if (!names.has(`${clean}${n}`)) return `${clean}${n}`;
  }
}

/** A name usable as part of a C identifier. */
export function sanitizeName(name) {
  const clean = String(name).replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(clean) ? `_${clean}` : clean;
}

export function createNode(project, type, props = {}) {
  const definition = WIDGETS[type];
  if (!definition) throw new Error(`unknown widget ${type}`);
  const node = {
    id: `n${project.nextId++}`,
    type,
    name: uniqueName(project, type === "screen" ? "Screen" : type),
    props: { ...definition.defaults, ...props },
    events: [],
    children: [],
  };
  return node;
}

export function addNode(project, parentId, node, index) {
  const parent = findNode(project, parentId);
  if (!parent || !CONTAINERS.has(parent.type)) throw new Error("the parent cannot hold widgets");
  if (index === undefined) parent.children.push(node);
  else parent.children.splice(index, 0, node);
  return node;
}

export function addScreen(project) {
  const screen = createNode(project, "screen");
  project.screens.push(screen);
  return screen;
}

/** Removes a node and every event action that pointed at it or its children. */
export function removeNode(project, id) {
  const removed = new Set();
  const collect = (node) => {
    removed.add(node.id);
    node.children.forEach(collect);
  };
  const screenIndex = project.screens.findIndex((screen) => screen.id === id);
  if (screenIndex >= 0) {
    if (project.screens.length === 1) return false;
    collect(project.screens[screenIndex]);
    project.screens.splice(screenIndex, 1);
  } else {
    const parent = findParent(project, id);
    if (!parent) return false;
    const index = parent.children.findIndex((child) => child.id === id);
    collect(parent.children[index]);
    parent.children.splice(index, 1);
  }
  walk(project, (node) => {
    node.events = node.events.filter((event) => !removed.has(event.target));
    if (removed.has(node.props.target)) delete node.props.target;
  });
  return true;
}

/** A deep copy with new ids and names, ready to be added back to the project. */
export function cloneNode(project, node) {
  const copy = structuredClone(node);
  const names = usedNames(project);
  const rename = (item) => {
    item.id = `n${project.nextId++}`;
    const base = sanitizeName(item.name).replace(/\d+$/, "") || "obj";
    let n = 1;
    while (names.has(`${base}${n}`)) n++;
    item.name = `${base}${n}`;
    names.add(item.name);
    item.children.forEach(rename);
  };
  rename(copy);
  return copy;
}

/** True when `id` is `ancestor` or sits somewhere inside it. */
export function isInside(project, id, ancestor) {
  const root = findNode(project, ancestor);
  if (!root) return false;
  let inside = false;
  const step = (node) => {
    if (node.id === id) inside = true;
    node.children.forEach(step);
  };
  step(root);
  return inside;
}

/** Moves a node under a new parent; a node cannot move into itself. */
export function moveNode(project, id, parentId, index) {
  const node = findNode(project, id);
  const from = findParent(project, id);
  const to = findNode(project, parentId);
  if (!node || !from || !to || !CONTAINERS.has(to.type) || isInside(project, parentId, id)) return false;
  const at = from.children.indexOf(node);
  from.children.splice(at, 1);
  const target = index === undefined ? to.children.length : (from === to && at < index ? index - 1 : index);
  to.children.splice(target, 0, node);
  return true;
}

/** Sets or clears (undefined / "") a property. */
export function setProp(node, key, value) {
  if (value === undefined || value === "" || value === null) delete node.props[key];
  else node.props[key] = value;
}
