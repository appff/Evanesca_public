# Example Datasets

Status: initial public example dataset directory.

Example datasets are small, curated files that let readers inspect Evanesca output without running a historical RPC replay.

## Files

- `sample-analysis-result.json`: schema-conforming illustrative analysis result for frontend and documentation development.
- `bzx-analysis-result.json`: replayed bZx Ethereum transaction exported by the public CLI.
- `case-study-index.md`: candidate public transactions for future exported examples.
- `manifest.json`: machine-readable manifest for public example dataset validation.

The sample is intentionally minimal. It is not a measured result and should not be cited as an empirical claim.

`bzx-analysis-result.json` is a measured replay artifact for the transaction
listed in `case-study-index.md`. It is suitable for inspecting the public JSON
schema and evidence timeline, but it should not be treated as a full
precision/recall evaluation.

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
