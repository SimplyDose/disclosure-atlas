"""Fetch 10-K filings for the universe and record them in DuckDB.

For ENFORCED companies: per the validation plan (docs/VALIDATION_PLAN.md), capture the 10-K(s) filed in the
period *before* the enforcement action (we take up to N_PER_CO most recent 10-Ks filed
before the earliest AAER release date; fallback to the earliest available if none predate).

For CLEAN companies (cohort='clean', added later by build_clean_set.py): take up to
N_PER_CO most recent 10-Ks in a comparable era.

Primary 10-K documents are cached to data/raw/filings/. Each filing -> a row in `filings`
with sec_url = direct link to the primary document (canonical source link).

Run:  python ingestion/fetch_universe.py [enforced|clean|all]
Idempotent; re-reads cache.
"""
from __future__ import annotations

import re
import sys
from datetime import date

from db import connect, ENFORCED_PRED, CLEAN_PRED
from fetch_filings import SECClient

N_PER_CO = 5                      # 10-Ks per company (multi-year breadth, balanced across cohorts)
TENK_FORMS = {"10-K", "10-K405", "10-KSB", "10-KSB405"}  # historical variants


def candidate_urls(cik: str, accession: str, primary_doc: str | None) -> list[str]:
    """Ordered doc URLs to try. Modern filings have a primaryDocument; pre-~2002
    filings don't — their content lives in the full submission .txt."""
    acc_nodash = accession.replace("-", "")
    cik_int = str(int(cik))
    urls = []
    # a real primary doc filename ends in .htm/.html/.txt and isn't a bare numeric stub
    if primary_doc and re.search(r"\.(htm|html|txt)$", primary_doc, re.I) \
            and not re.fullmatch(r"\d+\.txt", primary_doc):
        urls.append(f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{primary_doc}")
    # full submission text (always exists) — fallback for old/odd filings
    urls.append(f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}.txt")
    return urls


def pick_tenks(filings: list[dict], before: date | None) -> list[dict]:
    tenks = [f for f in filings if (f.get("form") in TENK_FORMS) and f.get("accessionNumber")]
    # sort newest first by filingDate
    def _d(f):
        try:
            return date.fromisoformat(f["filingDate"])
        except Exception:
            return date.min
    tenks.sort(key=_d, reverse=True)
    if before:
        pre = [f for f in tenks if _d(f) < before]
        if pre:
            return pre[:N_PER_CO]
        return tenks[:1] if tenks else []   # fallback: earliest-available signal
    return tenks[:N_PER_CO]


def enforcement_dates(con) -> dict[str, date]:
    rows = con.execute(
        "SELECT cik, MIN(release_date) FROM enforcement GROUP BY cik").fetchall()
    out = {}
    for cik, d in rows:
        if d:
            out[cik] = d if isinstance(d, date) else date.fromisoformat(str(d))
    return out


def run(cohort: str, client: SECClient, con) -> dict:
    enf_dates = enforcement_dates(con)
    pred = ENFORCED_PRED if cohort == "enforced" else CLEAN_PRED
    ciks = [r[0] for r in con.execute(
        f"SELECT cik FROM companies WHERE {pred}").fetchall()]
    stats = {"companies": len(ciks), "with_10k": 0, "filings": 0, "no_10k": []}

    for cik in ciks:
        try:
            filings = client.all_filings(cik)
        except Exception as e:
            stats["no_10k"].append((cik, f"submissions error: {e}"))
            continue
        before = enf_dates.get(cik) if cohort == "enforced" else None
        chosen = pick_tenks(filings, before)
        if not chosen:
            stats["no_10k"].append((cik, "no 10-K found"))
            continue
        got_any = False
        for f in chosen:
            acc = f["accessionNumber"]
            urls = candidate_urls(cik, acc, f.get("primaryDocument"))
            saved_url = None
            for url in urls:
                try:
                    client.get(url, subdir="filings")
                    saved_url = url
                    break
                except Exception:
                    continue
            if not saved_url:
                stats["no_10k"].append((cik, f"doc fetch failed {acc}"))
                continue
            con.execute(
                "INSERT OR IGNORE INTO filings "
                "(accession_number, cik, form_type, filing_date, period_of_report, sec_url) "
                "VALUES (?,?,?,?,?,?)",
                [acc, cik, f.get("form"), f.get("filingDate") or None,
                 f.get("reportDate") or None, saved_url])
            stats["filings"] += 1
            got_any = True
        if got_any:
            stats["with_10k"] += 1
    return stats


def main() -> int:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    cohorts = ["enforced", "clean"] if which == "all" else [which]
    client = SECClient()
    con = connect()
    for cohort in cohorts:
        s = run(cohort, client, con)
        print(f"[{cohort}] companies={s['companies']} with_10k={s['with_10k']} "
              f"filings_cached={s['filings']} no_10k={len(s['no_10k'])}")
    total_filings = con.execute("SELECT COUNT(*) FROM filings").fetchone()[0]
    print(f"Total filings in DB: {total_filings}")
    print(f"SEC client stats: {client.stats}")
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
