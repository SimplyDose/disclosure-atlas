"""Reproduce the paper's primary cohort and four language/financial-score correlations.

Reads the versioned website bundle and archived cohort. No database, model download,
credentials or network calls. Run from any directory; JSON goes to stdout by default.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np
import scipy
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "mcp"))
from atlas_data import AtlasData
from cohort import CohortSpec, build_panel, filtered_indices

ARCHIVE = ROOT / "paper/gc_cohort_2010_2026.csv"
EXCLUSIONS = ROOT / "docs/AUDIT_2026-07-01_collapsed_company_years.csv"
EXPECTED = (
    ("gunning_fog", "beneish_m", 1120, 0.0217550731),
    ("gunning_fog", "dechow_fscore", 1323, 0.0269396617),
    ("distinctiveness", "beneish_m", 1120, 0.0598007988),
    ("distinctiveness", "dechow_fscore", 1323, -0.0281205488),
)


def read_archived_cohort(path: Path) -> dict:
    """Keep company identifiers as strings and reject ambiguous archived keys."""
    archived = {}
    with path.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != ["cik", "fiscal_year", "enforced"]:
            raise ValueError("Archived cohort must have cik,fiscal_year,enforced columns")
        for row in reader:
            cik, year, enforced = row["cik"], int(row["fiscal_year"]), int(row["enforced"])
            if len(cik) != 10 or not cik.isascii() or not cik.isdigit():
                raise ValueError("Archived CIK must contain exactly ten digits")
            if not 2010 <= year <= 2026 or enforced not in (0, 1):
                raise ValueError("Invalid archived fiscal year or enforcement indicator")
            key = (cik, year)
            if key in archived:
                raise ValueError(f"Archived cohort contains duplicate key {key}")
            archived[key] = enforced
    return archived


def pairwise_spearman(rows: list[dict], x: str, y: str) -> dict:
    """Drop a row only for this pair if either measure is missing or nonfinite."""
    pairs = [(row[x], row[y]) for row in rows
             if row[x] is not None and row[y] is not None
             and math.isfinite(row[x]) and math.isfinite(row[y])]
    if len(pairs) < 3 or len({p[0] for p in pairs}) < 2 or len({p[1] for p in pairs}) < 2:
        raise ValueError(f"{x}/{y} needs at least three pairs and two distinct values per measure")
    rho, p = spearmanr(*zip(*pairs))
    return {"x": x, "y": y, "n": len(pairs), "rho": float(rho), "p_raw_two_sided": float(p)}


def check_expected(label: str, actual: float, expected: float) -> None:
    # Tolerance admits floating-point differences, not a change in the published result.
    if not math.isclose(actual, expected, rel_tol=0, abs_tol=5e-8):
        raise ValueError(f"{label}: {actual} does not match expected {expected}")


def build_result() -> dict:
    data = AtlasData()
    rows = build_panel(data, filtered_indices(data, CohortSpec(types={1})))
    with EXCLUSIONS.open(newline="", encoding="utf-8") as source:
        excluded = {(r["cik"], int(r["panel_fiscal_year"])) for r in csv.DictReader(source)}
    cohort = [row for row in rows if 2010 <= row["fiscal_year"] <= 2026
              and (row["cik"], row["fiscal_year"]) not in excluded]
    actual_keys = {(r["cik"], r["fiscal_year"]): r["enforced"] for r in cohort}
    if actual_keys != read_archived_cohort(ARCHIVE):
        raise ValueError("Rebuilt cohort keys/enforcement indicators differ from the paper archive")

    n_companies = len({row["cik"] for row in cohort})
    check_expected("company-years", len(cohort), 4186)
    check_expected("companies", n_companies, 1373)
    correlations = []
    for x, y, expected_n, expected_rho in EXPECTED:
        result = pairwise_spearman(cohort, x, y)
        check_expected(f"{x}/{y} coverage", result["n"], expected_n)
        check_expected(f"{x}/{y} rho", result["rho"], expected_rho)
        correlations.append(result)

    sources = [ARCHIVE, EXCLUSIONS] + [ROOT / "app/public/data" / name
                                      for name in ("nodes.json", "scores.json", "tickers.json", "manifest.json")]
    return {
        "analysis": "Paper Table 2: primary going-concern cohort, pairwise-complete Spearman correlations",
        "scope": "Versioned derived-bundle check; raw filing extraction and the 460-test screen are separate analyses",
        "cohort": {"company_years": len(cohort), "companies": n_companies,
                   "fiscal_year_min": min(r["fiscal_year"] for r in cohort),
                   "fiscal_year_max": max(r["fiscal_year"] for r in cohort)},
        "correlations": correlations,
        "inference": "Raw p-values describe these four pairs; they do not apply the paper's multiple-testing correction",
        "versions": {"numpy": np.__version__, "scipy": scipy.__version__},
        "source_sha256": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
        "checks": "PASS",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write JSON to a new file instead of stdout; never overwrite")
    args = parser.parse_args()
    try:
        output = json.dumps(build_result(), indent=2, allow_nan=False) + "\n"
        if args.output:
            with args.output.open("x", encoding="utf-8") as destination:
                destination.write(output)
        else:
            print(output, end="")
    except (OSError, ValueError) as error:
        parser.exit(1, f"Check failed: {error}\n")


if __name__ == "__main__":
    main()
