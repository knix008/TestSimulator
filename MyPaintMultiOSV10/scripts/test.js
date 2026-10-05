const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const browser = require("./browser");

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

function formatSummaryDuration(ms) {
  if (ms < 1000) return Math.round(ms) + " ms";
  return (ms / 1000).toFixed(2) + " s";
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
    let last = "";
    let result;
    while (Date.now() - started < 120000) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      try { result = await readResult(cdp); } catch (error) { continue; }
      if (!result || !result.ready) continue;
      const running = (result.cases || []).find((item) => item.status === "run");
      const line = running ? "Running  " + running.group + " · " + running.name + "   " + result.clock : result.label + "   " + result.clock;
      if (line !== last) {
        process.stdout.write("\r" + paint("36", line.padEnd(Math.max(last.length, line.length), " ")));
        last = line;
      }
      const finished = (result.cases || []).filter((item) => item.status === "pass" || item.status === "fail").length;
      if (result.done && Number(result.total) > 0 && finished >= Number(result.total)) break;
    }
    process.stdout.write("\n\n");
    if (!result || !result.done) {
      console.error(paint("31", "Tests did not finish in time."));
      process.exitCode = 1;
      return;
    }
    const finished = (result.cases || []).filter((item) => item.status === "pass" || item.status === "fail");
    const suites = [];
    finished.forEach((item) => { if (!suites.includes(item.group)) suites.push(item.group); });
    console.log(paint("1", "DETAILS"));
    console.log(paint("2", "  " + "#".padEnd(4) + "Status".padEnd(10) + "Duration".padEnd(12) + "Case"));
    console.log(paint("2", "  " + "-".repeat(72)));
    let lastGroup = "";
    finished.forEach((item, index) => {
      if (item.group !== lastGroup) {
        const count = finished.filter((row) => row.group === item.group).length;
        console.log("");
        console.log("  " + paint("1", item.group) + "  " + paint("2", "(" + count + ")"));
        lastGroup = item.group;
      }
      const status = item.status === "pass" ? paint("32", "Passed".padEnd(10)) : paint("31", "Failed".padEnd(10));
      const detail = item.error ? "  " + paint("31", item.error) : "";
      console.log("  " + String(index + 1).padStart(2, "0") + "  " + status + (item.dur || "-").padEnd(12) + item.name + detail);
    });
    console.log("");
    console.log(paint("1", "SUMMARY"));
    console.log(paint("2", "  " + "-".repeat(28)));
    const summaryRows = [
      ["Total", result.total],
      ["Passed", result.pass],
      ["Failed", result.fail],
      ["Duration", result.time],
      ["Suites", String(suites.length)],
    ];
    summaryRows.forEach((row) => {
      const color = row[0] === "Failed" ? (row[1] === "0" ? "32" : "31") : row[0] === "Passed" ? "32" : "33";
      console.log("  " + row[0].padEnd(10) + "  " + paint(color, String(row[1]).padStart(8)));
    });
    console.log("");
    const summaryWidth = 28 + 8 + 8 + 12;
    console.log(paint("2", "  " + "Suite".padEnd(28) + "Passed".padStart(8) + "Failed".padStart(8) + "Duration".padStart(12)));
    console.log(paint("2", "  " + "-".repeat(summaryWidth)));
    let passedAll = 0;
    let failedAll = 0;
    let msAll = 0;
    suites.forEach((group) => {
      const rows = finished.filter((item) => item.group === group);
      const passed = rows.filter((item) => item.status === "pass").length;
      const failed = rows.filter((item) => item.status === "fail").length;
      const ms = rows.reduce((sum, item) => sum + parseDuration(item.dur), 0);
      passedAll += passed;
      failedAll += failed;
      msAll += ms;
      console.log("  " + group.padEnd(28) + paint("32", String(passed).padStart(8)) + paint(failed ? "31" : "32", String(failed).padStart(8)) + formatSummaryDuration(ms).padStart(12));
    });
    console.log(paint("2", "  " + "-".repeat(summaryWidth)));
    console.log("  " + paint("1", "Total".padEnd(28)) + paint("32", String(passedAll).padStart(8)) + paint(failedAll ? "31" : "32", String(failedAll).padStart(8)) + formatSummaryDuration(msAll).padStart(12));
    console.log("");
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
