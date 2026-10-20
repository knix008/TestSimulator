// Writes the sample maps in samples/<lang>/ (Korean and English): the
// finished sample maps (src/lib/samples.js), maps from the templates
// (src/lib/templates.js), and one map in the other formats the app opens,
// so import can be tried right away.
//
//   npm run samples
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mapFromTemplate } from '../src/lib/templates.js';
import { SAMPLES, mapFromSample } from '../src/lib/samples.js';
import { exportFreeMind } from '../src/lib/formats/freemind.js';
import { exportOpml, exportMarkdown } from '../src/lib/formats/outline.js';
import { exportXmind } from '../src/lib/formats/xmind.js';

const require = createRequire(import.meta.url);
const { writeZip } = require('../core/zip.js');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');

const FROM_TEMPLATES = [
  ['tour', 'tour'], ['project', 'template-project-plan'], ['brainstorm', 'template-brainstorming'], ['meeting', 'template-meeting'], ['swot', 'template-swot'],
  ['decision', 'template-decision'], ['weekly', 'template-weekly'], ['fishbone', 'template-fishbone'], ['org', 'template-org-chart'],
  ['roadmap', 'template-roadmap'], ['book', 'template-book-notes'], ['okr', 'template-okr'], ['study', 'template-study-plan'], ['travel', 'template-trip'],
];

fs.rmSync(out, { recursive: true, force: true });
let n = 0;
const write = (dir, name, data) => { fs.writeFileSync(path.join(dir, name), data); n++; };
for (const lang of ['ko', 'en']) {
  const dir = path.join(out, lang);
  fs.mkdirSync(dir, { recursive: true });
  for (const s of SAMPLES) write(dir, `${s.id}.tmap`, JSON.stringify(mapFromSample(s.id, lang), null, 1));
  for (const [id, name] of FROM_TEMPLATES) write(dir, `${name}.tmap`, JSON.stringify(mapFromTemplate(id, lang), null, 1));
  // one sample in the formats of other programs (File › Import)
  const imp = path.join(dir, 'import');
  fs.mkdirSync(imp, { recursive: true });
  const map = mapFromSample('app-launch', lang);
  write(imp, 'app-launch.mm', exportFreeMind(map));
  write(imp, 'app-launch.opml', exportOpml(map));
  write(imp, 'app-launch.md', exportMarkdown(map, { lang }));
  write(imp, 'app-launch.xmind', writeZip(exportXmind(map).map((f) => ({ name: f.name, data: f.text }))));
}
console.log(`[samples] wrote ${n} files to ${path.relative(root, out)}`);
