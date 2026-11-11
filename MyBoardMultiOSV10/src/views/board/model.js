// The board's model: what is shown where (columns × swimlanes), the filters applied in the page, and the
// view state remembered per board. Pure functions (no DOM), so they can be tested on their own.
//
// The core answers GET /boards/:id/data with cards already filtered by quick filters and search and with
// `card.lane` for the board's own swimlane mode. The page may group differently (remembered per board):
// assignee / epic / priority / type / project / subtasks lanes are computed here from the cards; 'queries'
// lanes need JQL, so they exist only when the board itself is set to them (the core's lanes are used).

export const GROUP_MODES = ['none', 'queries', 'assignee', 'epic', 'priority', 'type', 'project', 'subtasks'];
export const GROUP_ICONS = { none: 'columns', queries: 'filter', assignee: 'user', epic: 'bulb', priority: 'flag', type: 'layers', project: 'folder', subtasks: 'list' };
/** The card field a lane sets when a card is dropped into it. */
export const LANE_FIELDS = { assignee: 'assigneeId', epic: 'epicId', priority: 'priorityId' };
export const RECENT_MS = 24 * 3600 * 1000;

const PREFS_KEY = (boardId) => `myboard.board.${boardId}`;

export const defaultPrefs = () => ({ groupBy: null, quick: [], mine: false, recent: false, search: '', collapsedColumns: [], collapsedLanes: [], showAllDone: false, showBacklog: true });

/** The view state of a board (localStorage, per board id). */
export function loadPrefs(boardId, storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(PREFS_KEY(boardId)) ?? 'null');
    if (!raw || typeof raw !== 'object') return defaultPrefs();
    const prefs = { ...defaultPrefs(), ...raw };
    for (const key of ['quick', 'collapsedColumns', 'collapsedLanes']) if (!Array.isArray(prefs[key])) prefs[key] = [];
    if (prefs.groupBy != null && !GROUP_MODES.includes(prefs.groupBy)) prefs.groupBy = null;
    prefs.search = typeof prefs.search === 'string' ? prefs.search : '';
    return prefs;
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(boardId, prefs, storage = globalThis.localStorage) {
  try { storage?.setItem(PREFS_KEY(boardId), JSON.stringify(prefs)); } catch { /* private window: not remembered */ }
}

/** The grouping in force: the page's choice, else the board's own; 'queries' only when the board uses it. */
export function groupMode(prefs, settings) {
  const own = settings?.swimlanes ?? 'none';
  const wanted = prefs?.groupBy ?? own;
  if (wanted === 'queries' && own !== 'queries') return 'none';
  return GROUP_MODES.includes(wanted) ? wanted : 'none';
}

/** The modes the group-by dropdown offers for a board. */
export function groupChoices(settings) {
  return GROUP_MODES.filter((mode) => mode !== 'queries' || settings?.swimlanes === 'queries');
}

/** The page's own filters (on top of the core's quick filters and search): only mine, recently updated. */
export function filterCards(cards, prefs, { me = null, now = Date.now() } = {}) {
  let list = cards;
  if (prefs.mine) list = list.filter((card) => me && card.assigneeId === me);
  if (prefs.recent) list = list.filter((card) => Number(card.updatedAt) >= now - RECENT_MS);
  return list;
}

export const byRank = (a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The lane id of a card under a grouping. */
export function laneOf(card, mode, { serverMode = 'none', parents = null } = {}) {
  switch (mode) {
    case 'assignee': return card.assigneeId || 'none';
    case 'epic': return card.epicId || 'none';
    case 'priority': return card.priorityId || 'none';
    case 'type': return card.typeId || 'none';
    case 'project': return card.projectId || 'none';
    case 'queries': return serverMode === 'queries' ? card.lane ?? 'other' : 'all';
    case 'subtasks': return card.parentId && parents?.has(card.parentId) ? card.parentId : parents?.has(card.id) ? card.id : 'other';
    default: return 'all';
  }
}

/**
 * Columns × lanes. `data`: the board data; `L`: lookups (views/shared createLookups); options: prefs, me, now, t.
 * Returns { columns, lanes, cells: Map('lane|column' → cards by rank), total, shown, mode }.
 */
export function buildLayout(data, L, { prefs, me = null, now = Date.now(), t = (k) => k } = {}) {
  const settings = data.board?.settings ?? {};
  const mode = groupMode(prefs, settings);
  const columns = (data.columns ?? []).filter((c) => !c.backlog || prefs.showBacklog);
  const backlogCards = data.backlog ?? [];
  const all = [...(data.issues ?? []), ...(columns.some((c) => c.backlog) ? backlogCards : [])];
  const shownCards = filterCards(all, prefs, { me, now });
  const parents = mode === 'subtasks' ? new Set(all.filter((c) => c.parentId).map((c) => c.parentId)) : null;
  const totals = new Map();
  for (const card of [...(data.issues ?? []), ...backlogCards]) totals.set(card.columnId, (totals.get(card.columnId) ?? 0) + 1);
  const cells = new Map();
  const laneCounts = new Map();
  const shownByColumn = new Map();
  for (const card of shownCards) {
    const lane = laneOf(card, mode, { serverMode: settings.swimlanes, parents });
    const key = `${lane}|${card.columnId}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(card);
    laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
    shownByColumn.set(card.columnId, (shownByColumn.get(card.columnId) ?? 0) + 1);
  }
  for (const list of cells.values()) list.sort(byRank);

  const constraint = settings.columnConstraint !== 'none';
  const cols = columns.map((c) => {
    const total = totals.get(c.id) ?? 0;
    const over = constraint && !c.backlog && c.wipMax != null && total > Number(c.wipMax);
    const under = constraint && !c.backlog && c.wipMin != null && total < Number(c.wipMin);
    return { ...c, total, shown: shownByColumn.get(c.id) ?? 0, over, under, collapsed: prefs.collapsedColumns.includes(c.id) };
  });

  const present = (id) => laneCounts.has(id);
  const lane = (id, name, extra = {}) => ({ id, name, count: laneCounts.get(id) ?? 0, collapsed: prefs.collapsedLanes.includes(id), ...extra });
  let lanes;
  switch (mode) {
    case 'assignee': {
      const users = [...L.users.values()].filter((u) => present(u.id));
      users.sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : String(a.displayName).localeCompare(String(b.displayName))));
      lanes = [...users.map((u) => lane(u.id, u.displayName ?? u.username, { user: u })), ...(present('none') ? [lane('none', t('shared.unassigned'), { empty: true, user: null, avatar: true })] : [])];
      break;
    }
    case 'epic': lanes = [...(data.epics ?? []).filter((e) => present(e.id)).map((e) => lane(e.id, `${e.key} ${e.summary}`, { epic: e })), ...(present('none') ? [lane('none', t('shared.noEpic'), { empty: true })] : [])]; break;
    case 'priority': lanes = [...(data.priorities ?? []).filter((p) => present(p.id)).map((p) => lane(p.id, p.name, { iconRef: p.icon })), ...(present('none') ? [lane('none', t('shared.noPriority'), { empty: true })] : [])]; break;
    case 'type': lanes = [...(data.types ?? []).filter((x) => present(x.id)).map((x) => lane(x.id, x.name, { iconRef: x.icon })), ...(present('none') ? [lane('none', t('shared.none'), { empty: true })] : [])]; break;
    case 'project': lanes = [...(data.projects ?? []).filter((p) => present(p.id)).map((p) => lane(p.id, `${p.key} ${p.name}`, { iconRef: p.icon })), ...(present('none') ? [lane('none', t('shared.none'), { empty: true })] : [])]; break;
    case 'queries': lanes = (data.swimlanes ?? []).map((s) => lane(s.id, s.name ?? t('board.lane.other'), { jql: s.jql, empty: s.id === 'other' })); break;
    case 'subtasks': {
      const cardsById = new Map(all.map((c) => [c.id, c]));
      const ids = [...parents].filter((id) => present(id));
      ids.sort((a, b) => byRank(cardsById.get(a) ?? { rank: '', id: a }, cardsById.get(b) ?? { rank: '', id: b }));
      lanes = [...ids.map((id) => { const p = cardsById.get(id); return lane(id, p ? `${p.key} ${p.summary}` : t('board.lane.parent'), { parent: p ?? null, iconRef: p ? L.type(p.typeId)?.icon : null }); }), ...(present('other') ? [lane('other', t('board.lane.other'), { empty: true })] : [])];
      break;
    }
    default: lanes = [lane('all', t('board.lane.everything'))];
  }
  if (!lanes.length) lanes = [lane(mode === 'none' ? 'all' : 'none', t('board.lane.everything'))];
  return { mode, columns: cols, lanes, cells, total: all.length, shown: shownCards.length };
}

/** The cards above and below `id` in a list (by rank), the list without `id` itself. */
export function neighbours(list, id) {
  const index = list.findIndex((c) => c.id === id);
  if (index < 0) return { aboveId: null, belowId: null };
  return { aboveId: list[index - 1]?.id ?? null, belowId: list[index + 1]?.id ?? null };
}

/** The cards around position `index` of `list` after `excluded` are taken out: { afterId, beforeId }. */
export function dropNeighbours(list, index, excluded = new Set()) {
  const rest = list.filter((c) => !excluded.has(c.id));
  const at = Math.max(0, Math.min(rest.length, index));
  return { afterId: rest[at - 1]?.id ?? null, beforeId: rest[at]?.id ?? null };
}

/** The value a lane gives its cards' field (null for the empty lane). */
export const laneValue = (laneId) => (laneId === 'none' || laneId === 'other' || laneId === 'all' ? null : laneId);
