// The small builder every template uses: nodes get ids n1, n2 … in the order they are made (expressions may
// name them: {{ nodes.n3.output }} works in both languages), texts are { ko, en } pairs picked by language.
import { defaultConfig } from './nodes/defs.js';
import { autoLayout, SCREEN_ASPECT } from './layout.js';

export const L = (ko, en) => ({ ko, en });

export function builder(lang) {
  const T = (x) => (x && typeof x === 'object' && !Array.isArray(x) && 'ko' in x ? x[lang] ?? x.en : x);
  const nodes = [];
  const edges = [];
  let n = 0;
  const api = {
    node(type, name, config = {}, extra = {}) {
      n += 1;
      const id = `n${n}`;
      const conf = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, T(v)]));
      nodes.push({ id, type, name: T(name), x: 0, y: 0, config: { ...defaultConfig(type), ...conf }, ...extra });
      return id;
    },
    /** The id the next node() call will get (for a code node that reads its own earlier output). */
    nextId: () => `n${n + 1}`,
    set(id, key, value) { const node = nodes.find((x) => x.id === id); node.config[key] = T(value); return api; },
    link(from, to, fromPort = 'out') { edges.push({ id: `e${edges.length + 1}`, from, fromPort, to, toPort: 'in' }); return api; },
    chain(...ids) { for (let i = 1; i < ids.length; i += 1) api.link(ids[i - 1], ids[i]); return api; },
    done(meta) { return { ...meta, name: T(meta.name), description: T(meta.description), nodes: autoLayout(nodes, edges, { aspect: SCREEN_ASPECT }), edges }; },
    T,
  };
  return api;
}
