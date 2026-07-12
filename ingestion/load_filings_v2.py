"""Chapter B / Task 2b — load the fetched filings manifest into DuckDB.

Reads the append-only manifest produced by fetch_history_v2.py (data/processed/filings_v2.jsonl)
and upserts into `companies` + `filings`. Pure local work (no network) and idempotent:
INSERT OR IGNORE keeps existing v1 rows intact and adds the new universe. Kept separate from the
fetch so the long network phase never held a DB write lock.

Run:  python ingestion/load_filings_v2.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from db import connect

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "processed" / "filings_v2.jsonl"


def main() -> int:
    if not MANIFEST.exists():
        print(f"no manifest at {MANIFEST}", file=sys.stderr)
        return 1

    # First occurrence per CIK = newest filing (fetch wrote newest-first) -> most current name/sic.
    companies: dict[str, dict] = {}
    filings: list[dict] = []
    for ln in MANIFEST.open():
        ln = ln.strip()
        if not ln:
            continue
        d = json.loads(ln)
        companies.setdefault(d["cik"], d)
        filings.append(d)

    con = connect()
    c_before = con.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
    f_before = con.execute("SELECT COUNT(*) FROM filings").fetchone()[0]

    for cik, d in companies.items():
        con.execute(
            "INSERT OR IGNORE INTO companies "
            "(cik, company_name, ticker, sic_code, industry_label, current_status) "
            "VALUES (?,?,?,?,?,?)",
            [cik, d.get("name") or "", d.get("ticker") or "", d.get("sic") or "",
             d.get("industry") or "", ""])

    for d in filings:
        con.execute(
            "INSERT OR IGNORE INTO filings "
            "(accession_number, cik, form_type, filing_date, period_of_report, sec_url) "
            "VALUES (?,?,?,?,?,?)",
            [d["accession"], d["cik"], d.get("form"), d.get("filing_date") or None,
             d.get("period") or None, d.get("sec_url")])

    c_after = con.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
    f_after = con.execute("SELECT COUNT(*) FROM filings").fetchone()[0]
    forms = dict(con.execute("SELECT form_type, COUNT(*) FROM filings GROUP BY 1 ORDER BY 2 DESC LIMIT 6").fetchall())
    con.close()
    print(f"companies: {c_before} -> {c_after} (+{c_after - c_before})")
    print(f"filings:   {f_before} -> {f_after} (+{f_after - f_before})")
    print(f"top form types: {forms}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
