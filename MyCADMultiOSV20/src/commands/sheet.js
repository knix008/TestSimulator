// FreeCAD's Spreadsheet commands MyCAD did not have yet: cell styles (bold,
// italic, underline), alignment, merging and splitting cells, CSV import and
// export. The style tools act on the cells picked in the spreadsheet window;
// from the main window they go to that window (it opens when it is closed).
import './sheet-icons.js';


const all = (sh, cells, key, value = true) => cells.length > 0 && cells.every((c) => sh.styles?.[c]?.[key] === value);

/** The spreadsheet window's style toolbar (also the main window's commands). */
export const SHEET_TOOLS = [
  { id: 'bold', icon: 'sheetBold', label: 'sheet.bold', on: (sh, c) => all(sh, c, 'b') },
  { id: 'italic', icon: 'sheetItalic', label: 'sheet.italic', on: (sh, c) => all(sh, c, 'i') },
  { id: 'underline', icon: 'sheetUnderline', label: 'sheet.underline', on: (sh, c) => all(sh, c, 'u') },
  '-',
  { id: 'alignLeft', icon: 'sheetAlignLeft', label: 'sheet.alignLeft', on: (sh, c) => all(sh, c, 'h', 'left') },
  { id: 'alignCenter', icon: 'sheetAlignCenter', label: 'sheet.alignCenter', on: (sh, c) => all(sh, c, 'h', 'center') },
  { id: 'alignRight', icon: 'sheetAlignRight', label: 'sheet.alignRight', on: (sh, c) => all(sh, c, 'h', 'right') },
  { id: 'alignTop', icon: 'sheetAlignTop', label: 'sheet.alignTop', on: (sh, c) => all(sh, c, 'v', 'top') },
  { id: 'alignVCenter', icon: 'sheetAlignVCenter', label: 'sheet.alignVCenter', on: (sh, c) => all(sh, c, 'v', 'middle') },
  { id: 'alignBottom', icon: 'sheetAlignBottom', label: 'sheet.alignBottom', on: (sh, c) => all(sh, c, 'v', 'bottom') },
  '-',
  { id: 'merge', icon: 'sheetMerge', label: 'sheet.merge' },
  { id: 'split', icon: 'sheetSplit', label: 'sheet.split' },
];

export function sheetCommands(app) {
  const hasDoc = () => Boolean(app.activeDoc());
  /** A style tool: to the open spreadsheet window, or the window is opened. */
  const toWindow = (id) => () => {
    if (app.popups.isOpen('spreadsheet')) app.popups.post('spreadsheet', { type: 'sheet:command', id });
    else app.run('spreadsheet');
  };
  return {
    ...Object.fromEntries(SHEET_TOOLS.filter((tool) => tool !== '-').map((tool) => [`sheet:${tool.id}`, { icon: tool.icon, label: tool.label, enabled: hasDoc, run: toWindow(tool.id) }])),
    'sheet:import': { icon: 'sheetImport', label: 'sheet.importCsv', enabled: hasDoc, run: () => app.importSheetCsv() },
    'sheet:export': { icon: 'sheetExport', label: 'sheet.exportCsv', enabled: () => Boolean(app.activeDrawing()?.spreadsheet), run: () => app.openSpreadsheet({ action: 'csv', sheet: app.activeDrawing().spreadsheet }) },
  };
}

export const SHEET_MENU = ['sheet:import', 'sheet:export', '-', ...SHEET_TOOLS.map((tool) => (tool === '-' ? '-' : `sheet:${tool.id}`))];

export const SHEET_FREECAD = {
  Spreadsheet_AlignBottom: 'sheet:alignBottom', Spreadsheet_AlignCenter: 'sheet:alignCenter', Spreadsheet_AlignLeft: 'sheet:alignLeft', Spreadsheet_AlignRight: 'sheet:alignRight',
  Spreadsheet_AlignTop: 'sheet:alignTop', Spreadsheet_AlignVCenter: 'sheet:alignVCenter', Spreadsheet_Export: 'sheet:export', Spreadsheet_Import: 'sheet:import',
  Spreadsheet_MergeCells: 'sheet:merge', Spreadsheet_SplitCell: 'sheet:split', Spreadsheet_StyleBold: 'sheet:bold', Spreadsheet_StyleItalic: 'sheet:italic', Spreadsheet_StyleUnderline: 'sheet:underline',
};
