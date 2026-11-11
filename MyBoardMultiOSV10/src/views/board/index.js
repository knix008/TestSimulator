// The board view (views/registry.js): columns × swimlanes of cards, drag and drop, filters, realtime.
// One BoardView instance per mount (views/board/view.js); its commands work on the mounted instance.
import { registerView } from '../registry.js';
import { registerTexts } from '../../i18n.js';
import '../shared/index.js';
import { ko, en } from './texts.js';
import { BoardView } from './view.js';
import { createBoardSidebar } from './sidebar.js';
import { canAddColumn, openAddColumn } from './addcolumn.js';
import './board.css';

registerTexts({ ko, en });

let current = null;
// Quick filters, swimlane mode and the columns: the lower part of the left panel (sidebar.js), same instance.
const side = createBoardSidebar(() => current);

registerView('board', {
  mount(host, ctx) { current?.unmount(); current = new BoardView(host, ctx); current.onSideChange = side.refresh; side.refresh(); },
  update(ctx) { current?.update(ctx); },
  unmount() { current?.unmount(); current = null; side.refresh(); },
  sidebar: side.sidebar,
  commands: {
    createIssue: { icon: 'plus', label: 'action.createIssue', key: 'C', run: () => current?.createIssue() },
    // the main toolbar's "열 추가" (app.js addColumn): only for those who may change the board's columns
    addColumn: { icon: 'columns', label: 'action.addColumn', enabled: () => !current?.data || canAddColumn(current), run: () => current && openAddColumn(current) },
    find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', run: () => current?.focusSearch() },
  },
});

/** The mounted board (tests, other views that want to refresh it). */
export const currentBoard = () => current;
