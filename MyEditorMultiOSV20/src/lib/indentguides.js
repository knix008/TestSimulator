// Indent guides in the same places as Visual Studio Code:
//   • a faint 1px line at (level - 1) × indentSize of each line that has indent
//   • indentSize is detected from the file (2-space JS, 4-space Python, tabs, …)
//   • whitespace-only lines inherit the surrounding block (VS Code's
//     _getIndentLevelForWhitespaceLine, offSide = false)
//   • the active guide is the indent scope around the cursor
import { EditorView, layer, RectangleMarker } from '@codemirror/view';

// Leading-whitespace columns, or -1 when the line is only whitespace (VS Code).
export function computeIndentLevel(text, tabSize) {
  const n = Math.max(1, tabSize | 0);
  let indent = 0;
  let i = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === ' ') indent++;
    else if (c === '\t') indent = indent - (indent % n) + n;
    else break;
  }
  return i === text.length ? -1 : indent;
}

export function indentColumns(text, tabSize) {
  const v = computeIndentLevel(text, tabSize);
  return v < 0 ? indentColumnsOfWhitespace(text, tabSize) : v;
}

function indentColumnsOfWhitespace(text, tabSize) {
  const n = Math.max(1, tabSize | 0);
  let indent = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ' ') indent++;
    else if (c === '\t') indent = indent - (indent % n) + n;
    else break;
  }
  return indent;
}

export function indentLevelFromColumns(indent, indentSize) {
  if (indent <= 0) return 0;
  return Math.ceil(indent / Math.max(1, indentSize | 0));
}

// Columns (0, size, 2*size, …) for that many indent levels.
export function guideColumns(indent, indentSize) {
  const n = Math.max(1, indentSize | 0);
  const levels = indentLevelFromColumns(indent, n);
  const cols = [];
  for (let i = 0; i < levels; i++) cols.push(i * n);
  return cols;
}

// VS Code _getIndentLevelForWhitespaceLine (C-like languages: offSide = false).
export function whitespaceIndentLevel(above, below, indentSize, offSide = false) {
  const n = Math.max(1, indentSize | 0);
  if (above < 0 || below < 0) return 0;
  if (above < below) return 1 + Math.floor(above / n);
  if (above === below) return Math.ceil(below / n);
  return offSide ? Math.ceil(below / n) : 1 + Math.floor(below / n);
}

// The file's indent width (2 / 3 / 4 / 8, or tabSize when the file uses tabs).
export function detectIndentSize(state, tabSize) {
  const n = Math.max(1, tabSize | 0);
  const votes = new Map([[2, 0], [3, 0], [4, 0], [8, 0]]);
  let tabs = 0;
  let spaces = 0;
  let prev = -1;
  const last = Math.min(state.doc.lines, 2500);
  for (let i = 1; i <= last; i++) {
    const text = state.doc.line(i).text;
    const indent = computeIndentLevel(text, n);
    if (indent < 0) continue;
    if (indent === 0) { prev = 0; continue; }
    if (text.startsWith('\t')) tabs++;
    else spaces++;
    if (prev >= 0) {
      const diff = Math.abs(indent - prev);
      if (votes.has(diff)) votes.set(diff, votes.get(diff) + 1);
    }
    prev = indent;
  }
  if (tabs > spaces) return n;
  let best = n;
  let bestN = 0;
  for (const k of [2, 3, 4, 8]) {
    const v = votes.get(k) || 0;
    if (v > bestN) { bestN = v; best = k; }
  }
  return bestN > 0 ? best : n;
}

const indentSizeCache = new WeakMap();

export function indentSizeOf(state, tabSize) {
  const n = Math.max(1, tabSize | 0);
  const doc = state.doc;
  const hit = indentSizeCache.get(doc);
  if (hit && hit.tabSize === n) return hit.size;
  const size = detectIndentSize(state, n);
  try { indentSizeCache.set(doc, { tabSize: n, size }); } catch { /* mock docs */ }
  return size;
}

function contentIndentAt(state, lineNo, tabSize) {
  if (lineNo < 1 || lineNo > state.doc.lines) return -1;
  return computeIndentLevel(state.doc.line(lineNo).text, tabSize);
}

export function lineIndentLevels(state, fromLine, toLine, tabSize, indentSize = tabSize) {
  const n = Math.max(1, tabSize | 0);
  const size = Math.max(1, indentSize | 0);
  const last = state.doc.lines;
  let above = -1;
  let belowLine = 0;
  let below = -1;
  const out = [];
  for (let lineNo = fromLine; lineNo <= toLine; lineNo++) {
    const cur = contentIndentAt(state, lineNo, n);
    if (cur >= 0) {
      above = cur;
      out.push(indentLevelFromColumns(cur, size));
      continue;
    }
    if (lineNo === fromLine) {
      above = -1;
      for (let i = lineNo - 1; i >= 1; i--) {
        const ind = contentIndentAt(state, i, n);
        if (ind >= 0) { above = ind; break; }
      }
    }
    if (belowLine !== -1 && belowLine < lineNo) {
      belowLine = -1;
      below = -1;
      for (let i = lineNo + 1; i <= last; i++) {
        const ind = contentIndentAt(state, i, n);
        if (ind >= 0) { belowLine = i; below = ind; break; }
      }
    }
    out.push(whitespaceIndentLevel(above, below, size));
  }
  return out;
}

function indentLevelAt(state, lineNo, tabSize, indentSize) {
  const cur = contentIndentAt(state, lineNo, tabSize);
  if (cur >= 0) return indentLevelFromColumns(cur, indentSize);
  let above = -1;
  for (let i = lineNo - 1; i >= 1; i--) {
    const ind = contentIndentAt(state, i, tabSize);
    if (ind >= 0) { above = ind; break; }
  }
  let below = -1;
  for (let i = lineNo + 1; i <= state.doc.lines; i++) {
    const ind = contentIndentAt(state, i, tabSize);
    if (ind >= 0) { below = ind; break; }
  }
  return whitespaceIndentLevel(above, below, indentSize);
}

// VS Code getActiveIndentGuide: the indent scope around the cursor.
export function activeIndentGuide(state, lineNumber, tabSize, indentSize = tabSize) {
  const last = state.doc.lines;
  const size = Math.max(1, indentSize | 0);
  const cache = new Map();
  const levelAt = (n) => {
    if (n < 1 || n > last) return -1;
    if (cache.has(n)) return cache.get(n);
    const v = indentLevelAt(state, n, tabSize, size);
    cache.set(n, v);
    return v;
  };
  const initial = levelAt(lineNumber);
  const next = lineNumber < last ? levelAt(lineNumber + 1) : -1;
  const prev = lineNumber > 1 ? levelAt(lineNumber - 1) : -1;
  let start = lineNumber;
  let end = lineNumber;
  let level = initial;
  let goUp = true;
  let goDown = true;
  if (next === initial + 1) {
    start = end = lineNumber + 1;
    level = next;
    goUp = false;
  } else if (prev === initial + 1) {
    start = end = lineNumber - 1;
    level = prev;
    goDown = false;
  }
  if (level <= 0) return { start: lineNumber, end: lineNumber, level: 0 };
  if (goUp) while (start > 1 && levelAt(start - 1) >= level) start--;
  if (goDown) while (end < last && levelAt(end + 1) >= level) end++;
  return { start, end, level };
}

function documentBase(view) {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft,
    top: rect.top - view.scrollDOM.scrollTop,
  };
}

function fallbackOriginLeft(view, baseLeft) {
  const line = view.contentDOM.querySelector('.cm-line');
  if (!line) return null;
  const pad = parseFloat(getComputedStyle(line).paddingLeft) || 0;
  return line.getBoundingClientRect().left + pad - baseLeft;
}

function lineOriginLeft(view, lineFrom, baseLeft, fallback) {
  const coords = view.coordsAtPos(lineFrom);
  if (coords) return coords.left - baseLeft;
  return fallback;
}

function buildMarkers(view) {
  const tabSize = Math.max(1, view.state.tabSize | 0);
  const indentSize = indentSizeOf(view.state, tabSize);
  const charW = view.defaultCharacterWidth;
  if (!(charW > 0)) return [];
  const base = documentBase(view);
  const fallback = fallbackOriginLeft(view, base.left);
  if (fallback == null && !view.visibleRanges.length) return [];

  const cur = view.state.doc.lineAt(view.state.selection.main.head);
  const active = activeIndentGuide(view.state, cur.number, tabSize, indentSize);
  const activeCol = active.level > 0 ? (active.level - 1) * indentSize : -1;

  const markers = [];
  for (const { from, to } of view.visibleRanges) {
    const first = view.state.doc.lineAt(from);
    const last = view.state.doc.lineAt(to);
    const levels = lineIndentLevels(view.state, first.number, last.number, tabSize, indentSize);
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (level <= 0) continue;
      const line = view.state.doc.line(first.number + i);
      const block = view.lineBlockAt(line.from);
      if (block.height <= 0) continue;
      const originLeft = lineOriginLeft(view, line.from, base.left, fallback);
      if (originLeft == null) continue;
      const lineNo = first.number + i;
      for (let lvl = 1; lvl <= level; lvl++) {
        const col = (lvl - 1) * indentSize;
        const isActive = activeCol === col && lineNo >= active.start && lineNo <= active.end;
        markers.push(new RectangleMarker(
          isActive ? 'cm-indent-guide cm-indent-guide-active' : 'cm-indent-guide',
          Math.round(originLeft + col * charW),
          block.top,
          1,
          block.height,
        ));
      }
    }
  }
  return markers;
}

const theme = EditorView.baseTheme({
  '.cm-indent-guide-layer': {
    pointerEvents: 'none',
  },
  '.cm-indent-guide': {
    pointerEvents: 'none',
    backgroundColor: 'color-mix(in srgb, var(--fg-muted) 26%, transparent)',
  },
  '.cm-indent-guide-active': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 32%, transparent)',
  },
});

export function indentGuides() {
  return [
    theme,
    layer({
      above: true,
      class: 'cm-indent-guide-layer',
      update() { return true; },
      markers: buildMarkers,
    }),
  ];
}
