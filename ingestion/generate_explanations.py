"""Phase 4 — generate featured-pair resemblance explanations (build-time, Claude).

Product reframe (DECISIONS_LOG C13): this explains why two disclosures are *semantically
similar* — shared accounting concepts and language — as decision support. It NEVER concludes
fraud or enforcement, and enforcement history is never fed into the prompt (so explanations
can't be biased toward an accusation). Output is stored static text; no runtime API calls.

Safety/cost:
  - Hard spend cap from .env ANTHROPIC_SPEND_CAP_USD ($25). Stops + writes BLOCKERS.md if approached.
  - Idempotent: a featured pair already in `findings` is skipped (re-runnable without double charge).
  - SDK auto-retries 429/5xx with backoff.

Model: claude-opus-4-8. Thinking omitted (C14): these are short, grounded explanations; omitting
thinking keeps cost predictable and the output is exactly the explanation text.

Run:  python ingestion/generate_explanations.py
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import sys
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

from db import connect

ROOT = Path(__file__).resolve().parent.parent
EMB = ROOT / "data" / "embeddings"
load_dotenv(ROOT / ".env")

MODEL = "claude-opus-4-8"
MODEL_VERSION = "claude-opus-4-8"
PRICE_IN_PER_TOK = 5.0 / 1_000_000       # $5 / MTok input
PRICE_OUT_PER_TOK = 25.0 / 1_000_000     # $25 / MTok output
SPEND_CAP = float(os.environ.get("ANTHROPIC_SPEND_CAP_USD", "25"))
SAFETY_MARGIN = 0.90                      # stop at 90% of cap
MAX_TOKENS = 600

REV_QUOTA = 26
GC_QUOTA = 12
PER_COMPANY_CAP = 2                       # diversity: a company appears in <= N featured pairs

SYSTEM = (
    "You are a forensic accounting analyst writing short, neutral notes for a disclosure "
    "research tool. Given two financial-statement footnote excerpts from two different public "
    "companies, explain in 2-3 sentences WHY they are semantically similar: the specific "
    "accounting concepts, policies, and language they share, and one concrete thing an analyst "
    "could examine to compare them. This is decision support describing RESEMBLANCE of disclosure "
    "language only. Do NOT state or imply that either company committed fraud, misstatement, or "
    "wrongdoing, and do NOT speculate about SEC enforcement. Be precise and grounded strictly in "
    "the provided text. No preamble; output only the explanation."
)


def load():
    vecs = np.load(EMB / "embeddings.npy")
    meta = json.loads((EMB / "meta.json").read_text())
    return vecs, meta


import re as _re
_SUFFIX = _re.compile(r"\b(inc|incorporated|corp|corporation|co|company|companies|ltd|limited|"
                      r"llc|lp|holdings?|group|plc|sa|nv|ag|/[a-z]{2}/)\b", _re.I)


def _same_entity(name_a: str, name_b: str) -> bool:
    """Different CIKs can be the same economic entity (parent/sub, re-registration).
    Treat near-identical names (after stripping legal suffixes) as the same entity so
    featured pairs are genuinely DIFFERENT companies."""
    def toks(s):
        s = _SUFFIX.sub(" ", _re.sub(r"[.,/]", " ", s.lower()))
        return {t for t in s.split() if len(t) > 1}
    ta, tb = toks(name_a), toks(name_b)
    if not ta or not tb:
        return False
    jac = len(ta & tb) / len(ta | tb)
    return jac >= 0.6


def select_pairs(vecs, meta):
    typ = np.array([m["type"] for m in meta])
    cik = np.array([m["cik"] for m in meta])
    sims = vecs @ vecs.T
    np.fill_diagonal(sims, -1.0)

    def pairs_for_type(t, quota):
        idx = np.where(typ == t)[0]
        cand = []
        for i in idx:
            row = sims[i].copy()
            mask = (typ == t) & (cik != cik[i])
            if not mask.any():
                continue
            j = int(np.where(mask)[0][np.argmax(row[mask])])
            a, b = (i, j) if meta[i]["footnote_id"] < meta[j]["footnote_id"] else (j, i)
            cand.append((float(sims[i, j]), a, b))
        # dedup unordered pairs, keep highest sim
        best = {}
        for s, a, b in cand:
            key = (meta[a]["footnote_id"], meta[b]["footnote_id"])
            if key not in best or s > best[key][0]:
                best[key] = (s, a, b)
        ranked = sorted(best.values(), key=lambda x: -x[0])
        # greedy with per-company cap for diversity
        seen_co, picked = {}, []
        for s, a, b in ranked:
            ca, cb = cik[a], cik[b]
            if _same_entity(meta[a]["company_name"], meta[b]["company_name"]):
                continue  # same economic entity under two CIKs — not a cross-company resemblance
            if seen_co.get(ca, 0) >= PER_COMPANY_CAP or seen_co.get(cb, 0) >= PER_COMPANY_CAP:
                continue
            picked.append((s, a, b))
            seen_co[ca] = seen_co.get(ca, 0) + 1
            seen_co[cb] = seen_co.get(cb, 0) + 1
            if len(picked) >= quota:
                break
        return picked

    return pairs_for_type("rev_rec", REV_QUOTA) + pairs_for_type("going_concern", GC_QUOTA)


def enforced_ciks(con) -> set:
    return {r[0] for r in con.execute("SELECT DISTINCT cik FROM enforcement").fetchall()}


def main() -> int:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY missing in .env"); return 1
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    vecs, meta = load()
    by_id = {m["footnote_id"]: m for m in meta}
    pairs = select_pairs(vecs, meta)
    con = connect()
    enf = enforced_ciks(con)
    existing = {r[0] for r in con.execute("SELECT finding_id FROM findings").fetchall()}

    spent = 0.0
    generated, skipped, findings_json = 0, 0, []
    print(f"selected {len(pairs)} featured pairs; spend cap ${SPEND_CAP:.2f}")

    for sim, a, b in pairs:
        qa, qb = meta[a], meta[b]
        finding_id = f"{qa['footnote_id']}__{qb['footnote_id']}"
        if finding_id in existing:
            skipped += 1
            continue
        # stop before we risk exceeding the cap (worst-case next-call cost estimate)
        est_next = (2000 * PRICE_IN_PER_TOK) + (MAX_TOKENS * PRICE_OUT_PER_TOK)
        if spent + est_next > SPEND_CAP * SAFETY_MARGIN:
            _park_cap(spent, generated)
            break

        user = (
            f"Company A: {qa['company_name']} | footnote type: {qa['type']}\n"
            f"Excerpt A:\n{qa['text'][:1400]}\n\n"
            f"Company B: {qb['company_name']} | footnote type: {qb['type']}\n"
            f"Excerpt B:\n{qb['text'][:1400]}\n\n"
            f"(cosine similarity {sim:.3f})"
        )
        try:
            resp = client.messages.create(
                model=MODEL, max_tokens=MAX_TOKENS,
                system=SYSTEM,
                messages=[{"role": "user", "content": user}],
            )
        except Exception as e:
            print(f"  call failed for {finding_id}: {e}")
            continue
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        cost = resp.usage.input_tokens * PRICE_IN_PER_TOK + resp.usage.output_tokens * PRICE_OUT_PER_TOK
        spent += cost
        now = _dt.datetime.now(_dt.timezone.utc).isoformat()
        con.execute(
            "INSERT OR IGNORE INTO findings (finding_id, query_footnote_id, matched_footnote_id, "
            "similarity_score, llm_explanation, model_version, generated_at, reviewed_status) "
            "VALUES (?,?,?,?,?,?,?,?)",
            [finding_id, qa["footnote_id"], qb["footnote_id"], round(sim, 4), text,
             MODEL_VERSION, now, None])
        findings_json.append({
            "finding_id": finding_id, "footnote_type": qa["type"],
            "similarity": round(sim, 4), "explanation": text, "model": MODEL_VERSION,
            "a": {"company": qa["company_name"], "cik": qa["cik"], "sec_url": qa["sec_url"],
                  "enforcement_history": qa["cik"] in enf, "footnote_id": qa["footnote_id"]},
            "b": {"company": qb["company_name"], "cik": qb["cik"], "sec_url": qb["sec_url"],
                  "enforcement_history": qb["cik"] in enf, "footnote_id": qb["footnote_id"]},
        })
        generated += 1
        if generated % 5 == 0:
            print(f"  {generated} generated, ${spent:.3f} spent")

    # merge with any previously-generated findings for a complete shipped file
    all_rows = con.execute(
        "SELECT finding_id, query_footnote_id, matched_footnote_id, similarity_score, "
        "llm_explanation, model_version FROM findings").fetchall()
    full = []
    for fid, qid, mid, s, expl, mv in all_rows:
        qa, qb = by_id.get(qid), by_id.get(mid)
        if not (qa and qb):
            continue
        full.append({
            "finding_id": fid, "footnote_type": qa["type"], "similarity": s,
            "explanation": expl, "model": mv,
            "a": {"company": qa["company_name"], "cik": qa["cik"], "sec_url": qa["sec_url"],
                  "enforcement_history": qa["cik"] in enf, "footnote_id": qid},
            "b": {"company": qb["company_name"], "cik": qb["cik"], "sec_url": qb["sec_url"],
                  "enforcement_history": qb["cik"] in enf, "footnote_id": mid},
        })
    (EMB / "findings.json").write_text(json.dumps(full, indent=2, ensure_ascii=False))
    con.close()
    print(f"\ngenerated {generated} new, skipped {skipped} existing; total findings {len(full)}")
    print(f"Anthropic spend this run: ${spent:.3f} (cap ${SPEND_CAP:.2f})")
    return 0


def _park_cap(spent, generated):
    msg = (f"\n### [OPEN] Anthropic spend approaching cap during Phase 4\n"
           f"- Stopped explanation generation at ${spent:.2f} (cap ${SPEND_CAP:.2f}, "
           f"safety stop at {int(SAFETY_MARGIN*100)}%). {generated} explanations generated this run.\n"
           f"- To continue: raise ANTHROPIC_SPEND_CAP_USD in .env and re-run (idempotent).\n")
    (ROOT / "BLOCKERS.md").open("a").write(msg)
    print(f"SPEND CAP reached at ${spent:.2f} — parked to BLOCKERS.md, stopping.")


if __name__ == "__main__":
    sys.exit(main())
