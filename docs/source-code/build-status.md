# Build Status

Status: public-release build audit.

Last checked: 2026-07-06.

## Commands

```bash
npm run build
npm run analyze -- --help
npm run validate:public-artifacts
```

## Current Result

`npm run build` currently fails for the repository-wide TypeScript project.
The latest local audit exited with status `1` and reported 366 `error TS`
diagnostics.

This does not block the current public CLI smoke path:

- `npm run analyze -- --help` passes after dependencies are installed.
- `npm run validate:public-artifacts` passes.
- The replayed bZx example has been generated with `npm run analyze`.

## Error Categories

Representative build failure categories:

| Category | Examples | Interpretation |
|----------|----------|----------------|
| Type drift in DSL/compiler internals | `DSLCompiler.ts`, `DSLConstraintSolver.ts` | object shapes and generated condition variables are wider than their declared types |
| Legacy graph interface mismatch | `Types/GraphTypes.ts`, `PatternDetection/*` | historical analyzers expect edge fields that are not present on the current shared interfaces |
| Stale imports / moved modules | `Benchmarks/*`, `ConstraintSolver/ConstraintSolver.ts`, `Evaluation/attacks/*` | legacy benchmark and formal-spec paths no longer match the current tree |
| Test harness drift | `src/test/unit/*`, `src/test/attacks/*` | old tests expect previous API shapes or helper types |
| Verification tool drift | `VerificationTools/*` | historical verification scripts import outdated driver or result interfaces |

## Public Release Interpretation

For the current public release, the supported execution surface is the public
JSON export path and artifact validator. The full repository build remains a
release gate before tagging a stable `v0.1.0`.

Do not present the current source tree as a fully typed SDK until either:

1. legacy modules are archived outside the build graph; or
2. their imports and type definitions are migrated to the current interfaces.

## Cleanup Plan

1. Define a public `tsconfig` that includes only maintained runtime and CLI
   modules.
2. Move obsolete benchmark, verification, and paper-era experiment code behind
   explicit archival paths or repair their imports.
3. Normalize graph edge interfaces used by `PatternDetection`, `ConstraintSolver`,
   and `Driver`.
4. Re-enable `npm run build` as a hard public release gate after the maintained
   source set is clean.
