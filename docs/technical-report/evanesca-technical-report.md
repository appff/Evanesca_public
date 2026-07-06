# Evanesca Technical Report

The authoritative technical report is the LaTeX/PDF pair in this directory:

- `evanesca-technical-report.tex`
- `evanesca-technical-report.pdf`

The report is formatted as a single-column public litepaper/whitepaper rather
than an ACM conference submission. It uses the IMC-version measurement snapshot
for scale-out results, reuses paper-era figures only as system/case-study
explanatory material, and keeps stronger future-conference claims explicitly
out of scope.

Current report structure:

1. Introduction
2. Definitions and Threat Model
3. Measurement Questions
4. System Overview
5. Semantic Financial Graph
6. Constraint Methodology
7. Datasets and Scope
8. Evaluation Snapshot
9. Case Studies
10. Comparison With Prior Work
11. Public Release and Reproducibility
12. Limitations
13. Ethics and Disclosure
14. Future Work
15. Conclusion

Build from this directory with:

```bash
latexmk -pdf -interaction=nonstopmode -halt-on-error evanesca-technical-report.tex
```
