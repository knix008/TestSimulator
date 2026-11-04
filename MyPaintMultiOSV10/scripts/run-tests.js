/* npm test: every stage with its own heading and its output as it happens, then one summary of
 * the whole run as the last thing on the screen (scripts/test-report.js). A stage the next ones
 * need stops those; the web tests failing does not stop the host's tests, so the summary shows
 * everything that is wrong at once. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const report = require("./test-report");

const root = path.join(__dirname, "..");
const paint = (code, text) => "\x1b[" + code + "m" + text + "\x1b[0m";
const stripColor = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");

/* Runs a command; output goes straight to the screen, and onLine sees stdout when it is asked for. */
function run(command, args, options) {
  const opts = options || {};
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env: Object.assign({}, process.env, opts.env || {}),
      stdio: opts.onLine ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let rest = "";
    if (opts.onLine) {
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        rest += chunk.toString("utf8");
        const lines = rest.split(/\r?\n/);
        rest = lines.pop();
        lines.forEach(opts.onLine);
      });
    }
    child.on("error", (error) => { console.error(error.message); resolve(1); });
    child.on("close", (code) => {
      if (opts.onLine && rest) opts.onLine(rest);
      resolve(code === null ? 1 : code);
    });
  });
}

const node = (script) => [process.execPath, [path.join("scripts", script)]];

/* Each returns the numbers of its row. */
async function webStage() {
  const file = path.join(os.tmpdir(), "mypaint-test-" + process.pid + ".json");
  const code = await run(...node("test.js"), { env: { MYPAINT_TEST_REPORT: file } });
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.rmSync(file, { force: true });
  } catch (error) { /* it stopped before it had anything to report */ }
  return { code: code, passed: data ? data.passed : null, failed: data ? data.failed : null, suites: data ? data.suites : [], failures: data ? data.failures : [] };
}

async function rustStage() {
  let passed = 0;
  let failed = 0;
  let seen = false;
  const code = await run("cargo", ["test", "--color", "always", "--manifest-path", path.join("src-tauri", "Cargo.toml"), "--", "--color", "always"], {
    onLine: (line) => {
      const match = /test result: .*?(\d+) passed; (\d+) failed/.exec(stripColor(line));
      if (!match) return;
      seen = true;
      passed += Number(match[1]);
      failed += Number(match[2]);
    },
  });
  return { code: code, passed: seen ? passed : null, failed: seen ? failed : null };
}

const STAGES = [
  { name: "Vendor libraries", needed: true, run: () => run(...node("vendor.js")) },
  { name: "Test pictures", needed: true, run: () => run(...node("make-fixtures.js")) },
  { name: "Web tests", run: webStage },
  { name: "Stage the app for the host", needed: true, run: () => run(...node("stage-app.js")) },
  { name: "Rust host tests", run: rustStage },
];

async function main() {
  const rows = [];
  let suites = [];
  let failures = [];
  let blocked = false;
  for (let i = 0; i < STAGES.length; i += 1) {
    const stage = STAGES[i];
    if (blocked) {
      rows.push({ name: stage.name, status: "skip", passed: null, failed: null, ms: null });
      continue;
    }
    console.log("\n" + paint("1;36", "[" + (i + 1) + "/" + STAGES.length + "] " + stage.name));
    const started = Date.now();
    const out = await stage.run();
    const result = typeof out === "number" ? { code: out, passed: null, failed: null } : out;
    if (result.suites) suites = result.suites;
    if (result.failures) failures = result.failures;
    rows.push({
      name: stage.name,
      // a web stage that reported nothing did not pass, whatever its exit code
      status: result.code === 0 && !(stage.run === webStage && !result.passed) ? "ok" : "fail",
      passed: result.passed,
      failed: result.failed,
      ms: Date.now() - started,
    });
    if (result.code !== 0 && stage.needed) blocked = true;
  }
  const good = report.print({ stages: rows, suites: suites, failures: failures });
  process.exitCode = good ? 0 : 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
