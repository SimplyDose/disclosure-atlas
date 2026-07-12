"""Chapter B / Task 1 — build the expanded company universe (~2,750 companies).

A varied universe weighted toward mid/small-cap, where disclosure language actually varies —
NOT Fortune-500-only — but including well-known large names for recognizability.

Composition (deterministic, reproducible — no randomness, so re-runs are identical):
  1. v1            — every company already in the corpus (continuity; includes the enforced set).
  2. recognizable  — a curated list of well-known large-caps, for recognizability.
  3. sampled       — an evenly-spaced sweep across the *tail* of SEC's company_tickers.json
                     (which is ordered roughly by size), i.e. mid/small-cap by population.

company_tickers.json is ordered ~by size/popularity, so skipping the mega-cap head and
evenly sampling the long tail yields a mid/small-cap-weighted, sector-varied universe by
construction. We add the recognizable names back explicitly so big filers still appear.

Writes: data/processed/universe_v2.json  — [{cik, ticker, name, source}], sorted by cik.
Read-only against the network (company_tickers.json is already cached). Idempotent.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from db import connect
from fetch_filings import SECClient

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "processed" / "universe_v2.json"

TARGET = 4800          # total companies in the expanded universe (raised from 2750 for the ~150k corpus)
TOP_SKIP = 150         # don't random-sample the mega-cap head; the curated list covers big names

# Recognizable large-caps across sectors (by ticker) — for recognizability, not dominance.
CURATED = [
    "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "NFLX", "ADBE", "CRM",
    "ORCL", "IBM", "INTC", "CSCO", "AMD", "QCOM", "TXN", "AVGO", "MU",
    "JPM", "BAC", "WFC", "C", "GS", "MS", "AXP", "USB", "PNC", "SCHW", "BLK",
    "XOM", "CVX", "COP", "SLB", "OXY",
    "JNJ", "PFE", "MRK", "ABBV", "LLY", "TMO", "ABT", "DHR", "BMY", "AMGN", "GILD", "CVS", "UNH",
    "KO", "PEP", "PG", "WMT", "HD", "LOW", "COST", "TGT", "MCD", "SBUX", "NKE", "DIS",
    "GE", "BA", "CAT", "MMM", "HON", "UPS", "FDX", "LMT", "RTX", "DE",
    "T", "VZ", "CMCSA", "GM", "F",
]


def cik10(v) -> str:
    return str(v).lstrip("0").zfill(10)


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    client = SECClient()
    tickers = client.company_tickers()           # {"0": {cik_str, ticker, title}, ...} cached
    entries = [tickers[k] for k in sorted(tickers, key=lambda x: int(x))]
    by_ticker = {e["ticker"].upper(): e for e in entries}

    con = connect(read_only=True)
    v1 = {cik10(r[0]): (r[1] or "") for r in con.execute("SELECT cik, company_name FROM companies").fetchall()}
    con.close()

    selected: dict[str, dict] = {}

    # 0. prior universe — pin EVERY CIK already in universe_v2.json so the expanded universe is a strict
    #    SUPERSET: nothing already fetched is dropped (additive expansion, no re-fetch churn, resumable).
    if OUT.exists():
        try:
            prior = json.loads(OUT.read_text())
            for r in prior:
                c = cik10(r.get("cik"))
                if c and c not in selected:
                    selected[c] = {"cik": c, "ticker": (r.get("ticker") or "").upper(),
                                   "name": r.get("name") or "", "source": r.get("source") or "prior"}
            print(f"  pinned {len(selected)} prior universe companies (superset guarantee)")
        except Exception as e:
            print(f"  (no usable prior universe: {e})")

    # 1. v1 — continuity (names from DB; ticker if SEC knows it)
    tk_by_cik = {cik10(e["cik_str"]): e["ticker"].upper() for e in entries}
    for cik, name in v1.items():
        selected[cik] = {"cik": cik, "ticker": tk_by_cik.get(cik, ""), "name": name, "source": "v1"}

    # 2. recognizable large-caps
    for tk in CURATED:
        e = by_ticker.get(tk)
        if not e:
            continue
        c = cik10(e["cik_str"])
        if c not in selected:
            selected[c] = {"cik": c, "ticker": e["ticker"].upper(), "name": e["title"], "source": "recognizable"}

    # 3. tail sweep — evenly-spaced across the mid/small-cap tail to fill to TARGET
    pool = entries[TOP_SKIP:]
    remaining = max(0, TARGET - len(selected))
    if remaining and pool:
        stride = max(1, len(pool) // remaining)
        i = 0
        while len(selected) < TARGET and i < len(pool):
            e = pool[i]
            c = cik10(e["cik_str"])
            if c not in selected:
                selected[c] = {"cik": c, "ticker": e["ticker"].upper(), "name": e["title"], "source": "sampled"}
            i += stride
        # if stride overshoot left us short, sweep the gaps deterministically
        i = 0
        while len(selected) < TARGET and i < len(pool):
            e = pool[i]; c = cik10(e["cik_str"])
            if c not in selected:
                selected[c] = {"cik": c, "ticker": e["ticker"].upper(), "name": e["title"], "source": "sampled"}
            i += 1

    rows = sorted(selected.values(), key=lambda r: r["cik"])
    OUT.write_text(json.dumps(rows, indent=0, ensure_ascii=False))

    from collections import Counter
    src = Counter(r["source"] for r in rows)
    print(f"universe_v2: {len(rows)} companies -> {OUT}")
    print(f"  by source: {dict(src)}")
    print(f"  with ticker: {sum(1 for r in rows if r['ticker'])}; sample names: "
          + ", ".join(r["name"][:22] for r in rows[:4]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
