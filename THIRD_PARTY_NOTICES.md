# Third-Party Notices

YT Convert is free software licensed under **GPL-3.0-or-later** (see
[`LICENSE`](LICENSE)). That licence covers *this project's own* source code.
The components below are owned by others, are used or redistributed with this
project, and remain under **their own** licences — nothing here is placed under
the GPL by this document.

The findings come from the audit in
[`docs/licensing-audit.md`](docs/licensing-audit.md), re-derived from the
committed lockfiles. Update this file whenever a dependency or bundled asset
changes (`CONTRIBUTING.md` §4).

Last reviewed: 2026-08-15.

---

## 1. npm dependencies — website (root `package.json`)

Dependencies are installed from the npm registry; **no** dependency source is
vendored into this repository. Each package keeps its own licence, and npm
retains each `LICENSE` file inside `node_modules/`.

| Package | Licence | Copyright / project |
|---|---|---|
| `next` | MIT | © Vercel, Inc. |
| `react`, `react-dom` | MIT | © Meta Platforms, Inc. and affiliates |
| `typescript` | Apache-2.0 | © Microsoft Corporation |
| `tailwindcss`, `@tailwindcss/postcss` | MIT | © Tailwind Labs, Inc. |
| `lucide-react` | ISC | © Lucide Contributors; derived from Feather (MIT, © Cole Bemis) |
| `undici` | MIT | © Node.js contributors |
| `vitest`, `vite-node` *(dev)* | MIT | © VoidZero Inc. and Vitest contributors |
| `@types/node`, `@types/react`, `@types/react-dom` *(dev)* | MIT | © Microsoft Corporation and DefinitelyTyped contributors |

MIT, ISC, Apache-2.0, BSD-2/3-Clause, MPL-2.0, CC-BY-4.0, MIT-0, and 0BSD are
all compatible with GPL-3.0-or-later. Their conditions are notice-preservation
conditions, discharged by this file plus the licence files npm installs.

Components that deserve a specific mention:

| Component | Licence | Why it's called out |
|---|---|---|
| `@img/sharp-libvips-*`, and the `LGPL-3.0-or-later` part of `@img/sharp-win32-*` / `@img/sharp-wasm32` | **LGPL-3.0-or-later** | Pre-built native `libvips` — see [§1.1](#11-lgpl-note-sharp--libvips) |
| `lightningcss*` (12 packages) | MPL-2.0 | File-level copyleft; used unmodified as a build tool, so no MPL source-disclosure duty falls on this project's files |
| `caniuse-lite` | CC-BY-4.0 | Browser-support **data**, © Ben Briggs and contributors; attribution required, given here |
| `@csstools/color-helpers` *(sidecar tree)* | MIT-0 | Public-domain-equivalent, no attribution required |
| `tslib` | 0BSD | No attribution required |
| `fsevents` | MIT | macOS-only optional binary |

### 1.1 LGPL note: `sharp` → `libvips`

`sharp` itself is Apache-2.0. Its optional pre-built binaries
(`@img/sharp-libvips-*`) bundle **libvips**, which is **LGPL-3.0-or-later**,
along with libraries such as `libwebp` (BSD-3-Clause), `libspng`/`zlib` (Zlib),
`libjpeg-turbo` (BSD/IJG), `libexif` and `glib` (LGPL-2.1-or-later), and
others.

- They are **optional, transitive, dynamically linked native libraries** pulled
  from npm at install time. No libvips source is vendored here and YT Convert
  does not modify it.
- LGPL-3.0 is compatible with GPL-3.0-or-later. Because this project is itself
  GPL-3.0-or-later with public source, the LGPL §4 relinking/notice conditions
  are satisfied for anyone who redistributes a build containing those binaries.
- If you redistribute such a build, keep this notice and point recipients to
  <https://github.com/libvips/libvips> for libvips' source and licence.

## 2. npm dependencies — `po-token-server/` sidecar

Direct dependencies declared in `po-token-server/package.json`:

| Package | Licence | Copyright / project |
|---|---|---|
| `bgutils-js` | MIT | © LuanRT |
| `youtubei.js` | MIT | © LuanRT |
| `jsdom` | MIT | © jsdom contributors |
| `undici` | MIT | © Node.js contributors |

> **Note on the sidecar lockfile.** `po-token-server/package-lock.json` is still
> the `1.0.0`-era tree (`youtube-po-token-generator` → `global-agent`, `jsdom`)
> and predates the `2.0.0` BgUtils rewrite in `package.json`. Both trees are
> permissive — `youtube-po-token-generator` is MIT and `global-agent` is
> BSD-3-Clause — so neither affects this relicense, but the lockfile should be
> regenerated (`npm install` in `po-token-server/`) so the resolved set matches
> the declared one. That is a maintenance fix, deliberately out of scope for a
> licence-only change.

The sidecar contacts YouTube's BotGuard/WebPO endpoints. That is a *service*
interaction governed by YouTube's terms, not a software-licence question; see
`docs/limitations.md`.

## 3. Fonts

### Geist Variable — SIL Open Font License 1.1

- File: `src/app/fonts/Geist-Variable.woff2`
- Licence text: [`src/app/fonts/LICENSE-Geist.txt`](src/app/fonts/LICENSE-Geist.txt) — kept in place, as OFL 1.1 requires
- Copyright © 2023 Vercel, Inc., with Reserved Font Name **"Geist"**
- Upstream: <https://github.com/vercel/geist-font>

The font is vendored so builds do not depend on Google Fonts at runtime. OFL
1.1 permits bundling and redistribution with software under any licence,
provided the font remains under OFL 1.1 and its licence text travels with it.
**The font is not covered by this project's GPL**, and the Reserved Font Name
means a modified version of the font must be renamed.

## 4. Trademarks and brand assets

### Snapchat

- File: `public/snapchat-logo.png`
- "Snapchat", the Snapchat name, and the Ghost logo are trademarks of
  **Snap Inc.**

The logo is used solely for **nominative identification** of the Snapchat
platform in the converter list. Snap Inc. is not affiliated with, does not
sponsor, and does not endorse YT Convert. Nothing here grants any right to use
Snap's branding. Trademark law is independent of the GPL: a fork that
redistributes this asset should check Snap's brand guidelines and remove or
replace it if its use is not nominative.

### Other platform and converter names

YouTube, YT Music, SoundCloud, X (Twitter), Instagram, Facebook, TikTok,
Spotify, Deezer, Apple Music, Amazon Music, BeReal, and the third-party
converter services listed in the app are trademarks of their respective owners,
referenced only to identify the services they name. No affiliation or
endorsement is implied. Apart from the Snapchat asset above, platform marks in
the UI are drawn from generic in-app iconography rather than vendored brand
files.

### YT Convert's own marks

`public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`,
`public/apple-touch-icon.png`, and the inline mark in `src/app/icon.tsx` are
project-generated and © the copyright holder named in [`AUTHORS`](AUTHORS). The
code that renders them is GPL-3.0-or-later like the rest of the source; the GPL
grants no trademark rights, so a fork should use its own name and mark.

## 5. Third-party services (not bundled code)

Public Piped, Invidious, and Cobalt instances, the 9Convert/dlsrv farm,
Cloudflare Turnstile, Google reCAPTCHA, and Upstash Redis are **remote services
contacted at runtime**, not code redistributed here. They are governed by their
own terms; no part of them is licensed under this project's GPL.

## 6. Appendix — complete resolved dependency inventory

Generated from the committed lockfiles (SPDX identifiers as declared by each
package). Regenerate a live summary for any checkout with:

```bash
npx license-checker-rseidelsohn --summary                     # website
cd po-token-server && npx license-checker-rseidelsohn --summary
```

#### Website (`package-lock.json`) — 149 resolved packages

| Licence | Packages |
|---|---|
| **MIT** (100) | `@alloc/quick-lru`, `@emnapi/runtime`, `@img/colour`, `@jridgewell/gen-mapping`, `@jridgewell/remapping`, `@jridgewell/resolve-uri`, `@jridgewell/sourcemap-codec`, `@jridgewell/trace-mapping`, `@next/env`, `@next/swc-darwin-arm64`, `@next/swc-darwin-x64`, `@next/swc-linux-arm64-gnu`, `@next/swc-linux-arm64-musl`, `@next/swc-linux-x64-gnu`, `@next/swc-linux-x64-musl`, `@next/swc-win32-arm64-msvc`, `@next/swc-win32-x64-msvc`, `@oxc-project/types`, `@rolldown/binding-android-arm64`, `@rolldown/binding-darwin-arm64`, `@rolldown/binding-darwin-x64`, `@rolldown/binding-freebsd-x64`, `@rolldown/binding-linux-arm-gnueabihf`, `@rolldown/binding-linux-arm64-gnu`, `@rolldown/binding-linux-arm64-musl`, `@rolldown/binding-linux-ppc64-gnu`, `@rolldown/binding-linux-s390x-gnu`, `@rolldown/binding-linux-x64-gnu`, `@rolldown/binding-linux-x64-musl`, `@rolldown/binding-openharmony-arm64`, `@rolldown/binding-win32-arm64-msvc`, `@rolldown/binding-win32-x64-msvc`, `@rolldown/pluginutils`, `@standard-schema/spec`, `@tailwindcss/node`, `@tailwindcss/oxide`, `@tailwindcss/oxide-android-arm64`, `@tailwindcss/oxide-darwin-arm64`, `@tailwindcss/oxide-darwin-x64`, `@tailwindcss/oxide-freebsd-x64`, `@tailwindcss/oxide-linux-arm-gnueabihf`, `@tailwindcss/oxide-linux-arm64-gnu`, `@tailwindcss/oxide-linux-arm64-musl`, `@tailwindcss/oxide-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-musl`, `@tailwindcss/oxide-wasm32-wasi`, `@tailwindcss/oxide-win32-arm64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`, `@tailwindcss/postcss`, `@types/chai`, `@types/deep-eql`, `@types/estree`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitest/expect`, `@vitest/mocker`, `@vitest/pretty-format`, `@vitest/runner`, `@vitest/snapshot`, `@vitest/spy`, `@vitest/utils`, `assertion-error`, `cac`, `chai`, `client-only`, `convert-source-map`, `csstype`, `enhanced-resolve`, `es-module-lexer`, `estree-walker`, `fdir`, `fsevents`, `jiti`, `magic-string`, `nanoid`, `next`, `obug`, `pathe`, `picomatch`, `postcss`, `react`, `react-dom`, `rolldown`, `scheduler`, `stackback`, `std-env`, `styled-jsx`, `tailwindcss`, `tapable`, `tinybench`, `tinyexec`, `tinyglobby`, `tinyrainbow`, `undici`, `undici-types`, `vite`, `vite-node`, `vitest`, `why-is-node-running` |
| **Apache-2.0** (15) | `@img/sharp-darwin-arm64`, `@img/sharp-darwin-x64`, `@img/sharp-linux-arm`, `@img/sharp-linux-arm64`, `@img/sharp-linux-ppc64`, `@img/sharp-linux-riscv64`, `@img/sharp-linux-s390x`, `@img/sharp-linux-x64`, `@img/sharp-linuxmusl-arm64`, `@img/sharp-linuxmusl-x64`, `@swc/helpers`, `detect-libc`, `expect-type`, `sharp`, `typescript` |
| **MPL-2.0** (12) | `lightningcss`, `lightningcss-android-arm64`, `lightningcss-darwin-arm64`, `lightningcss-darwin-x64`, `lightningcss-freebsd-x64`, `lightningcss-linux-arm-gnueabihf`, `lightningcss-linux-arm64-gnu`, `lightningcss-linux-arm64-musl`, `lightningcss-linux-x64-gnu`, `lightningcss-linux-x64-musl`, `lightningcss-win32-arm64-msvc`, `lightningcss-win32-x64-msvc` |
| **LGPL-3.0-or-later** (10) | `@img/sharp-libvips-darwin-arm64`, `@img/sharp-libvips-darwin-x64`, `@img/sharp-libvips-linux-arm`, `@img/sharp-libvips-linux-arm64`, `@img/sharp-libvips-linux-ppc64`, `@img/sharp-libvips-linux-riscv64`, `@img/sharp-libvips-linux-s390x`, `@img/sharp-libvips-linux-x64`, `@img/sharp-libvips-linuxmusl-arm64`, `@img/sharp-libvips-linuxmusl-x64` |
| **ISC** (5) | `graceful-fs`, `lucide-react`, `picocolors`, `semver`, `siginfo` |
| **Apache-2.0 AND LGPL-3.0-or-later** (3) | `@img/sharp-win32-arm64`, `@img/sharp-win32-ia32`, `@img/sharp-win32-x64` |
| **0BSD** (1) | `tslib` |
| **Apache-2.0 AND LGPL-3.0-or-later AND MIT** (1) | `@img/sharp-wasm32` |
| **BSD-3-Clause** (1) | `source-map-js` |
| **CC-BY-4.0** (1) | `caniuse-lite` |

#### Sidecar (`po-token-server/package-lock.json`) — 41 resolved packages

| Licence | Packages |
|---|---|
| **MIT** (33) | `@asamuzakjp/css-color`, `@csstools/css-calc`, `@csstools/css-color-parser`, `@csstools/css-parser-algorithms`, `@csstools/css-tokenizer`, `agent-base`, `cssstyle`, `data-urls`, `debug`, `decimal.js`, `html-encoding-sniffer`, `http-proxy-agent`, `https-proxy-agent`, `iconv-lite`, `is-potential-custom-element-name`, `jsdom`, `ms`, `nwsapi`, `parse5`, `punycode`, `rrweb-cssom`, `safer-buffer`, `symbol-tree`, `tldts`, `tldts-core`, `tr46`, `w3c-xmlserializer`, `whatwg-encoding`, `whatwg-mimetype`, `whatwg-url`, `ws`, `xmlchars`, `youtube-po-token-generator` |
| **BSD-2-Clause** (2) | `entities`, `webidl-conversions` |
| **BSD-3-Clause** (2) | `global-agent`, `tough-cookie` |
| **ISC** (2) | `lru-cache`, `saxes` |
| **Apache-2.0** (1) | `xml-name-validator` |
| **MIT-0** (1) | `@csstools/color-helpers` |

## 7. Reporting a licensing problem

If a component is listed incorrectly, is missing, or is redistributed here
without the right to do so, open an issue on the repository and it will be
corrected or the component removed.
