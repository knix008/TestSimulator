/**
 * Which of the two faces of the window is in front: the start screen or the main window.
 *
 * Left alone the tabs decide: no tab open means the start screen, a tab open means that
 * tab. The menu bar's Start button (command `view.start`) toggles against that, in either
 * direction: it brings the start screen over open tabs, which stay open underneath, and
 * with no tab open it swaps the start screen for the main window with its panels and an
 * empty workspace. Choosing a tab, or opening or closing something, hands the decision
 * back to the tabs. A tiny store rather than app state, because nothing about it is saved
 * and only a few components need to know.
 */
import { useSyncExternalStore } from "react";

type Requested = "tabs" | "start" | "main";

let requested: Requested = "tabs";
const listeners = new Set<() => void>();

function request(next: Requested) {
  if (requested === next) return;
  requested = next;
  for (const listener of listeners) listener();
}

export function showStartScreen(): void {
  request("start");
}

/** Stops overriding the tabs: the open tab comes to the front, or the start screen if none is. */
export function hideStartScreen(): void {
  request("tabs");
}

/** What the Start button does: swaps whichever of the two is in front for the other. */
export function toggleStartScreen(hasActiveTab: boolean): void {
  if (!onStartScreen(hasActiveTab, requested)) request("start");
  else request(hasActiveTab ? "tabs" : "main");
}

function onStartScreen(hasActiveTab: boolean, current: Requested): boolean {
  return current === "start" || (!hasActiveTab && current !== "main");
}

/** Whether the start screen is in front, outside of React. */
export function isOnStartScreen(hasActiveTab: boolean): boolean {
  return onStartScreen(hasActiveTab, requested);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => requested;

/** True whenever the start screen is what the workspace shows. */
export function useOnStartScreen(hasActiveTab: boolean): boolean {
  return onStartScreen(hasActiveTab, useSyncExternalStore(subscribe, snapshot, snapshot));
}
