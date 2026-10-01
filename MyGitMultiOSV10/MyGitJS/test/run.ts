import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cases, prepare, tempHome } from "./cases.js";
import { beginCase, printHeading, printReport, writeHtmlReport, type TestResult } from "./report.js";

const home = tempHome();
process.env.MYGIT_SETTINGS_DIR = path.join(home, "settings");
process.env.MYGIT_CACHE_DIR = path.join(home, "cache");

const started = performance.now();
const results: TestResult[] = [];
let appClose: (() => void) | undefined;

const setup = beginCase({
  index: 0,
  total: 1,
  group: "Setup",
  name: "Create the test repository",
  suiteStarted: started,
});
try {
  const ctx = await prepare(home);
  setup.finish(true, performance.now() - started, "", { passed: 1, failed: 0 });
  appClose = () => ctx.app.close();
  const list = cases(ctx);
  printHeading(list.length);
  for (let index = 0; index < list.length; index++) {
    const item = list[index];
    const began = performance.now();
    const live = beginCase({
      index: index + 1,
      total: list.length,
      group: item.group,
      name: item.name,
      suiteStarted: started,
    });
    try {
      await item.fn();
      const result: TestResult = { group: item.group, name: item.name, ok: true, ms: performance.now() - began, error: "" };
      results.push(result);
      live.finish(true, result.ms, "", counts(results));
    } catch (error) {
      const result: TestResult = {
        group: item.group,
        name: item.name,
        ok: false,
        ms: performance.now() - began,
        error: error instanceof Error ? error.stack || error.message : String(error),
      };
      results.push(result);
      live.finish(false, result.ms, result.error, counts(results));
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  setup.finish(false, performance.now() - started, message, { passed: 0, failed: 1 });
  results.push({
    group: "Setup",
    name: "Create the test repository",
    ok: false,
    ms: performance.now() - started,
    error: message,
  });
} finally {
  appClose?.();
}

const totalMs = performance.now() - started;
printReport(results, totalMs);
const report = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test-results", "index.html");
writeHtmlReport(results, totalMs, report);
console.log(`Report  ${path.resolve(report)}`);

if (results.every((item) => item.ok)) fs.rmSync(home, { recursive: true, force: true });
else console.log(`Left the temporary folder: ${home}`);

process.exit(results.some((item) => !item.ok) ? 1 : 0);

function counts(results: TestResult[]): { passed: number; failed: number } {
  const failed = results.filter((item) => !item.ok).length;
  return { passed: results.length - failed, failed };
}
