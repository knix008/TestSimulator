// A workspace: every open tab in one file.
//
// A project file (`.mdprj`) holds one schema, and that stays true — it is the
// format DBToolsWinV10 reads. This is a separate, additive format that records
// what was open: the schemas themselves, where each came from, and which tab
// was in front. Reopening it puts the session back as it was.
import type { DbSchema } from '../types';
import { cloneSchema, ensureInitialized } from './schema';
import { deserialize, serializeToString } from './serializer';

export const WORKSPACE_EXTENSION = 'mdwsp';
export const WORKSPACE_VERSION = 1;

export interface WorkspaceEntry {
  /** Where the schema was last saved, or null for one that has no file yet. */
  path: string | null;
  schema: DbSchema;
}

export interface Workspace {
  version: number;
  activeIndex: number;
  entries: WorkspaceEntry[];
}

interface StoredEntry {
  Path: string | null;
  /** The schema as a project document, so one entry is exactly one `.mdprj`. */
  Schema: unknown;
}

interface StoredWorkspace {
  Version: number;
  ActiveIndex: number;
  Documents: StoredEntry[];
}

export function isWorkspaceFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(`.${WORKSPACE_EXTENSION}`);
}

/**
 * Serialize the open tabs. Each schema goes through the project serializer, so
 * a workspace entry and a `.mdprj` file describe a document the same way and
 * neither can drift from the other.
 */
export function serializeWorkspace(workspace: Workspace): string {
  const stored: StoredWorkspace = {
    Version: WORKSPACE_VERSION,
    ActiveIndex: clampIndex(workspace.activeIndex, workspace.entries.length),
    Documents: workspace.entries.map((entry) => ({
      Path: entry.path,
      Schema: JSON.parse(serializeToString(entry.schema)),
    })),
  };
  return JSON.stringify(stored, null, 2);
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), length - 1);
}

/**
 * Read a workspace back. Throws when the file is not one — the caller reports
 * that rather than opening a window full of nothing.
 */
export function deserializeWorkspace(text: string): Workspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(text));
  } catch {
    throw new Error('작업 공간 파일을 읽을 수 없습니다: JSON 형식이 아닙니다.');
  }

  const stored = parsed as Partial<StoredWorkspace> | null;
  if (!stored || !Array.isArray(stored.Documents)) {
    throw new Error('작업 공간 파일이 아닙니다.');
  }

  const entries: WorkspaceEntry[] = [];
  for (const document of stored.Documents) {
    if (!document || typeof document !== 'object') continue;
    // A single unreadable tab should not cost the whole session.
    try {
      const schema = deserialize(JSON.stringify((document as StoredEntry).Schema));
      ensureInitialized(schema);
      entries.push({
        path: typeof (document as StoredEntry).Path === 'string' ? (document as StoredEntry).Path : null,
        schema,
      });
    } catch {
      continue;
    }
  }

  if (entries.length === 0) throw new Error('작업 공간에 열 수 있는 스키마가 없습니다.');

  return {
    version: typeof stored.Version === 'number' ? stored.Version : WORKSPACE_VERSION,
    activeIndex: clampIndex(stored.ActiveIndex ?? 0, entries.length),
    entries,
  };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** A workspace built from the documents currently open. */
export function buildWorkspace(
  documents: { path: string | null; schema: DbSchema }[],
  activeIndex: number,
): Workspace {
  return {
    version: WORKSPACE_VERSION,
    activeIndex: clampIndex(activeIndex, documents.length),
    entries: documents.map((d) => ({ path: d.path, schema: cloneSchema(d.schema) })),
  };
}
