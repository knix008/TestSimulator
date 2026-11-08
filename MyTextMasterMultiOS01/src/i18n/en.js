// English. Same keys as ko.js (test/i18n.test.js).
import extra from './en-extra.js';

const base = {
  // menus
  'menu.home': 'Home', 'menu.file': 'File', 'menu.edit': 'Edit', 'menu.format': 'Format', 'menu.insert': 'Insert', 'menu.tools': 'Tools', 'menu.view': 'View', 'menu.help': 'Help',
  'submenu.case': 'Case', 'submenu.lines': 'Lines', 'submenu.whitespace': 'Tabs and spaces', 'submenu.kind': 'Document kind', 'submenu.encoding': 'Encoding', 'submenu.eol': 'Line endings', 'submenu.previewStyle': 'Preview style',
  // file
  'action.new': 'New document', 'action.newMarkdown': 'New Markdown', 'action.newHtml': 'New HTML', 'action.newText': 'New text', 'action.newFromTemplate': 'New from template',
  'action.pasteNew': 'New from clipboard', 'action.open': 'Open…', 'action.openRecent': 'Recent files', 'action.reload': 'Reload from disk',
  'action.save': 'Save', 'action.saveAs': 'Save as…', 'action.saveAll': 'Save all', 'action.exportHtml': 'Export as HTML…', 'action.copyHtml': 'Copy as HTML',
  'action.print': 'Print…', 'action.closeTab': 'Close tab', 'action.closeAll': 'Close all', 'action.exit': 'Exit',
  // edit
  'action.undo': 'Undo', 'action.redo': 'Redo', 'action.cut': 'Cut', 'action.copy': 'Copy', 'action.paste': 'Paste', 'action.selectAll': 'Select all',
  'action.find': 'Find', 'action.replace': 'Replace', 'action.gotoLine': 'Go to line…', 'action.duplicateLine': 'Duplicate line', 'action.toggleComment': 'Toggle comment',
  'action.indentMore': 'Indent', 'action.indentLess': 'Outdent', 'action.readOnly': 'Read-only',
  // format
  'action.bold': 'Bold', 'action.italic': 'Italic', 'action.strike': 'Strikethrough', 'action.inlineCode': 'Inline code', 'action.heading': 'Heading level',
  'action.heading1': 'Heading 1', 'action.heading2': 'Heading 2', 'action.heading3': 'Heading 3', 'action.heading4': 'Heading 4', 'action.paragraph': 'Body text (no heading)',
  'action.bulletList': 'Bulleted list', 'action.orderedList': 'Numbered list', 'action.taskList': 'Task list', 'action.quote': 'Quote',
  // insert
  'action.link': 'Link…', 'action.image': 'Picture…', 'action.table': 'Table…', 'action.codeBlock': 'Code block…', 'action.hr': 'Horizontal rule', 'action.footnote': 'Footnote', 'action.dateTime': 'Date and time',
  // tools
  'action.upper': 'UPPER CASE', 'action.lower': 'lower case', 'action.titleCase': 'Title Case', 'action.sortAsc': 'Sort lines ascending', 'action.sortDesc': 'Sort lines descending',
  'action.reverseLines': 'Reverse line order', 'action.dedupe': 'Remove duplicate lines', 'action.trimTrailing': 'Trim trailing spaces', 'action.removeEmpty': 'Remove empty lines', 'action.joinLines': 'Join lines',
  'action.tabsToSpaces': 'Tabs → spaces', 'action.spacesToTabs': 'Spaces → tabs', 'action.formatHtml': 'Format HTML (indent)', 'action.escapeHtml': 'Escape HTML characters', 'action.stats': 'Document statistics',
  // view
  'action.viewEditor': 'Editor only', 'action.viewSplit': 'Side by side', 'action.viewPreview': 'Preview only', 'action.cycleView': 'Switch view', 'action.syncScroll': 'Sync scrolling',
  'action.outline': 'Outline panel', 'action.statusBar': 'Status bar', 'action.wordWrap': 'Word wrap', 'action.lineNumbers': 'Line numbers', 'action.activeLine': 'Highlight current line', 'action.whitespace': 'Show whitespace',
  'action.zoomIn': 'Larger text', 'action.zoomOut': 'Smaller text', 'action.zoomReset': 'Reset text size', 'action.focusMode': 'Focus mode (full screen)',
  'action.themeRandom': 'Change theme (random)', 'action.themeChoose': 'Choose theme', 'action.language': 'Switch to 한국어', 'action.settings': 'Settings…',
  // help
  'action.userGuide': "User's guide", 'action.tutorialDoc': 'Tutorial document', 'action.tutorial': 'Start tutorial', 'action.shortcuts': 'Keyboard shortcuts', 'action.about': 'About MyTextMaster',
  // dialog buttons
  'action.ok': 'OK', 'action.cancel': 'Cancel', 'action.close': 'Close', 'action.insert': 'Insert', 'action.go': 'Go', 'action.dontSave': "Don't save", 'action.overwrite': 'Overwrite', 'action.keepMine': 'Keep mine',
  'action.shuffleBackground': 'Shuffle background',
  // toolbar
  'toolbar.export': 'Export',
  // window
  'window.minimize': 'Minimize', 'window.maximize': 'Maximize', 'window.restore': 'Restore', 'window.close': 'Close',
  // tips
  'tip.home': 'Start page (press again to go back to the document)', 'tip.panelSplitter': 'Drag to resize the outline', 'tip.previewSplitter': 'Drag to resize the editor and the preview',
  'tip.resize': 'Drag to resize the window', 'tip.newTab': 'New document (Ctrl+N)', 'tip.hideOutline': 'Hide the outline', 'tip.fontSize': 'Editor text size',
  'tip.kind': 'Change the document kind (highlighting and preview)', 'tip.tabSize': 'Indentation: spaces/tabs and width', 'tip.eol': 'Line endings (LF / CRLF)', 'tip.encoding': 'The encoding used when saving',
  'tip.userGuide': "Opens the user's guide in a read-only tab", 'tip.tutorialDoc': 'Opens the step-by-step tutorial', 'tip.startHelp': 'Help menu',
  // tabs
  'tabs.documents': 'Open documents', 'tabs.left': 'Tabs to the left', 'tabs.right': 'Tabs to the right', 'tabs.closeOthers': 'Close other tabs', 'tabs.closeRight': 'Close tabs to the right',
  'tabs.rename': 'Rename…', 'tabs.copyPath': 'Copy path', 'tabs.openFolder': 'Open containing folder',
  // panels
  'panel.outline': 'Outline', 'panel.preview': 'Preview', 'outline.empty': 'No headings (#, <h1>…) yet. Write one and the table of contents appears here.', 'outline.text': 'Text documents have no outline. Change the document kind to Markdown or HTML to see headings.',
  'preview.scriptsOn': 'Scripts run', 'preview.scriptsOff': 'Scripts off',
  'previewStyle.github': 'GitHub', 'previewStyle.document': 'Document', 'previewStyle.academic': 'Academic', 'previewStyle.plain': 'Plain',
  'drop.hint': 'Drop here to open the files',
  // kinds and files
  'kind.markdown': 'Markdown', 'kind.html': 'HTML', 'kind.text': 'Text',
  'filter.all': 'Supported documents', 'filter.markdown': 'Markdown documents', 'filter.html': 'HTML documents', 'filter.text': 'Text files', 'filter.any': 'All files',
  'doc.untitled': 'Untitled',
  // status bar
  'status.cursor': 'Ln {line}, Col {col}', 'status.line': 'line {n}', 'status.selected': '{n} selected', 'status.words': '{words} words · {chars} chars · {lines} lines',
  'status.modified': 'Modified', 'status.saved': 'Saved', 'status.new': 'New', 'status.readOnly': 'Read-only', 'status.spaces': 'Spaces: {n}', 'status.tabs': 'Tab size: {n}',
  'status.start': 'Start page', 'status.openDocs': '{n} open documents', 'status.desktop': 'Desktop', 'status.web': 'Web',
  // notices
  'notice.theme': 'Theme: {name}', 'notice.opened': 'Opened {name}', 'notice.saved': 'Saved {name}', 'notice.reloaded': 'Reloaded {name} from disk',
  'notice.exported': 'Exported {name}', 'notice.htmlCopied': 'HTML copied to the clipboard', 'notice.copied': 'Copied', 'notice.formatted': 'HTML formatted',
  'notice.newFrom': 'New document: {name}', 'notice.sample': 'Sample opened: {name} (save it to keep your own copy)', 'notice.clipboardEmpty': 'The clipboard has no text',
  'notice.kind': 'Document kind: {kind}', 'notice.encoding': 'Encoding: {name} (used when saving)', 'notice.recentCleared': 'Recent files cleared',
  'notice.webRecent': 'The web version cannot reopen recent files directly. Please pick the file.', 'notice.downloaded': 'Saved as a download: {name}',
  'notice.linkWeb': 'This link opens in the desktop version, for a saved document', 'notice.linkMissing': 'The linked file does not exist: {name}',
  'notice.missing': 'The file is gone from the disk: {name}', 'notice.restored': 'Reopened {n} documents from last time', 'notice.animation': 'Background: {name}',
  'notice.view.editor': 'Editor only', 'notice.view.split': 'Editor and preview side by side', 'notice.view.preview': 'Preview only',
  // confirm & errors
  'confirm.unsavedTitle': 'Unsaved changes', 'confirm.unsaved': 'Save the changes to "{name}"?', 'confirm.unsavedDetail': 'Your changes are lost if you do not save them.',
  'confirm.reload': 'Discard the unsaved changes to "{name}" and reload it from disk?',
  'confirm.overwriteChanged': '"{name}" was changed by another program. Overwrite it anyway?',
  'confirm.changedTitle': 'The file changed', 'confirm.changed': '"{name}" was changed by another program.', 'confirm.changedDetail': 'Reload it from disk? The changes made in this window are lost.',
  'error.title': 'Error', 'error.open': 'Could not open "{name}"', 'error.save': 'Could not save "{name}"',
  // fields
  'field.name': 'Name', 'field.linkText': 'Text to show', 'field.url': 'Address (URL)', 'field.imageUrl': 'Picture address or path', 'field.alt': 'Alternative text',
  'field.imageNote': 'Use a path relative to the document folder (images/a.png) or a web address.',
  'field.columns': 'Columns', 'field.rows': 'Rows (without the header)', 'field.column': 'Column', 'field.language': 'Language', 'field.noLanguage': '(none)', 'field.line': 'Line (1–{n})',
  'placeholder.bold': 'bold text', 'placeholder.italic': 'italic text', 'placeholder.strike': 'struck text', 'placeholder.heading': 'Heading',
  // recent
  'recent.empty': 'No recent files', 'recent.noFolders': 'No recent folders', 'recent.clear': 'Clear list', 'recent.clearFolders': 'Clear folders',
  'recent.remove': 'Remove from the list', 'recent.removeFolder': 'Remove from the list', 'recent.webFile': 'Opened in the browser',
  // start page
  'start.tagline': 'Write Markdown, HTML and text documents and see them as you type',
  'start.actions': 'Quick actions', 'start.recentCard': 'Recent', 'start.recent': 'Recent files', 'start.recentFolders': 'Recent folders', 'start.new': 'New', 'start.samples': 'Sample documents',
  'start.theme': 'Theme', 'start.themeDark': 'Dark themes', 'start.themeLight': 'Light themes', 'start.themeSettings': 'Theme settings', 'start.background': 'Moving background',
  'start.settings': 'Start page settings', 'start.arrange': 'Auto arrange', 'start.arrangeTip': 'Puts the cards back where they started', 'start.moveCard': 'Drag to move the card', 'start.resizeCard': 'Drag to resize (double-click fits the content)',
  'start.tutorialStart': 'Start tutorial', 'start.openDocs': '{n} documents are open', 'start.back': 'Back to the documents', 'start.backTip': 'Back to the document you were editing',
  'start.tipOpen': 'Open Markdown, HTML or text files (Ctrl+O)', 'start.tipNewMarkdown': 'An empty .md document', 'start.tipNewHtml': 'The HTML5 skeleton', 'start.tipNewText': 'An empty .txt document',
  'start.tipPasteNew': 'A new document with the clipboard text', 'start.tipTutorial': 'A guided walk through the window', 'start.tipTheme': 'Theme and font settings', 'start.tipLanguage': 'Switch the display language',
  'start.tipSettings': 'Editor, preview and file settings', 'start.tipStartSettings': 'Cards and background of the start page', 'start.tipAbout': 'Version and build information', 'start.tipExit': 'Quit the program',
  'start.never': 'Never', 'start.everySeconds': 'Every {n} s', 'start.everyMinutes': 'Every {n} min', 'start.bgInterval': 'Auto change', 'start.bgIntervalTip': 'Changes the background at an interval',
  'start.bgRandom': 'Random', 'start.bgRandomTip': 'Picks the next background at random', 'start.cardOpacity': 'Card opacity', 'start.still': 'Pause', 'start.move': 'Animate', 'start.stillTip': 'Pauses or resumes the background',
  'animation.aurora': 'Aurora', 'animation.waves': 'Waves', 'animation.particles': 'Particles', 'animation.constellation': 'Constellation', 'animation.bubbles': 'Bubbles', 'animation.gridflow': 'Grid flow',
  'animation.flowchart': 'Flowchart', 'animation.starfield': 'Star field', 'animation.rain': 'Rain', 'animation.snow': 'Snow', 'animation.fireflies': 'Fireflies', 'animation.ripples': 'Ripples',
  'animation.coderain': 'Code rain', 'animation.hexagons': 'Hexagons', 'animation.orbits': 'Orbits', 'animation.lava': 'Lava lamp', 'animation.spiral': 'Spiral galaxy', 'animation.confetti': 'Confetti',
  'animation.nodes': 'Node network', 'animation.ribbons': 'Ribbons',
  // settings
  'settings.tab.general': 'General', 'settings.tab.appearance': 'Appearance', 'settings.tab.editor': 'Editor', 'settings.tab.preview': 'Preview', 'settings.tab.files': 'Files', 'settings.tab.start': 'Start page',
  'settings.language': 'Language', 'settings.defaultKind': 'New document kind', 'settings.defaultKindTip': 'What Ctrl+N and the + tab create', 'settings.theme': 'Theme',
  'settings.uiFont': 'Interface font', 'settings.uiFontSize': 'Interface text size', 'settings.editorFont': 'Editor font', 'settings.editorFontSize': 'Editor text size',
  'settings.tabSize': 'Tab width', 'settings.insertSpaces': 'Tab key inserts spaces', 'settings.autoCloseBrackets': 'Close brackets and quotes',
  'settings.viewMode': 'View', 'settings.previewScripts': 'Run scripts in the HTML preview', 'settings.previewScriptsTip': "When on, an HTML document's <script> runs in the preview. The preview is then cut off from the program, so scroll sync works by proportion only. Turn it on for documents you trust.",
  'settings.autoSave': 'Auto save', 'settings.autoSaveTip': 'Saves documents that already have a file at an interval (desktop)', 'settings.autoSaveSeconds': 'Auto save every', 'settings.seconds': 's',
  'settings.restoreSession': 'Reopen the last documents at start', 'settings.restoreSessionTip': 'Documents open at exit (unsaved text included) open again next time',
  'settings.showStartPage': 'Show the start page at start', 'settings.startShowRecent': 'Recent card', 'settings.startRecentCount': 'Recent items shown', 'settings.startShowSamples': 'Samples card',
  'settings.startShowBackground': 'Moving background card', 'settings.backgroundMoves': 'Background', 'settings.bgAnimated': 'Moving', 'settings.bgStatic': 'Still', 'settings.animation': 'Background kind', 'settings.animationSpeed': 'Background speed',
  'settings.reset': 'Reset to defaults', 'settings.resetConfirm': 'Put every setting back to its default? Recent files and open documents stay.', 'settings.resetDone': 'Settings reset to defaults',
  'color.bg': 'Background', 'color.surface': 'Surface', 'color.panel': 'Panel', 'color.text': 'Text', 'color.muted': 'Muted text', 'color.border': 'Border', 'color.accent': 'Accent', 'color.accentText': 'Text on accent',
  'color.gridAlt': 'Alternate rows', 'color.chart': 'Editing area', 'color.toolbar': 'Toolbar', 'color.status': 'Status bar', 'color.dark': 'Dark theme',
  // about & stats
  'about.description': 'Edits Markdown, HTML and text files: tabs, syntax highlighting, side-by-side preview with scroll sync, outline, find and replace, formatting and line tools, encodings (UTF-8, UTF-16, EUC-KR) and line endings, HTML export and printing. Runs on Windows, macOS, Linux and the web.',
  'about.build': 'Build', 'about.version': 'Version', 'about.built': 'Built', 'about.commit': 'Commit', 'about.platform': 'Platform', 'about.runtime': 'Runtime', 'about.author': 'Author', 'about.libraries': 'Libraries',
  'stats.words': 'Words', 'stats.chars': 'Characters (with spaces)', 'stats.noSpaces': 'Characters (no spaces)', 'stats.lines': 'Lines', 'stats.paragraphs': 'Paragraphs', 'stats.reading': 'Reading time', 'stats.minutes': 'about {n} min',
  'stats.encoding': 'Encoding', 'stats.kind': 'Document kind', 'stats.selection': 'Selection: {n} characters',
  'shortcut.editor': 'Editor', 'shortcut.nextTab': 'Next tab', 'shortcut.prevTab': 'Previous tab', 'shortcut.moveLine': 'Move line up / down', 'shortcut.selectNext': 'Select the next match',
  'shortcut.click': 'click', 'shortcut.multiCursor': 'More cursors / box selection', 'shortcut.menu': 'Open the File menu',
  // template names (file names of new documents)
  'templateName.readme': 'README', 'templateName.meeting': 'meeting-notes', 'templateName.blog': 'blog-post', 'templateName.todo': 'todo', 'templateName.changelog': 'CHANGELOG', 'templateName.webpage': 'index', 'templateName.letter': 'letter',
  // tutorial
  'tour.title': 'Tutorial', 'tour.close': 'Close the tutorial', 'tour.prev': 'Back', 'tour.next': 'Next', 'tour.finish': 'Finish', 'tour.keys': '← → to move',
  'tour.welcome.title': 'Welcome to MyTextMaster',
  'tour.welcome.text': 'This tour shows each part of the window in turn. The sample "Feature tour" is open, so try things as you go.',
  'tour.menubar.title': 'Menu bar and window buttons', 'tour.menubar.text': 'The top row is also the title bar: the program name, version and open document on the left, minimize, maximize and close on the right. Drag an empty spot to move the window; double-click to maximize. Press Alt alone to open the File menu.',
  'tour.home.title': 'Home (start page)', 'tour.home.text': 'Home shows the start page; press it again to go back to your document. The start page has new documents, samples, recent files, themes and backgrounds, and its cards can be dragged anywhere.',
  'tour.file.title': 'File', 'tour.file.text': 'New (Ctrl+N), open (Ctrl+O), save (Ctrl+S), save all and print (Ctrl+P). Dropping files on the window opens them too.',
  'tour.format.title': 'Format', 'tour.format.text': 'Bold (Ctrl+B), italic (Ctrl+I), strikethrough, code, headings, lists and quotes. Markdown documents get Markdown marks, HTML documents get HTML tags. Press again to remove the format.',
  'tour.insert.title': 'Insert', 'tour.insert.text': 'Links (Ctrl+K), pictures, tables, code blocks and rules. A table asks for its columns and rows, then inserts an empty one.',
  'tour.view.title': 'View', 'tour.view.text': 'Editor only · side by side · preview only (Ctrl+\\ switches), and scroll sync: scroll one side and the other shows the same place.',
  'tour.tabs.title': 'Document tabs', 'tour.tabs.text': 'Every document has a tab; ● marks unsaved ones. A middle click closes a tab, a right click has close others, copy path and more. Ctrl+Tab moves between tabs.',
  'tour.editor.title': 'Editor', 'tour.editor.text': 'Syntax highlighting, line numbers, folding, bracket matching, completion and multiple cursors (Alt+click, Ctrl+D). Find is Ctrl+F, replace Ctrl+H, go to line Ctrl+G.',
  'tour.preview.title': 'Preview', 'tour.preview.text': 'Markdown turns into HTML as you type; HTML documents show as the page they make. The paragraph with the cursor gets an orange mark. Links open in the browser or as documents.',
  'tour.outline.title': 'Outline', 'tour.outline.text': 'The headings of the document as a table of contents. Click one to go there; the section with the cursor is highlighted. Drag the edge to resize it.',
  'tour.status.title': 'Status bar', 'tour.status.text': 'Document kind, cursor, words / characters / lines, save state, indentation, line endings (LF/CRLF) and encoding. Click an item to change it.',
  'tour.right.title': 'Tutorial, theme, language, settings', 'tour.right.text': 'The theme button picks a random theme, ▾ lists them all (20 light, 20 dark). The flag switches between Korean and English; the gear opens Settings.',
  'tour.done.title': 'All done', 'tour.done.text': "Now try it yourself. Help › User's guide (F1) and the tutorial document have the details; Help › Keyboard shortcuts lists every key.",
};

export default { ...base, ...extra };
