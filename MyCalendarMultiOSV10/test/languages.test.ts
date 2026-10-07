import { describe, expect, it } from "vitest";
import { en } from "../src/domain/en";
import { formatMessage, messages } from "../src/domain/i18n";
import { ko } from "../src/domain/ko";
import type { Messages } from "../src/domain/messages";

describe("Languages", () => {
  it("keeps Korean and English message keys aligned", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
    expect(messages.en).toBe(en);
    expect(messages.ko).toBe(ko);
  });

  it("provides twelve months and seven weekdays in both languages", () => {
    expect(en.months).toHaveLength(12);
    expect(ko.months).toHaveLength(12);
    expect(new Set(en.months).size).toBe(12);
    expect(new Set(ko.months).size).toBe(12);
    expect(en.weekdays).toHaveLength(7);
    expect(ko.weekdays).toHaveLength(7);
    expect(en.weekdaysShort).toHaveLength(7);
    expect(ko.weekdaysShort).toHaveLength(7);
  });

  it("fills every user-facing string", () => {
    for (const copy of [en, ko]) {
      for (const [key, value] of Object.entries(copy) as [keyof Messages, Messages[keyof Messages]][]) {
        if (Array.isArray(value)) {
          expect(value.every((item) => item.trim().length > 0)).toBe(true);
        } else if (typeof value === "object") {
          expect(Object.values(value).every((item) => item.trim().length > 0), key).toBe(true);
          const counted = !["repeatEveryOne", "fontFamilies", "fontWeights", "printOrientations", "printMargins", "dateFontTargets", "backgroundImageTargets"].includes(key);
          expect(Object.values(value).every((item) => item.includes("{n}")), key).toBe(counted);
        } else {
          expect(value.trim().length, key).toBeGreaterThan(0);
        }
      }
    }
  });

  it("uses different toolbar labels for Korean and English", () => {
    expect(ko.today).toBe("오늘");
    expect(en.today).toBe("Today");
    expect(ko.transparency).toBe("투명도");
    expect(en.transparency).toBe("Transparency");
    expect(ko.appName).not.toBe(en.appName);
    expect(ko.settings).not.toBe(en.settings);
    expect(ko.about).not.toBe(en.about);
  });

  it("substitutes placeholders in status text", () => {
    expect(formatMessage(en.checkedAt, { time: "Oct 6, 01:42 PM" })).toBe("Checked Oct 6, 01:42 PM");
    expect(formatMessage(ko.checkedAt, { time: "10월 6일 오후 1:42" })).toContain("10월 6일 오후 1:42");
    expect(formatMessage("Hello {name}", {})).toBe("Hello ");
  });
});
