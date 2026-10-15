// Icons of the commands in ./sheet.js. The popup windows import only these, not the commands.
import { registerIcon } from '../icons.js';

const ICONS = {
  sheetBold: '<path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"/>',
  sheetItalic: '<path d="M10 4h8M6 20h8M14 4l-4 16"/>',
  sheetUnderline: '<path d="M7 4v7a5 5 0 0 0 10 0V4"/><path d="M5 21h14"/>',
  sheetAlignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  sheetAlignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  sheetAlignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  sheetAlignTop: '<path d="M4 4h16"/><path d="M12 20V8M8 12l4-4 4 4"/>',
  sheetAlignVCenter: '<path d="M4 12h16"/><path d="M12 3v5M9 5l3 3 3-3M12 21v-5M9 19l3-3 3 3"/>',
  sheetAlignBottom: '<path d="M4 20h16"/><path d="M12 4v12M8 12l4 4 4-4"/>',
  sheetMerge: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M8 12h8M10 10l-2 2 2 2M14 10l2 2-2 2"/>',
  sheetSplit: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14"/><path d="M9 10l-2 2 2 2M15 10l2 2-2 2"/>',
  sheetImport: '<path d="M4 4h10l6 6v10H4z"/><path d="M12 9v8M9 14l3 3 3-3"/>',
  sheetExport: '<path d="M4 4h10l6 6v10H4z"/><path d="M12 17V9M9 12l3-3 3 3"/>',
};
for (const [name, inner] of Object.entries(ICONS)) registerIcon(name, inner);
