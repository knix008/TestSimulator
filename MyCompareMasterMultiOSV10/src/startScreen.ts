/**
 * Whether the start screen is in front while tabs are open.
 *
 * With no tab open the start screen is simply what the workspace shows. The menu
 * bar's Start button (command `view.start`) can also bring it forward over open
 * tabs, which stay open underneath; choosing a tab, or opening something new, puts
 * the work back in front. A tiny store rather than app state, because nothing about
 * it is saved and only a few components need to know.
 */
import { useSyncExternalStore } from "react";

let shown = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function showStartScreen(): void {
  if (shown) return;
  shown = true;
  emit();
}

export function hideStartScreen(): void {
  if (!shown) return;
  shown = false;
  emit();
}

export function isStartScreenRequested(): boolean {
  return shown;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the start screen has been brought in front of open tabs. */
export function useStartScreenRequested(): boolean {
  return useSyncExternalStore(subscribe, isStartScreenRequested, isStartScreenRequested);
}

/** True whenever the start screen is what the workspace shows. */
export function useOnStartScreen(hasActiveTab: boolean): boolean {
  const requested = useStartScreenRequested();
  return !hasActiveTab || requested;
}
