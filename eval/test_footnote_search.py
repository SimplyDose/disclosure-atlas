"""Footnote-search sanity tests — the retrieval pillar (161k+ footnotes).

Exercises the REAL production path: mcp/server.py `search_disclosures` (the same in-process
call the MCP server exposes), which embeds the query locally with bge-small-en-v1.5 and ranks
by cosine over the shipped int8 bundle. Checks:
  - representative queries return topically relevant results (right footnote type dominates),
  - type filtering is respected,
  - empty / whitespace queries are rejected gracefully (ValueError, no crash),
  - garbage queries don't crash and score clearly lower than a relevant query,
  - top_k limits are honored and results are rank-ordered by similarity.

First run may download the small embedding model to the local HF cache if not present.
"""
from __future__ import annotations

import unittest

from eval_common import MCP_DIR, add_path, record_measurement

add_path(MCP_DIR)

_S = {}


def setUpModule():
    import server  # noqa: F401 — loads the bundle (nodes/excerpts) + registers tools
    _S["server"] = server


def _search(query, **kw):
    return _S["server"].search_disclosures(query, **kw)


def _type_share(results, want: str) -> float:
    return sum(1 for r in results if r["footnote_type"] == want) / max(1, len(results))


class TestRelevantQueries(unittest.TestCase):
    """For each representative query, the matching footnote type should dominate the top-10
    of an UNFILTERED search over all 6 types, and top similarity should be high."""

    def _check(self, query, want_type, min_share=0.6, min_top_sim=0.65):
        res = _search(query, top_k=10)
        hits = res["results"]
        self.assertEqual(len(hits), 10)
        share = _type_share(hits, want_type)
        record_measurement(f"search[{want_type}]",
                           {"query": query, "type_share@10": share,
                            "top_similarity": hits[0]["similarity"]})
        print(f"\n  '{query[:48]}...' -> {want_type} share@10={share:.0%}, "
              f"top cos={hits[0]['similarity']}")
        self.assertGreaterEqual(share, min_share,
            f"only {share:.0%} of top-10 are {want_type} for query {query!r}")
        self.assertGreaterEqual(hits[0]["similarity"], min_top_sim)

    def test_going_concern_query(self):
        self._check("substantial doubt about the company's ability to continue as a going concern",
                    "going_concern")

    def test_revenue_recognition_query(self):
        self._check("revenue is recognized over time as performance obligations are satisfied "
                    "under contracts with customers", "revenue_recognition")

    def test_related_party_query(self):
        self._check("loans and consulting fees paid to the chief executive officer and family "
                    "members of directors", "related_party")

    def test_risk_factor_query(self):
        self._check("we face intense competition and our operating results may fluctuate "
                    "significantly which could cause the price of our common stock to decline",
                    "risk_factors", min_share=0.5)


class TestFiltersAndShape(unittest.TestCase):
    def test_type_filter_respected(self):
        res = _search("liquidity and management's plans", footnote_types=["going_concern"], top_k=15)
        self.assertTrue(res["results"])
        for r in res["results"]:
            self.assertEqual(r["footnote_type"], "going_concern")

    def test_top_k_honored_and_rank_ordered(self):
        res = _search("goodwill impairment", top_k=7)
        hits = res["results"]
        self.assertEqual(len(hits), 7)
        sims = [r["similarity"] for r in hits]
        self.assertEqual(sims, sorted(sims, reverse=True), "results not sorted by similarity")
        self.assertEqual([r["rank"] for r in hits], list(range(1, 8)))

    def test_result_fields_present(self):
        r = _search("deferred revenue", top_k=1)["results"][0]
        for field in ("company_name", "cik", "footnote_type", "similarity", "excerpt",
                      "edgar_url", "enforced"):
            self.assertIn(field, r)
        self.assertTrue(r["excerpt"].strip(), "excerpt is empty")


class TestDegenerateQueries(unittest.TestCase):
    def test_empty_query_rejected(self):
        with self.assertRaises(ValueError):
            _search("")

    def test_whitespace_query_rejected(self):
        with self.assertRaises(ValueError):
            _search("   \n\t  ")

    def test_garbage_query_no_crash_and_low_similarity(self):
        garbage = _search("zzqx vlurp snorfblat 99871 xyzzy plugh", top_k=10)
        self.assertEqual(len(garbage["results"]), 10)  # returns *something*, gracefully
        relevant = _search("substantial doubt about ability to continue as a going concern",
                           top_k=1)
        g_top = garbage["results"][0]["similarity"]
        r_top = relevant["results"][0]["similarity"]
        record_measurement("garbage_vs_relevant_top_sim", {"garbage": g_top, "relevant": r_top})
        print(f"\n  garbage top cos={g_top} vs relevant top cos={r_top}")
        self.assertLess(g_top, r_top,
                        "garbage query scores as high as a genuinely relevant query")

    def test_unknown_footnote_type_fails_gracefully(self):
        try:
            _search("revenue", footnote_types=["not_a_real_type"], top_k=5)
        except (ValueError, KeyError) as e:
            self.assertTrue(str(e), "error carries no message")  # informative, not a crash
        else:
            pass  # tolerating-and-ignoring an unknown type is also acceptable


if __name__ == "__main__":
    unittest.main(verbosity=2)
