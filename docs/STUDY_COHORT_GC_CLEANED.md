# STUDY COHORT — Cleaned Going-Concern Sample (citable, reproducible)

**Date:** 2026-07-01 · **Source:** `data/processed/atlas.duckdb` (read-only) · **Derived from:** the going-concern label-reliability review (2026-07-01) and the C55 computational-correctness audit (`docs/CORRECTNESS_AUDIT_2026-07-01.md`).

This document defines a higher-precision going-concern research cohort by filtering the tool's 8,914 `going_concern` footnotes to genuine substantial-doubt disclosures. It records the exact filter, the resulting counts, the collapsed-company-year exclusion, and the manual-review evidence, so the sample construction can be stated accurately in a paper and re-derived exactly.

---

## 1. Background: how the base label was constructed

Footnotes were classified into 6 types by a **rule-based extractor** (`ingestion/extract_footnotes.py`) — no ML model:

- **iXBRL path** (13% of GC footnotes, `extraction_confidence` 0.95): text from filer-tagged inline-XBRL blocks `SubstantialDoubtAboutGoingConcernTextBlock` and `LiquidityDisclosureGoingConcernPolicyTextBlock` (note: the latter is *liquidity*, broader than substantial doubt).
- **Heuristic path** (87%, confidence 0.43–0.65): a paragraph qualifies only if it contains both "going concern" AND substantial-doubt-family language; after paragraph-merging, the per-chunk re-filter relaxes to either phrase, admitting some off-topic sub-fragments.

A manual review (~35 excerpts across 3 strata, plus corpus-wide regex counts over all 8,914) estimated **~70–80% footnote-level precision** for the raw label, with three systematic contamination buckets:

| Bucket | Share of 8,914 | Nature |
|---|---|---|
| (a) Accounting-standard descriptions | ~8.4% (749) | Quotes/describes ASU 2014-15 / ASC 205-40 ("requires management to assess…") — not the entity's own doubt; appears in healthy filers |
| (b) Conditional risk-factor boilerplate | ~12.6% (1,124) | "If we cannot raise capital, we may be unable to continue as a going concern" — hypothetical, not actual doubt (one example had $477M cash) |
| (c) iXBRL sub-chunk drift | ~3.6% (320) | Off-topic fragments split from long tagged GC/liquidity text-blocks |

Corpus-wide: 66.3% of the 8,914 contain "substantial doubt"; at the company-year level, 76.4% of the 4,291 raw GC company-years have ≥1 excerpt containing it.

## 2. Cleaned-cohort definition (exact, reproducible)

Run against `data/processed/atlas.duckdb` (DuckDB; regexes are case-insensitive via `lower()`):

```sql
SELECT f.*
FROM footnotes f
WHERE f.footnote_type = 'going_concern'
  -- KEEP: genuine substantial-doubt language
  AND regexp_matches(lower(f.raw_text_excerpt), 'substantial doubt')
  -- EXCLUDE (a): accounting-standard descriptions (ASU 2014-15 / ASC 205-40 pronouncement text)
  AND NOT regexp_matches(lower(f.raw_text_excerpt),
      'asu\s*(no\.?\s*)?2014-15|asc\s*205-40|issued (new )?guidance|financial accounting standards board|fasb (issued|has issued)|requires management to (assess|evaluate)|recently (issued|adopted) accounting')
  -- EXCLUDE (b): conditional/hypothetical risk-factor phrasing
  AND NOT regexp_matches(lower(f.raw_text_excerpt),
      '(if|unless|should) (we|the company|it)[^.]{0,80}(unable to|not be able to|cannot) continue as a going concern|may (be unable|not be able) to continue as a going concern')
```

**Company-year key:** `g.cik || '|' || year(g.period_of_report)` via `JOIN filings g ON f.accession_number = g.accession_number` — the same key the tool's panel export uses. A company-year enters the cohort if ≥1 excerpt passes the filter.

**Final step:** exclude the 75 collapsed company-year keys from the C55 correctness audit (`docs/AUDIT_2026-07-01_collapsed_company_years.csv`) — 52/53-week filers whose two distinct 10-Ks merge under one calendar-year key, breaking the point-in-time guarantee.

## 3. Counts (verified 2026-07-01, digit-exact)

| Measure | Value |
|---|---|
| Footnotes (cleaned) | **4,614** (51.8% of 8,914 raw GC footnotes) |
| Distinct companies (CIKs) | **924** |
| Distinct company-years | **2,643** (2 footnotes have NULL `period_of_report` and drop out of the CY count) |
| Company-years intersecting the 75 collapsed keys | **8** |
| **Final cohort: company-years after collapsed-key exclusion** | **2,635** |

The 8 excluded collapsed keys: `0000862861|2022`, `0001060822|2022`, `0001074828|2025`, `0001083446|2017`, `0001498372|2014`, `0001498382|2024`, `0001510775|2012`, `0002025878|2025`.

## 4. Manual eyeball sample (10 random cleaned excerpts)

Deterministic, reproducible sampling: `ORDER BY md5(f.footnote_id) LIMIT 10` over the cleaned set. Read: **9 of 10 clearly genuine, 1 borderline.**

| # | Company · FY | Method | Read |
|---|---|---|---|
| 1 | Patriot Gold · FY2025 | ixbrl | ✅ "conditions that raise substantial doubt"; management mitigation plans |
| 2 | GBT Technologies · FY2023 | ixbrl | ✅ textbook GC note: accumulated deficit $316M, WC deficit, "raises substantial doubt" |
| 3 | Cellectar Biosciences · FY2017 | heuristic | ✅ auditor "expressed substantial doubt" |
| 4 | Renalytix · FY2024 | heuristic | ✅ risk-factor *placement* but reports an actual auditor GC opinion on FY2024 statements |
| 5 | SRX Global · FY2024 | heuristic | ✅ genuine, short fragment |
| 6 | Acurx Pharmaceuticals · FY2025 | heuristic | ✅ recurring losses since inception, "substantial doubt exists" |
| 7 | Glimpse Group · FY2021 | heuristic | ⚠️ borderline: "If we seek additional financing… and there remains substantial doubt… investors may be unwilling" — consequence-of-doubt phrasing that exclusion (b) doesn't cover |
| 8 | 3DO CO · FY2002 | heuristic | ✅ "There remains substantial doubt" |
| 9 | AUSCRETE · FY2021 | ixbrl | ✅ accumulated deficit, "raises substantial doubt" |
| 10 | PetroGas · FY2017 | heuristic | ✅ recurring losses, negative cash flows, "raise substantial doubt" |

## 5. Limitations to state with this cohort

1. **Regex-cleaned, not hand-validated.** Conditional phrasings outside pattern (b)'s coverage still leak at a low rate (sample #7). On the 10-excerpt sample the cleaned set reads ~90%+ precise (vs ~70–80% raw), but that is 10 excerpts — **hand-validate 50–100 before citing a precision figure.**
2. **Excerpt-level filter, company-year-level membership.** A company-year qualifies via ≥1 passing excerpt; some passing excerpts are short fragments — fine for membership, thin for text analysis.
3. **Recall not assessed.** The base extractor requires both "going concern" and doubt-family language at the paragraph level; disclosures phrased only as "material uncertainty" (some IFRS filers) without those phrases would be missed. This cohort characterizes precision, not completeness.
4. **Inherited from C55:** exact-duplicate excerpts were deduped upstream; 2 NULL-`period_of_report` footnotes are excluded from company-year counts; the 75-key calendar-year collapse is handled by exclusion (8 keys touched this cohort). Upstream filing→text extraction fidelity and the XBRL→financials tag mapping were outside both audits' scope.
5. **`extraction_confidence` is not a precision filter** — it tracks method (0.95 iXBRL) and keyword density (0.43–0.65 heuristic), not label correctness.

## 6. Suggested methods-section language

> Going-concern disclosures were identified by Disclosure Atlas's rule-based extractor (inline-XBRL going-concern text-block tags, 13%; keyword heuristic requiring both "going concern" and substantial-doubt language, 87%; no supervised classifier). To increase precision, we restricted the sample to excerpts containing "substantial doubt" and excluded (a) descriptions of the going-concern accounting standard (ASU 2014-15 / ASC 205-40) and (b) conditional risk-factor phrasings, then removed 8 company-years affected by a documented fiscal-calendar key collision. The final cohort comprises 4,614 excerpts across 924 companies and 2,635 company-years. A manual review of the raw label estimated ~70–80% footnote-level precision, rising to ~90%+ in the cleaned sample (10-excerpt spot check; see limitations).
