/**
 * Noticing that what a tab compares has changed on disk.
 *
 * The renderer asks every second or so, naming the sessions its tabs hold; the
 * answer is the ones whose files moved on since they were last read, and the tab
 * then compares again. Nothing is re-read here — this only says *whether* to.
 *
 * A file comparison is cheap to check directly: a stat of each side against the
 * size and time it was read with. A folder comparison is not — a walk is the very
 * cost this saves — so its roots are watched instead, and any event under them
 * marks it. Watchers belong to the sessions named in the last request, so closing a
 * tab is what lets its watcher go.
 */
import fs from "node:fs";

export type FileSnapshot = { path: string; size: number; modified: number };

type FolderWatch = {
  roots: string;
  watchers: fs.FSWatcher[];
  changed: boolean;
  /** Our own copy or sync re-read the folders; events until then are its echo. */
  quietUntil: number;
};

/** After a re-read the watcher still delivers the events of the writes behind it. */
const ECHO_MS = 1200;

export class ChangeWatch {
  private readonly folders = new Map<string, FolderWatch>();

  /** True when either file differs from what was read — written, replaced or removed. */
  filesChanged(sides: readonly FileSnapshot[]): boolean {
    return sides.some((side) => {
      try {
        const stat = fs.statSync(side.path);
        return stat.size !== side.size || stat.mtimeMs !== side.modified;
      } catch {
        return true;
      }
    });
  }

  /**
   * Whether anything changed under these folder comparisons since they were read,
   * and stops watching the ones no longer asked about.
   */
  foldersChanged(sessions: ReadonlyMap<string, readonly string[]>): string[] {
    for (const [id, watch] of this.folders) {
      if (!sessions.has(id)) this.drop(id, watch);
    }
    const changed: string[] = [];
    for (const [id, roots] of sessions) {
      const key = roots.join("\n");
      let watch = this.folders.get(id);
      if (watch && watch.roots !== key) {
        this.drop(id, watch);
        watch = undefined;
      }
      if (!watch) {
        watch = this.watch(roots);
        this.folders.set(id, watch);
      }
      if (watch.changed) changed.push(id);
    }
    return changed;
  }

  /** A folder comparison was just re-read: what it shows is current again. */
  settled(id: string): void {
    const watch = this.folders.get(id);
    if (!watch) return;
    watch.changed = false;
    watch.quietUntil = Date.now() + ECHO_MS;
  }

  close(): void {
    for (const [id, watch] of this.folders) this.drop(id, watch);
  }

  private watch(roots: readonly string[]): FolderWatch {
    const watch: FolderWatch = { roots: roots.join("\n"), watchers: [], changed: false, quietUntil: 0 };
    const mark = () => {
      if (Date.now() >= watch.quietUntil) watch.changed = true;
    };
    for (const root of roots) {
      try {
        const watcher = fs.watch(root, { recursive: true, persistent: false }, mark);
        // A root deleted or unplugged ends the watch with an error; the comparison
        // is then out of date, which is exactly what Refresh will show.
        watcher.on("error", () => {
          watch.changed = true;
          watcher.close();
        });
        watch.watchers.push(watcher);
      } catch {
        // Not a local folder (a server address) or not there: nothing to watch.
      }
    }
    return watch;
  }

  private drop(id: string, watch: FolderWatch): void {
    for (const watcher of watch.watchers) watcher.close();
    this.folders.delete(id);
  }
}
