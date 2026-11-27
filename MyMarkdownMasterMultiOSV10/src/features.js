// What you can do with notes and the vault (Obsidian's core plugins and file menu, plus Bear / Ulysses /
// Typora touches): new notes and folders, rename / move (links updated by the Rust core), delete, duplicate,
// daily notes, unique (Zettelkasten) notes, templates, random note, note composer (merge, extract), bookmarks,
// workspaces, attachments (pasted / dropped pictures), the audio recorder, file recovery and exports.
// `app` is the main window's API (app.js appApi).
import { t } from './i18n.js';
import { extOf, fileNameOf, folderOf, isNote, kindOf, nameOf, normalizePath } from './vault/index.js';
import { openSuggest, promptText, fuzzy } from './ui/palette.js';
import { TEMPLATE_CATEGORIES, TEMPLATE_LIBRARY, templateText } from './domain/template-library.js';

const BAD_NAME = /[\\/:*?"<>|#^[\]]/;
export const validName = (name) => (!name ? t('name.empty') : BAD_NAME.test(name) ? t('name.bad') : null);
const join = (folder, name) => normalizePath(folder ? `${folder}/${name}` : name);

export function createFeatures(app) {
  const now = () => ({ now: Date.now(), offset: -new Date().getTimezoneOffset(), lang: app.lang() });
  const prefs = () => app.settings();

  /** "Untitled", "Untitled 1", … that is free in `folder`. */
  function freeName(folder, base, ext) {
    for (let n = 0; n < 10000; n += 1) {
      const name = `${base}${n ? ` ${n}` : ''}${ext ? `.${ext}` : ''}`;
      if (!app.index.has(join(folder, name))) return join(folder, name);
    }
    return join(folder, `${base} ${Date.now()}${ext ? `.${ext}` : ''}`);
  }

  /** Where new notes go: the setting ('root' | 'current' | a folder). */
  function newNoteFolder() {
    const where = prefs().newNoteLocation ?? 'current';
    if (where === 'root') return '';
    if (where === 'folder') return normalizePath(prefs().newNoteFolder ?? '');
    const active = app.activePath();
    return active ? folderOf(active) : '';
  }

  async function createFile(path, text = '', { open = true, newTab = false, mode = null, rename = false } = {}) {
    await app.vault.create(path, text);
    await app.indexChanged({ structure: true });
    if (open) await app.openFile(path, { newTab, mode, focus: true });
    if (rename) setTimeout(() => app.beginRenameInTree?.(path), 50);
    return path;
  }

  async function newNote({ folder = newNoteFolder(), name = null, text = '', newTab = false, split = null } = {}) {
    const path = name ? join(folder, `${name}.md`) : freeName(folder, t('note.untitled'), 'md');
    await app.vault.create(path, text);
    await app.indexChanged({ structure: true });
    await app.openFile(path, { newTab, split, focus: true, mode: prefs().defaultMode });
    return path;
  }

  async function newFolder(parent = newNoteFolder()) {
    const name = await promptText({ title: t('folder.new'), value: t('folder.untitled'), glyph: 'folderAdd', validate: validName });
    if (!name) return null;
    const path = join(parent, name);
    if (app.index.has(path)) { app.notify('warning', t('name.taken', { name })); return null; }
    await app.vault.mkdir(path);
    await app.indexChanged({ structure: true });
    app.expandFolder(path);
    return path;
  }

  async function newCanvas(folder = newNoteFolder()) {
    const path = freeName(folder, t('canvas.untitled'), 'canvas');
    return createFile(path, JSON.stringify({ nodes: [], edges: [] }, null, '\t'), { newTab: false });
  }

  // ───────── rename, move, delete, duplicate

  async function rename(path) {
    if (!path) return null;
    const folder = app.index.folders.has(path) && !app.index.files.has(path);
    const note = isNote(path);
    const current = folder ? fileNameOf(path) : note ? nameOf(path) : fileNameOf(path);
    const name = await promptText({ title: t('rename.title'), value: current, selectStem: !note && !folder, glyph: 'edit', validate: validName });
    if (!name || name === current) return null;
    const target = join(folderOf(path), folder || !note ? name : `${name}.${extOf(path)}`);
    return moveTo(path, target);
  }

  async function moveTo(from, to) {
    if (normalizePath(from) === normalizePath(to)) return null;
    if (app.index.has(to) && from.toLowerCase() !== to.toLowerCase()) { app.notify('warning', t('name.taken', { name: fileNameOf(to) })); return null; }
    await app.saveAll();
    const result = await app.vault.rename(from, to, prefs().updateLinks !== false);
    app.pathRenamed(from, to);
    for (const e of result?.edits ?? []) app.externalText(e.path, e.text);
    await app.indexChanged({ structure: true });
    const n = result?.edits?.length ?? 0;
    app.notify('success', n ? t('rename.doneLinks', { name: fileNameOf(to), n }) : t('rename.done', { name: fileNameOf(to) }));
    return to;
  }

  async function move(path) {
    const folders = ['', ...[...app.index.folders].sort()];
    const item = await openSuggest({
      placeholder: t('move.placeholder'), icon: 'folderOpen',
      items: (q) => folders.map((f) => ({ id: f, label: f || `/ (${t('vault.root')})`, icon: 'folder', positions: fuzzy(q, f || '/') })).filter((x) => x.positions),
    });
    if (!item) return null;
    return moveTo(path, join(item.id, fileNameOf(path)));
  }

  async function remove(path) {
    if (!path) return;
    const folder = app.index.folders.has(path) && !app.index.files.has(path);
    if (prefs().confirmDelete !== false) {
      const choice = await app.ask({ icon: 'trash', title: t(folder ? 'delete.folderTitle' : 'delete.title'), message: t('delete.message', { name: fileNameOf(path) }), items: [path], buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'delete', label: t('delete.ok'), icon: 'trash', danger: true, primary: true }] });
      if (choice !== 'delete') return;
    }
    app.closePath(path);
    await app.vault.remove(path, app.isDesktop ? (prefs().deleteMode ?? 'system') : 'vault');
    await app.indexChanged({ structure: true });
    app.notify('success', t('delete.done', { name: fileNameOf(path) }));
  }

  async function duplicate(path) {
    const ext = extOf(path);
    const target = freeName(folderOf(path), nameOf(path), ext);
    await app.vault.copy(path, target);
    await app.indexChanged({ structure: true });
    if (isNote(target) || ext === 'canvas') await app.openFile(target, { newTab: true });
    return target;
  }

  // ───────── daily notes, unique notes, templates

  async function formatDate(format, days = 0) { return app.core('formatDate', { format, days, ...now() }); }

  async function dailyNote(days = 0, { newTab = false } = {}) {
    const s = prefs();
    const name = await formatDate(s.dailyFormat || 'YYYY-MM-DD', days);
    const path = join(s.dailyFolder ?? '', `${name}.md`);
    if (!app.index.has(path)) {
      if (s.dailyFolder && !app.index.folders.has(normalizePath(s.dailyFolder))) await app.vault.mkdir(s.dailyFolder);
      const text = s.dailyTemplate ? await expandTemplateFile(s.dailyTemplate, name) : '';
      await app.vault.create(path, text);
      await app.indexChanged({ structure: true });
    }
    await app.openFile(path, { newTab, focus: true });
    return path;
  }

  /** The daily note before / after the open one (by name order of the daily folder). */
  async function adjacentDaily(step) {
    const s = prefs();
    const folder = normalizePath(s.dailyFolder ?? '');
    const notes = app.index.notePaths().filter((p) => folderOf(p) === folder && /\d{4}/.test(nameOf(p))).sort();
    const at = notes.indexOf(app.activePath());
    const next = at < 0 ? (step < 0 ? notes.at(-1) : notes[0]) : notes[at + step];
    if (next) await app.openFile(next); else app.notify('info', t('daily.noMore'));
  }

  async function uniqueNote() {
    const s = prefs();
    const name = await formatDate(s.uniqueFormat || 'YYYYMMDDHHmm');
    const folder = normalizePath(s.uniqueFolder ?? newNoteFolder());
    const path = app.index.has(join(folder, `${name}.md`)) ? freeName(folder, name, 'md') : join(folder, `${name}.md`);
    const text = s.uniqueTemplate ? await expandTemplateFile(s.uniqueTemplate, nameOf(path)) : '';
    return createFile(path, text, { mode: s.defaultMode });
  }

  const templatePaths = () => { const folder = normalizePath(prefs().templateFolder ?? 'Templates'); return app.index.notePaths().filter((p) => p.startsWith(`${folder}/`)); };

  async function expandTemplateFile(path, title) {
    const p = app.index.has(path) ? path : app.index.has(`${path}.md`) ? `${path}.md` : null;
    if (!p) return '';
    const text = await app.readText(p);
    return app.core('template', { template: text, title, dateFormat: prefs().templateDateFormat || 'YYYY-MM-DD', timeFormat: prefs().templateTimeFormat || 'HH:mm', ...now() });
  }

  const lang = () => (prefs().language === 'en' ? 'en' : 'ko');
  const LIB = 'library:';
  const expandLibrary = (id, title) => app.core('template', { template: templateText(id, lang()), title, dateFormat: prefs().templateDateFormat || 'YYYY-MM-DD', timeFormat: prefs().templateTimeFormat || 'HH:mm', ...now() });

  /** The vault's templates first, then the 40 built-in ones (id "library:<id>"). */
  async function pickTemplate() {
    const list = templatePaths();
    const L = lang();
    const cat = Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c.id, c.label[L]]));
    const items = [
      ...list.map((p) => ({ id: p, label: nameOf(p), detail: folderOf(p), icon: 'template' })),
      ...TEMPLATE_LIBRARY.map((x) => ({ id: LIB + x.id, label: x.name[L], detail: `${t('templates.title')} · ${cat[x.category] ?? ''}`, icon: x.icon })),
    ];
    const item = await openSuggest({ placeholder: t('template.pick'), icon: 'template', items: (q) => items.map((x) => ({ ...x, positions: fuzzy(q, x.label) })).filter((x) => x.positions) });
    return item?.id ?? null;
  }
  const expandAny = (id, title) => (id.startsWith(LIB) ? expandLibrary(id.slice(LIB.length), title) : expandTemplateFile(id, title));

  /** A new note from one of the built-in templates, named after it. */
  async function newFromLibrary(id) {
    const entry = TEMPLATE_LIBRARY.find((x) => x.id === id);
    if (!entry) return null;
    const target = freeName(newNoteFolder(), entry.name[lang()].replace(/[\\/:*?"<>|#^[\]]/g, ' ').trim(), 'md');
    const text = await expandLibrary(id, nameOf(target));
    return createFile(target, text);
  }

  async function insertTemplate() {
    const view = app.activeNoteView();
    if (!view?.editor) { app.notify('warning', t('template.noEditor')); return; }
    const path = await pickTemplate();
    if (!path) return;
    const text = await expandAny(path, nameOf(view.path));
    // A template's front matter merges into the note's.
    view.editor.insertText(text);
  }

  async function newFromTemplate() {
    const path = await pickTemplate();
    if (!path) return null;
    const entry = path.startsWith(LIB) ? TEMPLATE_LIBRARY.find((x) => LIB + x.id === path) : null;
    const target = freeName(newNoteFolder(), entry ? entry.name[lang()] : t('note.untitled'), 'md');
    const text = await expandAny(path, nameOf(target));
    return createFile(target, text);
  }

  async function insertDate(kind) {
    const view = app.activeNoteView();
    if (!view?.editor) return;
    const s = prefs();
    view.editor.insertText(await formatDate(kind === 'time' ? s.templateTimeFormat || 'HH:mm' : s.templateDateFormat || 'YYYY-MM-DD'));
  }

  async function randomNote() {
    const notes = app.index.notePaths();
    if (!notes.length) return;
    const pick = notes[Math.floor(Math.random() * notes.length)];
    await app.openFile(pick, { focus: true });
  }

  // ───────── note composer

  /** Appends the active note to another one and deletes it (links to it now point to the target). */
  async function mergeInto() {
    const path = app.activePath();
    if (!path || !isNote(path)) return;
    const item = await openSuggest({ placeholder: t('composer.mergePick'), icon: 'mergeDocs', items: (q) => app.index.notePaths().filter((p) => p !== path).map((p) => ({ id: p, label: nameOf(p), detail: folderOf(p), icon: 'markdownFile', positions: fuzzy(q, p) })).filter((x) => x.positions).slice(0, 200) });
    if (!item) return;
    await app.saveAll();
    const source = await app.readText(path);
    const target = await app.readText(item.id);
    const body = source.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const merged = `${target.replace(/\s*$/, '')}\n\n${body}`;
    // The core points every link to the merged note at the target instead (its rename planner, onto an existing name).
    const edits = await app.core('rename', { from: path, to: item.id });
    for (const e of edits ?? []) if (e.path !== item.id) { await app.writeText(e.path, e.text); app.externalText(e.path, e.text); }
    await app.writeText(item.id, merged);
    app.externalText(item.id, merged);
    app.closePath(path);
    await app.vault.remove(path, app.isDesktop ? (prefs().deleteMode ?? 'system') : 'vault');
    await app.indexChanged({ structure: true, rescan: true });
    await app.openFile(item.id);
    app.notify('success', t('composer.merged', { name: nameOf(item.id) }));
  }

  /** Moves the selection to a new note and leaves a link (or an embed) in its place. */
  async function extractSelection({ embed = false } = {}) {
    const view = app.activeNoteView();
    const sel = view?.editor?.getSelection();
    if (!sel?.text) { app.notify('warning', t('composer.noSelection')); return; }
    const first = sel.text.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').slice(0, 60).replace(BAD_NAME, ' ').trim() || t('note.untitled');
    const name = await promptText({ title: t('composer.extractName'), value: first, glyph: 'extract', validate: validName });
    if (!name) return;
    const path = app.index.has(join(folderOf(view.path), `${name}.md`)) ? freeName(folderOf(view.path), name, 'md') : join(folderOf(view.path), `${name}.md`);
    await app.vault.create(path, sel.text);
    await app.indexChanged({ structure: true });
    view.editor.replaceSelection(`${embed ? '!' : ''}[[${nameOf(path)}]]`);
    app.notify('success', t('composer.extracted', { name: nameOf(path) }));
  }

  // ───────── bookmarks, workspaces

  function bookmark(entry) {
    const list = [...(app.vaultPrefs().bookmarks ?? [])];
    if (list.some((b) => b.type === entry.type && b.path === entry.path && b.query === entry.query && b.subpath === entry.subpath)) { app.notify('info', t('bookmarks.exists')); return; }
    list.push(entry);
    app.setVaultPrefs({ bookmarks: list });
    app.notify('success', t('bookmarks.added'));
  }

  async function saveWorkspace() {
    const name = await promptText({ title: t('workspace.saveTitle'), value: t('workspace.untitled'), glyph: 'layout', validate: (v) => (v ? null : t('name.empty')) });
    if (!name) return;
    app.setVaultPrefs({ workspaces: { ...(app.vaultPrefs().workspaces ?? {}), [name]: app.layoutSnapshot() } });
    app.notify('success', t('workspace.saved', { name }));
  }
  async function loadWorkspace() {
    const all = app.vaultPrefs().workspaces ?? {};
    const names = Object.keys(all);
    if (!names.length) { app.notify('info', t('workspace.none')); return; }
    const item = await openSuggest({ placeholder: t('workspace.pick'), icon: 'layout', items: (q) => names.map((n) => ({ id: n, label: n, icon: 'layout', positions: fuzzy(q, n) })).filter((x) => x.positions) });
    if (item) app.restoreLayout(all[item.id]);
  }
  async function deleteWorkspace() {
    const all = { ...(app.vaultPrefs().workspaces ?? {}) };
    const item = await openSuggest({ placeholder: t('workspace.deletePick'), icon: 'trash', items: (q) => Object.keys(all).map((n) => ({ id: n, label: n, icon: 'layout', positions: fuzzy(q, n) })).filter((x) => x.positions) });
    if (!item) return;
    delete all[item.id];
    app.setVaultPrefs({ workspaces: all });
  }

  // ───────── attachments (pasted / dropped files, the audio recorder)

  function attachmentFolder(notePath) {
    const s = prefs();
    const where = s.attachmentLocation ?? 'subfolder';
    if (where === 'root') return '';
    if (where === 'folder') return normalizePath(s.attachmentFolder ?? 'attachments');
    if (where === 'same') return folderOf(notePath ?? '');
    return join(folderOf(notePath ?? ''), s.attachmentSubfolder || 'attachments');
  }

  /** Saves files into the attachment folder and returns the links to insert. */
  async function saveAttachments(files, notePath) {
    const folder = attachmentFolder(notePath);
    if (folder && !app.index.folders.has(folder)) await app.vault.mkdir(folder);
    const links = [];
    for (const file of files) {
      const ext = (file.name?.split('.').pop() || file.type?.split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
      const base = file.name && !/^image\.\w+$/.test(file.name) ? file.name.replace(/\.[^.]+$/, '') : `${t('attachment.pasted')} ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
      const path = freeName(folder, base.replace(BAD_NAME, ' '), ext);
      await app.vault.writeBinary(path, new Uint8Array(await file.arrayBuffer()));
      links.push(prefs().useWikiLinks === false ? `![](${encodeURI(path)})` : `![[${fileNameOf(path)}]]`);
    }
    await app.indexChanged({ structure: true });
    return links;
  }

  let recorder = null;
  async function toggleRecording() {
    if (recorder) { recorder.stop(); return; }
    const view = app.activeNoteView();
    if (!view?.editor) { app.notify('warning', t('recorder.noNote')); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (error) { app.showError('recorder.error', error); return; }
    const type = ['audio/webm', 'audio/ogg', 'audio/mp4'].find((m) => globalThis.MediaRecorder?.isTypeSupported?.(m)) ?? '';
    const chunks = [];
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : {});
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      for (const track of stream.getTracks()) track.stop();
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      recorder = null;
      app.recordingChanged(false);
      const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `${t('recorder.name')} ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`, { type: blob.type });
      const [link] = await saveAttachments([file], view.path);
      view.editor.insertText(`${link}\n`);
      app.notify('success', t('recorder.saved'));
    };
    recorder.start();
    app.recordingChanged(true);
    app.notify('info', t('recorder.started'));
  }
  const recording = () => Boolean(recorder);

  // ───────── file recovery

  async function recovery(path = app.activePath()) {
    if (!path || !isNote(path)) return;
    await app.snapshotNow(path, true);
    const list = await app.vault.snapshots(path);
    if (!list.length) { app.notify('info', t('recovery.none')); return; }
    const fmt = new Intl.DateTimeFormat(app.lang() === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'medium', timeStyle: 'medium' });
    const item = await openSuggest({ placeholder: t('recovery.pick', { name: nameOf(path) }), icon: 'history', items: (q) => list.map((s) => ({ id: s.time, label: fmt.format(new Date(s.time)), detail: t('recovery.size', { n: s.size }), icon: 'history', positions: fuzzy(q, fmt.format(new Date(s.time))) })).filter((x) => x.positions) });
    if (!item) return;
    const text = await app.vault.snapshotText(path, item.id);
    const choice = await app.ask({ icon: 'history', title: t('recovery.restoreTitle'), message: t('recovery.restoreMessage', { time: item.label }), detail: text.slice(0, 1200), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'copy', label: t('recovery.copy'), icon: 'copy' }, { id: 'restore', label: t('recovery.restore'), icon: 'history', primary: true }] });
    if (choice === 'copy') await app.copyText(text);
    if (choice === 'restore') { await app.snapshotNow(path, true); app.updateText(path, text, null); await app.saveDoc(path); app.notify('success', t('recovery.restored')); }
  }

  return {
    freeName, newNoteFolder, newNote, newFolder, newCanvas, createFile, rename, move, moveTo, remove, duplicate,
    dailyNote, adjacentDaily, uniqueNote, insertTemplate, newFromTemplate, insertDate, randomNote, expandTemplateFile, formatDate,
    newFromLibrary, mergeInto, extractSelection, bookmark, saveWorkspace, loadWorkspace, deleteWorkspace, saveAttachments, attachmentFolder,
    toggleRecording, recording, recovery, kindOf,
  };
}
