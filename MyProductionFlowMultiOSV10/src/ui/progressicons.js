// The progress window's icons (app.js withProgress, popup.js renderProgress); test/unit/progress-icons.test.js checks
// that every job title and step used in the code has one and that each icon exists.
/** The progress window's icon for each kind of job (the hourglass only for jobs not listed). */
export const PROGRESS_ICONS = {
  'progress.image': 'exportImage', 'progress.render': 'renderPhoto', 'progress.export': 'exportModel', 'progress.save': 'save',
  'progress.open': 'folderOpen', 'progress.import': 'importModel', 'progress.convertDwg': 'refresh', 'progress.readPlan': 'importPlan',
  'progress.readPdf': 'pdfFile', 'progress.readBuilding': 'libStructure', 'progress.detectWalls': 'wallTool', 'progress.convert3d': 'view3d',
  'progress.template': 'template', 'progress.sample': 'samples', 'progress.environment': 'environment', 'progress.environmentImport': 'environment',
  'progress.background': 'imageBg', 'progress.texture': 'matAll', 'userlib.importing': 'library',
};

/**
 * The big icon in the window follows the step the job is on (report({ icon }) / inSteps' step(key)): what is being
 * done right now — reading the drawing, finding walls, building the 3D scene, encoding the file …
 */
export const PROGRESS_STEP_ICONS = {
  'progress.step.readDrawing': 'importPlan', 'progress.step.recognise': 'wallTool', 'progress.step.readPicture': 'picture',
  'progress.step.findWallsOnly': 'wallTool', 'progress.step.findWalls': 'wallTool', 'progress.step.chooseWalls': 'sparkles',
  'progress.step.furnitureShapes': 'furniture', 'progress.step.findFurniture': 'search', 'progress.step.buildPlan': 'plan2d',
  'progress.step.buildScene': 'cube', 'progress.step.buildSceneFurniture': 'furniture', 'progress.step.done': 'check',
  'progress.step.buildProject': 'roomTool', 'progress.step.firstFrame': 'view3d',
  'progress.rendering': 'render', 'progress.encoding': 'imageFormat', 'progress.packing': 'save',
};

/** The small icon before the job's name: a file unless the name is something else (a picture size, a count …). */
export const PROGRESS_NAME_ICONS = {
  'progress.image': 'ruler', 'progress.render': 'ruler', 'progress.template': 'template', 'progress.sample': 'samples',
  'progress.environment': 'environment', 'userlib.importing': 'library',
};
