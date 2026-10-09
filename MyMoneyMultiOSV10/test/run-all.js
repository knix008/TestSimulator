import fs from "node:fs";
import { JSDOM } from "jsdom";
import { createReporter } from "./reporter.js";

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
      const reporter = createReporter();
      const rows = [];
      let failed = 0;
      const started = Date.now();
      for (const group of groups) {
        reporter.category(group.name);
        const row = { name: group.name, passed: 0, failed: 0, ms: 0 };
        for (const test of group.tests) {
          const began = Date.now();
          try {
            await test.fn();
            const took = Date.now() - began;
            row.passed += 1;
            row.ms += took;
            reporter.pass(test.name, took);
          } catch (error) {
            const took = Date.now() - began;
            row.failed += 1;
            row.ms += took;
            failed += 1;
            reporter.fail(test.name, took, error);
          }
        }
        rows.push(row);
      }
      reporter.summary(rows, Date.now() - started);
      if (failed) process.exitCode = 1;
    },
  };
}

const harness = createHarness();
const { registerLogic } = await import("./suites/logic.js");
const { registerGui } = await import("./suites/gui.js");
registerLogic(harness);
registerGui(harness);
await harness.run();
