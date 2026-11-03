/**
 * Whether the start screen is what the main window shows.
 *
 * With no repository open the start screen is shown — unless Preferences › Start screen
 * turned "Show at startup" off and nothing asked for it yet. The menu bar's Start
 * button flips between it and the workspace; opening a repository puts the workspace
 * in front. A tiny store rather than app state: nothing about it is saved, and only
 * the menu bar and the main window's body need to know.
 */
import { useSyncExternalStore } from "react";

/** null: follow the default (no repository → start screen); otherwise what the user chose. */
let choice: boolean | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function set(next: boolean | null) {
  if (choice === next) return;
  choice = next;
  emit();
}

export function showStartScreen(): void {
  set(true);
}

/** The workspace in front (a repository was opened, or the Start button turned it off). */
export function hideStartScreen(): void {
  set(false);
}

export function startScreenChoice(): boolean | null {
  return choice;
}

/** What is shown when nothing was chosen yet. */
export function defaultStartScreen(hasRepository: boolean, showOnStartup: boolean): boolean {
  return !hasRepository && showOnStartup;
}

export function isStartScreenShown(hasRepository: boolean, showOnStartup: boolean): boolean {
  return choice ?? defaultStartScreen(hasRepository, showOnStartup);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True whenever the start screen is what the main window shows. */
export function useStartScreen(hasRepository: boolean, showOnStartup: boolean): boolean {
  const chosen = useSyncExternalStore(subscribe, startScreenChoice, startScreenChoice);
  return chosen ?? defaultStartScreen(hasRepository, showOnStartup);
}

let startupApplied = false;

/**
 * Once per launch, when the settings have loaded: "Show at startup" puts the start
 * screen in front even when the last repository was reopened behind it.
 */
export function applyStartupChoice(showOnStartup: boolean): void {
  if (startupApplied) return;
  startupApplied = true;
  if (showOnStartup) set(true);
}

/** The Start button: the other one of the two. */
export function toggleStartScreen(hasRepository: boolean, showOnStartup: boolean): void {
  set(!isStartScreenShown(hasRepository, showOnStartup));
}
