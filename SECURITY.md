# Security policy

## Supported versions

Security fixes are developed against the `main` branch. Older releases may not receive fixes unless the issue is severe and backporting is practical.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a vulnerability that could expose secrets, bypass authentication/CAPTCHA, enable SSRF, or compromise a deployment.

Instead, use GitHub's private security advisory/reporting flow for this repository when available. Include:

- a clear description of the vulnerability;
- affected endpoint, file, or component;
- reproduction steps or a minimal proof of concept;
- security impact;
- any suggested mitigation.

Please redact API keys, cookies, CAPTCHA secrets, access tokens, personal data, and private media URLs from reports.

## Scope

High-priority security reports include:

- authentication, CAPTCHA, or conversion-ticket bypasses;
- SSRF or media-host allowlist bypasses;
- secret/token disclosure;
- unsafe file handling or content-type confusion;
- cross-site scripting or other browser-side injection;
- vulnerabilities in the Android extraction/download bridge.

Provider outages, ordinary extraction failures, dead converter instances, and platform ToS questions are not security vulnerabilities; use the normal issue tracker for those.

## Disclosure

Please allow reasonable time for investigation and a fix before public disclosure. Coordinated disclosure is appreciated.
