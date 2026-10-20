// Map layout: where every visible topic goes and the lines between them.
//
// The central topic sits with its centre at (0, 0). Each topic is first sized
// from its content (picture, icons, wrapped text, badges, tags, task line),
// then every subtree is laid out bottom-up as a block relative to its own
// topic — the block knows its bounding box — and the parent stacks its
// children's blocks in the direction it grows:
//
//   right / left        children in a column beside the topic (map branches)
//   down / up           children in a row under / over it (org chart)
//   treeRight/treeLeft  an indented list under it (tree, outline-like)
//   timeline            (central topic) main topics in a row on an axis
//   fishbone            (central topic) main topics on slanted bones above
//                       and below a spine running left from the head
//
// A final pass turns the relative offsets into absolute positions and draws
// the connecting lines (curve · straight · elbow · rounded, tapered from the
// central topic), boundaries and the collapse handles. Pure: the caller
// passes the text measurer, so tests run without a browser.
import { topicStyle } from './mapstyles.js';
import { topicMarkers } from './markers.js';
import { numberingOf } from './model.js';
import { shapeGrow, SHAPE_DEFS, ROUND_SHAPES } from './shapes.js';

export const FOLD_R = 7;
const BOUNDARY_PAD = 12;
const FISH_DIRS = new Set(['fishbone', 'fishTop', 'fishBottom']);
const BADGE_KEYS = ['notes', 'comments', 'link', 'attachments'];

// ── text ──

const measureCache = new Map();
function cachedMeasure(measure, text, font) {
  const key = `${font}\u0000${text}`;
  let w = measureCache.get(key);
  if (w === undefined) {
    w = measure(text, font);
    if (measureCache.size > 20000) measureCache.clear();
    measureCache.set(key, w);
  }
  return w;
}

export function fontString(st, size = st.fontSize, family = st.font) {
  const fam = family || "-apple-system, 'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', Roboto, sans-serif";
  return `${st.italic ? 'italic ' : ''}${st.bold ? '700' : '400'} ${size}px ${fam}`;
}

// Greedy word wrap; a word wider than the line is broken between characters.
export function wrapText(text, maxW, font, measure) {
  const out = [];
  const m = (s) => cachedMeasure(measure, s, font);
  for (const para of String(text).split('\n')) {
    if (!para) { out.push({ text: '', w: 0 }); continue; }
    const tokens = para.match(/\S+\s*|\s+/g) || [para];
    let line = '';
    for (const tok of tokens) {
      const cand = line + tok;
      if (!line || m(cand.trimEnd()) <= maxW) {
        if (!line && m(tok.trimEnd()) > maxW) {
          // A single long word: break it by characters.
          let piece = '';
          for (const ch of tok) {
            if (piece && m(piece + ch) > maxW) { out.push({ text: piece, w: m(piece) }); piece = ch; }
            else piece += ch;
          }
          line = piece;
        } else line = cand;
      } else {
        const t = line.trimEnd();
        out.push({ text: t, w: m(t) });
        if (m(tok.trimEnd()) > maxW) {
          let piece = '';
          for (const ch of tok) {
            if (piece && m(piece + ch) > maxW) { out.push({ text: piece, w: m(piece) }); piece = ch; }
            else piece += ch;
          }
          line = piece;
        } else line = tok;
      }
    }
    const t = line.trimEnd();
    out.push({ text: t, w: m(t) });
  }
  return out;
}

function shortDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${Number(m[2])}/${Number(m[3])}` : '';
}

export function taskLine(task, lang = 'ko') {
  if (!task) return '';
  const parts = [];
  if (task.start || task.due) parts.push(task.start && task.due ? `${shortDate(task.start)} → ${shortDate(task.due)}` : task.due ? `${lang === 'ko' ? '마감' : 'Due'} ${shortDate(task.due)}` : `${lang === 'ko' ? '시작' : 'Start'} ${shortDate(task.start)}`);
  if (task.effort) parts.push(`${task.effort}${lang === 'ko' ? '시간' : 'h'}`);
  if (task.resources) parts.push(String(task.resources));
  const s = parts.join(' · ');
  return task.milestone ? `◆${s ? ` ${s}` : ''}` : s;
}

// Sizes a topic and places its content inside the box (coordinates relative to the box).
export function measureTopic(topic, st, { measure, prefix = '', lang = 'ko', mirror = false }) {
  const fs = st.fontSize;
  const font = fontString(st);
  const lineH = Math.round(fs * 1.32 * 10) / 10;
  const role = st.role;
  let maxW = st.width || (role === 'root' ? 300 : role === 'main' ? 250 : 230);
  const text = `${prefix ? `${prefix} ` : ''}${topic.text || ''}`;
  // round and pointed shapes (circle, ellipse, diamond, star …) wrap their text into a squarer block,
  // or one long line makes the whole shape huge
  if (!st.width && ROUND_SHAPES.has(st.shape)) {
    const one = cachedMeasure(measure, text.replace(/\n/g, ' '), font);
    maxW = Math.min(maxW, Math.max(fs * 5, Math.sqrt(one * lineH * (st.shape === 'circle' ? 1.2 : 2.6))));
  }
  let lines = wrapText(text, maxW, font, measure);
  const empty = !String(topic.text || '').trim() && !prefix;
  if (empty) lines = [{ text: '', w: 0 }];
  const textW = Math.max(empty ? fs * 2.2 : 0, ...lines.map((l) => l.w));
  const textH = lines.length * lineH;
  const icons = topicMarkers(topic);
  const iconSize = Math.round(fs * 1.2);
  const iconsW = icons.length ? icons.length * iconSize + (icons.length - 1) * 3 : 0;
  const badges = BADGE_KEYS.filter((k) => (k === 'attachments' || k === 'comments' ? (topic[k] || []).length : !!topic[k] && (k !== 'link' || topic.link.url)));
  const badgeSize = Math.round(fs * 0.95);
  const badgesW = badges.length ? badges.length * badgeSize + (badges.length - 1) * 2 : 0;
  const rowW = iconsW + (iconsW ? 5 : 0) + textW + (badgesW ? 5 : 0) + badgesW;
  const rowH = Math.max(textH, icons.length ? iconSize : 0, badges.length ? badgeSize : 0);

  let image = null;
  if (topic.image && topic.image.src) {
    const iw0 = Number(topic.image.w) || 160, ih0 = Number(topic.image.h) || 120;
    const iw = Math.min(iw0, 480), ih = ih0 * (iw / iw0);
    image = { w: iw, h: ih };
  }
  const tagFs = Math.max(9, Math.round(fs * 0.72));
  const tagFont = `500 ${tagFs}px ${st.font || "-apple-system, 'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', sans-serif"}`;
  const tags = (topic.tags || []).map((g) => ({ text: g, w: cachedMeasure(measure, g, tagFont) + tagFs * 1.1 }));
  const tagsW = tags.length ? tags.reduce((s, g) => s + g.w, 0) + (tags.length - 1) * 4 : 0;
  const tagH = tags.length ? Math.round(tagFs * 1.55) : 0;
  const task = taskLine(topic.task, lang);
  const taskFs = tagFs;
  const taskFont = `400 ${taskFs}px ${st.font || "-apple-system, 'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', sans-serif"}`;
  const taskW = task ? cachedMeasure(measure, task, taskFont) : 0;
  const taskH = task ? Math.round(taskFs * 1.4) : 0;

  const gap = 4;
  const contentW = Math.max(rowW, image ? image.w : 0, tagsW, taskW);
  const contentH = (image ? image.h + gap : 0) + rowH + (tags.length ? gap + tagH : 0) + (task ? gap + taskH : 0);

  let px, py;
  if (st.shape === 'underline' || st.shape === 'none') { px = 3; py = 3; }
  else if (role === 'root') { px = Math.round(fs * 1.15); py = Math.round(fs * 0.7); }
  else if (role === 'main') { px = Math.round(fs * 0.85); py = Math.round(fs * 0.45); }
  else { px = Math.round(fs * 0.65); py = Math.round(fs * 0.32); }
  let w = contentW + px * 2;
  let h = contentH + py * 2 + (st.shape === 'underline' ? st.borderWidth : 0);
  [w, h] = shapeGrow(st.shape, w, h);
  const minW = role === 'root' ? 96 : role === 'main' ? 44 : 28;
  w = Math.max(minW, w);
  h = Math.max(lineH + (st.shape === 'underline' || st.shape === 'none' ? 6 : 8), h);
  w = Math.ceil(w); h = Math.ceil(h);

  // place the content in the box
  // a shape may hold its text off the centre (the body of a speech bubble, the front of a cube …)
  const tx = (SHAPE_DEFS[st.shape] && SHAPE_DEFS[st.shape].text) || { dx: 0, dy: 0 };
  const cx0 = (w - contentW) / 2 + tx.dx * w;
  let y = (h - contentH) / 2 + tx.dy * h - (st.shape === 'underline' ? st.borderWidth / 2 : 0);
  const round = ROUND_SHAPES.has(st.shape);
  // left-aligned text (underline / plain topics) is right-aligned on a branch growing to the left
  const align = round ? 'center' : st.align === 'left' && mirror && !(topic.style && topic.style.align) ? 'right' : st.align === 'right' ? 'right' : st.align === 'left' ? 'left' : 'center';
  const flat = st.shape === 'underline' || st.shape === 'none';
  const rowX = (rw) => (align === 'left' ? (flat ? px : cx0) : align === 'right' ? (flat ? w - px - rw : cx0 + contentW - rw) : cx0 + (contentW - rw) / 2);
  const out = { w, h, font, lineH, lines, fontSize: fs, icons, iconSize, badges, badgeSize, tags, tagFs, tagH, task, taskFs, align };
  if (image) { out.image = { x: rowX(image.w), y, w: image.w, h: image.h }; y += image.h + gap; }
  const rx = rowX(rowW);
  out.iconsX = rx;
  out.iconsY = y + (rowH - iconSize) / 2;
  out.textX = rx + iconsW + (iconsW ? 5 : 0);
  out.textY = y + (rowH - textH) / 2;
  out.textW = textW;
  out.textH = textH;
  out.badgesX = out.textX + textW + 5;
  out.badgesY = y + (rowH - badgeSize) / 2;
  y += rowH;
  if (tags.length) { y += gap; out.tagsX = rowX(tagsW); out.tagsY = y; y += tagH; }
  if (task) { y += gap; out.taskX = rowX(taskW); out.taskY = y; out.taskW = taskW; }
  return out;
}

// ── layout ──

function rootDir(layout) {
  return { map: 'map', right: 'right', left: 'left', orgDown: 'down', orgUp: 'up', treeRight: 'treeRight', treeLeft: 'treeLeft', timeline: 'timeline', fishbone: 'fishbone' }[layout] || 'map';
}

const unionBox = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const shiftBox = (b, dx, dy) => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });

// anchor y of a topic's connecting edge: the underline of an underline topic, else the middle
const anchorY = (n) => (n.st.shape === 'underline' ? n.h - n.st.borderWidth / 2 : n.h / 2);

/**
 * opts: { ms (resolved map style), measure(text, font) → px, baseSize, mapFont, lang,
 *         hidden: Set of ids not drawn (filter), focusId: lay out only that branch, autoBalance }
 * → { nodes: Map(id → node), order: [node], lines: [line], boundaries: [b], extras: [path], bounds }
 */
export function layoutMap(map, opts) {
  const { ms, measure, baseSize = 14, mapFont = '', lang = 'ko', hidden = null, focusId = null, autoBalance = true } = opts;
  const sp = map.spacing || { h: 1, v: 1 };
  const H = Math.max(0.3, Number(sp.h) || 1), V = Math.max(0.3, Number(sp.v) || 1);
  const branchPalette = ms.branch;
  const nodes = new Map();
  const order = [];
  const visible = (t) => !hidden || !hidden.has(t.id);

  // Creates the node of a topic (sized) without placing it.
  function makeNode(topic, level, kind, branch, parent, mirror = false) {
    const st = topicStyle(ms, topic, { level, kind, branch, baseSize, mapFont });
    const prefix = kind === 'child' ? numberingOf(map, topic.id) : '';
    const m = measureTopic(topic, st, { measure, prefix, lang, mirror });
    const n = { id: topic.id, topic, level, kind, parent, st, m, w: m.w, h: m.h, x: 0, y: 0, dx: 0, dy: 0, kids: [], callouts: [], dir: null, box: null, fold: null };
    // a topic anywhere on a fishbone: its lines are always straight
    n.inFish = !!parent && (!!parent.inFish || FISH_DIRS.has(parent.dir));
    nodes.set(topic.id, n);
    order.push(n);
    return n;
  }

  // dir of a topic's children, given the dir its parent gave it
  function childDir(topic, inherited, level, fromMap) {
    if (topic.layout) return { dir: topic.layout, fromMap: false };
    if (fromMap && inherited === 'down' && level >= 2) return { dir: 'treeRight', fromMap: true };
    return { dir: inherited, fromMap };
  }

  const gapH = (level) => (level === 0 ? 54 : level === 1 ? 34 : 24) * H;
  const gapV = (level) => (level <= 1 ? 16 : 7) * V;
  const orgGapV = 38 * V;
  const orgGapH = 16 * H;
  const INDENT = 22 * H;
  const ROUND = ROUND_SHAPES;
  // a tree leaves a round topic from its bottom centre, a box near its left (right) edge
  const treeStart = (n, dir) => (ROUND.has(n.st.shape) ? n.w / 2 : dir === 'treeRight' ? Math.min(INDENT / 2, n.w / 2) : Math.max(n.w - INDENT / 2, n.w / 2));
  const treeIndent = (n, dir) => (ROUND.has(n.st.shape) ? (dir === 'treeRight' ? n.w / 2 + INDENT / 2 : n.w / 2 - INDENT / 2) : dir === 'treeRight' ? INDENT : n.w - INDENT);

  // Lays out the subtree of node n whose children grow in `dir`. Returns its block box (relative to n's top-left).
  function build(n, dir, fromMap) {
    const t = n.topic;
    n.dir = dir;
    let box = { x0: 0, y0: 0, x1: n.w, y1: n.h };
    const kids = (t.children || []).filter(visible);
    const collapsed = t.collapsed && kids.length;
    if (kids.length && !collapsed) {
      if (dir === 'map') box = unionBox(box, buildMap(n, kids));
      else if (dir === 'timeline') box = unionBox(box, buildTimeline(n, kids));
      else if (dir === 'fishbone') box = unionBox(box, buildFishbone(n, kids));
      else box = unionBox(box, buildStack(n, kids, dir, fromMap));
    }
    // a summary (topic.summary = { text }): a brace beside the subtopics and a label after it
    if (t.summary && kids.length && !collapsed && n.kids.length && (dir === 'right' || dir === 'left')) {
      let kb = null;
      for (const k of n.kids) { const b = shiftBox(k.box, k.dx, k.dy); kb = kb ? unionBox(kb, b) : b; }
      const text = String(t.summary.text || '') || (lang === 'ko' ? '요약' : 'Summary');
      const fs = Math.max(11, Math.round(n.st.fontSize * 0.9));
      const font = fontString({ ...n.st, bold: true }, fs);
      const tw = cachedMeasure(measure, text, font);
      const w = tw + 20, h = fs + 14;
      const right = dir === 'right';
      const bx = right ? kb.x1 + 8 : kb.x0 - 8;
      const cy = (kb.y0 + kb.y1) / 2;
      const lx = right ? bx + 22 : bx - 22 - w;
      n.summary = { text, fs, font, right, bx, y0: kb.y0 + 2, y1: kb.y1 - 2, lx, ly: cy - h / 2, w, h };
      box = unionBox(box, { x0: Math.min(bx, lx), y0: Math.min(kb.y0, cy - h / 2), x1: Math.max(bx, lx + w), y1: Math.max(kb.y1, cy + h / 2) });
    }
    if (kids.length && n.kind !== 'root') {
      // the collapse handle, where the children leave the topic
      const f = foldPos(n, dir);
      if (f) {
        n.fold = { ...f, count: kids.length, collapsed: !!collapsed };
        box = unionBox(box, { x0: f.x - FOLD_R - 1, y0: f.y - FOLD_R - 1, x1: f.x + FOLD_R + 1, y1: f.y + FOLD_R + 1 });
      }
    }
    // callouts float above the topic
    const calls = (t.callouts || []).filter(visible);
    if (calls.length) {
      let cx = n.w * 0.55;
      for (const c of calls) {
        const cn = makeNode(c, n.level + 1, 'callout', n.st.branch, n);
        const cb = build(cn, c.layout || 'right', false);
        cn.dx = cx - cb.x0;
        cn.dy = -18 * V - cb.y1;
        n.callouts.push(cn);
        box = unionBox(box, shiftBox(cb, cn.dx, cn.dy));
        cx += cb.x1 - cb.x0 + 12;
      }
    }
    if (t.boundary) {
      const top = t.boundary.label ? 18 : 0;
      box = { x0: box.x0 - BOUNDARY_PAD, y0: box.y0 - BOUNDARY_PAD - top, x1: box.x1 + BOUNDARY_PAD, y1: box.y1 + BOUNDARY_PAD };
    }
    n.box = box;
    return box;
  }

  function foldPos(n, dir) {
    const ay = anchorY(n);
    switch (dir) {
      case 'right': return { x: n.w + FOLD_R + 3, y: ay };
      case 'left': return { x: -FOLD_R - 3, y: ay };
      case 'down': return { x: n.w / 2, y: n.h + FOLD_R + 3 };
      case 'up': return { x: n.w / 2, y: -FOLD_R - 3 };
      case 'treeRight': return { x: treeStart(n, dir), y: n.h + FOLD_R + 3 };
      case 'treeLeft': return { x: treeStart(n, dir), y: n.h + FOLD_R + 3 };
      case 'fishTop': return { x: n.w / 2, y: n.h + FOLD_R + 3 };
      case 'fishBottom': return { x: n.w / 2, y: -FOLD_R - 3 };
      default: return null;
    }
  }

  function kidBranch(n, child, i) {
    if (n.kind === 'root' && branchPalette) return branchPalette[i % branchPalette.length];
    return n.level === 0 ? null : n.st.branch;
  }

  function addKid(n, c, i, mirror = false) {
    const cn = makeNode(c, n.level + 1, 'child', (c.style && c.style.line) || kidBranch(n, c, i), n, mirror);
    n.kids.push(cn);
    return cn;
  }

  // right · left · down · up · treeRight · treeLeft · fishTop · fishBottom
  function buildStack(n, kids, dir, fromMap) {
    const blocks = kids.map((c, i) => {
      const cn = addKid(n, c, i, dir === 'left' || dir === 'treeLeft' || dir === 'fishTop' || dir === 'fishBottom');
      const cd = dir === 'fishTop' || dir === 'fishBottom' ? { dir: c.layout || 'left', fromMap: false } : childDir(c, dir, n.level + 1, fromMap);
      return { cn, b: build(cn, cd.dir, cd.fromMap) };
    });
    let box = { x0: 0, y0: 0, x1: n.w, y1: n.h };
    if (dir === 'right' || dir === 'left') {
      const g = gapV(n.level + 1);
      const total = blocks.reduce((s, { b }) => s + (b.y1 - b.y0), 0) + g * (blocks.length - 1);
      let y = anchorY(n) - total / 2;
      // a single child lines up with the parent's anchor (the lines run straight)
      if (blocks.length === 1) {
        const { cn, b } = blocks[0];
        y = anchorY(n) - anchorY(cn) + b.y0;
      }
      for (const { cn, b } of blocks) {
        cn.dy = y - b.y0;
        cn.dx = dir === 'right' ? n.w + gapH(n.level) - b.x0 : -gapH(n.level) - b.x1;
        box = unionBox(box, shiftBox(b, cn.dx, cn.dy));
        y += b.y1 - b.y0 + g;
      }
    } else if (dir === 'down' || dir === 'up') {
      const total = blocks.reduce((s, { b }) => s + (b.x1 - b.x0), 0) + orgGapH * (blocks.length - 1);
      let x = n.w / 2 - total / 2;
      for (const { cn, b } of blocks) {
        cn.dx = x - b.x0;
        cn.dy = dir === 'down' ? n.h + orgGapV - b.y0 : -orgGapV - b.y1;
        box = unionBox(box, shiftBox(b, cn.dx, cn.dy));
        x += b.x1 - b.x0 + orgGapH;
      }
    } else if (dir === 'treeRight' || dir === 'treeLeft') {
      let y = n.h + 10 * V;
      for (const { cn, b } of blocks) {
        cn.dy = y - b.y0;
        cn.dx = dir === 'treeRight' ? treeIndent(n, dir) - b.x0 : treeIndent(n, dir) - b.x1;
        box = unionBox(box, shiftBox(b, cn.dx, cn.dy));
        y += b.y1 - b.y0 + 7 * V;
      }
    } else if (dir === 'fishTop' || dir === 'fishBottom') {
      // sub-causes along the slanted bone: the bone leaves the main topic at its bottom (top) centre
      // and runs toward the spine at x' = x + |dy| · SLOPE
      const SLOPE = 0.62;
      const bx = n.w / 2;
      if (dir === 'fishTop') {
        let y = n.h + 12 * V;
        for (const { cn, b } of blocks) {
          const ay = anchorY(cn);
          cn.dy = y - b.y0;
          const boneX = bx + (cn.dy + ay - n.h) * SLOPE;
          cn.dx = boneX - 10 - cn.w;
          box = unionBox(box, shiftBox(b, cn.dx, cn.dy));
          y += b.y1 - b.y0 + 6 * V;
        }
        n.boneEnd = { x: bx + (y + 10 - n.h) * SLOPE, y: y + 10 };
      } else {
        let y = -12 * V;
        for (const { cn, b } of blocks) {
          cn.dy = y - b.y1;
          const ay = anchorY(cn);
          const boneX = bx + (0 - (cn.dy + ay)) * SLOPE;
          cn.dx = boneX - 10 - cn.w;
          box = unionBox(box, shiftBox(b, cn.dx, cn.dy));
          y -= b.y1 - b.y0 + 6 * V;
        }
        n.boneEnd = { x: bx + (0 - (y - 10)) * SLOPE, y: y - 10 };
      }
      box = unionBox(box, { x0: n.boneEnd.x - 2, y0: n.boneEnd.y - 2, x1: n.boneEnd.x + 2, y1: n.boneEnd.y + 2 });
    }
    return box;
  }

  // The central topic of a map: main topics to the right and left.
  // How tall a branch will be, roughly: its visible leaves (to balance the two sides before laying out).
  function weight(t) {
    const kids = (t.children || []).filter(visible);
    if (t.collapsed || !kids.length) return 1;
    return kids.reduce((s, c) => s + weight(c), 0);
  }

  function buildMap(n, kids) {
    const right = [], left = [];
    let wr = 0, wl = 0;
    const sides = kids.map((c, i) => {
      let side = c.side;
      if (side !== 'left' && side !== 'right') side = autoBalance ? (wl < wr ? 'left' : 'right') : (i % 2 === 0 ? 'right' : 'left');
      if (side === 'left') wl += weight(c); else wr += weight(c);
      return side;
    });
    kids.forEach((c, i) => {
      const cn = addKid(n, c, i, sides[i] === 'left');
      cn.side = sides[i];
      const b = build(cn, c.layout || sides[i], false);
      (sides[i] === 'left' ? left : right).push({ cn, b });
    });
    let box = { x0: 0, y0: 0, x1: n.w, y1: n.h };
    const g = gapV(1) * 1.4;
    for (const [list, side] of [[right, 'right'], [left, 'left']]) {
      const total = list.reduce((s, { b }) => s + (b.y1 - b.y0), 0) + g * Math.max(0, list.length - 1);
      let y = n.h / 2 - total / 2;
      for (const { cn, b } of list) {
        cn.dy = y - b.y0;
        cn.dx = side === 'right' ? n.w + gapH(0) - b.x0 : -gapH(0) - b.x1;
        box = unionBox(box, shiftBox(b, cn.dx, cn.dy));
        y += b.y1 - b.y0 + g;
      }
    }
    return box;
  }

  function buildTimeline(n, kids) {
    let box = { x0: 0, y0: 0, x1: n.w, y1: n.h };
    let x = n.w + 48 * H;
    kids.forEach((c, i) => {
      const cn = addKid(n, c, i);
      const b = build(cn, c.layout || 'treeRight', false);
      cn.dx = x - b.x0;
      cn.dy = n.h / 2 - cn.h / 2;
      box = unionBox(box, shiftBox(b, cn.dx, cn.dy));
      x += b.x1 - b.x0 + 26 * H;
    });
    n.axisEnd = x + 10;
    box = unionBox(box, { x0: 0, y0: n.h / 2 - 8, x1: n.axisEnd + 12, y1: n.h / 2 + 8 });
    return box;
  }

  function buildFishbone(n, kids) {
    const blocks = kids.map((c, i) => {
      const cn = addKid(n, c, i);
      const top = i % 2 === 0;
      cn.fishTop = top;
      if (c.layout) {
        // a cause with a subtopic layout of its own: its subtopics grow that way and a bone runs
        // from the cause to the spine past its whole block — straight down (up) from the cause, or,
        // when the subtopics lie between the cause and the spine, round the side of the block
        let b = build(cn, c.layout, false);
        const y = top ? b.y1 + 22 : b.y0 - 22;
        const between = top ? ['down', 'treeRight', 'treeLeft'].includes(c.layout) : c.layout === 'up';
        if (!between) {
          cn.boneStart = { x: cn.w / 2, y: top ? cn.h : 0 };
          cn.boneVia = [];
          cn.boneEnd = { x: cn.w / 2, y };
        } else {
          const right = c.layout === 'treeLeft';
          const sx = right ? b.x1 + 14 : b.x0 - 14;
          cn.boneStart = { x: right ? cn.w : 0, y: anchorY(cn) };
          cn.boneVia = [{ x: sx, y: anchorY(cn) }];
          cn.boneEnd = { x: sx, y };
        }
        b = unionBox(b, { x0: cn.boneEnd.x - 2, y0: Math.min(cn.boneEnd.y, 0) - 2, x1: cn.boneEnd.x + 2, y1: Math.max(cn.boneEnd.y, cn.h) + 2 });
        cn.box = b;
        return { cn, b, top };
      }
      let b = build(cn, top ? 'fishTop' : 'fishBottom', false);
      if (!cn.boneEnd) {
        // no (visible) sub-causes: a short bone straight to the spine
        cn.boneEnd = top ? { x: cn.w / 2 + 22 * 0.62, y: cn.h + 22 } : { x: cn.w / 2 + 22 * 0.62, y: -22 };
        b = unionBox(b, { x0: cn.boneEnd.x - 2, y0: cn.boneEnd.y - 2, x1: cn.boneEnd.x + 2, y1: cn.boneEnd.y + 2 });
        cn.box = b;
      }
      return { cn, b, top };
    });
    let box = { x0: 0, y0: 0, x1: n.w, y1: n.h };
    const spineY = n.h / 2;
    let right = -36 * H;   // everything stays left of this x
    for (let p = 0; p < blocks.length; p += 2) {
      const pair = blocks.slice(p, p + 2);
      // each block's extent around its attach point (bone end)
      const ext = pair.map(({ cn, b }) => ({ r: b.x1 - cn.boneEnd.x, l: cn.boneEnd.x - b.x0 }));
      const X = right - Math.max(...ext.map((e) => e.r)) - 8;
      pair.forEach(({ cn, b }) => {
        cn.dx = X - cn.boneEnd.x;
        cn.dy = spineY - cn.boneEnd.y;
        box = unionBox(box, shiftBox(b, cn.dx, cn.dy));
      });
      right = X - Math.max(...ext.map((e) => e.l)) - 22 * H;
    }
    n.spineEnd = Math.min(right + 10, -40);
    box = unionBox(box, { x0: n.spineEnd - 4, y0: spineY - 4, x1: 0, y1: spineY + 4 });
    return box;
  }

  // ── build the root (or the focused branch) and the floating topics ──
  let rootTopic = map.root;
  let rootLevel = 0, rootKind = 'root', rootBranch = null;
  if (focusId && focusId !== map.root.id) {
    const find = (t, lvl) => { if (t.id === focusId) return { t, lvl }; for (const c of [...(t.children || []), ...(t.callouts || [])]) { const r = find(c, lvl + 1); if (r) return r; } return null; };
    let hit = find(map.root, 0);
    if (!hit) for (const f of map.floating || []) { hit = find(f, 1); if (hit) break; }
    if (hit) { rootTopic = hit.t; rootLevel = hit.lvl; rootKind = 'root'; }
  }
  const root = makeNode(rootTopic, rootLevel, rootKind, rootBranch, null);
  const rdir = rootTopic.layout && rootTopic !== map.root ? rootTopic.layout : rootDir(map.layout);
  build(root, rdir, true);
  root.dx = -root.w / 2;
  root.dy = -root.h / 2;
  const tops = [root];
  if (!focusId || focusId === map.root.id) {
    (map.floating || []).filter(visible).forEach((f, i) => {
      const fn = makeNode(f, 1, 'floating', branchPalette ? branchPalette[(i + 3) % branchPalette.length] : null, null);
      build(fn, f.layout || 'right', false);
      fn.dx = (Number(f.x) || 0) - fn.w / 2;
      fn.dy = (Number(f.y) || 0) - fn.h / 2;
      tops.push(fn);
    });
  }

  // ── absolute positions ──
  // a topic moved by hand (topic.offset) keeps its parent; its subtree moves with it
  const place = (n, ox, oy) => {
    const off = n.kind === 'child' && n.topic.offset;
    // offX / offY: how far the topic was moved by hand (its layout place is x − offX, y − offY)
    n.offX = off ? Number(off.x) || 0 : 0;
    n.offY = off ? Number(off.y) || 0 : 0;
    n.x = ox + n.dx + n.offX;
    n.y = oy + n.dy + n.offY;
    for (const k of n.kids) place(k, n.x, n.y);
    for (const c of n.callouts) place(c, n.x, n.y);
  };
  for (const t of tops) place(t, 0, 0);

  // ── lines ──
  const lines = [];
  const extras = [];
  const lineW = ms.line.width || 2;
  const widthFor = (parent, child) => child.st.lineWidth || (parent.level === 0 && parent.kind === 'root' ? lineW * 1.25 : parent.level === 1 ? lineW : Math.max(1, lineW * 0.72));
  const mapStyle = ms.line.style || 'curve';

  // the bone of each fishbone cause, absolute: a straight line from the cause to the spine.
  // A cause moved by hand keeps its slant and runs straight on to wherever it now meets the
  // spine (the spine grows to reach it); one dragged across the spine runs straight back to
  // its own place on it. n.bone = { pts: the drawn path, a → e: the stretch the sub-causes join }
  for (const n of order) {
    const p = n.parent;
    if (!p || p.dir !== 'fishbone' || n.kind !== 'child') continue;
    const top = n.fishTop != null ? n.fishTop : n.dir === 'fishTop';
    const spineY = p.y + p.h / 2;
    const a = n.boneStart ? { x: n.x + n.boneStart.x, y: n.y + n.boneStart.y } : { x: n.x + n.w / 2, y: top ? n.y + n.h : n.y };
    const via = (n.boneVia || []).map((v) => ({ x: n.x + v.x, y: n.y + v.y }));
    let pts;
    if (!(n.offX || n.offY)) {
      pts = [a, ...via, { x: n.x + n.boneEnd.x, y: n.y + n.boneEnd.y }];
    } else if (top ? n.y + n.h <= spineY : n.y >= spineY) {
      const last = via.length ? via[via.length - 1] : a;
      // a cause with a layout of its own drops straight down (up); a plain one keeps its slant
      const e = n.boneStart ? { x: n.x + n.boneEnd.x, y: spineY } : { x: last.x + Math.abs(spineY - last.y) * 0.62, y: spineY };
      pts = [a, ...via, e];
    } else {
      const s = { x: n.x - n.offX + n.boneEnd.x, y: spineY };
      pts = [{ x: n.x + n.w / 2, y: n.y + n.h / 2 < spineY ? n.y + n.h : n.y }, s];
    }
    n.bone = { pts, a: pts[pts.length - 2], e: pts[pts.length - 1] };
    p.spineMin = Math.min(p.spineMin != null ? p.spineMin : p.x + p.spineEnd, n.bone.e.x - 6);
  }

  for (const n of order) {
    const p = n.parent;
    if (!p) continue;
    const color = n.st.branch || ms.line.color;
    if (n.kind === 'callout') {
      // a wedge from the callout to its topic
      const cx = n.x + n.w / 2, cy = n.y + n.h;
      const tx = Math.max(p.x + 6, Math.min(p.x + p.w - 6, cx)), ty = p.y;
      const half = Math.min(10, n.w / 4);
      lines.push({ id: n.id, kind: 'callout', d: `M${r(cx - half)} ${r(cy - 1)} L${r(tx)} ${r(ty)} L${r(cx + half)} ${r(cy - 1)} Z`, fill: n.st.fill !== 'none' ? n.st.fill : ms.bg, stroke: n.st.border, width: 1 });
      continue;
    }
    const w = widthFor(p, n);
    const pd = p.dir;
    const pr = p.kind === 'root' && p.level === rootLevel;
    const style = n.inFish ? 'straight' : mapStyle;
    if (pd === 'map' || pd === 'right' || pd === 'left') {
      let toRight = pd === 'right' || (pd === 'map' && n.side !== 'left');
      // a topic moved by hand to the other side of its parent is joined on the side that faces it
      if (n.offX || n.offY) toRight = n.x + n.w / 2 >= p.x + p.w / 2;
      const a = pr ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : { x: toRight ? p.x + p.w : p.x, y: p.y + anchorY(p) };
      const b = { x: toRight ? n.x : n.x + n.w, y: n.y + anchorY(n) };
      if (pr && ms.line.taper && (style === 'curve' || style === 'straight')) {
        lines.push({ id: n.id, d: taperPath(a, b, w * 2.6, w * 0.9, style), fill: color, stroke: 'none', width: 0 });
      } else {
        const start = pr ? { x: toRight ? p.x + p.w - 2 : p.x + 2, y: p.y + p.h / 2 } : a;
        lines.push({ id: n.id, d: hPath(style, pr && style === 'curve' ? a : start, b), stroke: color, width: w });
      }
    } else if (pd === 'down' || pd === 'up') {
      let down = pd === 'down';
      if (n.offX || n.offY) down = n.y + n.h / 2 >= p.y + p.h / 2;
      const a = { x: p.x + p.w / 2, y: down ? p.y + p.h : p.y };
      const b = { x: n.x + n.w / 2, y: down ? n.y : n.y + n.h };
      // the bus under the central topic is shared by every branch: neutral colour there
      lines.push({ id: n.id, d: vPath(style, a, b), stroke: pr && style !== 'curve' && style !== 'straight' ? ms.line.color : color, width: w });
    } else if (pd === 'treeRight' || pd === 'treeLeft') {
      const x = p.x + treeStart(p, pd);
      const a = { x, y: p.y + p.h };
      // the near side of the topic: its left edge when it is right of the stem (moved or not)
      const left = (n.offX || n.offY) ? n.x + n.w / 2 >= x : pd === 'treeRight';
      const b = { x: left ? n.x : n.x + n.w, y: n.y + anchorY(n) };
      lines.push({ id: n.id, d: treePath(a, b), stroke: pr ? ms.line.color : color, width: Math.max(1, w * 0.85) });
    } else if (pd === 'timeline') {
      // main topics sit on the axis; one moved off it by hand is tied back to its place on the axis
      if (n.offX || n.offY) {
        const ax = { x: n.x - n.offX + n.w / 2, y: n.y - n.offY + n.h / 2 };
        const below = n.y + n.h / 2 >= ax.y;
        const b = { x: n.x + n.w / 2, y: below ? n.y : n.y + n.h };
        lines.push({ id: n.id, d: `M${r(ax.x)} ${r(ax.y)} L${r(b.x)} ${r(b.y)}`, stroke: color, width: Math.max(1, w * 0.85) });
      }
    } else if (pd === 'fishbone') {
      lines.push({ id: n.id, d: n.bone.pts.map((q, i) => `${i ? ' L' : 'M'}${r(q.x)} ${r(q.y)}`).join(''), stroke: color, width: lineW * 1.2 });
    } else if (pd === 'fishTop' || pd === 'fishBottom') {
      const y = n.y + anchorY(n);
      // the point of the parent's bone at this height, kept on the bone (a sub-cause moved past
      // either end of it joins the bone at that end)
      const y0 = pd === 'fishTop' ? p.y + p.h : p.y;
      const { a, e } = p.bone || { a: { x: p.x + p.w / 2, y: y0 }, e: p.boneEnd ? { x: p.x + p.boneEnd.x, y: p.y + p.boneEnd.y } : { x: p.x + p.w / 2, y: y0 } };
      const yb = Math.max(Math.min(a.y, e.y), Math.min(Math.max(a.y, e.y), y));
      const boneX = Math.abs(e.y - a.y) < 0.5 ? a.x : a.x + ((yb - a.y) / (e.y - a.y)) * (e.x - a.x);
      lines.push({ id: n.id, d: `M${r(n.x + n.w)} ${r(y)} L${r(boneX)} ${r(yb)}`, stroke: color, width: Math.max(1, w * 0.85) });
    }
  }
  // the timeline axis and the fishbone spine
  for (const n of order) {
    if (n.dir === 'timeline' && n.kids.length && !(n.topic.collapsed)) {
      const y = n.y + n.h / 2;
      const x1 = n.x + n.axisEnd;
      extras.push({ id: `axis-${n.id}`, d: `M${r(n.x + n.w)} ${r(y)} L${r(x1)} ${r(y)}`, stroke: ms.line.color, width: lineW * 1.6, arrow: true });
    }
    if (n.dir === 'fishbone' && n.kids.length) {
      const y = n.y + n.h / 2;
      extras.push({ id: `spine-${n.id}`, d: `M${r(n.spineMin != null ? Math.min(n.spineMin, n.x + n.spineEnd) : n.x + n.spineEnd)} ${r(y)} L${r(n.x)} ${r(y)}`, stroke: ms.line.color, width: lineW * 2.2 });
    }
  }

  // ── boundaries ──
  const boundaries = [];
  for (const n of order) {
    const b = n.topic.boundary;
    if (!b) continue;
    let bb = { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h };
    const walk = (k) => { bb = unionBox(bb, { x0: k.x, y0: k.y, x1: k.x + k.w, y1: k.y + k.h }); k.kids.forEach(walk); k.callouts.forEach(walk); };
    n.kids.forEach(walk);
    n.callouts.forEach(walk);
    const pad = BOUNDARY_PAD - 4;
    const rect = { x0: bb.x0 - pad, y0: bb.y0 - pad - (b.label ? 16 : 0), x1: bb.x1 + pad, y1: bb.y1 + pad };
    boundaries.push({ id: n.id, rect, shape: b.shape || 'rounded', color: b.color || ms.boundary || ms.line.color, label: b.label || '', dash: !!b.dash });
  }

  // ── summaries (absolute) ──
  const summaries = [];
  for (const n of order) {
    const s = n.summary;
    if (!s) continue;
    summaries.push({ id: n.id, color: n.st.branch || ms.line.color, text: s.text, fs: s.fs, right: s.right, x: n.x + s.bx, y0: n.y + s.y0, y1: n.y + s.y1, lx: n.x + s.lx, ly: n.y + s.ly, w: s.w, h: s.h });
  }

  // ── relationships without a bend of their own: the side and the size of the bend that cross the
  // fewest topics (and keep their label off them); the choice goes to L.relBends (offsets like c1 / c2)
  // the width of a relationship label as the renderer draws it (bold 12 px, padding 12)
  const relLabelW = (text) => cachedMeasure(measure, String(text), fontString({ bold: true }, 12, mapFont)) + 12;
  const relBends = new Map();
  const relCurves = [];
  for (const rel of map.relationships || []) {
    const a = nodes.get(rel.from), b = nodes.get(rel.to);
    if (!a || !b) continue;
    let best = null;
    if (!rel.c1 && !rel.c2) {
      // bends in proportion to the length, and fixed ones for the short relationships between neighbours
      // and one that takes the middle of the curve (the label) clear of both topics, side by side
      const ddx = (b.x + b.w / 2) - (a.x + a.w / 2), ddy = (b.y + b.h / 2) - (a.y + a.h / 2), dl = Math.hypot(ddx, ddy) || 1;
      const lw = rel.label ? relLabelW(rel.label) : 0;
      const clear = Math.round((Math.abs(ddy / dl) * (Math.max(a.w, b.w) + lw) / 2 + Math.abs(ddx / dl) * (Math.max(a.h, b.h) + 22) / 2 + 18) / 0.75);
      // the curve around the side: both handles straight out to the right / left (topics one above the
      // other) or up / down (topics side by side), far enough for the label to clear both topics
      const sideX = Math.round(((Math.max(a.w, b.w) + lw) / 2 + 24) * 1.33);
      const sideY = Math.round(((Math.max(a.h, b.h) + 22) / 2 + 24) * 1.33);
      const sides = [[sideX, 0], [-sideX, 0], [0, sideY], [0, -sideY]].map(([x, y]) => ({ c1: { x, y }, c2: { x, y } }));
      const variants = [0.35, -0.35, 0.18, -0.18, 0.55, -0.55, 0.8, -0.8, 0, '60', '-60', '110', '-110', String(clear), String(-clear)].map((f) => ({ bendFactor: f })).concat(sides);
      for (const v of variants) {
        const f = v.bendFactor;
        const g = relationshipGeometry({ ...rel, ...v }, a, b);
        let cost = f === undefined ? 0.6 : typeof f === 'string' ? 0.45 : Math.abs(f) * 0.5;   // a gentler curve wins a tie
        for (let i = 1; i < 24; i++) {
          const pt = g.at(i / 24);
          for (const n of order) {
            if (n === a || n === b) continue;
            if (pt.x > n.x - 4 && pt.x < n.x + n.w + 4 && pt.y > n.y - 4 && pt.y < n.y + n.h + 4) cost += 1;
          }
        }
        // the label must have room too: the middle of this curve covering a topic counts
        if (rel.label) { const tw = relLabelW(rel.label); let free = false; for (const t of [0.5, 0.42, 0.58, 0.34, 0.66]) { const pt = g.at(t); if (!order.some((n) => Math.abs(pt.x - (n.x + n.w / 2)) < (tw + n.w) / 2 + 2 && Math.abs(pt.y - (n.y + n.h / 2)) < (22 + n.h) / 2)) { free = true; break; } } if (!free) cost += 4; }
        if (!best || cost < best.cost - 1e-9) best = { cost, f, g };
      }
      best.labelT = 0.5;
      relBends.set(rel.id, { c1: { x: best.g.c1.x - best.g.ac.x, y: best.g.c1.y - best.g.ac.y }, c2: { x: best.g.c2.x - best.g.bc.x, y: best.g.c2.y - best.g.bc.y } });
    }
    // the label: the point along the curve (middle first) where it covers no topic
    if (rel.label && (best || !rel.labelT)) {
      const g0 = best ? best.g : relationshipGeometry(rel, a, b);
      const tw = relLabelW(rel.label);
      let pick = 0.5, fewest = Infinity;
      for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
        const pt = g0.at(t);
        let hits = 0;
        for (const n of order) if (Math.abs(pt.x - (n.x + n.w / 2)) < (tw + n.w) / 2 + 2 && Math.abs(pt.y - (n.y + n.h / 2)) < (22 + n.h) / 2) hits++;
        if (hits < fewest) { fewest = hits; pick = t; }
        if (!hits) break;
      }
      if (best) relBends.get(rel.id).labelT = pick; else relBends.set(rel.id, { labelT: pick });
      if (best) best.g = relationshipGeometry({ ...rel, ...relBends.get(rel.id) }, a, b);
    }
    const g = best ? best.g : relationshipGeometry(rel, a, b, relBends);
    for (let i = 0; i <= 10; i++) relCurves.push(g.at(i / 10));
    if (rel.label) relCurves.push({ x: g.mid.x - 60, y: g.mid.y - 12 }, { x: g.mid.x + 60, y: g.mid.y + 12 });
  }

  // ── bounds ──
  let bounds = null;
  for (const n of order) {
    const nb = { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h };
    bounds = bounds ? unionBox(bounds, nb) : nb;
    if (n.fold) bounds = unionBox(bounds, { x0: n.x + n.fold.x - FOLD_R, y0: n.y + n.fold.y - FOLD_R, x1: n.x + n.fold.x + FOLD_R, y1: n.y + n.fold.y + FOLD_R });
  }
  for (const b of boundaries) bounds = unionBox(bounds, b.rect);
  for (const pt of relCurves) if (bounds) bounds = unionBox(bounds, { x0: pt.x - 8, y0: pt.y - 8, x1: pt.x + 8, y1: pt.y + 8 });
  for (const s of summaries) bounds = unionBox(bounds, { x0: Math.min(s.x, s.lx), y0: Math.min(s.y0, s.ly), x1: Math.max(s.x, s.lx + s.w), y1: Math.max(s.y1, s.ly + s.h) });
  for (const e of extras) {
    const m = /M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)/.exec(e.d);
    if (m) bounds = unionBox(bounds, { x0: Math.min(+m[1], +m[3]) - 12, y0: Math.min(+m[2], +m[4]) - 8, x1: Math.max(+m[1], +m[3]) + 12, y1: Math.max(+m[2], +m[4]) + 8 });
  }
  return { nodes, order, lines, extras, boundaries, summaries, relBends, bounds: bounds || { x0: -50, y0: -20, x1: 50, y1: 20 }, root };
}

const r = (v) => Math.round(v * 10) / 10;

// horizontal connection a → b
function hPath(style, a, b) {
  const dx = b.x - a.x;
  if (style === 'straight') return `M${r(a.x)} ${r(a.y)} L${r(b.x)} ${r(b.y)}`;
  if (style === 'elbow' || style === 'rounded') {
    const mx = a.x + dx / 2;
    if (style === 'elbow' || Math.abs(b.y - a.y) < 1) return `M${r(a.x)} ${r(a.y)} H${r(mx)} V${r(b.y)} H${r(b.x)}`;
    const rad = Math.min(10, Math.abs(b.y - a.y) / 2, Math.abs(dx) / 4);
    const sx = Math.sign(dx) || 1, sy = Math.sign(b.y - a.y) || 1;
    return `M${r(a.x)} ${r(a.y)} H${r(mx - sx * rad)} Q${r(mx)} ${r(a.y)} ${r(mx)} ${r(a.y + sy * rad)} V${r(b.y - sy * rad)} Q${r(mx)} ${r(b.y)} ${r(mx + sx * rad)} ${r(b.y)} H${r(b.x)}`;
  }
  return `M${r(a.x)} ${r(a.y)} C${r(a.x + dx * 0.5)} ${r(a.y)} ${r(b.x - dx * 0.5)} ${r(b.y)} ${r(b.x)} ${r(b.y)}`;
}

// vertical connection a → b (org chart)
function vPath(style, a, b) {
  const dy = b.y - a.y;
  if (style === 'straight') return `M${r(a.x)} ${r(a.y)} L${r(b.x)} ${r(b.y)}`;
  if (style === 'curve') return `M${r(a.x)} ${r(a.y)} C${r(a.x)} ${r(a.y + dy * 0.5)} ${r(b.x)} ${r(b.y - dy * 0.5)} ${r(b.x)} ${r(b.y)}`;
  const my = a.y + dy / 2;
  if (style === 'elbow' || Math.abs(b.x - a.x) < 1) return `M${r(a.x)} ${r(a.y)} V${r(my)} H${r(b.x)} V${r(b.y)}`;
  const rad = Math.min(10, Math.abs(b.x - a.x) / 2, Math.abs(dy) / 4);
  const sx = Math.sign(b.x - a.x) || 1, sy = Math.sign(dy) || 1;
  return `M${r(a.x)} ${r(a.y)} V${r(my - sy * rad)} Q${r(a.x)} ${r(my)} ${r(a.x + sx * rad)} ${r(my)} H${r(b.x - sx * rad)} Q${r(b.x)} ${r(my)} ${r(b.x)} ${r(my + sy * rad)} V${r(b.y)}`;
}

// tree: down from the parent, then across to the child (rounded corner)
function treePath(a, b) {
  const rad = Math.min(6, Math.abs(b.y - a.y) / 2, Math.abs(b.x - a.x) / 2);
  const sx = Math.sign(b.x - a.x) || 1;
  const sy = Math.sign(b.y - a.y) || 1;   // a topic moved above its parent: the corner turns the other way
  return `M${r(a.x)} ${r(a.y)} V${r(b.y - sy * rad)} Q${r(a.x)} ${r(b.y)} ${r(a.x + sx * rad)} ${r(b.y)} H${r(b.x)}`;
}

// A filled branch, w0 wide at a and w1 at b, along a horizontal curve (or a straight line).
function taperPath(a, b, w0, w1, style) {
  const dx = b.x - a.x;
  const p0 = a, p1 = style === 'straight' ? a : { x: a.x + dx * 0.5, y: a.y }, p2 = style === 'straight' ? b : { x: b.x - dx * 0.5, y: b.y }, p3 = b;
  const N = 18;
  const left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
    const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
    let tx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    let ty = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const hw = (w0 + (w1 - w0) * t) / 2;
    left.push(`${r(x - ty * hw)} ${r(y + tx * hw)}`);
    right.push(`${r(x + ty * hw)} ${r(y - tx * hw)}`);
  }
  return `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
}

// ── relationships ──

// Where the segment from a box's centre toward (tx, ty) leaves the box.
export function boxExit(n, tx, ty) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (n.w / 2 + 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (n.h / 2 + 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

// The curve of a relationship: ends on the two boxes, control points from rel.c1 / rel.c2
// (offsets from each box's centre) or a gentle arc by default.
// rel.c1 / rel.c2: bends set by hand (offsets from the two topics' centres); `auto` (L.relBends) is the
// layout's choice for a relationship without them; rel.bendFactor tries one (layoutMap).
export function relationshipGeometry(rel, a, b, auto = null) {
  const chosen = auto && auto.get ? auto.get(rel.id) : null;
  if (chosen) rel = !rel.c1 && !rel.c2 ? { ...rel, ...chosen } : { ...rel, labelT: chosen.labelT };
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  // bendFactor: a share of the length (number) or a fixed bend in px (string, '60' / '-60')
  const f = rel.bendFactor != null ? rel.bendFactor : 0.35;
  const bend = typeof f === 'string' ? Number(f) : Math.sign(f) * Math.min(160, len * Math.abs(f));
  const c1 = rel.c1 ? { x: ac.x + rel.c1.x, y: ac.y + rel.c1.y } : { x: ac.x + dx * 0.25 + nx * bend, y: ac.y + dy * 0.25 + ny * bend };
  const c2 = rel.c2 ? { x: bc.x + rel.c2.x, y: bc.y + rel.c2.y } : { x: ac.x + dx * 0.75 + nx * bend, y: ac.y + dy * 0.75 + ny * bend };
  const p0 = boxExit(a, c1.x, c1.y);
  const p3 = boxExit(b, c2.x, c2.y);
  const at = (t) => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
    };
  };
  const mid = at(rel.labelT != null ? rel.labelT : 0.5);
  const endDir = Math.atan2(p3.y - c2.y, p3.x - c2.x);
  const startDir = Math.atan2(p0.y - c1.y, p0.x - c1.x);
  return { p0, c1, c2, p3, mid, at, endDir, startDir, d: `M${r(p0.x)} ${r(p0.y)} C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(p3.x)} ${r(p3.y)}`, ac, bc };
}
