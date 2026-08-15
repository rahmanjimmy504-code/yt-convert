# Contributing to YT Convert

Thanks for your interest in YT Convert. This document sets out the terms
under which contributions are accepted, and the practical workflow for
getting a change merged.

## 1. Contribution terms (DCO)

This project uses the **Developer Certificate of Origin 1.1** — the same
mechanism the Linux kernel uses. There is no CLA and no copyright
assignment: you keep the copyright in your contribution.

By adding a `Signed-off-by` line to a commit, you certify the DCO
reproduced in [§3](#3-developer-certificate-of-origin-11) below.

**Inbound = outbound.** Your contribution is offered under the same licence
as the project itself — **GPL-3.0-or-later**, the full text of which is in
[`LICENSE`](LICENSE). Do not submit code you cannot license on those terms.

New source files may carry the SPDX one-liner instead of a full GPL header:

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
```

### Signing off

Add the trailer automatically with `-s`:

```bash
git commit -s -m "Fix the thing"
```

which appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and a working email address. Every commit in a pull
request must be signed off; to fix a branch that isn't, run:

```bash
git rebase --signoff main
```

## 2. AI-assisted contributions

AI coding assistants are welcome as **tools**, and much of this codebase was
written with one (see `AUTHORS`). They are not contributors in their own
right and cannot sign the DCO.

If you use an AI assistant:

- **You** sign off, as a human, and you take responsibility for the code.
- Review the output. Signing off means you have satisfied yourself that the
  contribution is yours to submit and does not copy code you have no right
  to contribute.
- Do not submit output you know or suspect to be reproduced from
  incompatibly licensed sources.
- Mention substantial AI assistance in the pull-request description so the
  provenance stays on the record.

## 3. Developer Certificate of Origin 1.1

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## 4. Third-party code and assets

Do not vendor code or assets unless you can name their licence and that
licence is compatible with this project's. New dependencies and bundled
assets must be added to `THIRD_PARTY_NOTICES.md` in the same pull request,
with their licence and copyright notice.

Dependencies must be **GPL-3.0-or-later compatible**: MIT, ISC, Apache-2.0,
BSD-2/3-Clause, MPL-2.0, 0BSD, and LGPL are fine; proprietary,
non-commercial-only, or GPL-incompatible licences (for example the original
4-clause BSD, or CC BY-NC) are not. Avoid third-party logos or trademarks
beyond nominative identification of a supported platform.

## 5. Development workflow

```bash
npm install
npm run dev          # http://localhost:3000
```

Before opening a pull request:

```bash
npm run typecheck    # tsc --noEmit, strict
npm test             # vitest run
npm run build        # next build
```

Guidelines:

- **TypeScript strict.** No `any` escapes, no `@ts-ignore` without a reason
  in a comment.
- **Tests.** Logic in `src/lib/` is unit-tested; add or update tests
  alongside the change. Network calls are mocked — tests must not hit the
  real internet.
- **Scope.** One concern per pull request. Keep unrelated refactors out.
- **Honesty about capability.** This project does not claim to bypass DRM,
  private, deleted, members-only, or region-blocked content, and it never
  stores user files. Do not add features or copy that suggest otherwise;
  see `docs/limitations.md`.
- **Secrets.** Never commit keys, tokens, or cookies. Add new configuration
  to `.env.example` with a description instead.

## 6. Pull requests

- Branch from `main`, keep the branch focused, and rebase rather than merge
  when updating.
- Explain **what** changed and **why** in the description; link any related
  issue.
- Sign off every commit (§1).
- CI (`.github/workflows/ci.yml`) must pass.
- The repository owner reviews and merges.

## 7. Reporting problems

Open an issue with the platform, the URL shape (not personal links), the
observed behaviour, and the expected behaviour. For a converter that is
broken or unsafe, use the in-app flag button on the converter card — those
reports surface on the `/status` dashboard.

Please report security issues privately to the repository owner rather than
in a public issue.
