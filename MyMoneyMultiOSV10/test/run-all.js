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
      for (const group of groups) {
        console.log(`\n=== ${group.name} ===`);
        let groupPassed = 0;
        let groupFailed = 0;
        for (const test of group.tests) {
          try {
            await test.fn();
            groupPassed += 1;
            passed += 1;
            console.log(`  PASS  ${test.name}`);
          } catch (error) {
            groupFailed += 1;
            failed += 1;
            console.log(`  FAIL  ${test.name}`);
            console.log(indent(error.stack || error.message));
          }
        }
        summary.push({ name: group.name, passed: groupPassed, failed: groupFailed });
      }
      console.log("\n========== Summary ==========");
      const width = Math.max(...summary.map((row) => row.name.length), "TOTAL".length);
      for (const row of summary) {
        console.log(`${row.name.padEnd(width)}  ${row.passed} passed, ${row.failed} failed`);
      }
      console.log(`${"TOTAL".padEnd(width)}  ${passed} passed, ${failed} failed`);
      if (failed) process.exitCode = 1;
    },
  };
}

function indent(text) {
  return String(text)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

const harness = createHarness();
const { registerLogic } = await import("./suites/logic.js");
const { registerGui } = await import("./suites/gui.js");
registerLogic(harness);
registerGui(harness);
await harness.run();
