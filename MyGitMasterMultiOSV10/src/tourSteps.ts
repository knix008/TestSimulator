/**
 * The steps of the guided tour over My Git Master's main window.
 *
 * Each step points at a part of the window through CSS selectors (class names App.tsx
 * already uses, or the start screen's `data-tour` attributes). `target` is a list of
 * fallbacks: the first selector with something on screen wins, and when it matches
 * several elements the spotlight covers all of them. A step with no match is shown in
 * the middle of the window with a note, except an `optional` one, which is skipped —
 * the start screen's cards only exist while it shows, the workspace's panels only
 * while it does.
 *
 * The text lives in src/strings/start.ts as `tour_<id>_title` and `tour_<id>_text`.
 * This file imports nothing from React or the DOM, so the unit test can check it.
 */

export type TourStep = {
  id: string;
  /** Fallback selectors, tried in order. No target: a card in the middle of the window. */
  target?: string[];
  /** Skipped, rather than explained in the middle, when nothing on screen matches. */
  optional?: boolean;
  /** The view the step is about: the tour puts it in front before pointing. */
  view?: "start" | "workspace";
};

export const TOUR_STEPS: TourStep[] = [
  { id: "intro" },
  { id: "menubar", target: [".menubar"] },
  { id: "start", target: [".start-toggle"] },
  // The start screen's parts (StartPage.tsx): the tour shows the start screen for them.
  { id: "startHero", target: ['[data-tour="start-hero"]'], view: "start" },
  { id: "startRecent", target: ['[data-tour="start-recent"]'], view: "start" },
  { id: "startBackground", target: ['[data-tour="start-background"]'], view: "start" },
  { id: "toolbar", target: [".toolbar"] },
  // The workspace's panels: the tour puts the workspace in front for them. A panel the
  // user has hidden is explained in the middle of the window.
  { id: "files", target: [".left-col > section.panel:first-child"], view: "workspace" },
  { id: "branches", target: [".left-col > section.panel:last-child"], view: "workspace" },
  { id: "history", target: [".center-col"], view: "workspace" },
  { id: "details", target: [".right-col"], view: "workspace" },
  { id: "bottom", target: [".log-panel"], view: "workspace" },
  { id: "panels", target: [".status-panels"] },
  { id: "theme", target: [".toolbar .split-tool", ".toolbar-end"] },
  { id: "settings", target: [".toolbar-end"] },
  { id: "statusbar", target: [".statusbar"] },
  { id: "help", target: [".menubar > .menu:last-of-type", ".menubar"] },
  { id: "end" },
];

/** The two string-table keys of a step. */
export function tourKeys(step: TourStep): { title: string; text: string } {
  return { title: `tour_${step.id}_title`, text: `tour_${step.id}_text` };
}
