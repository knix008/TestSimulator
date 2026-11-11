// What a new project can start from: the four templates the core knows (ARCHITECTURE.md §3.1:
// 'kanban' | 'software' | 'bugs' | 'simple') and three sample projects with issues in them.
// Texts are in i18n/board.js (template.<id>, template.<id>.desc, sample.<id>, sample.<id>.desc).

/** [id, app icon, IconRef for the project, default key]. */
export const TEMPLATES = [
  ['kanban', 'columns', 'b:kanban#1f6feb', 'KAN'],
  ['software', 'code', 'b:code#7a5af8', 'SW'],
  ['bugs', 'bug', 'b:bug#e5484d', 'BUG'],
  ['simple', 'check', 'b:check#2f9e8f', 'TODO'],
];

/**
 * Sample projects: the core makes all three in one call (POST /api/samples, core/samples.js) with a team of users,
 * issues, comments, history and boards; `key` finds each one in the answer (the core may add a number when taken).
 */
export const SAMPLES = [
  { id: 'shop', template: 'software', key: 'SHOP', icon: 'b:rocket#1c7ed6', glyph: 'globe' },
  { id: 'bugs', template: 'bugs', key: 'BUG', icon: 'b:bug#e03e2d', glyph: 'bug' },
  { id: 'home', template: 'simple', key: 'HOME', icon: 'e:🏠', glyph: 'home' },
];

/** A project key from a name: letters/digits of the name, upper case, 2–10 long (ARCHITECTURE §3 projects.key). */
export function keyFromName(name, fallback = 'PRJ') {
  const ascii = String(name ?? '').normalize('NFKD').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  const words = ascii.split(/\s+/).filter(Boolean);
  let key = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 4);
  key = key.toUpperCase().replace(/^[0-9]+/, '');
  if (key.length < 2) key = fallback;
  return key.slice(0, 10);
}
