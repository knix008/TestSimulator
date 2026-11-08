// The Node Editor: shader, world, geometry and compositor trees. Nodes are DOM elements in a pannable, zoomable world,
// links an SVG layer behind them. Drag a socket to link, drag a head to move, X deletes, Shift+A adds.
import { activeObject, getMaterial } from '../../core/doc.js';
import { NODE_TYPES, addLink, createGroupNode, createNode, makeGroup, nodeSockets, nodesForKind, syncGroupInstances, ungroup, wouldCycle } from '../../core/nodes.js';
import { oslShader } from '../../core/osl.js';
import { syncRenderLayers } from '../../core/passes.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { enumName, nameOf, propName, t } from '../i18n.js';
import { menuTitle, openMenu } from '../menus.js';
import { button, colorField, emptyNote, numField, select, textField } from '../widgets.js';

const NS = 'http://www.w3.org/2000/svg';
const SOCKET_COLOR = { VALUE: '#a1a1a1', COLOR: '#c7c729', VECTOR: '#6363c7', SHADER: '#63c763', GEOMETRY: '#00d6a3', IMAGE: '#c7a229' };
/** Sockets carrying a value that can be typed in when nothing is linked. */
const EDITABLE = new Set(['VALUE', 'COLOR']);

export function createNodeEditor(app, el, area) {
  const state = area.state ??= { tree: area.tree ?? 'SHADER', x: 40, y: 40, zoom: 1 };
  const root = h('div', { className: 'node-editor', dataset: { testid: 'node-editor' } });
  const world = h('div', { className: 'node-world' });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'node-links');
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  world.append(svg);
  const nodesLayer = h('div');
  world.append(nodesLayer);
  root.append(world);
  el.append(root);
  const selected = new Set();
  let mouse = { x: 100, y: 100 };

  /** The tree being edited: the owner's, or the group it has been entered into (Tab). */
  const current = () => {
    const base = baseTree();
    if (!base.graph) return base;
    let { graph } = base;
    const trail = [];
    for (const id of state.groupPath ?? []) {
      const node = graph.nodes.find((n) => n.id === id && n.type === 'GROUP');
      if (!node) { state.groupPath = trail; break; }
      trail.push(id);
      graph = node.group.graph;
    }
    return { ...base, graph };
  };
  const groupNodeAtPath = () => {
    let { graph } = baseTree();
    let node = null;
    for (const id of state.groupPath ?? []) { node = graph?.nodes.find((n) => n.id === id); graph = node?.group?.graph; }
    return node;
  };
  const exitGroup = () => {
    const node = groupNodeAtPath();
    if (!node) return;
    syncGroupInstances(app.doc, node.group);
    state.groupPath = state.groupPath.slice(0, -1);
    selected.clear();
    app.changed('Edit Group', true);
    lastGraphKey = '';
    update();
    frameAll();
    syncHeader();
  };
  const enterGroup = () => {
    const graph = current().graph;
    const node = graph?.nodes.find((n) => selected.has(n.id) && n.type === 'GROUP');
    if (!node) return false;
    state.groupPath = [...(state.groupPath ?? []), node.id];
    selected.clear();
    lastGraphKey = '';
    update();
    frameAll();
    syncHeader();
    return true;
  };
  const groupSelected = () => {
    const graph = current().graph;
    if (!graph || !selected.size) return;
    const taken = new Set((app.doc.nodeGroups ?? []).map((g) => g.name));
    let name = 'NodeGroup';
    for (let i = 1; taken.has(name); i++) name = `NodeGroup.${String(i).padStart(3, '0')}`;
    const node = makeGroup(graph, [...selected], name);
    if (!node) return;
    syncGroupInstances(app.doc, node.group);
    selected.clear();
    selected.add(node.id);
    app.changed('Make Group', true);
    update();
  };
  const ungroupSelected = () => {
    const graph = current().graph;
    const node = graph?.nodes.find((n) => selected.has(n.id) && n.type === 'GROUP');
    if (!node || !ungroup(graph, node.id)) return;
    selected.clear();
    app.changed('Ungroup', true);
    update();
  };
  const baseTree = () => {
    const doc = app.doc;
    const obj = activeObject(doc);
    if (state.tree === 'WORLD') return doc.world.useNodes ? { graph: doc.world.nodes, owner: doc.world } : { need: 'world.use_nodes', label: t('Use World Nodes', '월드 노드 사용') };
    if (state.tree === 'COMPOSITOR') return doc.compositor ? { graph: doc.compositor } : { need: 'compositor.use_nodes', label: t('Use Compositor Nodes', '컴포지터 노드 사용') };
    if (state.tree === 'GEOMETRY') {
      const mod = obj?.modifiers?.find((m) => m.type === 'NODES');
      if (mod) return { graph: mod.graph };
      if (obj?.type === 'MESH' && app.canRun('object.modifier_add')) return { need: 'object.modifier_add', props: { type: 'NODES' }, label: t('New Geometry Nodes', '새 지오메트리 노드') };
      return { none: t('Select a mesh object in Object Mode', '오브젝트 모드에서 메시 오브젝트를 선택하세요') };
    }
    const id = obj?.materials?.find(Boolean);
    const mat = id ? getMaterial(doc, id) : null;
    if (!mat) return { none: t('The active object has no material', '활성 오브젝트에 재질이 없습니다') };
    return mat.useNodes && mat.nodes ? { graph: mat.nodes, owner: mat } : { need: 'material.use_nodes', label: t('Use Nodes', '노드 사용') };
  };

  const notice = h('div', { style: { position: 'absolute', inset: 0, display: 'none', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' } });
  root.append(notice);
  const socketEls = new Map();

  const applyView = () => { world.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`; };
  const toWorld = (x, y) => ({ x: (x - state.x) / state.zoom, y: (y - state.y) / state.zoom });
  const localPos = (e) => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const inputControl = (graph, node, socket) => {
    const linked = graph.links.some((l) => l.to === node.id && l.in === socket.name);
    const name = h('span', { className: `sock-name${linked ? ' linked' : ''}`, title: socket.name }, socket.name);
    if (linked || !EDITABLE.has(socket.type)) return [name];
    const value = node.values[socket.name] ?? socket.def;
    name.classList.add('with-field');
    if (socket.type === 'COLOR') return [name, colorField({ value, testid: `node-${node.type}-${socket.name}`, onChange: (v, final) => { node.values[socket.name] = v; app.changed('Node Value', final); } })];
    return [name, numField({ value, step: 0.05, testid: `node-${node.type}-${socket.name}`, onChange: (v, final) => { node.values[socket.name] = v; app.changed('Node Value', final); } })];
  };

  const nodeProps = (node, spec) => {
    const out = [];
    for (const [key, options] of Object.entries(spec.options ?? {})) {
      out.push(h('div', { className: 'node-row' }, select({ value: node.values[key], options, testid: `node-${node.type}-${key}`, onChange: (v) => { node.values[key] = v; app.changed('Node Option', true); } })));
    }
    if (node.type === 'SCRIPT_OSL') {
      const problem = oslShader(node.values.source ?? '').error;
      out.push(h('textarea', { className: 'osl-source', spellcheck: false, value: node.values.source ?? '', dataset: { testid: 'osl-source' }, onChange: (e) => { node.values.source = e.target.value; lastGraphKey = ''; app.changed('OSL Source', true); update(); }, onKeydown: (e) => e.stopPropagation(), onPointerdown: (e) => e.stopPropagation() }));
      if (problem) out.push(h('div', { className: 'osl-error', dataset: { testid: 'osl-error' } }, problem));
    }
    if (node.type === 'CMP_CRYPTOMATTE') out.push(h('div', { className: 'node-row' }, textField({ value: node.values.matteId ?? '', placeholder: t('Names, by commas', '이름, 쉼표로'), testid: 'node-CMP_CRYPTOMATTE-matteId', onChange: (v) => { node.values.matteId = v; app.changed('Cryptomatte', true); } })));
    if (node.type === 'VALUE') out.push(h('div', { className: 'node-row' }, numField({ value: node.values.value ?? 0.5, step: 0.05, testid: 'node-VALUE-value', onChange: (v, final) => { node.values.value = v; app.changed('Node Value', final); } })));
    if (node.type === 'RGB') out.push(h('div', { className: 'node-row' }, colorField({ value: node.values.color ?? [0.5, 0.5, 0.5], onChange: (v, final) => { node.values.color = v; app.changed('Node Value', final); } })));
    if (node.type === 'TEX_IMAGE') out.push(h('div', { className: 'node-row' }, select({ value: node.values.image, options: [[null, t('(none)', '(없음)')], ...app.doc.images.map((i) => [i.id, i.name])], onChange: (v) => { node.values.image = v || null; app.changed('Node Image', true); } })));
    if (node.type === 'COLOR_RAMP') {
      for (const stop of node.values.stops ?? []) {
        out.push(h('div', { className: 'node-row' }, colorField({ value: stop.color, onChange: (v, final) => { stop.color = v; app.changed('Color Ramp', final); } }), numField({ value: stop.pos, step: 0.05, min: 0, max: 1, onChange: (v, final) => { stop.pos = v; app.changed('Color Ramp', final); } })));
      }
    }
    return out;
  };

  const socketDot = (node, name, type, dir) => {
    const dot = h('span', { className: `socket ${dir} sock-${type}`, dataset: { node: node.id, socket: name, dir, type, testid: `socket-${node.type}-${dir}-${name}` } });
    socketEls.set(`${node.id}|${dir}|${name}`, dot);
    dot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const graph = current().graph;
      startLinkDrag(graph, node, name, dir, e);
    });
    return dot;
  };

  let linkDrag = null;
  const tempLink = document.createElementNS(NS, 'path');
  tempLink.setAttribute('class', 'node-link');
  tempLink.setAttribute('stroke', '#fff');
  tempLink.setAttribute('stroke-dasharray', '4 3');

  const socketPos = (key) => {
    const dot = socketEls.get(key);
    if (!dot) return null;
    const a = dot.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    return toWorld(a.left + a.width / 2 - b.left, a.top + a.height / 2 - b.top);
  };
  const curve = (a, b) => {
    const k = Math.max(30, Math.abs(b.x - a.x) * 0.5);
    return `M${a.x},${a.y} C${a.x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`;
  };
  const drawLinks = () => {
    const graph = current().graph;
    while (svg.firstChild) svg.firstChild.remove();
    if (!graph) return;
    for (const l of graph.links) {
      const [a, b] = [socketPos(`${l.from}|out|${l.out}`), socketPos(`${l.to}|in|${l.in}`)];
      if (!a || !b) continue;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'node-link');
      path.setAttribute('d', curve(a, b));
      path.setAttribute('stroke', socketEls.get(`${l.from}|out|${l.out}`)?.dataset.type ? SOCKET_COLOR[socketEls.get(`${l.from}|out|${l.out}`).dataset.type] : '#aaa');
      svg.append(path);
    }
    if (linkDrag) svg.append(tempLink);
  };

  function startLinkDrag(graph, node, name, dir, e) {
    // Dragging from a linked input picks up its link.
    let from = dir === 'out' ? { node: node.id, socket: name } : null;
    if (dir === 'in') {
      const existing = graph.links.find((l) => l.to === node.id && l.in === name);
      if (existing) {
        from = { node: existing.from, socket: existing.out };
        graph.links = graph.links.filter((l) => l !== existing);
        drawLinks();
      }
    }
    linkDrag = { from, to: dir === 'in' && !from ? { node: node.id, socket: name } : null };
    const win = root.ownerDocument.defaultView;
    const anchorKey = from ? `${from.node}|out|${from.socket}` : `${node.id}|in|${name}`;
    const move = (m) => {
      const p = localPos(m);
      const w = toWorld(p.x, p.y);
      const anchor = socketPos(anchorKey);
      tempLink.setAttribute('d', from ? curve(anchor, w) : curve(w, anchor));
      if (!tempLink.parentNode) svg.append(tempLink);
    };
    const up = (m) => {
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
      tempLink.remove();
      const under = root.ownerDocument.elementFromPoint(m.clientX, m.clientY);
      const target = under?.closest?.('.socket');
      const drag = linkDrag;
      linkDrag = null;
      if (target) {
        const { node: nid, socket, dir: d } = target.dataset;
        const out = drag.from && d === 'in' ? { from: drag.from.node, out: drag.from.socket, to: nid, input: socket } : drag.to && d === 'out' ? { from: nid, out: socket, to: drag.to.node, input: drag.to.socket } : null;
        if (out && out.from !== out.to && !wouldCycle(graph, out.from, out.to)) addLink(graph, out.from, out.out, out.to, out.input);
      }
      app.changed('Link Nodes', true);
    };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
    move(e);
  }

  const buildNodes = () => {
    socketEls.clear();
    nodesLayer.replaceChildren();
    const info = current();
    const graph = info.graph;
    notice.style.display = graph ? 'none' : 'flex';
    world.style.display = graph ? '' : 'none';
    if (!graph) {
      notice.replaceChildren(info.none ? emptyNote(info.none) : button(info.label, () => app.op(info.need, info.props ?? {}), { className: 'primary', icon: 'add', testid: 'node-use' }));
      return;
    }
    for (const node of graph.nodes) {
      const spec = NODE_TYPES[node.type];
      if (!spec) continue;
      const head = h('div', { className: `node-head head-${spec.cat.replace(/\s/g, '')}`, title: nameOf(spec) }, nameOf(spec));
      const box = h('div', { className: `node${selected.has(node.id) ? ' selected' : ''}`, style: { left: `${node.x}px`, top: `${node.y}px` }, dataset: { id: node.id, type: node.type, testid: `node-${node.type}` } }, head);
      if (node.type === 'CMP_RENDER_LAYERS') syncRenderLayers(app.doc, graph);
      const sockets = nodeSockets(node);
      for (const out of sockets.outputs) box.append(h('div', { className: 'node-row out' }, h('span', { className: 'sock-name' }, out.name), socketDot(node, out.name, out.type, 'out')));
      box.append(...nodeProps(node, spec));
      if (node.type === 'GROUP') box.append(h('div', { className: 'node-row group-name' }, node.group?.name ?? ''));
      for (const input of sockets.inputs) box.append(h('div', { className: 'node-row' }, socketDot(node, input.name, input.type, 'in'), ...inputControl(graph, node, input)));
      head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        app.setActiveArea(area);
        if (e.shiftKey) { if (selected.has(node.id)) selected.delete(node.id); else selected.add(node.id); } else if (!selected.has(node.id)) { selected.clear(); selected.add(node.id); }
        nodesLayer.querySelectorAll('.node').forEach((n) => n.classList.toggle('selected', selected.has(n.dataset.id)));
        const start = localPos(e);
        const origin = graph.nodes.filter((n) => selected.has(n.id)).map((n) => ({ n, x: n.x, y: n.y }));
        const win = root.ownerDocument.defaultView;
        let moved = false;
        const move = (m) => {
          const p = localPos(m);
          const [dx, dy] = [(p.x - start.x) / state.zoom, (p.y - start.y) / state.zoom];
          if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
          for (const o of origin) {
            o.n.x = o.x + dx;
            o.n.y = o.y + dy;
            const el2 = nodesLayer.querySelector(`[data-id="${o.n.id}"]`);
            if (el2) { el2.style.left = `${o.n.x}px`; el2.style.top = `${o.n.y}px`; }
          }
          drawLinks();
        };
        const up = () => {
          win.removeEventListener('pointermove', move);
          win.removeEventListener('pointerup', up);
          if (moved) app.commit('Move Nodes');
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
      });
      nodesLayer.append(box);
    }
    drawLinks();
  };

  const addMenu = (at) => {
    const kind = state.tree;
    const cats = new Map();
    for (const spec of nodesForKind(kind)) {
      if (!cats.has(spec.cat)) cats.set(spec.cat, []);
      cats.get(spec.cat).push(spec);
    }
    const CAT_KO = { Output: '출력', Shader: '셰이더', Input: '입력', Texture: '텍스처', Color: '색', Converter: '변환', Vector: '벡터', Group: '그룹', Geometry: '지오메트리', 'Mesh Primitives': '메시 프리미티브', Mesh: '메시', Point: '점', Instances: '인스턴스', Filter: '필터' };
    const menu = [...cats].map(([cat, list]) => ({
      label: t(cat, CAT_KO[cat] ?? cat),
      items: list.map((spec) => ({ label: nameOf(spec), testid: `add-node-${spec.id}`, onClick: () => addNode(spec.id, at) })),
    }));
    const groups = (app.doc.nodeGroups ?? []).filter((g) => g.graph.kind === current().graph?.kind && g.id !== groupNodeAtPath()?.group?.id);
    if (groups.length) menu.push({ label: t('Node Groups', '노드 그룹'), testid: 'add-node-groups', items: groups.map((g) => ({ label: g.name, testid: `add-group-${g.name}`, onClick: () => { const p = at ?? toWorld(mouse.x, mouse.y); current().graph.nodes.push(createGroupNode(g, p.x, p.y)); app.changed('Add Group', true); update(); } })) });
    return menu;
  };
  const addNode = (type, at) => {
    const graph = current().graph;
    if (!graph) return;
    const p = at ?? toWorld(mouse.x, mouse.y);
    const node = createNode(type, p.x, p.y);
    graph.nodes.push(node);
    selected.clear();
    selected.add(node.id);
    app.changed('Add Node', true);
    update();
  };
  const deleteSelected = () => {
    const graph = current().graph;
    if (!graph || !selected.size) return;
    graph.nodes = graph.nodes.filter((n) => !selected.has(n.id) );
    graph.links = graph.links.filter((l) => !selected.has(l.from) && !selected.has(l.to));
    selected.clear();
    app.changed('Delete Nodes', true);
    update();
  };

  // Pan and zoom on the background.
  root.addEventListener('pointerdown', (e) => {
    app.setActiveArea(area);
    if (e.target.closest('.node')) return;
    if (e.button === 0 && !e.altKey) { selected.clear(); nodesLayer.querySelectorAll('.node').forEach((n) => n.classList.remove('selected')); }
    if (e.button === 1 || (e.button === 0 && (e.altKey || e.target === root || e.target === world))) {
      const start = localPos(e);
      const [ox, oy] = [state.x, state.y];
      const win = root.ownerDocument.defaultView;
      const move = (m) => { const p = localPos(m); state.x = ox + p.x - start.x; state.y = oy + p.y - start.y; applyView(); };
      const up = () => { win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); };
      win.addEventListener('pointermove', move);
      win.addEventListener('pointerup', up);
    }
  });
  root.addEventListener('pointermove', (e) => { mouse = localPos(e); });
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = localPos(e);
    const before = toWorld(p.x, p.y);
    state.zoom = Math.max(0.2, Math.min(2.5, state.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    state.x = p.x - before.x * state.zoom;
    state.y = p.y - before.y * state.zoom;
    applyView();
    drawLinks();
  }, { passive: false });
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!current().graph) return;
    const p = localPos(e);
    openMenu(addMenu(toWorld(p.x, p.y)), e.clientX, e.clientY);
  });

  const frameAll = () => {
    const graph = current().graph;
    if (!graph?.nodes.length) return;
    const r = root.getBoundingClientRect();
    const [minX, minY, maxX, maxY] = [Math.min(...graph.nodes.map((n) => n.x)), Math.min(...graph.nodes.map((n) => n.y)), Math.max(...graph.nodes.map((n) => n.x + 170)), Math.max(...graph.nodes.map((n) => n.y + 220))];
    state.zoom = Math.max(0.2, Math.min(1.2, Math.min(r.width / (maxX - minX + 80), r.height / (maxY - minY + 80))));
    state.x = (r.width - (maxX - minX) * state.zoom) / 2 - minX * state.zoom;
    state.y = (r.height - (maxY - minY) * state.zoom) / 2 - minY * state.zoom;
    applyView();
    drawLinks();
  };

  let lastGraphKey = '';
  const crumb = h('span', { className: 'group-crumb', dataset: { testid: 'node-crumb' } });
  function syncHeader() { crumb.textContent = groupNodeAtPath() ? `${t('Group', '그룹')}: ${groupNodeAtPath().group.name}` : ''; }
  function update() {
    if (app.widgetActive(root) || linkDrag) return;
    const info = current();
    const key = info.graph ? JSON.stringify(info.graph) : `none:${info.none ?? info.need}`;
    if (key === lastGraphKey) { drawLinks(); return; }
    lastGraphKey = key;
    buildNodes();
    applyView();
  }
  applyView();
  buildNodes();
  void icon; void enumName; void propName;
  return {
    update,
    header(hdr) {
      hdr.append(
        select({ value: state.tree, options: [['SHADER', t('Shader', '셰이더')], ['WORLD', t('World', '월드')], ['GEOMETRY', t('Geometry', '지오메트리')], ['COMPOSITOR', t('Compositor', '컴포지터')]], testid: 'node-tree', onChange: (v) => { state.tree = v; lastGraphKey = ''; update(); } }),
        menuTitle(t('View', '뷰'), () => [{ label: t('Frame All', '전체 맞춤'), shortcut: 'Home', onClick: frameAll }], 'menu-node-view'),
        menuTitle(t('Add', '추가'), () => (current().graph ? addMenu(null) : [{ label: t('No node tree', '노드 트리 없음'), disabled: true }]), 'menu-node-add'),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Delete selected nodes (X)', '선택 노드 삭제 (X)'), onClick: deleteSelected }, icon('delete', 13)),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Make a group of the selected nodes (Ctrl+G)', '선택한 노드를 그룹으로 (Ctrl+G)'), dataset: { testid: 'node-group' }, onClick: groupSelected }, 'G+'),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Ungroup (Alt+G)', '그룹 풀기 (Alt+G)'), dataset: { testid: 'node-ungroup' }, onClick: ungroupSelected }, 'G-'),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Enter or leave a group (Tab)', '그룹 안으로 들어가기·나오기 (Tab)'), dataset: { testid: 'node-tab' }, onClick: () => { if (!enterGroup()) exitGroup(); } }, 'Tab'),
        crumb,
      );
      syncHeader();
    },
    onKey(e) {
      const key = e.key.toLowerCase();
      if (key === 'x' || e.key === 'Delete') { deleteSelected(); return true; }
      if (e.key === 'Home') { frameAll(); return true; }
      if (key === 'g' && e.ctrlKey) { groupSelected(); return true; }
      if (key === 'g' && e.altKey) { ungroupSelected(); return true; }
      if (e.key === 'Tab') { if (!enterGroup()) exitGroup(); return true; }
      if (key === 'a' && e.shiftKey) {
        if (current().graph) { const r = root.getBoundingClientRect(); openMenu(addMenu(toWorld(mouse.x, mouse.y)), r.left + mouse.x, r.top + mouse.y); }
        return true;
      }
      return false;
    },
    dispose() { root.remove(); },
    api: { state, current, addNode, frameAll, selected, redrawLinks: drawLinks, groupSelected, ungroupSelected, enterGroup, exitGroup },
  };
}
