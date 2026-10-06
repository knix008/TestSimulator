/**
 * The shape of a history: which commit sits in which lane, and what joins them.
 *
 * A list of commits in date order says nothing about how they relate. The graph is
 * what shows that two lines of work ran side by side and then came back together —
 * and since every commit already knows its parents, the whole thing can be worked
 * out here, as data, with no drawing involved. The view turns the lanes and edges
 * into lines; this decides what they are.
 *
 * The algorithm is the usual one. Walk newest to oldest holding a set of lanes,
 * each waiting for a particular commit. A commit takes the lane that was waiting
 * for it (or a free one, if it is the tip of something), its first parent inherits
 * that lane, and any further parents — a merge — claim lanes of their own. A lane
 * whose commit has been reached and whose work is done is freed for reuse, which is
 * what keeps a long history from fanning out across the screen.
 */

export type GraphCommit = {
  sha: string;
  parents: string[];
};

/** One row of the drawing. */
export type GraphRow = {
  sha: string;
  /** Which lane the commit's dot sits in. */
  lane: number;
  /**
   * The lines crossing this row, each from a lane at the top edge to a lane at the
   * bottom edge. A line that goes straight down has `from === to`.
   */
  edges: GraphEdge[];
  /** True when this commit has more than one parent. */
  merge: boolean;
  /** True when nothing in the list claims this commit as a parent. */
  tip: boolean;
};

export type GraphEdge = {
  from: number;
  to: number;
  /** True when the line is the second or later parent of a merge. */
  merge: boolean;
};

export type Graph = {
  rows: GraphRow[];
  /** The widest the graph ever gets, which is what the column has to be. */
  lanes: number;
};

/** Beyond this the drawing is noise, so lanes are reused more aggressively. */
const MAX_LANES = 12;

export function buildGraph(commits: readonly GraphCommit[]): Graph {
  // Which commits are somebody's parent — the rest are tips.
  const claimed = new Set<string>();
  for (const commit of commits) {
    for (const parent of commit.parents) claimed.add(parent);
  }

  /** `lanes[i]` is the sha that lane `i` is waiting for, or null when it is free. */
  const lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let widest = 1;

  const reserve = (sha: string): number => {
    const existing = lanes.indexOf(sha);
    if (existing >= 0) return existing;
    const free = lanes.indexOf(null);
    if (free >= 0) {
      lanes[free] = sha;
      return free;
    }
    if (lanes.length >= MAX_LANES) {
      // Out of room: share the last lane rather than growing without limit. The
      // drawing is then approximate at the far right, which is better than a graph
      // too wide to read.
      lanes[MAX_LANES - 1] = sha;
      return MAX_LANES - 1;
    }
    lanes.push(sha);
    return lanes.length - 1;
  };

  for (const commit of commits) {
    // The lane this commit occupies: whichever was waiting for it, or a new one.
    const lane = reserve(commit.sha);

    // Everything else that is still waiting carries straight on through this row.
    const edges: GraphEdge[] = [];
    for (let index = 0; index < lanes.length; index++) {
      if (index === lane || lanes[index] === null) continue;
      edges.push({ from: index, to: index, merge: false });
    }

    // The first parent inherits this lane; the rest branch off to their own.
    const [first, ...others] = commit.parents;
    lanes[lane] = first ?? null;
    if (first) edges.push({ from: lane, to: lane, merge: false });

    for (const parent of others) {
      const target = reserve(parent);
      edges.push({ from: lane, to: target, merge: true });
    }

    // A lane at the end of the list that is waiting for nothing is dropped, so the
    // graph narrows again once a branch has been merged in.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

    widest = Math.max(widest, lanes.length, lane + 1);
    rows.push({
      sha: commit.sha,
      lane,
      edges,
      merge: commit.parents.length > 1,
      tip: !claimed.has(commit.sha),
    });
  }

  return { rows, lanes: widest };
}
