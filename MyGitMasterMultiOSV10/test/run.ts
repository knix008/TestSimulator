// The unit test runner: prepares a scratch repository, runs every case in
// test/cases.ts grouped by category, prints one line per case (test/format.mjs) and a
// summary, and writes test-results/index.html and unit.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cases, prepare, tempHome, type TestCase } from "./cases.js";
// @ts-expect-error plain ESM module without a declaration file
import { createReporter } from "./format.mjs";
import { writeHtmlReport, type TestResult } from "./report.js";

const home = tempHome();
process.env.MGM_SETTINGS_DIR = path.join(home, "settings");
process.env.MGM_CACHE_DIR = path.join(home, "cache");

const resultsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test-results");
const reporter = createReporter({ title: "My Git Master · unit tests" });
let list: TestCase[] = [];
let appClose: (() => void) | undefined;
let summary: { passed: number; failed: number; total: number; ms: number; categories: unknown[]; results: TestResult[] };

/** Cases of one category run together, in the order categories first appear. */
function grouped(all: TestCase[]): TestCase[] {
  const order: string[] = [];
  for (const item of all) if (!order.includes(item.group)) order.push(item.group);
  return order.flatMap((group) => all.filter((item) => item.group === group));
}

try {
  const ctx = await prepare(home);
  appClose = () => ctx.app.close();
  list = [{ group: "Setup", name: "Create the test repository", fn: async () => {} }, ...grouped(cases(ctx))];
} catch (error) {
  list = [{ group: "Setup", name: "Create the test repository", fn: async () => { throw error; } }];
}

const sizes: Record<string, number> = {};
for (const item of list) sizes[item.group] = (sizes[item.group] ?? 0) + 1;
reporter.start(list.length, sizes);
try {
  for (const item of list) {
    const n = reporter.begin(item.group, item.name);
    const began = performance.now();
    try {
      await item.fn();
      reporter.end(item.group, item.name, n, true, performance.now() - began);
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      reporter.end(item.group, item.name, n, false, performance.now() - began, message);
    }
  }
} finally {
  appClose?.();
}
summary = reporter.finish();

const report = path.join(resultsDir, "index.html");
writeHtmlReport(summary.results, summary.ms, report);
fs.writeFileSync(path.join(resultsDir, "unit.json"), JSON.stringify({
  passed: summary.passed,
  total: summary.total,
  ms: Math.round(summary.ms),
  categories: summary.categories,
}));
console.log(`  Report  ${path.resolve(report)}`);

if (summary.failed === 0) fs.rmSync(home, { recursive: true, force: true });
else console.log(`  Left the temporary folder: ${home}`);

process.exit(summary.failed || summary.passed !== summary.total ? 1 : 0);
