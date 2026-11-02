// What a run changed in the workspace: the variables that are new or hold another value than at the
// last update, so the Workspace pane can mark them after a run, a section run or a step.

const sig = (v) => `${v.cls}|${(v.dims || []).join('x')}|${v.bytes}|${v.summary}|${v.global ? 'g' : ''}`;

/** { added: Set, changed: Set } of names from the previous list to the next one (prev null: nothing marked). */
export function diffVariables(prev, next) {
  const added = new Set();
  const changed = new Set();
  if (!prev) return { added, changed };
  const before = new Map(prev.map((v) => [v.name, sig(v)]));
  for (const v of next || []) {
    if (!before.has(v.name)) added.add(v.name);
    else if (before.get(v.name) !== sig(v)) changed.add(v.name);
  }
  return { added, changed };
}
