// A node:test reporter for scripts/test-features.mjs: one JSON line per finished test ({ file, name, ok, skip }).
import path from 'node:path';

export default async function* reporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const d = event.data;
    if (d.details?.type === 'suite') continue;
    yield `${JSON.stringify({ file: d.file ? path.basename(d.file).replace(/\.test\.js$/, '') : '', name: d.name, ok: event.type === 'test:pass' && !d.skip && !d.todo, skip: Boolean(d.skip || d.todo) })}\n`;
  }
}
