// node --test reporter for scripts/test.mjs: one JSON line per finished top-level test
// ({ event: 'pass' | 'fail' | 'skip', name, file, ms, error }), so the runner can draw its progress.
export default async function* events(source) {
  for await (const { type, data } of source) {
    if ((type !== 'test:pass' && type !== 'test:fail') || data.nesting !== 0 || data.details?.type === 'suite') continue;
    const skipped = data.skip !== undefined || data.todo !== undefined;
    const error = data.details?.error;
    const message = error ? String(error.cause?.message ?? error.message ?? error).split(/\r?\n/).filter(Boolean).slice(0, 6).join('\n') : undefined;
    yield `${JSON.stringify({ event: skipped ? 'skip' : type === 'test:pass' ? 'pass' : 'fail', name: data.name, file: data.file, ms: data.details?.duration_ms ?? 0, error: message })}\n`;
  }
}
