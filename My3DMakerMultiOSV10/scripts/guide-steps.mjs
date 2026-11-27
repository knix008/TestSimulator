// npm run guide:images — the pictures of the user's guide and tutorial (doc/images/<ko|en>/*.png),
// taken from the web build driven in headless Edge (scripts/smoke-web.mjs).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = 'window.__my3dmaker.actions';
const S = 'window.__my3dmaker.state';
const step = (name, code, shot, wait = 1200) => ({ name, eval: `(async()=>{ ${code}; return 1 })()`, expect: '1', wait, shot });

for (const lang of (process.argv.includes('--lang') ? [process.argv[process.argv.indexOf('--lang') + 1]] : ['ko', 'en'])) {
  const steps = [
    step('language', `${A}.updateSettings({ language: '${lang}', theme: 'light', showWelcome: false })`, 'start', 1500),
    step('schematic', `${S}.dirty = false; await ${A}.openSample('cantilever'); ${A}.addSystemOf('modal', ${S}.project.systems[0].id); ${A}.setTab('project')`, 'schematic'),
    step('setup', `${A}.select({ kind: 'system', id: ${S}.project.systems[0].id }); ${A}.setTab('model'); await new Promise(r => setTimeout(r, 1500)); ${A}.select({ kind: 'bc', id: ${S}.project.systems[0].bcs[1].id })`, 'setup', 1800),
    step('stress', `const s = ${S}.project.systems[0]; await ${A}.solve(s); ${A}.select({ kind: 'result', id: s.id + ':vonMises' })`, 'stress', 1600),
    step('modal', `const s = ${S}.project.systems[1]; ${A}.select({ kind: 'system', id: s.id }); await ${A}.solve(s); ${A}.select({ kind: 'result', id: s.id + ':mode:0' })`, 'modal', 1600),
    step('data', `${A}.setTab('data')`, 'data'),
    step('fluid', `${S}.dirty = false; await ${A}.openSample('wingLift'); const s = ${S}.project.systems[0]; await ${A}.solve(s); ${A}.select({ kind: 'result', id: s.id + ':speed' })`, 'fluid', 1600),
    step('study', `${S}.dirty = false; await ${A}.openSample('cantilever'); const s = ${S}.project.systems[0]; const b = ${S}.project.bodies[0]; ${A}.addParameter('bodies.' + b.id + '.params.height'); ${A}.addParameter('bodies.' + b.id + '.params.depth'); ${S}.project.study.objective = 'maxDisplacement'; await ${A}.runStudy(); ${A}.setTab('study')`, 'study', 1800),
  ];
  const file = path.join(root, 'test-results', `guide-${lang}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(steps));
  const out = path.join(root, 'doc', 'images', lang);
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'smoke-web.mjs'), '--out', out, '--steps', file, '--width', '1500', '--height', '900'], { cwd: root, stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
