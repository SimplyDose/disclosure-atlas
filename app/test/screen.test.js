import test from "node:test";
import assert from "node:assert/strict";
import { avgRanks, spearmanRho, spearmanP, bonferroni, bhQ, enumerateFamily, runFamily } from "../src/screen.js";

const close = (actual, expected, tolerance = 1e-12) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`,
);

test("fractional ranks and tied Spearman match independent SciPy answers", () => {
  assert.deepEqual(avgRanks([9, 1, 5, 1]), [4, 1.5, 3, 1.5]);
  const rho = spearmanRho([1, 2, 2, 4, 5], [5, 2, 3, 1, 4]);
  // scipy.stats.spearmanr, SciPy 1.18.0; fixed inputs, not production-generated expectations.
  close(rho, -0.35909242322980395);
  close(spearmanP(rho, 5), 0.5528147466433508);
  assert.equal(spearmanRho([1, 1, 1], [1, 2, 3]), null);
  assert.equal(spearmanRho([1, 2], [2, 1]), null);
});

test("two-sided rank-correlation p-values match independent Student-t calculations", () => {
  for (const [rho, n, p] of [
    [0.5, 30, 0.004899933667068084],
    [-0.2, 80, 0.07528590914058637],
    [0, 30, 1],
    [0.95, 5, 0.01332001101014125],
    [0.05980079876141766, 1120, 0.045406012627762796],
  ]) close(spearmanP(rho, n), p);
  assert.equal(spearmanP(1, 30), 0);
  assert.equal(spearmanP(-1, 30), 0);
  assert.equal(spearmanP(null, 30), null);
  assert.equal(spearmanP(0.5, 3), null);
});

test("whole-family corrections preserve original order and enforce BH monotonicity", () => {
  // Sorted p: .002, .01, .03, .04. BH adjusted: .008, .02, .04, .04.
  const p = [0.01, 0.04, 0.03, 0.002];
  const expectedBH = [0.02, 0.04, 0.04, 0.008];
  bhQ(p).forEach((q, i) => close(q, expectedBH[i]));
  assert.deepEqual(bonferroni(p), [0.04, 0.16, 0.12, 0.008]);
  assert.deepEqual(bhQ([0, 1, 0.5]), [0, 1, 0.75]);
  assert.deepEqual(bhQ([]), []);
  assert.deepEqual(bonferroni([]), []);
  assert.deepEqual(p, [0.01, 0.04, 0.03, 0.002]);
});

test("family eligibility drops missing pairs, preserves zero, and reports exclusions", () => {
  const rows = [
    { x: 0, y: 5, z: 1 }, { x: 1, y: 2, z: 1 }, { x: 2, y: 3, z: 1 },
    { x: 3, y: 1, z: 1 }, { x: null, y: 4, z: 1 }, { x: 9, y: NaN, z: 1 },
  ];
  const A = [{ key: "x", label: "X", get: r => r.x }];
  const B = [{ key: "y", label: "Y", get: r => r.y }, { key: "z", label: "Z", get: r => r.z }];
  const f = enumerateFamily(rows, A, B, [], 4);
  assert.equal(f.included.length, 1);
  assert.equal(f.included[0].n, 4);
  assert.deepEqual(f.included[0].xs, [0, 1, 2, 3]);
  assert.equal(f.excluded.length, 1);
  assert.equal(f.excluded[0].reason, "constant values (no variation)");
  const small = enumerateFamily(rows, A, B, [], 6);
  assert.equal(small.included.length, 0);
  assert.equal(small.excluded.length, 2);
  assert.ok(small.excluded.every(t => t.reason === "pairwise N < 6"));
});

test("screen runner reports every eligible test and corrects the complete family", async () => {
  const xs = [1, 2, 2, 4, 5], ys = [5, 2, 3, 1, 4];
  const included = [
    { a: "x", b: "y", dim: "full", group: "full", n: 5, xs, ys },
    { a: "x", b: "x", dim: "full", group: "full", n: 5, xs, ys: xs },
  ];
  const result = await runFamily(included);
  assert.equal(result.length, 2);
  close(result[0].p, 0.5528147466433508);
  assert.equal(result[0].pBonf, 1);
  close(result[0].q, 0.5528147466433508);
  assert.equal(result[0].fdr, false);
  assert.equal(result[1].p, 0);
  assert.equal(result[1].fdr, true);
  assert.equal(result[1].bonf, true);
});
