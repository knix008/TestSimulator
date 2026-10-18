import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../src/domain/i18n";
import { checkOnline } from "../src/domain/network";
import { DEFAULT_SETTINGS, STORAGE_KEY } from "../src/domain/settings";
import { App } from "../src/ui/App";
import { click, render } from "./render";

function goOffline() {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
}

function notice() {
  return document.body.querySelector('[role="alertdialog"]');
}

describe("Network", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts any answer from the holiday server as online, and a failed request as offline", async () => {
    expect(await checkOnline()).toBe(true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("busy", { status: 503 }));
    expect(await checkOnline()).toBe(true);
    goOffline();
    expect(await checkOnline()).toBe(false);
  });

  it("reports offline without a request when the system has no connection", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await checkOnline()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("starts the calendar without a network and says so in a popup that closes with its button", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, language: "ko" }));
    goOffline();
    const app = await render(<App />);
    await app.settle();
    expect(document.body.querySelector(`[aria-label="${messages.ko.today}"]`)).not.toBeNull();
    expect(notice()?.textContent).toContain(messages.ko.offlineTitle);
    expect(notice()?.textContent).toContain(messages.ko.offlineBody);
    click([...notice()!.querySelectorAll("button")].find((button) => button.textContent === messages.ko.dismiss)!);
    await app.settle();
    expect(notice()).toBeNull();
    await app.unmount();
  });

  it("shows no popup online, opens it when the connection drops, and closes it when it is back", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, language: "en" }));
    const app = await render(<App />);
    await app.settle();
    expect(notice()).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(notice()?.textContent).toContain(messages.en.offlineTitle);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await app.settle();
    expect(notice()).toBeNull();
    await app.unmount();
  });
});
