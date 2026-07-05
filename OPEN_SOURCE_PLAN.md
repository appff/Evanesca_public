# Evanesca Open-Source Release Plan

## Goal

Reorganize Evanesca as an open-source DeFi forensic and measurement framework, released with source code, a technical report, reproducible examples, and eventually a frontend evidence explorer.

This release is not a resubmission of the IMC paper. The public materials should present Evanesca as a project-maintained framework and should avoid overclaiming real-time exploit detection.

The preferred publication path is a new public GitHub repository populated from
the curated release subset, not a direct public push of the historical research
working tree.

Public repository URL:

```text
git@github.com:appff/Evanesca_public.git
```

## Public Positioning

Recommended tagline:

> Evanesca is an open-source framework for reconstructing DeFi value-extraction playbooks as Semantic Financial Graphs and auditing them with transparent financial constraints.

Use this framing consistently:
- forensic reconstruction
- Semantic Financial Graphs
- constraint-based measurement
- replayable evidence traces
- analyst-facing candidate surfacing
- research artifact and developer framework

Avoid this framing:
- real-time exploit detector
- zero-day detector
- low-FPR production monitor
- guarantee of malicious intent
- complete coverage of all DeFi attacks

## Release Package

The public release should contain:
- source code and CLI entry points;
- technical report / whitepaper;
- reproducible transaction examples;
- public API/output schema documentation;
- license and contribution files;
- export script for preparing the public repository;
- GitHub smoke-test workflow for public release checks;
- later: frontend evidence explorer.

Frontend work should start only after the technical report, public README, and output schema are stable.

## Authorship and Attribution

Technical report author line can be either:
- `Evanesca Project`, or
- the current maintainer as the report author.

Suggested acknowledgement:

> This technical report builds on the Evanesca research prototype and incorporates feedback from prior academic review cycles. The open-source release reorganizes the system as a project-maintained framework for DeFi transaction reconstruction and evidence exploration.

Keep git history and contributor records intact. Do not expose private emails, advisor drafts, or review-process notes in the public release.

## Claims Allowed in Public Materials

Use numbers only after checking `docs/results/key-numbers.md`.

Current defensible public claims:
- Evanesca reconstructs DeFi transactions into typed financial actions.
- Evanesca builds Semantic Financial Graphs for replayable evidence traces.
- Evanesca evaluates a compact constraint library over financial actions.
- The research prototype was evaluated on 14,187,803 Ethereum transactions.
- The confirmed-incident benchmark contains 40 public incidents across five chains.
- The current paper-era scalar set contains 1,418 flagged instances, 956 baseline arbitrage instances, 462 non-baseline instances, and 219 implementation-defect instances.

Avoid or qualify:
- "100% detection" without explaining the exact 40-incident benchmark.
- "zero-day" unless the disclosure and prior-art status are explicitly documented.
- dollar impact estimates unless every number has reproducible calculation methodology.
- "all chains", "all protocols", or "complete DeFi coverage".

## Public Repository Hygiene

Before public release:
- remove or ignore local files such as `.DS_Store`, `texput.log`, `.claude/`, `.playwright-mcp/`, and generated scratch artifacts;
- keep `.env.example`, never `.env`;
- archive or remove private professor emails, draft replies, review notes, and local planning files;
- decide whether `docs/papers/evanesca/` is archived, removed from public branch, or replaced by the technical report;
- ensure README numbers match the technical report and `docs/results/key-numbers.md`;
- verify `npm test` or the documented reproduction subset.

## Documentation Plan

Primary public docs:
- `README.md`: short project overview and quick start.
- `docs/technical-report/evanesca-technical-report.md`: full technical report.
- `docs/public-api/analysis-result.schema.md`: JSON output contract for CLI and future frontend.
- `docs/public-claims.md`: public terminology and claim policy.
- `docs/public-release-inventory.md`: include/exclude policy for the public branch.
- `docs/results/key-numbers.md`: public copy of the paper-era scalar set.
- `docs/source-code/README.md`: source tree and public API orientation.
- `docs/release-checklist.md`: release gate for `v0.1.0`.
- `docs/dependency-audit.md`: dependency audit notes and release gate.
- `docs/release-status.md`: current branch status and blockers.
- `docs/release-notes/v0.1.0.md`: draft release notes and known limitations.
- `scripts/export-public-repo.sh`: creates a sibling public repository directory from the curated subset.
- `CONTRIBUTING.md`: contribution workflow.
- `SECURITY.md`: responsible disclosure and security contact.
- `CITATION.cff`: citation metadata.

Optional docs:
- `docs/examples/`: curated transaction examples.
- `docs/case-studies/`: human-readable walkthroughs.
- `docs/frontend/`: future evidence explorer notes.

## Technical Report Outline

1. Overview
2. Motivation
3. Threat Model and Terminology
4. Semantic Financial Graph
5. Constraint Evaluation
6. Evidence Trace and PnL Reconstruction
7. Case Studies
8. Evaluation Summary
9. Limitations
10. Reproducibility
11. Acknowledgements

## Frontend Plan

Build the frontend after the public output schema is stable.

Frontend role:
- evidence explorer, not detection dashboard;
- load analysis JSON;
- visualize SFG nodes and edges;
- show constraint firings and observed values;
- show evidence timeline and PnL summary;
- include curated case studies.

Suggested stack:
- Vite + React + TypeScript;
- React Flow for graph visualization;
- Figma design tokens translated into CSS variables;
- static example JSON first, live analysis API later.

## Initial Milestones

### M0: Branch and planning
- [x] Create `open-source-release` branch.
- [x] Add release plan.
- [x] Add technical report skeleton.
- [x] Add public output schema draft.

### M1: Public documentation baseline
- [x] Rewrite README.
- [ ] Draft technical report sections 1--5.
- [x] Add license/contributing/security/citation files.
- [x] Define public claim policy.
- [x] Add dependency audit notes.
- [x] Add draft release notes.
- [x] Add public release inventory.

### M2: Public artifact baseline
- [x] Add synthetic schema example JSON.
- [ ] Add curated replayed transaction example JSON files.
- [x] Document reproduction commands.
- [x] Add experimental JSON export CLI.
- [ ] Verify JSON export CLI on curated public transactions.
- [x] Add artifact manifest draft.
- [x] Add public source-code guide.

### M3: Repository cleanup
- [x] Add ignore rules for private/local files observed in the working tree.
- [x] Verify `.env` is not tracked and `.env.example` contains placeholder values only.
- [x] Remove tracked private correspondence and internal reserve artifacts from the public branch index.
- [x] Exclude IMC paper-era files from the public repository export.
- [ ] Verify `.gitignore`.

### M3.5: New public repository export
- [x] Decide to publish through a separate public repository.
- [x] Add public repository export script.
- [x] Generate and inspect `../Evanesca-public`.
- [x] Configure generated repo remote as `git@github.com:appff/Evanesca_public.git`.
- [x] Add public smoke-test GitHub workflow.
- [x] Push public repository `main`.

### M4: Frontend evidence explorer
- [ ] Import Figma design system.
- [ ] Build static evidence explorer over example JSON.
- [ ] Add transaction search only after backend/API path is stable.
