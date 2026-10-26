// Samples for every sem-cs rule, merged from one module per rule area.
// Each entry: { bad, good, path?, options? }
//   bad / good: C# source text, or an array of { path, text } for project rules.
//   In `bad`, every line that must report the rule ends with "// Noncompliant";
//   no other line may report it. `good` must not report the rule at all.
//   path: file path used for string samples (default 'src/Sample.cs').
//   options: engine options passed as ctx.options['sem-cs'].
import bugs from './sem-cs-cases-bugs.mjs';
import flow from './sem-cs-cases-flow.mjs';
import smells from './sem-cs-cases-smells.mjs';
import design from './sem-cs-cases-design.mjs';
import naming from './sem-cs-cases-naming.mjs';
import security from './sem-cs-cases-security.mjs';
import aspnet from './sem-cs-cases-aspnet.mjs';
import tests from './sem-cs-cases-tests.mjs';

const AREAS = { bugs, flow, smells, design, naming, security, aspnet, tests };

const CASES = {};
export const AREA_OF = {};
for (const [area, cases] of Object.entries(AREAS)) {
  for (const [id, c] of Object.entries(cases)) {
    if (CASES[id]) throw new Error(`sample for ${id} defined in ${AREA_OF[id]} and ${area}`);
    CASES[id] = c;
    AREA_OF[id] = area;
  }
}

export default CASES;
