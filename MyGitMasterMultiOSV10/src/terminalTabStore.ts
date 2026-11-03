/**
 * The terminal tabs of the bottom panel. Kept outside React so they survive the panel
 * being hidden: the shells keep running in the core (core/terminalHub.ts) and show
 * their output again when the panel comes back.
 *
 * A tab's name is its shell's name and a number ("PowerShell 1", "PowerShell 2").
 */
import { useSyncExternalStore } from "react";

export type ShellChoice = { id: string; label: string };
export type TerminalTab = {
  id: string;
  /** The shell chosen for this tab; "" follows Preferences › Terminal shell. */
  shellId: string;
  label: string;
  number: number;
};

type State = { tabs: TerminalTab[]; activeId: string; shells: ShellChoice[]; defaultShell: string };

let state: State = { tabs: [], activeId: "", shells: [], defaultShell: "" };
const listeners = new Set<() => void>();
let sequence = 0;

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function useTerminalTabs(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

export function terminalTabsState(): State {
  return state;
}

/** The installed shells (from /api/shells) and which one the settings choose. */
export function setShells(shells: ShellChoice[], defaultShell: string): void {
  // The first tab was named before the shells were known.
  const tabs = state.tabs.map((tab) => {
    if (tab.label) return tab;
    const shell = shells.find((item) => item.id === (tab.shellId || defaultShell));
    return shell ? { ...tab, label: shell.label, number: nextNumber(shell.label, state.tabs.filter((other) => other !== tab)) } : tab;
  });
  set({ shells, defaultShell, tabs });
}

function nextNumber(label: string, tabs: TerminalTab[]): number {
  const used = new Set(tabs.filter((tab) => tab.label === label).map((tab) => tab.number));
  let number = 1;
  while (used.has(number)) number++;
  return number;
}

/** Opens a terminal with `shellId` ("" = the default shell) and selects it. */
export function openTerminal(shellId = ""): TerminalTab {
  const shell = state.shells.find((item) => item.id === (shellId || state.defaultShell));
  const label = shell?.label ?? "";
  // The first tab keeps the id the single terminal of earlier builds used.
  const id = sequence++ === 0 ? "main" : `t${Date.now().toString(36)}${sequence.toString(36)}`;
  const tab: TerminalTab = { id, shellId, label, number: nextNumber(label, state.tabs) };
  set({ tabs: [...state.tabs, tab], activeId: id });
  return tab;
}

/** At least one terminal, for when the Terminal view is shown. */
export function ensureTerminal(): void {
  if (state.tabs.length === 0) openTerminal();
}

export function selectTerminal(id: string): void {
  if (state.tabs.some((tab) => tab.id === id)) set({ activeId: id });
}

/** Moves the selection `step` tabs (−1 previous, +1 next), stopping at the ends. */
export function stepTerminal(step: number): void {
  const index = state.tabs.findIndex((tab) => tab.id === state.activeId);
  const next = state.tabs[Math.max(0, Math.min(state.tabs.length - 1, index + step))];
  if (next) set({ activeId: next.id });
}

/** Closes a tab and ends its shell; the neighbour becomes active. */
export function closeTerminal(id: string, endShell = true): void {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  const activeId = state.activeId === id ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? "") : state.activeId;
  set({ tabs, activeId });
  if (endShell) {
    void fetch("/api/terminal/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }
}

export function tabTitle(tab: TerminalTab, fallback: string): string {
  return `${tab.label || fallback} ${tab.number}`;
}

/** For tests: back to no tabs. */
export function resetTerminalTabs(): void {
  sequence = 0;
  state = { tabs: [], activeId: "", shells: [], defaultShell: "" };
  for (const listener of listeners) listener();
}
