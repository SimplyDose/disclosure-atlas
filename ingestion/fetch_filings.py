"""SEC EDGAR fetch client for Disclosure Atlas.

Build-time only. Polite by construction:
  - Declares the required User-Agent (from .env SEC_USER_AGENT).
  - Rate-limits to <= MAX_RPS requests/sec (SEC fair-access limit is ~10/s; we stay under).
  - Retries with exponential backoff on 429 / 5xx.
  - Caches EVERY downloaded artifact under data/raw/ so nothing is ever re-fetched.

This module is imported by load_enforcement.py and extract_footnotes.py.
It can also be run directly for a smoke test:  python ingestion/fetch_filings.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
load_dotenv(ROOT / ".env")

SEC_USER_AGENT = os.environ.get("SEC_USER_AGENT", "").strip()
if not SEC_USER_AGENT or "@" not in SEC_USER_AGENT:
    raise SystemExit(
        "SEC_USER_AGENT missing/invalid in .env. SEC requires 'Name email'. "
        "See SETUP.md preflight."
    )

MAX_RPS = 8.0                 # stay safely under SEC's ~10/s fair-access limit
_MIN_INTERVAL = 1.0 / MAX_RPS
MAX_RETRIES = 5
BACKOFF_BASE = 1.5           # seconds; exponential

_HEADERS = {
    "User-Agent": SEC_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
}


class SECClient:
    """Single rate-limited, caching SEC client. Use one instance per run."""

    def __init__(self, cache_dir: Path = RAW, max_rps: float = MAX_RPS):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update(_HEADERS)
        self._min_interval = 1.0 / max_rps
        self._last_request_ts = 0.0
        self.stats = {"requests": 0, "cache_hits": 0, "retries": 0, "errors": 0}

    # ----- cache helpers -------------------------------------------------
    def _cache_path(self, url: str, subdir: str) -> Path:
        """Deterministic cache path. subdir groups artifacts; filename is a
        readable prefix + a short url hash so collisions can't happen."""
        h = hashlib.sha256(url.encode()).hexdigest()[:16]
        safe = url.rstrip("/").split("/")[-1][:60].replace("?", "_").replace("&", "_")
        d = self.cache_dir / subdir
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{safe}__{h}"

    # ----- core fetch ----------------------------------------------------
    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_request_ts = time.monotonic()

    def get(self, url: str, subdir: str = "misc", force: bool = False) -> bytes:
        """GET with cache, throttle, and backoff. Returns raw bytes."""
        cache_path = self._cache_path(url, subdir)
        if cache_path.exists() and not force:
            self.stats["cache_hits"] += 1
            return cache_path.read_bytes()

        last_exc: Optional[Exception] = None
        for attempt in range(MAX_RETRIES):
            self._throttle()
            try:
                resp = self.session.get(url, timeout=45)
                self.stats["requests"] += 1
                if resp.status_code == 200:
                    cache_path.write_bytes(resp.content)
                    return resp.content
                if resp.status_code in (429, 500, 502, 503, 504):
                    self.stats["retries"] += 1
                    wait = BACKOFF_BASE ** (attempt + 1)
                    time.sleep(wait)
                    continue
                # other 4xx (e.g. 404 Not Found, 403): permanent — surface immediately, no retry.
                # RuntimeError is not a RequestException, so it escapes the loop at once.
                self.stats["errors"] += 1
                raise RuntimeError(f"SEC fetch {resp.status_code} (no retry): {url}")
            except requests.RequestException as e:
                last_exc = e
                self.stats["retries"] += 1
                time.sleep(BACKOFF_BASE ** (attempt + 1))
        self.stats["errors"] += 1
        raise RuntimeError(f"SEC fetch failed after {MAX_RETRIES} retries: {url} ({last_exc})")

    def get_json(self, url: str, subdir: str = "json", force: bool = False) -> Any:
        return json.loads(self.get(url, subdir=subdir, force=force))

    def get_text(self, url: str, subdir: str = "text", force: bool = False) -> str:
        return self.get(url, subdir=subdir, force=force).decode("utf-8", errors="replace")

    # ----- typed endpoints ----------------------------------------------
    def submissions(self, cik: str) -> dict:
        """Filing history for a company. cik may be int-ish or zero-padded."""
        cik10 = str(cik).lstrip("0").zfill(10)
        return self.get_json(
            f"https://data.sec.gov/submissions/CIK{cik10}.json", subdir="submissions"
        )

    def all_filings(self, cik: str) -> list[dict]:
        """Every filing for a company as a list of dicts, merging the 'recent' block
        with any older paged submission files (needed for delisted historical filers)."""
        sub = self.submissions(cik)
        out: list[dict] = []

        def _expand(block: dict) -> list[dict]:
            keys = ["accessionNumber", "filingDate", "reportDate", "form",
                    "primaryDocument", "primaryDocDescription"]
            cols = {k: block.get(k, []) for k in keys}
            n = len(cols["accessionNumber"])
            return [{k: (cols[k][i] if i < len(cols[k]) else None) for k in keys}
                    for i in range(n)]

        recent = sub.get("filings", {}).get("recent", {})
        out.extend(_expand(recent))
        for f in sub.get("filings", {}).get("files", []):
            name = f.get("name")
            if name:
                paged = self.get_json(
                    f"https://data.sec.gov/submissions/{name}", subdir="submissions")
                out.extend(_expand(paged))
        return out

    def company_facts(self, cik: str) -> dict:
        """All reported XBRL facts (us-gaap/dei) for a company across all years.
        One cached JSON per company — the structured-financials source for Chapter D."""
        cik10 = str(cik).lstrip("0").zfill(10)
        return self.get_json(
            f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik10}.json", subdir="companyfacts"
        )

    def company_tickers(self) -> dict:
        """SEC's full company_tickers.json (name<->CIK<->ticker)."""
        return self.get_json(
            "https://www.sec.gov/files/company_tickers.json", subdir="reference"
        )

    def full_text_search(self, query: str, forms: str = "10-K", **params) -> dict:
        """EDGAR full-text search (EFTS). Covers 2001+."""
        from urllib.parse import urlencode
        q = {"q": query, "forms": forms, **params}
        return self.get_json(
            "https://efts.sec.gov/LATEST/search-index?" + urlencode(q), subdir="efts"
        )


def _smoke_test() -> int:
    c = SECClient()
    sub = c.submissions("320193")
    assert sub["name"] == "Apple Inc.", sub.get("name")
    tickers = c.company_tickers()
    assert len(tickers) > 1000, len(tickers)
    # second call should be a cache hit
    c.submissions("320193")
    print("SMOKE OK:", c.stats, "| Apple SIC:", sub["sicDescription"])
    return 0


if __name__ == "__main__":
    sys.exit(_smoke_test())
