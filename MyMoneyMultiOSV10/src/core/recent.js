export class RecentFiles {
  constructor(max = 10) {
    this.max = max;
    this.items = [];
  }

  add(filePath) {
    if (!filePath) return;
    this.items = [filePath, ...this.items.filter((item) => item !== filePath)].slice(0, this.max);
  }

  remove(filePath) {
    this.items = this.items.filter((item) => item !== filePath);
  }

  clear() {
    this.items = [];
  }

  load(items) {
    this.items = Array.isArray(items) ? items.filter(Boolean).slice(0, this.max) : [];
  }

  toJSON() {
    return [...this.items];
  }
}
