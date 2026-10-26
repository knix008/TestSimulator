// The MATLAB desktop: a toolstrip (HOME · PLOTS · EDITOR), the Current Folder (the
// document's .m files and the pipeline's MATLAB script nodes), the Editor with line
// numbers and MATLAB colouring, figure windows, the Command Window (>> prompt,
// history with ↑ ↓), the Workspace browser and the Command History — laid out as
// MATLAB lays out its own desktop. Code runs in a session (platform/matlab.js) that
// keeps the workspace, the figures and the random stream between commands.
import { h, replace } from './dom.js';
import { drawLineChart, drawHeatmap } from './charts.js';
import { evalMatlab, cancelMatlab, matlabBusy, f64 } from '../platform/matlab.js';

const TEXT = {
  ko: {
    home: '홈', plots: '플롯', editor: '편집기', newScript: '새 스크립트', newFunction: '새 함수', open: '열기', save: '저장', run: '실행', runSel: '선택 실행', stop: '중지',
    clearWs: '작업 공간 지우기', clearCmd: '명령 지우기', closeFigs: '그림 모두 닫기', sendNode: '파이프라인 노드로', comment: '주석', uncomment: '주석 해제', indent: '들여쓰기',
    folder: '현재 폴더', scripts: '파일', nodes: '파이프라인 스크립트 노드', workspace: '작업 공간', history: '명령 기록', command: '명령 창', figures: '그림',
    name: '이름', value: '값', size: '크기', class: '클래스', noFigure: '그림이 없습니다. plot, surf 등으로 그리면 여기에 나옵니다.', noVars: '변수가 없습니다',
    welcome: 'MATLAB 언어를 내장 엔진으로 실행합니다. 도움말: 사용 설명서의 "MATLAB 스크립트" 장.', busy: '실행 중…', fileExists: '같은 이름의 파일이 있습니다',
    fnFile: '함수 파일입니다 — 명령 창에서 이름으로 부르십시오', rename: '이름 바꾸기', remove: '삭제', newName: '새 파일 이름 (.m)', confirmRemove: '삭제할까요?',
    plotHint: '작업 공간에서 변수를 고르고 그림 종류를 누르십시오', selectVar: '먼저 작업 공간에서 변수를 고르십시오', exportPng: 'PNG 저장', closeFig: '닫기',
    varEditor: '변수 편집기', added: '파이프라인에 MATLAB 스크립트 노드를 추가했습니다', saved: '파이프라인 문서에 저장됨 (파일 › 저장)', untitled: 'untitled',
    line: '줄', col: '열', ready: '준비', run1: '실행 (F5)',
  },
  en: {
    home: 'HOME', plots: 'PLOTS', editor: 'EDITOR', newScript: 'New Script', newFunction: 'New Function', open: 'Open', save: 'Save', run: 'Run', runSel: 'Run Selection', stop: 'Stop',
    clearWs: 'Clear Workspace', clearCmd: 'Clear Commands', closeFigs: 'Close Figures', sendNode: 'To Pipeline Node', comment: 'Comment', uncomment: 'Uncomment', indent: 'Indent',
    folder: 'Current Folder', scripts: 'Files', nodes: 'Pipeline script nodes', workspace: 'Workspace', history: 'Command History', command: 'Command Window', figures: 'Figures',
    name: 'Name', value: 'Value', size: 'Size', class: 'Class', noFigure: 'No figures yet. plot, surf … draw here.', noVars: 'No variables',
    welcome: 'The MATLAB language runs in the built-in engine. Help: the "MATLAB scripts" chapter of the user guide.', busy: 'Busy…', fileExists: 'A file with that name exists',
    fnFile: 'This is a function file — call it by name from the Command Window', rename: 'Rename', remove: 'Delete', newName: 'New file name (.m)', confirmRemove: 'Delete it?',
    plotHint: 'Pick a variable in the workspace, then a plot type', selectVar: 'Pick a variable in the workspace first', exportPng: 'Save PNG', closeFig: 'Close',
    varEditor: 'Variables', added: 'Added a MATLAB script node to the pipeline', saved: 'Kept in the pipeline document (File › Save)', untitled: 'untitled',
    line: 'Ln', col: 'Col', ready: 'Ready', run1: 'Run (F5)',
  },
};

const MATLAB_COLORS = ['#0072bd', '#d95319', '#edb120', '#7e2f8e', '#77ac30', '#4dbeee', '#a2142f'];

const KEYWORDS = new Set(['if', 'elseif', 'else', 'end', 'for', 'parfor', 'while', 'switch', 'case', 'otherwise', 'function', 'return', 'break', 'continue', 'try', 'catch', 'global', 'persistent', 'classdef', 'properties', 'methods', 'events', 'do', 'until']);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** MATLAB colouring of one line: keywords, strings, comments, numbers. */
export function highlightLine(line, inBlock) {
  if (inBlock.on) {
    if (line.trim() === '%}') inBlock.on = false;
    return `<span class="ml-c">${esc(line)}</span>`;
  }
  if (line.trim() === '%{') {
    inBlock.on = true;
    return `<span class="ml-c">${esc(line)}</span>`;
  }
  let out = '';
  let i = 0;
  let prev = '';
  while (i < line.length) {
    const c = line[i];
    if (c === '%') {
      out += `<span class="ml-c">${esc(line.slice(i))}</span>`;
      break;
    }
    const valueBefore = /[\w)\]}'.]/.test(prev);
    if (c === '"' || (c === "'" && !valueBefore)) {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === c) {
          if (line[j + 1] === c) { j += 2; continue; }
          break;
        }
        j++;
      }
      out += `<span class="ml-s">${esc(line.slice(i, j + 1))}</span>`;
      i = j + 1;
      prev = 'x';
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < line.length && /\w/.test(line[j])) j++;
      const word = line.slice(i, j);
      const afterDot = prev === '.';
      out += KEYWORDS.has(word) && !afterDot ? `<span class="ml-k">${word}</span>` : esc(word);
      i = j;
      prev = 'x';
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(line[i + 1] ?? ''))) {
      const m = /^(\d*\.?\d+(?:[eE][+-]?\d+)?[ij]?|\d+\.(?:[eE][+-]?\d+)?[ij]?)/.exec(line.slice(i));
      const text = m ? m[0] : c;
      out += `<span class="ml-n">${text}</span>`;
      i += text.length;
      prev = 'x';
      continue;
    }
    out += esc(c);
    if (c !== ' ' && c !== '\t') prev = c;
    i++;
  }
  return out;
}

export function highlight(code) {
  const block = { on: false };
  return code.split('\n').map((l) => highlightLine(l, block)).join('\n');
}

function decodeNum(j) {
  return { r: j.r, c: j.c, re: f64(j.re), im: j.im ? f64(j.im) : null, logical: Boolean(j.l) };
}

const fmt = (v) => (Number.isNaN(v) ? 'NaN' : !Number.isFinite(v) ? (v > 0 ? 'Inf' : '-Inf') : Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : Math.abs(v) >= 1e-4 && Math.abs(v) < 1e5 ? v.toFixed(4) : v.toExponential(4));

/**
 * The MATLAB desktop of the current document.
 * app: { doc(), updateModel(fn), lang(), settings(), status(text), addScriptNode(name, code), downloadText(name, text), baseDir() }
 */
export class MatlabDesktop {
  constructor(app) {
    this.app = app;
    this.el = h('div', { className: 'ml-desktop', dataset: { testid: 'matlab' }, hidden: true });
    this.stripTab = 'home';
    this.historyIndex = -1;
    this.selectedVar = null;
    this.cursor = { line: 1, col: 1 };
  }

  get L() {
    return TEXT[this.app.lang() === 'en' ? 'en' : 'ko'];
  }

  /** The runtime part of the session (kept on the document, not saved). */
  session() {
    const d = this.app.doc();
    d.mlab ??= { state: null, history: [], log: [{ kind: 'info', text: this.L.welcome }], vars: [], figures: [], current: 0, open: [], active: null, figTab: 0 };
    const files = this.files();
    if (!d.mlab.active && files.length) {
      d.mlab.active = files[0].key;
      d.mlab.open = [files[0].key];
    }
    return d.mlab;
  }

  /** The editable files: the document's .m files, then the pipeline's script nodes. */
  files() {
    const d = this.app.doc();
    const own = (d.model.matlab?.files ?? []).map((f) => ({ key: `f:${f.name}`, name: f.name, code: f.code ?? '', node: null }));
    const nodes = d.model.nodes.filter((n) => n.type === 'script.matlab').map((n) => ({ key: `n:${n.id}`, name: `${n.name}`, code: n.params.code ?? '', node: n.id }));
    return [...own, ...nodes];
  }

  file(key) {
    return this.files().find((f) => f.key === key) ?? null;
  }

  setCode(key, code) {
    if (key.startsWith('n:')) {
      const id = key.slice(2);
      this.app.updateModel((m) => ({ ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, code } } : n)) }), false);
    } else {
      const name = key.slice(2);
      this.app.updateModel((m) => ({ ...m, matlab: { ...(m.matlab ?? {}), files: (m.matlab?.files ?? []).map((f) => (f.name === name ? { ...f, code } : f)) } }), false);
    }
  }

  commit() {
    this.app.updateModel((m) => m, true);
  }

  addFile(kind) {
    const existing = new Set((this.app.doc().model.matlab?.files ?? []).map((f) => f.name));
    let k = 1;
    let name = kind === 'function' ? 'myfunction.m' : `${this.L.untitled}.m`;
    while (existing.has(name)) name = kind === 'function' ? `myfunction${++k}.m` : `${this.L.untitled}${++k}.m`;
    const stem = name.replace(/\.m$/, '');
    const code = kind === 'function' ? `function y = ${stem}(x)\n%${stem.toUpperCase()} Summary of this function goes here\n    y = x;\nend\n` : `% ${stem}\n\n`;
    this.app.updateModel((m) => ({ ...m, matlab: { ...(m.matlab ?? {}), files: [...(m.matlab?.files ?? []), { name, code }] } }));
    this.openFile(`f:${name}`);
  }

  openFile(key) {
    const s = this.session();
    if (!s.open.includes(key)) s.open.push(key);
    s.active = key;
    this.render();
    requestAnimationFrame(() => this.el.querySelector('.ml-code')?.focus());
  }

  closeFile(key) {
    const s = this.session();
    s.open = s.open.filter((k) => k !== key);
    if (s.active === key) s.active = s.open[s.open.length - 1] ?? null;
    this.render();
  }

  renameFile(key) {
    const old = key.slice(2);
    const name0 = window.prompt(this.L.newName, old);
    if (!name0) return;
    const name = name0.endsWith('.m') ? name0 : `${name0}.m`;
    if (name !== old && (this.app.doc().model.matlab?.files ?? []).some((f) => f.name === name)) return window.alert(this.L.fileExists);
    this.app.updateModel((m) => ({ ...m, matlab: { ...(m.matlab ?? {}), files: (m.matlab?.files ?? []).map((f) => (f.name === old ? { ...f, name } : f)) } }));
    const s = this.session();
    s.open = s.open.map((k) => (k === key ? `f:${name}` : k));
    if (s.active === key) s.active = `f:${name}`;
    this.render();
  }

  removeFile(key) {
    if (!window.confirm(`${key.slice(2)} — ${this.L.confirmRemove}`)) return;
    const name = key.slice(2);
    this.app.updateModel((m) => ({ ...m, matlab: { ...(m.matlab ?? {}), files: (m.matlab?.files ?? []).filter((f) => f.name !== name) } }));
    this.closeFile(key);
  }

  log(kind, text) {
    const s = this.session();
    s.log.push({ kind, text });
    if (s.log.length > 2000) s.log.splice(0, s.log.length - 2000);
  }

  /** Runs code in the session; `echo` shows it after >> in the command window. */
  async exec(code, { echo = null, record = true } = {}) {
    if (!code.trim() || matlabBusy()) return;
    const s = this.session();
    if (echo != null) this.log('in', echo);
    if (record && echo != null) {
      s.history.push(echo);
      if (s.history.length > 500) s.history.shift();
    }
    s.busy = true;
    this.render();
    const own = (this.app.doc().model.matlab?.files ?? []).map((f) => ({ name: f.name, code: f.code ?? '' }));
    try {
      const reply = await evalMatlab({ code, files: own, state: s.state, seed: this.app.doc().model.settings?.seed ?? 1 }, this.app.baseDir());
      if (reply.clc) s.log = [];
      if (reply.output) this.log('out', reply.output.replace(/\n$/, ''));
      for (const w of reply.warnings ?? []) if (!reply.output?.includes(w)) this.log('warn', `Warning: ${w}`);
      // A one-line command reports like MATLAB's command window (no line number).
      if (!reply.ok) this.log('err', `Error: ${code.includes('\n') ? reply.error : reply.error.replace(/^line 1: /, '')}`);
      for (const d of reply.dialogs ?? []) this.log(d.kind === 'error' ? 'err' : d.kind === 'warning' ? 'warn' : 'info', `${{ error: '⛔', warning: '⚠', question: '❓', help: '❔' }[d.kind] ?? '💬'} ${d.title ? `${d.title}: ` : ''}${d.message}${d.answer ? ` → ${d.answer}` : ''}`);
      if (reply.dialogs?.length) this.dialog = reply.dialogs[reply.dialogs.length - 1];
      s.state = reply.state;
      s.vars = reply.vars ?? [];
      const before = s.figures.length;
      s.figures = reply.figures ?? [];
      s.current = reply.current ?? 0;
      if (s.figures.length !== before || s.figures.length) s.figTab = Math.min(s.current, Math.max(0, s.figures.length - 1));
    } catch (error) {
      this.log('err', String(error?.message ?? error) === 'cancelled' ? 'Operation terminated by user.' : `Error: ${error?.message ?? error}`);
    } finally {
      s.busy = false;
      this.render();
      requestAnimationFrame(() => this.el.querySelector('.ml-input')?.focus());
    }
  }

  runActive(selectionOnly = false) {
    const s = this.session();
    const f = this.file(s.active);
    if (!f) return;
    let code = f.code;
    if (selectionOnly) {
      const ta = this.el.querySelector('.ml-code');
      if (ta && ta.selectionEnd > ta.selectionStart) code = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    }
    const isFunctionFile = /^\s*(%.*\n\s*)*function\b/.test(code) && !selectionOnly;
    if (isFunctionFile) {
      this.log('err', this.L.fnFile);
      this.render();
      return;
    }
    const stem = f.name.replace(/\.m$/, '');
    this.exec(code, { echo: selectionOnly ? code.split('\n')[0] + (code.includes('\n') ? ' …' : '') : stem, record: false });
  }

  clearWorkspace() {
    const s = this.session();
    s.state = s.state ? { ...s.state, vars: {}, globals: {} } : null;
    s.vars = [];
    this.render();
  }

  closeFigures() {
    const s = this.session();
    s.state = s.state ? { ...s.state, figures: [], current: 0, hold: false } : null;
    s.figures = [];
    this.render();
  }

  /** Plot buttons: draw the selected workspace variable(s). */
  plot(kind) {
    const s = this.session();
    const v = this.selectedVar;
    if (!v) {
      this.log('warn', this.L.selectVar);
      this.render();
      return;
    }
    const names = Array.isArray(v) ? v : [v];
    const cmd = kind === 'surf' || kind === 'contour' || kind === 'imagesc' || kind === 'mesh' ? `figure; ${kind}(${names[0]}); title('${names[0]}')`
      : names.length >= 2 ? `figure; ${kind}(${names[0]}, ${names[1]}); title('${names[1]} vs ${names[0]}')`
        : `figure; ${kind}(${names[0]}); title('${names[0]}')`;
    this.exec(cmd, { echo: cmd });
    void s;
  }

  // ───────────────────────── rendering

  render() {
    if (this.el.hidden) return;
    const s = this.session();
    const L = this.L;
    const prev = this.el.querySelector('.ml-code');
    const keep = prev ? { start: prev.selectionStart, end: prev.selectionEnd, top: prev.scrollTop, left: prev.scrollLeft, focused: document.activeElement === prev } : null;
    const prevInput = this.el.querySelector('.ml-input');
    const pending = prevInput?.value ?? '';
    replace(this.el, this.renderStrip(), h('div', { className: 'ml-body' }, this.renderFolder(), this.renderCenter(), this.renderRight()), this.renderStatus());
    // Restore the command window's scroll and draw the figure.
    const log = this.el.querySelector('.ml-log');
    if (log) log.scrollTop = log.scrollHeight;
    const ta = this.el.querySelector('.ml-code');
    if (ta && keep) {
      ta.scrollTop = keep.top;
      ta.scrollLeft = keep.left;
      ta.dispatchEvent(new Event('scroll'));
      ta.setSelectionRange(keep.start, keep.end);
      if (keep.focused) ta.focus();
    }
    const input = this.el.querySelector('.ml-input');
    if (input && pending) input.value = pending;
    requestAnimationFrame(() => this.drawFigure());
    void s;
    void L;
  }

  renderStrip() {
    const L = this.L;
    const s = this.session();
    const big = (icon, label, onClick, testid, disabled = false, title = '') => h('button', { type: 'button', className: 'ml-big', disabled, title: title || label, dataset: testid ? { testid } : undefined, onClick }, h('span', { className: 'ml-big-icon' }, icon), h('span', null, label));
    const group = (label, ...buttons) => h('div', { className: 'ml-group' }, h('div', { className: 'ml-group-buttons' }, ...buttons), h('div', { className: 'ml-group-label' }, label));
    const tabs = h('div', { className: 'ml-strip-tabs' }, ...[['home', L.home], ['plots', L.plots], ['editor', L.editor]].map(([id, label]) => h('button', { type: 'button', className: this.stripTab === id ? 'on' : null, dataset: { testid: `ml-tab-${id}` }, onClick: () => { this.stripTab = id; this.render(); } }, label)));
    let body;
    if (this.stripTab === 'home') {
      body = [
        group('FILE', big('📄', L.newScript, () => this.addFile('script'), 'ml-new-script'), big('ƒ', L.newFunction, () => this.addFile('function'), 'ml-new-function'), big('📂', L.open, () => this.openDisk(), 'ml-open'), big('💾', L.save, () => this.saveActive(), 'ml-save')),
        group('CODE', big('▶', L.run, () => this.runActive(), 'ml-run', s.busy, L.run1), big('■', L.stop, () => cancelMatlab(), 'ml-stop', !s.busy)),
        group('VARIABLE', big('🧹', L.clearWs, () => this.clearWorkspace(), 'ml-clear-ws'), big('⌫', L.clearCmd, () => { s.log = []; this.render(); }, 'ml-clear-cmd')),
        group('ENVIRONMENT', big('🗙', L.closeFigs, () => this.closeFigures(), 'ml-close-figs'), big('⛓', L.sendNode, () => this.sendToNode(), 'ml-to-node')),
      ];
    } else if (this.stripTab === 'plots') {
      const kinds = [['plot', '📈'], ['scatter', '⁘'], ['bar', '▮'], ['stairs', '⎍'], ['area', '◭'], ['stem', '⫯'], ['histogram', '▥'], ['surf', '⛰'], ['mesh', '▦'], ['contour', '◎'], ['imagesc', '▩']];
      body = [group(this.selectedVar ? `${[this.selectedVar].flat().join(', ')}` : L.plotHint, ...kinds.map(([k, icon]) => big(icon, k, () => this.plot(k), `ml-plot-${k}`, s.busy)))];
    } else {
      body = [
        group('FILE', big('📄', L.newScript, () => this.addFile('script')), big('💾', L.save, () => this.saveActive())),
        group('EDIT', big('%', L.comment, () => this.editLines((l) => `% ${l}`), 'ml-comment'), big('⌀', L.uncomment, () => this.editLines((l) => l.replace(/^(\s*)% ?/, '$1')), 'ml-uncomment'), big('⇥', L.indent, () => this.editLines((l) => `    ${l}`))),
        group('RUN', big('▶', L.run, () => this.runActive(), null, s.busy, L.run1), big('▷', L.runSel, () => this.runActive(true), 'ml-run-sel', s.busy), big('■', L.stop, () => cancelMatlab(), null, !s.busy)),
      ];
    }
    return h('div', { className: 'ml-strip' }, tabs, h('div', { className: 'ml-strip-body' }, ...body));
  }

  renderFolder() {
    const L = this.L;
    const s = this.session();
    const own = this.files().filter((f) => !f.node);
    const nodes = this.files().filter((f) => f.node);
    const item = (f) => h('div', {
      className: `ml-file${s.active === f.key ? ' on' : ''}`, dataset: { testid: `ml-file-${f.name}` }, title: f.name,
      onDblclick: () => this.openFile(f.key), onClick: () => this.openFile(f.key),
    }, h('span', { className: 'ml-file-icon' }, f.node ? '⛓' : /^\s*function\b/.test(f.code) ? 'ƒ' : '📄'), h('span', { className: 'ellipsis' }, f.name),
    f.node ? null : h('span', { className: 'ml-file-tools' },
      h('button', { type: 'button', title: L.rename, onClick: (e) => { e.stopPropagation(); this.renameFile(f.key); } }, '✎'),
      h('button', { type: 'button', title: L.remove, onClick: (e) => { e.stopPropagation(); this.removeFile(f.key); } }, '🗑')));
    return h('section', { className: 'ml-pane ml-folder' },
      h('header', null, `📁 ${L.folder}`, h('span', { className: 'toolbar-spacer' }), h('button', { type: 'button', className: 'ghost', title: L.newScript, onClick: () => this.addFile('script') }, '＋')),
      h('div', { className: 'ml-pane-body' },
        h('div', { className: 'ml-folder-head muted' }, L.scripts),
        ...own.map(item),
        nodes.length ? h('div', { className: 'ml-folder-head muted' }, L.nodes) : null,
        ...nodes.map(item)));
  }

  renderEditor() {
    const L = this.L;
    const s = this.session();
    const f = this.file(s.active);
    const tabs = h('div', { className: 'ml-tabs' }, ...s.open.map((k) => {
      const file = this.file(k);
      if (!file) return null;
      return h('div', { className: `ml-tab${k === s.active ? ' on' : ''}`, onClick: () => { s.active = k; this.render(); } }, h('span', { className: 'ellipsis' }, file.node ? `⛓ ${file.name}` : file.name),
        h('button', { type: 'button', className: 'ghost', onClick: (e) => { e.stopPropagation(); this.closeFile(k); } }, '×'));
    }));
    if (!f) return h('section', { className: 'ml-pane ml-editor' }, h('header', null, `✎ ${L.editor}`), tabs, h('div', { className: 'ml-empty muted' }, L.newScript));
    const lines = f.code.split('\n').length;
    const gutter = h('pre', { className: 'ml-gutter' }, Array.from({ length: lines }, (_, i) => i + 1).join('\n'));
    const shade = h('pre', { className: 'ml-shade', 'aria-hidden': 'true' });
    shade.innerHTML = `${highlight(f.code)}\n`;
    const area = h('textarea', {
      className: 'ml-code', spellcheck: false, value: f.code, dataset: { testid: 'ml-code' }, wrap: 'off',
      onInput: (e) => {
        this.setCode(f.key, e.target.value);
        shade.innerHTML = `${highlight(e.target.value)}\n`;
        const n = e.target.value.split('\n').length;
        if (n !== gutter.textContent.split('\n').length) gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
      },
      onChange: () => this.commit(),
      onScroll: (e) => { shade.scrollTop = e.target.scrollTop; shade.scrollLeft = e.target.scrollLeft; gutter.scrollTop = e.target.scrollTop; },
      onKeyup: (e) => this.trackCursor(e.target), onClick: (e) => this.trackCursor(e.target),
      onKeydown: (e) => {
        if (e.key === 'F5' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); this.commit(); this.runActive(e.key === 'F9'); }
        else if (e.key === 'F9') { e.preventDefault(); this.runActive(true); }
        else if (e.key === 'Tab') { e.preventDefault(); e.target.setRangeText('    ', e.target.selectionStart, e.target.selectionEnd, 'end'); e.target.dispatchEvent(new Event('input')); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); this.editLines((l) => `% ${l}`); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') { e.preventDefault(); this.editLines((l) => l.replace(/^(\s*)% ?/, '$1')); }
        else if (e.key === 'Enter') {
          // Keep the indentation of the line.
          const ta = e.target;
          const before = ta.value.slice(0, ta.selectionStart);
          const indent = /(^|\n)([ \t]*)[^\n]*$/.exec(before)?.[2] ?? '';
          const extra = /^\s*(if|for|while|switch|function|try|else|elseif|case|otherwise|parfor|methods|properties|classdef)\b/.test(before.split('\n').pop()) ? '    ' : '';
          e.preventDefault();
          ta.setRangeText(`\n${indent}${extra}`, ta.selectionStart, ta.selectionEnd, 'end');
          ta.dispatchEvent(new Event('input'));
        }
      },
    });
    return h('section', { className: 'ml-pane ml-editor' }, tabs, h('div', { className: 'ml-code-wrap' }, gutter, h('div', { className: 'ml-code-box' }, shade, area)));
  }

  trackCursor(ta) {
    const before = ta.value.slice(0, ta.selectionStart).split('\n');
    this.cursor = { line: before.length, col: before[before.length - 1].length + 1 };
    const st = this.el.querySelector('.ml-cursor');
    if (st) st.textContent = `${this.L.line} ${this.cursor.line}, ${this.L.col} ${this.cursor.col}`;
  }

  /** Applies fn to every selected line (comment, uncomment, indent). */
  editLines(fn) {
    const ta = this.el.querySelector('.ml-code');
    if (!ta) return;
    const v = ta.value;
    const start = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let end = v.indexOf('\n', Math.max(ta.selectionEnd - 1, ta.selectionStart));
    if (end < 0) end = v.length;
    const block = v.slice(start, end).split('\n').map(fn).join('\n');
    ta.setRangeText(block, start, end, 'select');
    ta.dispatchEvent(new Event('input'));
    this.commit();
  }

  renderFigures() {
    const L = this.L;
    const s = this.session();
    const figs = s.figures ?? [];
    const k = Math.min(s.figTab ?? 0, Math.max(0, figs.length - 1));
    const num = (f, i) => f.id || i + 1;
    const label = (f, i) => {
      const name = pv(f.props?.Name);
      return pv(f.props?.NumberTitle) === 'off' && name ? name : `Figure ${num(f, i)}${name || f.title ? `: ${name || f.title}` : ''}`;
    };
    const tabs = h('div', { className: 'ml-tabs' }, ...figs.map((f, i) => h('div', { className: `ml-tab${i === k ? ' on' : ''}`, dataset: { testid: `ml-fig-tab-${i + 1}` }, onClick: () => { s.figTab = i; this.render(); } }, h('span', { className: 'ellipsis' }, label(f, i)))));
    const canvas = h('canvas', { className: 'ml-fig-canvas', dataset: { testid: 'ml-figure' } });
    this.figCanvas = canvas;
    const fig = figs[k];
    const n = fig ? num(fig, k) : 1;
    const tools = figs.length ? h('div', { className: 'ml-fig-tools' },
      h('button', { type: 'button', className: 'ghost', title: L.exportPng, onClick: () => this.app.downloadPng(canvas, `figure${n}.png`) }, '🖫'),
      h('button', { type: 'button', className: 'ghost', title: L.closeFig, onClick: () => this.exec(`close(${n})`, { echo: `close(${n})` }) }, '✕')) : null;
    let body = h('div', { className: 'ml-empty muted' }, L.noFigure);
    if (fig) body = fig.controls?.length ? this.renderApp(fig, canvas) : canvas;
    const dlg = this.dialog;
    const dialog = dlg ? h('div', { className: `ml-dialog ml-dialog-${dlg.kind}`, dataset: { testid: 'ml-dialog' } },
      h('div', { className: 'ml-dialog-title' }, dlg.title || { error: 'Error', warning: 'Warning', question: 'Question', help: 'Help' }[dlg.kind] || 'Message'),
      h('div', { className: 'ml-dialog-body' }, dlg.message, dlg.answer ? h('div', { className: 'muted' }, `→ ${dlg.answer}`) : null),
      h('button', { type: 'button', onClick: () => { this.dialog = null; this.render(); } }, 'OK')) : null;
    return h('section', { className: 'ml-pane ml-figures' },
      h('header', null, `📊 ${L.figures}`, h('span', { className: 'toolbar-spacer' }), tools),
      figs.length ? tabs : null,
      h('div', { className: 'ml-figure-window' }, body, dialog));
  }

  /** A figure with controls: the window at its own size, the axes where they belong and live controls. */
  renderApp(fig, canvas) {
    const pos = pv(fig.props?.Position);
    const [W, H] = Array.isArray(pos) && pos.length === 4 ? [pos[2], pos[3]] : fig.uifig ? [640, 480] : [560, 420];
    const box = h('div', { className: 'ml-app', dataset: { testid: 'ml-app' } });
    box.style.width = `${W}px`;
    box.style.height = `${H}px`;
    box.style.background = colorCss(pv(fig.props?.Color)) ?? (fig.uifig ? '#ffffff' : '#f0f0f0');
    const place = (el, p) => {
      el.style.left = `${p[0]}px`;
      el.style.top = `${H - p[1] - p[3]}px`;
      el.style.width = `${p[2]}px`;
      el.style.height = `${p[3]}px`;
    };
    const hasPlot = fig.series?.length || fig.surfaces?.length || fig.annots?.length || fig.axes?.Position;
    if (hasPlot) {
      let ap = pv(fig.axes?.Position);
      if (!Array.isArray(ap) || ap.length !== 4) ap = fig.controls.some((c) => c.auto) ? [0.36, 0.1, 0.6, 0.82] : [0.13, 0.11, 0.775, 0.815];
      if (ap.every((v) => v <= 1)) ap = [ap[0] * W, ap[1] * H, ap[2] * W, ap[3] * H];
      canvas.classList.add('ml-app-axes');
      place(canvas, ap);
      box.append(canvas);
    }
    for (const c of fig.controls) {
      if (pv(c.props?.Visible) === 'off') continue;
      const el = this.controlEl(fig, c);
      if (!el) continue;
      el.classList.add('ml-ctl', `ml-ctl-${c.style}`);
      el.dataset.testid = `ml-ctl-${c.id}`;
      if (pv(c.props?.Enable) === 'off') el.querySelectorAll('input,button,select,textarea').forEach((x) => { x.disabled = true; });
      if (el.matches('input,button,select,textarea') && pv(c.props?.Enable) === 'off') el.disabled = true;
      const fs = pv(c.props?.FontSize);
      if (Number.isFinite(fs)) el.style.fontSize = `${fs * (c.component ? 1 : 1.33)}px`;
      const bg = colorCss(pv(c.props?.BackgroundColor));
      if (bg) el.style.background = bg;
      const fg = colorCss(pv(c.props?.ForegroundColor ?? c.props?.FontColor));
      if (fg) el.style.color = fg;
      place(el, pv(c.props?.Position) ?? [20, 20, 120, 24]);
      box.append(el);
    }
    return h('div', { className: 'ml-app-scroll' }, box);
  }

  /** One control; a change goes back to the session as __uievent(figure, control, value). */
  controlEl(fig, c) {
    const p = (k) => pv(c.props?.[k]);
    const send = (value) => {
      const arg = value === undefined ? '' : `, ${mValue(value)}`;
      this.exec(`__uievent(${fig.id}, ${c.id}${arg})`, { echo: null, record: false });
    };
    const items = (v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split('|') : []);
    const cell = (text) => h('span', null, text);
    if (!c.component) {
      switch (c.style) {
        case 'pushbutton': return h('button', { type: 'button', onClick: () => send() }, String(p('String') ?? ''));
        case 'togglebutton': return h('button', { type: 'button', className: Number(p('Value')) === Number(p('Max') ?? 1) ? 'on' : '', onClick: () => send(Number(p('Value')) === Number(p('Max') ?? 1) ? Number(p('Min') ?? 0) : Number(p('Max') ?? 1)) }, String(p('String') ?? ''));
        case 'slider': {
          const lo = Number(p('Min') ?? 0); const hi = Number(p('Max') ?? 1);
          return h('input', { type: 'range', min: lo, max: hi, step: (hi - lo) / 100 || 0.01, value: Number(p('Value') ?? lo), onChange: (e) => send(Number(e.target.value)) });
        }
        case 'edit': return h('input', { type: 'text', value: String(p('String') ?? ''), onChange: (e) => send(e.target.value) });
        case 'text': return h('div', { className: 'ml-ctl-label' }, String(p('String') ?? ''));
        case 'popupmenu': case 'listbox': {
          const sel = h('select', { size: c.style === 'listbox' ? 4 : undefined, onChange: (e) => send(e.target.selectedIndex + 1) }, ...items(p('String')).map((t) => h('option', null, t)));
          sel.selectedIndex = Math.max(0, Number(p('Value') ?? 1) - 1);
          return sel;
        }
        case 'checkbox': case 'radiobutton': {
          const on = Number(p('Value')) === Number(p('Max') ?? 1);
          return h('label', null, h('input', { type: c.style === 'checkbox' ? 'checkbox' : 'radio', checked: on, onChange: (e) => send(e.target.checked ? Number(p('Max') ?? 1) : Number(p('Min') ?? 0)) }), cell(String(p('String') ?? '')));
        }
        default: return h('div', { className: 'ml-ctl-label' }, String(p('String') ?? ''));
      }
    }
    switch (c.style) {
      case 'button': return h('button', { type: 'button', onClick: () => send() }, String(p('Text') ?? 'Button'));
      case 'statebutton': return h('button', { type: 'button', className: p('Value') ? 'on' : '', onClick: () => send(!p('Value')) }, String(p('Text') ?? ''));
      case 'label': return h('div', { className: 'ml-ctl-label' }, String(p('Text') ?? ''));
      case 'slider': {
        const [lo, hi] = Array.isArray(p('Limits')) ? p('Limits') : [0, 100];
        const out = h('span', { className: 'ml-ctl-value' }, fmt(Number(p('Value') ?? lo)));
        return h('div', { className: 'ml-ctl-row' }, h('input', { type: 'range', min: lo, max: hi, step: (hi - lo) / 200 || 0.01, value: Number(p('Value') ?? lo), onInput: (e) => { out.textContent = fmt(Number(e.target.value)); }, onChange: (e) => send(Number(e.target.value)) }), out);
      }
      case 'editfield': return h('input', { type: 'text', value: String(p('Value') ?? ''), placeholder: p('Placeholder') ?? '', onChange: (e) => send(e.target.value) });
      case 'numericfield': return h('input', { type: 'number', value: Number(p('Value') ?? 0), onChange: (e) => send(Number(e.target.value)) });
      case 'spinner': {
        const [lo, hi] = Array.isArray(p('Limits')) ? p('Limits') : [-Infinity, Infinity];
        return h('input', { type: 'number', step: Number(p('Step') ?? 1), min: Number.isFinite(lo) ? lo : undefined, max: Number.isFinite(hi) ? hi : undefined, value: Number(p('Value') ?? 0), onChange: (e) => send(Number(e.target.value)) });
      }
      case 'textarea': {
        const v = p('Value');
        return h('textarea', { value: Array.isArray(v) ? v.join('\n') : String(v ?? ''), onChange: (e) => send(e.target.value) });
      }
      case 'checkbox': return h('label', null, h('input', { type: 'checkbox', checked: Boolean(p('Value')), onChange: (e) => send(e.target.checked) }), cell(String(p('Text') ?? '')));
      case 'dropdown': {
        const list = items(p('Items'));
        const sel = h('select', { onChange: (e) => send(e.target.value) }, ...list.map((t) => h('option', { value: t }, t)));
        sel.value = String(p('Value') ?? list[0] ?? '');
        return sel;
      }
      case 'switch': {
        const list = items(p('Items'));
        const on = p('Value') === list[1];
        return h('button', { type: 'button', className: `ml-switch${on ? ' on' : ''}`, onClick: () => send(on ? list[0] : list[1]) }, h('span', null, list[0] ?? 'Off'), h('i'), h('span', null, list[1] ?? 'On'));
      }
      case 'gauge': {
        const [lo, hi] = Array.isArray(p('Limits')) ? p('Limits') : [0, 100];
        const v = Number(p('Value') ?? lo);
        const bar = h('div', { className: 'ml-gauge-bar' });
        bar.style.width = `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100))}%`;
        return h('div', { className: 'ml-gauge' }, h('div', { className: 'ml-gauge-track' }, bar), h('span', { className: 'ml-ctl-value' }, fmt(v)));
      }
      default: return h('div', { className: 'ml-ctl-label' }, String(p('Text') ?? ''));
    }
  }

  drawFigure() {
    const s = this.session();
    const fig = (s.figures ?? [])[Math.min(s.figTab ?? 0, (s.figures?.length ?? 1) - 1)];
    const canvas = this.figCanvas;
    // An app window larger than the pane is shown smaller (still live), as a docked figure would be.
    const appBox = this.el.querySelector('.ml-app');
    if (appBox) {
      const host = appBox.parentElement;
      const W = parseFloat(appBox.style.width); const H = parseFloat(appBox.style.height);
      const k = Math.max(0.45, Math.min(1, (host.clientWidth - 18) / W, (host.clientHeight - 18) / H));
      appBox.style.zoom = k < 0.999 ? String(k) : '';
    }
    if (!fig || !canvas || !canvas.isConnected) return;
    // A MATLAB figure: white paper, dark axes, MATLAB's line colours and parula.
    const css = (name) => ({ '--text': '#262626', '--muted': '#4d4d4d', '--line': '#d6d6d6', '--accent': '#0072bd' })[name] ?? '';
    if (fig.surfaces?.length) {
      const sf = fig.surfaces[fig.surfaces.length - 1];
      drawHeatmap(canvas, { x: f64(sf.x), y: f64(sf.y), z: f64(sf.z), xLabel: fig.xlabel || 'x', yLabel: fig.ylabel || 'y', zLabel: 'z' }, { title: fig.title, colormap: 'parula', css });
      return;
    }
    const mode = { scatter: 'scatter', bar: 'bar', step: 'step', stairs: 'step', area: 'area', stem: 'scatter' }[fig.kind] ?? 'line';
    const dashes = { '--': [7, 4], ':': [2, 3], '-.': [7, 3, 2, 3], '-': undefined };
    const series = (fig.series ?? []).map((sr, i) => {
      const xs = f64(sr.x);
      const ys = f64(sr.y);
      const out = { name: sr.name, ...lineSpec(sr.style, MATLAB_COLORS[i % MATLAB_COLORS.length]), points: xs.map((x, j) => [x, ys[j]]) };
      // Properties set through the handle (h.Color = …, 'LineWidth', 2 …) win over the line spec.
      const p = (k) => pv(sr.props?.[k]);
      if (p('Visible') === 'off') return null;
      const col = colorCss(p('Color'));
      if (col) out.color = col;
      const ls = p('LineStyle');
      if (typeof ls === 'string') { out.dash = dashes[ls]; out.noLine = ls === 'none'; }
      const mk = p('Marker');
      if (typeof mk === 'string') out.marker = mk !== 'none';
      if (Number.isFinite(p('LineWidth'))) out.width = Math.max(0.8, p('LineWidth') * 1.33);
      return out;
    }).filter(Boolean);
    const ax = (k) => pv(fig.axes?.[k]);
    const annots = fig.annots ?? [];
    const texts = annots.filter((a) => a.kind === 'text').map((a) => ({ x: a.x, y: a.y, text: a.text, color: colorCss(pv(a.props?.Color)), size: pv(a.props?.FontSize) }));
    const lines = annots.filter((a) => a.kind !== 'text' && pv(a.props?.Visible) !== 'off').map((a) => ({ axis: a.kind === 'xline' ? 'x' : 'y', value: a.kind === 'xline' ? a.x : a.y, label: a.text, color: colorCss(pv(a.props?.Color)), dash: dashes[pv(a.props?.LineStyle)] ?? [], width: Number.isFinite(pv(a.props?.LineWidth)) ? pv(a.props.LineWidth) * 1.33 : 1 }));
    // Annotations alone still need axes: an invisible series spans them.
    if (!series.length && (texts.length || lines.length)) series.push({ name: '', color: 'transparent', noLine: true, points: [...texts.map((t) => [t.x, t.y]), ...lines.map((l) => (l.axis === 'x' ? [l.value, 0] : [0, l.value]))] });
    const logX = ax('XScale') ? ax('XScale') === 'log' : fig.kind === 'semilogx' || fig.kind === 'loglog';
    const logY = ax('YScale') ? ax('YScale') === 'log' : fig.kind === 'semilogy' || fig.kind === 'loglog';
    drawLineChart(canvas, series, { title: fig.title, xLabel: fig.xlabel, yLabel: fig.ylabel, mode, logX, logY, grid: ax('XGrid') !== 'off', legend: series.length > 1 || fig.legend?.length > 0, xLim: ax('XLim'), yLim: ax('YLim'), equal: ax('DataAspectRatio') === 'equal', texts, lines, css });
  }

  renderCommand() {
    const L = this.L;
    const s = this.session();
    const log = h('div', { className: 'ml-log', dataset: { testid: 'ml-log' }, onClick: () => { if (!window.getSelection()?.toString()) this.el.querySelector('.ml-input')?.focus(); } },
      ...s.log.map((e) => h('pre', { className: `ml-line ml-${e.kind}` }, e.kind === 'in' ? `>> ${e.text}` : e.text)));
    const input = h('textarea', {
      className: 'ml-input', rows: 1, spellcheck: false, dataset: { testid: 'ml-input' }, placeholder: s.busy ? L.busy : '',
      onKeydown: (e) => {
        const ta = e.target;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const code = ta.value;
          if (!code.trim()) return;
          ta.value = '';
          this.historyIndex = -1;
          this.exec(code, { echo: code });
        } else if (e.key === 'ArrowUp' && !ta.value.slice(0, ta.selectionStart).includes('\n')) {
          e.preventDefault();
          const hist = s.history;
          if (!hist.length) return;
          this.historyIndex = this.historyIndex < 0 ? hist.length - 1 : Math.max(0, this.historyIndex - 1);
          ta.value = hist[this.historyIndex];
        } else if (e.key === 'ArrowDown' && this.historyIndex >= 0) {
          e.preventDefault();
          this.historyIndex += 1;
          if (this.historyIndex >= s.history.length) { this.historyIndex = -1; ta.value = ''; } else ta.value = s.history[this.historyIndex];
        } else if (e.key === 'c' && e.ctrlKey && s.busy) {
          e.preventDefault();
          cancelMatlab();
        }
      },
      onInput: (e) => { e.target.rows = Math.min(6, e.target.value.split('\n').length); },
    });
    return h('section', { className: 'ml-pane ml-command' }, h('header', null, `⌨ ${L.command}`),
      log, h('div', { className: 'ml-prompt' }, h('span', { className: 'ml-fx' }, s.busy ? '…' : 'fx >>'), input));
  }

  renderCenter() {
    return h('div', { className: 'ml-center' }, h('div', { className: 'ml-top' }, this.renderEditor(), this.renderFigures()), this.renderCommand());
  }

  renderRight() {
    const L = this.L;
    const s = this.session();
    const rows = (s.vars ?? []).map((v) => {
      const sel = [this.selectedVar].flat().includes(v.name);
      return h('tr', {
        className: sel ? 'on' : null, dataset: { testid: `ml-var-${v.name}` }, title: `${v.name}: ${v.size} ${v.class}, ${v.bytes} bytes`,
        onClick: (e) => {
          if (e.ctrlKey || e.metaKey) {
            const cur = [this.selectedVar].flat().filter(Boolean);
            this.selectedVar = cur.includes(v.name) ? cur.filter((n) => n !== v.name) : [...cur, v.name];
            if (this.selectedVar.length === 1) this.selectedVar = this.selectedVar[0];
            if (!this.selectedVar.length) this.selectedVar = null;
          } else this.selectedVar = v.name;
          this.render();
        },
        onDblclick: () => this.openVariable(v.name),
      }, h('td', null, h('span', { className: 'ml-var-icon' }, v.class === 'double' ? '⊞' : v.class === 'char' ? 'ch' : v.class === 'struct' ? '{}' : v.class === 'cell' ? '{ }' : v.class === 'logical' ? '✓' : 'ƒ'), ` ${v.name}`), h('td', { className: 'ellipsis' }, v.value), h('td', null, v.size), h('td', null, v.class));
    });
    const ws = h('section', { className: 'ml-pane ml-workspace' }, h('header', null, `🗂 ${L.workspace}`),
      h('div', { className: 'ml-pane-body' }, rows.length ? h('table', { className: 'ml-ws-table' }, h('thead', null, h('tr', null, h('th', null, L.name), h('th', null, L.value), h('th', null, L.size), h('th', null, L.class))), h('tbody', null, ...rows)) : h('div', { className: 'ml-empty muted' }, L.noVars)));
    const hist = h('section', { className: 'ml-pane ml-history' }, h('header', null, `🕘 ${L.history}`),
      h('div', { className: 'ml-pane-body', dataset: { testid: 'ml-history' } }, ...s.history.slice(-200).map((c) => h('div', { className: 'ml-hist', title: c, onDblclick: () => this.exec(c, { echo: c }) }, c))));
    return h('div', { className: 'ml-right' }, ws, hist);
  }

  renderStatus() {
    const s = this.session();
    return h('div', { className: 'ml-status' }, h('span', null, s.busy ? `⏳ ${this.L.busy}` : `● ${this.L.ready}`), h('span', { className: 'toolbar-spacer' }), h('span', { className: 'ml-cursor' }, `${this.L.line} ${this.cursor.line}, ${this.L.col} ${this.cursor.col}`), h('span', null, 'UTF-8 · MATLAB'));
  }

  /** The variables editor: a numeric matrix, text, or the fields of a structure. */
  openVariable(name) {
    const s = this.session();
    const j = s.state?.vars?.[name];
    if (!j) return;
    let body;
    if (j.t === 'n') {
      const a = decodeNum(j);
      const maxR = Math.min(a.r, 300);
      const maxC = Math.min(a.c, 60);
      body = h('table', { className: 'ml-var-grid' }, h('thead', null, h('tr', null, h('th', null, ''), ...Array.from({ length: maxC }, (_, c) => h('th', null, String(c + 1))))),
        h('tbody', null, ...Array.from({ length: maxR }, (_, r) => h('tr', null, h('th', null, String(r + 1)), ...Array.from({ length: maxC }, (_, c) => {
          const k = c * a.r + r;
          const re = a.re[k];
          const im = a.im ? a.im[k] : 0;
          return h('td', null, a.logical ? (re ? 'true' : 'false') : im ? `${fmt(re)}${im < 0 ? '-' : '+'}${fmt(Math.abs(im))}i` : fmt(re));
        })))));
    } else if (j.t === 's') {
      body = h('pre', { className: 'ml-var-text' }, j.v);
    } else if (j.t === 'st') {
      body = h('table', { className: 'ml-var-grid' }, h('thead', null, h('tr', null, h('th', null, 'Field'), h('th', null, 'Value'))), h('tbody', null, ...(j.f ?? []).map((f, i) => h('tr', null, h('th', null, f), h('td', null, describe(j.items?.[0]?.[i]))))));
    } else if (j.t === 'c') {
      body = h('table', { className: 'ml-var-grid' }, h('tbody', null, ...Array.from({ length: j.r }, (_, r) => h('tr', null, h('th', null, String(r + 1)), ...Array.from({ length: j.c }, (_, c) => h('td', null, describe(j.items[c * j.r + r])))))));
    } else {
      body = h('pre', { className: 'ml-var-text' }, j.src ?? j.name ?? '');
    }
    const close = () => backdrop.remove();
    const backdrop = h('div', { className: 'popup-backdrop ml-var-backdrop', onClick: (e) => { if (e.target === backdrop) close(); } },
      h('div', { className: 'ml-var-window', dataset: { testid: 'ml-var-editor' } }, h('header', null, `${this.L.varEditor} — ${name}`, h('span', { className: 'toolbar-spacer' }), h('button', { type: 'button', className: 'ghost', onClick: close }, '×')), h('div', { className: 'ml-var-body' }, body)));
    document.body.appendChild(backdrop);
  }

  async openDisk() {
    const file = await this.app.openTextFile([{ name: 'MATLAB', extensions: ['m'] }]);
    if (!file) return;
    let name = file.name.split(/[\\/]/).pop();
    if (!name.endsWith('.m')) name += '.m';
    this.app.updateModel((m) => ({ ...m, matlab: { ...(m.matlab ?? {}), files: [...(m.matlab?.files ?? []).filter((f) => f.name !== name), { name, code: file.text }] } }));
    this.openFile(`f:${name}`);
  }

  saveActive() {
    const f = this.file(this.session().active);
    if (!f) return;
    this.commit();
    this.app.downloadText(f.name.endsWith('.m') ? f.name : `${f.name}.m`, f.code);
    this.app.status(this.L.saved);
  }

  sendToNode() {
    const f = this.file(this.session().active);
    if (!f || f.node) return;
    this.app.addScriptNode(f.name.replace(/\.m$/, ''), f.code);
    this.app.status(this.L.added);
    this.render();
  }

  focusCommand() {
    this.el.querySelector('.ml-input')?.focus();
  }
}

/** A graphics property as the session stores it: plain JSON, {$row: […]} for vectors, {$v: …} for anything else. */
function pv(j) {
  if (j == null) return undefined;
  if (typeof j === 'object' && !Array.isArray(j)) return Array.isArray(j.$row) ? j.$row : undefined;
  return j;
}

/** [r g b] (0–1) or a CSS colour → CSS. */
function colorCss(v) {
  if (Array.isArray(v) && v.length === 3) return `rgb(${v.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255)).join(',')})`;
  return undefined;
}

/** A JavaScript value as MATLAB source (for __uievent). */
function mValue(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf';
  return `'${String(v).replace(/'/g, "''").replace(/\r?\n/g, ' ')}'`;
}

/** MATLAB line spec → series styling: colour letter, line style (- -- : -.), marker (o + * . x s d ^ v). */
export function lineSpec(spec = '', fallback) {
  const colors = { r: '#ff0000', g: '#00a000', b: '#0000ff', c: '#00bfbf', m: '#bf00bf', y: '#d4c000', k: '#000000', w: '#ffffff' };
  const out = { color: fallback };
  if (!spec) return out;
  const c = [...spec].find((ch) => colors[ch]);
  if (c) out.color = colors[c];
  const marker = /[o+*.xsd^v<>ph]/.test(spec.replace(/-\./g, ''));
  const line = /--|-\.|-|:/.exec(spec)?.[0] ?? null;
  if (line === '--') out.dash = [7, 4];
  else if (line === ':') out.dash = [2, 3];
  else if (line === '-.') out.dash = [7, 3, 2, 3];
  if (marker) out.marker = true;
  if (marker && !line) out.noLine = true;
  return out;
}

function describe(j) {
  if (!j) return '[]';
  switch (j.t) {
    case 'n': {
      const a = decodeNum(j);
      if (a.re.length === 1) return fmt(a.re[0]);
      if (a.re.length <= 8 && (a.r === 1 || a.c === 1)) return `[${a.re.map(fmt).join(' ')}]`;
      return `${a.r}×${a.c} double`;
    }
    case 's': return `'${j.v}'`;
    case 'c': return `{${j.r}×${j.c} cell}`;
    case 'st': return `${j.r}×${j.c} struct`;
    case 'fa': return j.src;
    case 'gfx': return j.refs?.length === 1 ? `1×1 ${String(j.class).split('.').pop()}` : `1×${j.refs?.length ?? 0} graphics`;
    default: return j.name ? `@${j.name}` : '';
  }
}
