// Per-rule samples for core/sem-py, merged from the part modules.
//
// Each part maps a rule id (the key without the 'sem-py:' prefix) to a case or
// an array of cases:
//   { path?: 'app/a.py', bad?: string, good?: string, extra?: [{ path, text }] }
// In `bad`, every line that must be reported carries a "# Noncompliant" marker
// and no other line may be reported. `good` must report nothing for the rule.
// Every rule needs at least one bad and one good sample overall.
import bugs from './sem-py-cases-bugs.mjs';
import bugs2 from './sem-py-cases-bugs2.mjs';
import smells from './sem-py-cases-smells.mjs';
import security from './sem-py-cases-security.mjs';

export const PARTS = { bugs, bugs2, smells, security };

const CASES = {};
for (const [part, cases] of Object.entries(PARTS)) {
  for (const [id, c] of Object.entries(cases)) {
    if (CASES[id]) throw new Error(`sem-py case ${id} defined twice (part ${part})`);
    CASES[id] = c;
  }
}

export default CASES;
