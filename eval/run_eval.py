#!/usr/bin/env python
"""Single-command runner for the Disclosure Atlas eval harness.

    .venv/bin/python eval/run_eval.py            # everything (~3-6 min)
    .venv/bin/python eval/run_eval.py --fast     # skip the slow supervised probe
    .venv-offline/bin/python eval/run_eval.py --offline  # formula/edge tests, no data or models

Runs three suites (financial scores, footnote search, null-finding verification),
prints a per-suite and overall pass/fail summary, writes measured numbers to
eval/measurements.json, and exits non-zero on any failure. Read-only against all
repo data; writes nothing outside /eval. --offline selects only financial formula
and edge tests and writes no measurements.
"""
from __future__ import annotations

import argparse
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

SUITES = [
    ("Financial pillar (Beneish M / Dechow F)", "test_financial_scores"),
    ("Footnote search sanity", "test_footnote_search"),
    ("Null-finding verification", "test_null_finding"),
]

OFFLINE_SUITES = [
    ("Beneish known answers", "test_financial_scores.TestBeneishKnownValues"),
    ("Beneish edge cases", "test_financial_scores.TestBeneishEdgeCases"),
    ("Dechow known answers", "test_financial_scores.TestDechowKnownValues"),
    ("Dechow edge cases", "test_financial_scores.TestDechowEdgeCases"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    modes = ap.add_mutually_exclusive_group()
    modes.add_argument("--fast", action="store_true", help="skip the supervised AUC probe (slowest part)")
    modes.add_argument("--offline", action="store_true",
                       help="run only financial formula/edge tests; no data, models or measurements")
    args = ap.parse_args()

    summary, all_ok = [], True
    for title, module in OFFLINE_SUITES if args.offline else SUITES:
        print("\n" + "=" * 78 + f"\n{title}  ({module})\n" + "=" * 78)
        loader = unittest.TestLoader()
        suite = loader.loadTestsFromName(module)
        if args.fast and module == "test_null_finding":
            filtered = unittest.TestSuite()
            for group in suite:
                for test in group:
                    if "SupervisedProbe" not in test.id():
                        filtered.addTest(test)
            suite = filtered
        t0 = time.time()
        result = unittest.TextTestRunner(verbosity=2, stream=sys.stdout).run(suite)
        n = result.testsRun
        bad = len(result.failures) + len(result.errors)
        summary.append((title, n, n - bad - len(result.skipped), bad, len(result.skipped),
                        time.time() - t0))
        all_ok &= result.wasSuccessful()

    print("\n" + "=" * 78 + "\nSUMMARY\n" + "=" * 78)
    tot = [0, 0, 0, 0]
    for title, n, ok, bad, skipped, dt in summary:
        print(f"  {title:<45} {ok:>3} passed  {bad:>2} failed  {skipped:>2} skipped  ({dt:5.1f}s)")
        tot[0] += n; tot[1] += ok; tot[2] += bad; tot[3] += skipped
    print(f"  {'TOTAL':<45} {tot[1]:>3} passed  {tot[2]:>2} failed  {tot[3]:>2} skipped")
    print(f"\nOVERALL: {'PASS' if all_ok else 'FAIL'}")
    if args.offline:
        print("Offline formulas only; no datasets, models or measurements used.")
    else:
        print("Measured numbers written to eval/measurements.json")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
