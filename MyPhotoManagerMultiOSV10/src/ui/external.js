// External editors (ACDSee "Edit with" / "Configure external editors"): the
// user registers programs such as Photoshop or GIMP and opens the selected
// photos in one of them; their thumbnails are refreshed when the app gets the
// focus back. Desktop only.
import { t } from '../i18n.js';
import { chooseFiles, errorText, invoke, isDesktop } from '../platform/native.js';
import { app, reload } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { field, openDialog, toast } from './dialog.js';
import { h } from './dom.js';
import { icon } from './icons.js';

export const editors = () => (app.settings.externalEditors ?? []).filter((e) => e && e.program);

const programName = (path) => path.split(/[\\/]/).pop().replace(/\.(exe|app|bat|cmd|sh)$/i, '');

let pending = null; // photos out in an editor: refresh them when we are back

export async function openInEditor(editor, paths) {
  if (!paths.length) return;
  try {
    await invoke('open_in_program', { program: editor.program, paths });
    pending = new Set([...(pending ?? []), ...paths]);
    toast(t('external.opened', { name: editor.name, n: paths.length }), 'info');
  } catch (error) {
    toast(errorText(error), 'error', 6000);
  }
}

// Back from the editor: the files may have changed.
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    if (!pending) return;
    for (const path of pending) thumbs.invalidate(path);
    pending = null;
    if (app.state.source.type === 'folder') reload();
  });
}

/** "Edit in" submenu: one entry per editor, then "Configure…". */
export function externalEditorMenu(paths) {
  if (!isDesktop()) return [];
  const list = editors();
  return [
    ...list.map((e, i) => ({ label: e.name, icon: 'external', shortcut: i === 0 ? 'Ctrl+Shift+E' : '', disabled: !paths.length, action: () => openInEditor(e, paths) })),
    list.length ? 'separator' : null,
    { label: t('external.configure'), icon: 'gear', action: externalEditorsDialog },
  ].filter(Boolean);
}

/** Add, rename and remove external editors. */
export async function externalEditorsDialog() {
  const list = editors().map((e) => ({ ...e }));
  const rows = h('div.editor-list');
  const draw = () => {
    rows.replaceChildren(...(list.length ? list.map((e, i) => {
      const name = h('input.input', { type: 'text', value: e.name, dataset: { editor: String(i) } });
      name.addEventListener('input', () => { e.name = name.value; });
      return h('div.editor-row', h('span.cat-icon', { html: icon('external') }), name, h('span.editor-path', { title: e.program }, e.program),
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('trash'), onclick: () => { list.splice(i, 1); draw(); } }));
    }) : [h('div.hint', t('external.none'))]));
  };
  draw();
  const add = h('button.btn.small', { type: 'button', id: 'add-external-editor', onclick: async () => {
    const filters = navigator.userAgent.includes('Windows') ? [{ name: t('external.programs'), extensions: ['exe', 'bat', 'cmd'] }] : [];
    const [program] = await chooseFiles(filters);
    if (!program) return;
    list.push({ name: programName(program), program });
    draw();
  } }, h('span', { html: icon('plus') }), t('external.add'));
  const ok = await openDialog({
    title: t('external.title'), width: 620, id: 'external-editors-dialog',
    body: h('div', h('p.hint', t('external.hint')), field(t('external.list'), rows), h('div.row-buttons', add)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }],
  });
  if (!ok) return;
  app.settings.externalEditors = list.map((e) => ({ name: e.name.trim() || programName(e.program), program: e.program }));
  app.saveSettings();
}
