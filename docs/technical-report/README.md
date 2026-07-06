# Evanesca Technical Report

This directory contains the public technical report for the open-source Evanesca release.

The technical report is a project-maintained document, not a copy of the IMC submission. It should explain Evanesca as an open-source framework for DeFi transaction reconstruction, Semantic Financial Graph generation, constraint evaluation, and evidence exploration.

Primary files:
- `evanesca-technical-report.tex`: public LaTeX technical report source.
- `evanesca-technical-report.pdf`: compiled public technical report.
- `evanesca-technical-report.bib`: bibliography used by the LaTeX report.
- `evanesca-technical-report.md`: planning/reference draft that tracks release
  scope and writing decisions.
- `figures/`: self-contained report figures copied from the paper-era assets.

Current status:
- LaTeX/PDF public technical report generated;
- suitable as an initial open-source whitepaper;
- still not a final conference paper because implementation-synced constraint
  predicates, full artifact provenance, and correctness-evaluation tables remain
  unfinished.

Source policy:
- Figures may reuse IMC, DeFi 26, and arXiv-era Evanesca assets when they explain
  architecture, SFG construction, DSL constraints, or case-study mechanics.
- Scale-out experimental results should use the IMC-version numbers only.
- Accuracy/validation evidence from prior drafts may be used only when clearly
  scoped as validation evidence, not as a new scale-out result.
- The arbitrage baseline/non-baseline case-study distinction follows the IMC
  version.

Build command:

```bash
cd docs/technical-report
latexmk -pdf -interaction=nonstopmode -halt-on-error evanesca-technical-report.tex
```

Writing rules:
- avoid unsupported detector-style claims;
- define value extraction, benign arbitrage, harmful extraction, and candidate events before presenting results;
- prefer reproducible examples over broad claims;
- keep all numeric claims synchronized with `docs/results/key-numbers.md`.
