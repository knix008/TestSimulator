import { afterEach, beforeEach } from "vitest";
import { clearCountriesCache } from "../src/domain/holidays";
import { installHolidayFetch } from "./network";

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
