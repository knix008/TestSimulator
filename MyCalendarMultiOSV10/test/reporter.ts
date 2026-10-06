import type { Reporter, TestCase, TestModule, TestSuite } from "vitest/node";

interface Row {
  feature: string;
  name: string;
  state: "passed" | "failed" | "skipped" | "pending";
  duration: number;
  error: string;
}

const useColor = process.env.FORCE_COLOR === "1" || process.env.NO_COLOR === undefined;

const dye = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

function paint(code: string, text: string): string {
  if (!useColor) return text;
  return `${code}${text}${dye.reset}`;
}

function padEnd(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

function durationLabel(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

function featureOf(test: TestCase): string {
  let name = "General";
  let current: TestSuite | TestModule = test.parent;
  while (current.type === "suite") {
    name = current.name;
    current = current.parent;
  }
  return name;
}

function errorText(test: TestCase): string {
  const result = test.result();
  if (result.state !== "failed") return "";
  return result.errors
    .map((error) => error.message ?? error.name ?? "failed")
    .join("\n")
    .split("\n")
    .slice(0, 6)
    .join("\n");
}

function write(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export default class EnglishReport implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const rows: Row[] = [];
    for (const module of modules) {
      const tests = [...module.children.allTests()];
      if (tests.length === 0) {
        const errors = module.errors();
        if (errors.length > 0) {
          rows.push({
            feature: "Suite",
            name: module.moduleId.split(/[\\/]/).pop() ?? module.moduleId,
            state: "failed",
            duration: module.diagnostic().duration,
            error: errors.map((error) => error.message).join("\n"),
          });
        }
      }
      for (const test of tests) {
        const result = test.result();
        rows.push({
          feature: featureOf(test),
          name: test.name,
          state: result.state === "pending" ? "failed" : result.state,
          duration: test.diagnostic()?.duration ?? 0,
          error: errorText(test),
        });
      }
    }

    const features = [...new Set(rows.map((row) => row.feature))].sort((a, b) => a.localeCompare(b));
    const ordered = features.flatMap((feature) => rows.filter((row) => row.feature === feature));
    const statusWidth = 6;
    const featureWidth = Math.max("Feature".length, ...ordered.map((row) => row.feature.length), "Total".length);
    const nameWidth = Math.max("Test".length, ...ordered.map((row) => row.name.length));
    const durationWidth = Math.max(
      "Duration".length,
      ...ordered.map((row) => durationLabel(row.duration).length),
    );

    write();
    write(paint(dye.bold + dye.cyan, "My Calendar  test results"));
    write(
      [
        paint(dye.dim, padEnd("Status", statusWidth)),
        paint(dye.dim, padEnd("Feature", featureWidth)),
        paint(dye.dim, padEnd("Test", nameWidth)),
        paint(dye.dim, padStart("Duration", durationWidth)),
      ].join("  "),
    );
    write(paint(dye.dim, "-".repeat(statusWidth + featureWidth + nameWidth + durationWidth + 6)));

    for (const row of ordered) {
      const status =
        row.state === "passed"
          ? paint(dye.bold + dye.green, padEnd("PASS", statusWidth))
          : row.state === "failed"
            ? paint(dye.bold + dye.red, padEnd("FAIL", statusWidth))
            : paint(dye.bold + dye.yellow, padEnd("SKIP", statusWidth));
      const time = paint(dye.yellow, padStart(durationLabel(row.duration), durationWidth));
      write(
        [
          status,
          paint(dye.blue, padEnd(row.feature, featureWidth)),
          paint(dye.white, padEnd(row.name, nameWidth)),
          time,
        ].join("  "),
      );
      if (row.error) {
        for (const line of row.error.split("\n")) {
          write(`${" ".repeat(statusWidth + 2)}${paint(dye.red, line)}`);
        }
      }
    }

    const countWidth = Math.max(
      "Passed".length,
      "Failed".length,
      "Skipped".length,
      ...features.map((feature) => String(rows.filter((row) => row.feature === feature).length).length),
      String(rows.length).length,
    );
    const summaryDurationWidth = Math.max(
      "Duration".length,
      ...features.map((feature) =>
        durationLabel(rows.filter((row) => row.feature === feature).reduce((sum, row) => sum + row.duration, 0)).length,
      ),
      durationLabel(rows.reduce((sum, row) => sum + row.duration, 0)).length,
    );

    write();
    write(paint(dye.bold + dye.cyan, "Summary"));
    write(
      [
        paint(dye.dim, padEnd("Feature", featureWidth)),
        paint(dye.dim, padStart("Passed", countWidth)),
        paint(dye.dim, padStart("Failed", countWidth)),
        paint(dye.dim, padStart("Skipped", countWidth)),
        paint(dye.dim, padStart("Duration", summaryDurationWidth)),
      ].join("  "),
    );
    write(paint(dye.dim, "-".repeat(featureWidth + countWidth * 3 + summaryDurationWidth + 8)));

    for (const feature of features) {
      const group = rows.filter((row) => row.feature === feature);
      const passed = group.filter((row) => row.state === "passed").length;
      const failed = group.filter((row) => row.state === "failed").length;
      const skipped = group.filter((row) => row.state === "skipped").length;
      const duration = group.reduce((sum, row) => sum + row.duration, 0);
      write(
        [
          paint(dye.blue, padEnd(feature, featureWidth)),
          paint(dye.green, padStart(String(passed), countWidth)),
          paint(failed > 0 ? dye.bold + dye.red : dye.green, padStart(String(failed), countWidth)),
          paint(skipped > 0 ? dye.yellow : dye.dim, padStart(String(skipped), countWidth)),
          paint(dye.yellow, padStart(durationLabel(duration), summaryDurationWidth)),
        ].join("  "),
      );
    }

    const passed = rows.filter((row) => row.state === "passed").length;
    const failed = rows.filter((row) => row.state === "failed").length;
    const skipped = rows.filter((row) => row.state === "skipped").length;
    const duration = rows.reduce((sum, row) => sum + row.duration, 0);
    write(paint(dye.dim, "-".repeat(featureWidth + countWidth * 3 + summaryDurationWidth + 8)));
    write(
      [
        paint(dye.bold + dye.white, padEnd("Total", featureWidth)),
        paint(dye.bold + dye.green, padStart(String(passed), countWidth)),
        paint(failed > 0 ? dye.bold + dye.red : dye.bold + dye.green, padStart(String(failed), countWidth)),
        paint(skipped > 0 ? dye.bold + dye.yellow : dye.dim, padStart(String(skipped), countWidth)),
        paint(dye.bold + dye.yellow, padStart(durationLabel(duration), summaryDurationWidth)),
      ].join("  "),
    );
    write();
    const verdict =
      failed === 0
        ? paint(dye.bold + dye.green, `All ${passed} tests passed`)
        : paint(dye.bold + dye.red, `${failed} test${failed === 1 ? "" : "s"} failed`);
    write(`${verdict}${paint(dye.dim, `   ${skipped} skipped   ${durationLabel(duration)}`)}`);
    write();
  }
}
