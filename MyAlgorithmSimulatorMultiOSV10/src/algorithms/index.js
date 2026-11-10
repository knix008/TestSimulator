import { SORTING } from './sorting.js';
import { SEARCHING } from './searching.js';
import { GRAPH } from './graph.js';
import { PATHFINDING } from './pathfinding.js';
import { DP } from './dp.js';
import { STRINGS } from './strings.js';
import { TREES } from './trees.js';
import { BACKTRACKING } from './backtracking.js';
import { MATH } from './math.js';
import { TEXTBOOK } from './textbook.js';

/** The catalogue, in the order it appears in the left panel. */
export const CATEGORIES = [
  { id: 'sorting', name: { ko: '정렬', en: 'Sorting' } },
  { id: 'searching', name: { ko: '탐색', en: 'Searching' } },
  { id: 'graph', name: { ko: '그래프', en: 'Graphs' } },
  { id: 'path', name: { ko: '경로 탐색', en: 'Pathfinding' } },
  { id: 'dp', name: { ko: '동적 계획법', en: 'Dynamic programming' } },
  { id: 'string', name: { ko: '문자열', en: 'Strings' } },
  { id: 'tree', name: { ko: '트리', en: 'Trees' } },
  { id: 'backtracking', name: { ko: '백트래킹', en: 'Backtracking' } },
  { id: 'greedy', name: { ko: '그리디', en: 'Greedy' } },
  { id: 'math', name: { ko: '수학 · 재귀', en: 'Math & recursion' } },
];

export const ALGORITHMS = [...SORTING, ...SEARCHING, ...GRAPH, ...PATHFINDING, ...DP, ...STRINGS, ...TREES, ...BACKTRACKING, ...MATH, ...TEXTBOOK];

const byId = new Map(ALGORITHMS.map((a) => [a.id, a]));
export const algorithmById = (id) => byId.get(id) ?? null;

/** Runs an algorithm on already-parsed input and returns the frames. */
export function runAlgorithm(id, input) {
  const algo = byId.get(id);
  if (!algo) throw new Error(`Unknown algorithm: ${id}`);
  return algo.run(input);
}
