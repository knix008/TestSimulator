/**
 * Turns a flat directory comparison into the two trees the view shows.
 *
 * `compareDirectories` reports one entry per relative path. The view needs a folder
 * hierarchy instead, with each folder carrying a rolled-up status so a collapsed
 * branch still says whether anything inside it differs — and both sides need the
 * *same* row list, so the two trees stay level with each other while scrolling.
 */
import type { DirectoryEntry, FileCompareStatus } from "./dirCompare.js";

export type TreeNode = {
  /** Path relative to both roots, forward slashes. */
  rel: string;
  name: string;
  directory: boolean;
  /** For a folder, the roll-up of everything beneath it. */
  status: FileCompareStatus;
  /** Null when this side does not have the entry. */
  left: { size: number | null; modified: number | null } | null;
  right: { size: number | null; modified: number | null } | null;
  children: TreeNode[];
  /** Files beneath this node, for the folder's own counts. */
  fileCount: number;
  /** Where a renamed file went, when the comparison matched it as a rename. */
  renamedTo?: string;
};

export type TreeRow = { node: TreeNode; depth: number; expandable: boolean; expanded: boolean };

export type StatusFilters = Record<FileCompareStatus, boolean>;

export const ALL_STATUSES: StatusFilters = { same: true, different: true, leftOnly: true, rightOnly: true, renamed: true };

export function buildTree(entries: readonly DirectoryEntry[]): TreeNode[] {
  const root: TreeNode = emptyFolder("", "");
  const folders = new Map<string, TreeNode>([["", root]]);

  for (const entry of entries) {
    const parts = entry.rel.split("/");
    const name = parts.pop() as string;
    let parentRel = "";
    let parent = root;
    for (const part of parts) {
      parentRel = parentRel ? `${parentRel}/${part}` : part;
      let folder = folders.get(parentRel);
      if (!folder) {
        folder = emptyFolder(parentRel, part);
        folders.set(parentRel, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({
      rel: entry.rel,
      name,
      directory: false,
      status: entry.status,
      left: entry.status === "rightOnly" ? null : { size: entry.leftSize, modified: entry.leftModified },
      right: entry.status === "leftOnly" ? null : { size: entry.rightSize, modified: entry.rightModified },
      children: [],
      fileCount: 1,
      renamedTo: entry.renamedTo,
    });
  }

  sort(root);
  rollUp(root);
  return root.children;
}

function emptyFolder(rel: string, name: string): TreeNode {
  return { rel, name, directory: true, status: "same", left: null, right: null, children: [], fileCount: 0 };
}

/** Folders first, then files, each alphabetically — the order every file manager uses. */
function sort(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "accent" });
  });
  for (const child of node.children) if (child.directory) sort(child);
}

/**
 * A folder's status is what its contents add up to: unchanged only if everything
 * inside is, present on one side only if everything inside is, otherwise different.
 */
function rollUp(node: TreeNode): FileCompareStatus {
  if (!node.directory) return node.status;

  const seen = new Set<FileCompareStatus>();
  let files = 0;
  let leftPresent = false;
  let rightPresent = false;

  for (const child of node.children) {
    seen.add(rollUp(child));
    files += child.fileCount;
    if (child.left) leftPresent = true;
    if (child.right) rightPresent = true;
  }

  node.fileCount = files;
  node.left = leftPresent ? { size: null, modified: null } : null;
  node.right = rightPresent ? { size: null, modified: null } : null;
  node.status = seen.size === 0 ? "same" : seen.size === 1 ? [...seen][0] : "different";
  return node.status;
}

/**
 * The visible rows, in order.
 *
 * A folder is kept when anything inside it survives the filter, so hiding "identical"
 * does not leave empty folders behind — and a folder whose children are all filtered
 * out disappears with them.
 */
export function flatten(
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string>,
  filters: StatusFilters = ALL_STATUSES,
  search = "",
): TreeRow[] {
  const needle = search.trim().toLowerCase();
  const rows: TreeRow[] = [];

  const visible = (node: TreeNode): boolean => {
    if (node.directory) return node.children.some(visible);
    if (!filters[node.status]) return false;
    return !needle || node.rel.toLowerCase().includes(needle);
  };

  const walk = (list: readonly TreeNode[], depth: number) => {
    for (const node of list) {
      if (!visible(node)) continue;
      const isExpanded = node.directory && expanded.has(node.rel);
      rows.push({ node, depth, expandable: node.directory, expanded: isExpanded });
      if (isExpanded) walk(node.children, depth + 1);
    }
  };

  walk(nodes, 0);
  return rows;
}

/** Every folder path in the tree — what "expand all" starts from. */
export function allFolders(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      if (!node.directory) continue;
      out.push(node.rel);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** Folders containing a difference, so the tree can open straight onto the changes. */
export function foldersWithDifferences(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      if (!node.directory) continue;
      if (node.status !== "same") out.push(node.rel);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Every file in one list, with its whole relative path as its name.
 *
 * A tree is the right shape for browsing; a flat list is the right shape for seeing
 * how many files differ and where, without expanding anything. It is a separate
 * function rather than a flag on `flatten` because nothing about it is recursive —
 * there are no folders to roll up and nothing to expand.
 */
export function flatRows(
  entries: readonly DirectoryEntry[],
  filters: StatusFilters = ALL_STATUSES,
  search = "",
): TreeRow[] {
  const needle = search.trim().toLowerCase();
  return entries
    .filter((entry) => filters[entry.status])
    .filter((entry) => !needle || entry.rel.toLowerCase().includes(needle))
    .sort((a, b) => a.rel.localeCompare(b.rel, undefined, { sensitivity: "accent" }))
    .map((entry) => ({
      node: {
        rel: entry.rel,
        name: entry.rel,
        directory: false,
        status: entry.status,
        left: entry.leftSize === null && entry.leftModified === null
          ? null
          : { size: entry.leftSize ?? 0, modified: entry.leftModified ?? 0 },
        right: entry.rightSize === null && entry.rightModified === null
          ? null
          : { size: entry.rightSize ?? 0, modified: entry.rightModified ?? 0 },
        renamedTo: entry.renamedTo,
        children: [],
        fileCount: 1,
      },
      depth: 0,
      expandable: false,
      expanded: false,
    }));
}
