// Electronics cooling (assembly › Simulation › Electronics Cooling): the components of an assembly in air, each with
// a role — heat source (power, junction-to-case resistance θ_jc, temperature limit), board (in-plane and
// through-thickness conductivity: an orthotropic PCB), conducting part, enclosure (the air flows through it) or left
// out — and the air: forced along an axis, natural convection (buoyancy over a slight draft), or a fan with its
// curve (maximum flow, maximum pressure) pushing air through the enclosure. Solved on the lattice with conjugate
// heat transfer (cad/cfd/lbm.js: flowStudy with components, fanFlowStudy); the components are coloured by their
// temperature and each is listed with its maximum, mean and junction temperature against its limit.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { heatMaterial } from './app-fem.js';
import { temperatureColor } from './cad/fea.js';

const ROLES = ['source', 'board', 'conduct', 'enclosure', 'ignore'];

export function createElectronicsTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'electronics';
  const asm = () => ctx.activeAssembly();
  const fmt = (v, d = 2) => ctx.fmt(v, d);
  const vp = () => ctx.viewport();
  let display = null;   // { asmId, bodies, result, min, max }

  /** The study kept in the assembly: roles and values per component, the air and the fan. */
  const studyOf = (a = asm(), create = false) => { if (a && !a.electronics && create) a.electronics = { roles: {}, flow: 'forced', axis: 'x', sign: 1, velocity: 1, inlet: 25, resolution: 24, fan: { maxFlow: 50, maxPressure: 40 } }; return a?.electronics ?? null; };
  const edit = (mutate) => ctx.change('op.electronics', () => mutate(studyOf(asm(), true)));
  const comps = () => (asm()?.components ?? []).filter((c) => !c.suppressed);
  const roleOf = (st, c) => st?.roles?.[c.id] ?? { role: 'conduct' };

  function begin() {
    const a = asm();
    if (!a) { notify('info', t('notice.assemblyOnly')); return; }
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    if (!studyOf(a)) ctx.change('op.electronics', () => { studyOf(a, true); });
    state.editing = { mode: 'electronics', result: null };
    state.leftTab = 'pm';
    ctx.renderAll();
  }
  function finish() { clearDisplay(); ctx.cancelEditing({ quiet: true }); }

  /** The bodies of the study: each component's placed mesh with its role and properties. */
  function bodies() {
    const st = studyOf();
    const placed = ctx.assemblyBodies(asm());
    return placed.map((b) => {
      const r = roleOf(st, { id: b.compId });
      const m = heatMaterial(b.material);
      const V = b.mesh.vertices; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], V[i + k]); hi[k] = Math.max(hi[k], V[i + k]); }
      const ext = hi.map((v, k) => v - lo[k]); const thin = ext.indexOf(Math.min(...ext));
      let k = m.k;
      if (r.role === 'board') { k = [0, 1, 2].map((a) => (a === thin ? r.kThrough ?? 0.3 : r.kIn ?? 20)); }
      return { ...b, role: r.role ?? 'conduct', power: r.role === 'source' ? Number(r.power) || 0 : 0, thetaJC: r.role === 'source' && r.thetaJC > 0 ? Number(r.thetaJC) : null, limit: r.limit > 0 ? Number(r.limit) : null, k, density: r.role === 'board' ? 1850 : m.density, cp: r.role === 'board' ? 1100 : m.cp };
    }).filter((b) => b.role !== 'ignore');
  }

  async function run() {
    const e = editing(); const a = asm(); const st = studyOf();
    if (!owns(e) || !a || !st) return null;
    const list = bodies();
    if (!list.length) { notify('error', t('el.noBodies')); return null; }
    if (!list.some((b) => b.power > 0)) { notify('error', t('el.noPower')); return null; }
    const enclosure = list.find((b) => b.role === 'enclosure');
    if (st.flow === 'fan' && !enclosure) { notify('error', t('el.needEnclosure')); return null; }
    const internal = Boolean(enclosure) && st.flow !== 'natural';
    const components = list.map((b) => ({ name: b.name, mesh: b.mesh, power: b.power, k: b.k, density: b.density, cp: b.cp, thetaJC: b.thetaJC, limit: b.limit }));
    const input = {
      mesh: null, mode: internal ? 'internal' : 'external', axis: st.axis, sign: Number(st.sign) || 1,
      velocity: st.flow === 'natural' ? 0.05 : Math.max(0.01, Number(st.velocity) || 1), fluid: 'air',
      // MRT with large-eddy damping: stable on the coarse grids around small parts in low-viscosity air.
      collision: 'mrt', les: 0.17,
      resolution: Math.max(8, Math.min(64, Math.round(st.resolution ?? 24))), time: { mode: 'steady', ...(st.maxSteps > 0 ? { maxSteps: Math.round(st.maxSteps), passes: 1e6 } : { passes: 30 }) },
      thermal: { inlet: Number(st.inlet ?? 25), body: { mode: 'conduct' }, components, buoyancy: st.flow === 'natural' },
      ...(st.flow === 'fan' ? { fan: { maxFlow: (Number(st.fan?.maxFlow) || 50) / 3600, maxPressure: Number(st.fan?.maxPressure) || 40 } } : {}),
    };
    const r = await ctx.runStudy('electronics', input, a.name);
    if (!r) return null;
    if (r.error && r.error !== 'not-converged') { notify('error', t(`sim2.error.${r.error}`, null, t(`sim.error.${r.error}`, null, r.error))); return null; }
    if (r.error === 'not-converged') notify('warning', t('fem.flowNotSteady'));
    if (asm() !== a || !owns(editing())) return null;
    editing().result = r;
    showResult(r, list);
    const over = r.components.filter((c) => c.over);
    notify(over.length ? 'warning' : 'success', over.length ? t('el.overNotice', { names: over.map((c) => c.name).join(', ') }) : t('el.doneNotice', { max: fmt(Math.max(...r.components.map((c) => c.junction ?? c.max ?? -Infinity)), 1) }));
    ctx.renderLeft();
    return r;
  }

  /** Temperature of the solid cell at a point (the nearest cell of the same body around it). */
  function cellTemperature(r, p) {
    const [nx, ny, nz] = r.dims || r.flow?.dims || [];
    const ijk = [0, 1, 2].map((a) => Math.floor((p[a] - r.origin[a]) / r.h));
    let best = null, bd = Infinity;
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ijk[0] + di, j = ijk[1] + dj, k = ijk[2] + dk;
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
      const s = i + nx * (j + ny * k);
      if (r.solid[s] !== 1) continue;
      const d = di * di + dj * dj + dk * dk;
      if (d < bd) { bd = d; best = r.temp[s]; }
    }
    return best;
  }

  function showResult(r, list) {
    clearDisplay();
    const v = vp(); if (!v) return;
    const temps = list.map((b) => { const V = b.mesh.vertices; const out = new Float32Array(V.length / 3); for (let i = 0; i < out.length; i++) out[i] = cellTemperature({ ...r, dims: r.dims ?? r.flow?.dims }, [V[3 * i], V[3 * i + 1], V[3 * i + 2]]) ?? r.components.find((c) => c.name === b.name)?.mean ?? 0; return out; });
    let min = Infinity, max = -Infinity; for (const T of temps) for (const x of T) { min = Math.min(min, x); max = Math.max(max, x); }
    const colors = list.map((b, i) => { const c = new Float32Array(temps[i].length * 3); temps[i].forEach((x, j) => c.set(temperatureColor(x, min, max), 3 * j)); return c; });
    display = { asmId: asm()?.id, list, min, max, colors };
    ctx.syncView();
  }
  /** After the view is rebuilt: the components coloured by temperature in place of the plain ones. */
  function decorate(kind) {
    const v = vp(); const a = asm();
    if (!v || kind !== 'assembly' || !display) return;
    if (!a || display.asmId !== a.id || !owns(editing())) { display = null; return; }
    display.list.forEach((b, i) => {
      v.addBody({ key: `elres:${i}`, mesh: { ...b.mesh, triangles: Array.from(b.mesh.triangles) }, edges: null, colors: display.colors[i], faceIndex: new Map(), edgeIndex: new Map(), opacity: b.role === 'enclosure' ? 0.25 : 1, pickable: false });
      const orig = v.bodies.get(b.key); if (orig?.mesh) orig.mesh.visible = false;
    });
    v.requestRender?.();
  }
  function clearDisplay() { if (!display) return; display = null; ctx.syncView(); }

  // ───────────────────────── PropertyManager

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmButton } = ctx.pm;
    const a = asm(); const st = studyOf(a);
    if (!a || !st) return pmHead('electronics', t('cmd.electronicsCooling'), t('notice.assemblyOnly'));
    const sel = (key, options, current) => `<select data-pm-select="${escapeHtml(key)}">${options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${v === current ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`;
    const numIn = (key, v, label) => `<input type="text" class="el-num" data-pm-field="${escapeHtml(key)}" value="${escapeHtml(String(v ?? ''))}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" spellcheck="false"/>`;
    const rows = comps().map((c) => {
      const r = roleOf(st, c);
      const extra = r.role === 'source' ? `${numIn(`el.power:${c.id}`, r.power ?? 1, t('el.power'))}<span>W</span>${numIn(`el.theta:${c.id}`, r.thetaJC ?? '', t('el.thetaJC'))}<span>K/W</span>${numIn(`el.limit:${c.id}`, r.limit ?? '', t('el.limit'))}<span>°C</span>`
        : r.role === 'board' ? `${numIn(`el.kIn:${c.id}`, r.kIn ?? 20, t('el.kIn'))}<span>∥</span>${numIn(`el.kThrough:${c.id}`, r.kThrough ?? 0.3, t('el.kThrough'))}<span>⊥ W/m·K</span>` : '';
      return `<div class="el-row" data-el-comp="${escapeHtml(c.id)}"><span class="el-name">${icon(r.role === 'source' ? 'femHeat' : r.role === 'board' ? 'sheetMetal' : r.role === 'enclosure' ? 'femAssembly' : 'part', 'icon tiny')}${escapeHtml(c.name)}</span>${sel(`el.role:${c.id}`, ROLES.map((x) => [x, t(`el.role.${x}`)]), r.role ?? 'conduct')}<span class="el-extra">${extra}</span></div>`;
    }).join('');
    const air = [
      pmSeg('elFlow', [['forced', t('el.flow.forced'), 'sim2Flow'], ['natural', t('el.flow.natural'), 'femGravity'], ['fan', t('el.flow.fan'), 'fan']], st.flow),
      st.flow !== 'natural' ? pmSeg('elAxis', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], st.axis) + pmSeg('elSign', [['1', '+'], ['-1', '−']], String(st.sign)) : '',
      st.flow === 'forced' ? pmNum('elVelocity', st.velocity, `${t('sim2.velocity')} (m/s)`, 'sim2Flow') : '',
      st.flow === 'fan' ? `${pmNum('elFanFlow', st.fan?.maxFlow ?? 50, `${t('el.fanMaxFlow')} (m³/h)`, 'fan')}${pmNum('elFanPressure', st.fan?.maxPressure ?? 40, `${t('el.fanMaxPressure')} (Pa)`, 'fan')}<p class="pm-note">${escapeHtml(t('el.fanNote'))}</p>` : '',
      st.flow === 'natural' ? `<p class="pm-note">${escapeHtml(t('el.naturalNote'))}</p>` : '',
      pmNum('elInlet', st.inlet ?? 25, `${t('el.ambient')} (°C)`, 'sun'),
      pmNum('elResolution', st.resolution ?? 24, t('sim2.flowResolution'), 'plVoxel'),
      pmNum('elMaxSteps', st.maxSteps ?? 0, t('el.maxSteps'), 'statistics'),
    ].join('');
    const r = e.result;
    let res = `<div class="pm-row">${pmButton('el.run', 'simulation', t('el.run'), 'primary')}</div>`;
    if (r) {
      const line = (c) => `<tr class="${c.over ? 'el-over' : ''}"><td>${escapeHtml(c.name)}</td><td>${c.power ? fmt(c.power, 2) : '—'}</td><td>${c.max != null ? fmt(c.max, 1) : '—'}</td><td>${c.mean != null ? fmt(c.mean, 1) : '—'}</td><td>${c.junction != null ? fmt(c.junction, 1) : '—'}</td><td>${c.limit != null ? fmt(c.limit, 0) : '—'}</td></tr>`;
      res += `<table class="sim2-table el-table"><tr><th></th><th>W</th><th>${escapeHtml(t('el.tMax'))}</th><th>${escapeHtml(t('el.tMean'))}</th><th>T_j</th><th>${escapeHtml(t('el.limit'))}</th></tr>${r.components.map(line).join('')}</table>`;
      res += `<dl class="pm-results"><dt>${escapeHtml(t('el.heatRemoved'))}</dt><dd>${escapeHtml(`${fmt(r.heat, 2)} W`)}</dd>${r.fan ? `<dt>${escapeHtml(t('el.fanPoint'))}</dt><dd data-el-fan>${escapeHtml(`${fmt(r.fan.flow * 3600, 2)} m³/h · ${fmt(r.fan.pressure, 2)} Pa`)}</dd>` : ''}<dt>${escapeHtml(t('sim2.velocity'))}</dt><dd>${escapeHtml(`${fmt(r.velocity, 3)} m/s`)}</dd></dl>`;
      if (display) res += `<div class="sim-legend"><span>${escapeHtml(`${fmt(display.min, 1)} °C`)}</span><i></i><span>${escapeHtml(`${fmt(display.max, 1)} °C`)}</span></div>`;
      res += `<div class="pm-row">${pmButton('el.clear', 'trash', t('sim.clear'))}</div>`;
    }
    return [
      pmHead('electronics', t('cmd.electronicsCooling'), t('pm.help.electronics')),
      pmGroup('femAssembly', t('el.components'), `<div class="el-list">${rows}</div><p class="pm-note">${escapeHtml(t('el.roleNote'))}</p>`),
      pmGroup('sim2Flow', t('el.air'), air),
      pmGroup('simulation', t('sim.results'), res),
    ].join('');
  }

  const compRole = (id, mutate) => edit((st) => { st.roles[id] = { ...(st.roles[id] ?? { role: 'conduct' }) }; mutate(st.roles[id]); });
  function field(key, raw) {
    const v = Number(String(raw ?? '').replace(',', '.'));
    const [k, id] = String(key).split(':');
    const blankOk = k === 'el.theta' || k === 'el.limit';
    if (String(raw ?? '').trim() === '' && blankOk) { compRole(id, (r) => { r[k === 'el.theta' ? 'thetaJC' : 'limit'] = null; }); return true; }
    if (!Number.isFinite(v)) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return true; }
    const per = { 'el.power': 'power', 'el.theta': 'thetaJC', 'el.limit': 'limit', 'el.kIn': 'kIn', 'el.kThrough': 'kThrough' }[k];
    if (per) { if (v < 0 || (['kIn', 'kThrough'].includes(per) && !(v > 0))) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return true; } compRole(id, (r) => { r[per] = v; }); return true; }
    const top = { elVelocity: 'velocity', elInlet: 'inlet', elResolution: 'resolution', elMaxSteps: 'maxSteps' }[key];
    if (top) { if (key !== 'elInlet' && key !== 'elMaxSteps' && !(v > 0)) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return true; } edit((st) => { st[top] = v; }); return true; }
    if (key === 'elFanFlow' || key === 'elFanPressure') { if (!(v > 0)) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return true; } edit((st) => { st.fan = { ...(st.fan ?? {}), [key === 'elFanFlow' ? 'maxFlow' : 'maxPressure']: v }; }); return true; }
    return false;
  }
  function set(key, value) {
    if (key === 'elFlow') { edit((st) => { st.flow = value; }); return true; }
    if (key === 'elAxis') { edit((st) => { st.axis = value; }); return true; }
    if (key === 'elSign') { edit((st) => { st.sign = Number(value); }); return true; }
    return false;
  }
  function select(key, value) {
    const [k, id] = String(key).split(':');
    if (k === 'el.role' && ROLES.includes(value)) { compRole(id, (r) => { r.role = value; if (value === 'source' && r.power == null) r.power = 1; }); return true; }
    return false;
  }

  const NAMES = new Set(['el.run', 'el.clear']);
  const handles = (name) => NAMES.has(name);
  async function command(name) {
    if (name === 'el.run') return run();
    if (name === 'el.clear') { clearDisplay(); if (editing()) editing().result = null; return ctx.renderLeft(); }
    return undefined;
  }
  /** After undo / redo: the study may have changed; the old result no longer matches. */
  function afterHistory() { if (owns(editing())) ctx.renderLeft(); }

  const commands = {
    electronicsCooling: { icon: 'electronics', label: 'cmd.electronicsCooling', enabled: () => Boolean(asm()), checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
  };
  const api = { begin, run, finish, study: () => studyOf(), bodies, display: () => display, setRole: (compName, values) => { const c = comps().find((x) => x.name === compName || x.id === compName); if (!c) throw new Error(`no component ${compName}`); compRole(c.id, (r) => Object.assign(r, values)); }, setStudy: (values) => edit((st) => Object.assign(st, values)) };
  return { commands, owns, pm, pick: () => undefined, field, set, select, toggle: () => undefined, accept: () => finish(), handles, command, subject: () => t('cmd.electronicsCooling'), finish, cleanup: clearDisplay, afterHistory, decorate, api };
}
