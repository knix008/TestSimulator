// The drawing kit of the sample projects: one short description per diagram, placed
// automatically with the real node sizes. Everything goes through the normal editing
// functions, so a sample is exactly what a user could draw.
//
// Texts are written 'ko|en' and resolved for the project's language; a text without
// '|' is the same in both (code names). Patterns and grammars keep their '|'.
import { addDiagram, addElement, buildIndex, createProject, ref } from '../model.js';
import { addCommunicationMessage } from '../edit.js';
import { layoutDiagram as placeNodes } from '../layout.js';
import { painter } from '../templates.js';
import { createRenderContext, layoutDiagram as measureViews } from '../../render/notation.js';

const RAW_KEYS = new Set(['pattern', 'expression']);

/** Class lines: 'name:Type' attributes, 'name(a:T,b:U):R' operations. */
const parseAttr = (text) => { const [name, type = ''] = text.split(':').map((part) => part.trim()); return { name, type }; };
function parseOp(text) {
  const match = /^([^(]+)\(([^)]*)\)(?::(.+))?$/.exec(text.trim());
  if (!match) throw new Error(`bad operation: ${text}`);
  const params = match[2] ? match[2].split(';').map((part) => part.split(':').map((x) => x.trim())) : [];
  return { name: match[1].trim(), params, ret: match[3]?.trim() ?? '' };
}
const list = (text) => (Array.isArray(text) ? text : String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean));

const CLASS_EDGES = { assoc: 'UMLAssociation', dir: 'directedAssociation', agg: 'aggregation', comp: 'composition', gen: 'UMLGeneralization', real: 'UMLInterfaceRealization', dep: 'UMLDependency' };

/**
 * A sample project being written: `k = kit(language, 'ko|en name', 'ko|en description')`.
 * Each function adds one finished diagram and returns what later diagrams can refer to.
 */
export function kit(language, name, documentation) {
  const tr = (text) => {
    if (typeof text !== 'string' || !text.includes('|')) return text;
    const at = text.indexOf('|');
    return language === 'ko' ? text.slice(0, at) : text.slice(at + 1);
  };
  const trAttrs = (attrs) => {
    const out = {};
    for (const [key, value] of Object.entries(attrs ?? {})) out[key] = RAW_KEYS.has(key) ? value : (value && typeof value === 'object' && !value.$ref ? trAttrs(value) : tr(value));
    return out;
  };
  const project = createProject({ name: tr(name), language, diagram: null, author: 'MyUMLMaker' });
  project.documentation = tr(documentation);
  const model = project.ownedElements[0];
  model.name = tr(name);
  const owners = new Map();
  /** The one model element of this type under the project (a data model, a BPMN process …). */
  const ownerOf = (type, label) => {
    if (!owners.has(type)) owners.set(type, addElement(project, project._id, type, { name: tr(label) }));
    return owners.get(type);
  };
  const newDiagram = (owner, type, label, opts = {}) => addDiagram(project, owner._id, type, { language, name: tr(label), ...opts });
  const draw = (diagram) => {
    const p = painter(project, diagram, language);
    return {
      ...p,
      node: (key, toolId, x, y, attrs, size, viewProps) => p.node(key, toolId, x, y, typeof attrs === 'string' ? { name: tr(attrs) } : trAttrs(attrs), size, viewProps),
      edge: (toolId, a, b, attrs, extra) => p.edge(toolId, a, b, typeof attrs === 'string' ? { name: tr(attrs) } : trAttrs(attrs), extra),
      note: (text, x, y, w, h) => p.note(tr(text), x, y, w, h),
      annotation: (key, toolId, x, y, text, size) => p.annotation(key, toolId, x, y, tr(text), size),
    };
  };
  /** Boxes of the views as the renderer sizes them. */
  const measure = (diagram) => {
    const ctx = createRenderContext({ project, diagram, language });
    measureViews(ctx);
    return ctx.boxes;
  };
  /** Lays the free nodes out in layers, with their real sizes. */
  const arrange = (diagram, { dir = 'TB', nodeSep = 60, rankSep = 90, x = 40, y = 40, moveContainers = false } = {}) => {
    placeNodes(diagram, measure(diagram), buildIndex(project), { direction: dir, nodeSep, rankSep, origin: { x, y }, moveContainers });
  };
  /** Nodes in rows and columns ({ key: [column, row] }), each centred in its cell, cells as big as their largest node. */
  const gridPlace = (diagram, p, grid, { gapX = 90, gapY = 90, x = 40, y = 40 } = {}) => {
    const boxes = measure(diagram);
    const size = (key) => boxes.get(p.view(key)._id);
    const widths = []; const heights = [];
    for (const [key, [col, row]] of Object.entries(grid)) {
      widths[col] = Math.max(widths[col] ?? 0, size(key).w);
      heights[row] = Math.max(heights[row] ?? 0, size(key).h);
    }
    const start = (sizes, gap, from, i) => { let at = from; for (let n = 0; n < i; n += 1) at += (sizes[n] ?? 0) + gap; return at; };
    for (const [key, [col, row]] of Object.entries(grid)) {
      const view = p.view(key);
      view.left = Math.round(start(widths, gapX, x, col) + (widths[col] - size(key).w) / 2);
      view.top = Math.round(start(heights, gapY, y, row) + (heights[row] - size(key).h) / 2);
    }
  };
  /** Places the nodes of a finished diagram: by opts.grid if given, else in layers. */
  const placeAll = (diagram, p, opts) => { if (opts.grid) gridPlace(diagram, p, opts.grid, opts); else arrange(diagram, opts); };
  /** Moves `view` to enclose the given views. */
  const enclose = (diagram, containerView, keysViews, { pad = 30, top = 44 } = {}) => {
    const boxes = measure(diagram);
    const list2 = keysViews.map((view) => boxes.get(view._id)).filter(Boolean);
    const left = Math.min(...list2.map((b) => b.x)) - pad;
    const up = Math.min(...list2.map((b) => b.y)) - top;
    Object.assign(containerView, { left, top: up, width: Math.max(...list2.map((b) => b.x + b.w)) + pad - left, height: Math.max(...list2.map((b) => b.y + b.h)) + pad - up });
  };

  const api = {
    project, model, tr, ownerOf, newDiagram, draw, arrange, measure, enclose,
    /** A UML package under the model (or under `owner`). */
    pkg: (label, doc = '', owner = model) => addElement(project, owner._id, 'UMLPackage', { name: tr(label), documentation: tr(doc) }),

    /**
     * Class diagram. classes: [name, attributes, operations] ('*Name' abstract, '~Name' interface,
     * '%Name' enumeration whose second field is its literals). rels: [kind, A, B, mult1, mult2, label].
     */
    classes(label, owner, classes, rels = [], opts = {}) {
      const diagram = newDiagram(owner, 'UMLClassDiagram', label, { defaultDiagram: opts.main ?? false });
      const p = draw(diagram);
      const made = {};
      for (const [rawName, attrs, ops] of classes) {
        const kind = rawName[0];
        const className = /^[*~%]/.test(rawName) ? rawName.slice(1) : rawName;
        const tool = kind === '~' ? 'UMLInterface' : kind === '%' ? 'UMLEnumeration' : 'UMLClass';
        const element = p.node(className, tool, 0, 0, { name: className, ...(kind === '*' ? { isAbstract: true } : {}) });
        made[className] = element;
        if (kind === '%') { for (const literal of list(attrs)) addElement(project, element._id, 'UMLEnumerationLiteral', { name: literal }); continue; }
        for (const text of list(attrs)) { const a = parseAttr(text); addElement(project, element._id, 'UMLAttribute', { ...a, visibility: 'private' }); }
        for (const text of list(ops)) {
          const o = parseOp(text);
          const operation = addElement(project, element._id, 'UMLOperation', { name: o.name, ...(kind === '~' ? { isAbstract: true } : {}) });
          for (const [paramName, type] of o.params) addElement(project, operation._id, 'UMLParameter', { name: paramName, type });
          if (o.ret) addElement(project, operation._id, 'UMLParameter', { name: '', type: o.ret, direction: 'return' });
        }
      }
      for (const [kind, a, b, m1, m2, relLabel] of rels) {
        const attrs = {};
        if (m1) attrs.end1 = { multiplicity: m1 };
        if (m2 || relLabel) attrs.end2 = { ...(m2 ? { multiplicity: m2 } : {}), ...(relLabel ? { name: relLabel } : {}) };
        p.edge(CLASS_EDGES[kind], a, b, attrs);
      }
      placeAll(diagram, p, { nodeSep: 70, rankSep: 110, gapX: 110, gapY: 90, ...opts });
      return made;
    },

    /** Use cases: actors on the left and right of the system box, cases in two columns. links: [actor index, case index]. rels: ['inc'|'ext'|'gen', i, j]. */
    useCases(label, system, leftActors, cases, rightActors = [], links = [], rels = []) {
      const diagram = newDiagram(model, 'UMLUseCaseDiagram', label);
      const p = draw(diagram);
      const actors = [...leftActors, ...rightActors];
      const firstActor = (u) => Math.min(...links.filter(([, c]) => c === u).map(([a]) => a), actors.length);
      const order = cases.map((_, u) => u);
      const left = order.filter((u) => links.some(([a, c]) => c === u && a < leftActors.length)).sort((a, b) => firstActor(a) - firstActor(b) || a - b);
      const right = order.filter((u) => !left.includes(u)).sort((a, b) => firstActor(a) - firstActor(b) || a - b);
      const STEP = 90;
      const rows = Math.max(left.length, right.length, 1);
      const boxW = 520; const boxH = 70 + rows * STEP;
      const boxX = 210; const boxY = 30;
      p.node('sys', 'UMLUseCaseSubject', boxX, boxY, system, { w: boxW, h: boxH });
      const rowOf = new Map();
      for (const column of [left, right]) column.forEach((u, i) => rowOf.set(u, i + (rows - column.length) / 2));
      const caseY = (u) => boxY + 56 + rowOf.get(u) * STEP;
      // An actor stands level with its use cases.
      const standing = (a, fallback) => { const mine = links.filter(([x]) => x === a).map(([, u]) => caseY(u)); return mine.length ? (Math.min(...mine) + Math.max(...mine)) / 2 - 12 : fallback; };
      const actorTops = actors.map((_, a) => standing(a, boxY + boxH / 2 - 40));
      const spread = (from, to) => { const ids = actors.map((_, a) => a).slice(from, to).sort((a, b) => actorTops[a] - actorTops[b]); for (let i = 1; i < ids.length; i += 1) actorTops[ids[i]] = Math.max(actorTops[ids[i]], actorTops[ids[i - 1]] + 110); };
      spread(0, leftActors.length); spread(leftActors.length, actors.length);
      leftActors.forEach((a, i) => p.node(`a${i}`, 'UMLActor', 80, actorTops[i], a));
      rightActors.forEach((a, i) => p.node(`a${i + leftActors.length}`, 'UMLActor', boxX + boxW + 80, actorTops[i + leftActors.length], a));
      cases.forEach((c, u) => p.node(`u${u}`, 'UMLUseCase', boxX + (left.includes(u) ? 40 : 300), caseY(u), c));
      for (const [a, u] of links) { if (a >= actors.length || u >= cases.length) throw new Error(`use case link ${a}-${u}`); p.edge('UMLAssociation', `a${a}`, `u${u}`, {}, { style: 'oblique' }); }
      for (const [kind, i, j] of rels) {
        if (kind === 'gen') p.edge('UMLGeneralization', `a${i}`, `a${j}`, {}, { style: 'oblique' });
        else p.edge(kind === 'inc' ? 'UMLInclude' : 'UMLExtend', `u${i}`, `u${j}`, {}, { style: 'oblique' });
      }
      return diagram;
    },

    /** An interaction in a collaboration of its own: its lifelines' roles are its own too. */
    interaction(label) {
      const collab = addElement(project, model._id, 'UMLCollaboration', { name: `${tr(label)} ${tr('협력|Collaboration')}` });
      return addElement(project, collab._id, 'UMLInteraction', { name: tr(label) });
    },

    /** Object diagram: objects [key, name, class element, 'attribute=value,…', column, row]; links [a, b, end name]. */
    objects(label, owner, objects, links, opts = {}) {
      const diagram = newDiagram(owner, 'UMLObjectDiagram', label);
      const p = draw(diagram);
      const grid = {};
      for (const [key, objectName, cls, slots, col, row] of objects) {
        const element = p.node(key, 'UMLObject', 0, 0, { name: objectName, classifier: ref(cls) });
        for (const text of list(slots)) {
          const at = text.indexOf('=');
          const feature = (cls.attributes ?? []).find((a) => a.name === text.slice(0, at));
          if (!feature) throw new Error(`no attribute ${text} in ${cls.name}`);
          addElement(project, element._id, 'UMLSlot', { definingFeature: ref(feature), value: tr(text.slice(at + 1)) });
        }
        grid[key] = [col, row];
      }
      for (const [a, b, end] of links) p.edge('UMLLink', a, b, { end2: { name: end } });
      gridPlace(diagram, p, grid, { gapX: 110, gapY: 90, ...opts });
      return diagram;
    },

    /**
     * Sequence diagram. lifelines: names ('@' = actor). messages: [from, to, text, sort] with sort
     * s(ync, default) r(eply) a(sync) c(reate) d(elete). frags: [op, first message, last message, guard, first else message].
     */
    sequence(label, lifelines, messages, frags = []) {
      const owner = api.interaction(label);
      const diagram = newDiagram(owner, 'UMLSequenceDiagram', label);
      const p = draw(diagram);
      const PITCH = 190;
      const x = (i) => 40 + i * PITCH;
      lifelines.forEach((text, i) => {
        const actor = text.startsWith('@');
        p.node(`l${i}`, actor ? 'actorLifeline' : 'UMLLifeline', x(i), 30, actor ? text.slice(1) : text);
      });
      const SORTS = { s: 'synchCall', r: 'reply', a: 'asynchCall', c: 'createMessage', d: 'deleteMessage' };
      const inFrag = (i) => frags.reduce((n, [, first, last, , elseAt]) => n + (i === first ? 1 : 0) + (elseAt === i ? 1 : 0) + (last + 1 === i ? 1 : 0), 0);
      const ys = [];
      let y = 110;
      messages.forEach((m, i) => {
        y += inFrag(i) * 34;
        ys[i] = y;
        y += m[0] === m[1] ? 62 : 40;
      });
      for (const [op, first, last, guard, elseAt] of frags) {
        const span = messages.slice(first, last + 1).flatMap((m) => [m[0], m[1]]);
        const left = x(Math.min(...span)) - 50; const right = x(Math.max(...span)) + 150;
        const top = ys[first] - 34; const bottom = ys[last] + (messages[last][0] === messages[last][1] ? 54 : 22);
        const element = p.node(`f${first}`, `fragment:${op}`, left, top, {}, { w: right - left, h: bottom - top });
        element.operands[0].guard = tr(guard ?? '');
        if (elseAt != null) p.view(`f${first}`).operandRatios = [(ys[elseAt] - 26 - top) / (bottom - top), 1 - (ys[elseAt] - 26 - top) / (bottom - top)];
      }
      messages.forEach(([from, to, text, sort = 's'], i) => {
        const made = p.edge(`message:${SORTS[sort]}`, `l${from}`, `l${to}`, {}, { y: ys[i] });
        made.name = tr(text);
      });
      return diagram;
    },

    /** Communication diagram: lifelines at [name, x, y]; links: [a, b, messages]. */
    communication(label, lifelines, links) {
      const owner = api.interaction(label);
      const diagram = newDiagram(owner, 'UMLCommunicationDiagram', label);
      const p = draw(diagram);
      lifelines.forEach(([text, x, y], i) => {
        const actor = text.startsWith('@');
        p.node(`l${i}`, actor ? 'actorLifeline' : 'UMLLifeline', x, y, actor ? text.slice(1) : text);
      });
      for (const [a, b, messages] of links) {
        const connector = p.edge('UMLConnector', `l${a}`, `l${b}`, {}, { style: 'oblique' });
        for (const text of messages) addCommunicationMessage(project, connector, { forward: true, sort: 'synchCall', language }).name = tr(text);
      }
      return diagram;
    },

    /**
     * Timing diagram: lines [name, states, [[state, duration] …]], ticks every `step` of the total time.
     */
    timing(label, lines, { ticks = [], unit = 's', message = null } = {}) {
      const owner = api.interaction(label);
      const diagram = newDiagram(owner, 'UMLTimingDiagram', label);
      const p = draw(diagram);
      // The waveform starts after the name and state columns, whose widths follow the texts (timingDraw in render/shapes.js).
      const ctx = createRenderContext({ project, diagram, language });
      const SIZE = 13;
      const columns = ([name, states]) => Math.min(120, Math.max(60, ctx.measure(name, { fontSize: SIZE, bold: true }) + 16)) + Math.max(40, ...states.split(',').map((s) => ctx.measure(s, { fontSize: SIZE - 1 }) + 12));
      const axis = 40 + Math.max(...lines.map(columns)) + 6;
      const span = 600;
      lines.forEach((line, i) => {
        const [name, states, segments] = line;
        const left = axis - columns(line) - 6;
        const element = p.node(`t${i}`, 'UMLTimingLifeline', left, 50 + i * 200, { name, states }, { w: axis + span + 6 - left, h: 170 });
        for (const [state, duration] of segments) addElement(project, element._id, 'UMLTimeSegment', { state, duration });
      });
      const bottom = 50 + lines.length * 200 - 20;
      const total = lines[0][2].reduce((sum, [, d]) => sum + d, 0);
      for (const time of ticks) p.node(`tick${time}`, 'UMLTimeTick', Math.round(axis + (span * time) / total) - 5, bottom, { name: `${time}${unit}` });
      if (message) { const edge = p.edge('message:synchCall', 't0', 't1', {}, { style: 'oblique' }); edge.name = tr(message); }
      return diagram;
    },

    /** State machine, laid out left to right. states: [key, name, {entry, do, exit}], key '*…' initial, '!…' final, '?…' choice. transitions: [a, b, trigger, guard, effect]. */
    states(label, states, transitions, opts = {}) {
      const machine = addElement(project, (opts.owner ?? model)._id, 'UMLStateMachine', { name: tr(label) });
      const diagram = newDiagram(machine, 'UMLStatechartDiagram', label);
      const p = draw(diagram);
      for (const [key, text, activities] of states) {
        if (key[0] === '*') p.node(key, 'pseudo:initial', 0, 0);
        else if (key[0] === '!') p.node(key, 'UMLFinalState', 0, 0);
        else if (key[0] === '?') p.node(key, 'pseudo:choice', 0, 0);
        else p.node(key, 'UMLState', 0, 0, { name: text, ...(activities?.entry ? { entryActivity: activities.entry } : {}), ...(activities?.do ? { doActivity: activities.do } : {}), ...(activities?.exit ? { exitActivity: activities.exit } : {}) });
      }
      for (const [a, b, triggers, guard, effect] of transitions) p.edge('UMLTransition', a, b, { ...(triggers ? { triggers } : {}), ...(guard ? { guard } : {}), ...(effect ? { effect } : {}) });
      placeAll(diagram, p, { dir: 'LR', nodeSep: 70, rankSep: 130, gapX: 110, gapY: 80, moveContainers: true, ...opts });
      return diagram;
    },

    /** Any notation laid out in layers. nodes: [key, tool, name or attrs, size]; edges: [tool, a, b, name or attrs]. */
    graph(type, owner, label, nodes, edges, opts = {}) {
      const diagram = newDiagram(owner, type, label);
      const p = draw(diagram);
      // A node whose tool is a model element shows that element again.
      for (const [key, tool, attrs, size] of nodes) { if (typeof tool === 'string') p.node(key, tool, 0, 0, attrs ?? {}, size ?? {}); else p.show(key, tool, 0, 0, size ?? {}); }
      for (const [tool, a, b, attrs, extra] of edges) p.edge(tool, a, b, attrs ?? {}, extra ?? {});
      placeAll(diagram, p, { nodeSep: 60, rankSep: 80, ...opts });
      // Boundaries around what was laid out: [key, tool, name or attrs, member keys].
      for (const [key, tool, attrs, members] of opts.groups ?? []) {
        p.node(key, tool, -500, -500, attrs ?? {}, { w: 10, h: 10 });
        enclose(diagram, p.view(key), members.map((member) => p.view(member)), { pad: 36, top: 56 });
      }
      return { diagram, p };
    },

    /** Any notation at fixed places. nodes: [key, tool, x, y, name or attrs, size, view props]; edges: [tool, a, b, name or attrs, extra]. */
    place(type, owner, label, nodes, edges = []) {
      const diagram = newDiagram(owner, type, label);
      const p = draw(diagram);
      for (const [key, tool, x, y, attrs, size, props] of nodes) p.node(key, tool, x, y, attrs ?? {}, size ?? {}, props);
      for (const [tool, a, b, attrs, extra] of edges) p.edge(tool, a, b, attrs ?? {}, extra ?? {});
      return { diagram, p };
    },

    /** Activity with one column per partition. lanes: names; nodes: [key, lane, row, tool, name]; edges: [a, b, guard, object flow]. */
    activity(label, lanes, nodes, edges) {
      const owner = addElement(project, ownerOf('UMLPackage', '업무 흐름|Workflows')._id, 'UMLActivity', { name: tr(label) });
      const diagram = newDiagram(owner, 'UMLActivityDiagram', label);
      const p = draw(diagram);
      const LANE = 240; const ROW = 90;
      const rows = Math.max(...nodes.map((n) => n[2])) + 1;
      lanes.forEach((text, i) => p.node(`lane${i}`, 'UMLActivityPartition', 20 + i * LANE, 20, text, { w: LANE, h: 60 + rows * ROW }));
      for (const [key, lane, row, tool, text] of nodes) {
        const bar = tool === 'UMLForkNode' || tool === 'UMLJoinNode';
        p.node(key, tool, 20 + lane * LANE + 40, 70 + row * ROW, text ?? {}, bar ? { w: 160, h: 6 } : {});
      }
      const boxes = measure(diagram);
      for (const [key, lane, row] of nodes) {
        const view = p.view(key);
        const box = boxes.get(view._id);
        view.left = Math.round(20 + lane * LANE + (LANE - box.w) / 2);
        view.top = Math.round(70 + row * ROW + (ROW - 26 - box.h) / 2);
      }
      for (const [a, b, guard, objectFlow] of edges) p.edge(objectFlow ? 'UMLObjectFlow' : 'UMLControlFlow', a, b, guard ? { guard } : {});
      return diagram;
    },

    /** Entity-relationship diagram. entities: [name, 'column:TYPE,other_id:INTEGER>table,…'] ('!' unique, '?' nullable). rels: [tool end cardinalities 'a:b', parent, child]. */
    erd(label, entities, rels, opts = {}) {
      const owner = ownerOf('ERDDataModel', '데이터 모델|Data Model');
      const diagram = newDiagram(owner, 'ERDDiagram', label);
      const p = draw(diagram);
      const byName = {};
      for (const [name] of entities) byName[name] = p.node(name, 'ERDEntity', 0, 0, { name });
      for (const [name, columns] of entities) {
        for (const text of list(columns)) {
          const match = /^([^:]+):([A-Za-z0-9(), ]+?)(!|\?)?(?:>(\w+))?$/.exec(text);
          if (!match) throw new Error(`bad column: ${text}`);
          const typeMatch = /^(\w+)(?:\((.+)\))?$/.exec(match[2]);
          const target = match[4] ? byName[match[4]] : null;
          if (match[4] && !target) throw new Error(`no table ${match[4]}`);
          addElement(project, byName[name]._id, 'ERDColumn', {
            name: match[1], type: typeMatch[1], ...(typeMatch[2] ? { length: typeMatch[2] } : {}), ...(match[3] === '!' ? { unique: true } : {}), ...(match[3] === '?' ? { nullable: true } : {}),
            ...(target ? { foreignKey: true, referenceTo: ref(target.columns[0]) } : {}),
          });
        }
      }
      for (const [kind, a, b] of rels) {
        const [c1, c2] = kind.split(':');
        p.edge('erd:1:0..*', a, b, { end1: { cardinality: c1 }, end2: { cardinality: c2 } });
      }
      placeAll(diagram, p, { dir: 'LR', nodeSep: 50, rankSep: 110, gapX: 110, gapY: 60, ...opts });
      return diagram;
    },

    /** Flowchart, top to bottom. */
    flowchart: (label, nodes, edges, opts) => api.graph('FCFlowchartDiagram', ownerOf('FCFlowchart', '순서도|Flowcharts'), label, nodes, edges.map(([a, b, name, extra]) => ['FCFlow', a, b, name ? { name } : {}, extra]), { rankSep: 60, ...opts }).diagram,
    /** Data flow, left to right. */
    dfd: (label, nodes, edges, opts) => api.graph('DFDDiagram', ownerOf('DFDDataFlowModel', '데이터 흐름|Data Flows'), label, nodes, edges.map(([a, b, name]) => ['DFDDataFlow', a, b, name, { style: 'oblique' }]), { dir: 'LR', rankSep: 170, nodeSep: 70, ...opts }).diagram,
    /** C4, top to bottom. */
    c4: (label, nodes, edges, opts) => api.graph('C4Diagram', ownerOf('C4Model', 'C4|C4'), label, nodes, edges.map(([a, b, name, technology]) => ['C4Relationship', a, b, { name, ...(technology ? { technology } : {}) }, { style: 'oblique' }]), { nodeSep: 70, rankSep: 130, ...opts }).diagram,
    /** ArchiMate; nodes: [key, kind, name], edges: [relationship, a, b, attrs]. */
    archimate: (label, nodes, edges, opts) => api.graph('ArchiMateDiagram', ownerOf('ArchiMateModel', '엔터프라이즈 아키텍처|Enterprise Architecture'), label, nodes.map(([key, kind, text]) => [key, `archimate:${kind}`, text, { w: 160, h: 60 }]), edges, { nodeSep: 40, rankSep: 70, ...opts }).diagram,

    /** Cloud tiles left to right. nodes: [key, service, name]; links: [a, b]; groups: [group tool, name, member keys]. */
    cloud(type, label, nodes, links, groups = [], opts = {}) {
      const owner = addElement(project, project._id, 'CloudModel', { name: tr(label) });
      return api.graph(type, owner, label, nodes.map(([key, service, text]) => [key, `service:${service}`, { name: text ?? service }]), links.map(([a, b]) => ['CloudConnection', a, b]), {
        dir: 'LR', nodeSep: 80, rankSep: 110, x: 90, y: 150,
        groups: groups.map(([tool, text, members], i) => [`g${i}`, tool, text ? { name: text } : {}, members]), ...opts,
      }).diagram;
    },

    /**
     * BPMN pool with lanes; columns come from the flow. lanes: names. nodes: [key, lane, tool, name, offset];
     * flows: [a, b, name]. Rows within a lane step down for nodes of one column.
     */
    bpmn(label, pool, lanes, nodes, flows) {
      const owner = ownerOf('BPMNProcess', '업무 프로세스|Business Process');
      const diagram = newDiagram(owner, 'BPMNDiagram', label);
      const p = draw(diagram);
      const rank = new Map(nodes.map(([key]) => [key, 0]));
      for (let pass = 0; pass < nodes.length; pass += 1) {
        const seen = new Set();
        for (const [a, b] of flows) {
          if (seen.has(`${b}>${a}`)) continue;
          seen.add(`${a}>${b}`);
          const back = nodes.findIndex((n) => n[0] === b) < nodes.findIndex((n) => n[0] === a);
          if (!back && rank.get(b) < rank.get(a) + 1) rank.set(b, rank.get(a) + 1);
        }
      }
      const COL = 170; const LANE_ROW = 104;
      const slots = new Map();
      const placed = nodes.map(([key, lane, tool, text]) => {
        const slotKey = `${lane}:${rank.get(key)}`;
        const row = slots.get(slotKey) ?? 0;
        slots.set(slotKey, row + 1);
        return { key, lane, tool, text, col: rank.get(key), row };
      });
      const laneRows = lanes.map((_, lane) => Math.max(1, ...placed.filter((n) => n.lane === lane).map((n) => n.row + 1)));
      const laneTops = []; let top = 30;
      laneRows.forEach((rows, i) => { laneTops[i] = top; top += rows * LANE_ROW + 16; });
      const cols = Math.max(...placed.map((n) => n.col)) + 1;
      const width = 120 + cols * COL;
      p.node('pool', 'BPMNParticipant', 20, 30, pool, { w: width, h: top - 30 });
      lanes.forEach((text, i) => p.node(`lane${i}`, 'BPMNLane', 52, laneTops[i], text, { w: width - 32, h: laneRows[i] * LANE_ROW + 16 }));
      const centre = ({ lane, col, row }) => ({ x: 170 + col * COL, y: laneTops[lane] + 58 + row * LANE_ROW });
      for (const item of placed) p.node(item.key, item.tool, centre(item).x, centre(item).y, item.text ? { name: item.text } : {});
      const boxes = measure(diagram);
      for (const item of placed) {
        const view = p.view(item.key);
        const box = boxes.get(view._id);
        view.left = Math.round(centre(item).x - box.w / 2);
        view.top = Math.round(centre(item).y - box.h / 2);
      }
      const at = (key) => centre(placed.find((item) => item.key === key));
      for (const [a, b, name, way] of flows) p.edge('BPMNSequenceFlow', a, b, name ? { name } : {}, way === 'v' ? { points: [{ x: at(a).x, y: at(b).y }] } : {});
      return diagram;
    },

    /** Requirements (SysML): reqs: [key, id, name, text]; others: extra nodes [key, tool, name]; edges: [tool, a, b]. */
    requirements(label, reqs, others, edges, opts = {}) {
      return api.graph('SysMLRequirementDiagram', ownerOf('UMLModel', '시스템 모델 (SysML)|System Model (SysML)'), label,
        [...reqs.map(([key, id, name, text]) => [key, 'SysMLRequirement', { name, id, text }]), ...others], edges, { nodeSep: 50, rankSep: 110, ...opts });
    },

    /** Mind map: root and branches [name, leaves] alternately to the right and the left. */
    mindmap(label, rootName, branches) {
      const owner = ownerOf('MMMindmap', '마인드맵|Mind Maps');
      const diagram = newDiagram(owner, 'MMMindmapDiagram', label);
      const p = draw(diagram);
      const sides = [[], []];
      branches.forEach((branch, i) => sides[i % 2].push(branch));
      const STEP = 50;
      const heights = sides.map((side) => side.reduce((sum, [, leaves]) => sum + Math.max(1, leaves.length) * STEP + 20, 0));
      const midY = 40 + Math.max(...heights) / 2;
      const root = p.node('root', 'MMNode', 480, midY - 20, rootName);
      sides.forEach((side, s) => {
        let y = midY - heights[s] / 2;
        const right = s === 0;
        side.forEach(([name, leaves], b) => {
          const count = Math.max(1, leaves.length);
          const branchY = y + (count * STEP) / 2 - 20;
          const branchKey = `b${s}_${b}`;
          const element = addElement(project, root._id, 'MMNode', { name: tr(name) });
          p.show(branchKey, element, right ? 720 : 250, branchY);
          p.edge('branch', 'root', branchKey);
          leaves.forEach((leaf, l) => {
            const key = `${branchKey}_${l}`;
            const child = addElement(project, element._id, 'MMNode', { name: tr(leaf) });
            p.show(key, child, right ? 930 : 20, y + l * STEP);
            p.edge('branch', branchKey, key);
          });
          y += count * STEP + 20;
        });
      });
      return diagram;
    },

    /** The plan element all project diagrams hang from. */
    plan: (label, start) => { if (!owners.has('PMPlan')) owners.set('PMPlan', addElement(project, project._id, 'PMPlan', { name: tr(label), start })); return owners.get('PMPlan'); },

    /** Gantt chart. rows: ['-Section'] | [key, name, duration, completion, resources] | [key, name] (milestone). deps: [a, b]. */
    gantt(label, planLabel, start, rows, deps) {
      const diagram = newDiagram(api.plan(planLabel, start), 'GanttDiagram', label);
      const p = draw(diagram);
      p.node('cal', 'GanttCalendar', 20, 20, { name: planLabel, start, dayWidth: 18, closedDays: 'saturday,sunday' });
      rows.forEach((row, i) => {
        const y = 64 + i * 28;
        if (typeof row === 'string') p.node(`sep${i}`, 'GanttSeparator', 230, y, row);
        else if (row.length === 2) p.node(row[0], 'GanttMilestone', 230, y, row[1]);
        else p.node(row[0], 'GanttTask', 230, y, { name: row[1], duration: row[2], ...(row[3] != null ? { completion: row[3] } : {}), ...(row[4] ? { resources: row[4] } : {}), ...(i === 0 || typeof rows[i - 1] === 'string' && i === 1 ? { start } : {}) });
      });
      for (const [a, b] of deps) p.edge('GanttDependency', a, b);
      return diagram;
    },

    /** Work breakdown structure: root and levels [name, leaves]. */
    wbs(label, planLabel, start, rootName, levels) {
      const diagram = newDiagram(api.plan(planLabel, start), 'WBSDiagram', label);
      const p = draw(diagram);
      const COL = 230; const LEVEL = 160;
      const rootX = 20 + (levels.length * COL - 30) / 2 - 100;
      const root = p.node('root', 'WBSNode', rootX, 20, rootName, { w: 200, h: 40 });
      levels.forEach(([name, leaves], i) => {
        const x = 20 + i * COL;
        const item = addElement(project, root._id, 'WBSNode', { name: tr(name), code: `${i + 1}` });
        p.show(`l${i}`, item, x, 110, { w: LEVEL, h: 34 });
        p.edge('wbsBranch', 'root', `l${i}`, {}, { points: [{ x: rootX + 100, y: 85 }, { x: x + LEVEL / 2, y: 85 }] });
        leaves.forEach((leaf, j) => {
          const y = 175 + j * 50;
          const child = addElement(project, item._id, 'WBSNode', { name: tr(leaf), code: `${i + 1}.${j + 1}` });
          p.show(`l${i}_${j}`, child, x + 26, y, { w: 150, h: 30 });
          p.edge('wbsBranch', `l${i}`, `l${i}_${j}`, {}, { points: [{ x: x + 12, y: y + 15 }] });
        });
      });
      return diagram;
    },

    /** Timeline: events [name, date] linked in order, periods [name, start, end]. */
    timeline(label, planLabel, range, events, periods = []) {
      const diagram = newDiagram(api.plan(planLabel, range[0]), 'TimelineDiagram', label);
      const p = draw(diagram);
      p.node('axis', 'TLTimeline', 20, 40, { name: range[2], start: range[0], end: range[1], dayWidth: 3 });
      events.forEach(([name, date], i) => p.node(`e${i}`, 'TLEvent', 20, 84 + i * 34, { name, date }));
      periods.forEach(([name, start, end], i) => p.node(`p${i}`, 'TLPeriod', 20, 84 + (events.length + i) * 34, { name, start, end }));
      for (let i = 0; i + 1 < events.length; i += 1) p.edge('TLLink', `e${i}`, `e${i + 1}`);
      return diagram;
    },

    /** User story map: activities [name, span], steps, releases [name, date, goal], stories [release, column, name, priority, points, status]. */
    storyMap(label, activities, steps, releases, stories) {
      const owner = ownerOf('UXModel', '애자일·UX|Agile & UX');
      const diagram = newDiagram(owner, 'UserStoryMapDiagram', label);
      const p = draw(diagram);
      const COL = 170; const X = 160;
      releases.forEach(([name, date, goal], i) => p.node(`rel${i}`, 'USRelease', 20, 180 + i * 130, { name, date, goal }, { w: X - 20 + steps.length * COL + 10, h: 120 }));
      let col = 0;
      activities.forEach(([name, span], i) => { p.node(`act${i}`, 'USActivity', X + col * COL, 20, name, { w: span * COL - 20, h: 64 }); col += span; });
      steps.forEach((name, i) => p.node(`step${i}`, 'USStep', X + i * COL, 100, name, { w: COL - 20, h: 56 }));
      stories.forEach(([release, column, name, priority, storyPoints, status], i) => p.node(`story${i}`, 'USStory', X + column * COL, 194 + release * 130, { name, priority, storyPoints, status, iWant: name }, { w: COL - 20, h: 92 }));
      return diagram;
    },

    /** Customer journey: persona {name, role, goals, frustrations}, stages: [name, goal, action, touch [channel, name], emotion [score, name], pain, idea]. */
    journey(label, persona, stages) {
      const owner = ownerOf('UXModel', '애자일·UX|Agile & UX');
      const diagram = newDiagram(owner, 'CustomerJourneyDiagram', label);
      const p = draw(diagram);
      const COL = 230; const X = 240;
      const width = X - 20 + stages.length * COL;
      stages.forEach(([name, goal], i) => p.node(`stage${i}`, 'CJStage', X + i * COL, 10, { name, goal }, { w: COL - 10, h: 640 }));
      const lanes = [['actions', 150, 90, '고객 행동|Actions'], ['touchpoints', 250, 70, '터치포인트|Touchpoints'], ['emotions', 330, 110, '감정|Emotions'], ['painPoints', 450, 90, '고통 지점|Pain points'], ['opportunities', 550, 90, '기회|Opportunities']];
      for (const [laneKind, y, h, name] of lanes) p.node(`lane-${laneKind}`, 'CJLane', 20, y, { laneKind, name }, { w: width, h });
      p.node('persona', 'CJPersona', 20, 10, persona, { w: 200, h: 130 });
      const x = (i) => X + i * COL + 30;
      const LEVEL = { veryNegative: -2, negative: -1, neutral: 0, positive: 1, veryPositive: 2 };
      stages.forEach(([, , action, [channel, touch], [score, feeling], pain, idea], i) => {
        p.node(`a${i}`, 'CJCard', x(i), 165, { name: action, cardKind: 'action' }, { w: 160, h: 60 });
        p.node(`t${i}`, 'CJTouchpoint', x(i), 265, { name: touch, channel }, { w: 160, h: 40 });
        p.node(`e${i}`, 'CJEmotion', x(i) + 63, 368 - LEVEL[score] * 20, { name: feeling, score }, { w: 34, h: 34 });
        if (pain) p.node(`p${i}`, 'cjcard:painPoint', x(i), 465, pain, { w: 160, h: 60 });
        if (idea) p.node(`o${i}`, 'cjcard:opportunity', x(i), 565, idea, { w: 160, h: 60 });
      });
      for (let i = 0; i + 1 < stages.length; i += 1) p.edge('CJEmotionLink', `e${i}`, `e${i + 1}`);
      return diagram;
    },

    /** Network: networks [name, address], hosts [key, device tool, name, description, [network index, address] …]. */
    network(label, nets, hosts, top = []) {
      const owner = ownerOf('NWModel', '네트워크|Network');
      const diagram = newDiagram(owner, 'NetworkDiagram', label);
      const p = draw(diagram);
      const width = Math.max(600, 60 + (top.length + Math.max(...nets.map((_, i) => hosts.filter((h) => h[4] === i).length))) * 170);
      top.forEach(([key, tool, name, description], i) => p.node(key, tool, 60 + i * 170, 20, { name, ...(description ? { description } : {}) }));
      nets.forEach(([name, address], i) => p.node(`net${i}`, 'NWNetwork', 40, 120 + i * 200, { name, address }, { w: width }));
      const reserved = new Set(top.flatMap(([, , , , links], i) => ((links ?? []).some(([target]) => target !== 'net0' && String(target).startsWith('net')) ? [i] : [])));
      const counts = new Map();
      for (const [key, tool, name, description, netIndex] of hosts) {
        let n = counts.get(netIndex) ?? 0;
        while (netIndex === 0 && reserved.has(n)) n += 1;
        counts.set(netIndex, n + 1);
        p.node(key, tool, 60 + n * 170, 120 + netIndex * 200 + 70, { name, ...(description ? { description } : {}) });
      }
      for (const [a, b, address] of [...hosts.map(([key, , , , netIndex, address]) => [key, `net${netIndex}`, address ?? '']), ...top.flatMap(([key, , , , links]) => (links ?? []).map(([target, address]) => [key, target, address ?? '']))]) p.edge('NWConnection', a, b, { address });
      return diagram;
    },

    /** The data specification owner. */
    spec: () => ownerOf('DSSpecification', '데이터 명세|Data Specifications'),
    /** JSON or YAML documents in a row: [key, name, text], refs [a, b, name]. */
    documents(type, label, docs, refs = []) {
      const tool = type === 'JSONDiagram' ? 'jsonDocument' : 'yamlDocument';
      const { diagram, p } = api.place(type, api.spec(), label, docs.map(([key, name, text]) => [key, tool, 0, 0, { name, text }]), refs.map(([a, b, name]) => ['DSReference', a, b, name]));
      gridPlace(diagram, p, Object.fromEntries(docs.map(([key], i) => [key, [i % 2, Math.floor(i / 2)]])), { gapX: 170, gapY: 60, x: 20, y: 20 });
      return diagram;
    },
    /** EBNF rules: [key, name, expression], one under another; refs [a, b]. */
    ebnf(label, rules, refs = []) {
      const { diagram, p } = api.place('EBNFDiagram', api.spec(), label, rules.map(([key, name, expression]) => [key, 'EBNFRule', 0, 0, { name, expression }]), refs.map(([a, b]) => ['DSReference', a, b, '사용|uses']));
      gridPlace(diagram, p, Object.fromEntries(rules.map(([key], i) => [key, [i % 2, Math.floor(i / 2)]])), { gapX: 110, gapY: 50, x: 20, y: 20 });
      return diagram;
    },
    /** Regular expressions: [key, name, pattern]. */
    regex(label, patterns) {
      const { diagram, p } = api.place('RegexDiagram', api.spec(), label, patterns.map(([key, name, pattern]) => [key, 'RegexPattern', 0, 0, { name, pattern }]));
      gridPlace(diagram, p, Object.fromEntries(patterns.map(([key], i) => [key, [0, i]])), { gapY: 30, x: 20, y: 20 });
      return diagram;
    },

    /** Wireframe: frames side by side, [tool, title, width, rows]; a row is [tool, name, attrs, height], or several of those sharing a line. */
    wireframe(label, frames) {
      const diagram = newDiagram(ownerOf('WFWireframe', '화면 설계|Screens'), 'WFWireframeDiagram', label);
      const p = draw(diagram);
      let x = 20;
      frames.forEach(([tool, title, width, rows], f) => {
        const inner = width - 48;
        const items = [];
        let y = 76;
        rows.forEach((row, r) => {
          const cells = Array.isArray(row[0]) ? row : [row];
          const w = (inner - (cells.length - 1) * 12) / cells.length;
          let h = 0;
          cells.forEach(([widget, name, attrs, height], c) => {
            items.push({ key: `w${f}_${r}_${c}`, widget, name, attrs, x: x + 24 + c * (w + 12), y, w, h: height ?? 30 });
            h = Math.max(h, height ?? 30);
          });
          y += h + 14;
        });
        p.node(`frame${f}`, tool, x, 20, title, { w: width, h: y - 8 });
        for (const item of items) p.node(item.key, item.widget, item.x, item.y, { ...(item.name != null ? { name: item.name } : {}), ...(item.attrs ?? {}) }, { w: item.w, h: item.h });
        x += width + 50;
      });
      return diagram;
    },
    ref,
    addElement: (ownerElement, type, attrs) => addElement(project, ownerElement._id, type, attrs),
  };
  return api;
}
