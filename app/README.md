# Disclosure Atlas frontend

A browser-based research instrument for comparing SEC disclosure language with published financial-screening measures. The constellation maps the shipped disclosure embeddings; every finding links to source filings, excerpts and company identifiers.

Start with **a comparison**, inspect the two excerpts and their measured cosine similarity, then follow **Paper**, **Code** or **Reproduce** from the opening console. Methods documents the corpus, evaluation coverage, formulas and interpretation.

## Stack

- Vite and vanilla JavaScript, with a Canvas 2D constellation and DOM controls.
- Static research assets in `public/data/`; no database connection in the frontend.
- Lazy browser embeddings using `Xenova/bge-small-en-v1.5` via transformers.js, CLS pooling and L2 normalization. Pasted text is processed in the browser.

## Develop and verify

```bash
cd app
npm ci
npm test
npm run dev
npm run build
npm run preview
```

`npm run build` writes `app/dist`; it does not deploy. A fresh checkout includes the static data bundle used by the development and preview servers. Rebuilding that bundle requires the separate original-data inputs described in [Reproducibility](../docs/REPRODUCIBILITY.md).

## Research assets

With the full project environment and source artifacts available:

```bash
# From the repository root
python3 app/scripts/build_app_data.py
```

The builder exports `nodes.json`, `excerpts.json`, `neighbors.json`, `findings.json`, `aaer.json`, `manifest.json` and `embeddings.bin`. Additional score assets come from `app/scripts/build_scores.py`. The current snapshot contains **17 featured comparison pairs** after two stale excerpt/score mappings were removed. The builder checks mapped-vector scores before retaining a comparison and its annotation.

Featured comparison notes were generated with AI assistance. They are interpretation, separate from measured similarity and original excerpts; all other pairs display measured comparisons without generated interpretation. [Methods](src/methods.js) defines the text shared by the in-app methods view and downloadable methods document.

## Data and interpretation

Enforcement history supplies company context. Cosine similarity, Gunning Fog, distinctiveness and year-over-year change describe disclosure language. Beneish and Dechow scores retain the cited models, components, missing-input handling and sample limits. The systematic screen records its specification locally before computing results and always reports the full test family with Bonferroni and FDR corrections.

For the study, current-corpus extensions and verification coverage, see the [paper](../paper/disclosure_atlas_paper.pdf), [evaluation report](../eval/REPORT.md) and [reproduction guide](../docs/REPRODUCIBILITY.md).
