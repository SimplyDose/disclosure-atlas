"""Null-finding verification — independently re-derives the going-concern study's core result.

The claim under test (VALIDATION_RESULTS.md, Chapter F, 161,469 footnotes):
    Disclosure language does NOT separate SEC-enforced from clean companies.
    Per-type separation (enforced<->enforced vs enforced->clean cosine), Cohen's d:
    every |d| < 0.2; the largest positive is going_concern at ~ +0.153.

This module re-derives that result with INDEPENDENT code (vectorized block-GEMM, written
fresh — it does not import or call validation/aaer_backtest.py), using the same underlying
artifacts: data/embeddings/embeddings.npy + meta.json. It then:

  1. checks corpus integrity (row alignment, L2 normalization, documented counts),
  2. recomputes Cohen's d per type and compares against validation/results.json,
  3. asserts the null actually holds (all d below the study's 0.2 effect-size bar),
  4. runs a POSITIVE CONTROL (footnote type must be highly separable on the same
     embeddings — otherwise a null would just mean broken embeddings),
  5. runs an independent supervised probe (company-grouped CV logistic regression:
     can ANY linear model find the enforcement signal? expected: no strong signal),
  6. re-derives the cleaned going-concern cohort counts (4,614 / 924 / 2,643 / 2,635)
     from atlas.duckdb (read-only) using the exact SQL in docs/STUDY_COHORT_GC_CLEANED.md.

Any discrepancy is flagged LOUDLY via test failure with the measured numbers in the message.
"""
from __future__ import annotations

import csv
import json
import unittest

import numpy as np

from eval_common import (AUDIT_CSV, DB_PATH, EMB_DIR, RESULTS_JSON, TYPES,
                         duck_readonly, record_measurement)

# Reported values we verify against (VALIDATION_RESULTS.md Chapter F + results.json).
REPORTED_D = {"rev_rec": -0.117, "going_concern": 0.153, "related_party": -0.253,
              "cam": 0.112, "mda": -0.057, "risk_factors": 0.015}
EFFECT_SIZE_BAR = 0.2          # the study's own threshold for "a small-but-real effect"
D_MATCH_TOL = 0.01             # re-derived d must match reported d this closely

_STATE: dict = {}


def setUpModule():
    """Load embeddings + metadata once (~0.5 GB, shared across tests)."""
    _STATE["vecs"] = np.load(EMB_DIR / "embeddings.npy")
    meta = json.loads((EMB_DIR / "meta.json").read_text())
    _STATE["meta"] = meta
    _STATE["cohort"] = np.array([m["cohort"] for m in meta])
    _STATE["typ"] = np.array([m["type"] for m in meta])
    _STATE["cik"] = np.array([m["cik"] for m in meta])


def _cohens_d(a: np.ndarray, b: np.ndarray) -> float:
    """Standard pooled-SD Cohen's d (independent implementation of the textbook formula)."""
    na, nb = len(a), len(b)
    pooled = np.sqrt(((na - 1) * a.var(ddof=1) + (nb - 1) * b.var(ddof=1)) / (na + nb - 2))
    return float((a.mean() - b.mean()) / pooled) if pooled > 0 else 0.0


def _separation_for_type(t: str) -> dict:
    """Per enforced footnote of type t: mean cosine to other-company enforced footnotes of t
    (intra) vs mean cosine to ALL clean footnotes of t (cross). Same definition as the study;
    fresh block-matrix implementation (one GEMM per type, not lazy per-row matvecs)."""
    vecs, cohort, typ, cik = _STATE["vecs"], _STATE["cohort"], _STATE["typ"], _STATE["cik"]
    idx_t = np.where(typ == t)[0]
    V = vecs[idx_t]
    coh_t, cik_t = cohort[idx_t], cik[idx_t]
    enf_local = np.where(coh_t == "enforced")[0]
    cln_local = np.where(coh_t == "clean")[0]
    S = (V[enf_local] @ V.T).astype(np.float64)          # n_enf x n_type cosines (L2-normed)
    cross = S[:, cln_local].mean(axis=1)
    Se = S[:, enf_local]                                  # n_enf x n_enf
    ciks_e = cik_t[enf_local]
    same_company = (ciks_e[None, :] == ciks_e[:, None])   # includes self on the diagonal
    n_other = (~same_company).sum(axis=1)
    intra = (Se.sum(axis=1) - (Se * same_company).sum(axis=1)) / n_other
    return {
        "intra_enforced_mean": round(float(intra.mean()), 4),
        "enforced_to_clean_mean": round(float(cross.mean()), 4),
        "mean_diff": round(float((intra - cross).mean()), 4),
        "cohens_d": round(_cohens_d(intra, cross), 3),
        "pct_enforced_closer": round(float((intra > cross).mean()), 3),
        "n_enforced": int(len(enf_local)), "n_clean": int(len(cln_local)),
    }


class TestCorpusIntegrity(unittest.TestCase):
    def test_row_alignment_and_counts(self):
        """embeddings.npy, meta.json, index_meta.json agree; corpus is the documented 161,469."""
        vecs, meta = _STATE["vecs"], _STATE["meta"]
        idx = json.loads((EMB_DIR / "index_meta.json").read_text())
        self.assertEqual(vecs.shape, (161469, 384), f"unexpected embedding shape {vecs.shape}")
        self.assertEqual(len(meta), 161469)
        self.assertEqual(idx["count"], 161469)
        self.assertEqual(idx["model"], "bge-small-en-v1.5")
        # row alignment: ids in index_meta must match meta footnote_ids at sampled positions
        rng = np.random.default_rng(0)
        for i in rng.choice(len(meta), 200, replace=False):
            self.assertEqual(idx["ids"][i], meta[i]["footnote_id"],
                             f"row {i}: index_meta id != meta footnote_id (misalignment)")

    def test_embeddings_unit_normalized(self):
        """Dot product == cosine only if rows are L2-normalized; verify on a sample."""
        rng = np.random.default_rng(1)
        sample = _STATE["vecs"][rng.choice(161469, 2000, replace=False)]
        norms = np.linalg.norm(sample, axis=1)
        self.assertLess(float(np.abs(norms - 1.0).max()), 1e-3,
                        "embeddings are not unit-normalized; cosine math would be wrong")

    def test_cohort_counts_match_study(self):
        """Enforced/clean per-type counts must match VALIDATION_RESULTS.md Chapter F."""
        expected_enf = {"rev_rec": 1687, "going_concern": 447, "related_party": 702,
                        "cam": 184, "mda": 940, "risk_factors": 1612}
        cohort, typ = _STATE["cohort"], _STATE["typ"]
        for t, n in expected_enf.items():
            got = int(((cohort == "enforced") & (typ == t)).sum())
            self.assertEqual(got, n, f"{t}: n_enforced {got} != documented {n}")


class TestNullFindingRederivation(unittest.TestCase):
    """The centerpiece: does the reported non-separation actually reproduce?"""

    @classmethod
    def setUpClass(cls):
        cls.derived = {t: _separation_for_type(t) for t in TYPES}
        record_measurement("separation_rederived", cls.derived)
        print("\n  Re-derived separation (independent implementation):")
        for t, d in cls.derived.items():
            print(f"    {t:<14} d={d['cohens_d']:+.3f}  diff={d['mean_diff']:+.4f}  "
                  f"n_enf={d['n_enforced']}")

    def test_matches_stored_results_json(self):
        """Re-derived numbers must match validation/results.json (the study's own artifact)."""
        stored = json.loads(RESULTS_JSON.read_text())["separation"]
        for t in TYPES:
            with self.subTest(type=t):
                s, d = stored[t], self.derived[t]
                self.assertLessEqual(abs(s["cohens_d"] - d["cohens_d"]), D_MATCH_TOL,
                    f"DISCREPANCY {t}: re-derived d={d['cohens_d']} vs stored {s['cohens_d']}")
                self.assertLessEqual(abs(s["mean_diff"] - d["mean_diff"]), 0.002,
                    f"DISCREPANCY {t}: mean_diff {d['mean_diff']} vs stored {s['mean_diff']}")
                self.assertEqual(s["n_enforced"], d["n_enforced"])

    def test_matches_reported_writeup(self):
        """Re-derived d must match the numbers published in VALIDATION_RESULTS.md Chapter F."""
        for t, rep in REPORTED_D.items():
            with self.subTest(type=t):
                self.assertLessEqual(abs(self.derived[t]["cohens_d"] - rep), D_MATCH_TOL,
                    f"DISCREPANCY {t}: re-derived d={self.derived[t]['cohens_d']} vs "
                    f"written-up {rep} — the writeup does not match the data")

    def test_null_finding_holds(self):
        """The actual claim: no type reaches the d >= 0.2 bar with positive diff."""
        violations = {t: d["cohens_d"] for t, d in self.derived.items()
                      if d["mean_diff"] > 0 and d["cohens_d"] >= EFFECT_SIZE_BAR}
        self.assertFalse(violations,
            f"*** NULL FINDING DOES NOT HOLD *** types crossing d>={EFFECT_SIZE_BAR}: {violations}")

    def test_going_concern_is_weak_positive_but_below_bar(self):
        """The writeup's nuance: gc is the largest positive tendency (~0.15), still sub-threshold."""
        d = self.derived["going_concern"]["cohens_d"]
        self.assertGreater(d, 0.0, "gc separation is not even weakly positive as reported")
        self.assertLess(d, EFFECT_SIZE_BAR, f"gc d={d} crosses the bar — would CONTRADICT the null")


class TestPositiveControl(unittest.TestCase):
    def test_type_is_separable_on_same_embeddings(self):
        """If the embeddings couldn't separate ANYTHING, the null would be vacuous. The study's
        adversarial reviewer showed footnote-type classification reaches AUC 1.000 on the v1
        corpus (2 types). Analogue on the 6-type 161k corpus: logistic regression, company-
        grouped holdout, macro one-vs-rest AUC must be high."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import roc_auc_score
        from sklearn.model_selection import GroupShuffleSplit
        vecs, typ, cik = _STATE["vecs"], _STATE["typ"], _STATE["cik"]
        rng = np.random.default_rng(0)
        samp = rng.choice(len(typ), 20000, replace=False)
        X = vecs[samp]
        y = np.array([TYPES.index(t) for t in typ[samp]])
        tr, te = next(GroupShuffleSplit(1, test_size=0.3, random_state=0)
                      .split(X, y, cik[samp]))
        clf = LogisticRegression(max_iter=2000).fit(X[tr], y[tr])
        auc = float(roc_auc_score(y[te], clf.predict_proba(X[te]), multi_class="ovr"))
        acc = float(clf.score(X[te], y[te]))
        record_measurement("positive_control_type", {"macro_ovr_auc": auc, "accuracy_6way": acc})
        print(f"\n  Positive control: 6-way type LR — macro OVR AUC = {auc:.3f}, acc = {acc:.3f}")
        self.assertGreater(auc, 0.9,
            f"embeddings can't even separate footnote TYPE (AUC={auc:.3f}) — the enforcement "
            f"null would be meaningless (broken pipeline, not a real null)")


class TestSupervisedProbe(unittest.TestCase):
    """Company-grouped CV: can a linear model find enforcement signal the similarity test missed?

    IMPORTANT SCOPE NOTE: the study's published AUC figures (rev_rec 0.506±0.030,
    going_concern 0.609±0.090) were measured on the RETIRED v1 corpus (3,088 footnotes,
    283 hand-matched clean companies) whose embeddings no longer exist in the repo, so those
    exact numbers are NOT reproducible from current artifacts. This probe is an EXTENSION to
    the current 161k corpus. The published, load-bearing claim for THIS corpus is the
    similarity-separation null (all Cohen's d < 0.2), which TestNullFindingRederivation
    verifies exactly. Here we assert only that no STRONG, usable classifier signal exists
    (AUC < 0.75), and we loudly surface whatever we measure — including that AUC on this
    corpus runs above the old v1 figures (~0.64-0.69, whether or not clean rows are matched
    to the enforced cohort's 2-digit SIC and filing-era window)."""

    STRONG_SIGNAL_BAR = 0.75

    def _auc(self, t: str, matched: bool) -> tuple[float, float, int, int]:
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import roc_auc_score
        from sklearn.model_selection import StratifiedGroupKFold
        vecs, cohort, typ, cik = (_STATE["vecs"], _STATE["cohort"], _STATE["typ"], _STATE["cik"])
        meta = _STATE["meta"]
        sic2 = np.array([(m.get("sic") or "")[:2] for m in meta])
        year = np.array([int((m.get("filing_date") or "0")[:4] or 0) for m in meta])
        enf = np.where((cohort == "enforced") & (typ == t))[0]
        cln = np.where((cohort == "clean") & (typ == t))[0]
        if matched:  # crude cohort matching: enforced 2-digit-SIC pool + filing-era window
            keep = (np.isin(sic2[cln], list(set(sic2[enf])))
                    & (year[cln] >= year[enf].min()) & (year[cln] <= year[enf].max()))
            cln = cln[keep]
        rng = np.random.default_rng(0)
        if len(cln) > 12000:
            cln = rng.choice(cln, 12000, replace=False)
        idx = np.concatenate([enf, cln])
        X, y, groups = vecs[idx], (cohort[idx] == "enforced").astype(int), cik[idx]
        aucs = []
        for tr, te in StratifiedGroupKFold(5, shuffle=True, random_state=0).split(X, y, groups):
            assert not set(groups[tr]) & set(groups[te]), "company leakage across folds"
            clf = LogisticRegression(max_iter=2000, C=1.0).fit(X[tr], y[tr])
            aucs.append(roc_auc_score(y[te], clf.predict_proba(X[te])[:, 1]))
        return float(np.mean(aucs)), float(np.std(aucs)), len(enf), len(cln)

    def _probe(self, t: str):
        out = {}
        for matched in (False, True):
            mean, sd, ne, nc = self._auc(t, matched)
            key = "matched_sic2_era" if matched else "unmatched"
            out[key] = {"auc_mean": round(mean, 3), "auc_sd": round(sd, 3),
                        "n_enforced": ne, "n_clean": nc}
            print(f"\n  Supervised probe {t} ({key}): grouped-CV AUC = {mean:.3f} ± {sd:.3f}")
            if mean >= 0.6:
                print(f"    ** FLAG: above the v1-corpus figure — see REPORT.md; still below "
                      f"the {self.STRONG_SIGNAL_BAR} strong-signal bar **")
            self.assertLess(mean, self.STRONG_SIGNAL_BAR,
                f"*** {t} AUC {mean:.3f} ({key}) is a STRONG signal — contradicts the null ***")
        record_measurement(f"supervised_auc_{t}", out)

    def test_rev_rec_no_strong_signal(self):
        self._probe("rev_rec")

    def test_going_concern_no_strong_signal(self):
        self._probe("going_concern")


# The exact cleaned-cohort SQL from docs/STUDY_COHORT_GC_CLEANED.md §2 (copied verbatim).
COHORT_SQL_WHERE = r"""
    f.footnote_type = 'going_concern'
    AND regexp_matches(lower(f.raw_text_excerpt), 'substantial doubt')
    AND NOT regexp_matches(lower(f.raw_text_excerpt),
        'asu\s*(no\.?\s*)?2014-15|asc\s*205-40|issued (new )?guidance|financial accounting standards board|fasb (issued|has issued)|requires management to (assess|evaluate)|recently (issued|adopted) accounting')
    AND NOT regexp_matches(lower(f.raw_text_excerpt),
        '(if|unless|should) (we|the company|it)[^.]{0,80}(unable to|not be able to|cannot) continue as a going concern|may (be unable|not be able) to continue as a going concern')
"""


class TestCleanedCohortCounts(unittest.TestCase):
    """Re-derive docs/STUDY_COHORT_GC_CLEANED.md §3 counts from atlas.duckdb (read-only)."""

    @classmethod
    def setUpClass(cls):
        cls.con = duck_readonly()
        if cls.con is None:
            raise unittest.SkipTest(f"atlas.duckdb not readable at {DB_PATH} — counts unverified")

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "con", None):
            cls.con.close()

    def test_counts_reproduce_digit_exact(self):
        con = self.con
        raw = con.execute(
            "SELECT COUNT(*) FROM footnotes WHERE footnote_type='going_concern'").fetchone()[0]
        self.assertEqual(raw, 8914, f"raw GC footnotes {raw} != documented 8,914")

        n_fn = con.execute(f"SELECT COUNT(*) FROM footnotes f WHERE {COHORT_SQL_WHERE}").fetchone()[0]
        n_cik, n_cy = con.execute(f"""
            SELECT COUNT(DISTINCT g.cik),
                   COUNT(DISTINCT CASE WHEN g.period_of_report IS NOT NULL
                         THEN g.cik || '|' || year(g.period_of_report) END)
            FROM footnotes f JOIN filings g ON f.accession_number = g.accession_number
            WHERE {COHORT_SQL_WHERE}""").fetchall()[0]

        keys = con.execute(f"""
            SELECT DISTINCT g.cik || '|' || year(g.period_of_report)
            FROM footnotes f JOIN filings g ON f.accession_number = g.accession_number
            WHERE g.period_of_report IS NOT NULL AND {COHORT_SQL_WHERE}""").fetchall()
        cohort_keys = {r[0] for r in keys}
        with open(AUDIT_CSV) as fh:
            collapsed = {f"{r['cik']}|{r['panel_fiscal_year']}" for r in csv.DictReader(fh)}
        n_collapsed_hit = len(cohort_keys & collapsed)
        final = len(cohort_keys) - n_collapsed_hit

        got = {"footnotes": n_fn, "ciks": n_cik, "company_years": n_cy,
               "collapsed_overlap": n_collapsed_hit, "final_cohort": final}
        record_measurement("gc_cleaned_cohort_counts", got)
        print(f"\n  Cleaned GC cohort re-derived: {got}")
        expected = {"footnotes": 4614, "ciks": 924, "company_years": 2643,
                    "collapsed_overlap": 8, "final_cohort": 2635}
        self.assertEqual(got, expected,
            f"*** COHORT COUNT DISCREPANCY *** got {got}, study documents {expected}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
