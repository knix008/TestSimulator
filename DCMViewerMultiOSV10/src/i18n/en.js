window.I18N_DATA = window.I18N_DATA || {};
window.I18N_DATA.en = {
  "menu.file": "File", "menu.view": "View", "menu.tools": "Tools", "menu.window": "Window", "menu.cine": "Cine", "menu.help": "Help",

  "file.recent": "Recent Folders", "file.recentNone": "(none)", "file.recentClear": "Clear all", "file.recentRemove": "Remove from list", "file.recentMissing": "Folder not found: {dir}", "tabs.close": "Close tab", "tabs.scrollLeft": "Scroll tabs left", "tabs.scrollRight": "Scroll tabs right", "file.open": "Open File…", "file.openFolder": "Open Folder…", "file.export": "Export Image", "file.exportTags": "Export DICOM Tags",
  "file.exportTiff16": "16-bit TIFF (raw pixel values)", "file.exportAllFrames": "All frames as PNG (ZIP)…", "file.exportGifAnimated": "Animated GIF (all frames)…",
  "file.copyImage": "Copy Image", "file.batch": "Batch Convert Folder…", "file.print": "Print…", "file.close": "Close File", "file.exit": "Exit",

  "view.fit": "Fit to Window", "view.actual": "Actual Size (100%)", "view.zoomIn": "Zoom In", "view.zoomOut": "Zoom Out",
  "view.rotateLeft": "Rotate Left", "view.rotateRight": "Rotate Right", "view.flipH": "Flip Horizontal", "view.flipV": "Flip Vertical", "view.resetView": "Reset View",
  "view.invert": "Invert", "view.interpolation": "Smooth interpolation", "view.cornerInfo": "Corner information", "view.orientationMarkers": "Orientation markers",
  "view.overlays": "DICOM overlay planes", "view.measurements": "Show measurements", "view.burnAnnotations": "Include annotations in export",
  "view.zoomLabel": "Current zoom (click: actual size 100%)", "view.ruler": "Scale ruler", "view.grid": "Grid (10 mm)", "view.sidebar": "Sidebar", "view.fullscreen": "Full Screen", "view.themeNext": "Switch to the next theme (click)", "view.theme": "Theme", "view.themeDark": "Dark", "view.themeLight": "Light",
  "view.language": "Language", "view.devtools": "Developer Tools",

  "edit.undo": "Undo", "edit.redo": "Redo", "tools.pan": "Pan (drag) — 1", "tools.wl": "Window / Level (drag) — 2", "tools.zoom": "Zoom (drag) — 3", "tools.stack": "Scroll frames / slices (wheel, drag) — 4",
  "tools.probe": "Pixel probe — 5", "tools.length": "Length — 6", "tools.angle": "Angle — 7", "tools.rect": "Rectangle ROI — 8", "tools.ellipse": "Ellipse ROI — 9",
  "tools.text": "Text annotation — 0", "tools.deleteLast": "Delete last measurement", "tools.clear": "Clear measurements",

  "wl.auto": "Auto (min – max)", "wl.file": "From file", "wl.presets": "Presets", "wl.lut": "VOI LUT", "wl.function": "VOI function", "wl.colormap": "Colour map",
  "wl.reset": "Reset window", "wl.none": "(none)", "wl.custom": "Custom", "wl.fileWindow": "File {n}",
  "preset.brain": "Brain", "preset.subdural": "Subdural", "preset.stroke": "Stroke", "preset.soft": "Soft tissue", "preset.liver": "Liver",
  "preset.mediastinum": "Mediastinum", "preset.lung": "Lung", "preset.bone": "Bone", "preset.abdomen": "Abdomen", "preset.spine": "Spine", "preset.angio": "Angio",
  "cm.gray": "Grey", "cm.hotiron": "Hot iron", "cm.pet": "PET", "cm.hotmetalblue": "Hot metal blue", "cm.pet20": "PET 20 steps", "cm.jet": "Jet", "cm.rainbow": "Rainbow", "cm.bone": "Bone",

  "cine.playPause": "Play / Pause", "cine.first": "First frame", "cine.prev": "Previous frame", "cine.next": "Next frame", "cine.last": "Last frame", "cine.loop": "Loop", "cine.fps": "fps",
  "series.prev": "Previous file in series", "series.next": "Next file in series", "series.load": "Sort folder as DICOM series", "series.scanning": "Scanning {done} / {total}…",
  "series.files": "{n} files", "series.none": "No DICOM series in this folder.", "series.unsorted": "Files in the folder (by name)",

  "help.shortcuts": "Keyboard shortcuts", "help.about": "About DCM Viewer",
  "tb.open": "Open", "tb.folder": "Folder", "tb.preset": "Preset", "tb.colormap": "Colour", "tb.export": "Export", "tb.batch": "Batch",

  "sidebar.drives": "Drives (click to select)", "sidebar.folder": "Folder", "sidebar.up": "Parent folder", "sidebar.refresh": "Refresh", "sidebar.choose": "Choose folder…",
  "sidebar.info": "Info", "sidebar.tags": "Tags", "sidebar.histogram": "Histogram", "sidebar.series": "Series", "sidebar.search": "Search tags…", "sidebar.noFile": "No file opened",
  "sidebar.noRoots": "No folder mounted. Use Open Folder… or drop a folder here.", "tags.copy": "Copy tags to clipboard", "tags.count": "{n} tags",
  "tree.parent": ".. (parent folder)", "tree.empty": "(empty)", "tree.drives": "Drives",

  "ctx.open": "Open", "ctx.showInFolder": "Show in file manager", "ctx.copy": "Copy", "ctx.cut": "Cut", "ctx.paste": "Paste", "ctx.delete": "Delete", "ctx.copyPath": "Copy path", "ctx.chooseFolder": "Choose folder…",

  "status.ready": "Ready", "status.loading": "Loading…", "status.decoding": "Decoding {name}…", "status.frame": "Frame {n}/{total}", "status.zoom": "Zoom {z}%",
  "status.wlWidth": "Window width (W)", "status.wlCenter": "Window centre (L)", "status.wl": "W {ww} / L {wc}", "status.probe": "({x}, {y}) {v}", "status.file": "{name} — {size}",

  "about.text": "A cross-platform DICOM viewer for Web, Windows, macOS and Linux. Reads uncompressed, RLE, JPEG, JPEG-LS and JPEG 2000 DICOM images with window / level, VOI LUTs, colour maps, overlays, cine, series stacks, measurements, a tag browser, export and batch conversion.",
  "about.version": "Version", "about.platform": "Platform", "about.runtime": "Runtime", "about.formats": "Formats",
  "about.formatsList": "DICOM (.dcm, .dicm, .dicom) · JPEG · PNG · GIF · WebP · AVIF · BMP · ICO · SVG · TIFF (multi-page) · HEIF / HEIC · JPEG 2000 (.jp2 / .j2k)",

  "dlg.close": "Close", "dlg.ok": "OK", "dlg.cancel": "Cancel", "dlg.copy": "Copy", "dlg.errorTitle": "Error",

  "batch.title": "Batch convert folder", "batch.source": "Source folder", "batch.choose": "Choose…", "batch.format": "Format", "batch.options": "Options",
  "batch.recursive": "Include sub-folders", "batch.allFrames": "All frames (multi-frame files)", "batch.currentWL": "Use current window / colour map",
  "batch.hint": "Output goes to a converted_<format> folder next to the source files (a ZIP download in the browser when the folder is read-only).",
  "batch.start": "Start", "batch.scanning": "Scanning…", "batch.progress": "{done} / {total} — {name}", "batch.done": "Converted {ok} file(s), {fail} failed.",
  "batch.output": "Output: {dir}", "batch.noFiles": "No DICOM files found in the folder.", "batch.noSource": "Choose a source folder first.", "batch.failures": "Failed files",

  "export.frameSuffix": "frame", "export.done": "Saved {name}", "export.noImage": "Open an image first.", "export.notDicom": "Only available for DICOM images.",
  "export.singleFrame": "This file has only one frame.", "export.zipDone": "Saved {n} frames to {name}",

  "msg.dropTitle": "Open a DICOM file", "msg.dropHint": "Drop a .dcm file or folder here, or use File → Open.",
  "msg.loadFailed": "Could not open {name}", "msg.unsupported": "Unsupported file type: {name}", "msg.copied": "Copied to clipboard",
  "msg.deleteConfirm": "Move \"{name}\" to the trash?", "msg.deleted": "Moved to trash: {name}", "msg.pasted": "{n} item(s) pasted", "msg.noClipboard": "Nothing to paste.",
  "msg.notInBrowser": "Not available in the browser.", "msg.printFailed": "Printing failed: {reason}", "msg.textPrompt": "Annotation text", "msg.noPixelData": "This DICOM has no image (pixel data). Tags are shown on the left.",
  "msg.sortedSeries": "{files} files in {series} series", "msg.warning": "Warning: {text}",

  "meta.patientName": "Patient name", "meta.patientId": "Patient ID", "meta.patientSex": "Sex", "meta.patientBirthDate": "Birth date", "meta.patientAge": "Age",
  "meta.modality": "Modality", "meta.sopClass": "SOP class", "meta.manufacturer": "Manufacturer", "meta.institution": "Institution", "meta.stationName": "Station",
  "meta.studyDate": "Study date", "meta.studyTime": "Study time", "meta.studyDescription": "Study", "meta.seriesDescription": "Series", "meta.seriesNumber": "Series #",
  "meta.instanceNumber": "Instance #", "meta.accessionNumber": "Accession #", "meta.bodyPart": "Body part", "meta.protocolName": "Protocol", "meta.patientPosition": "Patient position",
  "meta.imageSize": "Image size", "meta.photometric": "Photometric", "meta.bitDepth": "Bit depth", "meta.frames": "Frames", "meta.frameRate": "Frame rate", "meta.transferSyntax": "Transfer syntax",
  "meta.pixelSpacing": "Pixel spacing", "meta.sliceThickness": "Slice thickness", "meta.sliceLocation": "Slice location", "meta.imagePosition": "Image position", "meta.imageOrientation": "Orientation",
  "meta.window": "Window (file)", "meta.voiLut": "VOI LUT", "meta.rescale": "Rescale", "meta.units": "Units", "meta.presentationLut": "Presentation LUT", "meta.overlays": "Overlays",
  "meta.lossyCompression": "Lossy compression", "meta.studyInstanceUid": "Study UID", "meta.seriesInstanceUid": "Series UID", "meta.sopInstanceUid": "SOP instance UID",
  "meta.fileName": "File", "meta.fileSize": "Size", "meta.format": "Format", "meta.dimensions": "Dimensions", "meta.frameInfo": "Current frame",

  "hist.title": "Histogram", "hist.range": "Range {min} – {max}", "hist.window": "Window shown in yellow", "hist.none": "No histogram for colour images.",
  "roi.stats": "n={n} mean={mean} sd={sd} min={min} max={max}", "roi.area": "area {a}",

  "view.settings": "Settings…", "tb.settings": "Settings",
  "settings.title": "Settings", "settings.appearance": "Appearance", "settings.viewer": "Viewer", "settings.files": "Files",
  "settings.reset": "Restore defaults", "settings.resetDone": "Settings restored to defaults.", "settings.clear": "Clear",
  "settings.theme": "Theme (20 built-in)", "settings.lang": "Language", "settings.sidebar": "Show sidebar",
  "settings.interpolate": "Smooth interpolation when zoomed", "settings.cornerInfo": "Corner information (patient / study / window)",
  "settings.markers": "Orientation markers (R / L / A / P / H / F)", "settings.overlays": "Draw DICOM overlay planes (60xx)",
  "settings.measurements": "Show measurements", "settings.burnAnnotations": "Include annotations in exported images",
  "settings.wheelMode": "Mouse wheel", "settings.wheelZoom": "Zoom (Ctrl+wheel scrolls frames)", "settings.wheelStack": "Scroll frames / slices (Ctrl+wheel zooms)",
  "settings.defaultFps": "Default cine speed (fps)", "settings.defaultFpsDesc": "Used when the file does not specify a frame rate.",
  "settings.loop": "Loop cine playback", "settings.annotationColor": "Measurement colour", "settings.overlayColor": "Overlay plane colour",
  "settings.rememberLastDir": "Remember the last folder", "settings.startupDir": "Folder to open at start-up",
  "settings.startupDirHint": "(last folder / Pictures)", "settings.confirmDelete": "Confirm before moving files to the trash",

  "tools.mpr": "MPR / MIP volume view…", "tools.anonymize": "Save anonymised copy…", "file.exportWebm": "Cine video (WebM)…", "view.languageToggle": "Switch language (한국어 / English)", "sc.settings": "Settings",
  "popup.progress": "Working…", "popup.print": "Print", "print.title": "Print preview", "print.orientation": "Orientation", "print.portrait": "Portrait", "print.landscape": "Landscape", "print.paper": "Paper", "print.options": "Options", "print.header": "File / patient header", "print.footer": "Footer (program · date)", "print.center": "Centre image vertically", "print.fit": "Fit to page", "print.copies": "Copies", "print.hint": "Print sends the page straight to the system default printer. Use 'Choose printer…' for another printer or detailed settings.", "print.now": "Print", "print.system": "Choose printer…", "print.sent": "Sent to the default printer.", "popup.about": "About DCM Viewer", "popup.settings": "Settings", "popup.batch": "Batch convert", "popup.error": "Error", "popup.shortcuts": "Keyboard shortcuts", "popup.mpr": "MPR / MIP", "popup.anonymize": "Anonymise", "popup.prompt": "Input",
  "mpr.title": "MPR / MIP volume view", "mpr.mode": "Mode", "mpr.avg": "Average", "mpr.slab": "Slab", "mpr.crosshair": "Crosshair", "mpr.export": "Export views (PNG)",
  "mpr.axial": "Axial", "mpr.coronal": "Coronal", "mpr.sagittal": "Sagittal", "mpr.loading": "Loading slice {done} / {total}…", "mpr.noSlices": "No slices to reconstruct.",
  "mpr.notGray": "MPR needs greyscale slices.", "mpr.sizeMismatch": "All slices must have the same size.", "mpr.needSeries": "Sort the folder as a DICOM series first (Cine → Sort folder), or open a multi-frame file.",
  "anon.title": "Save anonymised copy", "anon.hint": "The selected values are overwritten in a copy of the file (lengths are kept, so the file stays valid). Pixel data is not changed.",
  "anon.private": "Blank all private tags (odd groups)", "anon.replacement": "Replacement text", "anon.save": "Save copy…", "anon.done": "{n} element(s) anonymised → {name}",
  "video.unsupported": "Video recording is not supported here.",

  "sc.open": "Open file", "sc.openFolder": "Open folder", "sc.export": "Export PNG", "sc.copy": "Copy image", "sc.print": "Print", "sc.fit": "Fit to window", "sc.actual": "Actual size",
  "sc.zoom": "Zoom in / out", "sc.wheel": "Mouse wheel: zoom (Ctrl+wheel with the stack tool: frames)", "sc.rotate": "Rotate", "sc.flip": "Flip horizontal / vertical", "sc.reset": "Reset view",
  "sc.invert": "Invert", "sc.tools": "Select tool", "sc.frames": "Previous / next frame", "sc.frameEnds": "First / last frame", "sc.play": "Play / pause cine",
  "sc.series": "Previous / next file", "sc.wlAuto": "Auto window", "sc.wlFile": "Window from file", "sc.wlReset": "Reset window", "sc.delete": "Delete last / all measurements",
  "sc.sidebar": "Toggle sidebar", "sc.fullscreen": "Full screen", "sc.escape": "Cancel tool / close menu", "sc.rightDrag": "Right-drag: window / level · Middle-drag: pan"
};
