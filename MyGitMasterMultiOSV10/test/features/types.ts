import type { GitApp } from "../../core/gitApp.js";

/** The scratch environment test/cases.ts prepares (a temp home, a repository, an opened GitApp). */
export type FeatureCtx = { home: string; settingsDir: string; repo: string; app: GitApp; sha: string };
export type AddCase = (group: string, name: string, fn: () => Promise<void>) => void;

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
