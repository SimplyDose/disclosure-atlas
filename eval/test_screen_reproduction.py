"""Read-only paper replay and systematic-screen known answers."""
import builtins
import contextlib
import io
import importlib.util
import json
from pathlib import Path
import runpy
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "mcp"))


def load_replay():
    spec = importlib.util.spec_from_file_location("paper_replay", ROOT / "paper/final_tables.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestArchiveProtection(unittest.TestCase):
    def test_import_has_no_data_load_or_report_side_effect(self):
        with patch("atlas_data.AtlasData", side_effect=AssertionError("Import loaded data")), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            load_replay()
        self.assertEqual(output.getvalue(), "")

    def test_cohort_drift_fails_without_writing_archive(self):
        archive = ROOT / "paper/gc_cohort_2010_2026.csv"
        original = archive.read_bytes()
        real_open = builtins.open

        def guarded_open(path, mode="r", *args, **kwargs):
            if Path(path) == archive and any(flag in mode for flag in "wax+"):
                raise AssertionError("Replay attempted to overwrite its archived reference")
            return real_open(path, mode, *args, **kwargs)

        fake_data = types.SimpleNamespace(AtlasData=lambda: None)
        fake_cohort = types.SimpleNamespace(
            CohortSpec=lambda **kwargs: None,
            filtered_indices=lambda *args: [],
            build_panel=lambda *args: [{"cik": "0000000001", "fiscal_year": 2020, "enforced": 0}],
        )
        with patch.dict(sys.modules, {"atlas_data": fake_data, "cohort": fake_cohort}), \
                patch("builtins.open", guarded_open), patch.object(sys, "argv", ["final_tables.py"]), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, "differ from the paper archive"):
                runpy.run_path(str(ROOT / "paper/final_tables.py"), run_name="__main__")
        self.assertEqual(archive.read_bytes(), original)


class TestHistoricalScreen(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.replay = load_replay()
        with open(ROOT / "docs/AUDIT_2026-07-01_collapsed_company_years.csv") as source:
            import csv
            excluded = {(r["cik"], int(r["panel_fiscal_year"])) for r in csv.DictReader(source)}
        archive = ROOT / "paper/gc_cohort_2010_2026.csv"
        original = archive.read_bytes()
        cls.report = cls.replay.systematic_screen(excluded)
        cls.sensitivity = cls.replay.systematic_screen(excluded, exclude_singletons=True)
        if archive.read_bytes() != original:
            raise AssertionError("Screen replay changed its reference archive")

    def test_complete_published_family_and_survivors(self):
        report = self.report
        self.assertEqual((report["cohort_company_years"], report["subgroups"],
                          report["candidate_tests"], report["excluded_tests"], report["family_tests"]),
                         (4186, 258, 8772, 8312, 460))
        survivors = [r for r in report["tests"] if r["survives_bh_005"]]
        expected = [("full cohort", 1120, 0.11894927628681308, 6.592462991542765e-05),
                    ("no enforcement history", 1062, 0.11315734485917192, 0.00021976433041896962),
                    ("2020-2024", 539, 0.15512131624859965, 0.00030046641319743514)]
        self.assertEqual(len(survivors), 3)
        self.assertEqual(report["bonferroni_survivors"], 1)
        for result, (group, n, rho, p) in zip(survivors, expected, strict=True):
            self.assertEqual((result["language_measure"], result["financial_measure"],
                              result["subgroup"], result["n"]), ("dst", "m_tata", group, n))
            self.assertAlmostEqual(result["rho"], rho, places=12)
            self.assertAlmostEqual(result["p_raw_two_sided"], p, places=12)

    def test_corrections_match_scipy_across_all_460_tests(self):
        for report in (self.report, self.sensitivity):
            results = report["tests"]
            ps = np.array([r["p_raw_two_sided"] for r in results])
            np.testing.assert_allclose([r["q_bh"] for r in results],
                                       stats.false_discovery_control(ps, method="bh"), rtol=1e-14)
            np.testing.assert_allclose([r["p_bonferroni"] for r in results], np.minimum(1, ps * len(results)))

    def test_every_reported_test_matches_recorded_output(self):
        expected = json.loads((ROOT / "examples/expected_screen_results.json").read_text())
        self.assertEqual(len(expected["tests"]), len(self.report["tests"]))
        for actual, recorded in zip(self.report["tests"], expected["tests"], strict=True):
            for key in actual:
                if key in ("rho", "p_raw_two_sided", "p_bonferroni", "q_bh"):
                    self.assertAlmostEqual(actual[key], recorded[key], places=12)
                else:
                    self.assertEqual(actual[key], recorded[key])

    def test_singleton_sensitivity_is_separate_and_keeps_real_zero_values(self):
        nodes = [{"ind": "same peers", "sic": "1", "t": 1, "dst": 0.0},
                 {"ind": "same peers", "sic": "2", "t": 1, "dst": 0.2},
                 {"ind": "single peer", "sic": "1", "t": 1, "dst": 0.0},
                 {"ind": "", "sic": "3", "t": 1, "dst": 0.0}]
        self.assertEqual(self.replay.singleton_peer_indices(nodes), {2, 3})
        report = self.sensitivity
        self.assertEqual(report["excluded_singleton_excerpts"], 35)
        self.assertEqual((report["family_tests"], report["fdr_survivors"], report["bonferroni_survivors"]),
                         (460, 3, 2))
        self.assertEqual([r["n"] for r in report["principal_correlations"]], [1120, 1323, 1100, 1308])
        self.assertAlmostEqual(report["principal_correlations"][2]["rho"], 0.06928059162233705, places=12)
        self.assertAlmostEqual(report["principal_correlations"][3]["rho"], -0.027937317437283424, places=12)
        recorded = json.loads((ROOT / "examples/expected_singleton_sensitivity.json").read_text())
        for actual, expected in zip(report["tests"], recorded["tests"], strict=True):
            for key in actual:
                if key in ("rho", "p_raw_two_sided", "p_bonferroni", "q_bh"):
                    self.assertAlmostEqual(actual[key], expected[key], places=12)
                else:
                    self.assertEqual(actual[key], expected[key])

    def test_sensitivity_averages_available_excerpts_in_mixed_company_year(self):
        base = {"cik": "0000000001", "pfy": 2020, "t": 1, "name": "Fixture"}
        nodes = [{**base, "i": 0, "ind": "two peers", "dst": 0.0},
                 {**base, "i": 1, "ind": "two peers", "dst": 0.2},
                 {**base, "i": 2, "ind": "singleton", "dst": 0.0}]
        data = types.SimpleNamespace(nodes=nodes, scores={}, tickers={})
        with patch.object(self.replay, "AtlasData", return_value=data), \
                patch.object(self.replay, "filtered_indices", return_value=[0, 1, 2]), \
                patch.object(self.replay, "validate_archive"):
            _, cohort, _ = self.replay.load_cohort(exclude_singletons=True)
        self.assertEqual(cohort[0]["distinctiveness"], 0.1)
        self.assertEqual(nodes[2]["dst"], 0.0)  # Original bundle objects remain unchanged.

    def test_json_cli_uses_no_database_or_network_and_preserves_archive(self):
        guarded_run = """
import runpy, socket, sys, types
def deny(*args, **kwargs):
    raise AssertionError('Screen replay attempted database or network access')
socket.create_connection = deny
socket.socket.connect = deny
sys.modules['duckdb'] = types.SimpleNamespace(connect=deny)
sys.argv = ['paper/final_tables.py', '--screen-json']
runpy.run_path('paper/final_tables.py', run_name='__main__')
"""
        archive = ROOT / "paper/gc_cohort_2010_2026.csv"
        original = archive.read_bytes()
        run = subprocess.run([sys.executable, "-c", guarded_run], cwd=ROOT,
                             capture_output=True, text=True, timeout=30)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout), self.report)
        self.assertEqual(archive.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
