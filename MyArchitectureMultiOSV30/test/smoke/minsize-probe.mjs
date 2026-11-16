// Prints how the window's minimum width is made up (title bar, widest toolbar
// on two rows, side panels + drawing area) and checks the app at that width:
//   node test/smoke/minsize-probe.mjs [--shots dir]
import path from "node:path";
import { launch, sleep } from "./driver.mjs";

const shotsArg = process.argv.indexOf("--shots");
const shots = shotsArg > 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
const a = await launch({ width: 1500, height: 950 });
const app = (x) => a.ev(`const app = window.myarchApp; ${x}`);
try {
  for (let i = 0; i < 80; i++) { if (await app(`return !!(app && app.store && app.minSize)`).catch(() => false)) break; await sleep(250); }
  await app(`app.store.dirty = false; await app.openSample("03-two-storey-house.myarch"); return 1`);
  await sleep(600);
  const report = {};
  for (const tab of ["start", "plan", "3d", "views"]) {
    await app(`app.setTab("${tab}"); ${tab === "3d" ? "await app.v3d.ensure();" : ""} return 1`);
    await sleep(500);
    report[tab] = await app(`return { min: app.minSize, needs: { ...app.toolbarNeeds } }`);
  }
  console.log(JSON.stringify(report, null, 1));
  for (const tab of ["plan", "3d"]) {
    await app(`app.setTab("${tab}"); ${tab === "3d" ? "await app.v3d.ensure();" : ""} return 1`);
    await a.ev(`window.myarch.resizeWindow(400, 700); return 1`);
    await sleep(900);
    const r = await app(`const ws = document.getElementById("workspace"); const cols = getComputedStyle(ws).gridTemplateColumns; const bar = document.getElementById("toolbar");
      const center = document.querySelector("#view-${tab === "3d" ? "3d" : "plan"}").getBoundingClientRect();
      return { inner: innerWidth, cols, rows: bar.classList.contains("wrap"), barOverflow: bar.scrollWidth > bar.clientWidth + 1, centerW: Math.round(center.width), pageScroll: document.documentElement.scrollWidth > innerWidth + 1 }`);
    console.log(tab, JSON.stringify(r));
    if (shots) await a.shot(path.join(shots, `min-${tab}.png`));
  }
} finally {
  await a.close();
}
