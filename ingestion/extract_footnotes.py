"""Extract revenue-recognition + going-concern footnotes from cached 10-Ks.

Two methods, recorded per footnote (DATA_MODEL.extraction_method / extraction_confidence):
  - ixbrl     : inline-XBRL text-block facts (us-gaap:*PolicyTextBlock / *GoingConcernTextBlock).
                Exact, tagged footnote text -> high confidence (0.95).
  - heuristic : section located by heading + keyword density in the de-tagged text.
                Older (pre-iXBRL) filings -> lower confidence (0.4-0.65).

Each located section is split into bounded paragraph-level excerpts (one footnote row each),
which is both faithful to DATA_MODEL ("bounded excerpt") and better for semantic retrieval.

Run:  python ingestion/extract_footnotes.py
Reads only cached docs in data/raw/filings (no network). Idempotent (clears footnotes first).
"""
from __future__ import annotations

import html as _html
import re
import sys
from pathlib import Path

from lxml import html as LH

from db import connect
from fetch_filings import SECClient

# resumable, bounded extraction: accession-level checkpoint so kills never lose progress.
_PROC = Path(__file__).resolve().parent.parent / "data" / "processed"
EXTRACT_CKPT = _PROC / "extract_done.txt"     # one accession_number per line (filing fully processed)

# iXBRL text-block tags -> footnote_type
IXBRL_TAGS = {
    "revenuerecognitionpolicytextblock": "rev_rec",
    "revenuefromcontractwithcustomerpolicytextblock": "rev_rec",
    "substantialdoubtaboutgoingconcerntextblock": "going_concern",
    "liquiditydisclosuregoingconcernpolicytextblock": "going_concern",
    "relatedpartytransactionsdisclosuretextblock": "related_party",
    "relatedpartytransactionspolicypolicytextblock": "related_party",
}

# Chapter B: six descriptive footnote/section types. rev_rec/going_concern/related_party/cam are
# located by topic (keyword density); mda/risk_factors are large narrative Items located by their
# heading and bounded by a per-filing chunk cap so they don't dominate the corpus.
ALL_TYPES = ("rev_rec", "going_concern", "related_party", "cam", "mda", "risk_factors")
TOPIC_TYPES = ("rev_rec", "going_concern", "related_party", "cam")
SECTION_TYPES = ("mda", "risk_factors")
MAX_CHUNKS_PER_TYPE = 4  # per (filing, type): keeps long Items (MD&A, risk factors) balanced; lowered
                         # from 5 for the expanded corpus to land ~150k footnotes + keep excerpts.json < cap

MIN_CHUNK = 140         # chars; drop tiny fragments
MAX_CHUNK = 1400        # chars; bounded excerpt

# Paragraph-level topic tests (heuristic path). A paragraph must actually be ABOUT the
# topic to be kept — this is what prevents inventories/risk-factors leaking in.
REV_REC_STRONG = re.compile(
    r"revenue\s+(?:is|are|will be|to be)?\s*recogni[sz]|recogni[sz]e[sd]?\s+revenue|"
    r"performance obligation|"
    r"recogni[sz]e[sd]?\s+(?:as )?revenue|over time as (?:the )?(?:control|services)", re.I)
REV_REC_SUPPORT = re.compile(
    r"\b(transaction price|standalone selling price|deferred revenue|contract (?:asset|liabilit|with customer)|"
    r"ASC\s*606|ASU\s*2014-09|when control (?:of|transfers)|point in time|variable consideration)\b", re.I)
GC_TOPIC = re.compile(r"going concern", re.I)
GC_STRONG = re.compile(
    r"substantial doubt|ability to continue as a going concern|"
    r"continue as a going concern|doubt about (?:the|its|our) ability", re.I)
# related-party transactions — REQUIRE explicit transaction/balance/affiliate-relationship
# language. A bare "related party" / "related-party" mention (e.g. "related-party indebtedness"
# in a tax-risk paragraph) no longer qualifies — that was the source of ~36% loose matches.
RP_STRONG = re.compile(
    r"related part(?:y|ies)\s+(?:transaction|balance|receivable|payable|loan|note|debt|"
    r"arrangement|agreement|relationship|disclosure)|"
    r"transactions?\s+with\s+(?:our\s+|certain\s+|its\s+)?(?:related part|affiliat|officers?|"
    r"directors?|principal (?:share|stock)holders?|members? of management)|"
    r"due (?:to|from)\s+(?:related part|affiliat|an?\s+officer|a?\s+director|stockholders?|shareholders?)|"
    r"amounts?\s+(?:due|owed|payable|receivable)\s+(?:to|from|by)\s+(?:related|affiliat)|"
    r"(?:loans?|advances?|notes?|payables?|receivables?)\s+(?:to|from|due)\s+"
    r"(?:related part|affiliat|officers?|directors?|stockholders?|shareholders?)",
    re.I)
# critical audit matters (auditor's report, large accelerated filers, ~2019+)
CAM_TOPIC = re.compile(r"critical audit matter", re.I)
# narrative Items located by heading (MD&A = Item 7; Risk Factors = Item 1A)
ITEM_HEAD = {
    # "Management's Discussion and Analysis" is a distinctive section title; anchoring on it
    # (rather than requiring the "Item 7" prefix in the same de-tagged block) is far more robust.
    "mda": re.compile(r"management'?s\s+discussion\s+and\s+analysis", re.I),
    "risk_factors": re.compile(r"item\s*1a\b.{0,60}risk\s+factors|^\s*risk\s+factors\s*$", re.I),
}
NEXT_ITEM = re.compile(r"\bitem\s*\d+\s*[ab]?\b", re.I)
# Hard section-enders that are NOT "Item N" headings — these end a narrative Item even mid-text,
# so risk_factors/MD&A don't bleed into exec-officer bios, signatures, or the financial statements.
STRONG_STOP = re.compile(
    r"executive officers of (?:the|our) (?:registrant|company)|"
    r"information about our executive officers|"
    r"pursuant to the requirements of (?:section|the securities exchange)|"
    r"^\s*signatures?\s*$|"
    r"report of independent registered public accounting|"
    r"quantitative and qualitative disclosures about market risk", re.I)

# Inline-XBRL / data-dump noise that occasionally leaks into the de-tagged text stream.
XBRL_NOISE = re.compile(
    r"us-gaap_|xbrldi|xbrl\.org|StatementGeographicalAxis|iso4217|dei_|"
    r"\bfalse false\b|http://(?:www\.)?(?:xbrl|fasb|sec)", re.I)


def _chunk_ok(ftype: str, method: str, chunk: str) -> bool:
    """Per-chunk guard applied AFTER splitting: drops XBRL noise and off-topic sub-chunks
    that survived because the topic test ran at paragraph (not chunk) granularity."""
    if XBRL_NOISE.search(chunk):
        return False
    if method == "ixbrl":
        return True  # tagged text-block content is authoritative
    if ftype == "rev_rec":
        return bool(REV_REC_STRONG.search(chunk) or REV_REC_SUPPORT.search(chunk))
    if ftype == "going_concern":
        return bool(GC_TOPIC.search(chunk) or GC_STRONG.search(chunk))
    if ftype == "related_party":
        return bool(RP_STRONG.search(chunk))
    if ftype == "cam":
        return bool(CAM_TOPIC.search(chunk))
    # section types (mda, risk_factors) are heading-anchored; accept substantive non-noise text
    return len(chunk) >= MIN_CHUNK


def normalize_excerpt(s: str) -> str:
    """Decode HTML entities (twice, to handle double-encoded `&amp;lt;`), strip any
    residual tags, and collapse whitespace. Without this, entity-escaped source leaks
    `&lt;font&gt;`/`style=` junk and defeats topic tests."""
    s = _html.unescape(_html.unescape(s))
    s = re.sub(r"<[^>]+>", " ", s)           # residual tags after unescaping
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def chunk_section(text: str) -> list[str]:
    """Split a section into bounded excerpts. Sentence boundaries preferred, but a
    HARD cap guarantees no unbounded blob survives (e.g., entity-escaped tables)."""
    text = normalize_excerpt(text)
    if len(text) <= MAX_CHUNK:
        return [text] if len(text) >= MIN_CHUNK else []
    # split into sentences; force-split any single part that still exceeds the cap
    raw_parts = re.split(r"(?<=[.;])\s+(?=[A-Z(])", text)
    parts = []
    for p in raw_parts:
        while len(p) > MAX_CHUNK:
            parts.append(p[:MAX_CHUNK])
            p = p[MAX_CHUNK:]
        parts.append(p)
    chunks, cur = [], ""
    for p in parts:
        if len(cur) + len(p) + 1 <= MAX_CHUNK:
            cur = (cur + " " + p).strip()
        else:
            if len(cur) >= MIN_CHUNK:
                chunks.append(cur)
            cur = p
    if len(cur) >= MIN_CHUNK:
        chunks.append(cur)
    return chunks


def extract_ixbrl(doc) -> list[tuple[str, str, str]]:
    """Return [(footnote_type, anchor, text)] from inline-XBRL text-block facts."""
    out = []
    for el in doc.xpath("//*[@name]"):
        name = (el.get("name") or "").split(":")[-1].lower()
        ftype = IXBRL_TAGS.get(name)
        if not ftype:
            continue
        txt = clean_text(el.text_content() or "")
        if len(txt) >= MIN_CHUNK:
            out.append((ftype, f"ixbrl:{name}", txt))
    return out


def html_to_paragraphs(raw_bytes: bytes) -> list[str]:
    """De-tag HTML into paragraph-ish blocks, preserving block boundaries. Handles
    entity-escaped source (some filers double-encode their document body)."""
    s = raw_bytes.decode("utf-8", "replace")
    s = _html.unescape(s)                     # decode &lt;p&gt; -> <p> so blocks are real tags
    # turn block-level boundaries into newlines so paragraphs survive
    s = re.sub(r"(?i)</(p|div|tr|table|li|h[1-6]|td)>", "\n", s)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)            # strip remaining tags
    s = _html.unescape(s)                     # decode any second-level entities (smart quotes etc.)
    paras = [clean_text(p) for p in s.split("\n")]
    return [p for p in paras if len(p) >= 60]


def _is_topic_para(ftype: str, p: str) -> bool:
    if ftype == "rev_rec":
        # REQUIRE actual recognition language. A bare "deferred revenue" mention (e.g. a
        # cash-flow-statement line) no longer qualifies — fixes the SABA-type mislabel.
        return bool(REV_REC_STRONG.search(p))
    if ftype == "going_concern":
        return bool(GC_TOPIC.search(p)) and bool(GC_STRONG.search(p))
    if ftype == "related_party":
        return bool(RP_STRONG.search(p))
    if ftype == "cam":
        return bool(CAM_TOPIC.search(p))
    return False


def extract_heuristic(paragraphs: list[str]) -> list[tuple[str, str, str]]:
    """Topic-located types: keep only on-topic paragraphs, merging adjacent runs into one
    excerpt per run. Rejects off-topic text a fixed heading-window would wrongly capture."""
    out = []
    for ftype in TOPIC_TYPES:
        runs, cur = [], []
        for idx, p in enumerate(paragraphs):
            if _is_topic_para(ftype, p):
                cur.append((idx, p))
            elif cur:
                runs.append(cur); cur = []
        if cur:
            runs.append(cur)
        for run in runs:
            text = " ".join(p for _, p in run)
            anchor = f"heuristic:para[{run[0][0]}-{run[-1][0]}]"
            out.append((ftype, anchor, text))
    return out


def extract_section_window(paragraphs: list[str]) -> list[tuple[str, str, str]]:
    """Heading-anchored narrative Items (MD&A = Item 7, Risk Factors = Item 1A). Find the real
    section (the heading occurrence with the most substantive content after it — skips the TOC
    line), then take following substantive paragraphs until the next Item heading. The per-type
    chunk cap in main() bounds how much of each long Item enters the corpus."""
    out = []
    for ftype, head in ITEM_HEAD.items():
        starts = [i for i, p in enumerate(paragraphs) if head.search(p)]
        if not starts:
            continue
        following_len = lambda s: sum(len(paragraphs[j]) for j in range(s + 1, min(s + 14, len(paragraphs))))
        start = max(starts, key=following_len)
        picked = []
        for j in range(start + 1, len(paragraphs)):
            p = paragraphs[j]
            if STRONG_STOP.search(p):                   # hard section-ender (exec officers, sigs, etc.)
                break
            if NEXT_ITEM.search(p) and len(p) < 200:    # next Item heading -> end of section
                break
            if len(p) >= 120:
                picked.append((j, p))
            if len(picked) >= MAX_CHUNKS_PER_TYPE * 4:
                break
        if picked:
            text = " ".join(p for _, p in picked)
            out.append((ftype, f"heuristic:item[{picked[0][0]}-{picked[-1][0]}]", text))
    return out


CONF_CUES = {
    "rev_rec": (r"performance obligation", r"recogni[sz]e", r"contract", r"control", r"ASC 606"),
    "going_concern": (r"substantial doubt", r"going concern", r"liquidity", r"ability to continue"),
    "related_party": (r"related part", r"affiliat", r"officer|director", r"transaction", r"due (?:to|from)"),
    "cam": (r"critical audit matter", r"audit committee", r"material misstatement", r"we (?:identified|determined)"),
}


def confidence(method: str, ftype: str, text: str) -> float:
    if method == "ixbrl":
        return 0.95
    if ftype in SECTION_TYPES:
        # heading-anchored narrative Item: located by structure, not topic density. Modest,
        # honest confidence; the anchor records which Item it came from.
        return 0.5
    cues = sum(1 for c in CONF_CUES.get(ftype, ()) if re.search(c, text, re.I))
    return round(min(0.65, 0.35 + 0.08 * cues), 2)


def extract_from_bytes(raw_bytes: bytes) -> list[tuple[str, str, str, str]]:
    """Return [(footnote_type, anchor, text, method)] for one document's bytes."""
    sections: list[tuple[str, str, str, str]] = []
    try:
        doc = LH.fromstring(raw_bytes)
    except Exception:
        doc = None
    if doc is not None:
        for ftype, anchor, txt in extract_ixbrl(doc):
            sections.append((ftype, anchor, txt, "ixbrl"))
    found_types = {s[0] for s in sections}
    if found_types != set(ALL_TYPES):
        paras = html_to_paragraphs(raw_bytes)
        for ftype, anchor, txt in extract_heuristic(paras):
            if ftype not in found_types:
                sections.append((ftype, anchor, txt, "heuristic"))
        for ftype, anchor, txt in extract_section_window(paras):
            if ftype not in found_types:
                sections.append((ftype, anchor, txt, "heuristic"))
    return sections


def main() -> int:
    # flags: --limit N (process at most N not-yet-done filings this run), --fresh (clear + restart)
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    fresh = "--fresh" in sys.argv

    client = SECClient()
    con = connect()
    all_filings = con.execute("SELECT accession_number, cik, sec_url FROM filings").fetchall()
    n_total = len(all_filings)

    # RESUMABLE: a fresh run clears the table + checkpoint; a resume keeps both and skips done filings.
    done = set()
    if fresh or not EXTRACT_CKPT.exists():
        con.execute("DELETE FROM footnotes")
        EXTRACT_CKPT.write_text("")
        print(f"fresh extraction: cleared footnotes + checkpoint ({n_total} filings to do)", flush=True)
    else:
        done = {ln.strip() for ln in EXTRACT_CKPT.read_text().splitlines() if ln.strip()}
        print(f"resume: {len(done)}/{n_total} filings already done; continuing", flush=True)

    todo = [r for r in all_filings if r[0] not in done]
    if limit is not None:
        todo = todo[:limit]
    ckpt = EXTRACT_CKPT.open("a")

    n_files, n_fn, ck_count = 0, 0, 0
    method_counts = {"ixbrl": 0, "heuristic": 0}
    type_counts = {t: 0 for t in ALL_TYPES}

    for acc, cik, url in todo:
        try:
            raw_bytes = client.get(url, subdir="filings")  # bytes: lets lxml honor the encoding decl
        except Exception:
            ckpt.write(acc + "\n"); ckpt.flush(); ck_count += 1   # missing-from-cache: mark done, don't retry forever
            continue
        n_files += 1
        if n_files % 500 == 0:
            con.commit()
            print(f"  ...{n_files}/{len(todo)} this-run | total_done={len(done) + n_files}/{n_total} | "
                  f"footnotes(this run)={n_fn} | by_type={type_counts}", flush=True)
        sections = extract_from_bytes(raw_bytes)

        # Fallback: a partial primary doc (common for old .htm filings that are just a cover
        # page or single exhibit) yields nothing -> retry against the FULL submission .txt,
        # which always contains the complete 10-K.
        if not sections and not url.endswith(".txt"):
            acc_dash = acc
            full_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_dash}.txt"
            try:
                full_bytes = client.get(full_url, subdir="filings")
                sections = extract_from_bytes(full_bytes)
            except Exception:
                pass

        per_type = {t: 0 for t in ALL_TYPES}   # per-(filing,type) chunk cap (bounds long Items)
        for sec_idx, (ftype, anchor, txt, method) in enumerate(sections):
            for i, chunk in enumerate(chunk_section(txt)):
                if not _chunk_ok(ftype, method, chunk):
                    continue
                if per_type[ftype] >= MAX_CHUNKS_PER_TYPE:
                    break
                per_type[ftype] += 1
                fid = f"{acc}_{ftype}_{method[:3]}_{sec_idx}_{i}"
                conf = confidence(method, ftype, chunk)
                con.execute(
                    "INSERT OR IGNORE INTO footnotes (footnote_id, accession_number, footnote_type, "
                    "raw_text_excerpt, char_count, extraction_method, extraction_confidence, source_section_anchor) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    [fid, acc, ftype, chunk, len(chunk), method, conf, anchor])
                n_fn += 1
                method_counts[method] += 1
                type_counts[ftype] += 1
        ckpt.write(acc + "\n"); ckpt.flush(); ck_count += 1     # filing fully processed → durable checkpoint

    con.commit()
    ckpt.close()
    total_done = len(done) + ck_count
    print(f"this run: processed={n_files} new filings, total_done={total_done}/{n_total}", flush=True)

    # Resumable gate: only DEDUP once EVERY filing is processed (dedup must see the full corpus).
    # If killed before completion, re-run to continue; nothing already inserted is lost.
    if total_done < n_total:
        raw_now = con.execute("SELECT COUNT(*) FROM footnotes").fetchone()[0]
        con.close()
        print(f"INCOMPLETE ({total_done}/{n_total}); raw footnotes so far={raw_now}. "
              f"Re-run `extract_footnotes.py` to continue (resumes from checkpoint); dedup runs when complete.",
              flush=True)
        return 0

    # De-duplicate exact-identical excerpts (boilerplate repeated across a company's years
    # is degenerate for embeddings/clustering). Keep the lexicographically-first id per text.
    before = con.execute("SELECT COUNT(*) FROM footnotes").fetchone()[0]
    con.execute("""
        DELETE FROM footnotes WHERE footnote_id NOT IN (
            SELECT MIN(footnote_id) FROM footnotes GROUP BY raw_text_excerpt)
    """)
    total = con.execute("SELECT COUNT(*) FROM footnotes").fetchone()[0]
    print(f"  deduped exact-duplicate excerpts: {before} -> {total}")
    with_conf = con.execute("SELECT COUNT(*) FROM footnotes WHERE extraction_confidence IS NOT NULL").fetchone()[0]
    con.close()
    print(f"Processed {n_files} filings -> {total} footnotes ({with_conf} with confidence)")
    print(f"  by method: {method_counts}")
    print(f"  by type:   {type_counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
