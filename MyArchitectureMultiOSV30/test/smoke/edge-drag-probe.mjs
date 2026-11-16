// Drags the window's right edge with the real mouse (test/smoke/edge-drag.ps1)
// far past the minimum width and records every width the page saw on the way.
// The drag must stop at the minimum: once the OS minimum ignored the invisible
// resize border, the window shook 16 px around it and the toolbar flickered.
//   node test/smoke/edge-drag-probe.mjs        (moves the real mouse; Windows only)
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./driver.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "edge-drag.ps1");
const a = await launch({ width: 1600, height: 900 });
let ok = false;
try {
  for (let i = 0; i < 80; i++) { if (await a.ev(`return !!(window.myarchApp && window.myarchApp.minSize)`).catch(() => false)) break; await sleep(250); }
  await sleep(800);
  const min = await a.ev(`return window.myarchApp.minSize.width`);
  await a.ev(`window.__log = []; const bar = document.getElementById("toolbar");
    const rec = (why) => window.__log.push([why, innerWidth, bar.classList.contains("wrap") ? 1 : 0]);
    addEventListener("resize", () => rec("resize"));
    new MutationObserver(() => rec("class")).observe(bar, { attributes: true, attributeFilter: ["class"] });
    return 1`);
  console.log(execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-ProcId", String(a.child.pid), "-DX:-900"], { encoding: "utf8" }).trim());
  await sleep(500);
  const log = await a.ev(`return window.__log`);
  const final = await a.ev(`return innerWidth`);
  const r = { min, final, events: log.length, belowMin: log.filter((x) => x[1] < min - 1).length, wraps: log.filter((x) => x[2]).length };
  ok = log.length > 0 && Math.abs(final - min) <= 1 && !r.belowMin && !r.wraps;
  console.log(`${ok ? "PASS" : "FAIL"} ${JSON.stringify(r)}`);
} finally {
  await a.close();
}
process.exit(ok ? 0 : 1);
