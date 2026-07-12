# Locked Claude Design reference

`Disclosure Atlas.dc.html` and `support.js` are the locked Claude Design output
(project 340b8c5f-c179-4ec5-8442-caa633fd18c8, "Constellation app two screens"),
imported via the design MCP. The production app in `app/` reproduces this design
EXACTLY — same palette, type, motion, constellation aesthetic, and finding panel —
but the synthetic PRNG data in the .dc.html is replaced WHOLESALE with our real
ingested dataset (real companies, real CIKs, real UMAP coords, real similarity
scores, real pre-generated explanations). See DECISIONS_LOG C16.
