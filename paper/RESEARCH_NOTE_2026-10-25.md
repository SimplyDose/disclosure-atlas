# Research note: October 25, 2026

This note accompanies the archived working paper, *Disclosure Notes Relation to
Financial Quality Metrics in Going-Concern Companies: Evidence of Non-Association*.
It clarifies the interpretation and implementation of that snapshot. The original
PDF, cohort keys, financial scores and language-measure bundle are preserved.

## Interpretation of the main results

The four principal language/composite-score estimates are small and do not survive
the paper's specified multiple-testing corrections. No equivalence test was performed.
These results therefore do not establish that meaningful associations are absent.
Standardized disclosure templates are a possible interpretation, not an identified
causal explanation. Read the archived title in this narrower sense.

The going-concern cohort is selected by **extracted disclosure language**, not by an
independently verified classification of auditor opinions. The historical
[extraction audit](../docs/STUDY_COHORT_GC_CLEANED.md) reports a small manual review and
regex contamination checks. Its approximate raw-label precision is not a measured
error rate for every observation in the paper.

## Correction: score-to-score comparison

The paper and former project-page wording incorrectly grouped the Dechow/Beneish
correlation (approximately rho 0.10, raw p 0.002) with language-measure associations
that failed correction. That score-to-score comparison is **outside the 460-test
language/financial-measure family**. It is a separate descriptive comparison;
no family-adjusted significance claim is made for it here. The current project page
corrects the sentence.

## Reproduce the reported family

The [screen replay](final_tables.py) uses the original family definition and tracked
bundle. It records all 460 tests, the excluded-candidate count and adjusted values in
[expected_screen_results.json](../examples/expected_screen_results.json).
The [results guide](../docs/RESULTS.md) lists the three surviving rows with their
sample sizes, rho, raw p, BH q and Bonferroni-adjusted p.

The family was specified and recorded locally before a run calculated its results.
A local clock, browser record or SHA-256 does not establish external preregistration.
The screen is exploratory; nested subgroup survivors are not independent replications.

## Distinctiveness construction

The published metric uses a same-industry, same-disclosure-type centroid pooled over
the full snapshot. It includes the focal excerpt, other observations from the same
company, and later filings. It is a retrospective description of this corpus, not a
measure available as of the original filing date. Peer-group size and composition
can affect its magnitude.

The builder encoded a singleton peer group as zero distinctiveness, although no
comparison peer exists. Exactly 35 of the 4,186 primary-cohort company-year keys are
affected. Other zero values also occur in non-singleton groups, so replacing every
zero with missing would be incorrect. The archived replay retains the published
snapshot; a separately labeled sensitivity excludes only singleton observations
before aggregation. It does not replace the published numbers or independently
validate the measure. The sensitivity retains three BH survivors and yields two
Bonferroni survivors, all nested distinctiveness/TATA rows; no composite-score
association survives correction. Its [full output](../examples/expected_singleton_sensitivity.json)
is separate from the archived replay. A leave-own-company-out, prior-filings-only metric would be a
new research specification requiring its own analysis.

## Financial-input conventions

Known-answer tests check the Beneish and Dechow arithmetic. They do not establish
that every underlying XBRL tag, period or fallback is the intended economic input.
The archived extractor omits the plain `IncomeLossFromContinuingOperations` tag and
can select a pre-tax income alternative. The incidence and effect of that substitution
have not been quantified.

The score implementation substitutes zero for some absent balance-sheet fields,
including long-term debt in Beneish leverage and PP&E in Dechow soft assets. It also
uses documented neutral SG&A/depreciation indices and an income fallback for TATA.
Calendar-year buckets can pair fiscal periods separated by more than one economic
year for 52/53-week filers. Accession-string ordering does not establish the latest
filing date, and the cached company facts may contain later revisions. Consequently,
the financial measures are not established as an original-filing information set.
Changing these inputs requires a versioned extraction and rescoring pass.

## Observation units and available code

The higher-precision text subset has 2,643 company-year keys from 924 companies before
collapsed-key exclusions, and 2,635 keys from 921 companies afterward. Restricting it
to the paper's 2010–2026 window gives 2,572 keys from 896 companies. These are distinct
samples, not interchangeable counts.

The committed bootstrap resamples company medians. It is not a cluster bootstrap of
company-year rows. Executable code was not found for the paper's firm-level Wilcoxon
statement, TATA-specific interval claim or historical R cross-check. Those claims
should not be described as independently reproduced from this repository. The
[reproduction guide](../docs/REPRODUCIBILITY.md) distinguishes supported calculations
from unavailable original-data or external verification.
