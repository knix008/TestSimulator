// ViewModels and data bindings in the project document (MVVM, as in WPF).
//
//   project.viewModels = [{ name: "Main", props: [{ name: "speed", type: "int", value: 40, min: 0, max: 100 }] }]
//   screen.dataContext = "Main"            the ViewModel the screen's bindings use by default
//   node.bindings = [{ prop: "value", path: "speed", vm?: "Main", mode?: "twoWay", converter?: "range", format?: "%d rpm" }]
//   project.viewModelRenames = [{ from: "Main", to: "Motor" }, { from: "Motor.speed", to: "Motor.rpm" }]
//     the renames, oldest first: they tell the application code's old names their new ones
//
// Nothing here touches the UI: the app and the tests share it.
import { BIND_MODES, CONVERTERS, VM_TYPES, bindAttr, bindableKeys, defaultMode } from "./schema.js";
import { findNode, sanitizeName, screenOf, walk } from "./project.js";

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const C_KEYWORDS = new Set(["auto", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "enum", "extern", "float", "for", "goto", "if", "inline", "int", "long", "register", "restrict", "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned", "void", "volatile", "while", "bool", "true", "false", "class", "new", "delete", "this", "template", "namespace"]);

/** A name usable in C, inside vm_<model>_get_<name>(). */
export const validVmName = (name) => IDENTIFIER.test(String(name)) && !C_KEYWORDS.has(String(name)) && String(name).length <= 40;

export const viewModels = (project) => project.viewModels ?? [];
export const findViewModel = (project, name) => viewModels(project).find((vm) => vm.name === name) ?? null;
export const usesMvvm = (project) => viewModels(project).length > 0;

/** The C prefix of a ViewModel: vm_main for "Main". Names differ even ignoring case. */
export const vmPrefix = (vm) => `vm_${String(vm.name ?? vm).toLowerCase()}`;

/** The ViewModel a screen's bindings use when they name none. */
export function contextOf(project, screen) {
  if (screen?.dataContext && findViewModel(project, screen.dataContext)) return screen.dataContext;
  return viewModels(project)[0]?.name ?? null;
}

/** { vm, prop } a binding of `node` points at, or null when it points at nothing. */
export function resolveBinding(project, node, binding) {
  const vmName = binding.vm ?? contextOf(project, screenOf(project, node.id));
  const vm = findViewModel(project, vmName);
  const prop = vm?.props.find((item) => item.name === binding.path) ?? null;
  return vm && prop ? { vm, prop } : null;
}

export const modeOf = (node, binding) => (binding.mode && binding.mode !== "default" ? binding.mode : defaultMode(node.type, binding.prop));

/** Every binding with its node, parents first. */
export function allBindings(project) {
  const list = [];
  walk(project, (node) => {
    for (const binding of node.bindings ?? []) list.push({ node, binding });
  });
  return list;
}

/** The binding of one inspector property, or null. */
export const bindingOf = (node, key) => (node.bindings ?? []).find((binding) => binding.prop === key) ?? null;

/** Initial value of a new property of a type. */
export function defaultValue(type) {
  if (type === "bool") return false;
  if (type === "string") return "";
  return 0;
}

/** A value made fit for a property: the right type, inside its range. */
export function fitValue(prop, value) {
  if (prop.type === "bool") return value === true || value === "true" || value === 1;
  if (prop.type === "string") return String(value ?? "");
  let number = Math.trunc(Number(value) || 0);
  if (Number.isInteger(prop.min) && Number.isInteger(prop.max) && prop.min < prop.max) number = Math.min(prop.max, Math.max(prop.min, number));
  return number;
}

function uniqueIn(names, base) {
  const taken = new Set(names.map((name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}${n}`.toLowerCase())) return `${base}${n}`;
}

/* --------------------------------------------------------------- changes */
// Each takes a draft project and changes it in place; false means nothing was done.

export function addViewModel(project, base = "Main") {
  project.viewModels = viewModels(project);
  const vm = { name: uniqueIn(project.viewModels.map((item) => item.name), base), props: [] };
  project.viewModels.push(vm);
  return vm;
}

export function addVmProp(project, vmName, type = "int", base = "value") {
  const vm = findViewModel(project, vmName);
  if (!vm || !VM_TYPES.includes(type)) return null;
  const prop = { name: uniqueIn(vm.props.map((item) => item.name), base), type, value: defaultValue(type) };
  if (type === "int") Object.assign(prop, { min: 0, max: 100 });
  vm.props.push(prop);
  return prop;
}

/** Every binding that resolves to `vmName` (and `propName`, when given). */
function bindingsTo(project, vmName, propName) {
  return allBindings(project).filter(({ node, binding }) => {
    const target = binding.vm ?? contextOf(project, screenOf(project, node.id));
    return target === vmName && (propName === undefined || binding.path === propName);
  });
}

/** At most this many renames are remembered. */
export const RENAMES_KEPT = 100;

function remember(project, from, to) {
  project.viewModelRenames = [...(project.viewModelRenames ?? []), { from, to }].slice(-RENAMES_KEPT);
}

/**
 * Every earlier name of each property that exists now: Map "Model.prop" (as it was) -> "Model.prop"
 * (now), and Map "Model" (as it was) -> "Model" (now). From the renames, newest first.
 */
export function formerNames(project) {
  const props = new Map();
  const models = new Map();
  const renames = project.viewModelRenames ?? [];
  for (const vm of viewModels(project)) {
    let vmName = vm.name;
    for (let i = renames.length - 1; i >= 0; i--) {
      const { from, to } = renames[i];
      if (!from.includes(".") && to === vmName) {
        vmName = from;
        if (!models.has(vmName)) models.set(vmName, vm.name);
      }
    }
    for (const prop of vm.props) {
      let [model, name] = [vm.name, prop.name];
      for (let i = renames.length - 1; i >= 0; i--) {
        const { from, to } = renames[i];
        if (from.includes(".")) {
          if (to === `${model}.${name}`) [model, name] = from.split(".");
        } else if (to === model) {
          model = from;
        } else {
          continue;
        }
        const key = `${model}.${name}`;
        if (key !== `${vm.name}.${prop.name}` && !props.has(key)) props.set(key, `${vm.name}.${prop.name}`);
      }
    }
  }
  return { props, models };
}

export function renameViewModel(project, from, to) {
  const vm = findViewModel(project, from);
  if (!vm || !validVmName(to) || viewModels(project).some((item) => item !== vm && item.name.toLowerCase() === to.toLowerCase())) return false;
  if (from !== to) remember(project, from, to);
  // Bindings that use it through a data context keep doing so.
  for (const { binding } of bindingsTo(project, from)) if (binding.vm === from) binding.vm = to;
  for (const screen of project.screens) if (screen.dataContext === from) screen.dataContext = to;
  vm.name = to;
  return true;
}

export function removeViewModel(project, name) {
  const vm = findViewModel(project, name);
  if (!vm) return false;
  for (const { node, binding } of bindingsTo(project, name)) node.bindings = node.bindings.filter((item) => item !== binding);
  project.viewModels = viewModels(project).filter((item) => item !== vm);
  for (const screen of project.screens) if (screen.dataContext === name) delete screen.dataContext;
  tidy(project);
  return true;
}

export function renameVmProp(project, vmName, from, to) {
  const vm = findViewModel(project, vmName);
  const prop = vm?.props.find((item) => item.name === from);
  if (!prop || !validVmName(to) || vm.props.some((item) => item !== prop && item.name.toLowerCase() === to.toLowerCase())) return false;
  if (from !== to) remember(project, `${vmName}.${from}`, `${vmName}.${to}`);
  for (const { binding } of bindingsTo(project, vmName, from)) binding.path = to;
  prop.name = to;
  return true;
}

export function removeVmProp(project, vmName, name) {
  const vm = findViewModel(project, vmName);
  if (!vm?.props.some((item) => item.name === name)) return false;
  for (const { node, binding } of bindingsTo(project, vmName, name)) node.bindings = node.bindings.filter((item) => item !== binding);
  vm.props = vm.props.filter((item) => item.name !== name);
  tidy(project);
  return true;
}

/** Changes a property's type, range or initial value; the value is made to fit. */
export function editVmProp(project, vmName, name, patch) {
  const prop = findViewModel(project, vmName)?.props.find((item) => item.name === name);
  if (!prop) return false;
  if (patch.type !== undefined && VM_TYPES.includes(patch.type) && patch.type !== prop.type) {
    prop.type = patch.type;
    if (prop.type === "int") Object.assign(prop, { min: 0, max: 100 });
    else {
      delete prop.min;
      delete prop.max;
    }
    prop.value = defaultValue(prop.type);
  }
  if (prop.type === "int") {
    if (patch.min !== undefined) prop.min = Math.trunc(Number(patch.min) || 0);
    if (patch.max !== undefined) prop.max = Math.trunc(Number(patch.max) || 0);
  }
  if (patch.value !== undefined) prop.value = patch.value;
  prop.value = fitValue(prop, prop.value);
  return true;
}

/** Binds (or, with path null, unbinds) one inspector property of a node. */
export function setBinding(project, nodeId, key, binding) {
  const node = findNode(project, nodeId);
  if (!node || !bindableKeys(node.type).includes(key)) return false;
  const others = (node.bindings ?? []).filter((item) => item.prop !== key);
  if (binding && binding.path) {
    const clean = { prop: key, path: binding.path };
    if (binding.vm) clean.vm = binding.vm;
    if (binding.mode && binding.mode !== "default") clean.mode = binding.mode;
    if (binding.converter && binding.converter !== "none") clean.converter = binding.converter;
    if (binding.format) clean.format = String(binding.format);
    others.push(clean);
  }
  if (others.length) node.bindings = others;
  else delete node.bindings;
  return true;
}

/** The range a bound value is scaled onto with the range converter: the widget's own. */
export function bindViewRange(node, key) {
  const { props, type } = node;
  if (key === "checked" || key === "hidden" || key === "disabled") return [0, 1];
  if (["slider", "bar", "arc", "spinbox"].includes(type)) {
    if (props.min !== undefined && props.max !== undefined) return [Number(props.min) || 0, Number(props.max) || 0];
    return type === "spinbox" ? [0, 0] : [0, 100];
  }
  if (type === "dropdown" || type === "roller") return [0, Math.max(0, String(props.options ?? "").split("\n").length - 1)];
  if (type === "led") return [0, 255];
  if (type === "image") return [0, 359];
  return [0, 100];
}

/** The type of ViewModel property a widget property is bound to by default. */
export function typeForKey(key) {
  if (key === "text") return "string";
  if (bindAttr(key) === "value") return "int";
  return "bool";
}

/**
 * Binds a property: to a new ViewModel property that starts with the widget's value (and has
 * the widget's range), in the screen's data context, which is made when there is none. Like
 * "extract to property": one click, and the widget shows what it showed before.
 */
export function bindNew(project, nodeId, key) {
  const node = findNode(project, nodeId);
  if (!node || !bindableKeys(node.type).includes(key)) return null;
  let vmName = contextOf(project, screenOf(project, nodeId));
  if (!vmName) vmName = addViewModel(project).name;
  const type = typeForKey(key);
  const prop = addVmProp(project, vmName, type, sanitizeName(`${node.name}_${key}`));
  if (type === "int") {
    const [min, max] = bindViewRange(node, key);
    editVmProp(project, vmName, prop.name, min < max ? { min, max } : { min: 0, max: 0 });
  }
  const current = node.props[key];
  if (current !== undefined) editVmProp(project, vmName, prop.name, { value: key === "text" ? String(current) : current });
  setBinding(project, nodeId, key, { path: prop.name });
  return { vm: vmName, prop: prop.name };
}

/** No empty lists left behind; an unused viewModels list is dropped. */
function tidy(project) {
  walk(project, (node) => {
    if (node.bindings && !node.bindings.length) delete node.bindings;
  });
  if (project.viewModels && !project.viewModels.length) {
    delete project.viewModels;
    delete project.viewModelRenames;
  }
}

/* ------------------------------------------------------------- validation */

/** Throws when the MVVM parts of a project file are not what FILE_FORMAT.md describes. */
export function checkMvvm(data) {
  const fail = (what) => {
    throw new Error(`invalid project file: ${what}`);
  };
  if (data.viewModels !== undefined) {
    if (!Array.isArray(data.viewModels)) fail("viewModels is not a list");
    const names = new Set();
    for (const vm of data.viewModels) {
      if (!validVmName(vm?.name)) fail(`bad ViewModel name "${vm?.name}"`);
      if (names.has(vm.name.toLowerCase())) fail(`duplicate ViewModel "${vm.name}"`);
      names.add(vm.name.toLowerCase());
      if (!Array.isArray(vm.props)) fail(`ViewModel "${vm.name}" has no property list`);
      const props = new Set();
      for (const prop of vm.props) {
        if (!validVmName(prop?.name)) fail(`bad property name "${prop?.name}" in "${vm.name}"`);
        if (props.has(prop.name.toLowerCase())) fail(`duplicate property "${prop.name}" in "${vm.name}"`);
        props.add(prop.name.toLowerCase());
        if (!VM_TYPES.includes(prop.type)) fail(`bad type of "${vm.name}.${prop.name}"`);
        const typed = prop.type === "int" ? Number.isInteger(prop.value) : prop.type === "bool" ? typeof prop.value === "boolean" : typeof prop.value === "string";
        if (!typed) fail(`bad value of "${vm.name}.${prop.name}"`);
        if (prop.type === "int" && (prop.min !== undefined || prop.max !== undefined) && !(Number.isInteger(prop.min) && Number.isInteger(prop.max))) fail(`bad range of "${vm.name}.${prop.name}"`);
      }
    }
  }
  if (data.viewModelRenames !== undefined) {
    if (!Array.isArray(data.viewModelRenames)) fail("viewModelRenames is not a list");
    for (const item of data.viewModelRenames) {
      const name = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
      if (typeof item?.from !== "string" || typeof item.to !== "string" || !name.test(item.from) || !name.test(item.to) || item.from.includes(".") !== item.to.includes(".")) fail("bad ViewModel rename");
    }
  }
  const check = (node) => {
    if (node.dataContext !== undefined && typeof node.dataContext !== "string") fail(`bad data context (${node.id})`);
    if (node.bindings !== undefined) {
      if (!Array.isArray(node.bindings)) fail(`bindings is not a list (${node.id})`);
      const keys = new Set();
      for (const binding of node.bindings) {
        if (typeof binding?.prop !== "string" || typeof binding.path !== "string" || !binding.path) fail(`bad binding (${node.id})`);
        if (keys.has(binding.prop)) fail(`two bindings of "${binding.prop}" (${node.id})`);
        keys.add(binding.prop);
        if (binding.vm !== undefined && typeof binding.vm !== "string") fail(`bad binding ViewModel (${node.id})`);
        if (binding.mode !== undefined && !BIND_MODES.includes(binding.mode)) fail(`bad binding mode "${binding.mode}" (${node.id})`);
        if (binding.converter !== undefined && CONVERTERS[binding.converter] === undefined) fail(`bad converter "${binding.converter}" (${node.id})`);
        if (binding.format !== undefined && typeof binding.format !== "string") fail(`bad binding format (${node.id})`);
      }
    }
    node.children?.forEach(check);
  };
  data.screens.forEach(check);
}
