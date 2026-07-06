import { t } from '../i18n/index.js';

const MAX_ROWS = 8;
const MAX_COLS = 8;

let activePopup = null;

function closeActivePopup() {
  if (!activePopup) {
    return;
  }
  activePopup.root.remove();
  document.removeEventListener('mousedown', activePopup.onMouseDown, true);
  document.removeEventListener('keydown', activePopup.onKeyDown, true);
  activePopup = null;
}

function positionPopup(root, { anchor, x, y }) {
  const margin = 8;
  root.style.position = 'fixed';
  root.style.visibility = 'hidden';
  document.body.appendChild(root);
  const rect = root.getBoundingClientRect();

  let left;
  let top;
  if (anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    left = anchorRect.left - rect.width - 8;
    top = anchorRect.top - 4;
  } else if (Number.isFinite(x) && Number.isFinite(y)) {
    left = x - rect.width / 2;
    top = y + 12;
  } else {
    left = (window.innerWidth - rect.width) / 2;
    top = (window.innerHeight - rect.height) / 2;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.visibility = '';
}

export function showTableInsertPopup(options = {}) {
  closeActivePopup();

  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'table-insert-popup';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t.tableInsertTitle);

    const label = document.createElement('div');
    label.className = 'table-insert-label';
    label.textContent = t.tableInsertHint;

    const grid = document.createElement('div');
    grid.className = 'table-insert-grid';
    grid.style.setProperty('--table-grid-cols', String(MAX_COLS));
    grid.style.setProperty('--table-grid-rows', String(MAX_ROWS));

    let hoverRows = 0;
    let hoverCols = 0;

    const cells = [];
    for (let row = 1; row <= MAX_ROWS; row += 1) {
      for (let col = 1; col <= MAX_COLS; col += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'table-insert-cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.addEventListener('mouseenter', () => {
          hoverRows = row;
          hoverCols = col;
          updateSelection();
        });
        cell.addEventListener('click', (event) => {
          event.preventDefault();
          finish({ rows: row, cols: col });
        });
        cells.push(cell);
        grid.appendChild(cell);
      }
    }

    function updateSelection() {
      label.textContent =
        hoverRows > 0 && hoverCols > 0
          ? t.tableInsertSizeFormat(hoverRows, hoverCols)
          : t.tableInsertHint;
      for (const cell of cells) {
        const row = Number.parseInt(cell.dataset.row, 10);
        const col = Number.parseInt(cell.dataset.col, 10);
        cell.classList.toggle('is-selected', row <= hoverRows && col <= hoverCols);
      }
    }

    function finish(value) {
      closeActivePopup();
      resolve(value);
    }

    grid.addEventListener('mouseleave', () => {
      hoverRows = 0;
      hoverCols = 0;
      updateSelection();
    });

    root.append(label, grid);
    positionPopup(root, options);

    const onMouseDown = (event) => {
      if (!root.contains(event.target)) {
        finish(null);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        finish(null);
      }
    };

    activePopup = { root, onMouseDown, onKeyDown };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  });
}
