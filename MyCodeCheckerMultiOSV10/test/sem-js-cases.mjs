// Per-rule samples for core/sem-js, merged from the part modules.
//
// Each part maps a rule id (the key without the 'sem-js:' prefix) to a case or
// an array of cases:
//   { lang?: 'js' | 'ts', path?: 'src/a.tsx', bad?: string, good?: string,
//     extra?: [{ path, text, lang }] }
// In `bad`, every line that must be reported carries a "Noncompliant" marker
// comment and no other line may be reported. `good` must report nothing for
// the rule. Every rule needs at least one bad and one good sample overall.
import bugs from './sem-js-cases-bugs.mjs';
import smellsA from './sem-js-cases-smells-a.mjs';
import smellsB from './sem-js-cases-smells-b.mjs';
import security from './sem-js-cases-security.mjs';
import react from './sem-js-cases-react.mjs';

export const PARTS = { bugs, 'smells-a': smellsA, 'smells-b': smellsB, security, react };

const CASES = {};
for (const [part, cases] of Object.entries(PARTS)) {
  for (const [id, c] of Object.entries(cases)) {
    if (CASES[id]) throw new Error(`sem-js case ${id} defined twice (part ${part})`);
    CASES[id] = c;
  }
}

export default CASES;
