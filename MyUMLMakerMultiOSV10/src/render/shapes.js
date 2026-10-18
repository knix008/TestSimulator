// How each node view is drawn: one entry per `shape` of meta.js (classifier
// boxes with compartments, actor, use case, package, component, node, state,
// pseudostates, actions, swimlanes, lifelines, fragments, ERD entities,
// flowchart and data-flow symbols, SysML, BPMN, C4, mind map, wireframe
// widgets, cloud tiles, notes …). Each entry has
//   size(ctx, view, element, style) → { w, h }   the size that fits the content
//   draw(ctx, view, element, box, style) → SVG
//   clip: 'rect' | 'ellipse' | 'diamond' | 'circle'   how edges meet its outline
//   fixed: true when the fitted size is the size (not just a minimum)
// Pure: text is measured by ctx.measure.
import { esc, n, textLine, textStack, stackHeight, stackWidth, wrapText } from './text.js';
import {
  attributeText, columnText, lifelineText, literalText, operationText, propertyText, receptionText, slotText, stereotypeText, typeName,
} from '../domain/labels.js';
import { typeDef } from '../domain/meta.js';
import { refId } from '../domain/model.js';
import { groupInfo, serviceInfo } from '../domain/cloud.js';
import { MORE_SHAPES } from './shapes-more.js';

const PAD = 6;
const lineAttrs = (st, extra = '') => `stroke="${esc(st.line)}" stroke-width="${n(st.lineWidth ?? 1)}"${extra}`;
const shapeAttrs = (st, { fill = st.fill, dash = '' } = {}) => `fill="${esc(fill)}" ${lineAttrs(st)}${dash ? ` stroke-dasharray="${dash}"` : ''}${st.shadow ? ' filter="url(#uml-shadow)"' : ''}`;
const rectSvg = (b, st, opts = {}) => `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(opts.r ?? 0)}" ${shapeAttrs(st, opts)}/>`;
const pathSvg = (d, st, opts = {}) => `<path d="${d}" ${shapeAttrs(st, opts)}/>`;
const strokeSvg = (d, st, extra = '') => `<path d="${d}" fill="none" ${lineAttrs(st)}${extra}/>`;
const hline = (x1, x2, y, st, dash = '') => `<path d="M${n(x1)} ${n(y)}H${n(x2)}" fill="none" ${lineAttrs(st)}${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const base = (st) => ({ face: st.face, size: st.size, color: st.color });
const fill = (color) => ({ fill: color });

/** Name and stereotype lines of an element (header of a box). */
function headerLines(ctx, v, el, st, { name = el?.name ?? '', keyword = true, underline = false, italic = false, bold = true } = {}) {
  const lines = [];
  const stereo = el && v.stereotypeDisplay !== 'none' ? stereotypeText(el, ctx.index, { keyword }) : '';
  if (stereo) lines.push({ text: stereo, size: st.size - 1 });
  lines.push({ text: name, bold: bold || st.bold, italic: italic || st.italic, underline, wrap: v.wordWrap });
  if (el && v.showNamespace) {
    const owner = ctx.index?.parent(el._id);
    if (owner?.name && owner._type !== 'Project') lines.push({ text: `(from ${owner.name})`, size: st.size - 2, italic: true });
  }
  if (el && v.showProperty !== false) {
    const prop = propertyText(el);
    if (prop) lines.push({ text: prop, size: st.size - 1 });
  }
  return lines;
}

const SYSML_SPLIT = { values: 'SysMLValue', references: 'SysMLReference' };
/** Compartment item lines of a classifier. */
function compartmentItems(ctx, v, el, key) {
  const index = ctx.index;
  const opts = { visibility: v.showVisibility !== false, type: v.showType !== false, multiplicity: v.showMultiplicity !== false, property: v.showProperty !== false };
  let list = el[key] ?? [];
  // SysML value and reference properties are kept with the attributes but listed in their own compartments.
  if (SYSML_SPLIT[key] && !el[key]) list = (el.attributes ?? []).filter((a) => a._type === SYSML_SPLIT[key]);
  if (key === 'attributes' && (typeDef(el._type)?.compartments ?? []).includes('values')) list = list.filter((a) => !Object.values(SYSML_SPLIT).includes(a._type));
  switch (key) {
    case 'attributes': case 'parts': case 'references': case 'values': case 'ports':
      return list.map((a) => ({ text: attributeText(a, index, opts), underline: a.isStatic, align: 'left' }));
    case 'operations':
      return list.map((o) => ({ text: operationText(o, index, { visibility: opts.visibility, signature: v.showOperationSignature !== false, property: opts.property }), underline: o.isStatic, italic: o.isAbstract, align: 'left' }));
    case 'receptions': return list.map((r) => ({ text: receptionText(r, index), align: 'left' }));
    case 'literals': return list.map((l) => ({ text: literalText(l), align: 'left' }));
    case 'slots': return list.map((s) => ({ text: slotText(s, index), align: 'left' }));
    case 'extensionPoints': return list.map((e) => ({ text: `${e.name}${e.location ? `: ${e.location}` : ''}`, align: 'left' }));
    case 'parameters': return list.map((p) => ({ text: `${p.name}${typeName(p.type, index) ? `: ${typeName(p.type, index)}` : ''}`, align: 'left' }));
    case 'constraints': return el.constraint ? [{ text: `{${el.constraint}}`, align: 'left' }] : (el.ownedRules ?? []).map((r) => ({ text: `{${r.specification ?? r.name}}`, align: 'left' }));
    default: return list.map((x) => ({ text: x.name ?? '', align: 'left' }));
  }
}

const SUPPRESS = { attributes: 'suppressAttributes', operations: 'suppressOperations', receptions: 'suppressReceptions', literals: 'suppressLiterals', columns: 'suppressColumns' };
const TITLED = new Set(['parts', 'references', 'values', 'ports', 'constraints', 'parameters', 'extensionPoints']);
/** Header + compartments of a classifier view. */
function classifierParts(ctx, v, el, st) {
  const def = typeDef(el._type);
  const header = headerLines(ctx, v, el, st, { italic: el.isAbstract && el._type !== 'UMLInterface' });
  const sections = [];
  for (const key of def.compartments ?? []) {
    if (v[SUPPRESS[key]]) continue;
    const items = compartmentItems(ctx, v, el, key);
    // Classes always show attributes and operations; the others only when they have items.
    const always = (key === 'attributes' || key === 'operations') && ['UMLClass', 'UMLInterface', 'UMLSignal', 'UMLDataType', 'UMLStereotype', 'SysMLBlock'].includes(el._type) && !(el._type === 'SysMLBlock' && !items.length);
    if (!items.length && !always && !(key === 'literals' && el._type === 'UMLEnumeration')) continue;
    sections.push({ key, title: TITLED.has(key) ? key : '', items });
  }
  if (el._type === 'SysMLRequirement') {
    const items = [{ text: `Id = "${el.id ?? ''}"`, align: 'left' }, { text: `Text = "${el.text ?? ''}"`, align: 'left', wrap: true }];
    // EA-style attributes: status and priority, then risk and verification when they are set.
    if (v.showRequirementDetails !== false) {
      const pair = (list) => list.filter(([, value]) => value).map(([key, value]) => `${key} = ${value}`).join(', ');
      const status = pair([['Status', el.status], ['Priority', el.priority]]);
      const check = pair([['Risk', el.risk], ['Verify', el.verifyMethod]]);
      if (status) items.push({ text: status, align: 'left', size: st.size - 1 });
      if (check) items.push({ text: check, align: 'left', size: st.size - 1 });
    }
    sections.push({ key: 'req', title: '', items });
  }
  return { header, sections };
}

function sectionLines(section, st) {
  return [...(section.title ? [{ text: section.title, italic: true, size: st.size - 2 }] : []), ...section.items];
}

function classifierSize(ctx, v, el, st) {
  const { header, sections } = classifierParts(ctx, v, el, st);
  const b = base(st);
  // Word wrap (Format › Word Wrap): the name breaks at spaces to fit a narrower view; the box is at least its longest word wide.
  const wrapTo = v.wordWrap && !v.autoResize && v.width > 0 ? v.width : 0;
  const longestWord = (line) => String(line.text ?? '').split(/\s+/).reduce((a, word) => (ctx.measure(word, { fontSize: line.size ?? b.size, bold: line.bold }) > ctx.measure(a, { fontSize: line.size ?? b.size, bold: line.bold }) ? word : a), '');
  const widthLines = wrapTo ? header.map((line) => (line.wrap ? { ...line, text: longestWord(line) } : line)) : header;
  let w = stackWidth(widthLines, b, ctx.measure) + PAD * 2 + 8;
  let h = 0;
  for (const s of sections) {
    const lines = sectionLines(s, st);
    w = Math.max(w, stackWidth(lines, b, ctx.measure) + PAD * 2 + 4);
    h += Math.max(10, stackHeight(lines, 9999, b, ctx.measure, { gap: 0 }) + PAD);
  }
  if (el.templateParameters?.length) w += 20;
  w = Math.max(Math.ceil(w), 60);
  h += stackHeight(header, wrapTo ? Math.max(wrapTo, w) : 9999, b, ctx.measure) + PAD * 2;
  return { w, h: Math.ceil(h) };
}

function classifierDraw(ctx, v, el, b, st, { icon = '' } = {}) {
  const { header, sections } = classifierParts(ctx, v, el, st);
  const bs = base(st);
  let out = rectSvg(b, st);
  const headerH = stackHeight(header, b.w, bs, ctx.measure) + PAD * 2;
  out += textStack(header, b.x, b.y + PAD, b.w, bs, ctx.measure).svg;
  let y = b.y + headerH;
  sections.forEach((s, i) => {
    out += hline(b.x, b.x + b.w, y, st);
    const lines = sectionLines(s, st);
    const h = Math.max(10, stackHeight(lines, b.w, bs, ctx.measure, { gap: 0 }) + PAD);
    const last = i === sections.length - 1;
    out += textStack(lines, b.x, y + PAD / 2, b.w, bs, ctx.measure, { gap: 0 }).svg;
    y += last ? Math.max(h, b.y + b.h - y) : h;
  });
  if (el.templateParameters?.length) {
    const text = el.templateParameters.map((p) => p.name).join(', ');
    const tw = ctx.measure(text, { fontSize: st.size - 1 }) + 10;
    out += `<rect x="${n(b.x + b.w - tw + 6)}" y="${n(b.y - 10)}" width="${n(tw)}" height="16" fill="${esc(st.fill)}" ${lineAttrs(st)} stroke-dasharray="3 2"/>`;
    out += textLine(text, b.x + b.w - tw / 2 + 6, b.y + 2, { ...bs, size: st.size - 1, anchor: 'middle' });
  }
  return out + icon;
}

/** Header-only box (component, artifact, node …) with an icon in the corner. */
function boxWithHeader(ctx, v, el, b, st, iconSvg, { underline = false, name = null } = {}) {
  const has = (typeDef(el._type)?.compartments ?? []).some((k) => (el[k] ?? []).length);
  if (has) return classifierDraw(ctx, v, el, b, st, { icon: iconSvg });
  const header = headerLines(ctx, v, el, st, { underline, name: name ?? el.name });
  const h = stackHeight(header, b.w, base(st), ctx.measure);
  const top = ctx.containsViews?.(v) ? b.y + PAD + 4 : b.y + (b.h - h) / 2;
  return rectSvg(b, st) + textStack(header, b.x, top, b.w, base(st), ctx.measure).svg + iconSvg;
}

function instanceName(ctx, el) {
  const cls = ctx.index?.get(refId(el.classifier));
  return `${el.name ?? ''}${cls ? ` : ${cls.name}` : ''}`;
}

const componentIcon = (b, st) => {
  const x = b.x + b.w - 22;
  const y = b.y + 6;
  return `<g fill="${esc(st.fill)}" ${lineAttrs(st)}><rect x="${n(x + 3)}" y="${n(y)}" width="14" height="16"/><rect x="${n(x)}" y="${n(y + 3)}" width="7" height="4"/><rect x="${n(x)}" y="${n(y + 9)}" width="7" height="4"/></g>`;
};
const artifactIcon = (b, st) => {
  const x = b.x + b.w - 20;
  const y = b.y + 6;
  return `<path d="M${n(x)} ${n(y)}h8l4 4v12h-12z M${n(x + 8)} ${n(y)}v4h4" fill="${esc(st.fill)}" ${lineAttrs(st)}/>`;
};

// ───────────────────────── small shape helpers

const sizeOfText = (ctx, st, lines, { padX = 16, padY = 12, minW = 40, minH = 24 } = {}) => {
  const b = base(st);
  return { w: Math.max(minW, Math.ceil(stackWidth(lines, b, ctx.measure) + padX * 2)), h: Math.max(minH, Math.ceil(stackHeight(lines, 9999, b, ctx.measure) + padY * 2)) };
};
/** Wrapped name centred in a box. */
function centeredText(ctx, v, el, b, st, lines = null, { padX = 8 } = {}) {
  const list = (lines ?? headerLines(ctx, v, el, st, { bold: false })).map((l) => ({ ...l, wrap: true }));
  const h = stackHeight(list, b.w - padX * 2, base(st), ctx.measure, { padX });
  return textStack(list, b.x + padX, b.y + (b.h - h) / 2, b.w - padX * 2, base(st), ctx.measure, { padX: 0 }).svg;
}
const textOnly = (ctx, v, el, st) => headerLines(ctx, v, el, st, { bold: false });
/** A symbol drawn from a path builder, text centred inside. */
function symbol(build, { minW = 100, minH = 50, clip = 'rect', textBox = (b) => b, padX = 16 } = {}) {
  return {
    clip,
    size: (ctx, v, el, st) => sizeOfText(ctx, st, textOnly(ctx, v, el, st), { minW, minH, padX }),
    draw: (ctx, v, el, b, st) => pathSvg(build(b), st) + centeredText(ctx, v, el, textBox(b), st),
  };
}
/** Name below a fixed-size symbol. */
function nameBelow(ctx, v, el, b, st) {
  if (!el?.name || v.nameHidden) return '';
  const stereo = el && v.stereotypeDisplay !== 'none' ? stereotypeText(el, ctx.index, { keyword: false }) : '';
  let svg = '';
  let y = b.y + b.h + st.size + 2;
  if (stereo) { svg += textLine(stereo, b.x + b.w / 2, y, { ...base(st), size: st.size - 1, anchor: 'middle' }); y += st.size + 2; }
  return svg + textLine(el.name, b.x + b.w / 2, y, { ...base(st), anchor: 'middle' });
}
function fixed(w, h, draw, clip = 'rect', { below = true } = {}) {
  return { clip, fixed: false, size: () => ({ w, h }), draw: (ctx, v, el, b, st) => draw(ctx, v, el, b, st) + (below ? nameBelow(ctx, v, el, b, st) : '') };
}
const ellipse = (b, st, opts = {}) => `<ellipse cx="${n(b.x + b.w / 2)}" cy="${n(b.y + b.h / 2)}" rx="${n(b.w / 2)}" ry="${n(b.h / 2)}" ${shapeAttrs(st, opts)}/>`;
const circleAt = (cx, cy, r, st, opts = {}) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${shapeAttrs(st, opts)}/>`;
const diamondPath = (b) => `M${n(b.x + b.w / 2)} ${n(b.y)}L${n(b.x + b.w)} ${n(b.y + b.h / 2)}L${n(b.x + b.w / 2)} ${n(b.y + b.h)}L${n(b.x)} ${n(b.y + b.h / 2)}Z`;
/** Frame name tag "sd Name" in the top-left corner. Returns { svg, h }. */
function pentagonTag(ctx, b, label, st, { bold = true } = {}) {
  const w = Math.min(b.w - 4, ctx.measure(label, { fontSize: st.size, bold }) + 22);
  const h = st.size + 10;
  const d = `M${n(b.x)} ${n(b.y)}H${n(b.x + w)}V${n(b.y + h - 6)}L${n(b.x + w - 6)} ${n(b.y + h)}H${n(b.x)}Z`;
  return { svg: `<path d="${d}" fill="${esc(st.fill)}" ${lineAttrs(st)}/>${textLine(label, b.x + 6, b.y + h - 6, { ...base(st), bold })}`, h, w };
}

// ───────────────────────── the table

export const SHAPES = {
  classifier: {
    clip: 'rect',
    size: (ctx, v, el, st) => (isLollipop(v, el) ? { w: 26, h: 26 } : robustnessOf(ctx, v, el) ? robustnessSize(ctx, v, el, st) : classifierSize(ctx, v, el, st)),
    draw: (ctx, v, el, b, st) => {
      if (isLollipop(v, el)) return circleAt(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2, st) + nameBelow(ctx, v, el, b, st);
      const robust = robustnessOf(ctx, v, el);
      if (robust) return robustnessDraw(ctx, v, el, b, st, robust);
      let icon = '';
      if (v.stereotypeDisplay === 'decoration') icon = decorationIcon(el, b, st);
      return classifierDraw(ctx, v, el, b, st, { icon });
    },
  },
  component: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = classifierSize(ctx, v, el, st); return { w: s.w + 26, h: Math.max(s.h, 44) }; },
    draw: (ctx, v, el, b, st) => boxWithHeader(ctx, v, el, b, st, componentIcon(b, st), { underline: typeDef(el._type)?.underline, name: typeDef(el._type)?.underline ? instanceName(ctx, el) : null }),
  },
  artifact: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = classifierSize(ctx, v, el, st); return { w: s.w + 24, h: Math.max(s.h, 44) }; },
    draw: (ctx, v, el, b, st) => boxWithHeader(ctx, v, el, b, st, artifactIcon(b, st), { underline: typeDef(el._type)?.underline, name: typeDef(el._type)?.underline ? instanceName(ctx, el) : (el.fileName && el.fileName !== el.name ? `${el.name}` : null) }),
  },
  node3d: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = classifierSize(ctx, v, el, st); return { w: s.w + 20, h: Math.max(s.h + 20, 70) }; },
    draw: (ctx, v, el, b, st) => {
      const d = 10;
      const front = { x: b.x, y: b.y + d, w: b.w - d, h: b.h - d };
      const top = `M${n(b.x)} ${n(b.y + d)}L${n(b.x + d)} ${n(b.y)}H${n(b.x + b.w)}V${n(b.y + b.h - d)}L${n(b.x + b.w - d)} ${n(b.y + b.h)}`;
      const underline = typeDef(el._type)?.underline;
      const header = headerLines(ctx, v, el, st, { underline, name: underline ? instanceName(ctx, el) : el.name });
      const inside = ctx.containsViews?.(v);
      const h = stackHeight(header, front.w, base(st), ctx.measure);
      return pathSvg(`${top}V${n(b.y + d)}Z`, st, fill(shade(st.fill, -0.08))) + strokeSvg(`M${n(b.x + b.w - d)} ${n(b.y + d)}L${n(b.x + b.w)} ${n(b.y)}`, st)
        + rectSvg(front, { ...st, shadow: false }) + textStack(header, front.x, inside ? front.y + PAD : front.y + (front.h - h) / 2, front.w, base(st), ctx.measure).svg;
    },
  },
  package: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const lines = headerLines(ctx, v, el, st); const s = sizeOfText(ctx, st, lines, { padX: 12, padY: 10, minW: 80, minH: 40 }); return { w: s.w, h: s.h + 14 }; },
    draw: (ctx, v, el, b, st) => {
      const lines = headerLines(ctx, v, el, st);
      const tabW = Math.min(b.w * 0.45, Math.max(36, ctx.measure(el.name, { fontSize: st.size, bold: true }) * 0.5 + 20));
      const tab = { x: b.x, y: b.y, w: tabW, h: 14 };
      const body = { x: b.x, y: b.y + 14, w: b.w, h: b.h - 14 };
      let out = rectSvg(tab, st) + rectSvg(body, st);
      if (el._type === 'UMLModel') out += strokeSvg(`M${n(b.x + tabW - 16)} ${n(b.y + 11)}l5 -8l5 8z`, st);
      const inside = ctx.containsViews?.(v);
      const h = stackHeight(lines, b.w, base(st), ctx.measure);
      return out + textStack(lines, body.x, inside ? body.y + 4 : body.y + (body.h - h) / 2, body.w, base(st), ctx.measure).svg;
    },
  },
  subsystem: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = classifierSize(ctx, v, el, st); return { w: s.w + 26, h: Math.max(s.h, 50) }; },
    draw: (ctx, v, el, b, st) => {
      const x = b.x + b.w - 20; const y = b.y + 8;
      const icon = strokeSvg(`M${n(x + 6)} ${n(y)}v6M${n(x)} ${n(y + 12)}v-6h12v6`, st);
      return boxWithHeader(ctx, v, { ...el, stereotype: el.stereotype || 'subsystem' }, b, st, icon);
    },
  },
  actor: {
    clip: 'rect',
    size: (ctx, v, el, st) => {
      if (v.stereotypeDisplay === 'label' && v.actorAsBox) return classifierSize(ctx, v, el, st);
      return { w: Math.max(40, Math.ceil(ctx.measure(el.name ?? '', { fontSize: st.size }) + 8)), h: 80 };
    },
    draw: (ctx, v, el, b, st) => {
      if (v.stereotypeDisplay === 'label' && v.actorAsBox) return classifierDraw(ctx, v, { ...el, stereotype: el.stereotype || 'actor' }, b, st);
      const textH = st.size + 6;
      const fh = b.h - textH;
      const cx = b.x + b.w / 2;
      const r = fh * 0.13;
      const top = b.y + 2;
      const fig = `M${n(cx)} ${n(top + 2 * r)}V${n(top + fh * 0.62)}M${n(cx - fh * 0.24)} ${n(top + fh * 0.36)}H${n(cx + fh * 0.24)}M${n(cx)} ${n(top + fh * 0.62)}L${n(cx - fh * 0.2)} ${n(b.y + fh)}M${n(cx)} ${n(top + fh * 0.62)}L${n(cx + fh * 0.2)} ${n(b.y + fh)}`;
      const stereo = v.stereotypeDisplay !== 'none' && el.stereotype ? stereotypeText(el, ctx.index, { keyword: false }) : '';
      return circleAt(cx, top + r, r, st) + strokeSvg(fig, st)
        + (stereo ? textLine(stereo, cx, b.y + b.h - st.size - 4, { ...base(st), size: st.size - 1, anchor: 'middle' }) : '')
        + textLine(el.name, cx, b.y + b.h - 3, { ...base(st), anchor: 'middle', italic: el.isAbstract, bold: st.bold });
    },
  },
  usecase: {
    clip: 'ellipse',
    size: (ctx, v, el, st) => {
      const lines = useCaseLines(ctx, v, el, st);
      const s = sizeOfText(ctx, st, lines, { padX: 24, padY: 14, minW: 100, minH: 44 });
      return { w: s.w, h: s.h };
    },
    draw: (ctx, v, el, b, st) => {
      const lines = useCaseLines(ctx, v, el, st);
      const h = stackHeight(lines, b.w, base(st), ctx.measure);
      return ellipse(b, st) + textStack(lines, b.x + 10, b.y + (b.h - h) / 2, b.w - 20, base(st), ctx.measure).svg;
    },
  },
  subject: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, headerLines(ctx, v, el, st), { minW: 160, minH: 200 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st) + textStack(headerLines(ctx, v, el, st), b.x, b.y + PAD, b.w, base(st), ctx.measure).svg,
  },
  collaboration: {
    clip: 'ellipse',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, headerLines(ctx, v, el, st), { padX: 26, padY: 16, minW: 110, minH: 50 }),
    draw: (ctx, v, el, b, st) => {
      const name = el._type === 'UMLCollaborationUse' ? `${el.name ?? ''}${ctx.index?.get(refId(el.type)) ? ` : ${ctx.index.get(refId(el.type)).name}` : ''}` : el.name;
      return ellipse(b, st, { dash: '6 4' }) + centeredText(ctx, v, el, b, st, headerLines(ctx, v, el, st, { name, bold: el._type !== 'UMLCollaborationUse' }));
    },
  },
  object: {
    clip: 'rect',
    size: (ctx, v, el, st) => classifierSize(ctx, v, { ...el, name: instanceName(ctx, el) }, st),
    draw: (ctx, v, el, b, st) => {
      const shown = { ...el, name: instanceName(ctx, el) };
      const { sections } = classifierParts(ctx, v, shown, st);
      const header = headerLines(ctx, v, shown, st, { underline: true });
      const bs = base(st);
      let out = rectSvg(b, st);
      if (el.isMultiInstance) out = rectSvg({ ...b, x: b.x + 5, y: b.y - 5 }, st) + out;
      const hh = stackHeight(header, b.w, bs, ctx.measure) + PAD * 2;
      out += textStack(header, b.x, b.y + PAD, b.w, bs, ctx.measure).svg;
      if (sections.length) { out += hline(b.x, b.x + b.w, b.y + hh, st); out += textStack(sections[0].items, b.x, b.y + hh + PAD / 2, b.w, bs, ctx.measure, { gap: 0 }).svg; }
      return out;
    },
  },
  part: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: partText(ctx, el) }], { minW: 80, minH: 40 }),
    draw: (ctx, v, el, b, st) => {
      const dashed = el.aggregation && el.aggregation !== 'composite' && el._type === 'UMLAttribute';
      return rectSvg(b, st, { dash: dashed ? '6 3' : '' }) + centeredText(ctx, v, el, b, st, [...(el.stereotype ? [{ text: stereotypeText(el, ctx.index), size: st.size - 1 }] : []), { text: partText(ctx, el) }]);
    },
  },
  port: fixed(16, 16, (ctx, v, el, b, st) => rectSvg(b, st, { fill: el.isConjugated ? st.line : st.fill }), 'rect'),
  constraint: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: constraintText(el), wrap: false }], { padX: 12, padY: 10, minW: 60, minH: 30 }),
    draw: (ctx, v, el, b, st) => notePath(b, st) + centeredText(ctx, v, el, b, st, [{ text: constraintText(el) }]),
  },

  // ── interactions
  lifeline: {
    clip: 'lifeline',
    size: (ctx, v, el, st) => { const s = sizeOfText(ctx, st, lifelineLines(ctx, v, el, st), { padX: 10, padY: 8, minW: 90, minH: 36 }); const h = representsActor(ctx, el) && v.stereotypeDisplay !== 'label' ? 62 : s.h; return { w: s.w, h: ctx.sequence ? Math.max(h + 60, 100) : h }; },
    draw: (ctx, v, el, b, st) => {
      const lines = lifelineLines(ctx, v, el, st);
      const hh = ctx.headerHeight?.(v) ?? b.h;
      const seq = ctx.sequence?.lifelines?.get(v._id);
      const headTop = seq?.headTop ?? b.y;
      let out = '';
      if (ctx.sequence) {
        const end = seq?.end ?? b.y + b.h;
        out += `<path d="M${n(b.x + b.w / 2)} ${n(headTop + hh)}V${n(end)}" fill="none" ${lineAttrs(st)} stroke-dasharray="6 4"/>`;
        for (const act of seq?.activations ?? []) out += `<rect x="${n(b.x + b.w / 2 - 7 + act.depth * 6)}" y="${n(act.y1)}" width="14" height="${n(Math.max(6, act.y2 - act.y1))}" fill="${esc(st.fill)}" ${lineAttrs(st)}/>`;
        if (seq?.destroyed) out += strokeSvg(`M${n(b.x + b.w / 2 - 9)} ${n(end - 9)}l18 18M${n(b.x + b.w / 2 + 9)} ${n(end - 9)}l-18 18`, { ...st, lineWidth: 2 });
      }
      const head = { x: b.x, y: headTop, w: b.w, h: hh };
      if (el.isMultiInstance) out += rectSvg({ ...head, x: head.x + 4, y: head.y - 4 }, st);
      const actor = representsActor(ctx, el);
      if (actor && v.stereotypeDisplay !== 'label') {
        const cx = b.x + b.w / 2; const r = 6; const t = headTop + 2;
        out += `<rect x="${n(head.x)}" y="${n(head.y)}" width="${n(head.w)}" height="${n(head.h)}" fill="${esc(ctx.background ?? '#fff')}" stroke="none"/>`;
        out += circleAt(cx, t + r, r, st) + strokeSvg(`M${n(cx)} ${n(t + 2 * r)}v10M${n(cx - 9)} ${n(t + 2 * r + 4)}h18M${n(cx)} ${n(t + 2 * r + 10)}l-7 9M${n(cx)} ${n(t + 2 * r + 10)}l7 9`, st);
        out += textLine(lifelineText(el, ctx.index), cx, head.y + head.h - 4, { ...base(st), anchor: 'middle' });
        return out;
      }
      const h = stackHeight(lines, head.w, base(st), ctx.measure);
      return out + rectSvg(head, st) + textStack(lines, head.x, head.y + (head.h - h) / 2, head.w, base(st), ctx.measure).svg;
    },
  },
  fragment: {
    clip: 'rect',
    size: () => ({ w: 200, h: 120 }),
    draw: (ctx, v, el, b, st) => {
      const tag = pentagonTag(ctx, b, el.interactionOperator ?? 'alt', st);
      let out = rectSvg(b, { ...st, fill: 'none', shadow: false }) + tag.svg;
      const operands = el.operands ?? [];
      const ys = operandBounds(v, b, operands.length, tag.h);
      operands.forEach((op, i) => {
        if (i > 0) out += hline(b.x, b.x + b.w, ys[i].y, st, '6 4');
        const guard = op.guard ? `[${op.guard}]` : op.name ? op.name : '';
        if (guard) out += textLine(guard, b.x + (i === 0 ? tag.w + 8 : 8), ys[i].y + (i === 0 ? st.size + 2 : st.size + 4), { ...base(st), size: st.size - 1 });
      });
      return out;
    },
  },
  interactionUse: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = sizeOfText(ctx, st, [{ text: interactionUseText(ctx, el) }], { minW: 140, minH: 50 }); return { w: s.w + 30, h: s.h + 10 }; },
    draw: (ctx, v, el, b, st) => {
      const tag = pentagonTag(ctx, b, 'ref', st);
      return rectSvg(b, st) + tag.svg + centeredText(ctx, v, el, { ...b, y: b.y + tag.h / 2, h: b.h - tag.h / 2 }, st, [{ text: interactionUseText(ctx, el) }]);
    },
  },
  stateInvariant: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: `{${el.invariant || el.name}}` }], { minW: 60, minH: 28, padX: 10, padY: 6 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st, { r: 8 }) + centeredText(ctx, v, el, b, st, [{ text: `{${el.invariant || el.name}}` }]),
  },
  continuation: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: el.name }], { minW: 100, minH: 32 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st, { r: b.h / 2 }) + centeredText(ctx, v, el, b, st, [{ text: el.name }]),
  },
  endpoint: fixed(12, 12, (ctx, v, el, b, st) => circleAt(b.x + 6, b.y + 6, 6, { ...st, fill: st.line }), 'circle'),
  gate: fixed(8, 8, (ctx, v, el, b, st) => rectSvg(b, { ...st, fill: st.line }), 'rect'),
  timeTick: fixed(10, 20, (ctx, v, el, b, st) => strokeSvg(`M${n(b.x + 5)} ${n(b.y)}V${n(b.y + b.h)}`, st), 'rect'),
  frame: {
    clip: 'rect',
    size: () => ({ w: 300, h: 200 }),
    draw: (ctx, v, el, b, st) => {
      const kind = { UMLInteraction: 'sd', UMLStateMachine: 'stm', UMLActivity: 'act' }[el._type] ?? '';
      const tag = pentagonTag(ctx, b, `${kind} ${el.name ?? ''}`.trim(), st);
      return rectSvg(b, { ...st, fill: 'none', shadow: false }) + tag.svg;
    },
  },
  diagramFrame: {
    clip: 'rect',
    size: () => ({ w: 400, h: 300 }),
    draw: (ctx, v, el, b, st) => {
      const kind = { UMLSequenceDiagram: 'sd', UMLCommunicationDiagram: 'sd', UMLTimingDiagram: 'sd', UMLInteractionOverviewDiagram: 'sd', UMLStatechartDiagram: 'stm', UMLActivityDiagram: 'act', UMLClassDiagram: 'class', UMLPackageDiagram: 'pkg', UMLComponentDiagram: 'cmp', UMLDeploymentDiagram: 'dep', UMLUseCaseDiagram: 'uc' }[ctx.diagram?._type] ?? 'frame';
      const label = v.text || `${kind} ${ctx.diagram?.name ?? ''}`;
      return rectSvg(b, { ...st, fill: 'none', shadow: false }) + pentagonTag(ctx, b, label, st).svg;
    },
  },
  timingLifeline: {
    clip: 'rect',
    size: () => ({ w: 500, h: 120 }),
    draw: (ctx, v, el, b, st) => timingDraw(ctx, v, el, b, st),
  },

  // ── states
  state: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const { lines } = stateParts(ctx, v, el, st); const s = sizeOfText(ctx, st, lines, { padX: 12, padY: 10, minW: 80, minH: 40 }); return { w: s.w, h: s.h + (lines.length > 1 ? 6 : 0) }; },
    draw: (ctx, v, el, b, st) => {
      const { head, body } = stateParts(ctx, v, el, st);
      const bs = base(st);
      let out = rectSvg(b, st, { r: 10 });
      const inside = ctx.containsViews?.(v);
      const hh = stackHeight(head, b.w, bs, ctx.measure);
      if (!body.length && !inside) return out + textStack(head, b.x, b.y + (b.h - hh) / 2, b.w, bs, ctx.measure).svg;
      out += textStack(head, b.x, b.y + PAD, b.w, bs, ctx.measure).svg;
      const y = b.y + hh + PAD * 1.5;
      out += hline(b.x, b.x + b.w, y, st);
      out += textStack(body, b.x, y + 3, b.w, bs, ctx.measure, { gap: 0 }).svg;
      if (el.regions?.length > 1) {
        const step = (b.h - (y - b.y)) / el.regions.length;
        for (let i = 1; i < el.regions.length; i += 1) out += hline(b.x, b.x + b.w, y + step * i, st, '6 4');
      }
      if (el._type === 'UMLSubmachineState' || el.submachine) out += strokeSvg(`M${n(b.x + b.w - 26)} ${n(b.y + b.h - 10)}h16M${n(b.x + b.w - 26)} ${n(b.y + b.h - 10)}m0 0a3 3 0 1 0 0.01 0M${n(b.x + b.w - 10)} ${n(b.y + b.h - 10)}a3 3 0 1 0 0.01 0`, st);
      return out;
    },
  },
  pseudostate: {
    clip: 'circle',
    size: (ctx, v, el) => PSEUDO_SIZE[el.kind] ?? { w: 20, h: 20 },
    draw: (ctx, v, el, b, st) => pseudostateDraw(el.kind, b, st) + nameBelow(ctx, v, el, b, st),
  },
  finalState: fixed(26, 26, (ctx, v, el, b, st) => circleAt(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2, { ...st, fill: ctx.background ?? '#fff' }) + circleAt(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2 - 5, { ...st, fill: st.line, shadow: false }), 'circle'),

  // ── activities
  action: {
    clip: 'rect',
    size: (ctx, v, el, st) => {
      if (el.kind === 'acceptTimeEvent') return { w: 24, h: 30 };
      const s = sizeOfText(ctx, st, textOnly(ctx, v, el, st), { minW: 90, minH: 40 });
      return { w: s.w + (el.kind === 'sendSignal' || el.kind === 'acceptSignal' ? 16 : 0), h: s.h };
    },
    draw: (ctx, v, el, b, st) => actionDraw(ctx, v, el, b, st),
  },
  initial: fixed(20, 20, (ctx, v, el, b, st) => circleAt(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2, { ...st, fill: st.line }), 'circle'),
  flowFinal: fixed(24, 24, (ctx, v, el, b, st) => {
    const r = Math.min(b.w, b.h) / 2; const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const k = r * 0.7;
    return circleAt(cx, cy, r, { ...st, fill: ctx.background ?? '#fff' }) + strokeSvg(`M${n(cx - k)} ${n(cy - k)}L${n(cx + k)} ${n(cy + k)}M${n(cx + k)} ${n(cy - k)}L${n(cx - k)} ${n(cy + k)}`, st);
  }, 'circle'),
  bar: fixed(80, 6, (ctx, v, el, b, st) => rectSvg(b, { ...st, fill: st.line })),
  diamond: fixed(30, 30, (ctx, v, el, b, st) => pathSvg(diamondPath(b), st) + (el.decisionInput ? textLine(`«decisionInput» ${el.decisionInput}`, b.x + b.w + 4, b.y, { ...base(st), size: st.size - 2 }) : ''), 'diamond'),
  objectNode: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, objectNodeLines(ctx, v, el, st), { minW: 90, minH: 40 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st) + centeredText(ctx, v, el, b, st, objectNodeLines(ctx, v, el, st)),
  },
  pin: fixed(14, 14, (ctx, v, el, b, st) => rectSvg(b, st) + (el._type === 'UMLOutputPin' ? strokeSvg(`M${n(b.x + 3)} ${n(b.y + 7)}h8m-3 -3l3 3l-3 3`, st) : '')),
  expansion: {
    clip: 'rect', size: () => ({ w: 240, h: 150 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st, { r: 12, dash: '6 4', fill: 'none' }) + textLine(`«${el.mode ?? 'iterative'}»`, b.x + 10, b.y + st.size + 6, { ...base(st), size: st.size - 1 }),
  },
  structured: {
    clip: 'rect', size: () => ({ w: 240, h: 150 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st, { r: 12, dash: '6 4', fill: 'none' }) + textLine('«structured»', b.x + b.w / 2, b.y + st.size + 6, { ...base(st), size: st.size - 1, anchor: 'middle' }) + textLine(el.name, b.x + b.w / 2, b.y + st.size * 2 + 8, { ...base(st), anchor: 'middle', bold: true }),
  },
  interruptible: {
    clip: 'rect', size: () => ({ w: 240, h: 150 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st, { r: 12, dash: '3 3', fill: 'none' }) + (el.name ? textLine(el.name, b.x + 10, b.y + st.size + 6, base(st)) : ''),
  },
  swimlane: {
    clip: 'rect',
    size: () => ({ w: 220, h: 400 }),
    draw: (ctx, v, el, b, st) => {
      const vertical = el.isVertical !== false;
      const name = el.name ?? '';
      if (vertical) {
        const hh = 32;
        return rectSvg(b, { ...st, fill: 'none', shadow: false }) + rectSvg({ ...b, h: hh }, { ...st, shadow: false }) + textLine(name, b.x + b.w / 2, b.y + hh / 2 + st.size * 0.35, { ...base(st), anchor: 'middle', bold: true });
      }
      const hw = 32;
      return rectSvg(b, { ...st, fill: 'none', shadow: false }) + rectSvg({ ...b, w: hw }, { ...st, shadow: false })
        + `<g transform="rotate(-90 ${n(b.x + hw / 2)} ${n(b.y + b.h / 2)})">${textLine(name, b.x + hw / 2, b.y + b.h / 2 + st.size * 0.35, { ...base(st), anchor: 'middle', bold: true })}</g>`;
    },
  },

  // ── ERD
  entity: {
    clip: 'rect',
    size: (ctx, v, el, st) => entityLayout(ctx, v, el, st).size,
    draw: (ctx, v, el, b, st) => {
      const lay = entityLayout(ctx, v, el, st);
      const bs = base(st);
      let out = rectSvg(b, st, { r: el.isWeak ? 0 : 0 });
      if (el.isWeak) out += rectSvg({ x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 6 }, { ...st, fill: 'none', shadow: false });
      out += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(lay.headerH)}" fill="${esc(st.headerFill ?? shade(st.fill, -0.06))}" ${lineAttrs(st)}/>`;
      out += textLine(el.name, b.x + b.w / 2, b.y + lay.headerH / 2 + st.size * 0.36, { ...bs, anchor: 'middle', bold: true });
      let y = b.y + lay.headerH;
      for (const row of lay.rows) {
        const base0 = y + lay.rowH / 2 + st.size * 0.36;
        if (row.keys) out += textLine(row.keys, b.x + PAD, base0, { ...bs, size: st.size - 2, bold: true, color: row.keys.includes('PK') ? '#b8860b' : '#2a6fb0' });
        out += textLine(row.name, b.x + PAD + lay.keyW, base0, { ...bs, underline: row.pk, bold: row.pk });
        out += textLine(row.type, b.x + b.w - PAD, base0, { ...bs, anchor: 'end', color: shade(st.color, 0.35), italic: true });
        y += lay.rowH;
      }
      return out;
    },
  },

  // ── DFD
  dfdExternal: symbol((b) => `M${n(b.x)} ${n(b.y)}h${n(b.w)}v${n(b.h)}h${n(-b.w)}Z M${n(b.x + 4)} ${n(b.y + 4)}v${n(b.h - 4)}`, { minW: 100, minH: 50 }),
  dfdProcess: {
    clip: 'ellipse',
    size: (ctx, v, el, st) => { const s = sizeOfText(ctx, st, dfdLines(el, st), { padX: 20, padY: 18, minW: 80, minH: 80 }); const d = Math.max(s.w, s.h); return { w: d, h: d }; },
    draw: (ctx, v, el, b, st) => ellipse(b, st) + centeredText(ctx, v, el, b, st, dfdLines(el, st), { padX: 14 }),
  },
  dfdStore: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = sizeOfText(ctx, st, [{ text: el.name }], { minW: 120, minH: 36 }); return { w: s.w + 30, h: s.h }; },
    draw: (ctx, v, el, b, st) => {
      const idW = 30;
      return `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${esc(st.fill)}" stroke="none"${st.shadow ? ' filter="url(#uml-shadow)"' : ''}/>`
        + strokeSvg(`M${n(b.x + b.w)} ${n(b.y)}H${n(b.x)}V${n(b.y + b.h)}H${n(b.x + b.w)}M${n(b.x + idW)} ${n(b.y)}V${n(b.y + b.h)}`, st)
        + textLine(el.id ?? 'D', b.x + idW / 2, b.y + b.h / 2 + st.size * 0.36, { ...base(st), anchor: 'middle', bold: true })
        + centeredText(ctx, v, el, { ...b, x: b.x + idW, w: b.w - idW }, st, [{ text: el.name }]);
    },
  },

  // ── SysML
  requirement: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = classifierSize(ctx, v, el, st); return { w: Math.max(s.w, 160), h: s.h }; },
    draw: (ctx, v, el, b, st) => classifierDraw(ctx, v, el, b, st),
  },
  constraintProperty: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: '«constraint»' }, { text: partText(ctx, el) }], { minW: 120, minH: 50 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st, { r: 12 }) + centeredText(ctx, v, el, b, st, [{ text: '«constraint»', size: st.size - 1 }, { text: partText(ctx, el) }]),
  },

  // ── BPMN
  pool: { clip: 'rect', size: () => ({ w: 600, h: 200 }), draw: (ctx, v, el, b, st) => bandBox(ctx, b, st, el.name, 32, false) },
  lane: { clip: 'rect', size: () => ({ w: 568, h: 120 }), draw: (ctx, v, el, b, st) => bandBox(ctx, b, st, el.name, 28, true) },
  bpmnTask: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: el.name, wrap: true }], { minW: 100, minH: 64 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, st, { r: 10 }) + taskIcon(el.taskKind, b, st) + loopMarker(el.loop, b, st) + centeredText(ctx, v, el, b, st, [{ text: el.name }]),
  },
  bpmnSubProcess: {
    clip: 'rect',
    size: () => ({ w: 140, h: 90 }),
    draw: (ctx, v, el, b, st) => {
      let out = rectSvg(b, st, { r: 10, dash: el.triggeredByEvent ? '4 3' : '' });
      if (el.collapsed || !ctx.containsViews?.(v)) {
        out += strokeSvg(`M${n(b.x + b.w / 2 - 7)} ${n(b.y + b.h - 18)}h14v14h-14zM${n(b.x + b.w / 2)} ${n(b.y + b.h - 15)}v8M${n(b.x + b.w / 2 - 4)} ${n(b.y + b.h - 11)}h8`, st);
        return out + loopMarker(el.loop, { ...b, x: b.x - 20 }, st) + centeredText(ctx, v, el, { ...b, h: b.h - 14 }, st, [{ text: el.name }]);
      }
      return out + textLine(el.name, b.x + 8, b.y + st.size + 6, { ...base(st), bold: true });
    },
  },
  bpmnCall: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: el.name, wrap: true }], { minW: 100, minH: 64 }),
    draw: (ctx, v, el, b, st) => rectSvg(b, { ...st, lineWidth: 3.5 }, { r: 10 }) + centeredText(ctx, v, el, b, st, [{ text: el.name }]),
  },
  bpmnEvent: fixed(36, 36, (ctx, v, el, b, st) => eventDraw(typeDef(el._type).event, el, b, st), 'circle'),
  bpmnGateway: fixed(42, 42, (ctx, v, el, b, st) => pathSvg(diamondPath(b), st) + gatewayMark(typeDef(el._type).mark, b, st), 'diamond'),
  bpmnData: fixed(30, 40, (ctx, v, el, b, st) => {
    const f = 8;
    let out = pathSvg(`M${n(b.x)} ${n(b.y)}H${n(b.x + b.w - f)}L${n(b.x + b.w)} ${n(b.y + f)}V${n(b.y + b.h)}H${n(b.x)}Z`, st) + strokeSvg(`M${n(b.x + b.w - f)} ${n(b.y)}V${n(b.y + f)}H${n(b.x + b.w)}`, st);
    if (el.isCollection) out += strokeSvg(`M${n(b.x + b.w / 2 - 5)} ${n(b.y + b.h - 10)}v7M${n(b.x + b.w / 2)} ${n(b.y + b.h - 10)}v7M${n(b.x + b.w / 2 + 5)} ${n(b.y + b.h - 10)}v7`, st);
    return out;
  }),
  bpmnStore: fixed(44, 40, (ctx, v, el, b, st) => cylinder(b, st)),
  bpmnAnnotation: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: el.text || el.name || '' }], { minW: 80, minH: 36, padX: 8 }),
    draw: (ctx, v, el, b, st) => strokeSvg(`M${n(b.x + 14)} ${n(b.y)}H${n(b.x)}V${n(b.y + b.h)}H${n(b.x + 14)}`, st)
      + textStack(String(el.text || el.name || '').split('\n').map((t) => ({ text: t, align: 'left', wrap: true })), b.x + 4, b.y + 6, b.w - 8, base(st), ctx.measure).svg,
  },
  bpmnGroup: { clip: 'rect', size: () => ({ w: 200, h: 140 }), draw: (ctx, v, el, b, st) => rectSvg(b, { ...st, fill: 'none', shadow: false }, { r: 10, dash: '8 3 2 3' }) + (el.name ? textLine(el.name, b.x + b.w / 2, b.y + st.size + 4, { ...base(st), anchor: 'middle' }) : '') },

  // ── C4
  c4Person: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = sizeOfText(ctx, st, c4Lines(el, st, 'Person'), { padX: 14, padY: 12, minW: 160, minH: 90 }); return { w: s.w, h: s.h + 46 }; },
    draw: (ctx, v, el, b, st) => {
      const c = c4Color(el, st);
      const r = 22;
      const body = { x: b.x, y: b.y + r * 1.6, w: b.w, h: b.h - r * 1.6 };
      return circleAt(b.x + b.w / 2, b.y + r, r, { ...st, fill: c, line: shade(c, -0.25) }) + rectSvg(body, { ...st, fill: c, line: shade(c, -0.25) }, { r: 18 })
        + centeredText(ctx, v, el, { ...body, y: body.y + 6, h: body.h - 6 }, { ...st, color: '#ffffff' }, c4Lines(el, st, 'Person'));
    },
  },
  c4Box: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, c4Lines(el, st, c4Kind(el)), { padX: 14, padY: 12, minW: 160, minH: 100 }),
    draw: (ctx, v, el, b, st) => {
      const c = c4Color(el, st);
      const textColor = el._type === 'C4Component' && !v.fillColor ? '#000000' : '#ffffff';
      return rectSvg(b, { ...st, fill: c, line: shade(c, -0.25) }, { r: 6 }) + centeredText(ctx, v, el, b, { ...st, color: v.fontColor || textColor }, c4Lines(el, st, c4Kind(el)));
    },
  },
  c4Database: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const s = sizeOfText(ctx, st, c4Lines(el, st, 'Container'), { padX: 14, padY: 12, minW: 160, minH: 100 }); return { w: s.w, h: s.h + 20 }; },
    draw: (ctx, v, el, b, st) => { const c = c4Color(el, st); return cylinder(b, { ...st, fill: c, line: shade(c, -0.25) }) + centeredText(ctx, v, el, { ...b, y: b.y + 14, h: b.h - 14 }, { ...st, color: v.fontColor || '#ffffff' }, c4Lines(el, st, 'Container')); },
  },
  c4Boundary: {
    clip: 'rect', size: () => ({ w: 400, h: 280 }),
    draw: (ctx, v, el, b, st) => {
      const kind = el._type === 'C4DeploymentNode' ? (el.technology ? `[${el.technology}]` : '[Deployment Node]') : `[${(el.boundaryKind ?? 'system').replace(/^./, (c) => c.toUpperCase())}]`;
      return rectSvg(b, { ...st, fill: 'none', shadow: false }, { r: 4, dash: el._type === 'C4DeploymentNode' ? '' : '8 4' })
        + textLine(el.name, b.x + 10, b.y + b.h - st.size - 8, { ...base(st), bold: true }) + textLine(kind, b.x + 10, b.y + b.h - 6, { ...base(st), size: st.size - 2 });
    },
  },

  // ── mind map
  mmNode: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const root = isMindRoot(ctx, el); return sizeOfText(ctx, { ...st, size: root ? st.size + 3 : st.size }, [{ text: el.name, bold: root }], { padX: root ? 20 : 12, padY: root ? 12 : 7, minW: 60, minH: root ? 44 : 30 }); },
    draw: (ctx, v, el, b, st) => {
      const root = isMindRoot(ctx, el);
      const c = v.fillColor || (root ? '#5b6ee1' : mindColor(ctx, el));
      return rectSvg(b, { ...st, fill: c, line: shade(c, -0.25) }, { r: Math.min(b.h / 2, 14) }) + textLine(el.name, b.x + b.w / 2, b.y + b.h / 2 + (root ? st.size + 3 : st.size) * 0.36, { ...base(st), size: root ? st.size + 3 : st.size, anchor: 'middle', bold: root, color: v.fontColor || (root ? '#ffffff' : '#1f2937') });
    },
  },

  // ── cloud
  cloudGroup: {
    clip: 'rect', size: () => ({ w: 420, h: 280 }),
    draw: (ctx, v, el, b, st) => {
      const info = groupInfo(el.provider ?? ctx.diagramProvider ?? 'aws', el.groupKind ?? 'generic');
      const c = v.lineColor || info.color;
      const label = el.name || info.label;
      return rectSvg(b, { ...st, line: c, fill: v.fillColor || 'none', shadow: false, lineWidth: 1.5 }, { dash: info.dashed ? '6 4' : '' })
        + `<rect x="${n(b.x)}" y="${n(b.y)}" width="22" height="22" fill="${esc(c)}"/>` + strokeSvg(`M${n(b.x + 5)} ${n(b.y + 15)}h12M${n(b.x + 7)} ${n(b.y + 15)}a4 4 0 0 1 8 -4a3 3 0 0 1 2 4`, { ...st, line: '#ffffff', lineWidth: 1.3 })
        + textLine(label, b.x + 28, b.y + 15, { ...base(st), color: v.fontColor || c, bold: true });
    },
  },
  cloudService: fixed(48, 48, (ctx, v, el, b, st) => {
    const info = serviceInfo(el.provider ?? ctx.diagramProvider ?? 'aws', el.service);
    const c = v.fillColor || info.color;
    const size = info.short.length > 3 ? 11 : 14;
    return `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(Math.min(b.w, b.h) * 0.18)}" fill="${esc(c)}"${st.shadow ? ' filter="url(#uml-shadow)"' : ''}/>`
      + textLine(info.short, b.x + b.w / 2, b.y + b.h / 2 + size * 0.36, { face: st.face, size, color: '#ffffff', anchor: 'middle', bold: true })
      + (el.name ? '' : textLine(info.name, b.x + b.w / 2, b.y + b.h + st.size + 2, { ...base(st), anchor: 'middle', size: st.size - 1 }));
  }),

  // ── annotations
  note: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, noteLines(v), { padX: 10, padY: 8, minW: 80, minH: 40 }),
    draw: (ctx, v, el, b, st) => notePath(b, st) + textStack(noteLines(v).map((l) => ({ ...l, wrap: true })), b.x, b.y + 8, b.w - 4, base(st), ctx.measure, { padX: 8 }).svg,
  },
  text: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, noteLines(v, v.textAlign ?? 'left'), { padX: 4, padY: 4, minW: 20, minH: 18 }),
    draw: (ctx, v, el, b, st) => textStack(noteLines(v, v.textAlign ?? 'left').map((l) => ({ ...l, wrap: v.wordWrap })), b.x, b.y + 4, b.w, base(st), ctx.measure, { padX: 4 }).svg,
  },
  rect: { clip: 'rect', size: () => ({ w: 100, h: 60 }), draw: (ctx, v, el, b, st) => rectSvg(b, st) + centeredText(ctx, v, el, b, st, noteLines(v, 'center')) },
  roundRect: { clip: 'rect', size: () => ({ w: 100, h: 60 }), draw: (ctx, v, el, b, st) => rectSvg(b, st, { r: 12 }) + centeredText(ctx, v, el, b, st, noteLines(v, 'center')) },
  ellipse: { clip: 'ellipse', size: () => ({ w: 100, h: 60 }), draw: (ctx, v, el, b, st) => ellipse(b, st) + centeredText(ctx, v, el, b, st, noteLines(v, 'center')) },
  hyperlink: {
    clip: 'rect',
    size: (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: v.text || v.url || 'link' }], { padX: 14, padY: 6, minW: 40, minH: 24 }),
    draw: (ctx, v, el, b, st) => strokeSvg(`M${n(b.x + 3)} ${n(b.y + b.h / 2 + 3)}l6 -6M${n(b.x + 2)} ${n(b.y + b.h / 2)}a3 3 0 0 1 0 -4l1 -1a3 3 0 0 1 4 0`, { ...st, line: '#1a66cc' })
      + textLine(v.text || v.url || 'link', b.x + 14, b.y + b.h / 2 + st.size * 0.36, { ...base(st), color: v.fontColor || '#1a66cc', underline: true }),
  },
  image: {
    clip: 'rect', size: () => ({ w: 120, h: 90 }),
    draw: (ctx, v, el, b, st) => (v.src ? `<image href="${esc(v.src)}" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" preserveAspectRatio="xMidYMid meet"/>` : rectSvg(b, st) + strokeSvg(`M${n(b.x)} ${n(b.y)}L${n(b.x + b.w)} ${n(b.y + b.h)}M${n(b.x + b.w)} ${n(b.y)}L${n(b.x)} ${n(b.y + b.h)}`, st)),
  },
};

// Flowchart symbols
const curveBottom = (b, k = 0.12) => `M${n(b.x)} ${n(b.y)}H${n(b.x + b.w)}V${n(b.y + b.h * (1 - k))}C${n(b.x + b.w * 0.75)} ${n(b.y + b.h * (1 - 3 * k))} ${n(b.x + b.w * 0.25)} ${n(b.y + b.h * (1 + k))} ${n(b.x)} ${n(b.y + b.h * (1 - k))}Z`;
Object.assign(SHAPES, {
  fcProcess: symbol((b) => `M${n(b.x)} ${n(b.y)}h${n(b.w)}v${n(b.h)}h${n(-b.w)}Z`),
  fcTerminator: symbol((b) => { const r = b.h / 2; return `M${n(b.x + r)} ${n(b.y)}H${n(b.x + b.w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(b.x + b.w - r)} ${n(b.y + b.h)}H${n(b.x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(b.x + r)} ${n(b.y)}Z`; }, { minH: 40 }),
  fcDecision: symbol(diamondPath, { minW: 110, minH: 64, clip: 'diamond', textBox: (b) => ({ x: b.x + b.w / 4, y: b.y + b.h / 4, w: b.w / 2, h: b.h / 2 }), padX: 34 }),
  fcDelay: symbol((b) => { const r = Math.min(b.h / 2, b.w / 2); return `M${n(b.x)} ${n(b.y)}H${n(b.x + b.w - r)}A${n(r)} ${n(b.h / 2)} 0 0 1 ${n(b.x + b.w - r)} ${n(b.y + b.h)}H${n(b.x)}Z`; }),
  fcPredefined: symbol((b) => `M${n(b.x)} ${n(b.y)}h${n(b.w)}v${n(b.h)}h${n(-b.w)}Z M${n(b.x + 10)} ${n(b.y)}v${n(b.h)}M${n(b.x + b.w - 10)} ${n(b.y)}v${n(b.h)}`, { padX: 22 }),
  fcAlternate: { ...symbol((b) => `M${n(b.x + 10)} ${n(b.y)}H${n(b.x + b.w - 10)}Q${n(b.x + b.w)} ${n(b.y)} ${n(b.x + b.w)} ${n(b.y + 10)}V${n(b.y + b.h - 10)}Q${n(b.x + b.w)} ${n(b.y + b.h)} ${n(b.x + b.w - 10)} ${n(b.y + b.h)}H${n(b.x + 10)}Q${n(b.x)} ${n(b.y + b.h)} ${n(b.x)} ${n(b.y + b.h - 10)}V${n(b.y + 10)}Q${n(b.x)} ${n(b.y)} ${n(b.x + 10)} ${n(b.y)}Z`) },
  fcData: symbol((b) => `M${n(b.x + b.w * 0.15)} ${n(b.y)}H${n(b.x + b.w)}L${n(b.x + b.w * 0.85)} ${n(b.y + b.h)}H${n(b.x)}Z`, { padX: 24 }),
  fcDocument: symbol((b) => curveBottom(b), { textBox: (b) => ({ ...b, h: b.h * 0.85 }) }),
  fcMultiDocument: symbol((b) => { const o = 6; const f = { x: b.x, y: b.y + 2 * o, w: b.w - 2 * o, h: b.h - 2 * o }; return `M${n(b.x + 2 * o)} ${n(b.y + o * 0)}H${n(b.x + b.w)}V${n(b.y + b.h - 3 * o)}H${n(b.x + b.w - o)}M${n(b.x + o)} ${n(b.y + o)}H${n(b.x + b.w - o)}V${n(b.y + b.h - 2 * o)}M${n(b.x + o)} ${n(b.y + o)}V${n(b.y + 2 * o)}M${n(b.x + 2 * o)} ${n(b.y)}V${n(b.y + o)}${curveBottom(f)}`; }, { textBox: (b) => ({ ...b, y: b.y + 12, w: b.w - 12, h: b.h * 0.7 }) }),
  fcPreparation: symbol((b) => `M${n(b.x + 16)} ${n(b.y)}H${n(b.x + b.w - 16)}L${n(b.x + b.w)} ${n(b.y + b.h / 2)}L${n(b.x + b.w - 16)} ${n(b.y + b.h)}H${n(b.x + 16)}L${n(b.x)} ${n(b.y + b.h / 2)}Z`, { padX: 26 }),
  fcDisplay: symbol((b) => `M${n(b.x)} ${n(b.y + b.h / 2)}L${n(b.x + 16)} ${n(b.y)}H${n(b.x + b.w - b.h / 2)}A${n(b.h / 2)} ${n(b.h / 2)} 0 0 1 ${n(b.x + b.w - b.h / 2)} ${n(b.y + b.h)}H${n(b.x + 16)}Z`, { padX: 26 }),
  fcManualInput: symbol((b) => `M${n(b.x)} ${n(b.y + b.h * 0.3)}L${n(b.x + b.w)} ${n(b.y)}V${n(b.y + b.h)}H${n(b.x)}Z`, { textBox: (b) => ({ ...b, y: b.y + b.h * 0.15, h: b.h * 0.85 }) }),
  fcManualOperation: symbol((b) => `M${n(b.x)} ${n(b.y)}H${n(b.x + b.w)}L${n(b.x + b.w * 0.85)} ${n(b.y + b.h)}H${n(b.x + b.w * 0.15)}Z`, { padX: 24 }),
  fcCard: symbol((b) => `M${n(b.x + 14)} ${n(b.y)}H${n(b.x + b.w)}V${n(b.y + b.h)}H${n(b.x)}V${n(b.y + 14)}Z`),
  fcPunchedTape: symbol((b) => { const k = b.h * 0.12; return `M${n(b.x)} ${n(b.y + k)}C${n(b.x + b.w * 0.25)} ${n(b.y - k)} ${n(b.x + b.w * 0.25)} ${n(b.y + 3 * k)} ${n(b.x + b.w / 2)} ${n(b.y + k)}S${n(b.x + b.w * 0.75)} ${n(b.y - k)} ${n(b.x + b.w)} ${n(b.y + k)}V${n(b.y + b.h - k)}C${n(b.x + b.w * 0.75)} ${n(b.y + b.h + k)} ${n(b.x + b.w * 0.75)} ${n(b.y + b.h - 3 * k)} ${n(b.x + b.w / 2)} ${n(b.y + b.h - k)}S${n(b.x + b.w * 0.25)} ${n(b.y + b.h + k)} ${n(b.x)} ${n(b.y + b.h - k)}Z`; }),
  fcConnector: { ...symbol((b) => `M${n(b.x)} ${n(b.y + b.h / 2)}a${n(b.w / 2)} ${n(b.h / 2)} 0 1 0 ${n(b.w)} 0a${n(b.w / 2)} ${n(b.h / 2)} 0 1 0 ${n(-b.w)} 0Z`, { minW: 36, minH: 36, clip: 'ellipse', padX: 6 }) },
  fcOffPage: symbol((b) => `M${n(b.x)} ${n(b.y)}H${n(b.x + b.w)}V${n(b.y + b.h * 0.65)}L${n(b.x + b.w / 2)} ${n(b.y + b.h)}L${n(b.x)} ${n(b.y + b.h * 0.65)}Z`, { minW: 40, minH: 44, padX: 6, textBox: (b) => ({ ...b, h: b.h * 0.65 }) }),
  fcOr: { clip: 'ellipse', size: () => ({ w: 36, h: 36 }), draw: (ctx, v, el, b, st) => ellipse(b, st) + strokeSvg(`M${n(b.x + b.w / 2)} ${n(b.y)}V${n(b.y + b.h)}M${n(b.x)} ${n(b.y + b.h / 2)}H${n(b.x + b.w)}`, st) },
  fcSumming: { clip: 'ellipse', size: () => ({ w: 36, h: 36 }), draw: (ctx, v, el, b, st) => { const k = 0.354; return ellipse(b, st) + strokeSvg(`M${n(b.x + b.w * (0.5 - k))} ${n(b.y + b.h * (0.5 - k))}L${n(b.x + b.w * (0.5 + k))} ${n(b.y + b.h * (0.5 + k))}M${n(b.x + b.w * (0.5 + k))} ${n(b.y + b.h * (0.5 - k))}L${n(b.x + b.w * (0.5 - k))} ${n(b.y + b.h * (0.5 + k))}`, st); } },
  fcCollate: { clip: 'rect', size: () => ({ w: 40, h: 50 }), draw: (ctx, v, el, b, st) => pathSvg(`M${n(b.x)} ${n(b.y)}H${n(b.x + b.w)}L${n(b.x)} ${n(b.y + b.h)}H${n(b.x + b.w)}Z`, st) },
  fcSort: { clip: 'diamond', size: () => ({ w: 50, h: 50 }), draw: (ctx, v, el, b, st) => pathSvg(diamondPath(b), st) + hline(b.x, b.x + b.w, b.y + b.h / 2, st) },
  fcMerge: { clip: 'rect', size: () => ({ w: 50, h: 40 }), draw: (ctx, v, el, b, st) => pathSvg(`M${n(b.x)} ${n(b.y)}H${n(b.x + b.w)}L${n(b.x + b.w / 2)} ${n(b.y + b.h)}Z`, st) + nameBelow(ctx, v, el, b, st) },
  fcExtract: { clip: 'rect', size: () => ({ w: 50, h: 40 }), draw: (ctx, v, el, b, st) => pathSvg(`M${n(b.x + b.w / 2)} ${n(b.y)}L${n(b.x + b.w)} ${n(b.y + b.h)}H${n(b.x)}Z`, st) + nameBelow(ctx, v, el, b, st) },
  fcStoredData: symbol((b) => `M${n(b.x + 12)} ${n(b.y)}H${n(b.x + b.w)}Q${n(b.x + b.w - 12)} ${n(b.y + b.h / 2)} ${n(b.x + b.w)} ${n(b.y + b.h)}H${n(b.x + 12)}Q${n(b.x)} ${n(b.y + b.h / 2)} ${n(b.x + 12)} ${n(b.y)}Z`, { padX: 22 }),
  fcDatabase: { clip: 'rect', size: (ctx, v, el, st) => { const s = sizeOfText(ctx, st, textOnly(ctx, v, el, st), { minW: 80, minH: 60 }); return { w: s.w, h: s.h + 16 }; }, draw: (ctx, v, el, b, st) => cylinder(b, st) + centeredText(ctx, v, el, { ...b, y: b.y + 12, h: b.h - 12 }, st) },
  fcDirectAccess: symbol((b) => { const r = Math.min(14, b.w / 4); return `M${n(b.x + r)} ${n(b.y)}H${n(b.x + b.w - r)}A${n(r)} ${n(b.h / 2)} 0 0 1 ${n(b.x + b.w - r)} ${n(b.y + b.h)}H${n(b.x + r)}A${n(r)} ${n(b.h / 2)} 0 0 1 ${n(b.x + r)} ${n(b.y)}Z M${n(b.x + b.w - r)} ${n(b.y)}A${n(r)} ${n(b.h / 2)} 0 0 0 ${n(b.x + b.w - r)} ${n(b.y + b.h)}`; }, { padX: 26 }),
  fcInternalStorage: symbol((b) => `M${n(b.x)} ${n(b.y)}h${n(b.w)}v${n(b.h)}h${n(-b.w)}Z M${n(b.x + 10)} ${n(b.y)}v${n(b.h)}M${n(b.x)} ${n(b.y + 10)}h${n(b.w)}`, { padX: 20 }),
});

// Wireframe widgets
const wf = (draw, size, clip = 'rect') => ({ clip, size: (ctx, v, el, st) => size(ctx, v, el, st), draw });
const wfName = (el) => el.name ?? '';
const items = (el) => String(el.items ?? '').split(',').map((s) => s.trim()).filter(Boolean);
Object.assign(SHAPES, {
  wfFrame: wf((ctx, v, el, b, st) => {
    const web = el._type === 'WFWebFrame';
    let out = rectSvg(b, st, { r: 4 }) + `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="26" rx="4" fill="${esc(shade(st.fill, -0.08))}" ${lineAttrs(st)}/>`;
    out += [0, 1, 2].map((i) => `<circle cx="${n(b.x + 12 + i * 14)}" cy="${n(b.y + 13)}" r="4" fill="${['#ff5f57', '#febc2e', '#28c840'][i]}"/>`).join('');
    if (web) out += `<rect x="${n(b.x + 60)}" y="${n(b.y + 5)}" width="${n(Math.max(20, b.w - 80))}" height="16" rx="8" fill="#ffffff" ${lineAttrs(st)}/>` + textLine(wfName(el), b.x + 70, b.y + 17, { ...base(st), size: st.size - 2 });
    else out += textLine(wfName(el), b.x + b.w / 2, b.y + 17, { ...base(st), anchor: 'middle', size: st.size - 1 });
    return out;
  }, () => ({ w: 480, h: 320 })),
  wfMobile: wf((ctx, v, el, b, st) => rectSvg(b, { ...st, lineWidth: 3 }, { r: 22 }) + `<rect x="${n(b.x + b.w / 2 - 24)}" y="${n(b.y + 8)}" width="48" height="8" rx="4" fill="${esc(st.line)}"/>` + textLine(wfName(el), b.x + b.w / 2, b.y + 34, { ...base(st), anchor: 'middle', size: st.size - 1 }), () => ({ w: 220, h: 420 })),
  wfPanel: wf((ctx, v, el, b, st) => rectSvg(b, st, { r: 4 }) + (el.name ? `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="24" fill="${esc(shade(st.fill, -0.06))}" ${lineAttrs(st)}/>${textLine(el.name, b.x + 8, b.y + 16, { ...base(st), bold: true, size: st.size - 1 })}` : ''), () => ({ w: 240, h: 160 })),
  wfButton: wf((ctx, v, el, b, st) => rectSvg(b, { ...st, fill: v.fillColor || (el.disabled ? '#e5e7eb' : '#3b82f6'), line: v.lineColor || '#2563eb' }, { r: 6 }) + textLine(wfName(el), b.x + b.w / 2, b.y + b.h / 2 + st.size * 0.36, { ...base(st), anchor: 'middle', color: v.fontColor || (el.disabled ? '#9ca3af' : '#ffffff') }), (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: wfName(el) }], { minW: 70, minH: 30, padY: 6 })),
  wfText: wf((ctx, v, el, b, st) => textStack(String(el.name ?? '').split('\n').map((t) => ({ text: t, align: 'left', wrap: true })), b.x, b.y + 2, b.w, base(st), ctx.measure, { padX: 2 }).svg, (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: wfName(el) }], { padX: 2, padY: 2, minW: 20, minH: 18 })),
  wfLink: wf((ctx, v, el, b, st) => textLine(wfName(el), b.x + 2, b.y + b.h / 2 + st.size * 0.36, { ...base(st), color: v.fontColor || '#1a66cc', underline: true }), (ctx, v, el, st) => sizeOfText(ctx, st, [{ text: wfName(el) }], { padX: 2, padY: 2, minW: 20, minH: 18 })),
  wfInput: wf((ctx, v, el, b, st) => rectSvg(b, st, { r: 4 }) + textLine(wfName(el), b.x + 8, b.y + b.h / 2 + st.size * 0.36, { ...base(st), color: v.fontColor || '#9ca3af' }), () => ({ w: 180, h: 30 })),
  wfTextArea: wf((ctx, v, el, b, st) => rectSvg(b, st, { r: 4 }) + textLine(wfName(el), b.x + 8, b.y + st.size + 6, { ...base(st), color: v.fontColor || '#9ca3af' }) + strokeSvg(`M${n(b.x + b.w - 10)} ${n(b.y + b.h - 4)}l6 -6M${n(b.x + b.w - 6)} ${n(b.y + b.h - 4)}l2 -2`, st), () => ({ w: 220, h: 90 })),
  wfCheckbox: wf((ctx, v, el, b, st) => `<rect x="${n(b.x)}" y="${n(b.y + b.h / 2 - 7)}" width="14" height="14" rx="2" fill="${el.checked ? '#3b82f6' : esc(st.fill)}" ${lineAttrs(st)}/>${el.checked ? strokeSvg(`M${n(b.x + 3)} ${n(b.y + b.h / 2)}l3 3l5 -6`, { ...st, line: '#ffffff', lineWidth: 2 }) : ''}${textLine(wfName(el), b.x + 20, b.y + b.h / 2 + st.size * 0.36, base(st))}`, (ctx, v, el, st) => ({ w: Math.ceil(ctx.measure(wfName(el), { fontSize: st.size }) + 26), h: 22 })),
  wfRadio: wf((ctx, v, el, b, st) => circleAt(b.x + 7, b.y + b.h / 2, 7, { ...st, shadow: false }) + (el.checked ? circleAt(b.x + 7, b.y + b.h / 2, 3.5, { ...st, fill: '#3b82f6', line: '#3b82f6', shadow: false }) : '') + textLine(wfName(el), b.x + 20, b.y + b.h / 2 + st.size * 0.36, base(st)), (ctx, v, el, st) => ({ w: Math.ceil(ctx.measure(wfName(el), { fontSize: st.size }) + 26), h: 22 })),
  wfSwitch: wf((ctx, v, el, b, st) => `<rect x="${n(b.x)}" y="${n(b.y + b.h / 2 - 9)}" width="34" height="18" rx="9" fill="${el.checked ? '#3b82f6' : '#d1d5db'}"/>${circleAt(b.x + (el.checked ? 25 : 9), b.y + b.h / 2, 7, { ...st, fill: '#ffffff', line: '#ffffff', shadow: false })}${textLine(wfName(el), b.x + 42, b.y + b.h / 2 + st.size * 0.36, base(st))}`, (ctx, v, el, st) => ({ w: Math.ceil(ctx.measure(wfName(el), { fontSize: st.size }) + 48), h: 24 })),
  wfDropdown: wf((ctx, v, el, b, st) => rectSvg(b, st, { r: 4 }) + textLine(wfName(el) || items(el)[0] || '', b.x + 8, b.y + b.h / 2 + st.size * 0.36, base(st)) + strokeSvg(`M${n(b.x + b.w - 18)} ${n(b.y + b.h / 2 - 2)}l4 4l4 -4`, st), () => ({ w: 160, h: 30 })),
  wfSlider: wf((ctx, v, el, b, st) => `<rect x="${n(b.x)}" y="${n(b.y + b.h / 2 - 2)}" width="${n(b.w)}" height="4" rx="2" fill="#d1d5db"/><rect x="${n(b.x)}" y="${n(b.y + b.h / 2 - 2)}" width="${n(b.w * 0.4)}" height="4" rx="2" fill="#3b82f6"/>${circleAt(b.x + b.w * 0.4, b.y + b.h / 2, 8, { ...st, fill: '#ffffff', shadow: false })}`, () => ({ w: 160, h: 24 })),
  wfTabs: wf((ctx, v, el, b, st) => {
    const list = items(el).length ? items(el) : [wfName(el) || 'Tab 1', 'Tab 2', 'Tab 3'];
    const w = b.w / list.length;
    return list.map((name, i) => `<rect x="${n(b.x + i * w)}" y="${n(b.y)}" width="${n(w)}" height="${n(b.h)}" fill="${i === 0 ? esc(st.fill) : esc(shade(st.fill, -0.07))}" ${lineAttrs(st)}/>${textLine(name, b.x + i * w + w / 2, b.y + b.h / 2 + st.size * 0.36, { ...base(st), anchor: 'middle', bold: i === 0 })}`).join('');
  }, () => ({ w: 300, h: 32 })),
  wfImage: wf((ctx, v, el, b, st) => rectSvg(b, { ...st, fill: '#f3f4f6' }) + strokeSvg(`M${n(b.x)} ${n(b.y)}L${n(b.x + b.w)} ${n(b.y + b.h)}M${n(b.x + b.w)} ${n(b.y)}L${n(b.x)} ${n(b.y + b.h)}`, { ...st, line: '#9ca3af' }), () => ({ w: 140, h: 100 })),
  wfAvatar: wf((ctx, v, el, b, st) => ellipse(b, { ...st, fill: '#e5e7eb' }) + circleAt(b.x + b.w / 2, b.y + b.h * 0.4, b.w * 0.17, { ...st, fill: '#9ca3af', line: '#9ca3af', shadow: false }) + `<path d="M${n(b.x + b.w * 0.22)} ${n(b.y + b.h * 0.82)}a${n(b.w * 0.28)} ${n(b.h * 0.22)} 0 0 1 ${n(b.w * 0.56)} 0" fill="#9ca3af"/>`, () => ({ w: 48, h: 48 }), 'ellipse'),
  wfList: wf((ctx, v, el, b, st) => {
    const list = items(el).length ? items(el) : ['Item 1', 'Item 2', 'Item 3'];
    const h = b.h / list.length;
    return rectSvg(b, st) + list.map((name, i) => (i ? hline(b.x, b.x + b.w, b.y + i * h, st) : '') + textLine(name, b.x + 10, b.y + i * h + h / 2 + st.size * 0.36, base(st))).join('');
  }, () => ({ w: 200, h: 96 })),
  wfTable: wf((ctx, v, el, b, st) => {
    const cols = items(el).length ? items(el) : ['A', 'B', 'C'];
    const rows = 4; const cw = b.w / cols.length; const rh = b.h / rows;
    let out = rectSvg(b, st) + `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(rh)}" fill="${esc(shade(st.fill, -0.07))}" ${lineAttrs(st)}/>`;
    cols.forEach((c, i) => { if (i) out += strokeSvg(`M${n(b.x + i * cw)} ${n(b.y)}V${n(b.y + b.h)}`, st); out += textLine(c, b.x + i * cw + 6, b.y + rh / 2 + st.size * 0.36, { ...base(st), bold: true }); });
    for (let r = 1; r < rows; r += 1) out += hline(b.x, b.x + b.w, b.y + r * rh, st);
    return out;
  }, () => ({ w: 300, h: 120 })),
  wfDivider: wf((ctx, v, el, b, st) => hline(b.x, b.x + b.w, b.y + b.h / 2, st), () => ({ w: 200, h: 10 })),
  wfProgress: wf((ctx, v, el, b, st) => `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(b.h / 2)}" fill="#e5e7eb"/><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w * 0.6)}" height="${n(b.h)}" rx="${n(b.h / 2)}" fill="#3b82f6"/>`, () => ({ w: 200, h: 12 })),
  wfIcon: wf((ctx, v, el, b, st) => pathSvg(`M${n(b.x + b.w / 2)} ${n(b.y)}L${n(b.x + b.w * 0.62)} ${n(b.y + b.h * 0.36)}H${n(b.x + b.w)}L${n(b.x + b.w * 0.69)} ${n(b.y + b.h * 0.58)}L${n(b.x + b.w * 0.81)} ${n(b.y + b.h)}L${n(b.x + b.w / 2)} ${n(b.y + b.h * 0.76)}L${n(b.x + b.w * 0.19)} ${n(b.y + b.h)}L${n(b.x + b.w * 0.31)} ${n(b.y + b.h * 0.58)}L${n(b.x)} ${n(b.y + b.h * 0.36)}H${n(b.x + b.w * 0.38)}Z`, { ...st, fill: v.fillColor || '#fbbf24', shadow: false }), () => ({ w: 24, h: 24 })),
});

// Gantt, WBS, timeline, ArchiMate, network, JSON/YAML and railroad shapes (shapes-more.js).
Object.assign(SHAPES, MORE_SHAPES);

// ───────────────────────── helpers used above

export function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  const r = ch(v >> 16); const g = ch((v >> 8) & 255); const b = ch(v & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const isLollipop = (v, el) => el._type === 'UMLInterface' && v.stereotypeDisplay === 'icon';
/** StarUML's icons of the robustness stereotypes: a class «boundary», «control» or «entity» shown as an icon. */
const ROBUSTNESS = new Set(['boundary', 'control', 'entity']);
const robustnessOf = (ctx, v, el) => {
  if (v.stereotypeDisplay !== 'icon' || el?._type !== 'UMLClass') return '';
  const kind = stereotypeText(el, ctx.index, { keyword: false }).replace(/[«»]/g, '').trim().toLowerCase();
  return ROBUSTNESS.has(kind) ? kind : '';
};
function robustnessSize(ctx, v, el, st) {
  return { w: Math.max(56, Math.ceil(ctx.measure(el.name ?? '', { fontSize: st.size, bold: true }) + 8)), h: 44 + st.size + 6 };
}
function robustnessDraw(ctx, v, el, b, st, kind) {
  const r = 18;
  const cx = b.x + b.w / 2 + (kind === 'boundary' ? 8 : 0);
  const cy = b.y + 4 + r;
  let svg = circleAt(cx, cy, r, st);
  if (kind === 'boundary') svg += strokeSvg(`M${n(cx - r - 16)} ${n(cy - r)}V${n(cy + r)}M${n(cx - r - 16)} ${n(cy)}H${n(cx - r)}`, st);
  if (kind === 'control') svg += strokeSvg(`M${n(cx + 2)} ${n(cy - r - 5)}L${n(cx - 5)} ${n(cy - r)}L${n(cx + 2)} ${n(cy - r + 5)}`, st);
  if (kind === 'entity') svg += strokeSvg(`M${n(cx - r)} ${n(cy + r)}H${n(cx + r)}`, st);
  return svg + textLine(el.name, b.x + b.w / 2, b.y + b.h - 3, { ...base(st), anchor: 'middle', bold: true, italic: el.isAbstract });
}
function decorationIcon(el, b, st) {
  const x = b.x + b.w - 18; const y = b.y + 6;
  if (el._type === 'UMLInterface') return circleAt(x + 6, y + 6, 6, { ...st, shadow: false });
  if (el._type === 'UMLEnumeration') return strokeSvg(`M${n(x)} ${n(y + 2)}h12M${n(x)} ${n(y + 6)}h12M${n(x)} ${n(y + 10)}h12`, st);
  return '';
}
function useCaseLines(ctx, v, el, st) {
  const lines = headerLines(ctx, v, el, st, { bold: false, italic: el.isAbstract }).map((l) => ({ ...l, wrap: true }));
  if (el.extensionPoints?.length && !v.suppressExtensionPoints) {
    lines.push({ text: 'extension points', size: st.size - 2, italic: true });
    for (const ep of el.extensionPoints) lines.push({ text: ep.name, size: st.size - 1 });
  }
  return lines;
}
function partText(ctx, el) {
  const type = typeName(el.type, ctx.index);
  return `${el.name ?? ''}${type ? ` : ${type}` : ''}${el.multiplicity ? ` [${el.multiplicity}]` : ''}`;
}
const constraintText = (el) => `{${el.specification || el.name || ''}}`;
function lifelineLines(ctx, v, el, st) {
  const lines = [];
  const stereo = v.stereotypeDisplay !== 'none' ? stereotypeText(el, ctx.index, { keyword: false }) : '';
  if (stereo) lines.push({ text: stereo, size: st.size - 1 });
  lines.push({ text: lifelineText(el, ctx.index), underline: false, bold: st.bold });
  return lines;
}
const representsActor = (ctx, el) => {
  const rep = ctx.index?.get(refId(el.represent));
  const type = rep && rep.type && typeof rep.type === 'object' ? ctx.index.get(refId(rep.type)) : null;
  return type?._type === 'UMLActor' || rep?._type === 'UMLActor';
};
function interactionUseText(ctx, el) {
  const target = ctx.index?.get(refId(el.refersTo));
  return `${el.returnValue ? `${el.returnValue} = ` : ''}${target?.name ?? el.name ?? ''}${el.arguments ? `(${el.arguments})` : ''}`;
}
/** Vertical bands of the operands of a combined fragment (view.operandRatios: fractions). */
export function operandBounds(v, b, count, tagH = 0) {
  const k = Math.max(1, count);
  const ratios = Array.isArray(v.operandRatios) && v.operandRatios.length === k ? v.operandRatios : Array.from({ length: k }, () => 1 / k);
  const out = [];
  let y = b.y;
  ratios.forEach((r, i) => { const h = b.h * r; out.push({ y, h: i === 0 ? h : h }); y += h; });
  return out.length ? out : [{ y: b.y + tagH, h: b.h - tagH }];
}
function timingDraw(ctx, v, el, b, st) {
  const states = String(el.states || 'Idle,Busy').split(',').map((s) => s.trim()).filter(Boolean);
  const labelW = Math.min(120, Math.max(60, ctx.measure(el.name ?? '', { fontSize: st.size, bold: true }) + 16));
  const stateW = Math.max(40, ...states.map((s) => ctx.measure(s, { fontSize: st.size - 1 }) + 12));
  let out = rectSvg(b, st);
  out += strokeSvg(`M${n(b.x + labelW)} ${n(b.y)}V${n(b.y + b.h)}`, st);
  out += `<g transform="rotate(-90 ${n(b.x + labelW / 2)} ${n(b.y + b.h / 2)})">${textLine(lifelineText(el, ctx.index), b.x + labelW / 2, b.y + b.h / 2 + st.size * 0.36, { ...base(st), anchor: 'middle', bold: true })}</g>`;
  const top = b.y + 10; const rowH = (b.h - 20) / Math.max(1, states.length);
  const yOf = (state) => { const i = Math.max(0, states.indexOf(state)); return top + rowH * i + rowH / 2; };
  states.forEach((s, i) => { out += textLine(s, b.x + labelW + stateW - 6, top + rowH * i + rowH / 2 + st.size * 0.33, { ...base(st), size: st.size - 1, anchor: 'end' }); });
  out += strokeSvg(`M${n(b.x + labelW + stateW)} ${n(b.y)}V${n(b.y + b.h)}`, st, ' stroke-dasharray="2 3"');
  const segs = el.timeSegments?.length ? el.timeSegments : [{ state: states[0], duration: 10 }, { state: states[1] ?? states[0], duration: 10 }];
  const total = segs.reduce((s, x) => s + (Number(x.duration) || 1), 0);
  const x0 = b.x + labelW + stateW + 6; const span = b.w - labelW - stateW - 12;
  let x = x0; let d = '';
  segs.forEach((seg, i) => {
    const y = yOf(seg.state);
    const w = span * ((Number(seg.duration) || 1) / total);
    d += i === 0 ? `M${n(x)} ${n(y)}` : `V${n(y)}`;
    d += `H${n(x + w)}`;
    x += w;
  });
  return out + `<path d="${d}" fill="none" stroke="${esc(st.line)}" stroke-width="2"/>`;
}
function stateParts(ctx, v, el, st) {
  const sub = ctx.index?.get(refId(el.submachine));
  const name = sub ? `${el.name ?? ''} : ${sub.name}` : el.name ?? '';
  const head = headerLines(ctx, v, el, st, { name, bold: false });
  const body = [];
  if (el.entryActivity) body.push({ text: `entry / ${el.entryActivity}`, align: 'left' });
  if (el.doActivity) body.push({ text: `do / ${el.doActivity}`, align: 'left' });
  if (el.exitActivity) body.push({ text: `exit / ${el.exitActivity}`, align: 'left' });
  for (const a of el.internalTransitions ?? []) body.push({ text: a, align: 'left' });
  return { head, body, lines: [...head, ...body] };
}
const PSEUDO_SIZE = { initial: { w: 20, h: 20 }, choice: { w: 26, h: 26 }, junction: { w: 14, h: 14 }, fork: { w: 80, h: 6 }, join: { w: 80, h: 6 }, deepHistory: { w: 26, h: 26 }, shallowHistory: { w: 26, h: 26 }, entryPoint: { w: 20, h: 20 }, exitPoint: { w: 20, h: 20 }, terminate: { w: 20, h: 20 } };
function pseudostateDraw(kind, b, st) {
  const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const r = Math.min(b.w, b.h) / 2;
  switch (kind) {
    case 'choice': return pathSvg(diamondPath(b), st);
    case 'junction': return circleAt(cx, cy, r, { ...st, fill: st.line });
    case 'fork': case 'join': return rectSvg(b, { ...st, fill: st.line });
    case 'deepHistory': case 'shallowHistory': return circleAt(cx, cy, r, st) + textLine(kind === 'deepHistory' ? 'H*' : 'H', cx, cy + 4.5, { size: 12, color: st.line, anchor: 'middle', bold: true, face: st.face });
    case 'entryPoint': return circleAt(cx, cy, r, st);
    case 'exitPoint': { const k = r * 0.7; return circleAt(cx, cy, r, st) + strokeSvg(`M${n(cx - k)} ${n(cy - k)}L${n(cx + k)} ${n(cy + k)}M${n(cx + k)} ${n(cy - k)}L${n(cx - k)} ${n(cy + k)}`, st); }
    case 'terminate': return strokeSvg(`M${n(b.x)} ${n(b.y)}L${n(b.x + b.w)} ${n(b.y + b.h)}M${n(b.x + b.w)} ${n(b.y)}L${n(b.x)} ${n(b.y + b.h)}`, { ...st, lineWidth: 2 });
    default: return circleAt(cx, cy, r, { ...st, fill: st.line });
  }
}
function actionDraw(ctx, v, el, b, st) {
  const lines = textOnly(ctx, v, el, st);
  if (el.kind === 'sendSignal') return pathSvg(`M${n(b.x)} ${n(b.y)}H${n(b.x + b.w - 16)}L${n(b.x + b.w)} ${n(b.y + b.h / 2)}L${n(b.x + b.w - 16)} ${n(b.y + b.h)}H${n(b.x)}Z`, st) + centeredText(ctx, v, el, { ...b, w: b.w - 12 }, st, lines);
  if (el.kind === 'acceptSignal') return pathSvg(`M${n(b.x)} ${n(b.y)}H${n(b.x + b.w)}V${n(b.y + b.h)}H${n(b.x)}L${n(b.x + 16)} ${n(b.y + b.h / 2)}Z`, st) + centeredText(ctx, v, el, { ...b, x: b.x + 12, w: b.w - 12 }, st, lines);
  if (el.kind === 'acceptTimeEvent') return pathSvg(`M${n(b.x)} ${n(b.y)}H${n(b.x + b.w)}L${n(b.x)} ${n(b.y + b.h)}H${n(b.x + b.w)}Z`, st) + nameBelow(ctx, v, el, b, st);
  let out = rectSvg(b, st, { r: 10 }) + centeredText(ctx, v, el, b, st, lines);
  if (el.kind === 'callBehavior' || el.kind === 'callOperation') {
    const x = b.x + b.w - 16; const y = b.y + b.h - 14;
    out += strokeSvg(`M${n(x + 5)} ${n(y)}v10M${n(x)} ${n(y + 10)}v-5h10v5`, st);
  }
  return out;
}
function objectNodeLines(ctx, v, el, st) {
  const type = typeName(el.type, ctx.index);
  const lines = headerLines(ctx, v, el, st, { name: `${el.name ?? ''}${type ? ` : ${type}` : ''}`, bold: false });
  if (el.inState) lines.push({ text: `[${el.inState}]`, size: st.size - 1 });
  if (el.upperBound) lines.push({ text: `{upperBound=${el.upperBound}}`, size: st.size - 2 });
  return lines;
}
function entityLayout(ctx, v, el, st) {
  const rows = v.suppressColumns ? [] : (el.columns ?? []).map((c) => { const t = columnText(c, ctx.index); return { keys: t.keys, name: t.name, type: t.type + (t.nullable ? '' : ''), pk: c.primaryKey }; });
  const bs = { fontSize: st.size };
  const keyW = rows.some((r) => r.keys) ? Math.max(...rows.map((r) => ctx.measure(r.keys, { fontSize: st.size - 2, bold: true }))) + 8 : 0;
  const nameW = Math.max(0, ...rows.map((r) => ctx.measure(r.name, { ...bs, bold: r.pk })));
  const typeW = Math.max(0, ...rows.map((r) => ctx.measure(r.type, bs)));
  const headerH = st.size + 14;
  const rowH = st.size + 8;
  const w = Math.max(ctx.measure(el.name ?? '', { ...bs, bold: true }) + PAD * 4, PAD * 2 + keyW + nameW + 16 + typeW, 100);
  return { rows, keyW, headerH, rowH, size: { w: Math.ceil(w), h: Math.ceil(headerH + Math.max(1, rows.length) * rowH + (rows.length ? 0 : 0)) } };
}
const dfdLines = (el, st) => [...(el.id ? [{ text: el.id, size: st.size - 1, bold: true }] : []), { text: el.name ?? '', wrap: true }];
function bandBox(ctx, b, st, name, band, lane) {
  return rectSvg(b, { ...st, fill: lane ? 'none' : st.fill, shadow: lane ? false : st.shadow }) + strokeSvg(`M${n(b.x + band)} ${n(b.y)}V${n(b.y + b.h)}`, st)
    + `<g transform="rotate(-90 ${n(b.x + band / 2)} ${n(b.y + b.h / 2)})">${textLine(name ?? '', b.x + band / 2, b.y + b.h / 2 + st.size * 0.36, { ...base(st), anchor: 'middle', bold: !lane })}</g>`;
}
function taskIcon(kind, b, st) {
  const x = b.x + 8; const y = b.y + 8;
  switch (kind) {
    case 'user': return circleAt(x + 6, y + 4, 3.5, { ...st, shadow: false }) + strokeSvg(`M${n(x)} ${n(y + 14)}a6 5 0 0 1 12 0z`, st);
    case 'service': return circleAt(x + 6, y + 6, 5, { ...st, shadow: false }) + circleAt(x + 6, y + 6, 2, { ...st, shadow: false });
    case 'script': return strokeSvg(`M${n(x + 2)} ${n(y)}h9q-3 4 0 7t0 7h-9q3 -4 0 -7t0 -7zM${n(x + 4)} ${n(y + 4)}h4M${n(x + 4)} ${n(y + 7)}h4M${n(x + 4)} ${n(y + 10)}h4`, st);
    case 'manual': return strokeSvg(`M${n(x)} ${n(y + 6)}h8v8h-6l-2-2zM${n(x + 2)} ${n(y + 6)}l4 -4h6`, st);
    case 'send': return `<path d="M${n(x)} ${n(y + 2)}h14v10h-14z" fill="${esc(st.line)}"/>` + strokeSvg(`M${n(x)} ${n(y + 2)}l7 5l7 -5`, { ...st, line: '#ffffff' });
    case 'receive': return strokeSvg(`M${n(x)} ${n(y + 2)}h14v10h-14zM${n(x)} ${n(y + 2)}l7 5l7 -5`, st);
    case 'businessRule': return strokeSvg(`M${n(x)} ${n(y)}h14v12h-14zM${n(x)} ${n(y + 4)}h14M${n(x + 4)} ${n(y + 4)}v8`, st);
    default: return '';
  }
}
function loopMarker(loop, b, st) {
  const x = b.x + b.w / 2; const y = b.y + b.h - 12;
  if (loop === 'standard') return strokeSvg(`M${n(x + 4)} ${n(y + 6)}a5 5 0 1 0 -6 1M${n(x - 2)} ${n(y + 7)}l-1 -4M${n(x - 2)} ${n(y + 7)}l-4 1`, st);
  if (loop === 'parallel') return strokeSvg(`M${n(x - 5)} ${n(y)}v9M${n(x)} ${n(y)}v9M${n(x + 5)} ${n(y)}v9`, st);
  if (loop === 'sequential') return strokeSvg(`M${n(x - 5)} ${n(y)}h10M${n(x - 5)} ${n(y + 4.5)}h10M${n(x - 5)} ${n(y + 9)}h10`, st);
  return '';
}
function eventDraw(kind, el, b, st) {
  const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const r = Math.min(b.w, b.h) / 2;
  let out = '';
  const dash = (kind === 'start' && el.isInterrupting === false) || (kind === 'boundary' && el.cancelActivity === false) ? '4 3' : '';
  if (kind === 'end') out += circleAt(cx, cy, r, { ...st, lineWidth: 3.5 });
  else out += circleAt(cx, cy, r, { ...st, lineWidth: 1.4 }, { dash });
  if (kind === 'intermediate' || kind === 'boundary') out += circleAt(cx, cy, r - 3.5, { ...st, shadow: false, fill: 'none' }, { dash });
  const filled = kind === 'end' || el.isThrowing;
  return out + eventMark(el.eventKind, cx, cy, r * 0.55, st, filled);
}
function eventMark(kind, cx, cy, s, st, filled) {
  const f = filled ? st.line : 'none';
  const p = (d) => `<path d="${d}" fill="${esc(f)}" stroke="${esc(st.line)}" stroke-width="1.2" stroke-linejoin="round"/>`;
  switch (kind) {
    case 'message': return p(`M${n(cx - s)} ${n(cy - s * 0.65)}h${n(2 * s)}v${n(1.3 * s)}h${n(-2 * s)}z`) + strokeSvg(`M${n(cx - s)} ${n(cy - s * 0.65)}l${n(s)} ${n(s * 0.7)}l${n(s)} ${n(-s * 0.7)}`, { ...st, line: filled ? '#ffffff' : st.line });
    case 'timer': return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s)}" fill="none" stroke="${esc(st.line)}"/>` + strokeSvg(`M${n(cx)} ${n(cy)}V${n(cy - s * 0.75)}M${n(cx)} ${n(cy)}L${n(cx + s * 0.5)} ${n(cy + s * 0.2)}`, st);
    case 'error': return p(`M${n(cx - s)} ${n(cy + s)}L${n(cx - s * 0.4)} ${n(cy - s)}L${n(cx + s * 0.2)} ${n(cy + s * 0.2)}L${n(cx + s)} ${n(cy - s)}L${n(cx + s * 0.4)} ${n(cy + s)}L${n(cx - s * 0.2)} ${n(cy - s * 0.2)}Z`);
    case 'signal': return p(`M${n(cx)} ${n(cy - s)}L${n(cx + s)} ${n(cy + s * 0.75)}H${n(cx - s)}Z`);
    case 'escalation': return p(`M${n(cx)} ${n(cy - s)}L${n(cx + s * 0.7)} ${n(cy + s)}L${n(cx)} ${n(cy + s * 0.3)}L${n(cx - s * 0.7)} ${n(cy + s)}Z`);
    case 'terminate': return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s)}" fill="${esc(st.line)}"/>`;
    case 'cancel': return strokeSvg(`M${n(cx - s)} ${n(cy - s)}L${n(cx + s)} ${n(cy + s)}M${n(cx + s)} ${n(cy - s)}L${n(cx - s)} ${n(cy + s)}`, { ...st, lineWidth: 2.5 });
    case 'compensation': return p(`M${n(cx)} ${n(cy - s * 0.6)}L${n(cx - s)} ${n(cy)}L${n(cx)} ${n(cy + s * 0.6)}ZM${n(cx + s)} ${n(cy - s * 0.6)}L${n(cx)} ${n(cy)}L${n(cx + s)} ${n(cy + s * 0.6)}Z`);
    case 'conditional': return `<rect x="${n(cx - s * 0.7)}" y="${n(cy - s)}" width="${n(s * 1.4)}" height="${n(2 * s)}" fill="none" stroke="${esc(st.line)}"/>` + strokeSvg(`M${n(cx - s * 0.4)} ${n(cy - s * 0.5)}h${n(s * 0.8)}M${n(cx - s * 0.4)} ${n(cy)}h${n(s * 0.8)}M${n(cx - s * 0.4)} ${n(cy + s * 0.5)}h${n(s * 0.8)}`, st);
    case 'link': return p(`M${n(cx - s)} ${n(cy - s * 0.35)}h${n(s)}v${n(-s * 0.5)}l${n(s)} ${n(s * 0.85)}l${n(-s)} ${n(s * 0.85)}v${n(-s * 0.5)}h${n(-s)}z`);
    case 'multiple': return p(`M${n(cx)} ${n(cy - s)}L${n(cx + s)} ${n(cy - s * 0.2)}L${n(cx + s * 0.6)} ${n(cy + s)}H${n(cx - s * 0.6)}L${n(cx - s)} ${n(cy - s * 0.2)}Z`);
    default: return '';
  }
}
function gatewayMark(mark, b, st) {
  const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const s = b.w * 0.2;
  switch (mark) {
    case 'x': return strokeSvg(`M${n(cx - s)} ${n(cy - s)}L${n(cx + s)} ${n(cy + s)}M${n(cx + s)} ${n(cy - s)}L${n(cx - s)} ${n(cy + s)}`, { ...st, lineWidth: 3 });
    case '+': return strokeSvg(`M${n(cx)} ${n(cy - s * 1.2)}V${n(cy + s * 1.2)}M${n(cx - s * 1.2)} ${n(cy)}H${n(cx + s * 1.2)}`, { ...st, lineWidth: 3 });
    case 'o': return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s * 1.1)}" fill="none" stroke="${esc(st.line)}" stroke-width="2.5"/>`;
    case 'e': return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s * 1.2)}" fill="none" stroke="${esc(st.line)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s * 0.95)}" fill="none" stroke="${esc(st.line)}"/>` + eventMark('multiple', cx, cy, s * 0.6, st, false);
    case '*': return strokeSvg(`M${n(cx)} ${n(cy - s * 1.2)}V${n(cy + s * 1.2)}M${n(cx - s * 1.2)} ${n(cy)}H${n(cx + s * 1.2)}M${n(cx - s * 0.85)} ${n(cy - s * 0.85)}L${n(cx + s * 0.85)} ${n(cy + s * 0.85)}M${n(cx + s * 0.85)} ${n(cy - s * 0.85)}L${n(cx - s * 0.85)} ${n(cy + s * 0.85)}`, { ...st, lineWidth: 2.5 });
    default: return '';
  }
}
function cylinder(b, st) {
  const ry = Math.min(10, b.h * 0.15);
  return pathSvg(`M${n(b.x)} ${n(b.y + ry)}A${n(b.w / 2)} ${n(ry)} 0 0 1 ${n(b.x + b.w)} ${n(b.y + ry)}V${n(b.y + b.h - ry)}A${n(b.w / 2)} ${n(ry)} 0 0 1 ${n(b.x)} ${n(b.y + b.h - ry)}Z`, st)
    + strokeSvg(`M${n(b.x)} ${n(b.y + ry)}A${n(b.w / 2)} ${n(ry)} 0 0 0 ${n(b.x + b.w)} ${n(b.y + ry)}`, st);
}
const C4_COLORS = { C4Person: '#08427b', C4SoftwareSystem: '#1168bd', C4Container: '#438dd5', C4ContainerDatabase: '#438dd5', C4Component: '#85bbf0' };
const c4Color = (el, st) => (st.userFill ? st.fill : el.external ? '#999999' : C4_COLORS[el._type] ?? '#1168bd');
const c4Kind = (el) => ({ C4SoftwareSystem: 'Software System', C4Container: 'Container', C4Component: 'Component' }[el._type] ?? '');
function c4Lines(el, st, kind) {
  const tech = el.technology ? `${kind}: ${el.technology}` : kind;
  return [{ text: el.name ?? '', bold: true, wrap: true }, { text: `[${el.external ? `External ${tech}` : tech}]`, size: st.size - 2 }, ...(el.description ? [{ text: el.description, size: st.size - 1, wrap: true }] : [])];
}
function isMindRoot(ctx, el) { return ctx.index?.parent(el._id)?._type !== 'MMNode'; }
const MIND = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fecaca', '#ddd6fe', '#fbcfe8', '#a5f3fc'];
function mindColor(ctx, el) {
  let top = el;
  for (let p = ctx.index?.parent(el._id); p && p._type === 'MMNode' && ctx.index.parent(p._id)?._type === 'MMNode'; p = ctx.index.parent(p._id)) top = p;
  const root = ctx.index?.parent(top._id);
  const i = Math.max(0, (root?.ownedElements ?? []).indexOf(top));
  return MIND[i % MIND.length];
}
function noteLines(v, align = 'left') { return String(v.text ?? '').split('\n').map((t) => ({ text: t, align })); }
function notePath(b, st) {
  const f = 10;
  return pathSvg(`M${n(b.x)} ${n(b.y)}H${n(b.x + b.w - f)}L${n(b.x + b.w)} ${n(b.y + f)}V${n(b.y + b.h)}H${n(b.x)}Z`, st) + strokeSvg(`M${n(b.x + b.w - f)} ${n(b.y)}V${n(b.y + f)}H${n(b.x + b.w)}`, st);
}

export { headerLines, wrapText };
