// The Outliner: collections and objects as a tree. Click selects, drag moves to a collection, double click renames.
import { activeObject } from '../../core/doc.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { openMenu } from '../menus.js';

const TYPE_ICON = { MESH: 'mesh', LIGHT: 'light', CAMERA: 'camera', EMPTY: 'empty', ARMATURE: 'armature', CURVE: 'curve', TEXT: 'text', META: 'meta', LATTICE: 'lattice', GPENCIL: 'gpencil', SURFACE: 'curve', VOLUME: 'empty' };

export function createOutliner(app, el) {
  const root = h('div', { className: 'scroll-y', dataset: { testid: 'outliner' } });
  el.append(root);
  const closed = new Set();
  let renaming = null;
  let filter = '';

  const rename = (id, current, apply) => {
    const input = h('input', { className: 'rename-input', value: current, dataset: { testid: 'rename-input' },
      onKeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { renaming = null; update(); } },
      onBlur: () => { const v = input.value.trim(); renaming = null; if (v && v !== current) apply(v); else update(); },
      onClick: (e) => e.stopPropagation() });
    queueMicrotask(() => { input.focus(); input.select(); });
    return input;
  };

  const eyeButton = (hidden, onClick, title) => h('button', { type: 'button', className: 'icon-btn', title, onClick: (e) => { e.stopPropagation(); onClick(); } }, icon(hidden ? 'eye-off' : 'eye', 14));

  const objectRow = (obj, depth) => {
    const doc = app.doc;
    const children = doc.objects.filter((o) => o.parent === obj.id);
    const open = !closed.has(obj.id);
    const row = h('div', {
      className: `tree-row${doc.selected.includes(obj.id) ? ' selected' : ''}${doc.activeId === obj.id ? ' active' : ''}`,
      draggable: true, dataset: { testid: `outliner-${obj.name}`, id: obj.id },
      style: { paddingLeft: `${depth * 14 + 4}px` },
      onClick: (e) => { if (doc.mode !== 'OBJECT') return; app.op('object.select_set', { id: obj.id, extend: e.ctrlKey || e.shiftKey }); },
      onDblclick: () => { renaming = obj.id; update(); },
      onDragstart: (e) => { e.dataTransfer.setData('text/x-my3d-object', obj.id); e.dataTransfer.effectAllowed = 'move'; },
      onContextmenu: (e) => {
        e.preventDefault();
        if (!doc.selected.includes(obj.id) && doc.mode === 'OBJECT') app.op('object.select_set', { id: obj.id });
        openMenu([
          { label: t('Rename', '이름 바꾸기'), onClick: () => { renaming = obj.id; update(); } },
          { label: t('Duplicate', '복제'), icon: 'duplicate', onClick: () => app.op('object.duplicate') },
          null,
          { label: t('Delete', '삭제'), icon: 'delete', disabled: !app.canRun('object.delete'), onClick: () => app.op('object.delete') },
        ], e.clientX, e.clientY);
      },
    },
    h('span', { className: 'twist', onClick: (e) => { e.stopPropagation(); if (closed.has(obj.id)) closed.delete(obj.id); else closed.add(obj.id); update(); } }, children.length ? icon(open ? 'down' : 'right', 10) : null),
    icon(TYPE_ICON[obj.type] ?? 'object', 14),
    renaming === obj.id ? rename(obj.id, obj.name, (v) => { obj.name = v; app.changed('Rename', true); }) : h('span', { className: 'tree-name' }, obj.name),
    obj.modifiers?.length ? h('span', { title: t('Has modifiers', '모디파이어 있음') }, icon('modifier', 12)) : null,
    eyeButton(obj.hide, () => { obj.hide = !obj.hide; app.changed('Toggle Visibility', true); }, t('Hide in viewport', '뷰포트에서 숨기기')),
    h('button', { type: 'button', className: 'icon-btn', title: t('Hide in renders', '렌더에서 숨기기'), style: { opacity: obj.hideRender ? 0.4 : 1 }, onClick: (e) => { e.stopPropagation(); obj.hideRender = !obj.hideRender; app.changed('Toggle Render Visibility', true); } }, icon('camera-render', 14)));
    const list = [row];
    if (open) for (const child of children) list.push(...objectRow(child, depth + 1));
    return list;
  };

  const collectionRow = (col, depth) => {
    const doc = app.doc;
    const key = `c:${col.id}`;
    const open = !closed.has(key);
    const row = h('div', {
      className: `tree-row${doc.activeCollection === col.id ? ' selected' : ''}`, dataset: { testid: `collection-${col.name}` },
      style: { paddingLeft: `${depth * 14 + 4}px` },
      onClick: () => { doc.activeCollection = col.id; update(); },
      onDblclick: () => { if (col.id !== 'col_root') { renaming = col.id; update(); } },
      onDragover: (e) => { e.preventDefault(); row.classList.add('drop'); },
      onDragleave: () => row.classList.remove('drop'),
      onDrop: (e) => {
        e.preventDefault();
        row.classList.remove('drop');
        const id = e.dataTransfer.getData('text/x-my3d-object');
        const obj = doc.objects.find((o) => o.id === id);
        if (obj) { obj.collection = col.id; app.changed('Move to Collection', true); }
      },
      onContextmenu: (e) => {
        e.preventDefault();
        doc.activeCollection = col.id;
        openMenu([
          { label: t('New Collection', '새 컬렉션'), icon: 'collection', onClick: () => app.op('collection.create') },
          { label: t('Delete Collection', '컬렉션 삭제'), icon: 'delete', disabled: col.id === 'col_root', onClick: () => app.op('collection.delete') },
        ], e.clientX, e.clientY);
      },
    },
    h('span', { className: 'twist', onClick: (e) => { e.stopPropagation(); if (closed.has(key)) closed.delete(key); else closed.add(key); update(); } }, icon(open ? 'down' : 'right', 10)),
    icon('collection', 14),
    renaming === col.id ? rename(col.id, col.name, (v) => { col.name = v; app.changed('Rename', true); }) : h('span', { className: 'tree-name' }, col.name),
    col.id !== 'col_root' ? eyeButton(col.hide, () => { col.hide = !col.hide; app.changed('Toggle Collection', true); }, t('Hide collection', '컬렉션 숨기기')) : null);
    const list = [row];
    if (open) {
      for (const child of doc.collections.filter((c) => c.parent === col.id)) list.push(...collectionRow(child, depth + 1));
      const needle = filter.toLowerCase();
      for (const obj of doc.objects) {
        if (obj.collection !== col.id || obj.parent) continue;
        if (needle && !obj.name.toLowerCase().includes(needle)) continue;
        list.push(...objectRow(obj, depth + 1));
      }
    }
    return list;
  };

  function update() {
    if (renaming == null && root.contains(root.ownerDocument.activeElement) && root.ownerDocument.activeElement?.tagName === 'INPUT') return;
    const top = app.doc.collections.find((c) => c.id === 'col_root') ?? app.doc.collections[0];
    const scroll = root.scrollTop;
    root.replaceChildren(...collectionRow(top, 0));
    root.scrollTop = scroll;
    void activeObject;
  }
  update();
  return {
    update,
    header(hdr) {
      hdr.append(h('span', { className: 'hdr-fill' }), h('input', { className: 'text-field', style: { width: '110px', height: '20px' }, placeholder: t('Filter', '필터'), dataset: { testid: 'outliner-filter' }, onInput: (e) => { filter = e.target.value; update(); }, onKeydown: (e) => e.stopPropagation() }),
        h('button', { type: 'button', className: 'hdr-btn', title: t('New Collection', '새 컬렉션'), onClick: () => app.op('collection.create') }, icon('collection', 14)));
    },
    dispose() { root.remove(); },
    onKey(e) {
      if (renaming) return false;
      if ((e.key === 'x' || e.key === 'Delete') && app.canRun('object.delete')) { app.op('object.delete'); return true; }
      if (e.key === 'F2' && app.doc.activeId) { renaming = app.doc.activeId; update(); return true; }
      return false;
    },
  };
}
