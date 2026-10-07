import { describe, expect, it } from "vitest";
import { accentInk, applyTheme, darkThemes, getTheme, hexToRgba, lightThemes, MIN_OPACITY, themes } from "../src/domain/themes";

describe("Themes", () => {
  it("ships 20 light themes and 20 dark themes with unique ids", () => {
    expect(lightThemes).toHaveLength(20);
    expect(darkThemes).toHaveLength(20);
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(40);
    expect(lightThemes.every((theme) => theme.id.startsWith("light-"))).toBe(true);
    expect(darkThemes.every((theme) => theme.id.startsWith("dark-"))).toBe(true);
  });

  it("names every theme in English and Korean", () => {
    for (const theme of themes) {
      expect(theme.name.en.trim().length).toBeGreaterThan(0);
      expect(theme.name.ko.trim().length).toBeGreaterThan(0);
      expect(theme.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("falls back to the ink theme when the id is unknown", () => {
    expect(getTheme("missing").id).toBe("dark-ink");
    expect(getTheme("light-paper").name.en).toBe("Paper");
  });

  it("converts hex colors to rgba and picks readable accent ink", () => {
    expect(hexToRgba("#8eb6ff", 0.78)).toBe("rgba(142, 182, 255, 0.78)");
    expect(accentInk("#ffffff")).toBe("#17202a");
    expect(accentInk("#17202a")).toBe("#ffffff");
  });

  it("applies background transparency while leaving text opaque", () => {
    applyTheme(getTheme("dark-ink"), 0.5);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--bg")).toBe("rgba(20, 24, 31, 0.5)");
    expect(style.getPropertyValue("--bg-solid")).toBe("#14181f");
    expect(style.getPropertyValue("--text")).toBe("#eef2f8");
    expect(style.getPropertyValue("--text").startsWith("rgba")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("dark-ink");
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("clamps the painted opacity to the supported range", () => {
    applyTheme(getTheme("light-paper"), 0);
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(hexToRgba("#f7f8fb", MIN_OPACITY));
    applyTheme(getTheme("light-paper"), 2);
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(hexToRgba("#f7f8fb", 1));
    expect(document.documentElement.dataset.mode).toBe("light");
  });
});
