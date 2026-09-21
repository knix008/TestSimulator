"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const reporter = require("./reporter");

describe("test reporter", () => {
  it("labels known suites in FEATURE", () => {
    assert.equal(reporter.FEATURE["collector.test.js"], "Local collector");
    assert.equal(reporter.FEATURE["copy-installer.test.js"], "Installer copy");
    assert.ok(reporter.FEATURE["web-build.test.js"]);
  });

  it("treats file paths as suites, not cases", () => {
    assert.equal(reporter.isFileSuite({ name: "collector.test.js" }), true);
    assert.equal(reporter.isFileSuite({ name: "returns a timestamp and hello" }), false);
    assert.equal(reporter.isSuite({ type: "suite", name: "local collector" }), true);
    assert.equal(reporter.isSuite({ nesting: 0, name: "themes" }), true);
    assert.equal(reporter.isSuite({ nesting: 1, name: "ids are unique" }), false);
  });

  it("formats a summary table with totals and a verdict", () => {
    process.env.NO_COLOR = "1";
    const text = reporter.formatSummary(
      [
        { file: "collector.test.js", feature: "Local collector", pass: 5, fail: 0, skip: 0, ms: 15200 },
        { file: "themes.test.js", feature: "Themes", pass: 6, fail: 0, skip: 1, ms: 12 }
      ],
      { pass: 11, fail: 0, skip: 1, suites: 2 },
      16000
    );
    assert.match(text, /^Summary/m);
    assert.match(text, /File\s+Feature\s+Pass\s+Fail\s+Skip\s+Time/);
    assert.match(text, /collector\.test\.js\s+Local collector\s+5/);
    assert.match(text, /themes\.test\.js\s+Themes\s+6/);
    assert.match(text, /Total\s+11\s+0\s+1\s+16\.00 s/);
    assert.match(text, /All 11 tests passed/);
    assert.match(text, /12 tests  ·  2 files  ·  2 suites/);
  });

  it("marks a failed run in the summary verdict", () => {
    const text = reporter.formatSummary(
      [{ file: "dialogs.test.js", feature: "Dialogs", pass: 4, fail: 1, skip: 0, ms: 8 }],
      { pass: 4, fail: 1, skip: 0, suites: 1 },
      20
    );
    assert.match(text, /1 of 5 tests failed/);
  });
});
