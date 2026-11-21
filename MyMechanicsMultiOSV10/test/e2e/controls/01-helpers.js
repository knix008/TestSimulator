//@step {"name": "helpers: error capture, print / download stubs, the state snapshot every check compares", "expect": "^ok$"}
return (() => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errors = [];
  window.__ctlErrors = errors;
  window.addEventListener('error', (e) => errors.push(`window: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => errors.push(`promise: ${e.reason?.message ?? e.reason}`));
  const origError = console.error;
  console.error = (...a) => { errors.push(`console: ${a.map((x) => x?.message ?? String(x)).join(' ')}`.slice(0, 300)); origError(...a); };
  // Never print, never download, never open the system's file dialogs.
  window.print = () => { window.__printed = (window.__printed ?? 0) + 1; };
  window.__mymechanicsPrintHook = async () => { window.__printed = (window.__printed ?? 0) + 1; };
  window.__mymechanicsPdfHook = async () => { window.__printed = (window.__printed ?? 0) + 1; };
  // No system file dialog and no download ever opens: a file input's click, the file pickers and download
  // links are counted instead (a command that would open one shows that as its effect).
  window.__fileDialogs = 0;
  const inputClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function click() { if (this.type === 'file') { window.__fileDialogs++; return undefined; } return inputClick.call(this); };
  const linkClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click() { if (this.hasAttribute('download')) { window.__fileDialogs++; return undefined; } return linkClick.call(this); };
  for (const name of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) window[name] = async () => { window.__fileDialogs++; throw new DOMException('no file dialogs in tests', 'AbortError'); };
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const sceneHash = () => {
    const vp = m.viewport; if (!vp?.scene) return null;
    let n = 0; let vis = 0; let mat = '';
    vp.scene.traverseVisible((o) => { vis++; if (o.material && !Array.isArray(o.material)) mat += `${o.material.type}${o.material.wireframe ? 'w' : ''}${o.material.visible ? '' : 'h'}${o.material.color?.getHexString?.() ?? ''}${r4(o.material.opacity ?? 1)},`; });
    vp.scene.traverse(() => { n++; });
    return `${n}/${vis}/${hash(mat)}`;
  };
  const statusHash = () => { const el = document.querySelector('#statusbar'); if (!el) return null; const c = el.cloneNode(true); c.querySelectorAll('#status-clock, #status-stats, #status-pointer').forEach((x) => x.remove()); return hash(c.innerHTML); };
  const domOf = (sel) => { const el = document.querySelector(sel); return el ? hash(el.innerHTML.replace(/\d+(\.\d+)? ?(ms|fps|FPS)/g, '')) : null; };
  /** What can be seen of the app's state: a command must change at least one of these. */
  window.__snap = () => {
    const s = m.state; const vp = m.viewport; const d = m.active();
    const cam = vp?.cameraState?.();
    return {
      settings: JSON.stringify(s.settings),
      editing: s.editing ? JSON.stringify({ mode: s.editing.mode, type: s.editing.type ?? s.editing.feature?.type, f: s.editing.feature, tool: s.editing.editor?.tool, sel: s.editing.editor?.selection, n: s.editing.editor?.sketch?.entities?.length, c: s.editing.editor?.sketch?.constraints?.length }) : null,
      docs: m.project ? JSON.stringify({ a: m.project.active, n: Object.values(m.project).filter(Array.isArray).map((x) => x.length) }) : null,
      model: d ? hash(JSON.stringify(d)) : null,
      history: m.state.doc?.history ? `${m.state.doc.history.index}/${m.state.doc.history.canRedo}` : null,
      selection: JSON.stringify(s.selection),
      tabs: [s.cmTab, s.leftTab, s.rightTab, s.bottomTab].join(','),
      start: s.showStart,
      popups: `${m.popups.opened.length}:${[...m.popups.frames.keys()].join(',')}:${[...m.popups.pending.keys()].join(',')}`,
      menu: s.openMenu,
      notice: s.notice ? `${s.notice.text}@${s.notice.at}` : null,
      log: s.log[0] ? `${s.log[0].text}@${+s.log[0].at}` : null,
      camera: cam ? hash(JSON.stringify(cam, (k, v) => (typeof v === 'number' ? r4(v) : v))) : null,
      section: JSON.stringify(s.section),
      misc: JSON.stringify({ z: s.drawingZoom, ds: s.drawingSelected, hp: [...s.hiddenPlanes], col: [...s.collapsed], mx: s.maximized, mate: [...(s.mateStatus?.keys?.() ?? [])].length, fm: [...(s.failedMates ?? [])] }),
      scene: sceneHash(),
      printed: window.__printed ?? 0,
      files: window.__fileDialogs ?? 0,
      dom: hash(['#menubar', '#toolbar', '#tabs', '#palette-host', '#left-panel', '#right-panel', '#bottom-panel', '#statusbar', '#start-page', '#view-host', '#drawing-host', '#workspace', '#center'].map((q) => { const e = document.querySelector(q); return e ? `${q}${e.className}${e.hidden ? 'h' : ''}${getComputedStyle(e).display}${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}` : ''; }).join('|')),
      panels: [domOf('#left-panel, .left-panel'), domOf('#right-panel, .right-panel'), domOf('#bottom-panel, .bottom-panel'), domOf('#palette-host'), statusHash()].join(','),
      theme: `${document.documentElement.dataset.theme}|${document.documentElement.lang}|${document.documentElement.className}`,
    };
  };
  window.__diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
  /** Puts the app back in a plain state between commands (editing cancelled, popups closed, back to `ref`). */
  window.__tidy = async (ref) => {
    if (m.state.editing) { try { m.actions.cancelEditing({ quiet: true }); } catch { /* fine */ } }
    try { m.popups.closeAll(); } catch { /* none */ }
    if (m.state.showStart) m.actions.showStartPage(false);
    if (ref && m.project?.active?.id !== ref.id) m.actions.switchDocument(ref);
    await sleep(30);
  };
  /** Runs `id` (as a menu would) and returns what it changed, after up to `ms` ms. */
  window.__effect = async (id, { ms = 700, run } = {}) => {
    const before = window.__snap();
    const e0 = errors.length;
    const p = run ? run() : m.run(id, { anchor: { x: 400, y: 300 } });
    let changed = [];
    const t0 = Date.now();
    await Promise.race([p, sleep(ms)]).catch((e) => errors.push(String(e)));
    while (Date.now() - t0 < ms) { changed = window.__diff(before, window.__snap()); if (changed.length) break; await sleep(40); }
    changed = window.__diff(before, window.__snap());
    return { changed, errors: errors.slice(e0) };
  };
  return 'ok';
})()
