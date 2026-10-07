import { afterEach, beforeEach, vi } from "vitest";
import { clearCountriesCache } from "../src/domain/holidays";
import { installHolidayFetch } from "./network";

// The app fetches the rules file it ships with; tests stub fetch to simulate being offline, so read the same data directly.
vi.mock("../src/domain/holidayRules", async () => {
  const { data } = await import("date-holidays/data");
  return { loadHolidayRules: async () => data };
});

beforeEach(() => {
  localStorage.clear();
  clearCountriesCache();
  installHolidayFetch();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
  document.documentElement.lang = "";
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

afterEach(() => {
  document.body.replaceChildren();
});
