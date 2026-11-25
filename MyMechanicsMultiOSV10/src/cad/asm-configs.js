// Assembly configurations: each keeps which components are suppressed or hidden, which part configuration each
// instance uses, and which mates are suppressed with what value. Switching stores the current state under the
// configuration being left and puts the chosen one's on the assembly, so everything that reads the assembly
// (solving, display, BOM, interference, drawings) works on the active configuration as it is.
//   assembly.configurations = [{ id, name }], assembly.config = active id ('' / absent: the default),
//   assembly.configStates = { [id | '']: { comps: { id: { suppressed, hidden, config } }, mates: { id: { suppressed, value } } } }

let n = 0;
const newId = () => `acfg${Date.now().toString(36).slice(-5)}${(n++).toString(36)}`;

/** The state an assembly configuration keeps, read from the assembly as it is now. */
export function captureState(asm) {
  const comps = {};
  for (const c of asm.components ?? []) comps[c.id] = { suppressed: Boolean(c.suppressed), hidden: Boolean(c.hidden), config: c.config ?? null };
  const mates = {};
  for (const m of asm.mates ?? []) mates[m.id] = { suppressed: Boolean(m.suppressed), ...(m.value != null ? { value: m.value } : {}) };
  return { comps, mates };
}

/** Puts a kept state on the assembly (components / mates it does not know keep theirs). */
export function applyState(asm, st) {
  for (const c of asm.components ?? []) {
    const s = st?.comps?.[c.id];
    if (!s) continue;
    if (s.suppressed) c.suppressed = true; else delete c.suppressed;
    if (s.hidden) c.hidden = true; else delete c.hidden;
    if (s.config) c.config = s.config; else delete c.config;
  }
  for (const m of asm.mates ?? []) {
    const s = st?.mates?.[m.id];
    if (!s) continue;
    if (s.suppressed) m.suppressed = true; else delete m.suppressed;
    if (s.value != null) m.value = s.value;
  }
}

export const activeAssemblyConfig = (asm) => (asm.configurations ?? []).find((c) => c.id === asm.config) ?? null;

/** Makes configuration `id` ('' = the default) active: the current state is kept under the one being left. */
export function switchAssemblyConfig(asm, id) {
  const from = asm.config ?? '';
  const to = id ?? '';
  if (from === to) return;
  asm.configStates ??= {};
  asm.configStates[from] = captureState(asm);
  if (asm.configStates[to]) applyState(asm, asm.configStates[to]);
  if (to) asm.config = to; else delete asm.config;
}

/** Adds a configuration starting as a copy of the active state, and makes it active. Returns it. */
export function addAssemblyConfig(asm, name) {
  asm.configurations ??= [];
  const c = { id: newId(), name: name || `Config${asm.configurations.length + 2}` };
  asm.configurations.push(c);
  asm.configStates ??= {};
  asm.configStates[asm.config ?? ''] = captureState(asm);
  asm.configStates[c.id] = captureState(asm);
  asm.config = c.id;
  return c;
}

/** Removes a configuration (the default becomes active when it was the active one). */
export function removeAssemblyConfig(asm, id) {
  if (asm.config === id) switchAssemblyConfig(asm, '');
  asm.configurations = (asm.configurations ?? []).filter((c) => c.id !== id);
  if (asm.configStates) delete asm.configStates[id];
}
