# Open-Source Release Status

Status: draft status tracker for the `open-source-release` branch.

Last updated: 2026-07-06.

## Deliverable Status

| Deliverable | Status | Evidence |
|-------------|--------|----------|
| Technical Report | Expanded public-release draft | `docs/technical-report/evanesca-technical-report.md` |
| Source code | Present, not release-clean | `src/`, `package.json`, `docs/source-code/README.md` |
| Documentation | Draft baseline | `README.md`, `OPEN_SOURCE_PLAN.md`, `docs/public-claims.md` |
| Reproducible artifacts | Manifest drafted, not fully verified | `docs/reproducible-artifacts/README.md` |
| Example datasets | Synthetic schema sample added | `docs/example-datasets/sample-analysis-result.json` |
| GitHub/Open-source release | Public repo pushed | `git@github.com:appff/Evanesca_public.git` |
| Separate public repo export | Generated, smoke-tested, committed, and pushed | `scripts/export-public-repo.sh`, `../Evanesca-public` |

## Verified This Branch

- `npm install` completed.
- `npm run analyze -- --help` completed.
- `npm run validate:public-artifacts` completed.
- generated `../Evanesca-public` and verified `PUPPETEER_SKIP_DOWNLOAD=true npm install`.
- generated `../Evanesca-public` passes `npm run analyze -- --help` and `npm run validate:public-artifacts`.
- generated `../Evanesca-public` uses `git@github.com:appff/Evanesca_public.git` as `origin`.
- public artifact manifest validates current defect and non-baseline hash-bundle counts.
- GitHub Actions smoke-test workflow added for install, artifact validation, and CLI help.
- public repository `main` pushed to `git@github.com:appff/Evanesca_public.git`.
- `.env` is not tracked; `.env.example` contains placeholder values only.
- README local links resolve under the current file layout.
- `docs/example-datasets/sample-analysis-result.json` parses as valid JSON.
- Private `professor_*.md`/`review.md` files, `artifacts/defect-hashes-internal/`, and `docs/papers/evanesca/` are removed from the public branch index.

## Current Release Blockers

1. `npm run build` fails on existing repository-wide TypeScript errors.
2. `npm audit` reports 108 vulnerabilities, including 3 critical and 33 high.
3. Public JSON export CLI exists but has not been replay-tested on curated public transactions.
4. Existing artifacts have count manifests but still need provenance, reproduction-command, and disclosure review before public release.
5. Technical report has an expanded public draft but still needs case-study evidence and implementation-synced constraint predicates.
6. Separate `../Evanesca-public` export has been generated, smoke-tested, committed, and pushed. Remaining release work is artifact provenance/dependency/build cleanup rather than repository publication.

## Next Release Gates

- Confirm `docs/public-release-inventory.md` before public push.
- Monitor the public smoke-test workflow after GitHub processes the push.
- Triage dependency audit and unused dependencies.
- Run one curated public transaction through `npm run analyze`.
- Regenerate at least one curated transaction as public example JSON.
- Expand the technical report with at least one verified case study.
- Keep `docs/release-notes/v0.1.0.md` synchronized with release gates.
