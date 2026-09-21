"use strict";

const path = require("path");

const FEATURE = {
  "agent-cli.test.js": "Agent CLI / sources",
  "agent-live.test.js": "Live MMON session",
  "background-sampler.test.js": "Background sampler",
  "chart-window.test.js": "Chart time window",
  "collector.test.js": "Local collector",
  "connection-manager.test.js": "Connection manager",
  "constants.test.js": "Protocol constants",
  "copy-installer.test.js": "Installer copy",
  "decoder-stream.test.js": "Decoder stream",
  "dialogs.test.js": "Dialogs / title / author",
  "flags.test.js": "Language flags",
  "http.test.js": "HTTPS ingest / JSON",
  "i18n.test.js": "i18n packs",
  "icon-alpha.test.js": "App icon",
  "interval-stepper.test.js": "Interval stepper",
  "logger.test.js": "File logger",
  "menu-icons.test.js": "Menu icons",
  "protocol-hello.test.js": "HELLO frames",
  "protocol-log.test.js": "LOG / control",
  "protocol-metrics.test.js": "METRICS frames",
  "protocol-subscribe.test.js": "SUBSCRIBE",
  "reporter.test.js": "Test reporter",
  "settings-window.test.js": "Settings window",
  "statusbar.test.js": "Status bar",
  "text-protocol.test.js": "JSONL / key=value",
  "themes.test.js": "Themes",
  "toolbar-minwidth.test.js": "Toolbar min width",
  "ui-perf.test.js": "UI responsiveness",
  "web-bridge.test.js": "Web monitor",
  "web-build.test.js": "Web build / serve"
};

function useColor() {
  return !process.env.NO_COLOR && process.stdout.isTTY !== false;
}

const paint = (code, s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = (s) => paint("32", s);
const red = (s) => paint("31", s);
const yellow = (s) => paint("33", s);
const dim = (s) => paint("2", s);
const bold = (s) => paint("1", s);
const cyan = (s) => paint("36", s);
const onGreen = (s) => paint("1;97;42", s);
const onRed = (s) => paint("1;97;41", s);

function formatMs(d) {
  if (d == null || Number.isNaN(d)) return "";
  return d >= 1000 ? `${(d / 1000).toFixed(2)} s` : `${Math.round(d)} ms`;
}

function fileName(file) {
  if (!file) return "(unknown)";
  return path.basename(String(file).replace(/\\/g, "/"));
}

function isFileSuite(d) {
  const name = String(d.name || "");
  return /\.(js|mjs|cjs)$/i.test(name);
}

function isSuite(d) {
  if (d.type === "suite") return true;
  if (isFileSuite(d)) return true;
  return (d.nesting || 0) === 0;
}

function failMessage(err) {
  if (!err) return "failed";
  return String(err.message || err.cause?.message || err).split("\n")[0];
}

function cell(value, width, align) {
  const text = String(value);
  return align === "left" ? text.padEnd(width) : text.padStart(width);
}

function formatSummary(rows, totals, elapsedMs) {
  const prepared = rows.map((row) => ({
    file: row.file,
    feature: row.feature || FEATURE[row.file] || "",
    pass: row.pass,
    fail: row.fail,
    skip: row.skip,
    time: formatMs(row.ms)
  }));

  const wFile = Math.max(8, "File".length, ...prepared.map((r) => r.file.length));
  const wFeat = Math.max(8, "Feature".length, ...prepared.map((r) => r.feature.length));
  const rule = "─".repeat(wFile + wFeat + 40);

  const lines = [];
  lines.push("");
  lines.push(bold("Summary"));
  lines.push(rule);
  lines.push(
    `${cell("File", wFile, "left")}  ${cell("Feature", wFeat, "left")}  ${cell("Pass", 5)}  ${cell("Fail", 5)}  ${cell("Skip", 5)}  ${cell("Time", 10)}`
  );
  lines.push(rule);

  for (const row of prepared) {
    const failCell = row.fail ? red(cell(row.fail, 5)) : dim(cell(row.fail, 5));
    const skipCell = row.skip ? yellow(cell(row.skip, 5)) : dim(cell(row.skip, 5));
    lines.push(
      `${cell(row.file, wFile, "left")}  ${dim(cell(row.feature, wFeat, "left"))}  ${green(cell(row.pass, 5))}  ${failCell}  ${skipCell}  ${cell(row.time, 10)}`
    );
  }

  lines.push(rule);
  lines.push(
    `${cell("Total", wFile, "left")}  ${cell("", wFeat, "left")}  ${green(cell(totals.pass, 5))}  ${(totals.fail ? red : dim)(cell(totals.fail, 5))}  ${(totals.skip ? yellow : dim)(cell(totals.skip, 5))}  ${cell(formatMs(elapsedMs), 10)}`
  );
  lines.push(rule);

  const total = totals.pass + totals.fail + totals.skip;
  if (totals.fail) {
    lines.push(bold(onRed(` ${totals.fail} of ${total} tests failed `)));
  } else {
    lines.push(bold(onGreen(` All ${totals.pass} tests passed `)) + (totals.skip ? dim(`  (${totals.skip} skipped)`) : ""));
  }
  lines.push(
    dim(
      `${total} tests  ·  ${rows.length} files  ·  ${totals.suites} suites  ·  ${formatMs(elapsedMs)}`
    )
  );
  lines.push("");
  return lines.join("\n");
}

async function* reporter(source) {
  const files = new Map();
  const failures = [];
  const started = Date.now();
  let lastFile = null;
  let banner = false;
  let pending = [];

  const bucket = (name) => {
    if (!files.has(name)) {
      files.set(name, { pass: 0, fail: 0, skip: 0, suites: 0, ms: 0, tests: [] });
    }
    return files.get(name);
  };

  for await (const ev of source) {
    if (!banner) {
      banner = true;
      yield `\n${bold("MyMonitor MultiOS")} ${dim("— test run")}\n`;
    }

    const d = ev.data || {};
    if (ev.type === "test:stdout" || ev.type === "test:stderr") {
      if (d.message) yield dim(String(d.message).replace(/\r?\n$/, "") + "\n");
      continue;
    }
    if (ev.type !== "test:pass" && ev.type !== "test:fail" && ev.type !== "test:skip") continue;

    const file = fileName(d.file);
    const row = bucket(file);
    const dur = d.details && d.details.duration_ms;
    const skipped = ev.type === "test:skip" || d.skip || (d.details && d.details.skipped);

    if (isFileSuite(d)) {
      if (dur) row.ms += dur;
      continue;
    }

    if (file !== lastFile) {
      if (pending.length) {
        yield pending.join("");
        pending = [];
      }
      lastFile = file;
      const label = FEATURE[file] ? dim(`  ${FEATURE[file]}`) : "";
      yield `\n${bold(cyan("▶ " + file))}${label}\n`;
    }

    if (isSuite(d)) {
      row.suites += 1;
      if (dur) row.ms += dur;
      const head = ev.type === "test:fail"
        ? `  ${red("✘")} ${red(d.name)} ${dim(formatMs(dur))}\n`
        : `${dim("  ▸ " + d.name)}\n`;
      yield head + pending.join("");
      pending = [];
      continue;
    }

    const indent = "  ".repeat(1 + Math.max(0, (d.nesting || 1) - 1));
    if (skipped) {
      row.skip += 1;
      const why = typeof d.skip === "string" && d.skip ? dim(` (${d.skip})`) : dim("(skipped)");
      pending.push(`${indent}${yellow("○")} ${d.name} ${why}\n`);
    } else if (ev.type === "test:pass") {
      row.pass += 1;
      pending.push(`${indent}${green("✔")} ${d.name} ${dim(formatMs(dur))}\n`);
    } else {
      row.fail += 1;
      const err = d.details && d.details.error;
      failures.push({ file, name: d.name, err });
      pending.push(`${indent}${red("✘")} ${red(d.name)} ${dim(formatMs(dur))}\n`);
      pending.push(`${indent}    ${red(failMessage(err))}\n`);
    }
  }

  if (pending.length) yield pending.join("");

  const list = [...files.entries()].map(([file, row]) => ({
    file,
    feature: FEATURE[file] || "",
    pass: row.pass,
    fail: row.fail,
    skip: row.skip,
    suites: row.suites,
    ms: row.ms
  }));

  const totals = list.reduce(
    (acc, row) => ({
      pass: acc.pass + row.pass,
      fail: acc.fail + row.fail,
      skip: acc.skip + row.skip,
      suites: acc.suites + row.suites
    }),
    { pass: 0, fail: 0, skip: 0, suites: 0 }
  );

  if (failures.length) {
    yield `\n${bold(red("Failures"))}\n`;
    for (const item of failures) {
      yield `  ${red("✘")} ${item.file} › ${item.name}\n`;
      yield `      ${red(failMessage(item.err))}\n`;
    }
  }

  yield formatSummary(list, totals, Date.now() - started);
}

module.exports = reporter;
module.exports.formatSummary = formatSummary;
module.exports.formatMs = formatMs;
module.exports.FEATURE = FEATURE;
module.exports.isFileSuite = isFileSuite;
module.exports.isSuite = isSuite;
