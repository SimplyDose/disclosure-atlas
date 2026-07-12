"""Shared paths + loaders for the /eval harness. ADD-ONLY: reads existing repo data,
never writes outside /eval, opens DuckDB strictly read_only=True."""
from __future__ import annotations

import json
import sys
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
ROOT = EVAL_DIR.parent
EMB_DIR = ROOT / "data" / "embeddings"
DB_PATH = ROOT / "data" / "processed" / "atlas.duckdb"
RESULTS_JSON = ROOT / "validation" / "results.json"
AUDIT_CSV = ROOT / "docs" / "AUDIT_2026-07-01_collapsed_company_years.csv"
INGESTION_DIR = ROOT / "ingestion"
MCP_DIR = ROOT / "mcp"
MEASUREMENTS = EVAL_DIR / "measurements.json"  # written by tests, inside /eval only

TYPES = ("rev_rec", "going_concern", "related_party", "cam", "mda", "risk_factors")


def add_path(p: Path) -> None:
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)


def duck_readonly():
    """Read-only DuckDB connection, or None if the DB is missing/locked."""
    import duckdb
    try:
        return duckdb.connect(str(DB_PATH), read_only=True)
    except Exception:
        return None


def record_measurement(key: str, value) -> None:
    """Append a measured result to eval/measurements.json (new file inside /eval)."""
    data = {}
    if MEASUREMENTS.exists():
        try:
            data = json.loads(MEASUREMENTS.read_text())
        except Exception:
            data = {}
    data[key] = value
    MEASUREMENTS.write_text(json.dumps(data, indent=2))
