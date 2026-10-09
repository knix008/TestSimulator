/**
 * Test output: colour while a terminal is watching, plain text when the run is
 * piped to a file or a CI log. Every category reports as it finishes, and the
 * summary at the end is one aligned table, failures first.
 */

const FORCED = process.env.FORCE_COLOR;
const COLOR =
  FORCED === "0" || process.env.NO_COLOR !== undefined
    ? false
    : Boolean(FORCED) || Boolean(process.stdout.isTTY);

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  grey: 90,
};

function paint(name, text) {
  if (!COLOR) return String(text);
  return `[${CODES[name]}m${text}[${CODES.reset}m`;
}

const c = Object.fromEntries(Object.keys(CODES).map((name) => [name, (text) => paint(name, text)]));

/** Visible width, so the table still lines up when a name holds Korean. */
function width(text) {
  let total = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    total += wide ? 2 : 1;
  }
  return total;
}

function padEnd(text, size) {
  return String(text) + " ".repeat(Math.max(0, size - width(text)));
}

function padStart(text, size) {
  return " ".repeat(Math.max(0, size - width(text))) + String(text);
}

function indent(text) {
  return String(text)
    .split("\n")
    .map((line) => `      ${c.grey(line)}`)
    .join("\n");
}

function duration(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/** A small bar, so a long category reads at a glance. */
function bar(passed, failed) {
  const total = passed + failed;
  if (!total) return "";
  const slots = 10;
  const good = failed === 0 ? slots : Math.max(0, Math.min(slots - 1, Math.round((passed / total) * slots)));
  const bad = slots - good;
  return (good ? c.green("█".repeat(good)) : "") + (bad ? c.red("█".repeat(bad)) : "");
}

export function createReporter() {
  return {
    category(name) {
      console.log(`\n${c.bold(c.cyan(`▶ ${name}`))}`);
    },
    pass(name, ms) {
      console.log(`  ${c.green("PASS")}  ${name} ${c.grey(`(${duration(ms)})`)}`);
    },
    fail(name, ms, error) {
      console.log(`  ${c.red(c.bold("FAIL"))}  ${c.red(name)} ${c.grey(`(${duration(ms)})`)}`);
      console.log(indent(error?.stack || error?.message || String(error)));
    },
    /**
     * @param {{name: string, passed: number, failed: number, ms: number}[]} rows
     */
    summary(rows, totalMs) {
      // Failures first so they cannot scroll past unnoticed, then the slowest,
      // then by name - a stable order that puts what needs attention on top.
      const sorted = [...rows].sort(
        (a, b) => b.failed - a.failed || b.ms - a.ms || a.name.localeCompare(b.name),
      );
      const passed = rows.reduce((sum, row) => sum + row.passed, 0);
      const failed = rows.reduce((sum, row) => sum + row.failed, 0);

      const head = ["Category", "Tests", "Pass", "Fail", "Time", "", "Result"];
      const body = sorted.map((row) => [
        row.name,
        String(row.passed + row.failed),
        String(row.passed),
        String(row.failed),
        duration(row.ms),
        bar(row.passed, row.failed),
        row.failed ? "FAIL" : "OK",
      ]);
      const totals = ["TOTAL", String(passed + failed), String(passed), String(failed), duration(totalMs), bar(passed, failed), failed ? "FAIL" : "OK"];

      // The bar column holds colour codes, so measure it on its slot count.
      const sizes = head.map((label, i) =>
        Math.max(width(label), ...[...body, totals].map((row) => (i === 5 ? 10 : width(row[i])))),
      );
      const line = (cells, tint) =>
        cells
          .map((cell, i) => {
            if (i === 5) return cell + " ".repeat(Math.max(0, sizes[i] - (cell ? 10 : 0)));
            const text = i === 0 || i === 6 ? padEnd(cell, sizes[i]) : padStart(cell, sizes[i]);
            return tint ? tint(i, text, cells) : text;
          })
          .join("  ");

      const rule = c.grey("─".repeat(sizes.reduce((sum, size) => sum + size + 2, -2)));
      console.log(`\n${c.bold(c.yellow("Summary"))}`);
      console.log(rule);
      console.log(c.bold(line(head)));
      console.log(rule);
      for (const row of body) {
        console.log(
          line(row, (i, text) => {
            if (i === 0) return row[3] !== "0" ? c.red(text) : text;
            if (i === 2) return row[2] === "0" ? c.grey(text) : c.green(text);
            if (i === 3) return row[3] === "0" ? c.grey(text) : c.red(c.bold(text));
            if (i === 4) return c.grey(text);
            if (i === 6) return row[3] === "0" ? c.green(text) : c.red(c.bold(text));
            return text;
          }),
        );
      }
      console.log(rule);
      console.log(
        c.bold(
          line(totals, (i, text) => {
            if (i === 2) return c.green(text);
            if (i === 3) return failed ? c.red(text) : c.grey(text);
            if (i === 4) return c.grey(text);
            if (i === 6) return failed ? c.red(text) : c.green(text);
            return text;
          }),
        ),
      );
      console.log(
        failed
          ? `\n${c.red(c.bold(`✘ ${failed} test${failed === 1 ? "" : "s"} failed`))} ${c.grey(`of ${passed + failed}`)}`
          : `\n${c.green(c.bold(`✔ all ${passed} tests passed`))} ${c.grey(`in ${duration(totalMs)}`)}`,
      );
    },
  };
}
