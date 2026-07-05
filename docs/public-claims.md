# Public Claims Policy

Status: draft policy for the open-source release.

Public Evanesca materials should be conservative, reproducible, and clear about scope.

## Allowed Framing

Use:
- forensic reconstruction framework;
- measurement framework;
- Semantic Financial Graph;
- constraint-based evidence trace;
- candidate event for analyst review;
- reproducible case study;
- research prototype.

Avoid:
- production exploit detector;
- zero-day detector;
- low-false-positive monitor;
- guaranteed malicious behavior;
- complete DeFi attack coverage.

## Terminology

`candidate event`: a transaction or evidence trace that satisfies one or more Evanesca constraints.

`benign arbitrage`: value extraction that resolves price differences without violating protocol-local accounting, oracle, collateral, reward, bridge-backing, or derivative-pricing assumptions.

`harmful extraction`: abnormal value transfer caused by violating or exploiting a protocol-local economic rule.

`confirmed incident`: a publicly documented incident with replayable on-chain transaction evidence.

## Numeric Claims

Numeric claims must point to:
- source transaction list or dataset;
- command or script path;
- expected output;
- limitations.

Current scalar claims are summarized in `docs/results/key-numbers.md`.

Current paper-era claims may be used only with scope qualifiers:
- 14,187,803 Ethereum transactions;
- 40 confirmed incidents across five chains;
- 1,418 flagged instances;
- 956 routine arbitrage baseline instances;
- 462 non-baseline instances;
- 219 implementation-defect instances;
- nine constraints.

Do not use dollar-impact estimates unless the calculation method is public and reproducible.

## README Rule

The README should stay short and should not carry the full burden of empirical claims. Put detailed result claims in the technical report or artifact manifests.
