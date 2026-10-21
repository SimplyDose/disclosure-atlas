"""Exercise the CLI without datasets, and prove a wrong known answer exits nonzero."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
FILES = (
    "eval/run_eval.py", "eval/eval_common.py", "eval/test_financial_scores.py",
    "ingestion/compute_scores.py", "ingestion/db.py", "ingestion/db_financials.py",
)

GUARDED_RUN = """
import runpy, socket, sys
import duckdb
def deny(*args, **kwargs):
    raise AssertionError("Offline check attempted a database or network connection")
duckdb.connect = deny
socket.create_connection = deny
socket.socket.connect = deny
sys.argv = ["eval/run_eval.py", "--offline"]
runpy.run_path("eval/run_eval.py", run_name="__main__")
"""


class TestOfflineRunner(unittest.TestCase):
    def test_no_external_resources_and_failure_reaches_exit_status(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in FILES:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)

            def run():
                return subprocess.run(
                    [sys.executable, "-c", GUARDED_RUN], cwd=root,
                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=30,
                )

            good = run()
            self.assertEqual(good.returncode, 0, good.stdout)
            self.assertIn("OVERALL: PASS", good.stdout)

            fixture = root / "eval/test_financial_scores.py"
            original = fixture.read_text()
            correct = "self.assertAlmostEqual(m, -2.48, places=4)"
            self.assertIn(correct, original)
            fixture.write_text(original.replace(correct, "self.assertAlmostEqual(m, -1.48, places=4)", 1))
            bad = run()
            self.assertEqual(bad.returncode, 1, bad.stdout)
            self.assertIn("OVERALL: FAIL", bad.stdout)
            self.assertIn("test_steady_state_M_is_minus_2_48", bad.stdout)
            self.assertEqual({str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}, set(FILES))


if __name__ == "__main__":
    unittest.main()
