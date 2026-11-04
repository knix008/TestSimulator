/* The summary at the very end of a test run. Only ASCII inside the tables: a check mark or a box
 * line can be two columns wide in a Korean console, which would break the vertical alignment. */
const RESET = "\x1b[0m";
const paint = (code, text) => "\x1b[" + code + "m" + text + RESET;

const WIDTH = 72;
const COL = { name: 34, result: 8, passed: 8, failed: 8, time: 12 };

function formatTime(ms) {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return Math.round(ms) + " ms";
  return (ms / 1000).toFixed(2) + " s";
}

function clip(text, width) {
  const value = String(text);
  return value.length > width ? value.slice(0, width - 3) + "..." : value;
}

function number(value, width, code) {
  if (value === null || value === undefined) return paint("2", "-".padStart(width));
  return paint(code, String(value).padStart(width));
}

const failedColor = (failed) => (failed ? "1;31" : "32");

function heading(title) {
  console.log("  " + paint("1;36", title));
}

function rule(char, code) {
  console.log("  " + paint(code || "2", char.repeat(WIDTH)));
}

function tableHead(first, second) {
  console.log("  " + paint("1;35",
    first.padEnd(COL.name) + second.padEnd(COL.result) + "Passed".padStart(COL.passed) + "Failed".padStart(COL.failed) + "Time".padStart(COL.time)));
  rule("-");
}

const STATUS = {
  ok: ["PASS", "1;32"],
  fail: ["FAIL", "1;31"],
  skip: ["SKIP", "1;33"],
};

/* stages: { name, status: ok|fail|skip, passed, failed, ms }
 * suites: { name, passed, failed, ms }
 * failures: { group, name, error } */
function print(report) {
  const stages = report.stages || [];
  const suites = report.suites || [];
  const failures = report.failures || [];
  const passed = stages.reduce((sum, row) => sum + (row.passed || 0), 0);
  const failed = stages.reduce((sum, row) => sum + (row.failed || 0), 0);
  const ms = stages.reduce((sum, row) => sum + (row.ms || 0), 0);
  // no test run at all means something is broken, not that all is well
  const allGood = stages.length > 0 && stages.every((row) => row.status === "ok") && failed === 0 && passed > 0;

  console.log("");
  rule("=", "1;36");
  console.log("  " + paint("1;36", "TEST SUMMARY"));
  rule("=", "1;36");

  if (suites.length) {
    console.log("");
    heading("Web test suites");
    tableHead("Suite", "Result");
    suites.forEach((row) => {
      const state = row.failed ? STATUS.fail : STATUS.ok;
      console.log("  " + paint("34", clip(row.name, COL.name - 1).padEnd(COL.name)) +
        paint(state[1], state[0].padEnd(COL.result)) +
        number(row.passed, COL.passed, "32") +
        number(row.failed, COL.failed, failedColor(row.failed)) +
        paint("33", formatTime(row.ms).padStart(COL.time)));
    });
  }

  console.log("");
  heading("Stages");
  tableHead("Stage", "Result");
  stages.forEach((row) => {
    const state = STATUS[row.status] || STATUS.fail;
    console.log("  " + paint("34", clip(row.name, COL.name - 1).padEnd(COL.name)) +
      paint(state[1], state[0].padEnd(COL.result)) +
      number(row.passed, COL.passed, "32") +
      number(row.failed, COL.failed, failedColor(row.failed)) +
      paint("33", formatTime(row.ms).padStart(COL.time)));
  });
  rule("-");
  console.log("  " + paint("1", "Total".padEnd(COL.name + COL.result)) +
    paint("1;32", String(passed).padStart(COL.passed)) +
    paint(failedColor(failed), String(failed).padStart(COL.failed)) +
    paint("1;33", formatTime(ms).padStart(COL.time)));

  if (failures.length) {
    console.log("");
    heading("Failures");
    failures.forEach((item, index) => {
      console.log("  " + paint("1;31", String(index + 1).padStart(3) + ".") + " " + item.group + " : " + item.name);
      if (item.error) console.log("       " + paint("31", item.error));
    });
  }

  console.log("");
  const banner = allGood
    ? " ALL PASSED  -  " + passed + " tests in " + formatTime(ms) + " "
    : " FAILED  -  " + failed + " failed, " + passed + " passed, " + stages.filter((row) => row.status !== "ok").length + " stage(s) not clean" + (passed ? " " : ", no test ran ");
  console.log("  " + paint(allGood ? "1;97;42" : "1;97;41", banner));
  console.log("");
  return allGood;
}

module.exports = { print: print, formatTime: formatTime };
