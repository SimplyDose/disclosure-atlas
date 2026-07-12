"""Load SEC AAER enforcement ground truth (the positives) keyed on CIK.

Pipeline:
  1. Fetch the AAER index pages: yearly archives 2001-2019 + the current page (cached).
  2. Parse (aaer_number, date, respondent) triples.
  3. Classify each respondent: issuer-company (what we want) vs individual / audit firm (drop).
  4. Resolve issuer names -> CIK + SIC via EDGAR company search (browse-edgar atom).
  5. Write companies + enforcement rows to DuckDB. Confidence-graded; nothing silently dropped.

Run:  python ingestion/load_enforcement.py
Idempotent: re-running re-reads the cache and upserts. No re-fetch.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

from lxml import html as LH

from db import connect
from fetch_filings import SECClient

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "data" / "processed"
ARCHIVE_YEARS = range(2001, 2020)  # 2001-2019 archives exist; current page covers recent

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

# Suffixes that mark a respondent as an issuer/company (what we embed footnotes for).
COMPANY_SUFFIX = re.compile(
    r"\b(inc|incorporated|corp|corporation|co|company|companies|ltd|limited|holdings?|"
    r"group|bancorp|bankshares|plc|n\.?v\.?|s\.?a\.?|a\.?g\.?|trust|partners|industries|"
    r"technolog(?:y|ies)|systems?|international|pharmaceuticals?|therapeutics|energy|"
    r"communications?|networks?|laboratories|labs|resources|enterprises|solutions|"
    r"motors|airlines|petroleum|gold|mining|capital|financial|bank)\b", re.I)

# Patterns that mark a respondent as an INDIVIDUAL or AUDIT FIRM -> not an issuer.
NON_ISSUER = re.compile(
    r"(,\s*(CPA|CA|CFO|CEO|COO|Esq|P\.?C\.?|ACA|PA|MBA|Jr\.?|Sr\.?|II|III)\b)|"
    r"\bLLP\b|\bCPAs?\b|certified public account|\baccountancy\b|\bPLLC\b|"
    r"&\s*Co\.?,?\s*(CPAs?|LLP|PLLC|P\.?C\.?)|\baudit(ors?|ing)?\b", re.I)

# Strong audit-firm / accountancy markers that override a company suffix
# (e.g. "Davidson & Company LLP" contains "Company" but is an audit firm).
STRONG_NON_ISSUER = re.compile(
    r"\bLLP\b|\bCPAs?\b|\bPLLC\b|certified public account|\baccountancy\b|"
    r"\bP\.?C\.?$|\bchartered account", re.I)


def fetch_index_pages(client: SECClient) -> dict[str, str]:
    pages = {}
    for y in ARCHIVE_YEARS:
        url = f"https://www.sec.gov/divisions/enforce/friactions/friactions{y}.shtml"
        pages[str(y)] = client.get_text(url, subdir="aaer")
    pages["current"] = client.get_text(
        "https://www.sec.gov/divisions/enforce/friactions.htm", subdir="aaer")
    return pages


def parse_date(s: str):
    m = re.search(r"([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})", s)
    if not m:
        return None
    mon = MONTHS.get(m.group(1).lower())
    if not mon:
        return None
    return f"{m.group(3)}-{mon:02d}-{int(m.group(2)):02d}"


def parse_archive(html_text: str) -> list[dict]:
    """Archive pages: repeating (AAER-XXXX, Date, Respondent...) triples in cell text."""
    # Collapse HTML to flat text so the triple regex isn't broken by tags between cells.
    text = re.sub(r"\s+", " ", LH.fromstring(html_text).text_content())
    rows = []
    # Find AAER markers and the text that follows each, up to the next AAER marker.
    for m in re.finditer(r"(AAER[-\s]?\d{3,5})\s+([A-Za-z]{3}\.?\s+\d{1,2},\s*\d{4})\s+(.*?)(?=AAER[-\s]?\d{3,5}\s|$)", text, re.S):
        aaer = re.sub(r"\s+", "-", m.group(1).strip()).replace("AAER--", "AAER-")
        date = parse_date(m.group(2))
        resp = re.sub(r"\s+", " ", m.group(3)).strip()
        # cut administrative tails (archive pages use "Release No.", not "Other Release No.")
        resp = re.split(r"Release Nos?\.?|Other Release|See Also|Contact \||AAER[-\s]?\d",
                        resp)[0].strip()
        if date and resp:
            rows.append({"aaer_number": aaer, "release_date": date, "respondent_raw": resp})
    return rows


def parse_current(text: str) -> list[dict]:
    """Current friactions.htm: 'Respondent... Release No. XX, AAER-XXXX' rows."""
    rows = []
    doc = LH.fromstring(text)
    for tr in doc.xpath("//table//tr"):
        cells = [re.sub(r"\s+", " ", (c.text_content() or "")).strip() for c in tr.xpath(".//td")]
        if len(cells) >= 2 and "AAER" in cells[1]:
            date = parse_date(cells[0])
            aaer_m = re.search(r"AAER[-\s]?(\d{3,5})", cells[1])
            if not (date and aaer_m):
                continue
            resp = re.split(r"Release No|See Also", cells[1])[0].strip().rstrip(",")
            rows.append({"aaer_number": f"AAER-{aaer_m.group(1)}",
                         "release_date": date, "respondent_raw": resp})
    return rows


def classify_respondent(resp: str) -> tuple[bool, str]:
    """Return (is_issuer, normalized_company_name)."""
    # take the leading entity before list separators / administrative tails
    resp = re.split(r"Release Nos?\.?|\(f/?k/?a|\(formerly|\(n/?k/?a", resp)[0].strip()
    head = re.split(r"\bet al\b|\band\b|;|,\s*(?=[A-Z][a-z]+ [A-Z])", resp)[0].strip()
    head = head.rstrip(".,; ")
    if STRONG_NON_ISSUER.search(resp):
        return False, head
    if NON_ISSUER.search(resp) and not COMPANY_SUFFIX.search(head):
        return False, head
    if not COMPANY_SUFFIX.search(head):
        return False, head
    # looks like an issuer
    return True, head


LEGAL_SUFFIX = re.compile(
    r"\b(corporation|corp|company|companies|co|incorporated|inc|ltd|limited|llc|l\.?p|lp|"
    r"holdings?|plc|n\.?v|s\.?a|a\.?g|group|trust|partners)\b\.?\s*$", re.I)


def normalize_for_lookup(name: str) -> str:
    """EDGAR stores abbreviated suffixes (CORP not CORPORATION) and matches on prefix.
    Strip trailing legal suffixes so the distinctive prefix matches."""
    n = re.sub(r"^The\s+", "", name, flags=re.I)
    n = n.replace(".", " ").replace(",", " ")
    n = re.sub(r"\s+", " ", n).strip()
    # strip up to two trailing legal-suffix tokens ("Holdings Inc" -> "")
    for _ in range(2):
        stripped = LEGAL_SUFFIX.sub("", n).strip()
        if stripped and stripped != n:
            n = stripped
        else:
            break
    return n


def _tokens(s: str) -> set[str]:
    s = LEGAL_SUFFIX.sub("", re.sub(r"[.,]", " ", s))
    return {t for t in re.findall(r"[a-z0-9]+", s.lower()) if len(t) > 1}


def _name_overlap(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta)  # fraction of target tokens present in candidate


def _verify_cik(client: SECClient, cik: str, target: str) -> dict | None:
    """Confirm a candidate CIK is the right issuer: has a 10-K and name overlaps."""
    try:
        sub = client.submissions(cik)
    except Exception:
        return None
    forms = set(sub.get("filings", {}).get("recent", {}).get("form", []))
    # older filers: forms may be paged in files; presence in recent is enough signal here
    official = sub.get("name", "")
    fwd = _name_overlap(target, official)        # target tokens present in candidate
    rev = _name_overlap(official, target)        # candidate tokens present in target
    has_10k = any(f.startswith("10-K") for f in forms)
    # Require strong match BOTH ways: rejects "Sunbeam Americas Holdings" for "Sunbeam Corp"
    # (extra distinctive token "americas" drops reverse overlap) while keeping exact matches.
    if fwd >= 0.6 and rev >= 0.6:
        return {"cik": str(int(cik)).zfill(10), "conformed_name": official,
                "sic": sub.get("sic", ""), "sic_desc": sub.get("sicDescription", ""),
                "has_10k": has_10k, "overlap": round(min(fwd, rev), 2)}
    return None


def _candidates(client: SECClient, name: str) -> list[tuple[str, str]]:
    """Return [(cik, candidate_name)] from browse-edgar atom, all shapes."""
    q = urlencode({"action": "getcompany", "company": normalize_for_lookup(name),
                   "dateb": "", "owner": "include", "count": "40", "output": "atom"})
    try:
        txt = client.get_text("https://www.sec.gov/cgi-bin/browse-edgar?" + q,
                              subdir="edgar_company")
    except Exception:
        return []
    cands: list[tuple[str, str]] = []
    # Shape A: top-level company-info
    cik_tag = re.search(r"<cik>(\d+)</cik>", txt)
    cname = re.search(r"<conformed-name>(.*?)</conformed-name>", txt)
    if cik_tag:
        cands.append((cik_tag.group(1), cname.group(1) if cname else name))
    # Shape C: disambiguation list -> per-entry title + cik= in id/link
    for m in re.finditer(r"<entry>(.*?)</entry>", txt, re.S):
        b = m.group(1)
        cm = re.search(r"cik=(\d{10})", b) or re.search(r"CIK=(\d{10})", b)
        tm = re.search(r"<title>(.*?)</title>", b, re.S)
        if cm:
            cands.append((cm.group(1), (tm.group(1).strip() if tm else name)))
    # Shape B: a single company's filing list -> CIK in data hrefs; use feed title
    if not cands:
        data_ciks = re.findall(r"edgar/data/(\d+)/", txt)
        feed_title = re.search(r"<title>(.*?)</title>", txt, re.S)
        if data_ciks:
            from collections import Counter
            cik = Counter(data_ciks).most_common(1)[0][0]
            cands.append((cik, feed_title.group(1).strip() if feed_title else name))
    # de-dup preserving order
    seen, out = set(), []
    for cik, nm in cands:
        k = str(int(cik))
        if k not in seen:
            seen.add(k)
            out.append((k, nm))
    return out


def resolve_cik(client: SECClient, name: str) -> dict | None:
    """Resolve an issuer name to a verified CIK.

    Gather candidates from browse-edgar, then VERIFY each against the submissions API
    (name-token overlap >= 0.6). This makes loose suffix-stripping safe and precise.
    Prefer candidates that have a 10-K. Returns dict with sic/sic_desc backfilled.
    """
    cands = _candidates(client, name)
    if not cands:
        return None
    verified = []
    for cik, _cand_name in cands[:8]:  # cap verification calls per name
        v = _verify_cik(client, cik, name)
        if v:
            verified.append(v)
    if not verified:
        return None
    # prefer a verified candidate that actually files 10-Ks, then highest overlap
    verified.sort(key=lambda d: (d["has_10k"], d["overlap"]), reverse=True)
    return verified[0]


def main() -> int:
    client = SECClient()
    pages = fetch_index_pages(client)

    raw_rows = []
    for key, text in pages.items():
        rows = parse_current(text) if key == "current" else parse_archive(text)
        raw_rows.extend(rows)
    # de-dup by aaer_number
    by_aaer = {}
    for r in raw_rows:
        by_aaer.setdefault(r["aaer_number"], r)
    raw_rows = list(by_aaer.values())
    print(f"Parsed {len(raw_rows)} unique AAERs across index pages")

    issuers = []
    for r in raw_rows:
        is_iss, name = classify_respondent(r["respondent_raw"])
        if is_iss:
            issuers.append({**r, "company_name": name})
    print(f"Classified {len(issuers)} AAERs as issuer-companies (rest = individuals/audit firms)")

    con = connect()
    resolved, unresolved = 0, []
    for it in issuers:
        info = resolve_cik(client, it["company_name"])
        if not info:
            unresolved.append(it["company_name"])
            continue
        con.execute(
            "INSERT OR IGNORE INTO companies (cik, company_name, ticker, sic_code, industry_label, current_status) "
            "VALUES (?,?,?,?,?,?)",
            [info["cik"], info["conformed_name"], None, info.get("sic") or None,
             info.get("sic_desc") or None, None])  # cohort derived from enforcement, not stored
        con.execute(
            "INSERT OR IGNORE INTO enforcement (cik, aaer_number, release_date, period_of_alleged_conduct, summary, source_url) "
            "VALUES (?,?,?,?,?,?)",
            [info["cik"], it["aaer_number"], it["release_date"], None,
             f"{it['respondent_raw']} (name_overlap={info.get('overlap')}, has_10k={info.get('has_10k')})",
             "https://www.sec.gov/divisions/enforce/friactions.htm"])
        resolved += 1

    n_companies = con.execute("SELECT COUNT(DISTINCT cik) FROM companies WHERE cik IN (SELECT cik FROM enforcement)").fetchone()[0]
    n_enf = con.execute("SELECT COUNT(*) FROM enforcement").fetchone()[0]
    con.close()

    # persist an audit trail of what didn't resolve (honesty guardrail)
    (ARTIFACTS / "enforcement_unresolved.json").write_text(json.dumps(unresolved, indent=2))
    print(f"Resolved {resolved} AAER->CIK; {len(set(unresolved))} unique names unresolved")
    print(f"DB now: {n_companies} enforced companies, {n_enf} enforcement rows")
    print(f"SEC client stats: {client.stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
