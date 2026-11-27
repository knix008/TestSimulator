// The main window's side of the tool windows (src/tools/toolwin.js): each request names an operation; it runs on
// the active document through the core and the answer goes back to the window that asked.
import { call as core, fromBase64, openBytes, toBase64 } from '../core/core.js';
import * as native from '../platform/native.js';
import { t } from '../i18n.js';
import { TEMPLATES_KEY } from '../domain/settings.js';
import { baseName } from '../hex/editor.js';

const loadJson = (key, fallback) => { try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const saveJson = (key, value) => { try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* full */ } };
export const userTemplates = () => loadJson(TEMPLATES_KEY, []);

/**
 * app: { editor, settings(), updateSettings, notify, popups, withProgress, copyText, openCompare(a, b, mode), runTemplate(tab, opts),
 *        openDocWindow(kind), desktop, openFileDialog() → tab }
 */
export function createToolHost(app) {
  const need = () => {
    const tab = app.editor.active();
    if (!tab?.view) throw new Error(t('tool.noDocument'));
    return tab;
  };
  const scope = (tab, which) => {
    const sel = tab.view.selection();
    if (which === 'selection') { if (!sel.length) throw new Error(t('tool.noSelection')); return { offset: sel.start, length: sel.length }; }
    return { offset: 0, length: tab.doc.len };
  };
  const remember = (pattern) => {
    const list = [{ kind: pattern.kind, value: pattern.value }, ...app.settings().searchHistory.filter((x) => !(x.kind === pattern.kind && x.value === pattern.value))].slice(0, 30);
    app.updateSettings({ searchHistory: list, searchKind: pattern.kind, searchEncoding: pattern.encoding ?? app.settings().searchEncoding, searchCase: pattern.caseSensitive !== false }, { quiet: true });
  };

  async function find(tab, args, backwards) {
    const sc = scope(tab, args.scope);
    const sel = tab.view.selection();
    const from = backwards ? (sel.length ? sel.start : tab.view.caret) : (sel.length ? sel.start + 1 : tab.view.caret + (tab.lastMatchAt === tab.view.caret ? 1 : 0));
    const r = await app.withProgress('progress.search', tab.doc.name, (op) => core('search', { id: tab.doc.id, pattern: args.pattern, from, backwards, wrap: args.wrap !== false, ...sc }, op), { cancellable: true, delay: 400 });
    remember(args.pattern);
    app.lastSearch = { pattern: args.pattern, wrap: args.wrap, scope: args.scope };
    if (!r.match) return { found: false, message: t('find.notFound') };
    tab.view.select(r.match.offset, r.match.offset + r.match.length, { center: true });
    tab.lastMatchAt = r.match.offset;
    return { found: true, match: r.match, message: r.wrapped ? t('find.wrapped', { offset: r.match.offset.toString(16).toUpperCase() }) : t('find.foundAt', { offset: r.match.offset.toString(16).toUpperCase() }) };
  }

  const ops = {
    async core({ method, args = {} }) {
      const tab = app.editor.active();
      if (args.id === 'active') args = { ...args, id: tab?.doc.id };
      return core(method, args);
    },
    select({ offset, length }) { const tab = need(); tab.view.select(offset, offset + Math.max(1, length), { center: true }); tab.view.focus(); return true; },
    async copy({ text }) { await app.copyText(text); return true; },
    async findNext(args) { return find(need(), args, false); },
    async findPrev(args) { return find(need(), args, true); },
    async findAll(args) {
      const tab = need();
      const sc = scope(tab, args.scope);
      const r = await app.withProgress('progress.search', tab.doc.name, (op) => core('findAll', { id: tab.doc.id, pattern: args.pattern, limit: app.settings().findAllLimit, ...sc }, op), { cancellable: true, delay: 400 });
      remember(args.pattern);
      tab.doc.marks.search = r.matches.slice(0, 50000).map(([o, l]) => ({ start: o, end: o + l }));
      tab.view.schedule();
      // A short preview of the first matches.
      const previews = [];
      for (const [o] of r.matches.slice(0, 300)) {
        await tab.doc.ensure(o, 12);
        previews.push([...tab.doc.slice(o, 12)].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
      }
      if (r.matches[0]) tab.view.select(r.matches[0][0], r.matches[0][0] + r.matches[0][1], { center: true });
      return { ...r, previews, message: t('find.results', { n: r.count.toLocaleString() }) };
    },
    async count(args) {
      const tab = need();
      const sc = scope(tab, args.scope);
      const r = await app.withProgress('progress.search', tab.doc.name, (op) => core('findAll', { id: tab.doc.id, pattern: args.pattern, countOnly: true, ...sc }, op), { cancellable: true, delay: 400 });
      return { found: r.count > 0, message: t('find.countResult', { n: r.count.toLocaleString() }) };
    },
    async replace(args) {
      const tab = need();
      const sel = tab.view.selection();
      // The selection is a match: replace it, then find the next one.
      if (sel.length) {
        const check = await core('search', { id: tab.doc.id, pattern: args.pattern, from: sel.start, wrap: false, offset: sel.start, length: sel.length });
        if (check.match && check.match.offset === sel.start && check.match.length === sel.length) {
          const data = await replacementBytes(args.replacement);
          await app.editor.edit(tab.doc, 'replace', { offset: sel.start, length: sel.length, data, kind: 'replace' });
          tab.view.select(sel.start + data.length, sel.start + data.length);
        }
      }
      return find(tab, args, false);
    },
    async replaceAll(args) {
      const tab = need();
      const sc = scope(tab, args.scope);
      const r = await app.withProgress('progress.replace', tab.doc.name, (op) => core('replaceAll', { id: tab.doc.id, pattern: args.pattern, replacement: args.replacement, ...sc }, op), { cancellable: true });
      tab.doc.changed(r.info);
      remember(args.pattern);
      return { found: r.count > 0, message: t('find.replaced', { n: r.count.toLocaleString() }) };
    },
    clearMarks() { const tab = app.editor.active(); if (tab) { tab.doc.marks.search = []; tab.view?.schedule(); } return true; },
    goto({ value, mode, base, select }) {
      const tab = need();
      const text = String(value ?? '').trim();
      if (!text) return { error: t('goto.empty') };
      let n;
      try {
        const clean = text.replace(/[\s_]/g, '');
        n = /^0x/i.test(clean) || /h$/i.test(clean) ? parseInt(clean.replace(/^0x/i, '').replace(/h$/i, ''), 16) : /^\d+$/.test(clean) && base === 'dec' ? parseInt(clean, 10) : /^[0-9a-f]+$/i.test(clean) ? parseInt(clean, base === 'dec' ? 10 : 16) : NaN;
      } catch { n = NaN; }
      if (!Number.isFinite(n)) return { error: t('goto.bad', { value: text }) };
      const base0 = app.settings().baseAddress || 0;
      const caret = tab.view.caret;
      const to = mode === 'forward' ? caret + n : mode === 'back' ? caret - n : mode === 'end' ? tab.doc.len - n : n - (n >= base0 ? base0 : 0);
      if (to < 0 || to > tab.doc.len) return { error: t('goto.outside', { len: tab.doc.len.toLocaleString() }) };
      if (select) { const a = Math.min(caret, to); const b = Math.max(caret, to); tab.view.select(a, b, { center: true }); } else tab.view.setCaret(to, { reveal: true });
      tab.view.reveal(to, { center: true });
      tab.view.focus();
      return { ok: true };
    },
    async strings({ minLength, encodings, scope: which }) {
      const tab = need();
      const sc = scope(tab, which);
      app.updateSettings({ stringsMin: minLength, stringsEncodings: encodings.length ? encodings : ['ascii'] }, { quiet: true });
      return app.withProgress('progress.strings', tab.doc.name, (op) => core('strings', { id: tab.doc.id, minLength, encodings, limit: 100000, ...sc }, op), { cancellable: true });
    },
    async disasm({ arch, syntax, offset, base, length, max }) {
      const tab = need();
      app.updateSettings({ disasmArch: arch, disasmSyntax: syntax }, { quiet: true });
      const sel = tab.view.selection();
      const start = offset ?? (sel.length ? sel.start : tab.view.caret);
      const baseAddr = base == null || base === '' ? start + (app.settings().baseAddress || 0) : parseInt(String(base).replace(/^0x/i, ''), 16) + (start - (offset ?? start));
      const r = await core('disasm', { id: tab.doc.id, offset: start, length: sel.length && offset == null ? Math.min(sel.length, 1 << 20) : length, arch, syntax, base: Number.isFinite(baseAddr) ? baseAddr : start, max });
      return { ...r, start };
    },
    async valueAtCaret({ width }) {
      const tab = need();
      const n = width / 8;
      const bytes = await tab.doc.read(tab.view.caret, n);
      const ordered = app.settings().endian === 'le' ? [...bytes].reverse() : [...bytes];
      return { expr: `0x${ordered.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase() || '0'}` };
    },
    async writeValue({ expr, width }) {
      const tab = need();
      const r = await core('evaluate', { expr, width });
      const text = r.hex.replace(/^0x/i, '').padStart(width / 4, '0');
      const be = text.match(/../g).map((x) => parseInt(x, 16));
      const data = Uint8Array.from(app.settings().endian === 'le' ? be.reverse() : be);
      await app.editor.edit(tab.doc, 'write', { offset: tab.view.caret, data, kind: 'calc' });
      return true;
    },
    async carve({ types }) {
      const tab = need();
      return app.withProgress('progress.carve', tab.doc.name, (op) => core('carve', { id: tab.doc.id, types, limit: 5000 }, op), { cancellable: true });
    },
    async extract({ offset, length, name }) {
      const tab = need();
      const info = await core('extract', { id: tab.doc.id, offset, length, name });
      await app.editor.addDocument(info, { kind: 'memory' });
      return true;
    },
    async saveRange({ offset, length, name }) { return app.editor.saveRange(need().doc, offset, length, name); },
    async saveCarved({ items }) {
      const tab = need();
      if (!app.desktop) { for (const x of items) await app.editor.saveRange(tab.doc, x.offset, x.length, `carved-${x.offset.toString(16).toUpperCase().padStart(8, '0')}.${x.ext}`); return true; }
      const dir = await native.chooseFolder(app.settings().lastDirectory);
      if (!dir) return false;
      await app.withProgress('progress.carve', baseName(dir), async (op) => { for (const x of items) await native.invoke('hex_save_range', { id: tab.doc.id, offset: x.offset, length: x.length, path: `${dir}${dir.includes('\\') ? '\\' : '/'}carved-${x.offset.toString(16).toUpperCase().padStart(8, '0')}.${x.ext}`, op }); });
      app.notify('success', t('carve.savedAll', { n: items.length, dir }));
      return true;
    },
    disks() { return native.invoke('hex_list_disks'); },
    processes() { return native.invoke('hex_list_processes'); },
    async openDisk({ path, name }) { await app.editor.openDisk({ path, name }); return true; },
    async openProcess({ pid, name }) { await app.editor.openProcess({ pid, name }); return true; },
    docs() {
      const active = app.editor.active();
      return app.editor.tabs.filter((x) => x.kind === 'hex').map((x) => ({ id: x.doc.id, name: x.doc.name, len: x.doc.len, active: x === active }));
    },
    async openForCompare() { const tab = await app.openFileDialog({ activate: false }); return tab ? { id: tab.doc.id } : null; },
    async compare({ a, b, mode }) { app.updateSettings({ compareMode: mode }, { quiet: true }); await app.openCompare(a, b, mode); return true; },
    async templates() {
      const tab = app.editor.active();
      return { builtins: await core('templates'), users: userTemplates(), current: tab?.doc.template?.template ?? null };
    },
    async templateSource({ template }) {
      if (template.startsWith('user:')) { const u = userTemplates().find((x) => x.id === template.slice(5)); return { source: u?.source ?? '', name: u?.name ?? '' }; }
      return core('templateSource', { template });
    },
    async runTemplate({ source, offset, name }) {
      const tab = need();
      const start = parseInt(String(offset ?? '0').replace(/^0x/i, ''), /^0x/i.test(String(offset)) ? 16 : 10) || 0;
      return app.runTemplate(tab, { source, offset: start, name });
    },
    saveTemplate({ source, name, id }) {
      if (!name?.trim()) throw new Error(t('template.needName'));
      const list = userTemplates();
      const key = id ?? `t${Date.now().toString(36)}`;
      const i = list.findIndex((x) => x.id === key);
      const entry = { id: key, name: name.trim(), source };
      if (i >= 0) list[i] = entry; else list.push(entry);
      saveJson(TEMPLATES_KEY, list);
      app.notify('success', t('template.saved', { name: entry.name }));
      return { id: key, users: list };
    },
    deleteTemplate({ id }) { const list = userTemplates().filter((x) => x.id !== id); saveJson(TEMPLATES_KEY, list); return { users: list }; },
    async loadTemplateFile() {
      if (app.desktop) {
        const [path] = await native.chooseFiles(app.settings().lastDirectory, [native.SAVE_TYPES.hexpat, native.SAVE_TYPES.all], false);
        if (!path) return null;
        return { source: await native.readTextFile(path, ''), name: baseName(path).replace(/\.[^.]+$/, '') };
      }
      const [picked] = await native.pickOpenWeb(false);
      return picked ? { source: await picked.file.text(), name: picked.file.name.replace(/\.[^.]+$/, '') } : null;
    },
    async saveTemplateFile({ source, name }) {
      if (app.desktop) {
        const path = await native.chooseSavePath(`${name}.hexpat`, ['hexpat']);
        if (!path) return false;
        await native.writeTextFile(path, source, '');
      } else await native.saveFileWeb(source, { name: `${name}.hexpat`, saveAs: true, mime: 'text/plain' });
      app.notify('success', t('notice.saved', { name }));
      return true;
    },
    help({ topic }) { app.openDocWindow('guide', topic); return true; },
    async history() { return core('history', { id: need().doc.id }); },
    async gotoHistory({ depth }) { const tab = need(); const info = await core('gotoHistory', { id: tab.doc.id, depth }); tab.doc.changed(info); return true; },
    /** The data processor: evaluates a node graph (tools/processor.js) with the core; a preview per node. */
    async evaluateGraph({ graph }) {
      const tab = app.editor.active();
      const nodes = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
      const inputs = (id) => graph.links.filter((l) => l.to === id).sort((a, b) => a.port - b.port).map((l) => l.from);
      const memo = new Map();
      const LIMIT = 64 << 20;
      const hexOf = (b, n = 48) => [...b.subarray(0, n)].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ') + (b.length > n ? ' …' : '');
      const viaDoc = async (bytes, method, args) => {
        const doc = await core('new', { name: 'processor', data: toBase64(bytes) }, 'processor');
        try {
          if (method === 'transform') {
            const r = await core('transform', { id: doc.id, target: 'new', name: 'processor', ...args }, 'processor');
            try { return fromBase64((await core('slice', { id: r.id }, 'processor')).data); } finally { await core('close', { id: r.id }); }
          }
          await core(method, { id: doc.id, ...args }, 'processor');
          return fromBase64((await core('slice', { id: doc.id }, 'processor')).data);
        } finally { await core('close', { id: doc.id }); }
      };
      const num = (v, d = 0) => { const s = String(v ?? '').trim(); const n = /^0x/i.test(s) ? parseInt(s, 16) : Number(s); return Number.isFinite(n) ? n : d; };
      async function value(id, depth = 0) {
        if (depth > 64) throw new Error(t('processor.cycle'));
        if (memo.has(id)) return memo.get(id);
        const n = nodes[id];
        const ins = [];
        for (const from of inputs(id)) ins.push(await value(from, depth + 1));
        const need = (count) => { if (ins.length < count) throw new Error(t('processor.needInput')); };
        const p = n.params ?? {};
        let out;
        switch (n.kind) {
          case 'selection': case 'document': {
            if (!tab?.view) throw new Error(t('tool.noDocument'));
            const sel = tab.view.selection();
            const [o, l] = n.kind === 'selection' && sel.length ? [sel.start, sel.length] : [0, tab.doc.len];
            if (l > LIMIT) throw new Error(t('processor.tooLarge'));
            out = await tab.doc.read(o, l);
            break;
          }
          case 'constHex': { const d = String(p.hex ?? 'DE AD BE EF').replace(/0x/gi, '').replace(/[^0-9a-f]/gi, ''); out = Uint8Array.from(d.match(/../g) ?? [], (x) => parseInt(x, 16)); break; }
          case 'constText': out = fromBase64((await core('encode', { text: p.text ?? 'Hello', encoding: p.encoding ?? 'utf8' })).data); break;
          case 'operation': need(1); out = await viaDoc(ins[0], 'operation', { op: p.op ?? 'xor', operand: p.operand ?? '0xFF', width: Number(p.width ?? 1), endian: app.settings().endian }); break;
          case 'transform': need(1); out = await viaDoc(ins[0], 'transform', { kind: p.kind ?? 'base64Encode', key: p.key ?? '', iv: p.iv ?? '', mode: p.mode ?? 'cbc' }); break;
          case 'slice': need(1); { const o = num(p.offset, 0); out = ins[0].slice(o, o + num(p.length, ins[0].length)); } break;
          case 'concat': need(2); out = new Uint8Array(ins[0].length + ins[1].length); out.set(ins[0]); out.set(ins[1], ins[0].length); break;
          case 'repeat': need(1); { const c = Math.max(0, Math.min(1 << 20, num(p.count, 2))); if (ins[0].length * c > LIMIT) throw new Error(t('processor.tooLarge')); out = new Uint8Array(ins[0].length * c); for (let i = 0; i < c; i += 1) out.set(ins[0], i * ins[0].length); } break;
          case 'xorWith': need(2); out = ins[0].map((b, i) => b ^ (ins[1].length ? ins[1][i % ins[1].length] : 0)); break;
          case 'hash': {
            need(1);
            const doc = await core('new', { name: 'hash', data: toBase64(ins[0]) }, 'processor');
            try {
              const r = await core('hash', { id: doc.id, algorithms: [p.algorithm ?? 'sha256'] }, 'processor');
              const hex = r.results[0].value;
              out = p.as === 'text' ? new TextEncoder().encode(hex) : Uint8Array.from(hex.match(/../g) ?? [], (x) => parseInt(x, 16));
            } finally { await core('close', { id: doc.id }); }
            break;
          }
          case 'showHex': need(1); out = ins[0]; break;
          case 'newTab': need(1); out = ins[0]; await app.editor.openBytesAs(out, p.name || 'processed-data.bin'); break;
          case 'writeCaret': {
            need(1);
            out = ins[0];
            if (!tab?.view) throw new Error(t('tool.noDocument'));
            const sel = tab.view.selection();
            if (sel.length) await app.editor.edit(tab.doc, 'replace', { offset: sel.start, length: sel.length, data: out, kind: 'processor' });
            else await app.editor.edit(tab.doc, app.settings().insertMode ? 'insert' : 'write', { offset: tab.view.caret, data: out, kind: 'processor' });
            break;
          }
          default: throw new Error(`unknown node ${n.kind}`);
        }
        memo.set(id, out);
        return out;
      }
      const result = {};
      const order = graph.nodes.map((n) => n.id);
      return app.withProgress('progress.method.operation', t('tool.processor'), async (op, report) => {
        for (const [i, id] of order.entries()) {
          report({ fraction: i / order.length, text: t(`processor.node.${nodes[id].kind}`) });
          try {
            const bytes = await value(id);
            const n = nodes[id];
            result[id] = { length: bytes.length, hex: hexOf(bytes), text: n.kind === 'hash' && n.params?.as === 'text' ? new TextDecoder().decode(bytes) : undefined };
          } catch (error) { result[id] = { error: native.errorText(error) }; }
        }
        return { nodes: result };
      }, { delay: 300 });
    },
    async yaraScan({ rules, scope: which }) {
      const tab = need();
      const sc = scope(tab, which);
      const r = await app.withProgress('progress.method.yara', tab.doc.name, (op) => core('yara', { id: tab.doc.id, rules, limit: 10000, ...sc }, op), { cancellable: true, delay: 300 });
      for (const m of r.matches) for (const s of m.strings) tab.doc.marks.search.push({ start: s.offset, end: s.offset + s.length });
      tab.view?.schedule();
      return r;
    },
    async fsOpen({ offset, id, name }) {
      const tab = need();
      const r = await core('fsRead', { id: tab.doc.id, offset, file: id, max: 512 << 20 }, 'fsread');
      await app.editor.openBytesAs(fromBase64(r.data), name || r.name);
      return true;
    },
    async fsSave({ offset, id, name }) {
      const tab = need();
      const r = await core('fsRead', { id: tab.doc.id, offset, file: id, max: 512 << 20 }, 'fsread');
      const bytes = fromBase64(r.data);
      if (app.desktop) {
        const path = await native.chooseSavePath(name || r.name, ['all']);
        if (!path) return false;
        await native.writeBase64File(path, r.data, '');
      } else await native.saveFileWeb(bytes, { name: name || r.name, saveAs: true, mime: 'application/octet-stream' });
      app.notify('success', t('notice.saved', { name: name || r.name }));
      return true;
    },
    async loadTextFile({ types = [] } = {}) {
      if (app.desktop) {
        const [path] = await native.chooseFiles(app.settings().lastDirectory, [{ name: types.join(', ') || 'Text', extensions: types.length ? [...types, 'txt'] : ['*'] }, native.SAVE_TYPES.all], false);
        return path ? { source: await native.readTextFile(path, ''), name: baseName(path) } : null;
      }
      const [picked] = await native.pickOpenWeb(false);
      return picked ? { source: await picked.file.text(), name: picked.file.name } : null;
    },
    async saveTextFile({ source, name }) {
      if (app.desktop) {
        const path = await native.chooseSavePath(name, ['all']);
        if (!path) return false;
        await native.writeTextFile(path, source, '');
      } else await native.saveFileWeb(new Blob([source], { type: 'text/plain' }), { name, saveAs: true, mime: 'text/plain' });
      app.notify('success', t('notice.saved', { name }));
      return true;
    },
    async pickFolder() {
      const dir = await native.chooseFolder(app.settings().lastDirectory);
      return dir ? { path: dir, name: `${baseName(dir)}/`, dir: true } : null;
    },
    async findInFiles({ pattern, files, recursive }) {
      remember(pattern);
      if (app.desktop) {
        return app.withProgress('progress.method.search', t('find.inFiles'), (op) => native.invoke('hex_find_in_files', { paths: files.map((f) => f.path), recursive, pattern, limit: app.settings().findAllLimit, op }), { delay: 300, cancellable: true });
      }
      // Web: each picked file goes into the core in turn, is searched and given back.
      return app.withProgress('progress.method.search', t('find.inFiles'), async (op, report) => {
        const out = [];
        const list = files.map((f) => app.webFiles?.[f.web]).filter(Boolean);
        for (const [i, file] of list.entries()) {
          report({ fraction: i / list.length, text: file.name });
          const info = await openBytes(new Uint8Array(await file.arrayBuffer()), file.name);
          try {
            const r = await core('findAll', { id: info.id, pattern, limit: app.settings().findAllLimit - out.length }, 'find-in-files');
            for (const [offset, length] of r.matches) out.push({ path: file.name, web: files[i].web, offset, length });
          } finally { await core('close', { id: info.id }); }
          if (out.length >= app.settings().findAllLimit) break;
        }
        return { matches: out, files: list.length, searched: list.length, truncated: out.length >= app.settings().findAllLimit };
      }, { delay: 300 });
    },
    async openMatch({ path, web, offset, length }) {
      let tab;
      if (app.desktop) tab = await app.editor.openPath(path);
      else {
        const file = app.webFiles?.[web];
        tab = app.editor.tabs.find((x) => x.doc.name === file?.name) ?? (file ? await app.editor.openWebFile(file) : null);
      }
      if (!tab) return false;
      app.editor.activate(tab.id);
      await new Promise((r) => setTimeout(r, 120));
      tab.view?.select(offset, offset + Math.max(1, length), { center: true });
      return true;
    },
    async pickFiles() {
      if (app.desktop) {
        const paths = await native.chooseAnyFiles(app.settings().lastDirectory, true);
        const sizes = paths.length ? await native.invoke('hex_file_sizes', { paths }).catch(() => paths.map(() => null)) : [];
        return paths.map((path, i) => ({ path, name: baseName(path), size: sizes[i] }));
      }
      const picked = await native.pickOpenWeb(true);
      app.webFiles = [...(app.webFiles ?? []), ...picked.map((x) => x.file)];
      return picked.map((x) => ({ name: x.file.name, size: x.file.size, web: app.webFiles.indexOf(x.file) }));
    },
    async split({ size }) {
      const tab = need();
      const parts = Math.ceil(tab.doc.len / size);
      if (parts > 10000) throw new Error(t('files.tooManyParts', { n: parts }));
      if (app.desktop) {
        const dir = await native.chooseFolder(tab.doc.path ? tab.doc.path.replace(/[\\/][^\\/]*$/, '') : app.settings().lastDirectory);
        if (!dir) return null;
        const written = await app.withProgress('progress.split', tab.doc.name, (op) => native.invoke('hex_split', { id: tab.doc.id, size, dir, name: tab.doc.name, op }));
        return { message: t('files.splitDone', { n: written.length, dir }) };
      }
      for (let i = 0; i < parts; i += 1) await app.editor.saveRange(tab.doc, i * size, Math.min(size, tab.doc.len - i * size), `${tab.doc.name}.${String(i + 1).padStart(3, '0')}`);
      return { message: t('files.splitDone', { n: parts, dir: '' }) };
    },
    async concat({ files }) {
      if (app.desktop) {
        const out = await native.chooseSavePath(files[0]?.name?.replace(/\.\d{3}$/, '') ?? 'joined.bin', ['all']);
        if (!out) return null;
        await app.withProgress('progress.concat', baseName(out), (op) => native.invoke('hex_concat', { paths: files.map((f) => f.path), out, op }));
        await app.editor.openPath(out);
        return { message: t('files.concatDone', { n: files.length, name: baseName(out) }) };
      }
      const chunks = await Promise.all(files.map(async (f) => new Uint8Array(await app.webFiles[f.web].arrayBuffer())));
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const all = new Uint8Array(total);
      let pos = 0;
      for (const c of chunks) { all.set(c, pos); pos += c.length; }
      await app.editor.openBytesAs(all, 'joined.bin');
      return { message: t('files.concatDone', { n: files.length, name: 'joined.bin' }) };
    },
    async wipe({ passes, method }) {
      const [path] = await native.chooseAnyFiles(app.settings().lastDirectory, false);
      if (!path) return null;
      const choice = await app.ask({ kind: 'wipe', icon: 'shred', title: t('files.wipeConfirmTitle'), message: t('files.wipeConfirm', { name: baseName(path), n: passes }), buttons: [{ id: 'cancel', label: t('common.cancel'), primary: true }, { id: 'wipe', label: t('files.wipeRun'), icon: 'shred', danger: true }] });
      if (choice !== 'wipe') return null;
      const open = app.editor.tabs.find((x) => x.doc.path === path);
      if (open) await app.editor.close(open, { force: true });
      await app.withProgress('progress.wipe', baseName(path), (op) => native.invoke('hex_wipe', { path, passes, method, op }));
      return { message: t('files.wipeDone', { name: baseName(path) }) };
    },
  };

  async function replacementBytes(r) {
    if (r.kind === 'text') { const out = await core('encode', { text: r.value, encoding: r.encoding ?? 'utf8' }); return fromBase64(out.data); }
    if (r.kind === 'int') { const v = BigInt(r.value || '0'); const w = Number(r.width) || 4; const bytes = []; for (let i = 0; i < w; i += 1) bytes.push(Number((v >> BigInt(8 * i)) & 0xFFn)); return Uint8Array.from(r.endian === 'be' ? bytes.reverse() : bytes); }
    const digits = String(r.value ?? '').replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
    return Uint8Array.from(digits.match(/../g) ?? [], (x) => parseInt(x, 16));
  }

  /** popups.on('tool', …): runs the request and answers the tool window. */
  async function handle({ tool, op, args, seq }) {
    let result = null;
    let error = null;
    try {
      const fn = ops[op];
      if (!fn) throw new Error(`unknown tool operation ${op}`);
      result = await fn(args ?? {});
    } catch (e) {
      error = native.errorText(e);
    }
    app.popups.post(tool, { type: 'tool-reply', seq, result, error });
  }

  return { handle, ops, replacementBytes, toBase64 };
}
