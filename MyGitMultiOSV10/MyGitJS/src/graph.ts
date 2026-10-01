export type GraphCommit = { sha: string; parents: string[] };

export type GraphRow = {
  sha: string;
  lane: number;
  passThrough: number[];
  forks: number[];
  merges: number[];
  continuesDown: boolean;
};

/** Lane layout ported from the WinForms CommitGraphBuilder. */
export function buildGraph(commits: GraphCommit[]): GraphRow[] {
  const rows: GraphRow[] = [];
  const active: (string | null)[] = [];

  for (const commit of commits) {
    let lane = active.findIndex((item) => item === commit.sha);
    if (lane < 0) lane = active.findIndex((item) => item === null);
    if (lane < 0) {
      lane = active.length;
      active.push(null);
    }

    for (let index = 0; index < active.length; index++) {
      if (index !== lane && active[index] === commit.sha) active[index] = null;
    }

    const parents = commit.parents;
    const forks: number[] = [];
    const merges: number[] = [];
    if (parents.length > 1) {
      for (let parentIndex = 1; parentIndex < parents.length; parentIndex++) {
        const parentLane = active.findIndex((item) => item === parents[parentIndex]);
        if (parentLane >= 0 && parentLane !== lane) merges.push(parentLane);
      }
    }

    const passThrough: number[] = [];
    for (let index = 0; index < active.length; index++) {
      if (index !== lane && active[index] !== null) passThrough.push(index);
    }

    if (parents.length > 0) {
      active[lane] = parents[0];
      for (let parentIndex = 1; parentIndex < parents.length; parentIndex++) {
        const parentSha = parents[parentIndex];
        let parentLane = active.findIndex((item) => item === parentSha);
        if (parentLane < 0) {
          parentLane = active.findIndex((item) => item === null);
          if (parentLane < 0) {
            parentLane = active.length;
            active.push(null);
          }
          forks.push(parentLane);
        }
        active[parentLane] = parentSha;
      }
    } else {
      active[lane] = null;
    }

    while (active.length > 0 && active[active.length - 1] === null) active.pop();
    rows.push({
      sha: commit.sha,
      lane,
      passThrough,
      forks,
      merges,
      continuesDown: parents.length > 0,
    });
  }

  return rows;
}

export function buildFlat(commits: GraphCommit[]): GraphRow[] {
  return commits.map((commit, index) => ({
    sha: commit.sha,
    lane: 0,
    passThrough: [],
    forks: [],
    merges: [],
    continuesDown: index < commits.length - 1,
  }));
}
