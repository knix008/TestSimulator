// The progress window's icon per kind of job (app.js withProgress); test/unit/progress-icons.test.js checks that
// every job title used in the code has one and that each icon exists.
/** The progress window's icon for each kind of job (the hourglass only for jobs not listed). */
export const PROGRESS_ICONS = {
  'progress.image': 'exportImage', 'progress.render': 'renderPhoto', 'progress.export': 'exportModel', 'progress.save': 'save',
  'progress.open': 'folderOpen', 'progress.import': 'importModel', 'progress.convertDwg': 'importPlan', 'progress.readPlan': 'importPlan',
  'progress.readPdf': 'pdfFile', 'progress.readBuilding': 'libStructure', 'progress.detectWalls': 'wallTool', 'progress.convert3d': 'view3d',
  'progress.template': 'template', 'progress.sample': 'samples', 'progress.environment': 'environment', 'progress.environmentImport': 'environment',
  'progress.background': 'imageBg', 'progress.texture': 'matAll', 'userlib.importing': 'library',
};
