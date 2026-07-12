"""Chapter D / step 2 — resumable XBRL companyfacts fetch for the existing universe.

One SEC `companyfacts` JSON per CIK (all reported us-gaap/dei facts, all years). Same
resumable design as fetch_history_v2.py:
  - network-only; no DuckDB lock held;
  - every response cached by SECClient under data/raw/companyfacts/ (never re-fetched);
  - per-CIK checkpoint written the instant a company finishes;
  - failures appended to a skips log (NOT checkpointed → retried next run).

Re-running continues exactly where it stopped. Safe to Ctrl-C / kill anytime. $0 (public data).

Run:  python ingestion/fetch_companyfacts.py [--limit N]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from fetch_filings import SECClient

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
UNIVERSE = PROC / "universe_v2.json"
CHECKPOINT = PROC / "companyfacts_done.txt"     # one CIK per line (fetched OR confirmed-absent)
SKIPS = PROC / "companyfacts_skips.jsonl"       # append-only: transient failures (retried next run)
ABSENT = PROC / "companyfacts_absent.txt"       # CIKs with no companyfacts (404) — real, not an error


def _load_done() -> set[str]:
    if not CHECKPOINT.exists():
        return set()
    return {ln.strip() for ln in CHECKPOINT.read_text().splitlines() if ln.strip()}


def main() -> int:
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    universe = json.loads(UNIVERSE.read_text())
    done = _load_done()
    todo = [c for c in universe if c["cik"] not in done]
    if limit is not None:
        todo = todo[:limit]

    client = SECClient()
    ckpt = CHECKPOINT.open("a"); skp = SKIPS.open("a"); absf = ABSENT.open("a")
    fetched = absent = 0
    print(f"universe={len(universe)} done={len(done)} todo_this_run={len(todo)}", flush=True)

    try:
        for i, c in enumerate(todo, 1):
            cik = c["cik"]
            try:
                facts = client.company_facts(cik)
                # quick validity: must have a us-gaap block to be useful
                _ = facts.get("facts", {}).get("us-gaap", {})
                ckpt.write(cik + "\n"); ckpt.flush()
                fetched += 1
            except RuntimeError as e:
                msg = str(e)
                if "404" in msg or "Not Found" in msg:
                    # company genuinely has no XBRL companyfacts (older/foreign/non-filer):
                    # record as absent and CHECKPOINT it so we don't retry forever.
                    absf.write(cik + "\n"); absf.flush()
                    ckpt.write(cik + "\n"); ckpt.flush()
                    absent += 1
                else:
                    skp.write(json.dumps({"cik": cik, "err": msg[:200]}) + "\n"); skp.flush()
            except Exception as e:
                skp.write(json.dumps({"cik": cik, "err": str(e)[:200]}) + "\n"); skp.flush()
            if i % 100 == 0:
                print(f"  {i}/{len(todo)} fetched={fetched} absent={absent} "
                      f"cache_hits={client.stats['cache_hits']} requests={client.stats['requests']} "
                      f"errors={client.stats['errors']}", flush=True)
    finally:
        ckpt.close(); skp.close(); absf.close()

    print(f"DONE this run: fetched={fetched} absent={absent} "
          f"| total_done={len(done) + fetched + absent}/{len(universe)} | client={client.stats}",
          flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
