"""Read-only data layer for the Disclosure Atlas MCP server.

A process-singleton that loads the existing computed bundle (the same files the website ships, so MCP
results are identical to the site) plus a read-only DuckDB connection. No writes, ever. No secrets:
this module never touches .env or any credential. The fastembed model and the change-event index load
lazily on first use.
"""
from __future__ import annotations

import json
import os
import threading
import numpy as np

# ── paths (resolved relative to the repo, robust to CWD) ──
_HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(_HERE)
DATA = os.path.join(REPO, "app", "public", "data")
DUCKDB_PATH = os.path.join(REPO, "data", "processed", "atlas.duckdb")

# ── constant maps (mirror the frontend) ──
TYPE_KEY = {0: "revenue_recognition", 1: "going_concern", 2: "related_party",
            3: "critical_audit_matter", 4: "mda", 5: "risk_factors"}
KEY_TYPE = {v: k for k, v in TYPE_KEY.items()}
# tolerant aliases the AI might pass
KEY_TYPE.update({"rev_rec": 0, "revenue": 0, "going concern": 1, "gc": 1,
                 "related-party": 2, "cam": 3, "critical audit matter": 3,
                 "md&a": 4, "mda": 4, "risk factors": 5, "risk_factors": 5})
TYPE_FULL = {0: "revenue recognition", 1: "going concern", 2: "related-party",
             3: "critical audit matter", 4: "MD&A", 5: "risk factors"}
CMP_TO_INT = {"below": -1, "near": 0, "above": 1}
DVI_TO_INT = {"typical": 0, "distinctive": 1, "highly_distinctive": 2}
CMP_TEXT = {-1: "below", 0: "near", 1: "above"}
DVI_TEXT = {0: "typical", 1: "distinctive", 2: "highly_distinctive"}
BENEISH_COMPONENTS = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"]
DECHOW_COMPONENTS = ["rsst_accruals", "ch_receivables", "ch_inventory", "soft_assets",
                     "ch_cash_sales", "ch_roa", "issuance"]
BENEISH_THRESHOLD = -1.78


def normalize_cik(cik) -> str:
    """Zero-pad a CIK to 10 digits (the canonical EDGAR / bundle form)."""
    s = str(cik).strip()
    if s.lower().startswith("cik"):
        s = s[3:].strip()
    s = s.lstrip("0") or "0"
    if not s.isdigit():
        raise ValueError(f"CIK must be numeric, got {cik!r}")
    return s.zfill(10)


class AtlasData:
    """Loads and holds the read-only bundle. Construct once (see get_data())."""

    def __init__(self):
        self.nodes = _load_json("nodes.json")            # list[dict], len 94455, idx == node.i
        self.scores = _load_json("scores.json")          # cik -> {name, years:[...]}
        self.tickers = _load_json("tickers.json")        # cik -> ticker
        self.aaer = _load_json("aaer.json")              # cik -> [{aaer,date}]
        self.manifest = _load_json("manifest.json")
        self.neighbors = _load_json("neighbors.json")    # list by node idx -> [[idx,cos],...]

        # int8 embeddings, memory-mapped; 94455 x 384, dequant scale inv = 1/127
        meta_dim = int(self.manifest.get("embedding_dim", 384))
        raw = np.fromfile(os.path.join(DATA, "embeddings.bin"), dtype=np.int8)
        n = len(self.nodes)
        assert raw.size == n * meta_dim, f"embeddings.bin size {raw.size} != {n}*{meta_dim}"
        self.dim = meta_dim
        self.inv = 1.0 / 127.0
        self.emb = raw.reshape(n, meta_dim)              # int8

        # lazily-loaded / computed
        self._excerpts = None
        self._embed_model = None
        self._changes = None
        self._duck = None
        self._lock = threading.Lock()

        # ── indexes ──
        self.cik_to_indices: dict[str, list[int]] = {}
        self.cik_name: dict[str, str] = {}
        for i, nd in enumerate(self.nodes):
            c = nd["cik"]
            self.cik_to_indices.setdefault(c, []).append(i)
            if c not in self.cik_name:
                self.cik_name[c] = nd["name"]
        # name search index (lowercased)
        self._name_index = [(c, nm.lower()) for c, nm in self.cik_name.items()]

    # ── lazy resources ──
    @property
    def excerpts(self) -> dict:
        if self._excerpts is None:
            with self._lock:
                if self._excerpts is None:
                    self._excerpts = _load_json("excerpts.json")
        return self._excerpts

    @property
    def duck(self):
        if self._duck is None:
            with self._lock:
                if self._duck is None:
                    import duckdb
                    self._duck = duckdb.connect(DUCKDB_PATH, read_only=True)
        return self._duck

    def embed_query(self, text: str) -> np.ndarray:
        """Embed one query with bge-small-en-v1.5 locally (fastembed/ONNX, CPU, $0).
        Returns a float32 L2-normalized vector — mirrors the browser's encoder."""
        if self._embed_model is None:
            with self._lock:
                if self._embed_model is None:
                    from fastembed import TextEmbedding
                    self._embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        vec = next(iter(self._embed_model.embed([text])))
        v = np.asarray(vec, dtype=np.float32)
        nrm = np.linalg.norm(v)
        return v / nrm if nrm else v

    def cosine_to_all(self, qvec: np.ndarray) -> np.ndarray:
        """Cosine of a unit query vs all dequantized int8 embeddings (matches the site)."""
        return (self.emb.astype(np.float32) @ qvec) * self.inv

    def cos_pair(self, a: int, b: int) -> float:
        """Cosine between two stored footnotes (dequantized int8 dot) — matches changes.js."""
        va = self.emb[a].astype(np.float32) * self.inv
        vb = self.emb[b].astype(np.float32) * self.inv
        return float(np.clip(np.dot(va, vb), -1.0, 1.0))

    # ── change events (computed once, cached) — reproduces changes.js ensureChanges ──
    def changes(self) -> list[dict]:
        if self._changes is None:
            with self._lock:
                if self._changes is None:
                    self._changes = self._build_changes()
        return self._changes

    def _build_changes(self) -> list[dict]:
        nodes = self.nodes
        # principal (longest, by word count) excerpt per cik|type|pfy
        rep: dict[str, tuple[int, int]] = {}
        for i, n in enumerate(nodes):
            if n.get("pfy") is None:
                continue
            k = f"{n['cik']}|{n['t']}|{n['pfy']}"
            w = n.get("wc") or 0
            cur = rep.get(k)
            if cur is None or w > cur[1]:
                rep[k] = (i, w)
        # group principals by cik|type
        grp: dict[str, list[tuple[int, int]]] = {}
        for k, (idx, _w) in rep.items():
            cik, t, year = k.split("|")
            grp.setdefault(f"{cik}|{t}", []).append((int(year), idx))
        events = []
        for gk, arr in grp.items():
            if len(arr) < 2:
                continue
            arr.sort(key=lambda x: x[0])
            t = int(gk.split("|")[1])
            for j in range(1, len(arr)):
                yA, iA = arr[j - 1]
                yB, iB = arr[j]
                cos = self.cos_pair(iA, iB)
                n = nodes[iB]
                events.append({
                    "cik": n["cik"], "name": n["name"], "ind": n.get("ind", ""),
                    "sic": n.get("sic", ""), "tk": n.get("tk", "") or self.tickers.get(n["cik"], ""),
                    "e": 1 if n.get("e") else 0, "t": t, "yA": yA, "yB": yB,
                    "dist": 1.0 - cos, "idxA": iA, "idxB": iB,
                })
        return events

    # ── helpers ──
    def excerpt(self, idx: int) -> str:
        return self.excerpts.get(str(idx), "")

    def resolve_company(self, cik: str | None, name: str | None):
        """Return (cik, list_of_matches). Exactly one match -> (cik, [one]); ambiguous name -> (None, many)."""
        if cik:
            c = normalize_cik(cik)
            if c not in self.cik_to_indices:
                return None, []
            return c, [(c, self.cik_name[c])]
        if name:
            q = name.strip().lower()
            exact = [(c, nm) for (c, nm) in self._name_index if nm == q]
            if exact:
                return exact[0][0], [(exact[0][0], self.cik_name[exact[0][0]])]
            subs = [(c, self.cik_name[c]) for (c, nm) in self._name_index if q in nm]
            if len(subs) == 1:
                return subs[0][0], subs
            return None, sorted(subs, key=lambda x: x[1])
        return None, []

    def enforcement_detail(self, cik: str) -> list[dict]:
        """AAER detail for a CIK from DuckDB (summary, period) — falls back to aaer.json index."""
        try:
            rows = self.duck.execute(
                "SELECT aaer_number, CAST(release_date AS VARCHAR), period_of_alleged_conduct, "
                "summary, source_url FROM enforcement WHERE cik = ? ORDER BY release_date", [cik]
            ).fetchall()
            if rows:
                return [{"aaer_number": r[0], "release_date": r[1], "period_of_alleged_conduct": r[2],
                         "summary": r[3], "source_url": r[4]} for r in rows]
        except Exception:
            pass
        return [{"aaer_number": a.get("aaer"), "release_date": a.get("date")}
                for a in self.aaer.get(cik, [])]


def _load_json(name: str):
    with open(os.path.join(DATA, name), "r", encoding="utf-8") as f:
        return json.load(f)


_DATA: AtlasData | None = None
_DATA_LOCK = threading.Lock()


def get_data() -> AtlasData:
    global _DATA
    if _DATA is None:
        with _DATA_LOCK:
            if _DATA is None:
                _DATA = AtlasData()
    return _DATA
