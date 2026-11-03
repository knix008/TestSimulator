/**
 * Long-running operations, for the progress pop-up (src/ProgressPopup.tsx).
 *
 * An operation is announced with `beginProgress(label, icon)` and ended with the
 * function that returns. The pop-up appears only when an operation is still running
 * after PROGRESS_DELAY_MS, so quick commands never flash it. With several running, the
 * newest one is shown. `setProgressDetail` adds the latest line git printed (the app's
 * /api/tick reports it).
 *
 * Plain module state + useSyncExternalStore: no React context, so the store can be
 * driven from anywhere and the pop-up can be drawn in any window.
 */
import { useSyncExternalStore } from "react";
import type { IconName } from "./icons";

export const PROGRESS_DELAY_MS = 400;

export type ProgressState = {
  id: number;
  label: string;
  icon: IconName;
  startedAt: number;
  /** True once the operation has run longer than the delay. */
  visible: boolean;
  detail: string;
};

type Entry = ProgressState & { timer: ReturnType<typeof setTimeout> | null };

let entries: Entry[] = [];
let detail = "";
let seq = 0;
let snapshot: ProgressState | null = null;
const listeners = new Set<() => void>();

function publish(): void {
  const top = entries[entries.length - 1];
  snapshot = top ? { id: top.id, label: top.label, icon: top.icon, startedAt: top.startedAt, visible: top.visible, detail } : null;
  for (const listener of listeners) listener();
}

/** Starts an operation; call the returned function when it ends (it is safe to call twice). */
export function beginProgress(label: string, icon: IconName = "refresh", delayMs = PROGRESS_DELAY_MS): () => void {
  const id = ++seq;
  const entry: Entry = { id, label, icon, startedAt: Date.now(), visible: false, detail: "", timer: null };
  entry.timer = setTimeout(() => {
    entry.timer = null;
    entry.visible = true;
    publish();
  }, delayMs);
  entries = [...entries, entry];
  publish();
  return () => {
    const found = entries.find((item) => item.id === id);
    if (!found) return;
    if (found.timer) clearTimeout(found.timer);
    entries = entries.filter((item) => item.id !== id);
    if (entries.length === 0) detail = "";
    publish();
  };
}

/** Runs `action` as an operation. */
export async function withProgress<T>(label: string, icon: IconName, action: () => Promise<T>): Promise<T> {
  const end = beginProgress(label, icon);
  try {
    return await action();
  } finally {
    end();
  }
}

/** The latest progress line (e.g. "Receiving objects: 42%"), or "" to clear it. */
export function setProgressDetail(text: string | null | undefined): void {
  const next = (text ?? "").trim();
  if (next === detail) return;
  detail = next;
  if (entries.length) publish();
}

export function currentProgress(): ProgressState | null {
  return snapshot;
}

export function subscribeProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The operation the pop-up shows, or null (also null while it is still within the delay). */
export function useProgress(): ProgressState | null {
  const state = useSyncExternalStore(subscribeProgress, currentProgress, currentProgress);
  return state && state.visible ? state : null;
}
