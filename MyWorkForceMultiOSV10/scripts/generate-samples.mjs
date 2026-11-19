// npm run samples — writes the requirement / test case sample files in samples/ from the
// "Blood-pressure monitor (traceability)" example, in Korean and English:
//   requirements.<lang>.csv     requirement CSV format (import: Requirements → Import)
//   requirements.<lang>.reqif   the same specification as ReqIF 1.2 (OMG Requirements Interchange Format)
//   testcases.<lang>.csv        test case CSV format, one row per step (import: Test cases → Import)
//   traceability.<lang>.csv     traceability matrix (export only)
//   traceability.<lang>.md      traceability matrix as Markdown (export only)
//   schedule.<lang>.xml         the construction example's schedule as Microsoft Project XML (MSPDI)
//   schedule.<lang>.csv         the same schedule as CSV (import: Schedule → Import)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleWorkspace } from '../src/domain/examples.js';
import { requirementsCsv, testCasesCsv, toReqIF, traceCsv, traceMarkdown } from '../src/domain/requirements.js';
import { toProjectXml, toScheduleCsv } from '../src/domain/schedule.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');
const NOW = Date.parse('2026-11-19T09:00:00Z');
mkdirSync(out, { recursive: true });

for (const lang of ['ko', 'en']) {
  const project = exampleWorkspace('device', NOW, lang).projects[0];
  const files = {
    [`requirements.${lang}.csv`]: requirementsCsv(project),
    [`requirements.${lang}.reqif`]: toReqIF(project, new Date(NOW).toISOString()),
    [`testcases.${lang}.csv`]: testCasesCsv(project),
    [`traceability.${lang}.csv`]: traceCsv(project, lang),
    [`traceability.${lang}.md`]: traceMarkdown(project, lang),
  };
  const site = exampleWorkspace('site', NOW, lang);
  files[`schedule.${lang}.xml`] = toProjectXml(site.projects[0], site);
  files[`schedule.${lang}.csv`] = toScheduleCsv(site.projects[0], site);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(out, name), text);
    console.log(`samples/${name}`);
  }
}
