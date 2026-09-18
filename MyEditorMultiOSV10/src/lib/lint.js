// Linting in the editor: the findings of the language's checker (core/lint.js,
// run in the backend, off the UI thread) become CodeMirror diagnostics —
// markers in the lint gutter to the right of the line numbers, a wavy
// underline, the message on hover and in the panel (F8 / status bar).
import { lintGutter, setDiagnostics, diagnosticCount, forEachDiagnostic, openLintPanel, nextDiagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';

export const lintExtension = [
  lintGutter({ hoverTime: 200 }),
  EditorView.baseTheme({
    '.cm-gutter-lint': { width: '14px' },
    '.cm-gutter-lint .cm-gutterElement': { padding: '0 1px' },
    '.cm-lint-marker': { width: '10px', height: '10px', marginTop: '3px' },
    '.cm-lint-marker-error': { content: 'none', background: 'var(--danger)', borderRadius: '50%', display: 'inline-block' },
    '.cm-lint-marker-warning': { content: 'none', background: 'var(--folder)', borderRadius: '50%', display: 'inline-block' },
    '.cm-lint-marker-info': { content: 'none', background: 'var(--accent)', borderRadius: '50%', display: 'inline-block' },
    '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--danger)', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' },
    '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--folder)', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' },
    '.cm-lintRange-info': { backgroundImage: 'none', textDecoration: 'underline dotted var(--accent)', textUnderlineOffset: '3px' },
    '.cm-tooltip.cm-tooltip-lint, .cm-tooltip.cm-tooltip-hover': { background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--fg)', boxShadow: 'var(--shadow)', fontFamily: 'var(--font)', fontSize: '12px', padding: '4px 0' },
    '.cm-tooltip .cm-diagnostic': { padding: '3px 8px', borderLeftWidth: '3px' },
    '.cm-diagnostic-error': { borderLeftColor: 'var(--danger)' },
    '.cm-diagnostic-warning': { borderLeftColor: 'var(--folder)' },
    '.cm-diagnostic-info': { borderLeftColor: 'var(--accent)' },
    '.cm-diagnosticSource': { color: 'var(--fg-muted)', fontSize: '11px' },
    '.cm-panel.cm-panel-lint': { background: 'var(--bg-panel)', borderTop: '1px solid var(--border)', color: 'var(--fg)', fontFamily: 'var(--font)', fontSize: '12px' },
    '.cm-panel.cm-panel-lint ul': { maxHeight: '160px' },
    '.cm-panel.cm-panel-lint ul [aria-selected]': { background: 'var(--bg-sel)' },
    '.cm-panel.cm-panel-lint button': { background: 'none', border: '0', color: 'var(--fg)' },
  }),
];

// { line, col, endLine, endCol, severity, message, source } (1-based) → CodeMirror Diagnostic.
export function toDiagnostics(state, list) {
  const doc = state.doc;
  const out = [];
  for (const d of list || []) {
    const ln = Math.min(Math.max(1, d.line || 1), doc.lines);
    const line = doc.line(ln);
    let from = Math.min(line.from + Math.max(0, (d.col || 1) - 1), line.to);
    let to;
    if (d.endLine || d.endCol) {
      const eln = Math.min(Math.max(ln, d.endLine || ln), doc.lines);
      const eline = doc.line(eln);
      to = Math.min(eline.from + Math.max(0, (d.endCol || 1) - 1), eline.to);
    }
    if (to == null || to <= from) {
      // No range given: the word at the position, or the rest of the line.
      const rest = line.text.slice(from - line.from);
      const m = /^\s*[\w$]+/.exec(rest) || /^\S+/.exec(rest);
      to = m ? from + m[0].length : line.to;
      if (to <= from) { from = Math.max(line.from, from - 1); to = Math.max(from + 1, line.to); if (to > doc.length) to = doc.length; }
    }
    out.push({ from, to: Math.min(to, doc.length), severity: d.severity === 'error' ? 'error' : d.severity === 'info' ? 'info' : 'warning', message: d.message, source: d.source || undefined });
  }
  return out;
}

export const applyDiagnostics = (state, list) => setDiagnostics(state, toDiagnostics(state, list));
export const clearDiagnostics = (state) => setDiagnostics(state, []);
export function countDiagnostics(state) {
  const c = { error: 0, warning: 0, info: 0 };
  forEachDiagnostic(state, (d) => { c[d.severity] = (c[d.severity] || 0) + 1; });
  return { ...c, total: diagnosticCount(state) };
}
const SEV_ORDER = { error: 0, warning: 1, info: 2 };
export function sortLintItems(list) {
  return [...(list || [])].sort((a, b) => {
    const sa = SEV_ORDER[a.severity] ?? 9;
    const sb = SEV_ORDER[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    const la = Number(a.line) || 0, lb = Number(b.line) || 0;
    if (la !== lb) return la - lb;
    return (Number(a.col) || 0) - (Number(b.col) || 0);
  });
}
export { openLintPanel, nextDiagnostic };
