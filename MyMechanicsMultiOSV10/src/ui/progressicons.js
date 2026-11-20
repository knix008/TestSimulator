// The progress window's icons (app.js withProgress, popup.js renderProgress).
/** The progress window's icon for each kind of job (the hourglass only for jobs not listed). */
export const PROGRESS_ICONS = {
  'progress.kernel': 'part', 'progress.new': 'partNew', 'progress.export': 'exportFile', 'progress.save': 'save', 'progress.open': 'folderOpen',
  'progress.import': 'stepFile', 'progress.sample': 'samples', 'progress.background': 'imageBg', 'progress.interference': 'interference',
};

/** The big icon in the window follows the step the job is on (report({ icon })). */
export const PROGRESS_STEP_ICONS = { 'progress.step.build': 'rebuild', 'progress.step.done': 'check' };

/** The small icon before the job's name: a file unless the name is something else. */
export const PROGRESS_NAME_ICONS = { 'progress.sample': 'samples', 'progress.kernel': 'gear', 'progress.interference': 'assembly' };
