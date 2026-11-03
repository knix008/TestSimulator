// Console output for every test run (test/run.ts and scripts/test-all.mjs): one
// coloured, column-aligned line per test case, grouped by category, with a progress
// line after each category and a summary table at the end. English only.

const NO_COLOR = Boolean(process.env.NO_COLOR) || process.env.FORCE_COLOR === "0";
const code = (open) => (text) => (NO_COLOR ? String(text) : `\x1b[${open}m${text}\x1b[0m`);

export const c = {
  bold: code("1"),
  dim: code("2"),
  red: code("31"),
  green: code("32"),
  yellow: code("33"),
  blue: code("34"),
  magenta: code("35"),
  cyan: code("36"),
  white: code("97"),
  okBadge: code("1;97;42"),
  failBadge: code("1;97;41"),
  infoBadge: code("1;97;44"),
};

export const stripAnsi = (text) => String(text).replace(/\x1b\[[0-9;]*m/g, "");

export function formatMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60000)} m ${((ms % 60000) / 1000).toFixed(1)} s`;
}

/** Pads `text` (which may hold colour codes) to `width` visible characters. */
export function pad(text, width, align = "left") {
  const visible = stripAnsi(text).length;
  const fill = " ".repeat(Math.max(0, width - visible));
  return align === "right" ? fill + text : text + fill;
}

/** Cuts a plain string to `width` characters, ending in "…" when it was longer. */
export function fit(text, width) {
  const plain = String(text);
  return plain.length <= width ? plain : `${plain.slice(0, Math.max(0, width - 1))}…`;
}

export function bar(done, total, width = 20) {
  const ratio = total > 0 ? done / total : 0;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  const paint = done === total ? c.green : c.red;
  return paint("█".repeat(filled)) + c.dim("░".repeat(width - filled));
}

const PALETTE = [c.cyan, c.magenta, c.blue, c.yellow];
const categoryPaint = (index) => PALETTE[index % PALETTE.length];

/**
 * A live reporter. `start(total, categories)`, then for each case `begin(case)` →
 * `end(case, ok, ms, error)`; `endCategory` is called automatically when the
 * category changes and at `finish()`, which prints the summary and returns it.
 */
export function createReporter({ title, nameWidth = 60, out = process.stdout } = {}) {
  const tty = Boolean(out.isTTY) && !NO_COLOR;
  const write = (line = "") => out.write(`${line}\n`);
  const results = [];
  const categories = new Map();
  let total = 0;
  let index = 0;
  let current = null;
  let categoryCount = 0;
  let suiteStart = 0;
  let live = null;
  const counterWidth = () => String(Math.max(total, 1)).length;
  const counter = (n) => c.dim(`[${String(n).padStart(counterWidth())}/${total}]`);

  function category(name) {
    if (!categories.has(name)) categories.set(name, { name, passed: 0, failed: 0, ms: 0, total: 0, index: categories.size });
    return categories.get(name);
  }

  function closeCategory() {
    if (!current) return;
    const stats = categories.get(current);
    const status = stats.failed ? c.red(`${stats.failed} failed`) : c.green("all passed");
    write(`  ${c.dim("└─")} ${pad(categoryPaint(stats.index)(c.bold(fit(current, 24))), 24)} ${pad(`${stats.passed}/${stats.total}`, 7, "right")}  ${bar(stats.passed, stats.total, 16)}  ${pad(c.yellow(formatMs(stats.ms)), 10, "right")}  ${status}`);
    write();
    current = null;
  }

  return {
    start(count, groupSizes = {}) {
      total = count;
      suiteStart = performance.now();
      for (const [name, size] of Object.entries(groupSizes)) category(name).total = size;
      write();
      write(`${c.infoBadge(` ${title} `)}  ${c.bold(`${count} tests`)} ${c.dim(`in ${Object.keys(groupSizes).length} categories`)}`);
      write(c.dim("─".repeat(nameWidth + 30)));
    },
    begin(group, name) {
      if (group !== current) {
        closeCategory();
        current = group;
        const stats = category(group);
        categoryCount += 1;
        write(`${categoryPaint(stats.index)(c.bold(`▶ ${group}`))} ${c.dim(`(${stats.total} ${stats.total === 1 ? "test" : "tests"})`)}`);
      }
      index += 1;
      const began = performance.now();
      const n = index;
      const paint = () => {
        const elapsed = formatMs(performance.now() - began);
        out.write(`\r  ${counter(n)}  ${c.yellow(c.bold("RUN "))}  ${pad(fit(name, nameWidth), nameWidth)}  ${pad(c.yellow(elapsed), 10, "right")}\x1b[K`);
      };
      if (tty) {
        paint();
        live = setInterval(paint, 250);
        live.unref?.();
      }
      return n;
    },
    end(group, name, n, ok, ms, error = "") {
      if (live) clearInterval(live);
      live = null;
      if (tty) out.write("\r\x1b[K");
      const stats = category(group);
      if (ok) stats.passed += 1;
      else stats.failed += 1;
      stats.ms += ms;
      results.push({ group, name, ok, ms, error });
      const mark = ok ? c.green(c.bold("PASS")) : c.red(c.bold("FAIL"));
      const label = ok ? fit(name, nameWidth) : c.red(fit(name, nameWidth));
      write(`  ${counter(n)}  ${mark}  ${pad(label, nameWidth)}  ${pad(c.yellow(formatMs(ms)), 10, "right")}`);
      if (!ok && error) {
        for (const line of String(error).split(/\r?\n/).slice(0, 6)) write(`  ${" ".repeat(counterWidth() * 2 + 3)}  ${c.red(`│ ${fit(line, nameWidth + 8)}`)}`);
      }
    },
    finish() {
      closeCategory();
      const elapsed = performance.now() - suiteStart;
      const rows = [...categories.values()].filter((row) => row.total > 0 || row.passed + row.failed > 0);
      const passed = results.filter((row) => row.ok).length;
      const failed = results.length - passed;
      const nameCol = Math.max(10, ...rows.map((row) => row.name.length)) + 2;
      const line = c.dim("─".repeat(nameCol + 58));
      write(c.bold(c.white("SUMMARY")) + c.dim(`  ${title}`));
      write(line);
      write(c.dim(`  ${pad("Category", nameCol)}${pad("Passed", 8, "right")}${pad("Failed", 8, "right")}${pad("Total", 7, "right")}${pad("Time", 12, "right")}  Progress`));
      for (const row of rows) {
        const done = row.passed + row.failed;
        write(`  ${pad(categoryPaint(row.index)(row.name), nameCol)}${pad(c.green(String(row.passed)), 8, "right")}${pad(row.failed ? c.red(String(row.failed)) : c.dim("0"), 8, "right")}${pad(String(row.total || done), 7, "right")}${pad(c.yellow(formatMs(row.ms)), 12, "right")}  ${bar(row.passed, row.total || done, 16)}`);
      }
      write(line);
      const badge = failed === 0 && results.length === total ? c.okBadge(" ALL PASSED ") : c.failBadge(` ${failed || total - results.length} FAILED `);
      write(`  ${pad(c.bold("TOTAL"), nameCol)}${pad(c.green(c.bold(String(passed))), 8, "right")}${pad(failed ? c.red(c.bold(String(failed))) : c.dim("0"), 8, "right")}${pad(c.bold(String(total)), 7, "right")}${pad(c.yellow(formatMs(elapsed)), 12, "right")}  ${badge}`);
      write(line);
      if (failed) {
        write(c.red(c.bold("FAILED TESTS")));
        for (const row of results.filter((item) => !item.ok)) {
          write(`  ${c.red("✗")} ${c.dim(row.group)}  ${row.name}`);
          for (const text of String(row.error).split(/\r?\n/).slice(0, 4)) write(`      ${c.red(fit(text, nameCol + 60))}`);
        }
      }
      return { passed, failed, total, ms: elapsed, categories: rows.map(({ name, passed: p, failed: f, total: t, ms }) => ({ name, passed: p, failed: f, total: t, ms })), results };
    },
  };
}
