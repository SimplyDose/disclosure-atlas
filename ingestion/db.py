"""DuckDB schema + connection helper for Disclosure Atlas.

Schema mirrors docs/DATA_MODEL.md EXACTLY. No extra columns — any change here is a
SCHEMA CHANGE and must be escalated to BLOCKERS.md per the conductor escalation
contract. Build-time labels that the model doesn't carry are DERIVED, not stored:

  - "enforced" vs "clean" cohort  -> a company is enforced iff it has an enforcement row.
  - a footnote's cik              -> join footnotes -> filings -> companies.
  - primary 10-K document URL     -> stored in filings.sec_url (the canonical link back
                                     to source IS the direct primary-document link).
"""
from __future__ import annotations

from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "processed" / "atlas.duckdb"

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    cik             TEXT PRIMARY KEY,
    company_name    TEXT,
    ticker          TEXT,
    sic_code        TEXT,
    industry_label  TEXT,
    current_status  TEXT
);

CREATE TABLE IF NOT EXISTS filings (
    accession_number TEXT PRIMARY KEY,
    cik              TEXT,
    form_type        TEXT,
    filing_date      DATE,
    period_of_report DATE,
    sec_url          TEXT
);

CREATE TABLE IF NOT EXISTS footnotes (
    footnote_id           TEXT PRIMARY KEY,
    accession_number      TEXT,
    footnote_type         TEXT,    -- 'rev_rec' | 'going_concern'
    raw_text_excerpt      TEXT,
    char_count            INTEGER,
    extraction_method     TEXT,    -- 'xbrl' | 'ixbrl' | 'heuristic'
    extraction_confidence REAL,
    source_section_anchor TEXT
);

CREATE TABLE IF NOT EXISTS enforcement (
    cik                       TEXT,
    aaer_number               TEXT,
    release_date              DATE,
    period_of_alleged_conduct TEXT,
    summary                   TEXT,
    source_url                TEXT,
    PRIMARY KEY (cik, aaer_number)
);

CREATE TABLE IF NOT EXISTS findings (
    finding_id          TEXT PRIMARY KEY,
    query_footnote_id   TEXT,
    matched_footnote_id TEXT,
    similarity_score    REAL,
    llm_explanation     TEXT,
    model_version       TEXT,
    generated_at        TIMESTAMP,
    reviewed_status     TEXT
);
"""


# Cohort is DERIVED from enforcement membership (per DECISIONS_LOG C5), never stored.
# current_status keeps its DATA_MODEL meaning (active/delisted/etc; NULL when unknown).
ENFORCED_PRED = "cik IN (SELECT cik FROM enforcement)"
CLEAN_PRED = "cik NOT IN (SELECT cik FROM enforcement)"
COHORT_CASE = ("CASE WHEN cik IN (SELECT cik FROM enforcement) "
               "THEN 'enforced' ELSE 'clean' END")


def connect(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH), read_only=read_only)
    if not read_only:
        con.execute(SCHEMA)
    return con


if __name__ == "__main__":
    con = connect()
    tables = con.execute("SHOW TABLES").fetchall()
    print("DB at", DB_PATH)
    print("tables:", [t[0] for t in tables])
