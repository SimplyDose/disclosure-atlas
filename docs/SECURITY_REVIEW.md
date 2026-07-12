# SECURITY_REVIEW.md — Disclosure Atlas

_Reviewed 2026-06-26 against the live deployment (https://disclosure-atlas.vercel.app) and the
codebase. This is an honest report — it states what passed, what was fixed in this pass, what
doesn't apply and why, and the residual risks worth knowing. It is not a rubber-stamp clean bill._

## Architecture (determines the threat model)
Disclosure Atlas is a **static site**: pre-built HTML/CSS/JS + static JSON/binary data files served
from Vercel's CDN. There is **no backend, no database, no user accounts, no server-side code, and no
secrets in the request path**. All compute (embedding search, BM25, exports) runs in the visitor's
browser. The only build-time secrets (Anthropic API key, SEC user-agent, Vercel token) live in a
local, git-ignored `.env` and are used by Python ingestion / the deploy step — never by the app.
This architecture is **inherently low-attack-surface**: there is no auth to bypass, no database to
inject, no server to overload, and nothing privileged for a request to reach.

---

## 1. Secret exposure (highest priority) — **PASS (proven clean)**

**Claim verified:** no API key, SEC user-agent, Vercel token, or any secret ships to or is
retrievable by a site visitor.

How it was verified (live, with Playwright + curl):
- **Shipped JS bundle** (`/assets/index-*.js`, 46 KB) fetched and scanned in-browser for
  `sk-ant`, `sk-ant-api03`, `[the SEC account password — redacted here]`, `VERCEL_TOKEN`, `x-api-key`, `Bearer `,
  `ANTHROPIC_API_KEY` → **0 hits**. Same grep over `app/dist/**` → 0 hits.
- **No source maps** are shipped (`find app/dist -name '*.map'` → none; Vite default).
- **Network on load**: the only origins contacted are the site's own origin and Google Fonts
  (`fonts.googleapis.com`, `fonts.gstatic.com`). **No request to `api.anthropic.com`** and **no
  Vercel API call** — confirmed via `performance.getEntriesByType('resource')`.
- **The frontend never references the Anthropic key path**: `grep` of the bundle for
  `api.anthropic.com`, `import.meta.env`, `process.env` → **none**. The app reads no environment
  variables; the Anthropic key is used only by build-time Python (`generate_explanations.py`).
- **Client storage**: `localStorage` holds only UI prefs (`atlas.panelW`, `atlas.shortlist=[]`,
  `atlas.kwBaseline`); `sessionStorage` empty. No secrets, no PII.
- **Window globals**: `window.__atlas` exposes only `{engine, panel}` (public data + render logic);
  no key/token/secret/password fields.
- **Shipped data files** (`nodes/neighbors/excerpts/findings/aaer/manifest.json`, `embeddings.bin`)
  contain only public SEC data (company names, CIKs, sec.gov URLs, footnote excerpts), pre-generated
  Claude explanations, and embedding vectors — nothing secret.

**Conclusion:** a site visitor cannot retrieve the Anthropic key (or any secret); it is never
shipped, referenced, or transmitted by the frontend.

## 2. `.env` and git hygiene — **PASS**
- `.gitignore` excludes `.env` and `.env.*` (lines 1–2).
- The repo currently has **0 commits**; `.env` is **not tracked and not staged**
  (`git ls-files --error-unmatch .env` → not tracked). It has therefore never been committed.
- Full history scan: `git log --all -p | grep sk-ant-api03` → **0**; `git grep` over tracked files
  for key/token/private-key patterns → none.
- `dist/` and `app/src` contain no hardcoded secrets/tokens/credentials.

## 3. Dependency / supply-chain — **PASS (after fix), with documented residual CDN trust**
- **Fixed this pass:** `npm audit` originally reported 2 vulnerabilities (1 high, 1 moderate), both
  in the `vite` dev-dependency (a Vite dev-server path-traversal in `.map` handling + an esbuild
  dev-server request-leak; plus a Windows-only NTLM issue we are not exposed to on macOS). These are
  **dev-server-only** and do **not** affect the static production build, but `vite` was upgraded
  `5.4.21 → 8.1.0` and `npm audit` now reports **0 vulnerabilities**. The rebuilt app was re-verified.
- **Runtime third-party code** is loaded lazily and only when the user opts into a heavy feature:
  - `@huggingface/transformers@3.3.3` from `cdn.jsdelivr.net` (in-browser bge-small for paste/compare),
  - `xlsx-0.20.3` from `cdn.sheetjs.com` (XLSX export; CSV is the default and needs no CDN),
  - bge-small ONNX model weights from the Hugging Face hub,
  - Google Fonts CSS/woff2 from `fonts.googleapis.com` / `fonts.gstatic.com`.
  All are **official sources** and all are **version-pinned** (the practical supply-chain mitigation).
- **Honest residual risk:** ES-module dynamic `import()` does not support Subresource Integrity
  (SRI), so these CDN imports cannot carry an integrity hash. A compromise of jsdelivr / sheetjs /
  the HF hub could run code in a visitor's browser *when they use paste/compare/xlsx*. This is a
  genuine, accepted trade-off for a $0-runtime in-browser-ML design. The CSP (below) constrains
  `script-src` to exactly these origins, so no *other* origin can inject script. **Recommendation
  (not done — would change architecture):** self-host the transformers + SheetJS bundles to remove
  third-party-CDN trust entirely. Logged as a future option, not a blocker.

## 4. Client-side safety (XSS, links, hash) — **PASS**
- **Pasted user text is never reflected as executable HTML.** Tested live: pasting
  `<img src=x onerror=…><script>…</script>…` into the **paste box** rendered as escaped text
  (`&lt;img`, `&lt;script`), the payload did **not** execute (`window.__XSS_FIRED` stayed false),
  and no raw `<img>`/`<script>` entered the DOM. Same payload in the **compare** box: the result
  panel shows only a computed cosine + fixed reading string; the input is not reflected and did not
  execute. All data- and user-derived strings rendered via `innerHTML` go through an HTML-escaping
  helper (`esc()`); company names/excerpts/explanations are escaped; tooltips use `textContent`.
- **URL-hash permalink (`#f=qi.mi`) cannot be abused.** The parser only accepts `^f=(\d+)\.(\d+)$`
  and bounds-checks the indices. Loading `#f=<img src=x onerror=alert(1)>.1` was a no-op: app loaded
  normally, panel did not open, and the hash was **not** echoed into the DOM.
- **External links** (source filings, fallback list) use `target="_blank"` with `rel="noopener"`
  (verified on rendered links), preventing reverse-tabnabbing.
- **No `eval`/`new Function` on user input**; the only eval-class capability is WebAssembly
  compilation inside the pinned ONNX runtime, constrained by CSP `'wasm-unsafe-eval'`.

## 5. Hardening added this pass — security response headers (`app/public/vercel.json`)
Defense-in-depth headers now served on every response (verified live with `curl -I`):
- `Content-Security-Policy` — `default-src 'self'`; `script-src` locked to `'self'`, the two pinned
  CDNs, `blob:`, and `'wasm-unsafe-eval'`; `object-src 'none'`; `base-uri 'self'`;
  `frame-ancestors 'none'`; `form-action 'self'`; `style-src` allows the inline styles the design
  uses + Google Fonts; `connect-src 'self' https:` (kept broad so the HF model download — which
  redirects across HF CDN hosts — isn't broken; the app sends no secrets, and `script-src` stays
  tight, which is the actual injection control).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`.
- **Verified non-breaking:** under the live CSP, paste (transformers + HF model + wasm) works,
  compare works, XLSX (SheetJS CDN) works, and there are **0 console errors / no CSP violations**.

## 6. Build-pipeline controls — **PASS (confirmed in code)**
- **SEC politeness/rate-limit:** `ingestion/fetch_filings.py` declares the required `User-Agent`,
  throttles to `MAX_RPS = 8` (under SEC's ~10/s), retries with exponential backoff
  (`MAX_RETRIES = 5`, `BACKOFF_BASE = 1.5`), and **caches every artifact to `data/raw/`** so nothing
  re-fetches. `SEC_USER_AGENT` is read only by Python; it is **never referenced anywhere in `app/`**.
- **Anthropic spend cap:** `ingestion/generate_explanations.py` reads `ANTHROPIC_SPEND_CAP_USD`
  ($25), stops at a 0.90 safety margin, and parks to `BLOCKERS.md` before exceeding. Actual spend to
  date: $0.355.

## 7. What does NOT apply (stated honestly)
- **Row-Level Security (RLS) / database authorization — N/A.** There is no database. All data is
  static public SEC content baked into the build. There are no rows to protect and no query layer to
  secure.
- **User authentication / session security / CSRF — N/A.** There are no accounts, no logins, no
  cookies, no server-side sessions, and no state-changing endpoints. There is nothing to authenticate
  and no cross-site request that could forge a privileged action.
- **Server-side rate-limiting / DoS protection — N/A at the app layer.** There is no origin server to
  overload; static assets are served and cached by Vercel's CDN, which absorbs load. (Build-time SEC
  and Anthropic rate/spend limits *do* exist and are confirmed above.)
- **SQL/NoSQL injection, SSRF, server RCE — N/A.** No server code, no database, no server-side fetch
  of user-controlled URLs.
These are not gaps to "fix"; they are categories that the static, backend-less, account-less
architecture removes from the threat model. Adding them would be protecting against an architecture
we don't have.

## 8. Residual risks & honest caveats
- **CDN supply-chain (documented in §3):** transformers.js / SheetJS / HF model are pinned but
  loaded from third-party CDNs without SRI (ESM dynamic-import limitation). Low likelihood, scoped to
  opt-in features, `script-src`-constrained. Self-hosting would remove it.
- **`.env` contains a plaintext password (operational, not a deployed exposure).** The
  `SEC_USER_AGENT` line in the local `.env` currently holds an account password (it was pasted into
  that field). It is git-ignored, never tracked, and **never ships to the browser**, so it is not a
  site-visitor exposure — but it is poor secret hygiene for a local credential. **Recommendation:
  remove the password from that line and rotate it.** (SEC EDGAR needs only a `Name email`
  user-agent; no password is required.)
  _[Update 2026-07-06: resolved — the password has been removed from the local `.env`;
  `SEC_USER_AGENT` now carries only the required "Name email" form.]_
- **Credentials exposed in the chat transcript:** the Anthropic API key, SEC password, and Vercel
  token were pasted into the working conversation earlier. They are correctly kept out of git and the
  build, but a transcript is not a secret store. **Recommendation: rotate the Anthropic API key, the
  SEC account password, and (optionally) the Vercel token.** Tracked as a standing operational item.

## 9. Summary
| Area | Verdict |
|---|---|
| Secret exposure to visitors | **PASS — proven clean** (no key/token/UA in bundle/HTML/data/network/storage) |
| `.env` + git hygiene | **PASS** (git-ignored, never committed, 0 secrets in history) |
| Dependencies (npm audit) | **PASS** — 2 dev-only vulns fixed (vite → 8.1.0; now 0) |
| Supply-chain (CDN) | **PASS with documented residual** (pinned, official; no SRI on dynamic import) |
| XSS (paste / compare / hash) | **PASS** — input escaped, payloads inert, hash parser strict |
| External links | **PASS** — `rel="noopener"` |
| Security headers / CSP | **ADDED** — non-breaking, verified live |
| RLS / DB auth / server rate-limit | **N/A** — static, no backend/DB/accounts |
| Build-pipeline SEC + spend limits | **PASS** — confirmed in code |
| Open recommendation | **Rotate the chat-exposed credentials** (the `.env` password line has since been removed — see §8) |

No site-visitor-facing vulnerability was found. The one genuinely actionable item is operational
credential rotation (chat-exposed key/password), which is the user's to perform.
