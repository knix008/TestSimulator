// Tutorial settings, kept in the workspace as settings.tutorial:
//   { showAtStart: true, done: false, lastIndex: 0 }
// showAtStart — show the start guide (TutorialWelcome) every time the app starts;
// done        — the tour was played to the end;
// lastIndex   — the step the tour was left on, to continue from there.
// The helpers return patches for App's patchSettings({ tutorial: … }).

export const TUTORIAL_DEFAULTS = { showAtStart: true, done: false, lastIndex: 0 };

export function tutorialOf(settings) {
  const s = (settings && settings.tutorial) || {};
  return {
    showAtStart: s.showAtStart !== false,
    done: !!s.done || !!(settings && settings.tutorialDone),
    lastIndex: Number.isFinite(s.lastIndex) ? Math.max(0, s.lastIndex) : 0,
  };
}

/** Whether to show the start guide at launch: only the user's switch decides. */
export function shouldShowWelcome(settings) {
  return tutorialOf(settings).showAtStart;
}

const patch = (settings, change) => ({ tutorial: { ...tutorialOf(settings), ...change } });

/** [튜토리얼 시작] on the welcome card (keeps the card for next time only when `keepShowing`). */
export const startPatch = (settings, keepShowing = true) => patch(settings, { showAtStart: !!keepShowing });
/** [나중에]: nothing changes except the check box. */
export const laterPatch = (settings, keepShowing = true) => patch(settings, { showAtStart: !!keepShowing });
/** "다시 보지 않기": the card never comes back by itself. */
export const neverPatch = (settings) => patch(settings, { showAtStart: false });
export const showAtStartPatch = (settings, on) => patch(settings, { showAtStart: !!on });
/** When the tour stops: where it was left, and whether it reached the end. */
export const progressPatch = (settings, { index, done }) => patch(settings, { lastIndex: index || 0, ...(done ? { done: true } : {}) });
/** 처음부터 다시: forget the progress. */
export const resetPatch = (settings) => patch(settings, { done: false, lastIndex: 0 });
