# Example Datasets

Status: initial public example dataset directory.

Example datasets are small, curated files that let readers inspect Evanesca output without running a historical RPC replay.

## Files

- `sample-analysis-result.json`: schema-conforming illustrative analysis result for frontend and documentation development.
- `case-study-index.md`: candidate public transactions for future exported examples.
- `manifest.json`: machine-readable manifest for public example dataset validation.

The sample is intentionally minimal. It is not a measured result and should not be cited as an empirical claim.

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
