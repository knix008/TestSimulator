// Task scheduler (Tools): batch jobs over many files (cad/tasks.js holds the data and the rules). The tasks are kept
// in the settings; while the application is open a timer starts the ones that are due. A run opens each file in
// the background (the open document is left as it is), does the job, writes the outputs (beside the source or into
// the output folder) and logs every step. The PropertyManager lists the tasks, edits the selected one (job, files,
// output, schedule) and shows its last log.
// Desktop: files and folders by path. Web: files and the output folder picked with the browser's file access (the
// handles kept in the browser's storage), or the open document.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { TASK_KINDS, MODEL_FORMATS, DRAWING_FORMATS, SCHEDULES, PROPERTY_TARGETS, sourceExtensions, createTask, normalizeTask, nextRun, dueTasks, filesOf, outputPath, applyProperties, partsWithoutDrawing, finishRun, logLine, logCsv, scheduleText, baseName, stem } from './cad/tasks.js';
import { unpackProject, packProject, addDrawing } from './cad/document.js';
import { applySheetFormat, ISO_SHEETS, ANSI_SHEETS } from './cad/drawing-annot.js';
import { runCheck } from './cad/design-check.js';

const KIND_ICON = { export: 'exportFile', import: 'stepFile', properties: 'edit', designCheck: 'designCheck', rebuild: 'rebuild', drawings: 'drawingNew' };
const STATUS_ICON = { ok: 'check', partial: 'warning', failed: 'error' };

export function createTaskTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'tasks';
  const desktop = ctx.desktop;
  const web = { files: new Map(), out: new Map() };     // task id → [FileSystemFileHandle] / FileSystemDirectoryHandle
  let running = null;

  // ───────────────────────── the task list (settings)

  const tasks = () => (state.settings.tasks ?? []).map(normalizeTask).filter(Boolean);
  const saveTasks = (list) => ctx.updateSettings({ tasks: list }, { quiet: true });
  const task = (id) => tasks().find((x) => x.id === id) ?? null;
  const selected = () => task(editing()?.sel) ?? null;
  function updateTask(id, mutate) { const list = tasks(); const i = list.findIndex((x) => x.id === id); if (i < 0) return; mutate(list[i]); saveTasks(list); ctx.renderLeft(); }

  function begin() {
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'tasks', sel: tasks()[0]?.id ?? null, run: null };
    ctx.renderAll();
  }
  function finish() { ctx.cancelEditing({ quiet: true }); }

  function addTask(kind) {
    if (!TASK_KINDS.includes(kind)) return null;
    const n = tasks().filter((x) => x.kind === kind).length + 1;
    const tk = createTask(kind, { name: `${t(`task.kind.${kind}`)} ${n}` });
    if (!desktop) tk.output.sameAsSource = false;
    saveTasks([...tasks(), tk]);
    if (owns(editing())) editing().sel = tk.id;
    ctx.renderLeft();
    return tk.id;
  }
  function removeTask(id) { saveTasks(tasks().filter((x) => x.id !== id)); web.files.delete(id); web.out.delete(id); ctx.forgetWebHandle?.(`task:${id}`); ctx.forgetWebHandle?.(`task-out:${id}`); const e = editing(); if (owns(e) && e.sel === id) e.sel = tasks()[0]?.id ?? null; ctx.renderLeft(); }
  function duplicateTask(id) { const src = task(id); if (!src) return null; const copy = { ...structuredClone(src), id: createTask(src.kind).id, name: `${src.name} (2)`, lastRun: null, lastStatus: null, log: [], created: new Date().toISOString() }; saveTasks([...tasks(), copy]); if (owns(editing())) editing().sel = copy.id; ctx.renderLeft(); return copy.id; }

  // ───────────────────────── files

  async function pickSources(id) {
    const tk = task(id); if (!tk) return;
    const exts = sourceExtensions(tk);
    if (desktop) {
      const paths = await ctx.native.chooseFiles(state.settings.lastDirectory, [{ name: t(`task.kind.${tk.kind}`), extensions: exts }], true);
      if (paths?.length) updateTask(id, (x) => { x.source.type = 'files'; x.source.paths = [...new Set([...x.source.paths, ...paths])]; });
      return;
    }
    if (typeof globalThis.showOpenFilePicker !== 'function') { notify('error', t('task.noFileAccess')); return; }
    let handles;
    try { handles = await globalThis.showOpenFilePicker({ id: 'mymechanics-tasks', multiple: true, types: [{ description: t(`task.kind.${tk.kind}`), accept: { 'application/octet-stream': exts.map((x) => `.${x}`) } }] }); }
    catch (error) { if (error?.name === 'AbortError') return; throw error; }
    const list = [...(web.files.get(id) ?? []), ...handles].filter((h, i, a) => a.findIndex((x) => x.name === h.name) === i);
    web.files.set(id, list); ctx.storeWebHandle?.(`task:${id}`, list);
    updateTask(id, (x) => { x.source.type = 'files'; x.source.paths = list.map((h) => h.name); });
  }
  async function pickFolder(id, which) {
    if (desktop) {
      const dir = await ctx.native.chooseFolder(state.settings.lastDirectory);
      if (!dir) return;
      updateTask(id, (x) => { if (which === 'source') { x.source.type = 'folder'; x.source.folder = dir; } else { x.output.folder = dir; x.output.sameAsSource = false; } });
      return;
    }
    if (typeof globalThis.showDirectoryPicker !== 'function') { notify('error', t('task.noFileAccess')); return; }
    let handle;
    try { handle = await globalThis.showDirectoryPicker({ id: 'mymechanics-task-out', mode: 'readwrite' }); }
    catch (error) { if (error?.name === 'AbortError') return; throw error; }
    web.out.set(id, handle); ctx.storeWebHandle?.(`task-out:${id}`, handle);
    updateTask(id, (x) => { x.output.folder = handle.name; x.output.sameAsSource = false; });
  }

  async function webHandles(id) {
    if (!web.files.has(id)) { const h = await ctx.loadWebHandle?.(`task:${id}`); if (h) web.files.set(id, h); }
    if (!web.out.has(id)) { const h = await ctx.loadWebHandle?.(`task-out:${id}`); if (h) web.out.set(id, h); }
  }
  const permitted = async (h, mode) => { if (!h?.queryPermission) return true; if ((await h.queryPermission({ mode })) === 'granted') return true; try { return (await h.requestPermission({ mode })) === 'granted'; } catch { return false; } };
  const bytesOf = async (content) => (content instanceof Uint8Array ? content : content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : new TextEncoder().encode(String(content)));

  /** The files of a run ([{ path, read() → Uint8Array, write(bytes) (save back) }]) and where outputs go. */
  async function filesFor(tk) {
    if (tk.source.type === 'current') {
      const d = ctx.doc(); if (!d) throw Object.assign(new Error('no document'), { code: 'task.noDocument' });
      return [{ path: `${ctx.docName(d)}`, current: true, read: async () => new TextEncoder().encode(packProject(d.project)) }];
    }
    if (desktop) {
      const listing = tk.source.type === 'folder' && tk.source.folder ? await ctx.native.listFiles(tk.source.folder, sourceExtensions(tk)) : [];
      const recursive = tk.source.recursive !== false;
      const list = filesOf(tk, listing).filter((p) => recursive || tk.source.type !== 'folder' || !p.slice(tk.source.folder.length + 1).includes('/'));
      return list.map((path) => ({ path, read: () => ctx.readBytes(path), write: (bytes) => ctx.writeBytes(path, bytes) }));
    }
    await webHandles(tk.id);
    const handles = web.files.get(tk.id) ?? [];
    return filesOf(tk).map((name) => {
      const h = handles.find((x) => x.name === name);
      return { path: name, read: async () => { if (!h) throw Object.assign(new Error('file not available'), { code: 'task.fileGone' }); if (!(await permitted(h, 'read'))) throw Object.assign(new Error('permission'), { code: 'task.permission' }); return new Uint8Array(await (await h.getFile()).arrayBuffer()); }, write: async (bytes) => { if (!h?.createWritable || !(await permitted(h, 'readwrite'))) throw Object.assign(new Error('permission'), { code: 'task.permission' }); const w = await h.createWritable(); await w.write(bytes); await w.close(); } };
    });
  }
  /** Writes an output file (a full path on the desktop; a name in the task's output folder on the web). */
  async function writeOutput(tk, path, content) {
    const bytes = await bytesOf(content);
    if (desktop) return ctx.writeBytes(path, bytes);
    await webHandles(tk.id);
    const dir = web.out.get(tk.id);
    if (!dir) throw Object.assign(new Error('no output folder'), { code: 'task.noOutput' });
    if (!(await permitted(dir, 'readwrite'))) throw Object.assign(new Error('permission'), { code: 'task.permission' });
    const fh = await dir.getFileHandle(baseName(path), { create: true });
    const w = await fh.createWritable(); await w.write(bytes); await w.close();
    return true;
  }

  // ───────────────────────── a run

  const errText = (error) => (error?.code && String(error.code).startsWith('task.') ? t(error.code) : String(error?.message ?? error));

  /** Runs one task now: every file, logged; the task's last run and log saved. Returns the log lines. */
  async function runTask(id, { reason = 'manual' } = {}) {
    const tk = task(id); if (!tk || running) return null;
    running = id; const lines = []; const now = new Date();
    const log = (level, file, text) => { lines.push(logLine(level, file, text)); };
    log('info', '', t(reason === 'schedule' ? 'task.startedSchedule' : 'task.started', { name: tk.name }));
    const summary = [];
    try {
      const files = await filesFor(tk);
      if (!files.length) log('info', '', t('task.noFiles'));
      await ctx.withProgress('progress.task', tk.name, async (op, report, signal) => {
        for (let i = 0; i < files.length; i++) {
          if (signal?.cancelled) { log('error', '', t('task.cancelled')); break; }
          const f = files[i];
          report({ fraction: i / files.length, text: `${i + 1}/${files.length} · ${baseName(f.path)}` });
          try { await runOne(tk, f, log, summary, now); } catch (error) { log('error', f.path, errText(error)); }
        }
        if (tk.kind === 'designCheck' && tk.options.summary && summary.length) {
          const csv = ['File,Errors,Warnings,Info,Findings', ...summary.map((r) => [r.file, r.error, r.warning, r.info, r.total].map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(','))].join('\n') + '\n';
          const path = outputPath({ ...tk, output: { ...tk.output, template: `${t('task.summaryName')} {date}` } }, files[0].current ? 'summary' : files[0].path, null, 'csv', now);
          try { await writeOutput(tk, path, csv); log('ok', '', t('task.wrote', { name: baseName(path) })); } catch (error) { log('error', '', errText(error)); }
        }
      }, { cancellable: true, delay: 0 });
    } catch (error) { log('error', '', errText(error)); }
    finally { running = null; }
    const done = finishRun(tk, lines, { at: new Date() });
    updateTask(id, (x) => Object.assign(x, { lastRun: done.lastRun, lastStatus: done.lastStatus, log: done.log, enabled: done.enabled }));
    const errors = lines.filter((l) => l.level === 'error').length;
    notify(errors ? 'warning' : 'success', t(errors ? 'task.doneErrors' : 'task.done', { name: tk.name, errors }));
    return lines;
  }

  /** One file of a run. */
  async function runOne(tk, f, log, summary, now) {
    if (tk.kind === 'import') {
      const bytes = await f.read();
      const project = await ctx.projectFromModel(baseName(f.path), bytes);
      const out = outputPath(tk, f.path, null, 'mymech', now);
      await writeOutput(tk, out, packProject(project));
      log('ok', f.path, t('task.wrote', { name: baseName(out) }));
      return;
    }
    const project = unpackProject(await f.read());
    let changed = false;
    await ctx.withDocument(project, async () => {
      switch (tk.kind) {
        case 'export': {
          const refs = [...(tk.options.parts !== false ? project.parts.map((d) => ({ kind: 'part', id: d.id })) : []), ...(tk.options.assemblies !== false ? project.assemblies.map((d) => ({ kind: 'assembly', id: d.id })) : [])];
          for (const ref of refs) for (const fmt of tk.options.formats ?? []) await exportOne(tk, f, ref, () => ctx.exportModel(fmt), log, now);
          for (const d of project.drawings) for (const fmt of tk.options.drawings ?? []) await exportOne(tk, f, { kind: 'drawing', id: d.id }, () => ctx.exportDrawing(fmt), log, now);
          break;
        }
        case 'properties': {
          const changes = applyProperties(project, tk.options.rows, { file: f.path, now });
          for (const c of changes) log('info', f.path, t('task.propSet', { doc: c.doc, field: t(`task.field.${c.field}`, null, c.field), value: c.to }));
          changed = changes.length > 0;
          if (!changed) log('ok', f.path, t('task.unchanged'));
          break;
        }
        case 'designCheck': {
          const r = runCheck(project, ctx.standard(), ctx.checkContext());
          const out = outputPath({ ...tk, output: { ...tk.output, template: tk.output.template || `{name} - ${t('task.reportName')}` } }, f.current ? project.name || 'project' : f.path, null, 'html', now);
          await writeOutput(tk, out, ctx.reportHtml(r, project.name));
          summary.push({ file: baseName(f.path), ...r.counts, total: r.findings.length });
          log(r.counts.error ? 'error' : 'ok', f.path, t('task.checked', { errors: r.counts.error, warnings: r.counts.warning, name: baseName(out) }));
          break;
        }
        case 'rebuild': {
          let failed = 0;
          for (const part of project.parts) {
            const errs = ctx.rebuildErrors(part);
            for (const e of errs) log('error', f.path, t('task.featureFailed', { part: part.name, feature: e.feature.name, error: t(`rebuild.${e.error}`, null, e.error ?? '') }));
            failed += errs.length;
          }
          if (!failed) log('ok', f.path, t('task.rebuilt', { count: project.parts.length }));
          changed = tk.options.save !== false;
          break;
        }
        case 'drawings': {
          const list = partsWithoutDrawing(project);
          for (const part of list) {
            const d = addDrawing(project, { kind: 'part', id: part.id }, `${part.name} ${t('task.drawingSuffix')}`.trim());
            applySheetFormat(d, { standard: tk.options.standard, sheet: tk.options.sheet });
            d.title = { ...d.title, partNo: part.partNo || d.title.partNo };
            log('info', f.path, t('task.drawingMade', { name: d.name }));
          }
          changed = list.length > 0;
          if (!changed) log('ok', f.path, t('task.unchanged'));
          break;
        }
        default: break;
      }
    });
    if (changed) {
      if (f.current) { ctx.replaceCurrent(project, `task:${tk.kind}`); log('ok', f.path, t('task.updatedCurrent')); }
      else if (f.write && tk.output.sameAsSource !== false) { await f.write(new TextEncoder().encode(packProject(project))); log('ok', f.path, t('task.saved')); }
      else { const out = outputPath(tk, f.path, null, 'mymech', now); await writeOutput(tk, out, packProject(project)); log('ok', f.path, t('task.wrote', { name: baseName(out) })); }
    }
  }

  /** Exports one document of the open (background) project through the app's exporters into the output. */
  async function exportOne(tk, f, ref, exporter, log, now) {
    ctx.activate(ref);
    const wrote = [];
    await ctx.withExportSink(async (name, type, content) => {
      const ext = String(name).split('.').pop();
      const out = outputPath(tk, f.current ? stem(name) : f.path, f.current ? null : stem(name), ext, now);
      await writeOutput(tk, out, content);
      wrote.push(baseName(out));
      return true;
    }, exporter);
    if (wrote.length) for (const n of wrote) log('ok', f.path, t('task.wrote', { name: n }));
    else log('error', f.path, t('task.nothingExported', { doc: ctx.docTitle(ref) }));
  }

  // ───────────────────────── the timer

  let timer = null;
  function tick() {
    if (running) return;
    const due = dueTasks(tasks(), new Date());
    if (due.length) runTask(due[0].id, { reason: 'schedule' }).catch(() => {});
  }
  function startTimer() { if (!timer) timer = setInterval(tick, 30_000); setTimeout(tick, 5000); }

  // ───────────────────────── PropertyManager

  const text = (key, value, label, extra = '') => `<label class="pm-field"><span class="pm-label">${escapeHtml(label)}</span><input type="text" class="pm-text" data-pm-field="${key}" value="${escapeHtml(value ?? '')}" spellcheck="false" ${extra}/></label>`;
  const check = (key, on, label) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="${key}" ${on ? 'checked' : ''}/><span>${escapeHtml(label)}</span></label>`;
  const when = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—');

  function optionsHtml(tk) {
    const o = tk.options;
    switch (tk.kind) {
      case 'export': return `<p class="pm-note">${escapeHtml(t('task.modelFormats'))}</p><div class="task-formats">${MODEL_FORMATS.map((x) => check(`tkFmt:${x}`, o.formats?.includes(x), x.toUpperCase())).join('')}</div><p class="pm-note">${escapeHtml(t('task.drawingFormats'))}</p><div class="task-formats">${DRAWING_FORMATS.map((x) => check(`tkDrw:${x}`, o.drawings?.includes(x), x.toUpperCase())).join('')}</div>${check('tkOpt:parts', o.parts !== false, t('task.exportParts'))}${check('tkOpt:assemblies', o.assemblies !== false, t('task.exportAssemblies'))}`;
      case 'properties': return `${(o.rows ?? []).map((r, i) => `<div class="task-prop">${ctx.pm.pmSeg(`tkRowTarget:${i}`, [['part', t('task.target.part')], ['drawing', t('task.target.drawing')]], r.target)}<select class="pm-select" data-pm-select="tkRowField:${i}">${PROPERTY_TARGETS[r.target].map((f) => `<option value="${f}" ${f === r.field ? 'selected' : ''}>${escapeHtml(t(`task.field.${f}`, null, f))}</option>`).join('')}</select>${text(`tkRowValue:${i}`, r.value, t('task.value'))}${ctx.pm.pmSeg(`tkRowMode:${i}`, [['ifEmpty', t('task.ifEmpty')], ['set', t('task.always')]], r.mode)}<button type="button" class="icon-button" data-pm="task.rowDel:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('')}<div class="pm-row">${ctx.pm.pmButton('task.rowAdd', 'plus', t('task.rowAdd'))}</div><p class="pm-note">${escapeHtml(t('task.tokens'))}</p>`;
      case 'designCheck': return `<p class="pm-note">${escapeHtml(t('task.usesStandard', { name: ctx.standard().name }))}</p>${check('tkOpt:summary', o.summary !== false, t('task.summary'))}`;
      case 'rebuild': return check('tkOpt:save', o.save !== false, t('task.saveBack'));
      case 'drawings': {
        const sheets = o.standard === 'ANSI' ? ANSI_SHEETS.map(([, k]) => [k, k]) : ISO_SHEETS.map((k) => [k, k]);
        return `${ctx.pm.pmSeg('tkStd', [['ISO', 'ISO'], ['ANSI', 'ANSI']], o.standard)}${ctx.pm.pmSeg('tkSheet', sheets, o.sheet)}`;
      }
      default: return `<p class="pm-note">${escapeHtml(t('task.importNote'))}</p>`;
    }
  }

  function sourceHtml(tk) {
    const s = tk.source;
    const types = [['files', t('task.src.files')], ...(desktop ? [['folder', t('task.src.folder')]] : []), ...(tk.kind !== 'import' ? [['current', t('task.src.current')]] : [])];
    let body = '';
    if (s.type === 'files') body = `<ul class="task-files">${(s.paths ?? []).map((p, i) => `<li title="${escapeHtml(p)}">${icon(tk.kind === 'import' ? 'stepFile' : 'file', 'icon tiny')}<span>${escapeHtml(baseName(p))}</span><button type="button" class="icon-button" data-pm="task.fileDel:${i}">${icon('close', 'icon tiny')}</button></li>`).join('') || `<li class="muted">${escapeHtml(t('task.noFilesYet'))}</li>`}</ul><div class="pm-row">${ctx.pm.pmButton('task.addFiles', 'plus', t('task.addFiles'))}${(s.paths ?? []).length ? ctx.pm.pmButton('task.clearFiles', 'trash', t('task.clearFiles')) : ''}</div>`;
    else if (s.type === 'folder') body = `${text('tkFolder', s.folder, t('task.folder'))}<div class="pm-row">${ctx.pm.pmButton('task.browseSource', 'folderOpen', t('task.browse'))}</div>${check('tkRecursive', s.recursive !== false, t('task.recursive'))}`;
    else body = `<p class="pm-note">${escapeHtml(t('task.currentNote'))}</p>`;
    return `${ctx.pm.pmSeg('tkSrc', types, s.type)}${body}${s.type !== 'current' ? text('tkPattern', s.pattern, t('task.pattern')) : ''}`;
  }

  function outputHtml(tk) {
    const o = tk.output;
    const same = desktop && o.sameAsSource !== false && tk.source.type !== 'current';
    return `${desktop && tk.source.type !== 'current' ? check('tkSame', same, t('task.sameFolder')) : ''}${same ? '' : `${text('tkOut', o.folder, t('task.outFolder'), desktop ? '' : 'readonly')}<div class="pm-row">${ctx.pm.pmButton('task.browseOut', 'folderOpen', t('task.browse'))}</div>`}${text('tkTemplate', o.template ?? '', t('task.template'), `placeholder="{name} - {doc}"`)}`;
  }

  function scheduleHtml(tk) {
    const s = tk.schedule;
    const dayNames = t('task.weekdays').split(',');
    let body = '';
    if (s.mode === 'once') body = `<label class="pm-field"><span class="pm-label">${escapeHtml(t('task.at'))}</span><input type="datetime-local" class="pm-text" data-pm-field="tkAt" value="${escapeHtml(s.at ?? '')}"/></label>`;
    if (s.mode === 'daily' || s.mode === 'weekly') body = `<label class="pm-field"><span class="pm-label">${escapeHtml(t('task.time'))}</span><input type="time" class="pm-text" data-pm-field="tkTime" value="${escapeHtml(s.time ?? '22:00')}"/></label>`;
    if (s.mode === 'weekly') body += `<div class="task-days">${dayNames.map((n, d) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="tkDay:${d}" ${(s.weekdays ?? []).includes(d) ? 'checked' : ''}/><span>${escapeHtml(n)}</span></label>`).join('')}</div>`;
    if (s.mode === 'interval') body = ctx.pm.pmNum('tkMinutes', s.minutes ?? 60, t('task.minutes'), 'clock');
    const next = nextRun(tk);
    return `${ctx.pm.pmSeg('tkSched', SCHEDULES.map((m) => [m, t(`task.sched.${m}`)]), s.mode)}${body}<p class="pm-note">${escapeHtml(next ? t('task.next', { at: when(next) }) : t('task.noNext'))}</p>${s.mode !== 'manual' ? `<p class="pm-note">${escapeHtml(t('task.whileOpen'))}</p>` : ''}`;
  }

  function pm(e) {
    const { pmHead, pmGroup, pmButton, pmSeg } = ctx.pm;
    const list = tasks();
    const rows = list.map((x) => `<div class="task-row ${x.id === e.sel ? 'active' : ''}" data-task="${escapeHtml(x.id)}"><label class="pm-check"><input type="checkbox" data-pm-toggle="tkOn:${escapeHtml(x.id)}" ${x.enabled ? 'checked' : ''}/></label><button type="button" class="task-name" data-pm="task.select:${escapeHtml(x.id)}">${icon(KIND_ICON[x.kind], 'icon tiny')}<span class="grow">${escapeHtml(x.name)}<small>${escapeHtml(scheduleText(x, t, t('task.weekdays').split(',')))}</small></span>${x.lastStatus ? icon(STATUS_ICON[x.lastStatus], `icon tiny task-${x.lastStatus}`) : ''}</button></div>`).join('') || `<p class="pm-note">${escapeHtml(t('task.none'))}</p>`;
    const kinds = `<div class="task-kinds">${TASK_KINDS.map((k) => `<button type="button" class="small-button" data-pm="task.new:${k}" title="${escapeHtml(t(`task.help.${k}`))}">${icon(KIND_ICON[k])}<span>${escapeHtml(t(`task.kind.${k}`))}</span></button>`).join('')}</div>`;
    const tk = selected();
    const groups = [pmHead('taskScheduler', t('cmd.taskScheduler'), t('pm.help.tasks')), pmGroup('taskScheduler', t('task.list'), `<div class="task-list">${rows}</div><p class="pm-note">${escapeHtml(t('task.newHint'))}</p>${kinds}`)];
    if (tk) {
      groups.push(pmGroup('edit', t('task.job', { kind: t(`task.kind.${tk.kind}`) }), `${text('tkName', tk.name, t('task.name'))}<p class="pm-note">${escapeHtml(t(`task.help.${tk.kind}`))}</p>${optionsHtml(tk)}<div class="pm-row">${pmButton('task.run', 'play', t('task.runNow'), 'primary')}${pmButton('task.dup', 'copy', t('task.duplicate'))}${pmButton('task.del', 'trash', t('action.delete'))}</div>`));
      groups.push(pmGroup('folderOpen', t('task.files'), sourceHtml(tk)));
      groups.push(pmGroup('exportFile', t('task.output'), outputHtml(tk)));
      groups.push(pmGroup('clock', t('task.schedule'), scheduleHtml(tk)));
      const last = tk.log?.at(-1);
      const lines = last?.lines ?? [];
      groups.push(pmGroup('info', t('task.log'), last ? `<p class="pm-note">${escapeHtml(t('task.lastRun', { at: when(new Date(last.run)), status: t(`task.status.${tk.lastStatus ?? 'ok'}`) }))}</p><ul class="task-log">${lines.slice(-60).map((l) => `<li class="task-${l.level}">${icon(l.level === 'error' ? 'error' : l.level === 'ok' ? 'check' : 'info', 'icon tiny')}<span>${l.file ? `<b>${escapeHtml(l.file)}</b> ` : ''}${escapeHtml(l.text)}</span></li>`).join('')}</ul><div class="pm-row">${pmButton('task.logCsv', 'inspCsv', t('task.logCsv'))}</div>` : `<p class="pm-note">${escapeHtml(t('task.neverRun'))}</p>`));
    }
    void pmSeg;
    return groups.join('');
  }

  // ───────────────────────── PropertyManager input

  function field(key, raw) {
    const tk = selected(); if (!tk) return undefined;
    const v = String(raw ?? '').trim();
    let m;
    if (key === 'tkName') { if (v) updateTask(tk.id, (x) => { x.name = v; }); return undefined; }
    if (key === 'tkFolder') { updateTask(tk.id, (x) => { x.source.folder = v; x.source.type = 'folder'; }); return undefined; }
    if (key === 'tkPattern') { updateTask(tk.id, (x) => { x.source.pattern = v || '*'; }); return undefined; }
    if (key === 'tkOut') { if (desktop) updateTask(tk.id, (x) => { x.output.folder = v; }); return undefined; }
    if (key === 'tkTemplate') { updateTask(tk.id, (x) => { x.output.template = v; }); return undefined; }
    if (key === 'tkAt') { updateTask(tk.id, (x) => { x.schedule.at = v; x.enabled = true; }); return undefined; }
    if (key === 'tkTime') { if (/^\d{1,2}:\d{2}$/.test(v)) updateTask(tk.id, (x) => { x.schedule.time = v.padStart(5, '0'); }); return undefined; }
    if (key === 'tkMinutes') { const n = Math.round(Number(v)); if (n >= 1) updateTask(tk.id, (x) => { x.schedule.minutes = n; }); return undefined; }
    if ((m = /^tkRowValue:(\d+)$/.exec(key))) { updateTask(tk.id, (x) => { if (x.options.rows[m[1]]) x.options.rows[m[1]].value = String(raw ?? ''); }); return undefined; }
    if ((m = /^tkRowField:(\d+)$/.exec(key))) { updateTask(tk.id, (x) => { const r = x.options.rows[m[1]]; if (r && PROPERTY_TARGETS[r.target].includes(v)) r.field = v; }); return undefined; }
    return undefined;
  }
  function set(key, value) {
    const tk = selected(); if (!tk) return undefined;
    let m;
    if (key === 'tkSrc') updateTask(tk.id, (x) => { x.source.type = value; });
    else if (key === 'tkSched') updateTask(tk.id, (x) => { x.schedule.mode = value; if (value === 'once' && !x.schedule.at) { const d = new Date(Date.now() + 3600_000); x.schedule.at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`; } if (value !== 'manual') x.enabled = true; });
    else if (key === 'tkStd') updateTask(tk.id, (x) => { x.options.standard = value; x.options.sheet = value === 'ANSI' ? 'Tabloid' : 'A3'; });
    else if (key === 'tkSheet') updateTask(tk.id, (x) => { x.options.sheet = value; });
    else if ((m = /^tkRowTarget:(\d+)$/.exec(key))) updateTask(tk.id, (x) => { const r = x.options.rows[m[1]]; if (r) { r.target = value; if (!PROPERTY_TARGETS[value].includes(r.field)) r.field = PROPERTY_TARGETS[value][0]; } });
    else if ((m = /^tkRowMode:(\d+)$/.exec(key))) updateTask(tk.id, (x) => { const r = x.options.rows[m[1]]; if (r) r.mode = value; });
    else if ((m = /^tkRowField:(\d+)$/.exec(key))) field(key, value);
    return undefined;
  }
  function toggle(key, checked) {
    let m;
    if ((m = /^tkOn:(.+)$/.exec(key))) { updateTask(m[1], (x) => { x.enabled = Boolean(checked); }); return true; }
    const tk = selected(); if (!tk) return false;
    if ((m = /^tkFmt:(\w+)$/.exec(key))) updateTask(tk.id, (x) => { const s = new Set(x.options.formats ?? []); if (checked) s.add(m[1]); else s.delete(m[1]); x.options.formats = MODEL_FORMATS.filter((f) => s.has(f)); });
    else if ((m = /^tkDrw:(\w+)$/.exec(key))) updateTask(tk.id, (x) => { const s = new Set(x.options.drawings ?? []); if (checked) s.add(m[1]); else s.delete(m[1]); x.options.drawings = DRAWING_FORMATS.filter((f) => s.has(f)); });
    else if ((m = /^tkOpt:(\w+)$/.exec(key))) updateTask(tk.id, (x) => { x.options[m[1]] = Boolean(checked); });
    else if ((m = /^tkDay:(\d)$/.exec(key))) updateTask(tk.id, (x) => { const s = new Set(x.schedule.weekdays ?? []); if (checked) s.add(Number(m[1])); else s.delete(Number(m[1])); x.schedule.weekdays = [...s].sort(); });
    else if (key === 'tkSame') updateTask(tk.id, (x) => { x.output.sameAsSource = Boolean(checked); });
    else if (key === 'tkRecursive') updateTask(tk.id, (x) => { x.source.recursive = Boolean(checked); });
    else return false;
    return true;
  }

  const NAMES = new Set(['task.select', 'task.new', 'task.run', 'task.dup', 'task.del', 'task.addFiles', 'task.clearFiles', 'task.fileDel', 'task.browseSource', 'task.browseOut', 'task.rowAdd', 'task.rowDel', 'task.logCsv']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    const e = editing(); const tk = selected();
    switch (name) {
      case 'task.select': if (owns(e)) e.sel = arg; return ctx.renderLeft();
      case 'task.new': return addTask(arg);
      case 'task.run': return tk ? runTask(tk.id) : undefined;
      case 'task.dup': return tk ? duplicateTask(tk.id) : undefined;
      case 'task.del': return tk ? removeTask(tk.id) : undefined;
      case 'task.addFiles': return tk ? pickSources(tk.id) : undefined;
      case 'task.clearFiles': if (tk) { web.files.delete(tk.id); updateTask(tk.id, (x) => { x.source.paths = []; }); } return undefined;
      case 'task.fileDel': if (tk) { const i = Number(arg); const name0 = tk.source.paths[i]; web.files.set(tk.id, (web.files.get(tk.id) ?? []).filter((h) => h.name !== name0)); updateTask(tk.id, (x) => { x.source.paths.splice(i, 1); }); } return undefined;
      case 'task.browseSource': return tk ? pickFolder(tk.id, 'source') : undefined;
      case 'task.browseOut': return tk ? pickFolder(tk.id, 'output') : undefined;
      case 'task.rowAdd': if (tk) updateTask(tk.id, (x) => { x.options.rows = [...(x.options.rows ?? []), { target: 'part', field: 'description', value: '', mode: 'ifEmpty' }]; }); return undefined;
      case 'task.rowDel': if (tk) updateTask(tk.id, (x) => { x.options.rows.splice(Number(arg), 1); }); return undefined;
      case 'task.logCsv': { const lines = tk?.log?.at(-1)?.lines; if (!lines) return undefined; return ctx.saveExport(`${ctx.fileSafe(tk.name)} - log.csv`, 'csv', logCsv(lines), 'text/csv'); }
      default: return undefined;
    }
  }

  const commands = {
    taskScheduler: { icon: 'taskScheduler', label: 'cmd.taskScheduler', enabled: () => true, checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
  };
  const api = { begin, addTask, removeTask, duplicateTask, runTask, tasks, task, tick, select: (id) => command('task.select', id), web, running: () => running };
  return { commands, owns, pm, pick: () => undefined, field, set, select: (key, value) => { set(key, value); return true; }, toggle, accept: () => finish(), handles, command, subject: () => t('cmd.taskScheduler'), finish, startTimer, api };
}
