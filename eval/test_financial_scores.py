"""Financial-pillar tests — Beneish M-Score (1999) and Dechow F-Score (2011, Model 1).

Tests the actual production functions (`beneish`, `dechow` imported from
ingestion/compute_scores.py) against fixtures whose expected values are computed BY HAND
in the comments below (every arithmetic step shown), plus edge cases (missing fields,
zero denominators, extreme values) and a read-only cross-check against scores already
stored in atlas.duckdb.
"""
from __future__ import annotations

import json
import math
import unittest

from eval_common import INGESTION_DIR, add_path, duck_readonly, record_measurement

add_path(INGESTION_DIR)
from compute_scores import (BENEISH_THRESHOLD, DECHOW_UNCONDITIONAL,  # noqa: E402
                            beneish, dechow)

# A steady-state company: year t identical to t-1, CFO == income.
# Every Beneish index is then exactly 1 and TATA is 0, so
#   M = -4.840 + 0.920 + 0.528 + 0.404 + 0.892 + 0.115 - 0.172 + 0 - 0.327 = -2.480
STEADY = {
    "revenue": 1000.0, "receivables": 100.0, "cogs": 600.0, "current_assets": 400.0,
    "ppe_net": 300.0, "total_assets": 1000.0, "current_liabilities": 200.0, "cfo": 80.0,
    "income_cont_ops": 80.0, "depreciation": 50.0, "sga": 150.0, "ltd_noncurrent": 100.0,
}


def steady(**overrides) -> dict:
    d = dict(STEADY)
    d.update(overrides)
    return d


class TestBeneishKnownValues(unittest.TestCase):
    def test_steady_state_M_is_minus_2_48(self):
        m, flag, comp = beneish(steady(), steady())
        self.assertAlmostEqual(m, -2.48, places=4)
        self.assertFalse(flag)  # -2.48 < threshold -1.78 => not flagged
        for k in ("DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI"):
            self.assertAlmostEqual(comp[k], 1.0, places=4, msg=k)
        self.assertAlmostEqual(comp["TATA"], 0.0, places=4)

    def test_growth_case_hand_computed(self):
        # t-1 = STEADY; t below. Hand computation:
        #   DSRI = (300/2000)/(100/1000)            = 0.15/0.10        = 1.5
        #   GMI  = gm_p/gm_t = 0.4/0.5              = 0.8
        #          (gm_p=(1000-600)/1000=0.4, gm_t=(2000-1000)/2000=0.5)
        #   AQI  = soft_t/soft_p = 0.36/0.30        = 1.2
        #          (soft_t=1-(500+300)/1250=0.36, soft_p=1-(400+300)/1000=0.30)
        #   SGI  = 2000/1000                        = 2.0
        #   DEPI = 1.0 (depreciation missing -> documented neutral convention)
        #   SGAI = 1.0 (sga missing -> neutral)
        #   LVGI = ((250+125)/1250)/((200+100)/1000) = 0.30/0.30       = 1.0
        #   TATA = (200-100)/1250                   = 0.08
        #   M = -4.840 + .920*1.5 + .528*0.8 + .404*1.2 + .892*2.0 + .115*1
        #       - .172*1 + 4.679*0.08 - .327*1
        #     = -4.840 +1.380 +0.4224 +0.4848 +1.784 +0.115 -0.172 +0.37432 -0.327
        #     = -0.77848
        t = {"revenue": 2000.0, "receivables": 300.0, "cogs": 1000.0, "current_assets": 500.0,
             "ppe_net": 300.0, "total_assets": 1250.0, "current_liabilities": 250.0,
             "cfo": 100.0, "income_cont_ops": 200.0, "ltd_noncurrent": 125.0}
        m, flag, comp = beneish(t, steady())
        self.assertAlmostEqual(m, -0.7785, places=3)
        self.assertTrue(flag)  # -0.778 > -1.78 => flagged by the published threshold
        self.assertAlmostEqual(comp["DSRI"], 1.5, places=4)
        self.assertAlmostEqual(comp["GMI"], 0.8, places=4)
        self.assertAlmostEqual(comp["AQI"], 1.2, places=4)
        self.assertAlmostEqual(comp["SGI"], 2.0, places=4)
        self.assertAlmostEqual(comp["TATA"], 0.08, places=4)
        self.assertTrue(comp["neutral_depi"] and comp["neutral_sgai"])

    def test_flag_boundary_uses_published_threshold(self):
        self.assertEqual(BENEISH_THRESHOLD, -1.78)


class TestBeneishEdgeCases(unittest.TestCase):
    def test_missing_core_field_refuses_to_score(self):
        t = steady(); del t["cogs"]
        m, flag, reason = beneish(t, steady())
        self.assertIsNone(m); self.assertIsNone(flag)
        self.assertIn("insufficient", reason)

    def test_zero_prior_receivables_dsri_undefined(self):
        m, _, reason = beneish(steady(), steady(receivables=0.0))
        self.assertIsNone(m)
        self.assertIn("DSRI", reason)

    def test_nonpositive_sales_refused(self):
        for bad in (0.0, -5.0):
            m, _, reason = beneish(steady(revenue=bad), steady())
            self.assertIsNone(m, f"revenue={bad} should not score")
            self.assertIn("non-positive sales", reason)

    def test_nonpositive_total_assets_refused(self):
        m, _, reason = beneish(steady(total_assets=-1.0), steady())
        self.assertIsNone(m)
        self.assertIn("total assets", reason)

    def test_zero_prior_leverage_lvgi_undefined(self):
        m, _, reason = beneish(steady(), steady(current_liabilities=0.0, ltd_noncurrent=0.0))
        self.assertIsNone(m)
        self.assertIn("LVGI", reason)

    def test_no_income_anywhere_refused(self):
        t = steady(); del t["income_cont_ops"]
        m, _, reason = beneish(t, steady())
        self.assertIsNone(m)
        self.assertIn("TATA", reason)

    def test_net_income_fallback_is_flagged_in_components(self):
        t = steady(); del t["income_cont_ops"]; t["net_income"] = 80.0
        m, _, comp = beneish(t, steady())
        self.assertAlmostEqual(m, -2.48, places=4)
        self.assertTrue(comp["income_cont_ops_fallback_net"])

    def test_extreme_values_stay_finite(self):
        t = steady(revenue=1e15, receivables=9e14, cogs=1e12, total_assets=1e15,
                   current_assets=1e14, ppe_net=1e13, cfo=-1e14, income_cont_ops=9e14)
        m, flag, comp = beneish(t, steady())
        self.assertIsNotNone(m)
        self.assertTrue(math.isfinite(m))


# Dechow steady state: t == t-1 == t-2, so every delta term is 0 and only the
# soft-assets level term survives:
#   soft_assets = (1000 - 300 - 50)/1000 = 0.65
#   pred = -7.893 + 1.979*0.65 = -7.893 + 1.28635 = -6.60665
#   prob = 1/(1+e^{6.60665}) ~= 1.3495e-3
#   F    = prob/0.0037       ~= 0.3647   (an unremarkable, sub-1.0 F-Score)
D_STEADY = {
    "total_assets": 1000.0, "current_assets": 400.0, "current_liabilities": 200.0,
    "total_liabilities": 500.0, "receivables": 100.0, "revenue": 1000.0,
    "net_income": 50.0, "cash": 50.0, "ppe_net": 300.0, "inventory": 80.0,
}


def d_steady(**overrides) -> dict:
    d = dict(D_STEADY)
    d.update(overrides)
    return d


class TestDechowKnownValues(unittest.TestCase):
    def test_steady_state_hand_computed(self):
        pred, prob, f, comp = dechow(d_steady(), d_steady(), d_steady())
        self.assertAlmostEqual(pred, -6.6066, places=3)
        self.assertAlmostEqual(prob, 1.0 / (1.0 + math.exp(6.60665)), places=6)
        self.assertAlmostEqual(f, prob / DECHOW_UNCONDITIONAL, places=3)
        for k in ("rsst_accruals", "ch_receivables", "ch_inventory", "ch_cash_sales", "ch_roa"):
            self.assertAlmostEqual(comp[k], 0.0, places=4, msg=k)
        self.assertAlmostEqual(comp["soft_assets"], 0.65, places=4)
        self.assertEqual(comp["issuance"], 0)

    def test_issuance_dummy_adds_exactly_1_029(self):
        p0, *_ = dechow(d_steady(), d_steady(), d_steady())
        p1, _, _, comp = dechow(d_steady(issuance_equity=10.0), d_steady(), d_steady())
        self.assertAlmostEqual(p1 - p0, 1.029, places=4)
        self.assertEqual(comp["issuance"], 1)


class TestDechowEdgeCases(unittest.TestCase):
    def test_missing_t2_refused_with_reason(self):
        pred, prob, f, reason = dechow(d_steady(), d_steady(), None)
        self.assertIsNone(pred)
        self.assertIn("t-2", reason)

    def test_missing_core_field_refused(self):
        t = d_steady(); del t["cash"]
        pred, *_rest, reason = dechow(t, d_steady(), d_steady())
        self.assertIsNone(pred)
        self.assertIn("insufficient", reason)

    def test_zero_prior_cash_sales_refused(self):
        # cash sales(t-1) = rev(t-1) - (rec(t-1) - rec(t-2)) = 100 - (200-100) = 0
        p = d_steady(revenue=100.0, receivables=200.0)
        pp = d_steady(receivables=100.0)
        pred, *_rest, reason = dechow(d_steady(receivables=200.0), p, pp)
        self.assertIsNone(pred)
        self.assertIn("cash sales", reason)

    def test_nonpositive_assets_refused(self):
        pred, *_rest, reason = dechow(d_steady(total_assets=-10.0), d_steady(), d_steady())
        self.assertIsNone(pred)
        self.assertIn("total assets", reason)

    def test_missing_inventory_treated_as_zero_not_refused(self):
        t = d_steady(); del t["inventory"]
        p = d_steady(); del p["inventory"]
        pred, prob, f, comp = dechow(t, p, d_steady())
        self.assertIsNotNone(pred)
        self.assertAlmostEqual(comp["ch_inventory"], 0.0, places=4)

    def test_extreme_receivables_no_overflow(self):
        # ch_receivables enormous -> pred >> 0; the sign-stable logistic must not overflow
        pred, prob, f, _ = dechow(d_steady(receivables=1e12), d_steady(), d_steady())
        self.assertTrue(math.isfinite(pred) and math.isfinite(prob) and math.isfinite(f))
        self.assertLessEqual(prob, 1.0)
        self.assertAlmostEqual(f, prob / DECHOW_UNCONDITIONAL, places=4)


class TestAgainstStoredScores(unittest.TestCase):
    """Recompute stored accounting_scores rows from the raw financials table (read-only)
    and confirm the production pipeline's persisted numbers match the formulas."""

    @classmethod
    def setUpClass(cls):
        cls.con = duck_readonly()
        if cls.con is None:
            raise unittest.SkipTest("atlas.duckdb not readable — stored-score cross-check skipped")
        add_path(INGESTION_DIR)
        from db_financials import LINE_ITEMS
        cls.items = LINE_ITEMS

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "con", None):
            cls.con.close()

    def _fin(self, cik: str, fy: int) -> dict | None:
        cols = ",".join(self.items)
        row = self.con.execute(
            f"SELECT {cols} FROM financials WHERE cik=? AND fiscal_year=?", [cik, fy]).fetchone()
        return dict(zip(self.items, row)) if row else None

    def test_amd_fy2022_known_value(self):
        """AMD FY2022 beneish_m == -1.14 (the value the MCP harness also pins)."""
        row = self.con.execute(
            "SELECT beneish_m FROM accounting_scores WHERE cik='0000002488' AND fiscal_year=2022"
        ).fetchone()
        if row is None:
            self.skipTest("AMD FY2022 not in accounting_scores")
        self.assertAlmostEqual(row[0], -1.14, places=2)
        t, p = self._fin("0000002488", 2022), self._fin("0000002488", 2021)
        m, _, _ = beneish(t, p)
        self.assertAlmostEqual(m, row[0], places=4, msg="stored != recomputed from financials")

    def test_random_sample_of_stored_scores_recompute_exactly(self):
        rows = self.con.execute("""
            SELECT cik, fiscal_year, beneish_m, dechow_pred FROM accounting_scores
            WHERE beneish_m IS NOT NULL
            ORDER BY md5(cik || CAST(fiscal_year AS VARCHAR)) LIMIT 25""").fetchall()
        self.assertGreaterEqual(len(rows), 10, "too few stored scores to cross-check")
        checked_b = checked_d = 0
        for cik, fy, stored_m, stored_pred in rows:
            t, p, pp = self._fin(cik, fy), self._fin(cik, fy - 1), self._fin(cik, fy - 2)
            m, _, _ = beneish(t, p)
            self.assertIsNotNone(m, f"{cik} FY{fy}: stored score but recompute refused")
            self.assertAlmostEqual(m, stored_m, places=4, msg=f"{cik} FY{fy} beneish mismatch")
            checked_b += 1
            if stored_pred is not None:
                pred, *_ = dechow(t, p, pp)
                self.assertAlmostEqual(pred, stored_pred, places=4,
                                       msg=f"{cik} FY{fy} dechow mismatch")
                checked_d += 1
        record_measurement("stored_score_crosscheck",
                           {"beneish_checked": checked_b, "dechow_checked": checked_d})
        print(f"\n  Stored-score cross-check: {checked_b} Beneish + {checked_d} Dechow "
              f"rows recomputed exactly from raw financials")


if __name__ == "__main__":
    unittest.main(verbosity=2)
