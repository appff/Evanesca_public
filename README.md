# Evanesca

[![Public smoke test](https://github.com/appff/Evanesca_public/actions/workflows/public-smoke-test.yml/badge.svg)](https://github.com/appff/Evanesca_public/actions/workflows/public-smoke-test.yml)

Evanesca is an open-source framework for reconstructing DeFi value-extraction playbooks as Semantic Financial Graphs and auditing them with transparent financial constraints.

It is designed for forensic reconstruction, measurement, reproducible case studies, and analyst-facing evidence exploration. It is not a real-time exploit detector and does not infer malicious intent from on-chain traces alone.

## What Evanesca Does

- Reconstructs DeFi transactions into typed financial actions such as swaps, deposits, withdrawals, borrows, repays, liquidations, and reward interactions.
- Builds Semantic Financial Graphs (SFGs) that preserve value flow, pricing dependencies, accounting relationships, and evidence needed for replay.
- Evaluates explicit financial constraints over those graphs.
- Produces candidate evidence traces for analyst review.
- Supports reproducible research artifacts and curated case studies.

## What Evanesca Is Not

- Not a low-false-positive production monitoring system.
- Not a guarantee that a transaction is malicious.
- Not a complete detector for all DeFi attacks.
- Not financial, legal, or security advice.

## Current Public Materials

- [Open-source release plan](OPEN_SOURCE_PLAN.md)
- [Technical report PDF](docs/technical-report/evanesca-technical-report.pdf)
- [Analysis result schema](docs/public-api/analysis-result.schema.md)
- [Reproducibility guide](docs/reproducibility/README.md)
- [Reproducible artifact manifest](docs/reproducible-artifacts/README.md)
- [Example datasets](docs/example-datasets/README.md)
- [Key numbers](docs/results/key-numbers.md)
- [Public claims policy](docs/public-claims.md)
- [Public release inventory](docs/public-release-inventory.md)
- [Source code guide](docs/source-code/README.md)
- [Release checklist](docs/release-checklist.md)
- [Dependency audit notes](docs/dependency-audit.md)
- [Release status](docs/release-status.md)
- [Release notes](docs/release-notes/v0.1.0.md)

## Research Prototype Results

The current research prototype was evaluated on 14,187,803 Ethereum transactions and a benchmark of 40 public DeFi incidents across five chains. The associated scalar set includes 1,418 flagged instances, 956 routine arbitrage baseline instances, 462 non-baseline instances, and 219 implementation-defect instances.

These numbers are bounded by the documented dataset and artifact scope. See the technical report and artifact documentation for limitations and reproducibility notes.

## Installation

Prerequisites:

- Node.js 18 or later is recommended.
- npm 8 or later.
- Archive-capable RPC access for historical transaction replay.

```bash
git clone git@github.com:appff/Evanesca_public.git
cd Evanesca_public
PUPPETEER_SKIP_DOWNLOAD=true npm install
cp .env.example .env
```

Fill in RPC provider credentials in `.env` before running historical transaction tests.

## Common Commands

```bash
# Run the main test suite
npm test

# Run the confirmed-incident attack benchmark
npm run attack

# Run a specific mocha test file
npm run testEach -- src/test/attacks/attack-detection.test.ts

# Export one transaction as public-schema JSON
npm run analyze -- --tx <transaction-hash> --chain ethereum --out out/analysis.json --pretty

# Build TypeScript
npm run build

# Export public subset to a sibling repository directory
bash scripts/export-public-repo.sh
```

Some commands require historical RPC access and may take longer on a cold receipt cache.

The public GitHub workflow intentionally runs only the release smoke tests:
dependency installation with Puppeteer browser download disabled, public
artifact validation, and CLI help. Full benchmark and replay jobs require
archive RPC credentials and are not enabled by default.

## Output Schema

The future CLI and frontend evidence explorer should exchange analysis results using the documented JSON contract:

- [docs/public-api/analysis-result.schema.md](docs/public-api/analysis-result.schema.md)

The frontend should consume exported analysis JSON rather than importing internal TypeScript modules directly.

## Technical Report

The public technical report is a project-maintained document. It explains Evanesca as an open-source framework for DeFi transaction reconstruction, Semantic Financial Graph generation, constraint evaluation, and evidence exploration.

- [docs/technical-report/evanesca-technical-report.pdf](docs/technical-report/evanesca-technical-report.pdf)

## Release Status

The open-source release is maintained in the public repository. Current limitations and known blockers are tracked in [docs/release-status.md](docs/release-status.md).

The public repository contains a curated release subset rather than the full
research working tree.

## Frontend Roadmap

Frontend work is intentionally deferred until the public technical report, README, and analysis-result schema are stable.

The intended frontend role is an evidence explorer:

- transaction or case-study input;
- SFG visualization;
- constraint firing panel;
- evidence timeline;
- PnL/value-flow summary;
- curated examples.

## License

Code and documentation are currently released under the MIT License unless otherwise noted. See [LICENSE](LICENSE).

## Citation

See [CITATION.cff](CITATION.cff).
