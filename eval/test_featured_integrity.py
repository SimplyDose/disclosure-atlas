"""Known-answer checks for featured-pair export integrity."""
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app" / "scripts"))
from build_app_data import build_featured


class TestFeaturedIntegrity(unittest.TestCase):
    def test_matching_score_is_retained_and_invalid_scores_are_rejected(self):
        vectors = np.array([[1.0, 0.0], [0.6, 0.8]])
        base = {"a": {"footnote_id": "a"}, "b": {"footnote_id": "b"},
                "footnote_type": "rev_rec", "explanation": "Fixture note"}
        for score in [0.6, 0.60004, 0.99, float("nan"), float("inf"), None]:
            with self.subTest(score=score):
                result = build_featured([{**base, "similarity": score}], {"a": 0, "b": 1}, vectors)
                self.assertEqual(len(result), int(score in [0.6, 0.60004]))
        self.assertEqual(build_featured([{**base, "similarity": 0.6}], {"a": 0}, vectors), [])
        self.assertEqual(build_featured([{**base, "similarity": 0.6}], {"a": 0, "b": 1}, np.zeros((2, 2))), [])

    def test_actual_shipped_vectors_reject_both_retired_source_scores(self):
        nodes = json.loads((ROOT / "app/public/data/nodes.json").read_text())
        vectors = np.fromfile(ROOT / "app/public/data/embeddings.bin", dtype=np.int8).reshape(len(nodes), 384)
        findings = [{"a": {"footnote_id": "101616"}, "b": {"footnote_id": str(j)},
                     "footnote_type": "going_concern", "similarity": score,
                     "explanation": "Retired source annotation"}
                    for j, score in [(102169, 0.9998999834060669), (102080, 0.9937999844551086)]]
        mapping = {str(i): i for i in [101616, 102169, 102080]}
        self.assertEqual(build_featured(findings, mapping, vectors), [])


if __name__ == "__main__":
    unittest.main()
