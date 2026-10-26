"""Known-answer checks for the runnable paper example."""
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "examples"))
import going_concern as example


class TestPairwiseSpearman(unittest.TestCase):
    def test_missing_pairs_are_excluded_together_and_zero_is_retained(self):
        rows = [{"x": 0, "y": 30}, {"x": 1, "y": 20}, {"x": 2, "y": 10},
                {"x": None, "y": 999}, {"x": 999, "y": None},
                {"x": math.inf, "y": 1}, {"x": 1, "y": math.nan}]
        result = example.pairwise_spearman(rows, "x", "y")
        self.assertEqual(result["n"], 3)
        self.assertAlmostEqual(result["rho"], -1.0)

    def test_insufficient_and_constant_pairs_are_rejected(self):
        for rows in ([{"x": 1, "y": 2}],
                     [{"x": 1, "y": n} for n in range(3)]):
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                example.pairwise_spearman(rows, "x", "y")

    def test_incorrect_expected_result_fails(self):
        with self.assertRaisesRegex(ValueError, "does not match"):
            example.check_expected("fixture", 0.9, 0.8)


class TestPaperExample(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = example.build_result()

    def test_paper_cohort_coverage_and_correlations(self):
        self.assertEqual(self.report["cohort"], {"company_years": 4186, "companies": 1373,
                                               "fiscal_year_min": 2010, "fiscal_year_max": 2026})
        expected = [
            ("gunning_fog", "beneish_m", 1120, 0.0217550731),
            ("gunning_fog", "dechow_fscore", 1323, 0.0269396617),
            ("distinctiveness", "beneish_m", 1120, 0.0598007988),
            ("distinctiveness", "dechow_fscore", 1323, -0.0281205488),
        ]
        for result, (x, y, n, rho) in zip(self.report["correlations"], expected, strict=True):
            with self.subTest(x=x, y=y):
                self.assertEqual((result["x"], result["y"], result["n"]), (x, y, n))
                self.assertAlmostEqual(result["rho"], rho, places=8)
        self.assertEqual(self.report["checks"], "PASS")

    def test_archived_cohort_duplicates_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "cohort.csv"
            source.write_text("cik,fiscal_year,enforced\n0000002488,2010,0\n0000002488,2010,0\n")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                example.read_archived_cohort(source)

    def test_invalid_archived_key_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "cohort.csv"
            source.write_text("cik,fiscal_year,enforced\n2488,2010,0\n")
            with self.assertRaises(ValueError):
                example.read_archived_cohort(source)

    def test_cli_needs_no_network_or_database_and_does_not_overwrite(self):
        guarded_run = """
import runpy, socket, sys, types

def deny(*args, **kwargs):
    raise AssertionError('Paper example attempted a network or database connection')
socket.create_connection = deny
socket.socket.connect = deny
sys.modules['duckdb'] = types.SimpleNamespace(connect=deny)
sys.argv = ['examples/going_concern.py']
runpy.run_path('examples/going_concern.py', run_name='__main__')
"""
        run = subprocess.run([sys.executable, "-c", guarded_run], cwd=ROOT,
                             capture_output=True, text=True, timeout=30)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout), self.report)
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "result.json"
            command = [sys.executable, str(ROOT / "examples/going_concern.py"), "--output", str(target)]
            first = subprocess.run(command, cwd=temp, capture_output=True, text=True, timeout=30)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(json.loads(target.read_text()), self.report)
            original = target.read_bytes()
            second = subprocess.run(command, cwd=temp, capture_output=True, text=True, timeout=30)
            self.assertNotEqual(second.returncode, 0)
            self.assertEqual(target.read_bytes(), original)
            self.assertIn("File exists", second.stderr)


if __name__ == "__main__":
    unittest.main()
