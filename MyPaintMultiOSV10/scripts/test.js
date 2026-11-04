const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const browser = require("./browser");
const report = require("./test-report");

const root = browser.root;
const { startServer, stopProcess, removeProfile, waitForDebugger, connect, pageSocket } = browser;

function paint(code, text) {
  return "\x1b[" + code + "m" + text + "\x1b[0m";
}

function parseDuration(text) {
  const value = String(text || "").trim();
  if (value.endsWith("ms")) return Number.parseFloat(value) || 0;
  if (value.endsWith("s")) return (Number.parseFloat(value) || 0) * 1000;
  return 0;
}

async function readResult(cdp) {
  const response = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const button = document.getElementById("rerun");
      return {
        ready: Boolean(button),
        done: Boolean(button && !button.disabled),
        label: document.getElementById("progressLabel")?.textContent || "",
        pass: document.getElementById("countPass")?.textContent || "0",
        fail: document.getElementById("countFail")?.textContent || "0",
        total: document.getElementById("countTotal")?.textContent || "0",
        time: document.getElementById("countTime")?.textContent || "",
        clock: document.getElementById("clock")?.textContent || "",
        planned: (window.TEST_SUITES || []).map((suite) => ({ name: suite.name, count: suite.tests.length })),
        cases: [...document.querySelectorAll(".suite")].flatMap((suite) => {
          const group = suite.querySelector("h3")?.textContent || "";
          return [...suite.querySelectorAll(".case")].map((row) => ({
            group: group,
            name: row.querySelector(".name")?.textContent || "",
            status: row.classList.contains("fail") ? "fail" : row.classList.contains("pass") ? "pass" : row.classList.contains("run") ? "run" : "wait",
            dur: (row.querySelector(".dur")?.textContent || "").trim(),
            error: row.querySelector(".error")?.textContent || "",
          }));
        }),
      };
    })()`,
    returnByValue: true,
  });
  return response.result.value;
}

async function main() {
  if (!fs.existsSync(path.join(root, "assets", "icon.png"))) {
    await spawnSyncNode(path.join(root, "scripts", "make-icons.js"));
  }
  if (!browser.findBrowser()) {
    console.error("Edge or Chrome was not found. Set BROWSER to the executable path.");
    process.exit(1);
  }
  const server = await startServer();
  const pagePort = server.address().port;
  const debugPort = pagePort + 1;
  const page = browser.launch({
    port: debugPort,
    url: "http://127.0.0.1:" + pagePort + "/test/",
    prefix: "mypaint-test",
  });
  const profile = page.profile;

  let cdp;
  try {
    await waitForDebugger(debugPort);
    cdp = connect(await pageSocket(debugPort));
    await cdp.ready;
    await cdp.send("Runtime.enable");
    const started = Date.now();
    const live = process.stdout.isTTY;
    let printed = 0;
    let group = "";
    let status = "";
    let result;
    const clearStatus = () => {
      if (status) process.stdout.write("\r\x1b[2K");
      status = "";
    };
    console.log(paint("1", "TESTS"));
    while (Date.now() - started < 120000) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      try { result = await readResult(cdp); } catch (error) { continue; }
      if (!result || !result.ready) continue;
      const cases = result.cases || [];
      const total = result.planned.reduce((sum, row) => sum + row.count, 0) || cases.length;
      // in the order they ran, up to the first one still going
      while (printed < cases.length && (cases[printed].status === "pass" || cases[printed].status === "fail")) {
        clearStatus();
        const item = cases[printed];
        if (item.group !== group) {
          group = item.group;
          const plan = result.planned.find((row) => row.name === group);
          const count = plan ? plan.count : cases.filter((row) => row.group === group).length;
          console.log("\n  " + paint("1", group) + "  " + paint("2", "(" + count + ")"));
        }
        printed += 1;
        const counter = paint("2", ("[" + String(printed).padStart(String(total).length) + "/" + total + "]"));
        const mark = item.status === "pass" ? paint("32", "\u2714") : paint("31", "\u2718");
        const detail = item.error ? "\n" + paint("31", "      " + item.error) : "";
        console.log("  " + counter + " " + mark + " " + paint("2", (item.dur || "-").padStart(8)) + "  " + item.name + detail);
      }
      if (live) {
        const running = cases.find((item) => item.status === "run");
        const line = running ? "  ... " + running.group + " \u00b7 " + running.name : "";
        const width = (process.stdout.columns || 100) - 1;
        const shown = line.length > width ? line.slice(0, width - 1) + "\u2026" : line;
        if (shown !== status) {
          process.stdout.write("\r\x1b[2K" + paint("36", shown));
          status = shown;
        }
      }
    const finished = (result.cases || []).filter((item) => item.status === "pass" || item.status === "fail").length;
      if (result.done && Number(result.total) > 0 && finished >= Number(result.total)) break;
    }
    clearStatus();
    console.log("");
    if (!result || !result.done || !Number(result.total)) {
      console.error(paint("31", "Tests did not finish in time."));
      process.exitCode = 1;
      return;
    }
    const finished = (result.cases || []).filter((item) => item.status === "pass" || item.status === "fail");
    const groups = [];
    finished.forEach((item) => { if (!groups.includes(item.group)) groups.push(item.group); });
    const suites = groups.map((group) => {
      const rows = finished.filter((item) => item.group === group);
      return {
        name: group,
        passed: rows.filter((item) => item.status === "pass").length,
        failed: rows.filter((item) => item.status === "fail").length,
        ms: rows.reduce((sum, item) => sum + parseDuration(item.dur), 0),
      };
    });
    const failures = finished.filter((item) => item.status === "fail").map((item) => ({ group: item.group, name: item.name, error: item.error }));
    const passed = suites.reduce((sum, row) => sum + row.passed, 0);
    const failed = suites.reduce((sum, row) => sum + row.failed, 0);
    // npm test (run-tests.js) shows this in the summary of the whole run; run alone, it is the summary
    if (process.env.MYPAINT_TEST_REPORT) {
      fs.writeFileSync(process.env.MYPAINT_TEST_REPORT, JSON.stringify({ passed: passed, failed: failed, suites: suites, failures: failures }));
    } else {
      report.print({
        stages: [{ name: "Web tests", status: failed ? "fail" : "ok", passed: passed, failed: failed, ms: Date.now() - started }],
        suites: suites,
        failures: failures,
      });
    }
    if (result.fail !== "0") process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    await stopProcess(page.proc);
    await new Promise((resolve) => server.close(resolve));
    await removeProfile(profile);
  }
}

function spawnSyncNode(script) {
  const result = spawn(process.execPath, [script], { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    result.on("exit", (code) => (code ? reject(new Error("make-icons failed")) : resolve()));
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
