// Minimal test harness: categories, one aligned line per test with its run time, and a
// colour summary at the end. No dependencies.

const useColor = process.stdout.isTTY !== false && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const c = {
  bold: paint("1"),
  dim: paint("2"),
  red: paint("31"),
  green: paint("32"),
  yellow: paint("33"),
  blue: paint("34"),
  magenta: paint("35"),
  cyan: paint("36"),
  gray: paint("90"),
  bgGreen: paint("30;42"),
  bgRed: paint("97;41"),
  bgYellow: paint("30;43"),
};

/** Thrown (or returned via skip()) to mark a test as skipped. */
export class Skip extends Error {
  constructor(reason) {
    super(reason);
    this.name = "Skip";
  }
}
export const skip = (reason) => {
  throw new Skip(reason);
};

export function assert(condition, message = "assertion failed") {
  if (!condition) throw new Error(message);
}
export function assertEqual(actual, expected, message = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ? message + ": " : ""}expected ${e}, got ${a}`);
}

const CATEGORY_WIDTH = 10;
const NAME_WIDTH = 64;
const TIME_WIDTH = 10;

const STATUS = {
  pass: () => c.green("✔ PASS"),
  fail: () => c.red("✖ FAIL"),
  skip: () => c.yellow("○ SKIP"),
};

function formatMs(ms) {
  const text = ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
  const padded = text.padStart(TIME_WIDTH);
  if (ms >= 5000) return c.red(padded);
  if (ms >= 1000) return c.yellow(padded);
  return c.gray(padded);
}

function fit(text, width) {
  const s = String(text);
  return s.length > width ? s.slice(0, width - 1) + "…" : s.padEnd(width);
}

const CATEGORY_COLORS = [c.cyan, c.magenta, c.blue];

export class Runner {
  constructor() {
    /** @type {{ category: string, name: string, status: string, ms: number, error?: string }[]} */
    this.results = [];
    this.categoryOrder = [];
  }

  categoryColor(category) {
    let i = this.categoryOrder.indexOf(category);
    if (i < 0) {
      this.categoryOrder.push(category);
      i = this.categoryOrder.length - 1;
    }
    return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
  }

  header(title) {
    console.log("");
    console.log(c.bold(`  ${title}`));
    console.log(c.gray(`  ${"─".repeat(CATEGORY_WIDTH + NAME_WIDTH + TIME_WIDTH + 14)}`));
  }

  /** Prints one result line. */
  line(category, name, status, ms, detail) {
    const color = this.categoryColor(category);
    console.log(`  ${STATUS[status]()}  ${color(fit(category, CATEGORY_WIDTH))}  ${fit(name, NAME_WIDTH)}${formatMs(ms)}`);
    if (detail) {
      const tint = status === "fail" ? c.red : c.gray;
      for (const row of String(detail).split(/\r?\n/).slice(0, 8)) {
        console.log(`  ${" ".repeat(8)}${" ".repeat(CATEGORY_WIDTH + 2)}${tint("↳ " + row)}`);
      }
    }
  }

  record(category, name, status, ms, error) {
    this.results.push({ category, name, status, ms, error });
    this.line(category, name, status, ms, error);
  }

  /** Runs one test with a timeout. */
  async test(category, name, fn, { timeout = 30_000 } = {}) {
    const t0 = performance.now();
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(fn),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timed out after ${timeout} ms`)), timeout);
        }),
      ]);
      this.record(category, name, "pass", performance.now() - t0);
    } catch (err) {
      const ms = performance.now() - t0;
      if (err instanceof Skip) this.record(category, name, "skip", ms, err.message);
      else this.record(category, name, "fail", ms, err?.stack?.split("\n").slice(0, 3).join("\n") || String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Marks every remaining test of a group as skipped (e.g. the app did not start). */
  skipAll(category, names, reason) {
    for (const name of names) this.record(category, name, "skip", 0, reason);
  }

  summary(totalMs) {
    const cats = [...new Set(this.results.map((r) => r.category))];
    const w = { cat: 12, n: 8 };
    console.log("");
    console.log(c.bold("  Summary"));
    console.log(c.gray(`  ${"─".repeat(w.cat + w.n * 4 + 12)}`));
    console.log(
      c.bold(
        `  ${"Category".padEnd(w.cat)}${"Total".padStart(w.n)}${"Passed".padStart(w.n)}${"Failed".padStart(w.n)}${"Skipped".padStart(w.n)}${"Time".padStart(12)}`,
      ),
    );
    const row = (label, list, bold = false) => {
      const passed = list.filter((r) => r.status === "pass").length;
      const failed = list.filter((r) => r.status === "fail").length;
      const skipped = list.filter((r) => r.status === "skip").length;
      const ms = list.reduce((s, r) => s + r.ms, 0);
      const name = bold ? c.bold(label.padEnd(w.cat)) : this.categoryColor(label)(label.padEnd(w.cat));
      console.log(
        `  ${name}${String(list.length).padStart(w.n)}${c.green(String(passed).padStart(w.n))}${(failed ? c.red : c.gray)(String(failed).padStart(w.n))}${(skipped ? c.yellow : c.gray)(String(skipped).padStart(w.n))}${c.gray(`${(ms / 1000).toFixed(2)} s`.padStart(12))}`,
      );
      return { passed, failed, skipped };
    };
    for (const cat of cats) row(cat, this.results.filter((r) => r.category === cat));
    console.log(c.gray(`  ${"─".repeat(w.cat + w.n * 4 + 12)}`));
    const all = row("Total", this.results, true);

    const failures = this.results.filter((r) => r.status === "fail");
    if (failures.length) {
      console.log("");
      console.log(c.bold(c.red("  Failed tests")));
      for (const f of failures) console.log(`  ${c.red("✖")} ${c.cyan(fit(f.category, CATEGORY_WIDTH))}  ${f.name}`);
    }
    console.log("");
    const verdict = all.failed ? c.bgRed(" FAILED ") : c.bgGreen(" PASSED ");
    console.log(
      `  ${verdict}  ${c.green(`${all.passed} passed`)}, ${(all.failed ? c.red : c.gray)(`${all.failed} failed`)}, ${(all.skipped ? c.yellow : c.gray)(`${all.skipped} skipped`)} of ${this.results.length} tests in ${c.bold((totalMs / 1000).toFixed(1) + " s")}`,
    );
    console.log("");
    return all.failed === 0;
  }
}
