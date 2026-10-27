// UI components, dialogs, waitbar, export (print / saveas / exportgraphics /
// getframe) and the GUI → engine message handler.
import { str, num, tensor, rowVec, cell, empty, bool, structOf, isCell, isStruct } from '../value.js';
import { gerr, isTxt, txt, txtList, nums, isNum, lower, fmtNum } from './util.js';
import { G, create, destroy, objsOf, handleValue, handleIds, isHandleValue, setProp, setPairs, findProp, touch, isAxesType, figureOf, invokeCallback, eventData, onGet, onSet, getObj, mustObj } from './model.js';
import { currentFigure, newFigure, makeCurrentFigure, makeCurrentAxes, newAxes } from './figax.js';
import { flush } from './scene.js';

// ---------------------------------------------------------------- base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64Decode(s) {
  const clean = String(s).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0, buf = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out.subarray(0, o);
}
export function base64Encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : B64[c & 63]);
  }
  return s;
}

// ---------------------------------------------------------------- helpers

const absPath = (ctx, p) => (/^([A-Za-z]:)?\//.test(p) ? p : `${ctx.fs.cwd().replace(/\/$/, '')}/${p}`);

function needGui(reply, what) {
  if (reply == null) throw gerr('noDisplay', `${what} needs the graphical interface (no figure window is available).`);
  if (reply.error) throw gerr('export', String(reply.error));
  return reply;
}

function parentAndRest(ctx, args, fallbackFigure = true) {
  if (args.length && isHandleValue(args[0])) { const [p] = objsOf(ctx, args[0]); return { parent: p, rest: args.slice(1) }; }
  const pi = args.findIndex((v, i) => i % 2 === 0 && isTxt(v) && lower(txt(v)) === 'parent');
  if (pi >= 0) { const [p] = objsOf(ctx, args[pi + 1]); const rest = args.slice(); rest.splice(pi, 2); return { parent: p, rest }; }
  return { parent: fallbackFigure ? currentFigure(ctx, true) : null, rest: args };
}

/** Name/value pairs where 'Position' in pixels is allowed (ui components). */
function uiComponent(ctx, type, args, defaults = {}) {
  const { parent, rest } = parentAndRest(ctx, args);
  const o = create(ctx, type, parent.id, defaults);
  setPairs(ctx, [o], rest);
  flush(ctx);
  return o;
}

function valueJsToValue(v) {
  if (v == null) return empty();
  if (typeof v === 'number') return num(v);
  if (typeof v === 'boolean') return bool(v);
  if (typeof v === 'string') return str(v);
  if (Array.isArray(v)) return v.every((x) => typeof x === 'number') ? rowVec(v) : cell([v.length, 1], v.map(valueJsToValue));
  return empty();
}

// Value props of UI components are stored as Values ('any'); convenience getters.
onGet(['uicontrol'], 'Value', (ctx, o) => {
  const v = o.props.Value;
  if (v != null) return v;
  return num(['listbox', 'popupmenu'].includes(o.props.Style) ? 1 : o.props.Style === 'slider' ? o.props.Min : 0);
});
onGet(['uieditfield'], 'Value', (ctx, o) => (o.props.Value != null ? o.props.Value : o.internal.numeric ? num(0) : str('')));
onGet(['uidropdown'], 'Value', (ctx, o) => (o.props.Value != null ? o.props.Value : str(o.props.Items[0] ?? '')));
onGet(['uicheckbox'], 'Value', (ctx, o) => bool(!!o.props.Value));
onGet(['uieditfield'], 'EditStyle', (ctx, o) => str(o.internal.numeric ? 'numeric' : 'text'));
onSet(['uislider'], 'Value', (ctx, o, x) => { const [a, b] = o.props.Limits; if (x < a || x > b) throw gerr('invalidPropertyValue', `'Value' must be within Limits [${fmtNum(a)} ${fmtNum(b)}].`); o.props.Value = x; return true; });
onSet(['uidropdown'], 'Value', (ctx, o, x) => { if (isTxt(x) && !o.props.Items.includes(txt(x)) && !o.props.Editable) throw gerr('invalidPropertyValue', "'Value' must be one of the Items."); o.props.Value = x; return true; });

// ---------------------------------------------------------------- export

const FORMAT_OF_EXT = { png: 'png', jpg: 'jpg', jpeg: 'jpg', svg: 'svg', pdf: 'pdf', eps: 'svg', tif: 'png', tiff: 'png', bmp: 'png' };

function exportFigure(ctx, target, path, format, opts = {}) {
  const st = G(ctx);
  const fig = target.type === 'figure' ? target : figureOf(st, target);
  flush(ctx);
  const reply = needGui(ctx.host.request({ type: 'graphics.export', figure: fig.id, axes: isAxesType(target.type) ? target.id : null, format, scale: opts.scale || 1, background: opts.background || 'white', width: opts.width, height: opts.height }), 'Exporting a figure');
  const bytes = base64Decode(reply.data || '');
  const file = absPath(ctx, path);
  ctx.fs.writeBytes(file, bytes);
  return file;
}

function printBuiltin(args, nargout, ctx) {
  let target = null, format = null, file = null, res = 150;
  for (const a of args) {
    if (isHandleValue(a) || (isNum(a) && !isTxt(a))) { [target] = objsOf(ctx, a); continue; }
    const s = txt(a);
    if (/^-d/i.test(s)) { const f = lower(s.slice(2)); format = f.startsWith('png') ? 'png' : f.startsWith('jpeg') || f.startsWith('jpg') ? 'jpg' : f.startsWith('svg') ? 'svg' : f.startsWith('pdf') ? 'pdf' : f.startsWith('eps') ? 'svg' : f.startsWith('meta') || f.startsWith('bitmap') ? 'png' : null; if (!format) throw gerr('print:format', `Unsupported print format '${s}'.`); continue; }
    if (/^-r\d+/i.test(s)) { res = Number(s.slice(2)); continue; }
    if (/^-f\d+/i.test(s)) { [target] = objsOf(ctx, num(Number(s.slice(2)))); continue; }
    if (/^-/.test(s)) { if (/^-clipboard$/i.test(s)) file = null; continue; }
    file = s;
  }
  target = target || currentFigure(ctx, true);
  if (!file) {
    if (args.some((a) => isTxt(a) && /^-clipboard$/i.test(txt(a)))) { flush(ctx); ctx.host.request({ type: 'graphics.export', figure: (target.type === 'figure' ? target : figureOf(G(ctx), target)).id, format: 'png', clipboard: true, background: 'white' }); return []; }
    throw gerr('print:noFile', 'Specify a file name (printing to a printer is not supported; use print(filename, \'-dpdf\')).');
  }
  const ext = (/\.([A-Za-z0-9]+)$/.exec(file) || [])[1];
  if (!format) format = FORMAT_OF_EXT[lower(ext || '')] || 'png';
  if (!ext) file += `.${format}`;
  exportFigure(ctx, target, file, format, { scale: res / 96 });
  return [];
}

function saveasBuiltin(args, nargout, ctx) {
  if (args.length < 2) throw gerr('saveas:args', 'saveas(fig, filename) or saveas(fig, filename, format).');
  const [target] = objsOf(ctx, args[0]);
  let file = txt(args[1]);
  const ext = (/\.([A-Za-z0-9]+)$/.exec(file) || [])[1];
  let format = args[2] ? lower(txt(args[2])) : lower(ext || 'png');
  if (format === 'fig') throw gerr('saveas:fig', "Saving the '.fig' format is not supported; use png, jpg, svg or pdf.");
  format = FORMAT_OF_EXT[format] || (['png', 'jpg', 'svg', 'pdf'].includes(format) ? format : null);
  if (!format) throw gerr('saveas:format', `Unsupported format '${args[2] ? txt(args[2]) : ext}'.`);
  if (!ext) file += `.${format}`;
  exportFigure(ctx, target, file, format, { scale: 150 / 96 });
  return [];
}

function exportgraphicsBuiltin(args, nargout, ctx) {
  if (args.length < 2) throw gerr('exportgraphics:args', 'exportgraphics(obj, filename, Name, Value).');
  const [target] = objsOf(ctx, args[0]);
  const file = txt(args[1]);
  const ext = lower((/\.([A-Za-z0-9]+)$/.exec(file) || [])[1] || '');
  const format = FORMAT_OF_EXT[ext];
  if (!format) throw gerr('exportgraphics:format', `Unsupported file type '.${ext}'.`);
  let res = 150, bg = 'white';
  for (let i = 2; i + 1 < args.length; i += 2) {
    const n = lower(txt(args[i]));
    if (n === 'resolution') res = nums(args[i + 1])[0];
    else if (n === 'backgroundcolor') bg = isTxt(args[i + 1]) ? lower(txt(args[i + 1])) : 'white';
    else if (n === 'contenttype' || n === 'append' || n === 'colorspace') { /* accepted */ }
    else throw gerr('exportgraphics:option', `Unknown option '${txt(args[i])}'.`);
  }
  exportFigure(ctx, target, file, format, { scale: res / 96, background: bg === 'none' ? 'none' : bg === 'current' ? 'theme' : 'white' });
  return [];
}

function getframeBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  let target = args.length ? objsOf(ctx, args[0])[0] : currentFigure(ctx, true);
  const fig = target.type === 'figure' ? target : figureOf(st, target);
  flush(ctx);
  const r = needGui(ctx.host.request({ type: 'graphics.getframe', figure: fig.id, axes: isAxesType(target.type) ? target.id : null }), 'getframe');
  const w = r.width, h = r.height;
  const rgba = base64Decode(r.rgba || '');
  const t = tensor('uint8', [h, w, 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4;
    const d = y + x * h;
    t.re[d] = rgba[s]; t.re[d + w * h] = rgba[s + 1]; t.re[d + 2 * w * h] = rgba[s + 2];
  }
  return structOf({ cdata: t, colormap: empty() });
}

// ---------------------------------------------------------------- dialogs

function dialogPost(ctx, kind, args) {
  const message = args.length ? txtList(args[0]).join('\n') : '';
  const title = args.length > 1 ? txt(args[1]) : '';
  const icon = args.length > 2 && isTxt(args[2]) ? lower(txt(args[2])) : kind === 'errordlg' ? 'error' : kind === 'warndlg' ? 'warn' : kind === 'helpdlg' ? 'help' : 'none';
  const st = G(ctx);
  st.dialogSeq = (st.dialogSeq || 0) + 1;
  flush(ctx);
  ctx.host.post({ type: 'graphics.dialog', id: st.dialogSeq, kind, title, message, icon });
  return handleValue(ctx, []);
}

function waitbarBuiltin(args, nargout, ctx) {
  const st = G(ctx);
  const x = args.length ? nums(args[0])[0] : 0;
  let f = null, msg = null, k = 1;
  if (args.length > 1 && isHandleValue(args[1])) { [f] = objsOf(ctx, args[1]); k = 2; }
  if (args.length > k && !isHandleValue(args[k]) && (isTxt(args[k]) || isCell(args[k])) && (args.length - k) % 2 === 1) { msg = txtList(args[k]).join('\n'); k++; }
  if (!f) {
    f = newFigure(ctx, null);
    f.props.Name = 'Progress';
    f.props.Position = [f.props.Position[0], f.props.Position[1], 360, 76];
    f.props.NumberTitle = false;
    f.props.HandleVisibility = 'on';
    f.internal.waitbar = true;
    const w = create(ctx, 'waitbar', f.id, { Value: 0, Message: '' });
    f.internal.waitbarId = w.id;
  }
  const w = st.objs.get(f.internal.waitbarId);
  if (!w) throw gerr('waitbar:handle', 'The handle is not a wait bar.');
  w.props.Value = Math.max(0, Math.min(1, x));
  if (msg != null) w.props.Message = msg;
  for (let i = k; i + 1 < args.length; i += 2) { const n = txt(args[i]); if (lower(n) === 'name') f.props.Name = txt(args[i + 1]); else if (findProp('figure', n)) setProp(ctx, f, n, args[i + 1]); }
  touch(st, w);
  flush(ctx);
  return handleValue(ctx, [f.id]);
}

export const builtins = {
  print: printBuiltin,
  saveas: saveasBuiltin,
  exportgraphics: exportgraphicsBuiltin,
  getframe: getframeBuiltin,
  frame2im(args) {
    const F = args[0];
    if (!isStruct(F)) throw gerr('frame2im:args', 'frame2im needs a movie frame struct.');
    return [F.data[0].cdata, F.data[0].colormap || empty()];
  },
  im2frame(args) { return structOf({ cdata: args[0], colormap: args[1] || empty() }); },
  movie(args, nargout, ctx) {
    const F = args[args.length && isHandleValue(args[0]) ? 1 : 0];
    if (!isStruct(F)) throw gerr('movie:args', 'movie needs an array of frames.');
    ctx.host.post({ type: 'graphics.movie', frames: F.data.length });
    return [];
  },

  uifigure(args, nargout, ctx) {
    const f = newFigure(ctx, null, { ui: true });
    setPairs(ctx, [f], args);
    flush(ctx);
    return handleValue(ctx, [f.id]);
  },
  uiaxes(args, nargout, ctx) {
    const { parent, rest } = parentAndRest(ctx, args);
    const f = parent.type === 'figure' ? parent : figureOf(G(ctx), parent);
    const ax = newAxes(ctx, f, 'uiaxes', {}, parent.type === 'figure' ? null : parent.id);
    // pixel Position → normalized
    const pi = rest.findIndex((v, i) => i % 2 === 0 && isTxt(v) && lower(txt(v)) === 'position');
    if (pi >= 0) {
      const p = Array.from(nums(rest[pi + 1]));
      const [, , W, H] = f.props.Position;
      if (p.some((x) => x > 1)) { ax.props.OuterPosition = [(p[0] - 1) / W, (p[1] - 1) / H, p[2] / W, p[3] / H]; rest.splice(pi, 2); }
    } else ax.props.OuterPosition = [10 / 560, 10 / 420, 300 / 560, 185 / 420];
    setPairs(ctx, [ax], rest);
    makeCurrentAxes(ctx, ax);
    flush(ctx);
    return handleValue(ctx, [ax.id]);
  },
  uicontrol(args, nargout, ctx) {
    const o = uiComponent(ctx, 'uicontrol', args);
    return handleValue(ctx, [o.id]);
  },
  uipanel(args, nargout, ctx) { return handleValue(ctx, [uiComponent(ctx, 'uipanel', args).id]); },
  uibutton(args, nargout, ctx) {
    let a = args;
    const lead = a.length && isHandleValue(a[0]) ? [a[0]] : [];
    let rest = a.slice(lead.length);
    if (rest.length % 2 === 1 && isTxt(rest[0])) rest = rest.slice(1); // style ('push' | 'state')
    return handleValue(ctx, [uiComponent(ctx, 'uibutton', [...lead, ...rest]).id]);
  },
  uislider(args, nargout, ctx) { return handleValue(ctx, [uiComponent(ctx, 'uislider', args).id]); },
  uieditfield(args, nargout, ctx) {
    const lead = args.length && isHandleValue(args[0]) ? [args[0]] : [];
    let rest = args.slice(lead.length);
    let numeric = false;
    if (rest.length % 2 === 1 && isTxt(rest[0])) { numeric = lower(txt(rest[0])) === 'numeric'; rest = rest.slice(1); }
    const { parent } = parentAndRest(ctx, lead.length ? lead : []);
    const o = create(ctx, 'uieditfield', parent.id, {});
    o.internal.numeric = numeric;
    o.props.Value = numeric ? num(0) : str('');
    setPairs(ctx, [o], rest);
    flush(ctx);
    return handleValue(ctx, [o.id]);
  },
  uilabel(args, nargout, ctx) { return handleValue(ctx, [uiComponent(ctx, 'uilabel', args).id]); },
  uidropdown(args, nargout, ctx) { return handleValue(ctx, [uiComponent(ctx, 'uidropdown', args).id]); },
  uicheckbox(args, nargout, ctx) { return handleValue(ctx, [uiComponent(ctx, 'uicheckbox', args).id]); },

  msgbox(args, nargout, ctx) { const h = dialogPost(ctx, 'msgbox', args); return nargout ? h : []; },
  errordlg(args, nargout, ctx) { const h = dialogPost(ctx, 'errordlg', args); return nargout ? h : []; },
  warndlg(args, nargout, ctx) { const h = dialogPost(ctx, 'warndlg', args); return nargout ? h : []; },
  helpdlg(args, nargout, ctx) { const h = dialogPost(ctx, 'helpdlg', args); return nargout ? h : []; },
  questdlg(args, nargout, ctx) {
    const question = args.length ? txtList(args[0]).join('\n') : '';
    const title = args.length > 1 ? txt(args[1]) : '';
    let buttons = args.slice(2).map((v) => txt(v));
    let def = null;
    if (buttons.length >= 2 && buttons.length <= 4) { def = buttons[buttons.length - 1]; buttons = buttons.slice(0, -1); }
    if (!buttons.length) { buttons = ['Yes', 'No', 'Cancel']; def = 'Yes'; }
    flush(ctx);
    const r = ctx.host.request({ type: 'graphics.dialog', kind: 'questdlg', title, message: question, buttons, default: def });
    return str(r && typeof r.answer === 'string' ? r.answer : '');
  },
  inputdlg(args, nargout, ctx) {
    const prompts = args.length ? txtList(args[0]) : ['Enter value:'];
    const title = args.length > 1 ? txt(args[1]) : '';
    const defaults = args.length > 3 ? txtList(args[3]) : prompts.map(() => '');
    flush(ctx);
    const r = ctx.host.request({ type: 'graphics.dialog', kind: 'inputdlg', title, prompts, defaults });
    if (!r || r.cancelled || !Array.isArray(r.values)) return cell([0, 0], []);
    return cell([r.values.length, 1], r.values.map((s) => str(String(s))));
  },
  listdlg(args, nargout, ctx) {
    const opts = {};
    for (let i = 0; i + 1 < args.length; i += 2) opts[lower(txt(args[i]))] = args[i + 1];
    if (!opts.liststring) throw gerr('listdlg:args', "listdlg needs 'ListString'.");
    const items = txtList(opts.liststring);
    flush(ctx);
    const r = ctx.host.request({
      type: 'graphics.dialog', kind: 'listdlg', items, title: opts.name ? txt(opts.name) : '', prompt: opts.promptstring ? txtList(opts.promptstring).join('\n') : '',
      multiple: !opts.selectionmode || lower(txt(opts.selectionmode)) !== 'single', initial: opts.initialvalue ? Array.from(nums(opts.initialvalue)) : [1],
    });
    if (!r || r.cancelled) return [tensor('double', [1, 0]), bool(false)];
    return [rowVec(r.indices || []), bool(true)];
  },
  uigetfile(args, nargout, ctx) { return fileDialog(ctx, 'uigetfile', args); },
  uiputfile(args, nargout, ctx) { return fileDialog(ctx, 'uiputfile', args); },
  waitbar: waitbarBuiltin,
  uiwait(args, nargout, ctx) {
    const f = args.length ? objsOf(ctx, args[0])[0] : currentFigure(ctx, false);
    flush(ctx);
    if (f) ctx.host.request({ type: 'graphics.uiwait', figure: f.id, timeout: args.length > 1 ? nums(args[1])[0] : null });
    return [];
  },
  uiresume(args, nargout, ctx) { ctx.host.post({ type: 'graphics.uiresume' }); return []; },
  ginput(args, nargout, ctx) {
    const n = args.length ? nums(args[0])[0] : Infinity;
    const f = currentFigure(ctx, true);
    flush(ctx);
    const r = needGui(ctx.host.request({ type: 'graphics.ginput', figure: f.id, n: Number.isFinite(n) ? n : 0 }), 'ginput');
    const pts = r.points || [];
    const col = (k) => tensor('double', [pts.length, 1], pts.map((p) => p[k] ?? 1));
    return [col(0), col(1), col(2)];
  },
  waitforbuttonpress(args, nargout, ctx) {
    const f = currentFigure(ctx, true);
    flush(ctx);
    const r = ctx.host.request({ type: 'graphics.ginput', figure: f.id, n: 1 });
    return num(r && r.key ? 1 : 0);
  },
};

function fileDialog(ctx, kind, args) {
  const filter = args.length ? txtList(args[0]) : ['*.*'];
  const title = args.length > 1 ? txt(args[1]) : '';
  const def = args.length > 2 ? txt(args[2]) : '';
  flush(ctx);
  const r = ctx.host.request({ type: 'graphics.dialog', kind, filter, title, defaultName: def, cwd: ctx.fs.cwd() });
  if (!r || r.cancelled) return [num(0), num(0), num(0)];
  let path = String(r.path || '');
  if (path && !path.endsWith('/')) path += '/';
  return [str(String(r.file || '')), str(path), num(1)];
}

// ---------------------------------------------------------------- GUI → engine messages

function silently(st, fn) {
  const before = new Set(st.dirty);
  fn();
  for (const id of [...st.dirty]) if (!before.has(id)) st.dirty.delete(id);
}

/** Handles one GUI → engine message (see PROTOCOL.md §4). */
export function handleMessage(ctx, msg) {
  const st = G(ctx);
  switch (msg.type) {
    case 'graphics.sync': flush(ctx, true); return;
    case 'graphics.current': { const f = st.objs.get(msg.id); if (f && f.type === 'figure') { const root = st.objs.get(0); root.props.CurrentFigure = f.id; root.children = [f.id, ...root.children.filter((c) => c !== f.id)]; st.lastCurrent = f.id; } return; }
    case 'graphics.currentAxes': { const ax = st.objs.get(msg.id); if (ax && isAxesType(ax.type)) silently(st, () => makeCurrentAxes(ctx, ax)); st.lastCurrent = st.objs.get(0).props.CurrentFigure; return; }
    case 'graphics.set': {
      const o = st.objs.get(msg.handle);
      if (!o) return;
      silently(st, () => {
        for (const [k, v] of Object.entries(msg.props || {})) {
          try { setProp(ctx, o, k, valueJsToValue(v)); } catch (e) { ctx.warning('graphics:set', e.message); }
        }
      });
      return;
    }
    case 'graphics.resize': {
      const f = st.objs.get(msg.id);
      if (!f || !(msg.width > 0)) return;
      silently(st, () => { f.props.Position = [f.props.Position[0], f.props.Position[1], Math.round(msg.width), Math.round(msg.height)]; });
      const cb = f.props.SizeChangedFcn || f.props.ResizeFcn;
      if (cb) { invokeCallback(ctx, cb, f, eventData(ctx, f, 'SizeChanged')); flush(ctx); }
      return;
    }
    case 'graphics.close': {
      const f = st.objs.get(msg.id);
      if (!f) { ctx.host.post({ type: 'graphics.close', id: msg.id }); return; }
      if (f.props.CloseRequestFcn) {
        try { invokeCallback(ctx, f.props.CloseRequestFcn, f, eventData(ctx, f, 'Close')); } catch (e) { ctx.errOut(`${e.message}\n`); }
      } else destroy(ctx, f.id);
      flush(ctx);
      return;
    }
    case 'graphics.callback': {
      const o = st.objs.get(msg.handle);
      if (!o) return;
      const prev = {};
      silently(st, () => {
        for (const [k, v] of Object.entries(msg.props || {})) {
          try { const e = findProp(o.type, k); prev[k] = o.props[e ? e[0] : k]; setProp(ctx, o, k, valueJsToValue(v)); } catch (e) { ctx.warning('graphics:callback', e.message); }
        }
      });
      const ev = msg.event || 'Callback';
      const cbName = {
        ButtonPushed: 'ButtonPushedFcn', ValueChanged: 'ValueChangedFcn', ValueChanging: 'ValueChangingFcn', ButtonDown: 'ButtonDownFcn', KeyPress: 'KeyPressFcn',
        WindowButtonDown: 'WindowButtonDownFcn', WindowButtonUp: 'WindowButtonUpFcn', WindowKeyPress: 'WindowKeyPressFcn', Callback: 'Callback', ItemHit: 'ItemHitFcn',
      }[ev] || 'Callback';
      const e = findProp(o.type, cbName);
      const cb = e ? o.props[e[0]] : null;
      if (cb) {
        const extra = {};
        if ('Value' in (msg.props || {})) { extra.Value = valueJsToValue(msg.props.Value); extra.PreviousValue = prev.Value != null && prev.Value.cls ? prev.Value : valueJsToValue(prev.Value ?? null); }
        if (msg.data && msg.data.key) { extra.Key = str(String(msg.data.key)); extra.Character = str(String(msg.data.character || '')); }
        if (msg.data && msg.data.point) extra.IntersectionPoint = rowVec(msg.data.point);
        if (msg.data && msg.data.point && o.type !== 'figure') { const ax = st.objs.get(o.parent); if (ax && isAxesType(ax.type)) ax.props.CurrentPoint = { dims: [2, 3], data: Float64Array.from([msg.data.point[0], msg.data.point[0], msg.data.point[1], msg.data.point[1], msg.data.point[2] || 0, msg.data.point[2] || 0]) }; }
        try { invokeCallback(ctx, cb, o, eventData(ctx, o, ev, extra)); } catch (err) { ctx.errOut(`Error in callback: ${err.message}\n`); }
      }
      flush(ctx);
      return;
    }
    default: return;
  }
}

export function install(ctx) {
  G(ctx);
  if (typeof ctx.onMessage === 'function') ctx.onMessage('graphics.', (msg) => handleMessage(ctx, msg));
}

export { valueJsToValue, exportFigure, getObj, mustObj, makeCurrentFigure, handleIds };
