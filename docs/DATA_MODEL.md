# DATA_MODEL.md — Disclosure Atlas

Everything keys on **CIK** (company) and **accession_number** (filing) so v1 → V2 → Vision is a scale change, not a rewrite.

---

## Store strategy

| Store | Tech | Holds | Why |
|---|---|---|---|
| Structured | **DuckDB** (build) → **Parquet** (shipped) | filings, companies, footnotes, enforcement, findings | Columnar, local, fast analytical queries; no server needed |
| Vector | Pre-built in-browser index (e.g. HNSW/flat in JS, or a packed binary) | footnote embeddings + ids | $0 runtime, no backend to overload |
| Projection | Static JSON/binary | 2D UMAP coords per footnote | Constellation renders instantly |

No Postgres/Supabase in v1 — data is read-only reference data, no user writes. (V2 only if accounts are added; then a *fresh, isolated* Supabase project, separate from SimplyDose/OXE.)

## Tables

### `companies`
| column | type | notes |
|---|---|---|
| cik | TEXT PK | SEC permanent id; the spine |
| company_name | TEXT | |
| ticker | TEXT NULL | |
| sic_code | TEXT | industry |
| industry_label | TEXT | human-readable |
| current_status | TEXT | active/delisted/etc |

### `filings`
| column | type | notes |
|---|---|---|
| accession_number | TEXT PK | SEC filing id |
| cik | TEXT FK → companies | |
| form_type | TEXT | "10-K" in v1 |
| filing_date | DATE | |
| period_of_report | DATE | |
| sec_url | TEXT | canonical link back to source |

### `footnotes`
| column | type | notes |
|---|---|---|
| footnote_id | TEXT PK | |
| accession_number | TEXT FK → filings | |
| footnote_type | TEXT | `rev_rec` \| `going_concern` (extensible) |
| raw_text_excerpt | TEXT | bounded excerpt, not whole filing |
| char_count | INT | |
| extraction_method | TEXT | `xbrl` \| `ixbrl` \| `heuristic` |
| extraction_confidence | REAL | 0–1; drives QA |
| source_section_anchor | TEXT | where in the filing it came from |

### `embeddings`  (conceptual; shipped as packed index)
| column | type | notes |
|---|---|---|
| footnote_id | TEXT FK → footnotes | |
| vector | FLOAT[] | bge-small dims |
| model_version | TEXT | reproducibility |
| embedded_at | TIMESTAMP | |

### `projection`
| column | type | notes |
|---|---|---|
| footnote_id | TEXT FK | |
| x | REAL | UMAP |
| y | REAL | UMAP |
| cluster_id | INT NULL | optional HDBSCAN label |

### `enforcement`  (GROUND TRUTH)
| column | type | notes |
|---|---|---|
| cik | TEXT FK → companies | |
| aaer_number | TEXT | |
| release_date | DATE | |
| period_of_alleged_conduct | TEXT | |
| summary | TEXT | |
| source_url | TEXT | |

### `findings`  (generated, provenance)
| column | type | notes |
|---|---|---|
| finding_id | TEXT PK | |
| query_footnote_id | TEXT FK | |
| matched_footnote_id | TEXT FK | |
| similarity_score | REAL | |
| llm_explanation | TEXT | pre-generated, static |
| model_version | TEXT | which Claude model |
| generated_at | TIMESTAMP | |
| reviewed_status | TEXT NULL | reserved for V2 workflow |

## Key relationships

- `companies 1—* filings 1—* footnotes 1—1 embeddings/projection`
- `companies 1—* enforcement` (the overlay that makes validation possible)
- `findings` joins two `footnotes`; the enforcement join is via each footnote's `cik`.
- **Join spine:** CIK everywhere; accession_number for filing-level.

## Extensibility (designed-in, unused in v1)

- `footnote_type` is a free field → adding `related_party`, `cam`, etc. is data, not schema change.
- Universe expansion = more rows under same schema.
- No column assumes the small universe; nothing to refactor at scale.
