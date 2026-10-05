const registry = [];
let collecting = null;
var appWindow = null;
let running = false;

function suite(name, register) {
  const tests = [];
  collecting = tests;
  register();
  collecting = null;
  registry.push({ name, tests });
}

function test(name, fn) {
  collecting.push({ name, fn, status: "wait", ms: 0, error: "" });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Condition was not met");
}

function near(actual, expected, epsilon, message) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > epsilon) {
    throw new Error(message || `${actual} ≠ ${expected}`);
  }
}

function appCall(fn, arg) {
  const win = appWindow;
  const script = win.document.createElement("script");
  const payload = arg === undefined ? "" : JSON.stringify(arg);
  const call = payload === "" ? `(${fn.toString()})()` : `(${fn.toString()})(${payload})`;
  script.textContent = `
    window.__testPayload = undefined;
    window.__testError = "";
    try {
      window.__testPayload = ${call};
    } catch (error) {
      window.__testError = error && error.message ? error.message : String(error);
    }
  `;
  win.document.documentElement.append(script);
  script.remove();
  if (win.__testError) throw new Error(win.__testError);
  return win.__testPayload;
}

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function flatTests() {
  return registry.flatMap((group) => group.tests);
}

const STATUS_LABEL = { wait: "Pending", run: "Running", pass: "Passed", fail: "Failed" };

function render() {
  const report = document.getElementById("report");
  report.replaceChildren();
  let index = 0;
  for (const group of registry) {
    const done = group.tests.filter((item) => item.status === "pass" || item.status === "fail").length;
    const section = document.createElement("section");
    section.className = "suite";
    const head = document.createElement("div");
    head.className = "suite-head";
    const title = document.createElement("h3");
    title.textContent = group.name;
    const count = document.createElement("span");
    count.className = "suite-count";
    const passed = group.tests.filter((item) => item.status === "pass").length;
    const failed = group.tests.filter((item) => item.status === "fail").length;
    count.textContent = `${done} / ${group.tests.length} finished, ${passed} passed, ${failed} failed`;
    head.append(title, count);
    section.append(head);
    for (const item of group.tests) {
      index += 1;
      const row = document.createElement("article");
      row.className = `case ${item.status}`;
      row.dataset.id = item.id;
      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(index).padStart(2, "0");
      const badge = document.createElement("span");
      badge.className = `badge ${item.status}`;
      badge.textContent = STATUS_LABEL[item.status];
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = item.name;
      name.title = item.error ? `${item.name} — ${item.error}` : item.name;
      if (item.error) {
        const error = document.createElement("span");
        error.className = "error";
        error.textContent = item.error;
        name.append(error);
      }
      const dur = document.createElement("div");
      dur.className = "dur";
      dur.textContent = item.status === "wait" ? "—" : formatDuration(item.ms);
      row.append(num, badge, name, dur);
      section.append(row);
    }
    report.append(section);
  }
}

function summaryCell(className, text) {
  const cell = document.createElement("span");
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

function renderSuiteSummary() {
  const host = document.getElementById("suiteSummary");
  host.replaceChildren();
  const head = document.createElement("div");
  head.className = "suite-summary-row head";
  head.append(summaryCell("", "Suite"), summaryCell("", "Passed"), summaryCell("", "Failed"), summaryCell("", "Duration"));
  host.append(head);
  let passedAll = 0;
  let failedAll = 0;
  let msAll = 0;
  for (const group of registry) {
    const passed = group.tests.filter((item) => item.status === "pass").length;
    const failed = group.tests.filter((item) => item.status === "fail").length;
    const ms = group.tests.reduce((sum, item) => sum + (item.ms || 0), 0);
    passedAll += passed;
    failedAll += failed;
    msAll += ms;
    const row = document.createElement("div");
    row.className = failed ? "suite-summary-row has-fail" : "suite-summary-row";
    row.append(
      summaryCell("sum-name", group.name),
      summaryCell("sum-pass", String(passed)),
      summaryCell("sum-fail", String(failed)),
      summaryCell("sum-time", formatDuration(ms))
    );
    host.append(row);
  }
  const total = document.createElement("div");
  total.className = failedAll ? "suite-summary-row total has-fail" : "suite-summary-row total";
  total.append(
    summaryCell("sum-name", "Total"),
    summaryCell("sum-pass", String(passedAll)),
    summaryCell("sum-fail", String(failedAll)),
    summaryCell("sum-time", formatDuration(msAll))
  );
  host.append(total);
}

function updateSummary(elapsed) {
  renderSuiteSummary();
  const tests = flatTests();
  const passed = tests.filter((item) => item.status === "pass").length;
  const failed = tests.filter((item) => item.status === "fail").length;
  const done = passed + failed;
  document.getElementById("countTotal").textContent = String(tests.length);
  document.getElementById("countPass").textContent = String(passed);
  document.getElementById("countFail").textContent = String(failed);
  document.getElementById("countSuites").textContent = String(registry.length);
  document.getElementById("countTime").textContent = formatDuration(elapsed);
  document.getElementById("clock").textContent = formatClock(elapsed);
  document.getElementById("progressCount").textContent = `${done} / ${tests.length}`;
  const ratio = tests.length ? Math.round((done / tests.length) * 100) : 0;
  document.getElementById("progressFill").style.width = `${ratio}%`;
  const bar = document.getElementById("progressBar");
  bar.setAttribute("aria-valuenow", String(ratio));
  bar.setAttribute("aria-valuemax", "100");
  document.title = failed
    ? `${failed} failed · MyCalc 10.0 tests`
    : done === tests.length && tests.length
      ? `${passed} passed · MyCalc 10.0 tests`
      : "MyCalc 10.0 tests";
}

function waitForApp() {
  const frame = document.getElementById("appFrame");
  return new Promise((resolve, reject) => {
    const ready = () => {
      const win = frame.contentWindow;
      if (win && typeof win.setMode === "function" && typeof win.evaluateInt === "function") {
        appWindow = win;
        resolve(win);
        return true;
      }
      return false;
    };
    if (ready()) return;
    if (frame.contentDocument && frame.contentDocument.readyState === "complete" && ready()) return;
    frame.addEventListener("load", () => {
      if (!ready()) reject(new Error("Could not load the calculator."));
    }, { once: true });
    setTimeout(() => {
      if (!appWindow) reject(new Error("Could not load the calculator. Open this page from a web server."));
    }, 8000);
  });
}

async function runAll() {
  if (running) return;
  running = true;
  document.getElementById("rerun").disabled = true;
  for (const item of flatTests()) {
    item.status = "wait";
    item.ms = 0;
    item.error = "";
  }
  render();
  const started = performance.now();
  const timer = setInterval(() => updateSummary(performance.now() - started), 100);
  updateSummary(0);
  try {
    await waitForApp();
    let index = 0;
    const tests = flatTests();
    for (const group of registry) {
      for (const item of group.tests) {
        index += 1;
        item.status = "run";
        document.getElementById("progressLabel").textContent = `${group.name} · ${item.name}`;
        render();
        document.querySelector(`[data-id="${item.id}"]`)?.scrollIntoView({ block: "nearest" });
        const testStarted = performance.now();
        try {
          await item.fn();
          item.status = "pass";
        } catch (error) {
          item.status = "fail";
          item.error = error && error.message ? error.message : String(error);
        }
        item.ms = performance.now() - testStarted;
        updateSummary(performance.now() - started);
        document.getElementById("progressLabel").textContent = index === tests.length
          ? "All tests finished"
          : `${group.name} · ${item.name}`;
      }
    }
  } catch (error) {
    document.getElementById("progressLabel").textContent = error.message;
  } finally {
    clearInterval(timer);
    updateSummary(performance.now() - started);
    render();
    running = false;
    document.getElementById("rerun").disabled = false;
    window.scrollTo(0, 0);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  let serial = 0;
  for (const group of registry) {
    for (const item of group.tests) item.id = `t${serial++}`;
  }
  render();
  updateSummary(0);
  document.getElementById("progressLabel").textContent = "Starting tests";
  document.getElementById("rerun").addEventListener("click", runAll);
  runAll();
});
