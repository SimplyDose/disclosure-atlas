"""Build the matched CLEAN comparison set (the negatives).

VALIDATION_PLAN requires matched negatives: similar size, same SIC industries, same era,
no enforcement history. An unmatched clean set would let industry alone drive clustering
and overstate the result. We match on SIC + era:

  - For each SIC, target the same number of clean companies as enforced companies in that SIC.
  - For each clean candidate, select the 10-K whose filing year is closest to the median
    filing year of the enforced peers in that SIC (era match).
  - Exclude any company that appears in the enforcement ground truth.

Records clean companies (cohort derived from enforcement membership) + era-matched 10-K filings, caching
each primary doc. Run:  python ingestion/build_clean_set.py
"""
from __future__ import annotations

import re
import statistics
import sys
from datetime import date
from urllib.parse import urlencode

from db import connect
from fetch_filings import SECClient
from fetch_universe import candidate_urls, TENK_FORMS

MATCH_RATIO = 2.0          # clean companies per enforced company, per SIC (more matched negatives = more conservative test + rebalances footnote counts)
CAND_MULTIPLIER = 5        # how many SIC candidates to try per needed clean company
ERA_WINDOW = 4             # acceptable +/- years from target era


def enforced_profile(con) -> dict[str, dict]:
    rows = con.execute("""
        SELECT co.sic_code, co.cik, EXTRACT(year FROM f.filing_date)
        FROM companies co JOIN filings f USING(cik)
        WHERE co.cik IN (SELECT cik FROM enforcement) AND co.sic_code IS NOT NULL
    """).fetchall()
    prof: dict[str, dict] = {}
    for sic, cik, yr in rows:
        d = prof.setdefault(sic, {"ciks": set(), "years": []})
        d["ciks"].add(cik)
        if yr:
            d["years"].append(int(yr))
    return prof


def sic_candidates(client: SECClient, sic: str) -> list[str]:
    q = urlencode({"action": "getcompany", "SIC": sic, "type": "10-K", "dateb": "",
                   "owner": "include", "count": "100", "output": "atom"})
    try:
        t = client.get_text("https://www.sec.gov/cgi-bin/browse-edgar?" + q, subdir="edgar_sic")
    except Exception:
        return []
    blocks = re.findall(r"<company-info[^>]*>(.*?)</company-info>", t, re.S)
    ciks = []
    for b in blocks:
        m = re.search(r"<cik>(\d+)</cik>", b)
        if m:
            ciks.append(str(int(m.group(1))).zfill(10))
    return ciks


N_PER_CLEAN = 5                  # era-matched 10-Ks per clean company (balance vs enforced)


def pick_era_tenks(filings: list[dict], target_year: int) -> list[dict]:
    tenks = [f for f in filings if f.get("form") in TENK_FORMS and f.get("accessionNumber")
             and f.get("filingDate")]
    if not tenks:
        return []
    def yr(f):
        try:
            return int(f["filingDate"][:4])
        except Exception:
            return 0
    tenks.sort(key=lambda f: abs(yr(f) - target_year))  # closest to era first
    return tenks[:N_PER_CLEAN]


def main() -> int:
    client = SECClient()
    con = connect()
    prof = enforced_profile(con)
    all_known = {r[0] for r in con.execute("SELECT cik FROM companies").fetchall()}

    total_clean, total_filings = 0, 0
    for sic, info in sorted(prof.items(), key=lambda kv: -len(kv[1]["ciks"])):
        need = max(1, round(len(info["ciks"]) * MATCH_RATIO))
        target_year = int(statistics.median(info["years"])) if info["years"] else 2015
        cands = [c for c in sic_candidates(client, sic) if c not in all_known]
        got = 0
        for cik in cands[: need * CAND_MULTIPLIER + 5]:
            if got >= need:
                break
            try:
                filings = client.all_filings(cik)
            except Exception:
                continue
            tenks = pick_era_tenks(filings, target_year)
            if not tenks:
                continue
            sub = client.submissions(cik)
            name = sub.get("name", "")
            csic = sub.get("sic") or sic
            saved_any = False
            for tenk in tenks:
                acc = tenk["accessionNumber"]
                urls = candidate_urls(cik, acc, tenk.get("primaryDocument"))
                saved = None
                for u in urls:
                    try:
                        client.get(u, subdir="filings"); saved = u; break
                    except Exception:
                        continue
                if not saved:
                    continue
                if not saved_any:
                    con.execute(
                        "INSERT OR IGNORE INTO companies (cik, company_name, ticker, sic_code, industry_label, current_status) "
                        "VALUES (?,?,?,?,?,?)",
                        [cik, name, None, csic, sub.get("sicDescription") or None, None])  # cohort derived
                con.execute(
                    "INSERT OR IGNORE INTO filings (accession_number, cik, form_type, filing_date, period_of_report, sec_url) "
                    "VALUES (?,?,?,?,?,?)",
                    [acc, cik, tenk.get("form"), tenk.get("filingDate") or None,
                     tenk.get("reportDate") or None, saved])
                saved_any = True
                total_filings += 1
            if saved_any:
                all_known.add(cik)
                got += 1
                total_clean += 1
        print(f"SIC {sic}: need {need}, matched {got} clean (target era {target_year})")

    n_clean = con.execute("SELECT COUNT(*) FROM companies WHERE cik NOT IN (SELECT cik FROM enforcement)").fetchone()[0]
    n_enf = con.execute("SELECT COUNT(*) FROM companies WHERE cik IN (SELECT cik FROM enforcement)").fetchone()[0]
    con.close()
    print(f"\nClean companies: {n_clean} | Enforced: {n_enf}")
    print(f"SEC client stats: {client.stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
