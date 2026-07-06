# Example Datasets

Status: initial public example dataset directory.

Example datasets are small, curated files that let readers inspect Evanesca output without running a historical RPC replay.

## Files

- `sample-analysis-result.json`: schema-conforming illustrative analysis result for frontend and documentation development.
- `bzx-analysis-result.json`: replayed bZx Ethereum transaction exported by the public CLI.
- `harvest-analysis-result.json`: replayed Harvest Ethereum transaction exported by the public CLI.
- `case-study-index.md`: candidate public transactions for future exported examples.
- `manifest.json`: machine-readable manifest for public example dataset validation.

The sample is intentionally minimal. It is not a measured result and should not be cited as an empirical claim.

`bzx-analysis-result.json` is a measured replay artifact for the transaction
listed in `case-study-index.md`. It is suitable for inspecting the public JSON
schema and evidence timeline, but it should not be treated as a full
precision/recall evaluation.

`harvest-analysis-result.json` is a measured replay artifact for the Harvest
transaction listed in `case-study-index.md`. It provides an exchange-rate
manipulation walkthrough with 5 graph nodes, 18 graph edges, 2 constraint
records, and 18 evidence steps. The current exported classifier leaves the
category as `unattributed`, so use it as evidence-trace material rather than a
final incident label. The checked-in file is generated from the public fallback
RPC path. Running the same transaction with configured archive/API providers can
recover additional token metadata and may change profit-attribution diagnostics
while preserving the graph/evidence shape.

## Dataset Policy

Public example datasets should be:
- small enough for repository use;
- based on public transaction identifiers or synthetic examples;
- free of secrets, private notes, and undisclosed vulnerabilities;
- accompanied by schema version and limitations.

Larger public hash sets should live under `artifacts/` with a manifest, not in this directory.

## Validation

```bash
npm run validate:public-artifacts
```

Regenerate the bZx example with:

```bash
npm run analyze -- --tx 0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838 --chain ethereum --out docs/example-datasets/bzx-analysis-result.json --pretty
```

Regenerate the Harvest example with:

```bash
npm run analyze -- --tx 0x35f8d2f572fceaac9288e5d462117850ef2694786992a8c3f6d02612277b0877 --chain ethereum --out docs/example-datasets/harvest-analysis-result.json --pretty
```
