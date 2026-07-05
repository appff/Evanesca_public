# Dependency Audit Notes

Status: draft notes for the open-source release.

Last checked: 2026-07-06.

## Commands Run

```bash
npm install
PUPPETEER_SKIP_DOWNLOAD=true npm install
npm audit --audit-level=critical --json
```

## Current Summary

In the working repository, `npm install` completed successfully. In the
generated public repository, default `npm install` hit a Puppeteer
headless-shell download/cache failure; `PUPPETEER_SKIP_DOWNLOAD=true npm
install` completed successfully.

npm reported dependency vulnerabilities:

| Severity | Count |
|----------|------:|
| low | 19 |
| moderate | 53 |
| high | 33 |
| critical | 3 |
| total | 108 |

The public release should not be tagged until these are triaged.

## Notes

Many findings appear to come from older web3, Google Cloud, request, sqlite, puppeteer, and transitive packages. Some automated fixes require semver-major upgrades and may affect runtime behavior.

Do not run `npm audit fix --force` without a targeted dependency migration plan.

## Release Gate

Before `v0.1.0`:
- identify direct dependencies responsible for critical and high findings;
- remove unused production dependencies where possible;
- move development-only tools out of production dependency scope;
- decide whether legacy optional components should be archived;
- re-run `npm audit`.
