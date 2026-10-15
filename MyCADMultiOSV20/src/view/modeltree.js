// The model tree (FreeCAD's tree view): the drawing's groups and objects,
// what is hidden, what is selected. Std_Tree* commands act on it: collapse
// and expand, go to the selection, sync options, one or every document.

/** Keys of tree nodes: doc:<id>, group:<id>, folder:2d, folder:extras. */
const MAX_ROWS = 400;
const PLAIN_2D = new Set(['line', 'polyline', 'rect', 'circle', 'arc', 'ellipse', 'polygon', 'spline', 'point', 'text', 'dim', 'leader', 'hatch']);

/**
 * The tree's HTML. api: { state, t, icon, escapeHtml, labelOf(entity), iconOf(entity) }.
 * state.tree: { collapsed: Set<key>, options: { syncSelection, syncView, syncPlacement, preSelection, recordSelection, multiDocument } }.
 */
export function modelTreeHtml(api) {
  const { state, t, icon, escapeHtml } = api;
  const tree = state.tree;
  const docs = tree.options.multiDocument ? state.docs : state.docs.filter((doc) => doc.id === state.active);
  const toolbar = `<div class="tree-tools">
    ${[['treeCollapse', 'collapseAll'], ['treeExpand', 'expandAll'], ['treeSelection', 'search'], ['treeSelectAllInstances', 'clone'], ['newGroup', 'group']].map(([id, glyph]) => `<button class="icon-button" data-command="${id}" title="${escapeHtml(t(`std.${id}`))}" aria-label="${escapeHtml(t(`std.${id}`))}">${icon(glyph)}</button>`).join('')}
    <span class="grow"></span>
    <button class="icon-button" data-command="treeOptions" title="${escapeHtml(t('std.treeOptions'))}" aria-label="${escapeHtml(t('std.treeOptions'))}">${icon('gear')}</button>
  </div>`;
  if (!docs.length) return `${toolbar}<p class="panel-hint">${escapeHtml(t('std.treeEmpty'))}</p>`;
  return `<div class="model-tree" role="tree">${toolbar}<ul class="tree-list">${docs.map((doc) => docHtml(api, doc)).join('')}</ul></div>`;
}

function docHtml(api, doc) {
  const { state, t, icon, escapeHtml } = api;
  const key = `doc:${doc.id}`;
  const open = !state.tree.collapsed.has(key);
  const active = doc.id === state.active;
  const name = api.docName(doc);
  const head = `<div class="tree-row tree-doc ${active ? 'active' : ''}" data-tree-doc="${escapeHtml(doc.id)}">${twisty(api, key, open)}${icon('drawing')}<span class="tree-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span></div>`;
  if (!open) return `<li role="treeitem" aria-expanded="false">${head}</li>`;
  if (!active) return `<li role="treeitem" aria-expanded="true">${head}<ul><li class="tree-row muted tree-note">${escapeHtml(t('std.treeOtherDoc'))}</li></ul></li>`;
  const drawing = doc.drawing;
  const groups = drawing.groups ?? [];
  const children = (parent) => groups.filter((g) => (g.parent ?? null) === parent);
  const inGroup = (id) => drawing.entities.filter((e) => e.group === id);
  let rows = 0;
  const entityRows = (list) => {
    const out = [];
    for (const entity of list) {
      if (rows++ >= MAX_ROWS) { out.push(`<li class="tree-row muted tree-note">${escapeHtml(t('std.treeMore', { count: list.length - out.length }))}</li>`); break; }
      out.push(entityHtml(api, entity));
    }
    return out.join('');
  };
  const groupHtml = (group) => {
    const gkey = `group:${group.id}`;
    const gopen = !state.tree.collapsed.has(gkey);
    const members = inGroup(group.id);
    const sub = children(group.id);
    return `<li role="treeitem" aria-expanded="${gopen}" data-tree-drop="${escapeHtml(group.id)}">
      <div class="tree-row tree-group ${group.hidden ? 'hidden-item' : ''}" data-tree-group="${escapeHtml(group.id)}" draggable="true">${twisty(api, gkey, gopen)}
        <button class="icon-button tree-eye" data-tree-group-eye="${escapeHtml(group.id)}" title="${escapeHtml(t('std.toggleVisibility'))}" aria-label="${escapeHtml(t('std.toggleVisibility'))}">${icon(group.hidden ? 'eyeOff' : 'eye')}</button>
        ${icon(group.body ? 'pdBody' : group.sketch ? 'skSketch' : group.part ? 'part' : 'group')}<span class="tree-label ${group.id === state.activeBody || group.id === state.editSketch ? 'active-body' : ''}" data-tree-rename="${escapeHtml(group.id)}" title="${escapeHtml(group.name)}">${escapeHtml(group.name)}</span><small>${members.length}</small></div>
      ${gopen ? `<ul>${sub.map(groupHtml).join('')}${entityRows(members)}</ul>` : ''}
    </li>`;
  };
  const loose = drawing.entities.filter((e) => !e.group || !groups.some((g) => g.id === e.group));
  const objects = loose.filter((e) => !PLAIN_2D.has(e.type));
  const plain = loose.filter((e) => PLAIN_2D.has(e.type));
  const folderKey = 'folder:2d';
  // Plain 2D geometry can be thousands of lines: folded until opened.
  const folderOpen = state.tree.expanded.has(folderKey);
  const folder = plain.length ? `<li role="treeitem" aria-expanded="${Boolean(folderOpen)}" data-tree-drop="">
    <div class="tree-row tree-folder">${twisty(api, folderKey, folderOpen)}${icon('folder')}<span class="tree-label">${escapeHtml(t('std.tree2d'))}</span><small>${plain.length}</small></div>
    ${folderOpen ? `<ul>${entityRows(plain)}</ul>` : ''}
  </li>` : '';
  const extras = [
    drawing.spreadsheet ? `<li class="tree-row tree-extra" data-command="spreadsheet">${icon('spreadsheet')}<span class="tree-label">${escapeHtml(t('action.spreadsheet'))}</span></li>` : '',
    ...(drawing.varSets ?? []).map((set) => `<li class="tree-row tree-extra" data-command="varSet">${icon('varSet')}<span class="tree-label">${escapeHtml(set.name)}</span><small>${set.variables.length}</small></li>`),
    ...(drawing.textDocs ?? []).map((doc) => `<li class="tree-row tree-extra" data-command="textDocument">${icon('textDocument')}<span class="tree-label">${escapeHtml(doc.name)}</span></li>`),
    drawing.views?.length ? `<li class="tree-row tree-extra" data-command="freezeViews">${icon('views')}<span class="tree-label">${escapeHtml(t('std.savedViews'))}</span><small>${drawing.views.length}</small></li>` : '',
  ].join('');
  return `<li role="treeitem" aria-expanded="true">${head}<ul data-tree-drop="">${children(null).map(groupHtml).join('')}${entityRows(objects)}${folder}${extras}</ul></li>`;
}

function entityHtml(api, entity) {
  const { state, t, icon, escapeHtml } = api;
  const selected = state.selection.has(entity.id);
  const label = api.labelOf(entity);
  const isTip = api.state.docs.find((doc) => doc.id === api.state.active)?.drawing.groups?.some((g) => g.body && g.tip === entity.id);
  const flags = [isTip ? icon('pdTip') : '', entity.unselectable ? icon('lock') : '', entity.frozen ? icon('freeze') : '', entity.clone ? icon('link') : '', entity.attach ? icon('attachment') : ''].join('');
  return `<li role="treeitem" class="tree-row tree-entity ${selected ? 'selected' : ''} ${entity.hidden ? 'hidden-item' : ''}" aria-selected="${selected}" data-tree-entity="${escapeHtml(entity.id)}" draggable="true">
    <button class="icon-button tree-eye" data-tree-eye="${escapeHtml(entity.id)}" title="${escapeHtml(t('std.toggleVisibility'))}" aria-label="${escapeHtml(t('std.toggleVisibility'))}">${icon(entity.hidden ? 'eyeOff' : 'eye')}</button>
    ${icon(api.iconOf(entity))}<span class="tree-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>${flags ? `<span class="tree-flags">${flags}</span>` : ''}
  </li>`;
}

function twisty(api, key, open) {
  const label = api.escapeHtml(api.t(open ? 'std.treeFold' : 'std.treeUnfold'));
  return `<button class="icon-button tree-twisty" data-tree-toggle="${api.escapeHtml(key)}" title="${label}" aria-label="${label}">${api.icon(open ? 'chevronDown' : 'chevronRight')}</button>`;
}

/** Every key a tree can fold (Std_TreeCollapse / Std_TreeExpand). */
export function treeKeys(state) {
  const keys = [];
  for (const doc of state.docs) {
    keys.push(`doc:${doc.id}`);
    for (const group of doc.drawing.groups ?? []) keys.push(`group:${group.id}`);
  }
  keys.push('folder:2d');
  return keys;
}

/** Std_TreeSelectAllInstances: the entities that share a source with the selected ones (the source and all its clones). */
export function instancesOf(drawing, ids) {
  const root = (entity) => {
    let at = entity;
    for (let guard = 0; at?.clone?.of && guard < 64; guard++) at = drawing.entities.find((e) => e.id === at.clone.of) ?? at;
    return at?.id;
  };
  const roots = new Set(ids.map((id) => root(drawing.entities.find((e) => e.id === id))).filter(Boolean));
  return drawing.entities.filter((e) => roots.has(root(e))).map((e) => e.id);
}

export const TREE_OPTIONS = ['syncSelection', 'syncView', 'syncPlacement', 'preSelection', 'recordSelection'];
