import fs from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://127.0.0.1/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.SVGElement = window.SVGElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.DocumentFragment = window.DocumentFragment;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.WheelEvent = window.WheelEvent;
globalThis.FocusEvent = window.FocusEvent;
globalThis.DragEvent = window.DragEvent;
globalThis.DataTransfer = window.DataTransfer;
globalThis.File = window.File;
globalThis.FileReader = window.FileReader;
globalThis.Blob = window.Blob;
globalThis.FormData = window.FormData;
globalThis.MutationObserver = window.MutationObserver;
globalThis.Image = window.Image;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
for (const key of ["navigator", "localStorage"]) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  if (!descriptor || descriptor.writable || descriptor.configurable) {
    try {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: window[key] });
    } catch {
      /* Node already exposes this global. */
    }
  }
}

const css = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const style = window.document.createElement("style");
style.textContent = css;
window.document.head.appendChild(style);

/** Colour on a terminal, off when piped or NO_COLOR is set, and FORCE_COLOR=1 overrides both. */
const COLOUR = process.env.FORCE_COLOR === "1" || (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
const paint = (code) => (text) => (COLOUR ? `\u001b[${code}m${text}\u001b[0m` : String(text));
const ink = {
  bold: paint("1"),
  dim: paint("2"),
  red: paint("31"),
  green: paint("32"),
  yellow: paint("33"),
  blue: paint("34"),
  magenta: paint("35"),
  cyan: paint("36"),
  grey: paint("90"),
  onGreen: paint("1;42;30"),
  onRed: paint("1;41;37"),
};

function timeText(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** A slow test is worth noticing, so the time is coloured by how long it took. */
function paintTime(ms, text) {
  if (ms >= 1000) return ink.red(text);
  if (ms >= 300) return ink.yellow(text);
  return ink.grey(text);
}

function timing(ms) {
  return paintTime(ms, timeText(ms));
}

/** Padded first, painted after, so every bar that follows starts in the same column. */
function timeCell(ms, width = 8) {
  return paintTime(ms, timeText(ms).padStart(width));
}

function bar(passed, failed, width = 24) {
  const total = passed + failed || 1;
  const good = Math.round((passed / total) * width);
  return `${ink.green("\u2588".repeat(good))}${ink.red("\u2588".repeat(width - good))}`;
}

function createHarness() {
  const groups = [];
  let current = null;
  return {
    category(name) {
      current = { name, tests: [] };
      groups.push(current);
    },
    test(name, fn) {
      if (!current) throw new Error(`Test "${name}" has no category`);
      current.tests.push({ name, fn });
    },
    async run() {
      let passed = 0;
      let failed = 0;
      const summary = [];
      const failures = [];
      const started = Date.now();
      const width = Math.max(...groups.map((group) => group.name.length), "TOTAL".length);
      for (const group of groups) {
        console.log(`\n${ink.cyan("\u25b6")} ${ink.bold(ink.cyan(group.name))}`);
        let groupPassed = 0;
        let groupFailed = 0;
        const groupStarted = Date.now();
        for (const test of group.tests) {
          const at = Date.now();
          try {
            await test.fn();
            const took = Date.now() - at;
            groupPassed += 1;
            passed += 1;
            console.log(`  ${ink.green("\u2714")} ${ink.green("PASS")}  ${test.name} ${timing(took)}`);
          } catch (error) {
            const took = Date.now() - at;
            groupFailed += 1;
            failed += 1;
            failures.push({ group: group.name, name: test.name, error });
            console.log(`  ${ink.red("\u2718")} ${ink.red(ink.bold("FAIL"))}  ${test.name} ${timing(took)}`);
            console.log(ink.red(indent(error.stack || error.message)));
          }
        }
        summary.push({ name: group.name, passed: groupPassed, failed: groupFailed, ms: Date.now() - groupStarted });
      }
      const elapsed = Date.now() - started;

      console.log(`\n${ink.bold("\u2500".repeat(width + 46))}`);
      console.log(`${ink.bold("SUMMARY".padEnd(width))}  ${ink.grey("passed".padStart(7))} ${ink.grey("failed".padStart(7))} ${ink.grey("time".padStart(8))}`);
      console.log(ink.grey("\u2500".repeat(width + 46)));
      for (const row of summary) {
        const name = row.failed ? ink.red(row.name.padEnd(width)) : row.name.padEnd(width);
        const good = ink.green(String(row.passed).padStart(7));
        const bad = row.failed ? ink.red(ink.bold(String(row.failed).padStart(7))) : ink.grey("0".padStart(7));
        console.log(`${name}  ${good} ${bad} ${timeCell(row.ms)}  ${bar(row.passed, row.failed, 12)}`);
      }
      console.log(ink.grey("\u2500".repeat(width + 46)));
      const totalGood = ink.green(ink.bold(String(passed).padStart(7)));
      const totalBad = failed ? ink.red(ink.bold(String(failed).padStart(7))) : ink.grey("0".padStart(7));
      console.log(`${ink.bold("TOTAL".padEnd(width))}  ${totalGood} ${totalBad} ${timeCell(elapsed)}  ${bar(passed, failed, 12)}`);

      if (failures.length) {
        console.log(`\n${ink.bold(ink.red("FAILED TESTS"))}`);
        for (const item of failures) console.log(`  ${ink.red("\u2718")} ${ink.grey(`${item.group} \u203a`)} ${item.name}`);
      }
      const verdict = failed ? ink.onRed(` ${failed} FAILED `) : ink.onGreen(` ALL ${passed} PASSED `);
      console.log(`\n${verdict} ${ink.grey(`in ${(elapsed / 1000).toFixed(1)}s`)}\n`);
      if (failed) process.exitCode = 1;
    },
  };
}

function indent(text) {
  return String(text)
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}

const harness = createHarness();
const { registerLogic } = await import("./suites/logic.js");
const { registerGui } = await import("./suites/gui.js");
registerLogic(harness);
registerGui(harness);
await harness.run();
