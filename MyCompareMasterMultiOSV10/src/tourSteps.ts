/**
 * The steps of the guided tour.
 *
 * Each step points at a part of the main window through `data-tour` attributes (or, for
 * the toolbar's buttons, their `data-command`). `target` is a list of fallbacks: the
 * first selector with something on screen wins, and when it matches several elements
 * the spotlight covers all of them — which is how one step shows the two "open" buttons
 * together. A step with no match is shown in the middle of the window with a note,
 * except an `optional` one, which is skipped: the start screen's own parts only exist
 * while no tab is open.
 *
 * The text lives in `core/i18n.ts` as `tour.<id>.title` and `tour.<id>.text`. This file
 * imports nothing from React or the DOM, so the unit test can check every key.
 */

export type TourStep = {
  id: string;
  /** Fallback selectors, tried in order. No target: a card in the middle of the window. */
  target?: string[];
  /** Skipped, rather than explained in the middle, when nothing on screen matches. */
  optional?: boolean;
};

const tool = (...ids: string[]) => ids.map((id) => `.toolbar [data-command="${id}"]`).join(", ");

export const TOUR_STEPS: TourStep[] = [
  { id: "intro" },
  { id: "menubar", target: ['[data-tour="menubar"]'] },
  { id: "toolbar", target: ['[data-tour="toolbar"]'] },
  // The start screen's parts (built by StartPage.tsx); absent while a tab is open.
  { id: "start-hero", target: ['[data-tour="start-hero"]'], optional: true },
  { id: "start-new-session", target: ['[data-tour="start-new-session"]'], optional: true },
  { id: "start-recent", target: ['[data-tour="start-recent"]'], optional: true },
  { id: "start-background", target: ['[data-tour="start-background"]'], optional: true },
  { id: "workspace", target: ['[data-tour="workspace"]', ".workspace"] },
  { id: "open-compare", target: [tool("file.compareFiles", "file.compareDirectories"), '[data-menu="file"]'] },
  { id: "open-merge", target: [tool("file.openThreeWay", "file.openConflict", "file.openRepository"), '[data-menu="file"]'] },
  { id: "sessions", target: ['[data-tour="session-panel"]', '[data-tour="conflict-panel"]', ".panel-rail"] },
  { id: "tabs", target: ['[data-tour="tabbar"]'] },
  { id: "diff-view", target: ['[data-tour="diff-view"]', '[data-tour="directory-view"]', '[data-tour="merge-view"]'] },
  { id: "navigate", target: [tool("nav.back", "nav.forward", "nav.prevDiff", "nav.nextDiff"), '[data-menu="compare"]'] },
  { id: "view-options", target: ['[data-tour="view-options"]', '[data-menu="view"]'] },
  { id: "merge", target: ['[data-tour="merge-view"]', '[data-menu="merge"]'] },
  { id: "resolve", target: ['[data-tour="conflict-panel"]', tool("merge.takeLocal", "merge.takeRemote", "merge.takeBoth"), '[data-menu="merge"]'] },
  { id: "panels", target: ['[data-tour="panel-toggles"]'] },
  { id: "bottom", target: ['[data-tour="bottom-panel"]', tool("view.logPanel")] },
  { id: "terminal", target: [tool("view.terminalPanel")] },
  { id: "theme", target: ['[data-tour="theme"]'] },
  { id: "language", target: [tool("toolbar.language")] },
  { id: "font-zoom", target: [".toolbar .font-group, .toolbar .zoom-group"] },
  { id: "settings", target: [tool("tools.settings"), '[data-menu="tools"]'] },
  { id: "statusbar", target: ['[data-tour="statusbar"]'] },
  { id: "guide", target: [tool("help.guide"), '[data-menu="help"]'] },
  { id: "end" },
];

/** The two string-table keys of a step. */
export function tourKeys(step: TourStep): { title: `tour.${string}.title`; text: `tour.${string}.text` } {
  return { title: `tour.${step.id}.title`, text: `tour.${step.id}.text` };
}
