import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Constellation } from '../src/constellation.js';
import { Panel } from '../src/panel.js';

const data = Object.fromEntries(['nodes', 'neighbors', 'findings'].map((name) =>
  [name, JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)))]));
function engine(nodes = data.nodes, neighbors = data.neighbors, findings = data.findings) {
  const e = Object.create(Constellation.prototype);
  Object.assign(e, { nodes, neighbors, findings, filter: { sim: 0 }, bounds: { cx: 0, cy: 0 },
    heroCam: { zoom: 1 }, cssW: 100, cssH: 100, onSelect: (f) => { e.result = f; }, _flyToNode() {}, _flyTo() {} });
  return e;
}

test('featured comparison uses its recorded cosine without changing nearest-neighbor ranks', () => {
  const e = engine();
  e.selectPair(64142, 133327);
  assert.equal(e.result.score, 0.9629);
  assert.deepEqual(e.result.neighbors.map((n) => [n.idx, n.score]), data.neighbors[64142]);
  assert.equal(e.result.neighbors[0].score, 0.9799);
});

test('all retained featured pairs retain recorded scores and the ranked list', () => {
  assert.equal(data.findings.length, 17);
  const e = engine();
  for (const f of data.findings) {
    e.selectPair(f.qi, f.mi);
    assert.ok(Math.abs(e.result.score - f.similarity) < 0.00005, `${f.qi}/${f.mi}`);
    assert.deepEqual(e.result.neighbors.map((n) => [n.idx, n.score]), data.neighbors[f.qi]);
  }
});

const fixtureNodes = [0, 1, 2, 3].map((i) => ({ i, name: `Company ${i}`, cik: String(i).padStart(10, '0'), t: 0, x: i, y: i, url: `https://www.sec.gov/${i}` }));
const fixtureNeighbors = [[[1, 0.8], [2, 0]], [[0, 0.8]], [], []];

test('ordinary selection, zero score, and changing ranked match retain recorded values', () => {
  const e = engine(fixtureNodes, fixtureNeighbors, []);
  e.selectIndex(0);
  assert.equal(e.result.match.idx, 1);
  assert.equal(e.result.score, 0.8);
  assert.equal(e.result.matchRank, 1);
  assert.equal(e.setMatch(2), true);
  assert.equal(e.result.score, 0);
  assert.equal(e.result.matchRank, 2);
  assert.equal(e.setMatch(3), false);
  assert.equal(e.result.match.idx, 2);
});

test('unknown selected pair remains unranked and unscored, never an estimated cosine', () => {
  const e = engine(fixtureNodes, fixtureNeighbors, []);
  e.selectPair(0, 3);
  assert.equal(e.result.score, null);
  assert.equal(e.result.matchRank, null);
  assert.deepEqual(e.result.neighbors.map((n) => n.idx), [1, 2]);
  e.setFilter({ sim: 0.9 });
  assert.equal(e.result.score, null);
  assert.deepEqual(e.result.neighbors, []);
});

test('a reverse neighbor score is usable without inventing a forward rank', () => {
  const e = engine(fixtureNodes, [[], [[0, 0.8]], [], []], []);
  e.selectPair(0, 1);
  assert.equal(e.result.score, 0.8);
  assert.equal(e.result.matchRank, null);
  assert.deepEqual(e.result.neighbors, []);
});

test('invalid indices, self links, empty neighbor lists and empty pasted results are safe', () => {
  const e = engine(fixtureNodes, fixtureNeighbors, []);
  assert.equal(e.selectPair(-1, 0), false);
  assert.equal(e.selectPair(0, 99), false);
  assert.equal(e.selectPair(0.5, 1), false);
  e.selectPair(0, 0);
  assert.equal(e.result.match.idx, 1);
  e.selectIndex(3);
  assert.equal(e.result.query.idx, 3);
  assert.equal(e.result.match.idx, 3);
  assert.equal(e.result.score, null);
  assert.deepEqual(e.result.neighbors, []);
  assert.equal(e.selectVirtual([], 'empty', ''), false);
  assert.equal(e.result.query.idx, 3);
});

test('pasted-query scores and ranks remain calculated by the existing search path', () => {
  const e = engine(fixtureNodes, fixtureNeighbors, []);
  e.selectVirtual([[2, 0.95], [1, 0.9]], 'Pasted', 'Example disclosure');
  assert.equal(e.result.virtual, true);
  assert.equal(e.result.score, 0.95);
  assert.equal(e.result.matchRank, 1);
  assert.equal(e.result.query.excerpt, 'Example disclosure');
  e.setMatch(1);
  assert.equal(e.result.score, 0.9);
  assert.equal(e.result.matchRank, 2);
});

function panel(nodes = data.nodes) {
  const p = Object.create(Panel.prototype);
  const scoreElement = { textContent: '', addEventListener() {} };
  const body = { innerHTML: '', querySelectorAll: () => [], querySelector: (selector) => selector === '#scoreBig' ? scoreElement : { addEventListener() {} } };
  Object.assign(p, { nodes, featured: {}, excerpts: {}, aaer: {}, caveats: {}, body, reduced: true, showBaseline: false });
  return { p, scoreElement };
}

test('panel, citation and export distinguish selected comparison from ranked neighbors', () => {
  const e = engine(); e.selectPair(64142, 133327);
  const { p, scoreElement } = panel();
  globalThis.cancelAnimationFrame = () => {};
  p.render(e.result);
  assert.equal(scoreElement.textContent, '0.9629');
  assert.match(p.body.innerHTML, /SELECTED COMPARISON/);
  assert.match(p._citation(e.result), /Selected comparison:.*\nDisclosure-language similarity.*0\.9629/);
  assert.doesNotMatch(p._citation(e.result), /Nearest match:/);
  const rows = p._findingRows(e.result);
  assert.equal(rows[1][0], 'selected');
  assert.equal(rows[1][10], '0.9629');
  assert.equal(rows[2][0], '01');
  assert.equal(rows[2][10], '0.9799');
  assert.match(p._explanation(e.result).text, /outside this query's precomputed top ten/);
});

test('unknown-pair panel, citation and export show unavailable without zero or fake precision', () => {
  const e = engine(fixtureNodes, fixtureNeighbors, []); e.selectPair(0, 3);
  const { p, scoreElement } = panel(fixtureNodes);
  globalThis.cancelAnimationFrame = () => {};
  p.render(e.result);
  assert.equal(scoreElement.textContent, 'Unavailable');
  assert.match(p._citation(e.result), /cosine\): unavailable/);
  const rows = p._findingRows(e.result);
  assert.equal(rows[1][0], 'selected');
  assert.equal(rows[1][10], '');
  assert.match(p._explanation(e.result).text, /no recorded cosine score/);
});

test('ordinary nearest-match export does not duplicate the selected neighbor', () => {
  const e = engine(fixtureNodes, fixtureNeighbors, []); e.selectIndex(0);
  const { p } = panel(fixtureNodes);
  assert.match(p._citation(e.result), /Nearest match: Company 1/);
  assert.match(p._citation(e.result), /neighbor rank: 1/);
  const rows = p._findingRows(e.result);
  assert.deepEqual(rows.map((r) => r[0]), ['00', '01', '02']);
});

test('selected comparison outside top-K stays highlighted on the actual canvas draw path', () => {
  const nodes = fixtureNodes.map((n) => ({ ...n, r: 1, b: 0.5, ph: 0 }));
  const e = engine(nodes, fixtureNeighbors, [{ qi: 0, mi: 3, similarity: 0.6 }]);
  Object.assign(e, { cam: { zoom: 1 }, hover: -1, reduced: true, ease: (x) => x,
    filter: { type: 'all', sim: 0 }, _w2s: (x, y) => [10 + x * 10, 10 + y * 10] });
  e.selectPair(0, 3);
  const fills = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, stroke() {},
    arc(x, y, radius) { this.circle = { x, y, radius }; },
    fill() { fills.push({ ...this.circle, alpha: this.globalAlpha, glow: this.shadowBlur || 0, color: this.fillStyle }); } };
  e._drawNodes(ctx, e.sel.t0 + 1000);
  const selected = fills.find((circle) => circle.x === 40);
  assert.equal(selected.alpha, 1);
  assert.ok(selected.radius >= 3.8);
  assert.ok(selected.glow >= 8);
  assert.equal(selected.color, '#DCE3EC');
  assert.deepEqual(e.sel.nb.map((n) => n.idx), [1, 2]);
  nodes[3].e = 1;
  fills.length = 0;
  e._drawNodes(ctx, e.sel.t0 + 1000);
  assert.equal(fills.find((circle) => circle.x === 40).color, '#E0A04A');
});

test('existing selected-comparison edges receive selection emphasis without adding synthetic edges', () => {
  const e = engine(fixtureNodes, fixtureNeighbors, [{ qi: 0, mi: 3, similarity: 0.6 }]);
  Object.assign(e, { edges: [[0, 3, 0.6]], hover: -1, filter: { sim: 0 },
    _w2s: (x, y) => [10 + x * 10, 10 + y * 10] });
  e.selectPair(0, 3);
  const strokes = [];
  const ctx = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes.push({ alpha: this.globalAlpha, color: this.strokeStyle }); } };
  e._drawEdges(ctx);
  assert.deepEqual(strokes, [{ alpha: 0.3, color: '#5BA4DD' }]);
  assert.deepEqual(e.edges, [[0, 3, 0.6]]);
  e.edges = [];
  strokes.length = 0;
  e._drawEdges(ctx);
  assert.deepEqual(strokes, []);
});

test('featured scores agree with independently decoded shipped embedding vectors', () => {
  const bytes = readFileSync(new URL('../public/data/embeddings.bin', import.meta.url));
  const vectors = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(vectors.length, data.nodes.length * 384);
  const mismatches = [];
  for (const f of data.findings) {
    let dot = 0, normA = 0, normB = 0;
    for (let d = 0; d < 384; d++) {
      const a = vectors[f.qi * 384 + d], b = vectors[f.mi * 384 + d];
      dot += a * b; normA += a * a; normB += b * b;
    }
    const cosine = dot / Math.sqrt(normA * normB);
    // Rounded int8 vectors differ from the original float index; this is a mismatch screen, not exact float replication.
    if (!Number.isFinite(cosine) || Math.abs(cosine - f.similarity) > 0.005) {
      mismatches.push(`${f.qi}/${f.mi}: featured=${f.similarity}, shipped-vector cosine=${cosine}`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('a reverse ranked score takes precedence over conflicting featured metadata', () => {
  const e = engine(fixtureNodes, [[], [[0, 0.8]], [], []], [{ qi: 0, mi: 1, similarity: 0.99 }]);
  e.selectPair(0, 1);
  assert.equal(e.result.score, 0.8);
  assert.equal(e.result.matchRank, null);
});

test('export preserves a ranked selected comparison hidden by the similarity slider', () => {
  const e = engine(fixtureNodes, [[[1, 0.9], [2, 0.8], [3, 0.7]], [], [], []], []);
  e.selectPair(0, 3);
  e.setFilter({ sim: 0.85 });
  assert.equal(e.result.matchRank, 3);
  assert.deepEqual(e.result.neighbors.map((n) => n.idx), [1]);
  const { p } = panel(fixtureNodes);
  const rows = p._findingRows(e.result);
  assert.deepEqual(rows.map((r) => r[0]), ['00', '03', '01']);
  assert.equal(rows[1][10], '0.7000');
});

test('retired mismatched annotations cannot override current pair scores or explanations', () => {
  const e = engine();
  const { p } = panel();
  p.featured = Object.fromEntries(data.findings.map((f) => [[f.qi, f.mi].sort((a, b) => a - b).join('_'), f.explanation]));
  e.selectPair(101616, 102169);
  assert.equal(e.result.score, 0.9746);
  assert.equal(p._explanation(e.result).src, 'note');
  e.selectPair(101616, 102080);
  assert.equal(e.result.score, null);
  assert.equal(p._explanation(e.result).src, 'note');
  assert.match(p._explanation(e.result).text, /no recorded cosine score/);
});
