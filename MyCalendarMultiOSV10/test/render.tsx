import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { messages } from "../src/domain/i18n";
import type { Language } from "../src/domain/messages";
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "../src/domain/settings";
import type { ReadyContext } from "../src/ui/useSettings";

export function readyContext(patch: Partial<Settings> = {}, update: ReadyContext["update"] = () => {}): ReadyContext {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, language: "ko", ...patch });
  const language: Language = settings.language === "en" ? "en" : "ko";
  return {
    settings: { ...settings, language },
    update,
    desktopError: null,
    t: messages[language],
  };
}

export async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return {
    host,
    async settle() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

export function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

export function setControlValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  act(() => {
    const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
