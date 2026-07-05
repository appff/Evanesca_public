# Public Release Inventory

Status: draft inventory for the `open-source-release` branch.

This document classifies repository material for the first public Evanesca
release. It is a release-control document, not a deletion script.

The intended publication path is a separate public repository generated from
the curated subset. Use:

```bash
bash scripts/export-public-repo.sh
```

By default this exports to `../Evanesca-public`.

The generated repository remote is:

```text
git@github.com:appff/Evanesca_public.git
```

## Release Principle

The public repository should contain enough material to understand, run, cite,
and extend Evanesca as an open-source DeFi forensic reconstruction framework.
It should not expose private correspondence, reviewer-response material,
internal defense reserves, or stale paper build products.

## Include

These files are intended for the public release after normal review:

| Path | Role |
|------|------|
| `src/` | Evanesca implementation |
| `scripts/validate-public-artifacts.js` | Public artifact validator |
| `scripts/export-public-repo.sh` | Public-repository export helper |
| `package.json`, `package-lock.json` | Node.js package metadata |
| `.env.example` | Placeholder environment template |
| `.github/workflows/public-smoke-test.yml` | Public release smoke-test workflow |
| `README.md` | Public project overview |
| `LICENSE` | MIT license |
| `CONTRIBUTING.md` | Contribution workflow |
| `SECURITY.md` | Security contact and disclosure policy |
| `CITATION.cff` | Citation metadata |
| `OPEN_SOURCE_PLAN.md` | Release plan |
| `docs/technical-report/` | Public technical report |
| `docs/public-api/` | JSON schema for CLI/frontend artifacts |
| `docs/example-datasets/` | Synthetic schema example and future curated examples |
| `docs/reproducibility/` | Reproduction guide |
| `docs/reproducible-artifacts/` | Artifact manifest planning |
| `docs/source-code/` | Source tree guide |
| `docs/public-claims.md` | Public claim policy |
| `docs/results/key-numbers.md` | Public scalar summary for paper-era results |
| `docs/dependency-audit.md` | Dependency audit status |
| `docs/release-checklist.md` | Release gate checklist |
| `docs/release-status.md` | Current branch status |
| `docs/release-notes/` | Draft public release notes |

## Include After Provenance Review

These paths may be public artifacts, but they need provenance, disclosure, and
reproduction review before a release tag:

| Path | Reason for review |
|------|-------------------|
| `artifacts/defect-hashes-public/` | Public-looking 219-hash defect subset; count manifest added, but commands/provenance/disclosure still need review. |
| `artifacts/non-baseline-hashes/` | Larger 1,386-hash non-baseline set; count manifest added, but relationship to public claims and false-positive caveats still need review. |
| `wiki/evaluation/*.json` | Some recovered hash lists may support artifacts, but wiki data should not become release data without a manifest. |
| `src/test/attacks/shared/attackDatabase.json` | Useful benchmark metadata; verify public provenance and current command path. |

## Exclude From Public Branch

These paths should not be included in the public release branch:

| Path or pattern | Reason |
|-----------------|--------|
| `.env` | Contains local credentials or secrets. |
| `.claude/`, `.playwright-mcp/`, `src/.claude/` | Local agent/tool state. |
| `professor_*.md` | Private correspondence and advisor-process notes. |
| `review.md` | Review-process note, not public project documentation. |
| `artifacts/defect-hashes-internal/` | Explicitly marked internal recovery reserve. |
| `wiki/raw/` | Raw user-supplied/wiki-ingestion sources. |
| `docs/papers/evanesca/` | Paper-era LaTeX source, review notes, old submissions, and build outputs; not the maintained public report. |
| `docs/papers/evanesca/.render*/` | Local paper render scratch. |
| `docs/papers/evanesca/Evanesca_comment.pdf` | Review/comment artifact. |
| `docs/papers/evanesca/evanesca_kor.md` | Local Korean draft material. |

The public branch now removes tracked private correspondence,
`artifacts/defect-hashes-internal/`, and `docs/papers/evanesca/` from the git
index while leaving local files on disk.

## Paper-Era Files

`docs/papers/evanesca/` mixes LaTeX source, compiled paper artifacts, reviewer
notes, style guides, arXiv packaging notes, old versions, figures, tables, and
build outputs. The open-source release does not treat this directory as the
canonical public report.

Applied public-branch policy:

1. Keep the public technical report under `docs/technical-report/` as the
   canonical citable project document.
2. Do not ship compiled/commented/reviewer paper artifacts in the public branch.
3. Leave local paper-era files on disk but ignore them from this branch.
4. If historical paper source is needed later, reintroduce it under an explicit
   archive path with a note that it is not the maintained public report.

## Release Gates

Before tagging `v0.1.0`:

- `git ls-files` should not include private correspondence or internal reserve
  artifacts.
- public artifact paths should have manifests with counts, commands, and
  limitations.
- the README should point users to `docs/technical-report/`, not the IMC paper
  directory.
- release notes should list known incomplete build/audit gates.
