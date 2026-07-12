"""Chapter D schema — structured-financials pillar (ADDITIVE; logged in DECISIONS_LOG C33).

Kept separate from db.py so the locked footnote/embedding/findings schema is untouched. These
tables are keyed on CIK + fiscal_year and join to the corpus via companies.cik. Nothing here
modifies existing tables. Idempotent (CREATE TABLE IF NOT EXISTS).
"""
from __future__ import annotations

import duckdb

# numeric line items assembled from XBRL companyfacts (annual, per fiscal year)
LINE_ITEMS = [
    "revenue", "cogs", "receivables", "inventory", "current_assets", "total_assets",
    "ppe_net", "depreciation", "sga", "current_liabilities", "total_liabilities",
    "ltd_noncurrent", "debt_current", "income_cont_ops", "net_income", "cfo",
    "cash", "st_investments", "lt_investments", "preferred_stock",
    "issuance_equity", "issuance_debt",
]

FINANCIALS_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS financials (\n"
    "    cik          TEXT,\n"
    "    fiscal_year  INTEGER,\n"
    "    fye_date     DATE,\n"
    + "".join(f"    {c:<13} DOUBLE,\n" for c in LINE_ITEMS) +
    "    source       TEXT DEFAULT 'companyfacts',\n"
    "    loaded_at    TIMESTAMP,\n"
    "    PRIMARY KEY (cik, fiscal_year)\n"
    ");\n"
    "\n"
    "CREATE TABLE IF NOT EXISTS accounting_scores (\n"
    "    cik                TEXT,\n"
    "    fiscal_year        INTEGER,\n"
    "    beneish_m          DOUBLE,\n"
    "    beneish_flag       BOOLEAN,\n"      # M > -1.78 per Beneish (1999)
    "    beneish_components TEXT,\n"          # JSON: 8 indices + raw inputs + neutral flags
    "    dechow_pred        DOUBLE,\n"
    "    dechow_prob        DOUBLE,\n"
    "    dechow_fscore      DOUBLE,\n"
    "    dechow_components  TEXT,\n"          # JSON: 7 inputs + raw components
    "    models_version     TEXT,\n"
    "    notes              TEXT,\n"          # honest reasons when a model is null
    "    computed_at        TIMESTAMP,\n"
    "    PRIMARY KEY (cik, fiscal_year)\n"
    ");\n"
)


def ensure_financials_schema(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(FINANCIALS_SCHEMA)


if __name__ == "__main__":
    from db import connect
    con = connect()
    ensure_financials_schema(con)
    print("financials schema ensured. tables:", [t[0] for t in con.execute("SHOW TABLES").fetchall()])
