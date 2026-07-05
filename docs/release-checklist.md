# Open-Source Release Checklist

Status: draft checklist for `v0.1.0`.

## Documentation

- [x] README rewritten for public positioning.
- [x] Technical report public draft added.
- [x] Public analysis-result schema added.
- [x] Reproducibility guide added.
- [x] Artifact manifest draft added.
- [x] Example dataset directory added.
- [x] Public artifact validation script added.
- [x] Public claims policy added.
- [x] Source code guide added.
- [x] Public release inventory added.
- [x] Key numbers public summary added.
- [x] Technical report sections filled beyond skeleton.
- [x] README links verified after current file layout.

## Repository Hygiene

- [x] Ignore `.DS_Store`.
- [x] Ignore `.claude/`.
- [x] Ignore `.playwright-mcp/`.
- [x] Ignore `texput.log`.
- [x] Ignore private professor/reply drafts observed in working tree.
- [x] Remove tracked private correspondence from public branch index.
- [x] Remove tracked internal reserve artifact bundle from public branch index.
- [x] Exclude `docs/papers/evanesca/` from public branch index.
- [x] Verify `.env` is not tracked.
- [x] Verify `.env.example` is safe.

## Source Code

- [x] Verify `npm install` completes.
- [ ] Verify `npm run build` (currently fails on existing repository-wide TypeScript errors).
- [ ] Verify documented replay subset.
- [x] Add experimental JSON export CLI.
- [ ] Stabilize JSON export CLI output against `docs/public-api/analysis-result.schema.md`.
- [x] Verify `npm run analyze -- --help`.
- [x] Verify `npm run validate:public-artifacts`.
- [ ] Triage dependency audit findings before public tag.

## Artifacts

- [ ] Review `artifacts/defect-hashes-public/` for public release.
- [ ] Review `artifacts/non-baseline-hashes/` for public release.
- [ ] Separate public artifacts from internal supersets.
- [x] Exclude `artifacts/defect-hashes-internal/` from public branch index.
- [x] Exclude paper-era `docs/papers/evanesca/` material from public branch index.
- [x] Add manifest with counts for current public artifact bundles.
- [ ] Add reproduction commands and limitations for each public artifact.

## Public Repository Export

- [x] Use separate public repository strategy.
- [x] Add `scripts/export-public-repo.sh`.
- [x] Generate and inspect `../Evanesca-public`.
- [x] Verify public repo install with `PUPPETEER_SKIP_DOWNLOAD=true npm install`.
- [x] Verify public repo `npm run analyze -- --help`.
- [x] Verify public repo `npm run validate:public-artifacts`.
- [x] Configure public repo remote as `git@github.com:appff/Evanesca_public.git`.
- [x] Add GitHub smoke-test workflow for public release checks.
- [x] Create local initial commit in `../Evanesca-public`.
- [x] Push generated repository to GitHub.

## Governance

- [x] MIT license present.
- [x] CONTRIBUTING added.
- [x] SECURITY added.
- [x] CITATION.cff added.
- [x] Dependency audit notes added.
- [x] Documentation covered by MIT unless otherwise noted.
- [x] Add release notes for `v0.1.0`.

## Frontend

- [ ] Defer until technical report and schema stabilize.
- [ ] Import Figma design system after public docs baseline.
- [ ] Build static evidence explorer over example JSON first.
