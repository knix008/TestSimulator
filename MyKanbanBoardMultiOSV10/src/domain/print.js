// Print layout: boards → pages. Columns sit side by side; when a board has more
// columns than fit across the page they continue on the following pages, and
// when cards do not fit down the page the columns continue on the next page.
// All sizes are millimetres.

export const PAPERS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};
export const MARGINS = { narrow: 8, normal: 15, wide: 25 };
export const RANGES = ['all', 'current', 'custom'];

export function defaultPrintOptions() {
  return {
    range: 'current',
    columnIds: null,
    selectedOnly: false,
    paper: 'A4',
    orientation: 'landscape',
    margin: 'normal',
    scale: 100,
    descriptions: true,
    header: true,
    footer: true,
  };
}

export function pageSize(options) {
  const paper = PAPERS[options.paper] ?? PAPERS.A4;
  const landscape = options.orientation === 'landscape';
  return { width: landscape ? paper.height : paper.width, height: landscape ? paper.width : paper.height };
}

const COLUMN_WIDTH = 62;
const GAP = 4;
const HEADER = 12;
const FOOTER = 7;
const COLUMN_HEAD = 9;
const LINE = 4.2;

/** Rough card height: title lines + description lines + meta line. */
export function cardHeight(card, options, width) {
  const scale = options.scale / 100;
  const perLine = Math.max(8, Math.floor((width / scale) / 1.9));
  const lines = (text, limit) => Math.min(limit, String(text ?? '').split('\n').reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)), 0));
  let rows = lines(card.title || ' ', 4);
  if (options.descriptions && card.description) rows += lines(card.description, 6);
  if (card.due || card.assignee || card.tags?.length || card.priority !== 'none' || card.checklist?.length) rows += 1;
  return (rows * LINE + 5) * scale;
}

/** Which boards and cards to print, from the print dialog's range choice. */
export function selectContent(boards, currentIndex, options, selectedIds = []) {
  if (options.range === 'all') return boards;
  const board = boards[currentIndex] ?? boards[0];
  if (!board) return [];
  if (options.range === 'current') return [board];
  const keepColumns = options.columnIds ? new Set(options.columnIds) : null;
  const keepCards = options.selectedOnly ? new Set(selectedIds) : null;
  return [{
    ...board,
    columns: board.columns
      .filter((column) => !keepColumns || keepColumns.has(column.id))
      .map((column) => ({ ...column, cards: keepCards ? column.cards.filter((card) => keepCards.has(card.id)) : column.cards })),
  }];
}

export function paginate(boards, options) {
  const size = pageSize(options);
  const margin = MARGINS[options.margin] ?? MARGINS.normal;
  const scale = options.scale / 100;
  const contentWidth = size.width - margin * 2;
  const contentHeight = size.height - margin * 2 - (options.header ? HEADER : 0) - (options.footer ? FOOTER : 0);
  const columnWidth = COLUMN_WIDTH * scale;
  const perPage = Math.max(1, Math.floor((contentWidth + GAP) / (columnWidth + GAP)));
  const pages = [];

  boards.forEach((board, boardIndex) => {
    const columns = board.columns.length ? board.columns : [{ id: 'empty', title: '', cards: [] }];
    for (let start = 0; start < columns.length; start += perPage) {
      const group = columns.slice(start, start + perPage);
      const cursors = group.map(() => 0);
      let first = true;
      while (first || group.some((column, i) => cursors[i] < column.cards.length)) {
        const page = { board: board.title, boardIndex, columns: [] };
        group.forEach((column, i) => {
          let used = COLUMN_HEAD * scale;
          const cards = [];
          while (cursors[i] < column.cards.length) {
            const card = column.cards[cursors[i]];
            const height = cardHeight(card, options, columnWidth) + 2 * scale;
            // Always place at least one card per page so a very tall card cannot loop forever.
            if (cards.length && used + height > contentHeight) break;
            used += height;
            cards.push(card);
            cursors[i] += 1;
          }
          page.columns.push({ id: column.id, title: column.title, color: column.color, count: column.cards.length, continued: !first, cards });
        });
        pages.push(page);
        first = false;
      }
    }
  });
  pages.forEach((page, index) => { page.number = index + 1; page.total = pages.length; });
  return { pages, size, margin, columnWidth, perPage };
}
