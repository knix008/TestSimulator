// "Move to another project" (the actions menu): GET /issues/:id/move-project lists the projects the user may move
// the issue to (with the default type / status and what would be lost), the shell's `form` popup asks for the
// target, type and status (options depend on the chosen project), POST …/move-project does it. The issue gets a
// new key there (the old one keeps working), its subtasks go along; the boards of both projects hear about it.
// No undo step: a move back would give the issue yet another number.
import { t } from '../../i18n.js';
import { errorText } from './util.js';

const letter = (p) => `l:${String(p.key ?? '?').slice(0, 2)}#${String(p.color ?? '#5b6ee1').replace('#', '')}`;
/** The project's default first: the form takes the first option that applies when the project changes. */
const defaultFirst = (list, id) => [...list].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));

/** What the move drops in this project, for the option's hint ('' = nothing). */
function lostText(p) {
  const parts = [];
  if (p.lost?.fields?.length) parts.push(t('detail.move.lostFields', { names: p.lost.fields.join(', ') }));
  if (p.lost?.components?.length) parts.push(t('detail.move.lostComponents', { names: p.lost.components.join(', ') }));
  if (p.lost?.versions?.length) parts.push(t('detail.move.lostVersions', { names: p.lost.versions.join(', ') }));
  return parts.join(' · ');
}

/** The form's fields for the move targets (exported for the tests). */
export function moveFields(targets) {
  const projects = targets.projects.filter((p) => !p.problem);
  const subs = targets.issue.subtaskCount > 0;
  const first = projects[0];
  const fields = [
    {
      name: 'project', type: 'select', label: t('detail.move.project'), required: true, glyph: 'folder', value: first?.id ?? '',
      options: projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}`, iconRef: p.icon || letter(p), hint: lostText(p) || t('detail.move.nothingLost') })),
    },
    {
      name: 'type', type: 'select', label: t('detail.move.type'), required: true, glyph: 'layers', value: first?.defaults.typeId ?? '',
      options: projects.flatMap((p) => defaultFirst(p.types.filter((x) => x.level !== 1), p.defaults.typeId).map((x) => ({ value: x.id, label: x.name, iconRef: x.icon, when: { project: p.id } }))),
    },
    {
      name: 'status', type: 'select', label: t('detail.move.status'), required: true, glyph: 'columns', value: first?.defaults.statusId ?? '',
      options: projects.flatMap((p) => defaultFirst(p.statuses, p.defaults.statusId).map((x) => ({ value: x.id, label: x.name, glyph: x.category === 'done' ? 'check' : x.category === 'inprogress' ? 'play' : 'flag', when: { project: p.id } }))),
    },
  ];
  if (subs) {
    fields.push({
      name: 'subtaskType', type: 'select', label: t('detail.move.subtaskType'), required: true, glyph: 'layers', value: first?.defaults.subtaskTypeId ?? '',
      hint: t('detail.move.subtaskStatusHint'),
      options: projects.flatMap((p) => defaultFirst(p.types.filter((x) => x.level === 1), p.defaults.subtaskTypeId).map((x) => ({ value: x.id, label: x.name, iconRef: x.icon, when: { project: p.id } }))),
    });
  }
  fields.push({ name: 'keepParts', type: 'checkbox', label: t('detail.move.keepParts'), value: true, hint: t('detail.move.keepPartsHint') });
  return { fields, projects };
}

/** @param {object} view the detail view */
export async function openMoveForm(view) {
  const issue = view.issue;
  if (!issue || view.readOnly) return null;
  if (issue.parentId) { view.ctx.notify?.('info', t('detail.move.subtaskHint')); return null; }
  let targets;
  try {
    targets = await view.track(view.api.moveTargets(issue.id));
  } catch (error) { view.fail(error); return null; }
  const { fields, projects } = moveFields(targets);
  if (!projects.length) { view.ctx.notify?.('info', t('detail.move.none')); return null; }
  const n = targets.issue.subtaskCount;
  const result = await view.ctx.popups.open('form', {
    title: t('detail.move.title', { key: issue.key }), icon: 'folderOpen', submitLabel: t('detail.move.submit'),
    intro: n ? t('detail.move.introSubs', { key: issue.key, n }) : t('detail.move.intro', { key: issue.key }), fields,
  });
  const v = result?.values;
  if (!v?.project) return null;
  const keep = v.keepParts !== false;
  const body = {
    projectId: v.project, typeId: v.type || undefined, statusId: v.status || undefined, subtaskTypeId: v.subtaskType || undefined,
    components: keep ? 'keep' : 'clear', versions: keep ? 'keep' : 'clear', rev: view.server?.rev,
  };
  let out;
  try {
    out = await view.track(view.api.moveToProject(issue.id, body));
  } catch (error) {
    if (error?.status === 409) { view.ctx.notify?.('warning', t('detail.move.conflict')); view.reload({ quiet: true }); return null; }
    view.ctx.notify?.('error', `${t('detail.move.failed')}: ${errorText(error)}`);
    return null;
  }
  const moved = out.issue;
  view.configs.delete(moved.projectId);
  try { view.cfg = await view.config(moved.projectId); } catch { /* the next reload */ }
  // the board / backlog of the old project drop the cards (this window gets no live echo of its own change)
  view.setServer(moved, { tell: true, type: 'issue.projectMoved' });
  for (const s of out.subtasks ?? []) view.tellWorkspace('issue.projectMoved', { id: s.id, key: s.key, projectId: moved.projectId, parentId: moved.id });
  view.render();
  view.loadTransitions?.();
  if (view.history) view.loadParts(['history']);
  view.ctx.notify?.('success', t('detail.move.done', { from: out.fromKey, to: moved.key }));
  view.ctx.app?.logActivity?.({ kind: 'local', type: 'issue.projectMoved', text: t('detail.move.done', { from: out.fromKey, to: moved.key }) });
  return out;
}
