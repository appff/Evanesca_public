# Source Code Guide

Status: draft guide for the open-source release.

This page orients public users to the Evanesca source tree without requiring them to read the historical paper draft.

## Current Entry Points

Important paths:
- `src/Driver.ts`: transaction analysis entry point used by the research prototype.
- `src/cli/analyze.ts`: experimental public JSON export wrapper.
- `src/DSL/`: constraint language, parser, and evaluation machinery.
- `src/test/attacks/`: confirmed-incident regression tests and replay harnesses.
- `src/test/attacks/shared/attackDatabase.json`: project-maintained incident metadata used by tests.
- `scripts/`: research and artifact-generation scripts.
- `artifacts/`: generated or curated research artifacts that require public-release review.

## Public API Direction

The public interface should export JSON matching:

- `docs/public-api/analysis-result.schema.md`

Current command:

```bash
npm run analyze -- --tx <transaction-hash> --chain ethereum --out out/analysis.json --pretty
```

The wrapper is experimental. The frontend should use exported JSON files first and should not import internal TypeScript modules directly.

## Code Release Policy

Before tagging a public release:
- verify `npm install`;
- verify `npm run build` or document why it fails;
- verify the documented replay subset;
- remove or archive private/local files;
- keep `.env.example`, never `.env`;
- keep public claims aligned with reproducible artifacts.

## Known Cleanup Work

The current repository still contains historical research files and paper-era materials. Public release cleanup should decide whether each is:
- public source;
- public documentation;
- public artifact;
- archived historical material;
- private/local material to exclude from public branch.

Current branch status and release blockers are tracked in `docs/release-status.md`.

Repository-wide TypeScript build status is tracked in
`docs/source-code/build-status.md`.
