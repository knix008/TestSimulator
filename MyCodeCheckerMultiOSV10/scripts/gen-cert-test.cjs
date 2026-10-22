// Regenerates test/cert.test.mjs from test/cert-cases/*.cjs and test/cert-cases/template.mjs.
// usage: node scripts/gen-cert-test.cjs
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ORDER = ['pre', 'dcl', 'exp', 'int', 'flp', 'arr', 'str', 'mem', 'fio', 'env', 'sig', 'err', 'con', 'msc', 'pos', 'win',
  'cpp-dcl', 'cpp-exp', 'cpp-ctr', 'cpp-str', 'cpp-mem', 'cpp-fio', 'cpp-err', 'cpp-oop', 'cpp-con', 'cpp-msc'];
const dir = path.join(ROOT, 'test', 'cert-cases');
const have = fs.readdirSync(dir).filter((f) => f.endsWith('.cjs')).map((f) => f.slice(0, -4));
const names = [...ORDER.filter((n) => have.includes(n)), ...have.filter((n) => !ORDER.includes(n)).sort()];

const tl = (s) => '`' + String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
function emitSrc(v, ind) {
  if (Array.isArray(v)) {
    return '[\n' + v.map((f) => `${ind}  { path: ${JSON.stringify(f.path)}, lang: ${JSON.stringify(f.lang || (/\.(cpp|cc|hpp)$/.test(f.path) ? 'cpp' : 'c'))}, text: ${tl(f.text)} },`).join('\n') + `\n${ind}]`;
  }
  return tl(v);
}
let body = '';
for (const n of names) {
  const cases = require(path.join(dir, n + '.cjs'));
  body += `  // ---- ${n}.js\n`;
  for (const c of cases) {
    for (const s of [c.bad, c.good]) {
      const all = Array.isArray(s) ? s.map((x) => x.text).join('') : s;
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(all)) throw new Error(`control character in case ${c.key}`);
    }
    body += `  {\n    key: ${JSON.stringify(c.key)},${c.lang ? ` lang: ${JSON.stringify(c.lang)},` : ''}\n    bad: ${emitSrc(c.bad, '    ')},\n    good: ${emitSrc(c.good, '    ')},\n  },\n`;
  }
}
const tpl = fs.readFileSync(path.join(dir, 'template.mjs'), 'utf8');
fs.writeFileSync(path.join(ROOT, 'test/cert.test.mjs'), tpl.replace('/*CASES*/', body));
console.log('cases from', names.length, 'files');
