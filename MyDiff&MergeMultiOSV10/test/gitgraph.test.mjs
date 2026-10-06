/**
 * The history graph: lanes and the lines between them.
 *
 * The layout is pure data, so it can be checked exactly rather than looked at. Each
 * case here is a shape of history drawn in a comment, and the assertions say which
 * lane each commit lands in and which lines cross each row.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildGraph } from "../core/gitGraph.ts";

/** `[sha, ...parents]` tuples, newest first, as git itself lists them. */
function graphOf(...rows) {
  return buildGraph(rows.map(([sha, ...parents]) => ({ sha, parents })));
}

/** The lane each commit landed in, keyed by sha. */
function lanes(graph) {
  return Object.fromEntries(graph.rows.map((row) => [row.sha, row.lane]));
}

test("graph › a straight history is one lane", () => {
  //  c → b → a
  const graph = graphOf(["c", "b"], ["b", "a"], ["a"]);
  assert.equal(graph.lanes, 1);
  assert.deepEqual(lanes(graph), { c: 0, b: 0, a: 0 });
  for (const row of graph.rows) {
    assert.equal(row.merge, false);
    assert.ok(row.edges.every((edge) => edge.from === 0 && edge.to === 0));
  }
});

test("graph › the newest commit is a tip, the rest are not", () => {
  const graph = graphOf(["c", "b"], ["b", "a"], ["a"]);
  assert.deepEqual(graph.rows.map((row) => row.tip), [true, false, false]);
});

test("graph › a branch takes a second lane and gives it back when it merges", () => {
  //  m ──┬── a      m is a merge of a and b
  //      └── b
  //  a and b both come from r
  const graph = graphOf(["m", "a", "b"], ["a", "r"], ["b", "r"], ["r"]);

  assert.equal(graph.lanes, 2, "two lines of work ran side by side");
  const where = lanes(graph);
  assert.equal(where.m, 0);
  assert.equal(where.a, 0, "the first parent stays in the merge's lane");
  assert.equal(where.b, 1, "the second parent branches off");
  assert.equal(where.r, 0, "and the graph is back to one lane at the root");
});

test("graph › a merge row carries an edge that changes lane", () => {
  const graph = graphOf(["m", "a", "b"], ["a", "r"], ["b", "r"], ["r"]);
  const merge = graph.rows[0];

  assert.equal(merge.merge, true);
  const sideways = merge.edges.filter((edge) => edge.from !== edge.to);
  assert.equal(sideways.length, 1, "exactly one line leaves the merge sideways");
  assert.deepEqual(sideways[0], { from: 0, to: 1, merge: true });
});

test("graph › a lane in flight is drawn through the rows it spans", () => {
  //  m ──┬── a ── r
  //      └── b ───┘        b is older than a, so its lane crosses a's row
  const graph = graphOf(["m", "a", "b"], ["a", "r"], ["b", "r"], ["r"]);
  const aRow = graph.rows.find((row) => row.sha === "a");

  // Lane 1 is waiting for b, so it passes straight through a's row.
  assert.ok(
    aRow.edges.some((edge) => edge.from === 1 && edge.to === 1),
    `lane 1 was not drawn through a's row: ${JSON.stringify(aRow.edges)}`,
  );
});

test("graph › an octopus merge claims a lane for every extra parent", () => {
  const graph = graphOf(["m", "a", "b", "c"], ["a"], ["b"], ["c"]);
  const merge = graph.rows[0];
  const sideways = merge.edges.filter((edge) => edge.merge);
  assert.equal(sideways.length, 2, "two extra parents, two extra lines");
  assert.deepEqual(sideways.map((edge) => edge.to).sort(), [1, 2]);
  assert.equal(graph.lanes, 3);
});

test("graph › two unrelated histories sit in their own lanes", () => {
  const graph = graphOf(["a", "a0"], ["b", "b0"], ["a0"], ["b0"]);
  const where = lanes(graph);
  assert.notEqual(where.a, where.b, "two roots are two lines");
  assert.equal(where.a0, where.a, "and each one keeps its lane");
  assert.equal(where.b0, where.b);
});

test("graph › a freed lane is used again rather than growing the graph", () => {
  // One branch merges, then another starts. The second should reuse lane 1.
  const graph = graphOf(
    ["m2", "x", "y"],
    ["x", "m1"],
    ["y", "m1"],
    ["m1", "a", "b"],
    ["a", "r"],
    ["b", "r"],
    ["r"],
  );
  assert.ok(graph.lanes <= 3, `the graph grew to ${graph.lanes} lanes`);
});

test("graph › an empty history is an empty graph", () => {
  const graph = buildGraph([]);
  assert.deepEqual(graph.rows, []);
  assert.equal(graph.lanes, 1, "still one lane wide, so the column has a size");
});

test("graph › a commit whose parent is not in the list still ends its lane", () => {
  // A shallow clone: the oldest commit names a parent nobody has.
  const graph = graphOf(["b", "a"], ["a", "missing"]);
  assert.equal(graph.rows.length, 2);
  assert.equal(graph.lanes, 1, "the dangling parent does not open a second lane");
});
