// node:test reporter used by scripts/test.mjs: one JSON line per finished test
// ({ file, name, suite, ok, skip, ms, error }) so the runner can group, align and time them.
import path from 'node:path';

export default async function* reporter(source) {
  const suites = new Map(); // file -> [names by nesting]
  for await (const event of source) {
    if (event.type === 'test:start') {
      const { file = '', nesting = 0, name } = event.data;
      const stack = suites.get(file) ?? [];
      stack.length = nesting;
      stack[nesting] = name;
      suites.set(file, stack);
      continue;
    }
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const d = event.data;
    if (d.details?.type === 'suite') continue;
    // A file that fails to load reports itself as one failing test named after the file.
    const file = d.file ? path.basename(d.file) : '';
    const stack = suites.get(d.file ?? '') ?? [];
    const suite = stack.slice(0, d.nesting ?? 0).join(' › ');
    const err = d.details?.error;
    yield `${JSON.stringify({
      file, name: d.name, suite,
      ok: event.type === 'test:pass',
      skip: Boolean(d.skip || d.todo),
      ms: d.details?.duration_ms ?? 0,
      error: err ? String(err.cause?.message ?? err.message ?? err).split('\n').slice(0, 6).join('\n') : undefined,
    })}\n`;
  }
}
