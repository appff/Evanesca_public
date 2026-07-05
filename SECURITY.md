# Security Policy

Evanesca is a research and forensic reconstruction framework. It may process public blockchain transactions that involve real exploits or protocol defects.

## Supported Versions

The open-source release is currently pre-1.0. Security handling applies to the active `open-source-release` branch and future tagged releases.

## Reporting Security Issues

Do not publicly disclose exploitable vulnerabilities in third-party protocols through this repository.

For issues in Evanesca itself:
- prefer GitHub private vulnerability reporting if enabled;
- otherwise contact the project maintainer through a private channel before opening a public issue.

For newly discovered third-party protocol issues:
- contact the affected protocol or an appropriate disclosure coordinator first;
- do not include exploit instructions, private proof-of-concept details, or undisclosed vulnerable addresses in public issues.

## Scope

In scope:
- leakage of secrets through the codebase or artifacts;
- unsafe handling of RPC credentials;
- incorrect public artifacts that could expose undisclosed exploit details;
- vulnerabilities in future public services or frontend deployments.

Out of scope:
- losses caused by using Evanesca output as financial advice;
- incomplete detection of DeFi attacks;
- third-party protocol vulnerabilities not caused by Evanesca.

## Disclaimer

Evanesca output is evidence for analyst review. It is not a guarantee of malicious intent, exploitability, or financial loss.

