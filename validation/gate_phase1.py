"""Phase 1 objective gate check (Conductor's self-check; the Reviewer re-runs independently).

Gate (PRD §11.1 / SCOPE success criteria):
  - >= 3,000 footnotes ingested
  - extraction_confidence recorded for ALL footnotes
  - schema integrity: identifiers consistent (every footnote -> filing -> company)
  - excerpts genuinely on-topic (sampled term check)
  - live-filing spot check: sampled excerpt text actually appears in its source document

Exit code 0 = PASS, 1 = FAIL.
"""
from __future__ import annotations

import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingestion"))
from db import connect            # noqa: E402
from fetch_filings import SECClient  # noqa: E402

# Stronger than a bare "revenue": require actual recognition language so a cash-flow-statement
# line ("increase in deferred revenue") cannot pass as on-topic rev_rec.
REV_TERMS = re.compile(
    r"revenue\s+(?:is|are|will be|to be)?\s*recogni[sz]|recogni[sz]e[sd]?\s+(?:as )?revenue|"
    r"performance obligation|transaction price|standalone selling price|ASC\s*606", re.I)
GC_TERMS = re.compile(r"going concern|substantial doubt|ability to continue|liquidit", re.I)


def main() -> int:
    con = connect(read_only=True)
    fails = []

    total = con.execute("SELECT COUNT(*) FROM footnotes").fetchone()[0]
    if total < 3000:
        fails.append(f"footnote count {total} < 3000")

    no_conf = con.execute(
        "SELECT COUNT(*) FROM footnotes WHERE extraction_confidence IS NULL").fetchone()[0]
    if no_conf:
        fails.append(f"{no_conf} footnotes missing extraction_confidence")

    orphan_f = con.execute(
        "SELECT COUNT(*) FROM footnotes fn LEFT JOIN filings f USING(accession_number) "
        "WHERE f.accession_number IS NULL").fetchone()[0]
    if orphan_f:
        fails.append(f"{orphan_f} footnotes have no parent filing")

    orphan_fil = con.execute(
        "SELECT COUNT(*) FROM filings f LEFT JOIN companies c USING(cik) "
        "WHERE c.cik IS NULL").fetchone()[0]
    if orphan_fil:
        fails.append(f"{orphan_fil} filings have no parent company")

    # on-topic term check across a sample
    rows = con.execute(
        "SELECT footnote_type, raw_text_excerpt FROM footnotes USING SAMPLE 200 ROWS").fetchall()
    offtopic = 0
    for ftype, txt in rows:
        pat = REV_TERMS if ftype == "rev_rec" else GC_TERMS
        if not pat.search(txt):
            offtopic += 1
    if offtopic / max(1, len(rows)) > 0.10:
        fails.append(f"{offtopic}/{len(rows)} sampled excerpts off-topic (>10%)")

    # live-filing spot check (re-reads cache = the bytes fetched from SEC.gov)
    client = SECClient()
    sample = con.execute(
        "SELECT fn.raw_text_excerpt, f.sec_url FROM footnotes fn "
        "JOIN filings f USING(accession_number) WHERE fn.extraction_method='heuristic' "
        "USING SAMPLE 8 ROWS").fetchall()
    spot_ok = 0
    for excerpt, url in sample:
        try:
            doc = client.get(url, subdir="filings").decode("utf-8", "replace")
        except Exception:
            continue
        norm_doc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", doc))
        probe = re.sub(r"\s+", " ", excerpt[:60])
        if probe and probe in norm_doc:
            spot_ok += 1
    print(f"live spot-check: {spot_ok}/{len(sample)} excerpts found verbatim in source doc")
    if sample and spot_ok / len(sample) < 0.6:
        fails.append(f"only {spot_ok}/{len(sample)} excerpts verifiable in source")

    by_cohort = dict(con.execute(
        "SELECT CASE WHEN f.cik IN (SELECT cik FROM enforcement) THEN 'enforced' ELSE 'clean' END coh, "
        "COUNT(*) FROM footnotes fn JOIN filings f USING(accession_number) GROUP BY 1").fetchall())
    con.close()

    print(f"footnotes={total} | missing_conf={no_conf} | cohort={by_cohort}")
    if fails:
        print("GATE: FAIL")
        for f in fails:
            print("  -", f)
        return 1
    print("GATE: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
