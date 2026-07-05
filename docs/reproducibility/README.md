# Reproducibility Guide

Status: draft guide for the open-source release.

This guide documents the public reproduction path for Evanesca artifacts. It intentionally separates code execution from paper-era claims until each artifact has a checked manifest.

## Environment

Requirements:
- Node.js 18 or later recommended;
- npm 8 or later;
- archive-capable RPC provider for historical Ethereum/BSC/Arbitrum/Optimism/Avalanche transactions;
- `.env` configured from `.env.example`.

Setup:

```bash
PUPPETEER_SKIP_DOWNLOAD=true npm install
cp .env.example .env
```

Fill in provider credentials in `.env`.

The `PUPPETEER_SKIP_DOWNLOAD=true` prefix avoids install-time browser download
failures from transitive documentation/rendering tooling. Evanesca's current
CLI and artifact validation paths do not require Puppeteer to download a
browser.

## Core Checks

```bash
# TypeScript build
npm run build

# Main mocha test suite
npm test

# Confirmed-incident benchmark
npm run attack
```

The confirmed-incident benchmark may require archive RPC access and can be slow on a cold receipt cache.

## Artifact Reproduction Levels

### Level 0: Static inspection

Use checked-in example JSON and manifests without running historical replay.

Relevant files:
- `docs/example-datasets/`
- `docs/reproducible-artifacts/`
- `docs/public-api/analysis-result.schema.md`

Validation command:

```bash
npm run validate:public-artifacts
```

### Level 1: Case-study replay

Replay a small set of curated public transactions and compare exported JSON against the public schema.

Export a single transaction to public-schema JSON:

```bash
npm run analyze -- --tx <transaction-hash> --chain ethereum --out out/analysis.json --pretty
```

The export wrapper is experimental and intended to stabilize the public artifact/frontend contract before the frontend is built.

Current checked-in replayed example:

```bash
npm run analyze -- --tx 0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838 --chain ethereum --out docs/example-datasets/bzx-analysis-result.json --pretty
```

### Level 2: Confirmed-incident benchmark

Run:

```bash
npm run attack
```

Expected scope: the project-maintained confirmed-incident benchmark. Exact headline numbers must be checked against the current artifact manifest before publication.

### Level 3: Large-scale measurement

Large-scale reproduction requires dataset access, historical RPC availability, and cache configuration. Do not claim full large-scale reproducibility until the public artifact manifest documents the dataset, commands, and expected outputs.

## Public Claim Rule

A result is public-release ready only if it has:
- source data or transaction identifiers;
- command or script path;
- expected output;
- known environment requirements;
- limitations.
