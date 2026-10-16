// Task Sheet and Resource Sheet: the table alone, full width.
import { Grid } from '../ui/grid.js';

export class TaskSheetView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('sheet-view');
    host.innerHTML = '<div class="sheet-table"></div>';
    this.grid = new Grid(host.querySelector('.sheet-table'), app.taskGridOptions({ onScroll: (top) => { app.doc().view.scrollTop = top; } }));
  }

  render() {
    this.grid.render();
    this.grid.body.scrollTop = this.app.doc().view.scrollTop ?? 0;
  }

  update() { this.grid.update(); }
  selectionChanged() { this.grid.drawRows(); }

  scrollToTask(id) {
    const index = this.grid.list.findIndex((row) => row.id === id);
    if (index >= 0) this.grid.scrollToIndex(index);
  }

  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}

export class ResourceSheetView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('sheet-view', 'resource-sheet');
    host.innerHTML = '<div class="sheet-table"></div>';
    this.grid = new Grid(host.querySelector('.sheet-table'), app.resourceGridOptions());
  }

  render() { this.grid.render(); }
  update() { this.grid.update(); }
  selectionChanged() { this.grid.drawRows(); }
  scrollToTask() {}
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}
