# Reproducible Artifacts

Status: draft manifest for the open-source release.

This directory documents which Evanesca artifacts are intended for public reproduction and which remain internal research material.

## Artifact Classes

| Class | Purpose | Public release status |
|-------|---------|-----------------------|
| Confirmed incidents | Replay known public exploit transactions | Planned |
| Defect hash set | Public transaction hashes for implementation-defect findings | Planned |
| Example analysis JSON | Static inputs for technical report and frontend | Planned |
| Large-scale transaction corpus | Paper-era measurement dataset | Not yet public-release ready |
| Internal supersets | Rebuttal/debug-only candidate pools | Do not publish by default |

## Existing Candidate Artifact Locations

Current repository paths that need review before public release:
- `artifacts/defect-hashes-public/`
- `artifacts/non-baseline-hashes/`
- `wiki/evaluation/imc-submission-recovered-hashes.json`
- `wiki/evaluation/tend-wing-recovered-hashes.json`
- `wiki/evaluation/creamy-strict-yyCRV-pattern.json`

Do not publish internal or broader supersets without checking provenance and disclosure risk.

The public include/exclude policy is tracked in `docs/public-release-inventory.md`.

The current public artifact manifest is:

- `docs/reproducible-artifacts/public-artifacts.manifest.json`

Validation command:

```bash
npm run validate:public-artifacts
```

## Manifest Requirements

Every public artifact should document:
- artifact name;
- purpose;
- source transaction list or dataset source;
- generation command;
- expected count/hash;
- schema version;
- limitations;
- disclosure status.

## Planned Public Artifacts

1. `confirmed-incidents-v0.1`
   - Purpose: reproduce confirmed-incident reconstruction examples.
   - Status: planned.

2. `defect-hashes-public-v0.1`
   - Purpose: publish the public 219-hash defect subset if provenance checks pass.
   - Status: manifest added; provenance review required.

3. `example-analysis-json-v0.1`
   - Purpose: static JSON examples for documentation and frontend development.
   - Status: initial sample and case-study index added under `docs/example-datasets/`.

4. `non-baseline-hashes-v0.1`
   - Purpose: publish the current 1,386-hash non-baseline recovered bundle if provenance and claim-scope checks pass.
   - Status: manifest added; provenance review required.

## Non-Release Notes

Internal planning notes, professor emails, review drafts, and private rebuttal materials are not reproducible artifacts and should not be included in the public release.
