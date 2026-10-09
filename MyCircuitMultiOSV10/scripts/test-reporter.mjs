// node:test reporter used by scripts/test.mjs: one JSON line per finished test
// (name, file, duration, pass/fail, error) so the runner can group, sort and
// summarise them.
export default async function* reporter(source) {
  for await (const ev of source) {
    if (ev.type !== "test:pass" && ev.type !== "test:fail") continue;
    const d = ev.data;
    // Skip the per-file wrapper; only real tests (and suites with their own failures).
    if (d.details && d.details.type === "suite") continue;
    const err = ev.type === "test:fail" ? d.details && d.details.error : null;
    yield `${JSON.stringify({
      t: "result",
      name: d.name,
      file: d.file || "",
      nesting: d.nesting,
      ok: ev.type === "test:pass",
      skipped: !!d.skip,
      todo: !!d.todo,
      ms: d.details ? d.details.duration_ms : 0,
      error: err ? String((err.cause && err.cause.message) || err.message || err).split("\n").slice(0, 6).join("\n") : null,
    })}\n`;
  }
}
