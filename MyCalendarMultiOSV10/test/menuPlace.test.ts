import { describe, expect, it, vi } from "vitest";
import { holdMenuHost, menuHostActive, releaseMenuHost } from "../src/ui/menuHost";
import { MENU_MARGIN, menuNeedsRoom, placeMenu, type WorkArea } from "../src/ui/menuPlace";

const screen: WorkArea = { left: 0, top: 0, right: 1920, bottom: 1080, windowX: 100, windowY: 100 };

describe("placeMenu", () => {
  it("opens down and to the right when the menu fits in the window", () => {
    const place = placeMenu(40, 40, 180, 200, 520, 680, true, screen);
    expect(place).toMatchObject({ left: 40, top: 40, padLeft: 0, padTop: 0, padRight: 0, padBottom: 0, maxWidth: null, maxHeight: null });
    expect(menuNeedsRoom(place)).toBe(false);
  });

  it("flips above the cursor when the menu would leave the window downward", () => {
    const place = placeMenu(40, 640, 180, 200, 520, 680, true, screen);
    expect(place.padTop).toBe(0);
    expect(place.padBottom).toBe(0);
    expect(place.top + 200).toBe(640);
    expect(menuNeedsRoom(place)).toBe(false);
  });

  it("grows the window when the menu is taller than it but still fits on the screen", () => {
    const place = placeMenu(40, 300, 220, 420, 366, 378, true, screen);
    const height = 378 + place.padTop + place.padBottom;
    expect(menuNeedsRoom(place)).toBe(true);
    expect(place.maxHeight).toBeNull();
    expect(place.top).toBeGreaterThanOrEqual(0);
    expect(place.top + 420).toBeLessThanOrEqual(height + 0.01);
    expect(place.left).toBeGreaterThanOrEqual(0);
    expect(place.left + 220).toBeLessThanOrEqual(366 + place.padLeft + place.padRight + 0.01);
  });

  it("grows the window when the menu is wider than it", () => {
    const place = placeMenu(160, 40, 280, 200, 200, 680, true, screen);
    const width = 200 + place.padLeft + place.padRight;
    expect(menuNeedsRoom(place)).toBe(true);
    expect(place.maxWidth).toBeNull();
    expect(place.left).toBeGreaterThanOrEqual(0);
    expect(place.left + 280).toBeLessThanOrEqual(width + 0.01);
  });

  it("keeps the last row inside a window only a few pixels shorter than the menu", () => {
    const work: WorkArea = { ...screen, windowX: 0, windowY: 0 };
    const menuHeight = 389;
    const windowHeight = 378;
    const place = placeMenu(20, 30, 200, menuHeight, 366, windowHeight, true, work);
    const height = windowHeight + place.padTop + place.padBottom;
    expect(menuNeedsRoom(place)).toBe(true);
    expect(place.top).toBeGreaterThanOrEqual(MENU_MARGIN);
    expect(place.top + menuHeight).toBeLessThanOrEqual(height - MENU_MARGIN + 0.01);
  });

  it("scrolls inside the window when the window cannot grow", () => {
    const place = placeMenu(40, 300, 220, 420, 366, 378, false, screen);
    expect(place.padTop).toBe(0);
    expect(place.padBottom).toBe(0);
    expect(place.maxHeight).toBe(378 - 12);
    expect(place.top).toBeGreaterThanOrEqual(6);
    expect(place.top + (place.maxHeight ?? 0)).toBeLessThanOrEqual(378 - 6 + 0.01);
    expect(menuNeedsRoom(place)).toBe(false);
  });

  it("scrolls when the menu is taller than the screen itself", () => {
    const work: WorkArea = { left: 0, top: 0, right: 800, bottom: 300, windowX: 0, windowY: 0 };
    const place = placeMenu(10, 10, 200, 500, 400, 300, true, work);
    expect(place.maxHeight).toBe(300 - 12);
    expect(place.padTop + place.padBottom).toBeLessThan(1);
  });
});

describe("menuHost", () => {
  it("pins the calendar until the menu's restore runs, and a second hold cancels that restore", async () => {
    vi.useFakeTimers();
    try {
      const host = holdMenuHost(366, 378, 0, 24);
      expect(menuHostActive()).toBe(true);
      expect(document.documentElement.dataset.menuHost).toBe("true");
      expect(document.documentElement.style.getPropertyValue("--menu-host-height")).toBe("378px");
      expect(document.documentElement.style.getPropertyValue("--menu-host-pad-y")).toBe("24px");

      let restored = 0;
      releaseMenuHost(host, async () => {
        restored += 1;
      });
      const again = holdMenuHost(366, 378, 4, 0);
      expect(again).toBe(host);
      await vi.runAllTimersAsync();
      expect(restored).toBe(0);
      expect(menuHostActive()).toBe(true);
      expect(document.documentElement.style.getPropertyValue("--menu-host-pad-x")).toBe("4px");

      releaseMenuHost(again, async () => {
        restored += 1;
      });
      await vi.runAllTimersAsync();
      expect(restored).toBe(1);
      expect(menuHostActive()).toBe(false);
      expect(document.documentElement.dataset.menuHost).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
