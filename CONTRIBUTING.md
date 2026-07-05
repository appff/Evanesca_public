# Contributing to Evanesca

Evanesca is being reorganized as an open-source DeFi forensic and measurement framework. Contributions should preserve reproducibility, conservative claims, and clear evidence trails.

## Contribution Areas

Useful contributions include:
- protocol semantic adapters;
- transaction reconstruction fixes;
- constraint definitions and documentation;
- reproducible case studies;
- artifact manifests and example datasets;
- technical report improvements;
- frontend evidence explorer work after the public schema stabilizes.

## Engineering Expectations

- Keep behavior deterministic where possible.
- Add focused tests for parser, adapter, constraint, or case-study changes.
- Do not add per-incident hardcoded logic to improve headline numbers.
- Keep public claims aligned with documented reproducible evidence.
- Avoid committing secrets, private notes, RPC keys, or generated local files.

## Development Setup

```bash
npm install
cp .env.example .env
```

Fill in provider credentials only in `.env`; never commit `.env`.

Common commands:

```bash
npm test
npm run build
npm run attack
```

Historical replay may require archive RPC access.

## Documentation Rules

- Define candidate, baseline, harmful extraction, and confirmed incident before making measurement claims.
- Treat constraint firings as evidence for analyst review, not automatic proof of malicious intent.
- Keep technical-report numbers synchronized with the documented artifact manifests.

## Pull Request Checklist

- [ ] Scope is clear and limited.
- [ ] Tests or reproduction steps are included.
- [ ] Public claims are supported by artifacts, code, or citations.
- [ ] No secrets or private review/advisor materials are included.
- [ ] Documentation is updated when output format, constraints, or public claims change.

