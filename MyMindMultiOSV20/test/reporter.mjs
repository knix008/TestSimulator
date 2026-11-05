// The test output of npm test and npm run test:gui: one aligned, coloured line per test with
// its time, then an aligned summary table and the failures once more. NO_COLOR turns colour off.
import fs from "node:fs";
import path from "node:path";

const useColor = !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const c = {
  bold: paint(1),
  dim: paint(90),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  blue: paint(34),
  magenta: paint(35),
  cyan: paint(36),
  head: paint("1;36"),
  passBadge: paint("1;30;42"),
  failBadge: paint("1;37;41"),
};

const NAME_WIDTH = 68;
const TIME_WIDTH = 10;

/** Columns a string takes in a terminal: Korean and other wide characters count as two. */
export function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    width += (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xff60) ? 2 : 1;
  }
  return width;
}

const padEnd = (text, width) => `${text}${" ".repeat(Math.max(0, width - displayWidth(text)))}`;
const padStart = (text, width) => `${" ".repeat(Math.max(0, width - displayWidth(text)))}${text}`;

/** A name that fits its column; a longer one is cut and marked, so the columns stay straight. */
export function fit(text, width) {
  if (displayWidth(text) <= width) return padEnd(text, width);
  let out = "";
  for (const char of String(text)) {
    if (displayWidth(`${out}${char}`) > width - 1) break;
    out += char;
  }
  return padEnd(`${out}…`, width);
}

export function formatTime(ms) {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60000)} m ${((ms % 60000) / 1000).toFixed(1)} s`;
}

/** Fast tests stay quiet; slow ones stand out. */
const timeColor = (ms) => (ms < 100 ? c.dim : ms < 1000 ? c.cyan : ms < 10000 ? c.yellow : c.magenta);

export function createReporter({ title, reportFile, onFailure } = {}) {
  const categories = [];
  const failures = [];
  const startedAt = performance.now();
  let current = null;
  let index = 0;

  if (title) console.log(`\n${c.head(title)}`);

  function category(name) {
    current = { name, passed: 0, failed: 0, ms: 0 };
    categories.push(current);
    const rule = "─".repeat(Math.max(2, NAME_WIDTH + TIME_WIDTH + 11 - displayWidth(name)));
    console.log(`\n${c.head(`▶ ${name}`)} ${c.dim(rule)}`);
  }

  function note(text) {
    console.log(`  ${c.dim(text)}`);
  }

  async function test(name, options, maybeBody) {
    const body = maybeBody ?? options;
    if (maybeBody && options.skip) {
      console.log(`      ${c.dim("-")}  ${c.dim(fit(name, NAME_WIDTH))} ${c.dim(padStart("skipped", TIME_WIDTH))}`);
      return;
    }
    if (!current) category("Tests");
    index++;
    const number = c.dim(padStart(index, 4));
    const started = performance.now();
    let failure = null;
    try {
      await body();
    } catch (error) {
      failure = error;
    }
    const ms = performance.now() - started;
    current.ms += ms;
    const time = timeColor(ms)(padStart(formatTime(ms), TIME_WIDTH));
    if (failure) {
      current.failed++;
      const message = String(failure.message ?? failure);
      failures.push({ category: current.name, name, message });
      console.log(`${number}  ${c.red("✘")}  ${c.red(fit(name, NAME_WIDTH))} ${time}`);
      for (const line of message.split("\n")) console.log(`         ${c.red(line)}`);
      await onFailure?.(failures.length);
    } else {
      current.passed++;
      console.log(`${number}  ${c.green("✔")}  ${fit(name, NAME_WIDTH)} ${time}`);
    }
  }

  /** Prints the table, saves the report, and returns the exit code. */
  function summary() {
    const rows = categories.map((row) => ({ ...row, total: row.passed + row.failed }));
    const passed = rows.reduce((sum, row) => sum + row.passed, 0);
    const failed = rows.reduce((sum, row) => sum + row.failed, 0);
    const elapsed = performance.now() - startedAt;
    const nameWidth = Math.max(8, ...rows.map((row) => displayWidth(row.name)), "Total".length);
    const line = (left, middle, right) => c.dim(`${left}${["─".repeat(nameWidth + 2), "─".repeat(8), "─".repeat(8), "─".repeat(8), "─".repeat(12), "─".repeat(8)].join(middle)}${right}`);
    const bar = c.dim("│");
    const row = (name, pass, fail, total, time, state) => `${bar} ${name} ${bar} ${pass} ${bar} ${fail} ${bar} ${total} ${bar} ${time} ${bar} ${state} ${bar}`;
    const count = (value, color) => color(padStart(value, 6));

    console.log(`\n${c.head("■ Summary")}`);
    console.log(line("┌", "┬", "┐"));
    console.log(row(c.bold(padEnd("Category", nameWidth)), c.bold(padStart("Passed", 6)), c.bold(padStart("Failed", 6)), c.bold(padStart("Total", 6)), c.bold(padStart("Time", 10)), c.bold(padEnd("Status", 6))));
    console.log(line("├", "┼", "┤"));
    for (const item of rows) {
      console.log(row(
        c.cyan(padEnd(item.name, nameWidth)),
        count(item.passed, c.green),
        count(item.failed, item.failed ? c.red : c.dim),
        count(item.total, c.blue),
        timeColor(item.ms)(padStart(formatTime(item.ms), 10)),
        item.failed ? c.red(padEnd("✘ FAIL", 6)) : c.green(padEnd("✔ OK", 6)),
      ));
    }
    console.log(line("├", "┼", "┤"));
    console.log(row(
      c.bold(padEnd("Total", nameWidth)),
      c.bold(count(passed, c.green)),
      c.bold(count(failed, failed ? c.red : c.dim)),
      c.bold(count(passed + failed, c.blue)),
      c.bold(c.yellow(padStart(formatTime(elapsed), 10))),
      failed ? c.red(padEnd("✘ FAIL", 6)) : c.green(padEnd("✔ OK", 6)),
    ));
    console.log(line("└", "┴", "┘"));

    if (failures.length) {
      console.log(`\n${c.red(c.bold("✘ Failures"))}`);
      failures.forEach((item, at) => {
        console.log(`  ${c.dim(padStart(at + 1, 3))}  ${c.cyan(item.category)} ${c.dim("›")} ${c.red(item.name)}`);
        console.log(`       ${c.red(item.message.split("\n")[0])}`);
      });
    }
    const rate = passed + failed ? ((passed / (passed + failed)) * 100).toFixed(1) : "0.0";
    const verdict = failed ? c.failBadge(` FAILED ${failed} `) : c.passBadge(" ALL PASSED ");
    console.log(`\n${verdict}  ${c.green(`${passed} passed`)}, ${failed ? c.red(`${failed} failed`) : c.dim("0 failed")}, ${c.bold(`${rate}%`)}, ${c.yellow(formatTime(elapsed))}\n`);

    if (reportFile) {
      fs.mkdirSync(path.dirname(reportFile), { recursive: true });
      fs.writeFileSync(reportFile, JSON.stringify({ passed, failed, ms: Math.round(elapsed), categories: rows, failures }, null, 2));
    }
    return failed ? 1 : 0;
  }

  return { category, note, test, summary };
}
