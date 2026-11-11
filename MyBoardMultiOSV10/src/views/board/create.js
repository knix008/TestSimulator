// "Create issue" (toolbar, key C, a column's +): the shell's `form` popup (ui/formpopup.js) → POST /issues;
// the card appears at once and the step can be undone (the issue is deleted again).
import { errorMessage, issueToCard, letterAvatar } from '../shared/index.js';

/** The form's fields for a board's data. `columnId`: the column the issue starts in (its first status). */
export function createFields(view, { columnId = null } = {}) {
  const t = view.t;
  const data = view.data;
  const L = view.L;
  const projects = data.projects ?? [];
  const projectId = view.ctx.workspace?.project?.id && projects.some((p) => p.id === view.ctx.workspace.project.id) ? view.ctx.workspace.project.id : projects[0]?.id ?? '';
  const types = data.types ?? [];
  const typeOptions = types.map((x) => ({ value: x.id, label: x.name, iconRef: x.icon, when: projects.length > 1 ? { project: x.projectId } : undefined }));
  const defaultType = types.find((x) => x.projectId === projectId && (x.level ?? 0) === 0 && /story|task|스토리|작업/i.test(x.name)) ?? types.find((x) => x.projectId === projectId && (x.level ?? 0) === 0) ?? types[0];
  const subtaskTypes = types.filter((x) => x.level === 1).map((x) => x.id);
  const nonSubtaskTypes = types.filter((x) => x.level !== 1).map((x) => x.id);
  const priorities = data.priorities ?? [];
  const medium = priorities[Math.floor(priorities.length / 2)];
  const users = (data.users ?? []).filter((u) => u.active !== false).map((u) => ({ value: u.id, label: u.displayName ?? u.username, iconRef: u.avatar || letterAvatar(u), hint: u.username }));
  const labels = [...new Set(view.allCards().flatMap((c) => c.labels ?? []))].sort().map((l) => ({ value: l, label: l, glyph: 'tag' }));
  const epics = (data.epics ?? []).map((e) => ({ value: e.id, label: `${e.key} ${e.summary}`, glyph: 'bulb', when: projects.length > 1 ? { project: e.projectId } : undefined }));
  const parents = view.allCards().filter((c) => L.type(c.typeId)?.level === 0).slice(0, 800).map((c) => ({ value: c.id, label: `${c.key} ${c.summary}`, iconRef: L.type(c.typeId)?.icon, when: projects.length > 1 ? { project: c.projectId } : undefined }));
  const column = columnId ? L.column(columnId) : null;
  const statusOptions = column ? column.statusIds.map((id) => ({ value: id, label: L.status(id)?.name ?? id, glyph: 'columns' })) : [];
  const fields = [];
  if (projects.length > 1) fields.push({ name: 'project', type: 'select', label: t('board.field.project'), value: projectId, required: true, glyph: 'folder', options: projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}`, iconRef: p.icon })) });
  fields.push({ name: 'type', type: 'select', label: t('board.field.type'), value: defaultType?.id ?? '', required: true, glyph: 'layers', options: typeOptions });
  if (statusOptions.length > 1) fields.push({ name: 'status', type: 'select', label: t('board.field.status'), value: statusOptions[0].value, required: true, glyph: 'columns', options: statusOptions });
  fields.push(
    { name: 'summary', type: 'text', label: t('board.field.summary'), value: '', required: true, placeholder: t('board.field.summaryHint'), maxLength: 255 },
    { name: 'description', type: 'textarea', label: t('board.field.description'), value: '', placeholder: t('board.field.descriptionHint'), rows: 4 },
    { name: 'assignee', type: 'user', label: t('board.field.assignee'), value: '', options: users, noneLabel: t('shared.unassigned') },
    { name: 'priority', type: 'select', label: t('board.field.priority'), value: medium?.id ?? '', required: priorities.length > 0, glyph: 'flag', options: priorities.map((p) => ({ value: p.id, label: p.name, iconRef: p.icon })) },
    { name: 'labels', type: 'multiselect', label: t('board.field.labels'), value: [], options: labels, allowNew: true },
    { name: 'epic', type: 'select', label: t('board.field.epic'), value: '', glyph: 'bulb', options: epics, noneLabel: t('shared.noEpic'), when: nonSubtaskTypes.length && subtaskTypes.length ? { type: nonSubtaskTypes } : undefined },
    { name: 'parent', type: 'select', label: t('board.field.parent'), value: '', glyph: 'link', options: parents, when: subtaskTypes.length ? { type: subtaskTypes } : undefined, required: subtaskTypes.length > 0, autoFirst: false, search: true },
    { name: 'storyPoints', type: 'number', label: t('board.field.storyPoints'), value: null, min: 0, max: 999, step: 1 },
    { name: 'dueDate', type: 'date', label: t('board.field.dueDate'), value: '' },
    { name: 'icon', type: 'icon', label: t('board.field.icon'), value: '' },
  );
  const assignee = fields.find((f) => f.name === 'assignee');
  const components = (data.components ?? []).map((c) => ({ value: c.id, label: c.name, iconRef: c.icon || 'b:layers', when: projects.length > 1 ? { project: c.projectId } : undefined }));
  if (components.length) {
    fields.splice(fields.indexOf(assignee), 0, { name: 'components', type: 'multiselect', label: t('board.field.components'), value: [], options: components, glyph: 'layers' });
    assignee.hint = t('board.field.assigneeHint');
  }
  fields.push(...customFormFields(view, { projects, users }));
  return { fields, projectId, columnId };
}

/** Custom fields as form fields: shown only for the issue types they apply to, filled with their defaults. */
export function customFormFields(view, { projects = view.data.projects ?? [], users = [] } = {}) {
  const out = [];
  for (const f of view.data.fields ?? []) {
    const when = {};
    if (Array.isArray(f.issueTypeIds) && f.issueTypeIds.length) when.type = f.issueTypeIds;
    else if (f.projectId && projects.length > 1) when.project = f.projectId;
    const options = (f.options ?? []).map((o) => ({ value: o.value, label: o.value, iconRef: o.icon || undefined, glyph: 'list' }));
    const def = f.defaultValue;
    const base = { name: `cf:${f.id}`, label: f.name, hint: f.description || undefined, required: Boolean(f.required), when: Object.keys(when).length ? when : undefined };
    switch (f.type) {
      case 'number': out.push({ ...base, type: 'number', value: def ?? null, min: Math.min(0, Number(def) || 0), max: 999999, step: 1 }); break;
      case 'date': out.push({ ...base, type: 'date', value: def ?? '' }); break;
      case 'textarea': out.push({ ...base, type: 'textarea', value: def ?? '', rows: 3 }); break;
      case 'checkbox': out.push({ ...base, type: 'checkbox', value: Boolean(def), required: false }); break;
      case 'select': out.push({ ...base, type: 'select', value: def ?? '', options, glyph: 'list', autoFirst: false }); break;
      case 'multiselect': out.push({ ...base, type: 'multiselect', value: Array.isArray(def) ? def : [], options, glyph: 'list' }); break;
      case 'labels': out.push({ ...base, type: 'multiselect', value: Array.isArray(def) ? def : [], options: (Array.isArray(def) ? def : []).map((l) => ({ value: l, label: l, glyph: 'tag' })), allowNew: true, glyph: 'tag' }); break;
      case 'user': out.push({ ...base, type: 'user', value: def ?? '', options: users, noneLabel: view.t('shared.unassigned') }); break;
      default: out.push({ ...base, type: 'text', value: def ?? '', glyph: f.type === 'url' ? 'hyperlink' : 'edit' });
    }
  }
  return out;
}

/** The `custom` body of the form's values: fields that apply to the chosen type (others are left out). */
export function customBody(view, values) {
  const custom = {};
  for (const f of view.data.fields ?? []) {
    const key = `cf:${f.id}`;
    if (!(key in values)) continue;
    if (Array.isArray(f.issueTypeIds) && f.issueTypeIds.length && !f.issueTypeIds.includes(values.type)) continue;
    if (f.projectId && values.project && f.projectId !== values.project) continue;
    const v = values[key];
    custom[f.id] = v === '' || (Array.isArray(v) && !v.length) ? null : v;
  }
  return Object.keys(custom).length ? custom : undefined;
}

export async function openCreateForm(view, { columnId = null } = {}) {
  const t = view.t;
  if (view.demo || !view.data) { view.ctx.notify('info', t('board.demo')); return null; }
  const { fields, projectId } = createFields(view, { columnId });
  const result = await view.ctx.popups.open('form', { title: t('board.create.title'), icon: 'plus', submitLabel: t('board.create.submit'), fields });
  const v = result?.values;
  if (!v) return null;
  const column = columnId ? view.L.column(columnId) : null;
  const body = {
    projectId: v.project ?? projectId, typeId: v.type || undefined, summary: v.summary, description: v.description || undefined,
    assigneeId: v.assignee || undefined, priorityId: v.priority || undefined, labels: v.labels?.length ? v.labels : undefined,
    epicId: v.epic || undefined, parentId: v.parent || undefined, storyPoints: v.storyPoints ?? undefined, dueDate: v.dueDate || undefined,
    icon: v.icon || undefined, statusId: v.status || column?.statusIds?.[0] || undefined,
    componentIds: v.components?.length ? v.components : undefined, custom: customBody(view, { ...v, project: v.project ?? projectId }),
  };
  try {
    let issue = await view.api.createIssue(body);
    issue = issue?.issue ?? issue;
    const card = issueToCard(issue, { L: view.L });
    if (card.columnId) view.putCard(card);
    view.focusId = card.id;
    view.flash.set(card.id, Date.now());
    setTimeout(() => { view.flash.delete(card.id); view.cardEl(card.id)?.classList.remove('bv-flash'); }, 1600);
    view.render();
    view.setFocus(card.id);
    view.ctx.notify('success', t('board.created', { key: issue.key }));
    let current = issue;
    view.ctx.history.record({
      label: t('board.op.create', { key: issue.key }),
      undo: async () => { await view.api.deleteIssue(current.id); },
      redo: async () => { const again = await view.api.createIssue(body); current = again?.issue ?? again; },
    });
    view.scheduleRefetch(400);
    return issue;
  } catch (error) {
    view.ctx.notify('error', `${t('board.updateFailed')}: ${errorMessage(error, t)}`);
    return null;
  }
}

// ───────────────────────── edit (double-click a card)

// form field → issue key
const EDIT_FIELDS = Object.fromEntries([['type', 'typeId'], ['summary', 'summary'], ['description', 'description'], ['assignee', 'assigneeId'], ['priority', 'priorityId'], ['labels', 'labels'], ['components', 'componentIds'], ['epic', 'epicId'], ['parent', 'parentId'], ['storyPoints', 'storyPoints'], ['dueDate', 'dueDate'], ['icon', 'icon']]);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Double-clicking a card: the same form as "create issue", filled with the issue → PATCH of what changed (rev), undoable. */
export async function openEditForm(view, id) {
  const t = view.t;
  if (view.demo || !view.data) { view.ctx.openIssue(id); return null; }
  let issue;
  try { issue = await view.api.issue(id); issue = issue?.issue ?? issue; } catch (error) { view.ctx.notify('error', `${t('board.updateFailed')}: ${errorMessage(error, t)}`); return null; }
  const level = view.L.type(issue.typeId)?.level ?? 0;
  const values = { type: issue.typeId, summary: issue.summary ?? '', description: issue.description ?? '', assignee: issue.assigneeId ?? '', priority: issue.priorityId ?? '', labels: issue.labels ?? [], components: issue.componentIds ?? [], epic: issue.epicId ?? '', parent: issue.parentId ?? '', storyPoints: issue.storyPoints ?? null, dueDate: issue.dueDate ?? '', icon: issue.icon ?? '' };
  const { fields } = createFields(view);
  const editFields = fields.filter((f) => Object.hasOwn(EDIT_FIELDS, f.name)).map((f) => {
    const field = { ...f, value: values[f.name] ?? f.value };
    // the type: only types of the same level in the issue's project (a subtask stays a subtask)
    if (f.name === 'type') field.options = (f.options ?? []).filter((o) => (view.data.types ?? []).some((x) => x.id === o.value && (x.level ?? 0) === level && (!x.projectId || x.projectId === issue.projectId))).map((o) => ({ ...o, when: undefined }));
    if (f.name === 'parent' || f.name === 'epic') field.when = undefined;
    if (f.name === 'parent' && level !== 1) return null;
    if (f.name === 'epic' && level !== 0) return null;
    if (f.name === 'parent') field.required = true;
    if (f.options) field.options = field.options.filter((o) => !o.when || !o.when.project || o.when.project === issue.projectId).map((o) => ({ ...o, when: undefined }));
    return field;
  }).filter(Boolean);
  const result = await view.ctx.popups.open('form', { title: t('board.edit.title', { key: issue.key }), icon: 'edit', submitLabel: t('board.edit.submit'), fields: editFields });
  const v = result?.values;
  if (!v) return null;
  const patch = {};
  const before = {};
  for (const [name, key] of Object.entries(EDIT_FIELDS)) {
    if (!(name in v)) continue;
    const next = Array.isArray(v[name]) ? v[name] : v[name] === '' ? null : v[name];
    const old = Array.isArray(issue[key]) ? issue[key] : issue[key] ?? null;
    if (same(next, old)) continue;
    patch[key] = next;
    before[key] = old;
  }
  if (!Object.keys(patch).length) return issue;
  try {
    let saved = await view.api.updateIssue(issue.id, { ...patch, rev: issue.rev });
    saved = saved?.issue ?? saved;
    let rev = saved.rev;
    view.ctx.notify('success', t('board.edit.saved', { key: issue.key }));
    view.ctx.history.record({
      label: t('board.edit.op', { key: issue.key }),
      undo: async () => { const x = await view.api.updateIssue(issue.id, { ...before, rev }); rev = (x?.issue ?? x).rev; view.scheduleRefetch(100); },
      redo: async () => { const x = await view.api.updateIssue(issue.id, { ...patch, rev }); rev = (x?.issue ?? x).rev; view.scheduleRefetch(100); },
    });
    try { window.dispatchEvent(new CustomEvent('myboard:event', { detail: { type: 'issue.updated', id: issue.id, rev, data: saved, local: true } })); } catch { /* no window */ }
    view.scheduleRefetch(100);
    return saved;
  } catch (error) {
    view.ctx.notify('error', `${t('board.updateFailed')}: ${errorMessage(error, t)}`);
    view.scheduleRefetch(100);
    return null;
  }
}
