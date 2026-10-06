import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT_OPTIONS,
  normalizePrintOptions,
  pageRule,
  pageSize,
  parsePrintRequest,
  printMonths,
  printWeeks,
  readPrintOptions,
  writePrintOptions,
} from "../src/domain/print";

describe("Print", () => {
  it("keeps page setup choices within the supported papers, margins, and month count", () => {
    expect(normalizePrintOptions(null)).toEqual(DEFAULT_PRINT_OPTIONS);
    const options = normalizePrintOptions({
      paper: "tabloid" as never,
      orientation: "portrait",
      margin: "wide",
      months: 40,
      eventList: true,
      grayscale: "yes" as never,
    });
    expect(options).toMatchObject({ paper: "a4", orientation: "portrait", margin: "wide", months: 12, eventList: true });
    expect(options.grayscale).toBe(false);
    expect(normalizePrintOptions({ months: 0 }).months).toBe(1);

    localStorage.clear();
    writePrintOptions({ ...DEFAULT_PRINT_OPTIONS, paper: "letter", months: 3 });
    expect(readPrintOptions()).toMatchObject({ paper: "letter", months: 3 });
  });

  it("turns the paper for landscape and draws the margin inside the page", () => {
    expect(pageSize({ paper: "a4", orientation: "portrait" })).toEqual({ width: 210, height: 297 });
    expect(pageSize({ paper: "a4", orientation: "landscape" })).toEqual({ width: 297, height: 210 });
    expect(pageRule({ paper: "a5", orientation: "landscape" })).toBe("@page { size: 210mm 148mm; margin: 0; }");
  });

  it("prints only the weeks a month touches and runs across the new year", () => {
    expect(printWeeks(2026, 9, 0)).toHaveLength(5);
    expect(printWeeks(2026, 7, 0)).toHaveLength(6);
    expect(printWeeks(2026, 1, 0)).toHaveLength(4);
    expect(printWeeks(2026, 9, 1)[0][0].getDay()).toBe(1);
    expect(printMonths(2026, 10, 3)).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
    ]);
    expect(parsePrintRequest(`2026-9:${Date.now()}`)).toEqual({ year: 2026, month: 9 });
    expect(parsePrintRequest("garbage")).toBeNull();
  });
});
