// Model-check fixtures for the BIM element rules (src/core/elements/check.js):
// for each code [a project that raises it, a near miss that does not].
// check.test.mjs merges them into its FIXTURES.

import { normalizeProject } from "../../src/core/project.js";

const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

export function elementFixtures(project) {
  const withEls = (els, opts = {}) => {
    const p = project(opts);
    for (const [k, list] of Object.entries(els)) p[k] = list.map((it) => ({ level: "L", ...it }));
    return normalizeProject(p);
  };
  return {
    "slab-overlap": () => [
      withEls({ slabs: [{ id: "a", pts: rect(0, 0, 4000, 4000) }, { id: "b", pts: rect(3000, 0, 7000, 4000) }] }),
      withEls({ slabs: [{ id: "a", pts: rect(0, 0, 4000, 4000) }, { id: "b", pts: rect(4000, 0, 8000, 4000) }] }),
    ],
    "slab-hole": () => [
      withEls({ slabs: [{ id: "a", pts: rect(0, 0, 4000, 4000), holes: [rect(3500, 1000, 4500, 2000)] }] }),
      withEls({ slabs: [{ id: "a", pts: rect(0, 0, 4000, 4000), holes: [rect(2500, 1000, 3500, 2000)] }] }),
    ],
    "beam-short": () => [
      withEls({ beams: [{ id: "b", x1: 0, y1: 0, x2: 400, y2: 0, w: 300, h: 600 }] }),
      withEls({ beams: [{ id: "b", x1: 0, y1: 0, x2: 4000, y2: 0, w: 300, h: 600 }] }),
    ],
    "railing-low": () => [
      withEls({ railings: [{ id: "r", pts: [[0, 0], [3000, 0]], height: 700 }] }),
      withEls({ railings: [{ id: "r", pts: [[0, 0], [3000, 0]], height: 1000 }] }),
    ],
    "ramp-steep": () => [
      withEls({ ramps: [{ id: "r", pts: [[0, 0], [3000, 0]], width: 1500, rise: 600 }] }),
      withEls({ ramps: [{ id: "r", pts: [[0, 0], [7200, 0]], width: 1500, rise: 600 }] }),
    ],
    "stair-riser": () => [
      withEls({ stairs: [{ id: "s", x: 0, y: 0, rot: 0, length: 3000, width: 1000, steps: 10, shape: "U" }] }, { twoLevels: true }),
      withEls({ stairs: [{ id: "s", x: 0, y: 0, rot: 0, length: 3000, width: 1000, steps: 16, shape: "U" }] }, { twoLevels: true }),
    ],
    "shaft-empty": () => [
      withEls({ shafts: [{ id: "h", pts: rect(0, 0, 1000, 1000) }] }),
      withEls({ shafts: [{ id: "h", pts: rect(0, 0, 1000, 1000) }], slabs: [{ id: "a", pts: rect(-1000, -1000, 4000, 4000) }] }),
    ],
  };
}
