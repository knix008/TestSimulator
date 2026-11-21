// The progress window's icons (app.js withProgress, popup.js renderProgress); test/unit/progress-icons.test.js checks
// that every job title and step used in the code has one and that each icon exists.
/** The progress window's icon for each kind of job (the hourglass only for jobs not listed). */
export const PROGRESS_ICONS = {
  'progress.compose': 'aiCompose', 'progress.lyrics': 'aiLyrics', 'progress.export': 'exportAudio',
  'progress.save': 'save', 'progress.open': 'folderOpen', 'progress.template': 'template', 'progress.sample': 'samples',
  'progress.background': 'imageBg', 'progress.regenerate': 'variation',
};

/** The big icon follows the step the job is on: asking the AI, writing the music, rendering the sound, encoding the file. */
export const PROGRESS_STEP_ICONS = {
  'progress.step.ask': 'aiClaude', 'progress.step.plan': 'structure', 'progress.step.lyrics': 'lyrics', 'progress.step.compose': 'notesIcon',
  'progress.step.render': 'waveform', 'progress.step.encode': 'exportAudio', 'progress.step.stem': 'tracks', 'progress.step.done': 'check',
};

/** The small icon before the job's name. */
export const PROGRESS_NAME_ICONS = { 'progress.compose': 'lyrics', 'progress.lyrics': 'lyrics', 'progress.template': 'template', 'progress.sample': 'samples', 'progress.export': 'waveform' };
