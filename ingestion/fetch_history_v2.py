"""Chapter B / Task 2 — resumable ~10-year 10-K history fetch for the expanded universe.

Design for multi-session resumability + crash-safety:
  - The ONLY slow work here is network I/O. We do NOT touch DuckDB (no write lock held for hours).
  - Every HTTP response is cached by SECClient under data/raw/ — nothing is ever re-fetched.
  - Per-company progress is checkpointed to a flat file the instant a company finishes.
  - Selected filing metadata is appended (one JSON object per line) to an append-only manifest.
  A later fast step (load_filings_v2.py) reads the manifest from cache and populates the DB.

Re-running continues exactly where it left off: companies in the checkpoint are skipped, and
any new HTTP is a cache hit. Safe to Ctrl-C / kill at any time.

Run:  python ingestion/fetch_history_v2.py [--limit N]
  --limit N  process at most N not-yet-done companies this run (for bounded batches).
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from fetch_filings import SECClient
from fetch_universe import candidate_urls, TENK_FORMS

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
UNIVERSE = PROC / "universe_v2.json"
MANIFEST = PROC / "filings_v2.jsonl"          # append-only: one JSON line per selected filing
CHECKPOINT = PROC / "fetch_history_done.txt"  # one CIK per line (company fully processed)
SKIPS = PROC / "fetch_history_skips.jsonl"    # append-only: per-company failures (for audit)

N_PER_CO = 10                                  # up to ~10 newest 10-Ks per company (~10 years)


def _load_done() -> set[str]:
    if not CHECKPOINT.exists():
        return set()
    return {ln.strip() for ln in CHECKPOINT.read_text().splitlines() if ln.strip()}


def _newest_tenks(filings: list[dict], n: int) -> list[dict]:
    def _d(f):
        try:
            return date.fromisoformat(f["filingDate"])
        except Exception:
            return date.min
    tenks = [f for f in filings if f.get("form") in TENK_FORMS and f.get("accessionNumber")]
    tenks.sort(key=_d, reverse=True)
    return tenks[:n]


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
    ckpt = CHECKPOINT.open("a"); man = MANIFEST.open("a"); skp = SKIPS.open("a")
    processed = filings_written = with_10k = 0
    print(f"universe={len(universe)} done={len(done)} todo_this_run={len(todo)}", flush=True)

    try:
        for c in todo:
            cik = c["cik"]
            try:
                sub = client.submissions(cik)
            except Exception as e:
                # network/transient: do NOT checkpoint, so it retries next run
                skp.write(json.dumps({"cik": cik, "stage": "submissions", "err": str(e)[:200]}) + "\n"); skp.flush()
                continue
            name = sub.get("name") or c.get("name") or ""
            sic = sub.get("sic") or sub.get("sicCode") or ""
            industry = sub.get("sicDescription") or ""
            ticker = (sub.get("tickers") or [c.get("ticker") or ""])[0] or c.get("ticker") or ""
            try:
                allf = client.all_filings(cik)
            except Exception as e:
                skp.write(json.dumps({"cik": cik, "stage": "filings", "err": str(e)[:200]}) + "\n"); skp.flush()
                continue
            chosen = _newest_tenks(allf, N_PER_CO)
            got = 0
            for f in chosen:
                acc = f["accessionNumber"]
                saved_url = None
                for url in candidate_urls(cik, acc, f.get("primaryDocument")):
                    try:
                        client.get(url, subdir="filings"); saved_url = url; break
                    except Exception:
                        continue
                if not saved_url:
                    continue
                man.write(json.dumps({
                    "cik": cik, "name": name, "ticker": ticker, "sic": sic, "industry": industry,
                    "accession": acc, "form": f.get("form"), "filing_date": f.get("filingDate"),
                    "period": f.get("reportDate"), "sec_url": saved_url,
                    "primary_doc": f.get("primaryDocument") or "",
                }) + "\n")
                got += 1; filings_written += 1
            man.flush()
            ckpt.write(cik + "\n"); ckpt.flush()           # checkpoint AFTER the company is done
            processed += 1
            if got:
                with_10k += 1
            if processed % 25 == 0:
                print(f"  processed={processed}/{len(todo)} with_10k={with_10k} "
                      f"filings={filings_written} cache_hits={client.stats['cache_hits']} "
                      f"requests={client.stats['requests']} errors={client.stats['errors']}", flush=True)
    finally:
        ckpt.close(); man.close(); skp.close()

    print(f"DONE this run: processed={processed} with_10k={with_10k} filings_written={filings_written} "
          f"| total_done={len(done) + processed}/{len(universe)} | client={client.stats}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
