"""Chapter D / step 3 — map cached XBRL companyfacts -> annual line items in `financials`.

No network (reads SECClient cache only), idempotent (INSERT OR REPLACE). Selection rules:
annual 10-K points; flows = full-year durations (340-380 days),
stocks = fiscal-year-end instants; key by fiscal_year = year(period end); on collision keep the
latest fiscal-year-end, tie-break by latest filing (accn).

Run:  python ingestion/extract_financials.py
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

from db import connect
from db_financials import ensure_financials_schema, LINE_ITEMS
from fetch_filings import SECClient

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
DONE = PROC / "companyfacts_done.txt"
ABSENT = PROC / "companyfacts_absent.txt"
FIN_CKPT = PROC / "financials_done.txt"   # resumable: one CIK per line (financials extracted)

FLOW, STOCK = "flow", "stock"

# line_item -> (kind, [us-gaap tags in priority order])
TAGS: dict[str, tuple[str, list[str]]] = {
    "revenue": (FLOW, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues",
                       "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax",
                       "SalesRevenueGoodsNet"]),
    "cogs": (FLOW, ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold", "CostOfServices"]),
    "depreciation": (FLOW, ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization",
                            "Depreciation", "DepreciationAmortizationAndAccretionNet"]),
    "sga": (FLOW, ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"]),
    "income_cont_ops": (FLOW, ["IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest",
                               "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"]),
    "net_income": (FLOW, ["NetIncomeLoss", "ProfitLoss"]),
    "cfo": (FLOW, ["NetCashProvidedByUsedInOperatingActivities",
                   "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]),
    "issuance_equity": (FLOW, ["ProceedsFromIssuanceOfCommonStock", "ProceedsFromIssuanceOrSaleOfEquity"]),
    "issuance_debt": (FLOW, ["ProceedsFromIssuanceOfLongTermDebt"]),
    "receivables": (STOCK, ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "AccountsReceivableNet"]),
    "inventory": (STOCK, ["InventoryNet", "InventoryFinishedGoodsNetOfReserves"]),
    "current_assets": (STOCK, ["AssetsCurrent"]),
    "total_assets": (STOCK, ["Assets"]),
    "ppe_net": (STOCK, ["PropertyPlantAndEquipmentNet"]),
    "current_liabilities": (STOCK, ["LiabilitiesCurrent"]),
    "total_liabilities": (STOCK, ["Liabilities"]),
    "ltd_noncurrent": (STOCK, ["LongTermDebtNoncurrent", "LongTermDebt",
                               "LongTermDebtAndCapitalLeaseObligationsNoncurrent"]),
    "debt_current": (STOCK, ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings"]),
    "cash": (STOCK, ["CashAndCashEquivalentsAtCarryingValue",
                     "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]),
    "st_investments": (STOCK, ["ShortTermInvestments", "MarketableSecuritiesCurrent"]),
    "lt_investments": (STOCK, ["LongTermInvestments", "MarketableSecuritiesNoncurrent"]),
    "preferred_stock": (STOCK, ["PreferredStockValue", "PreferredStockValueOutstanding"]),
}
assert set(TAGS) == set(LINE_ITEMS), "TAGS must cover exactly the schema LINE_ITEMS"


def _pdate(s):
    try:
        return date.fromisoformat(s)
    except Exception:
        return None


def _series_for_tag(usd_points: list[dict], kind: str) -> dict[int, dict]:
    """fiscal_year -> {'end': date, 'val': float, 'accn': str} from one tag's USD points."""
    out: dict[int, dict] = {}
    for p in usd_points:
        form = (p.get("form") or "")
        if not form.startswith("10-K"):
            continue
        end = _pdate(p.get("end"))
        if end is None:
            continue
        if kind == FLOW:
            start = _pdate(p.get("start"))
            if start is None:
                continue
            days = (end - start).days
            if not (340 <= days <= 380):     # full fiscal year only (drop quarters / stub periods)
                continue
        val = p.get("val")
        if val is None:
            continue
        fy = end.year
        accn = p.get("accn") or ""
        cur = out.get(fy)
        # prefer the latest fiscal-year-end in that year; tie-break by latest filing (accn)
        if cur is None or (end > cur["end"]) or (end == cur["end"] and accn > cur["accn"]):
            out[fy] = {"end": end, "val": float(val), "accn": accn}
    return out


def extract_company(facts: dict) -> dict[int, dict]:
    """fiscal_year -> {line_item: value, '_fye': date}. Only years with total_assets are kept."""
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    per_item: dict[str, dict[int, dict]] = {}
    for item, (kind, tags) in TAGS.items():
        merged: dict[int, dict] = {}
        for tag in tags:
            node = gaap.get(tag)
            if not node:
                continue
            usd = (node.get("units") or {}).get("USD")
            if not usd:
                continue
            series = _series_for_tag(usd, kind)
            for fy, rec in series.items():
                if fy not in merged:          # first tag in the priority chain wins for that year
                    merged[fy] = rec
        per_item[item] = merged

    years = sorted(per_item["total_assets"].keys())
    rows: dict[int, dict] = {}
    for fy in years:
        row = {"_fye": per_item["total_assets"][fy]["end"]}
        for item in TAGS:
            rec = per_item[item].get(fy)
            row[item] = (rec["val"] if rec else None)
        rows[fy] = row
    return rows


def main() -> int:
    if not DONE.exists():
        print("no companyfacts_done.txt yet — run fetch_companyfacts.py first"); return 1
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    done = [c.strip() for c in DONE.read_text().splitlines() if c.strip()]
    absent = {c.strip() for c in ABSENT.read_text().splitlines()} if ABSENT.exists() else set()
    ciks = [c for c in done if c not in absent]

    # RESUMABLE: skip CIKs already extracted (checkpoint written only AFTER their rows are flushed to DB,
    # so a kill never leaves a checkpointed-but-unwritten CIK). INSERT OR REPLACE → idempotent anyway.
    fin_done = {c.strip() for c in FIN_CKPT.read_text().splitlines() if c.strip()} if FIN_CKPT.exists() else set()
    todo = [c for c in ciks if c not in fin_done]
    if limit is not None:
        todo = todo[:limit]
    print(f"financials: {len(ciks)} candidate CIKs, {len(fin_done)} already done, {len(todo)} this run", flush=True)

    client = SECClient()
    con = connect()
    ensure_financials_schema(con)
    ckpt = FIN_CKPT.open("a")
    cols = ["cik", "fiscal_year", "fye_date", *LINE_ITEMS, "loaded_at"]
    placeholders = ",".join("?" * len(cols))
    upsert = f"INSERT OR REPLACE INTO financials ({','.join(cols)}) VALUES ({placeholders})"

    now = datetime.utcnow()
    companies = rows_written = no_cache = 0
    batch = []
    pending_ckpt = []   # CIKs whose rows are in `batch` but not yet committed

    def _flush():
        nonlocal batch, pending_ckpt
        if batch:
            con.executemany(upsert, batch); con.commit(); batch = []
        for cc in pending_ckpt:
            ckpt.write(cc + "\n")
        ckpt.flush(); pending_ckpt = []

    for i, cik in enumerate(todo, 1):
        try:
            facts = client.company_facts(cik)          # cache hit (no network for fetched CIKs)
        except Exception:
            no_cache += 1
            pending_ckpt.append(cik)                    # no cache → mark done so we don't retry forever
            continue
        rows = extract_company(facts)
        if rows:
            companies += 1
        for fy, row in rows.items():
            batch.append([cik, fy, row["_fye"], *[row[c] for c in LINE_ITEMS], now])
            rows_written += 1
        pending_ckpt.append(cik)
        if len(batch) >= 2000:
            _flush()
        if i % 200 == 0:
            print(f"  {i}/{len(todo)} companies_with_data={companies} rows={rows_written}", flush=True)
    _flush()
    ckpt.close()

    total = con.execute("SELECT COUNT(*) FROM financials").fetchone()[0]
    distinct = con.execute("SELECT COUNT(DISTINCT cik) FROM financials").fetchone()[0]
    con.close()
    print(f"DONE: companies_with_data={companies} company_years_written={rows_written} "
          f"no_cache={no_cache} | financials rows={total} distinct_ciks={distinct}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
