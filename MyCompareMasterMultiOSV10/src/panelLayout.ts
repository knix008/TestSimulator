/**
 * Which panels the window shows, and which panel switches can be used.
 *
 * The start screen (no tab open) is the whole workspace: no side panels, no bottom
 * panel and none of the rails a closed side panel leaves behind. Everything the
 * panels offer there — new sessions, saved sessions, recent items — is on the start
 * screen itself. The switches are disabled rather than hidden, so the toolbar keeps
 * its shape, and the saved open/closed state is left alone: leaving the start screen
 * brings the panels back exactly as they were.
 *
 * Once a tab is open the left panel and the bottom panel can be switched anywhere;
 * the right panel is a merge's property panel and has nothing to show on any other
 * kind of tab.
 *
 * Pure, so it is tested under plain Node.
 */

export type PanelSettings = {
  showLeftPanel: boolean;
  showRightPanel: boolean;
  showLogPanel: boolean;
  showTerminalPanel: boolean;
};

/** Which switches work; `activeKind` is the active tab's kind, or null on the start screen. */
export function panelSwitches(activeKind: string | null | undefined): { left: boolean; right: boolean; bottom: boolean } {
  const open = Boolean(activeKind);
  return { left: open, right: activeKind === "merge", bottom: open };
}

/** What is drawn: each panel, or the rail a closed side panel leaves, or nothing. */
export function visiblePanels(activeKind: string | null | undefined, settings: PanelSettings) {
  const can = panelSwitches(activeKind);
  return {
    left: can.left && settings.showLeftPanel,
    leftRail: can.left && !settings.showLeftPanel,
    right: can.right && settings.showRightPanel,
    rightRail: can.right && !settings.showRightPanel,
    bottom: can.bottom && (settings.showLogPanel || settings.showTerminalPanel),
  };
}
