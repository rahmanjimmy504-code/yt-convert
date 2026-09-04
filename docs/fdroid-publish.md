# Publishing the Android app to F-Droid

This app is now packaged for F-Droid. Everything you need is already in the
repository:

| Piece | Where |
|---|---|
| Store listing (name, descriptions, icon, changelog) | `fastlane/metadata/android/en-US/` |
| App icon (512×512) | `fastlane/metadata/android/en-US/images/icon.png` |
| Build recipe (for `fdroid build` / reviewers) | `.fdroid.yml` (repo root) |
| Signed release APK + AAB workflow | `.github/workflows/android-release.yml` |
| Native project + Gradle signing | `android-app/android/app/build.gradle` |

The whole flow is free. The only thing that takes time is F-Droid's human
review (weeks). There is **no** $25 fee and no account to buy.

---

## Step 0 — Install the release workflow (one-time)

The signed-release workflow can't be added by the Arena integration (GitHub
refuses workflow writes from it), so it ships in this repo at
`github/workflows/android-release.yml`. Once, create the live copy:

1. Repo → **Add file → Create new file**.
2. Name it exactly `.github/workflows/android-release.yml`.
3. Paste the full contents of `github/workflows/android-release.yml` and commit.

After that, Step 1's **Run workflow** button exists.

## Step 1 — Build a signed release (phone-only, all taps)

1. Open the repo on GitHub → **Actions** tab.
2. Pick **Android release APK/AAB** → **Run workflow** (leave the version as
   `1.0`).
3. Wait for it to go green (a few minutes). Under **Artifacts / the Release
   page** you will find a new GitHub Release `v1.0` containing
   `app-release.apk` and `app-release.aab`. A `v1.0` git tag is also created —
   that tag is the release marker F-Droid builds from.

Before publishing the Release, the workflow drafts `android-release-notes.md`
from the APK-related diff (`android-app/`, `fastlane/`, `.fdroid.yml`) since
last `v*` tag; on the first tag it uses the README excerpt instead. The Release
body and the job summary include both the `v…` tag / version and a **New
features** section. AI providers are tried in this order when their credentials
are available: `OPENAI_API_KEY`, then `GROQ_API_KEY`, then GitHub Models via
`GITHUB_TOKEN` at `https://models.github.ai/inference/chat/completions`
(`openai/gpt-4o-mini`). If none answer, the script falls back to the git log.
The prompt and output filter are deliberately constrained to avoid invented
features and to omit secrets, tokens, keystores, passwords, and signing details.

### Save the signing secrets (do this on the first run)

On the **first** run the workflow has no stored keystore, so it mints a
throwaway one and prints four values in the job's **step summary**:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` (will be `release`)
- `ANDROID_KEY_PASSWORD`

Copy each of them into **Settings → Secrets and variables → Actions → New
repository secret** with exactly those names. From then on every release is
signed with the *same* key — which F-Droid requires (an app whose signing key
changes is treated as a different app). If you ever lose them, you cannot
update the same F-Droid listing; treat them like a password.

> Never commit the keystore, passwords, or base64 to git. `*.jks`,
> `*.keystore` and `keystore.properties` are already git-ignored.

---

## Step 2 — Submit to F-Droid

You have two routes. The RFP issue is the simplest; the fdroiddata merge
request is faster but asks for more GitLab familiarity.

### Route A — Request for Packaging (simplest)

1. Sign in at GitLab (gitlab.com) with any account.
2. Open <https://gitlab.com/fdroid/rfp/-/issues/new>.
3. Paste the template below, filling the marked fields.

```text
**App:** YT Convert
**Source code:** https://github.com/rahmanjimmy504-code/yt-convert
**License:** GPL-3.0-or-later
**Latest release:** https://github.com/rahmanjimmy504-code/yt-convert/releases/tag/v1.0
**Description:** Downloads YouTube video/audio and converts it entirely
on-device (MP4 / M4A / MP3 / WAV / FLAC / Opus), saving to the Downloads
folder via a background service. No account, no tracking, no server upload.

The repo already ships F-Droid fastlane metadata under
fastlane/metadata/android/en-US/ and a .fdroid.yml build recipe, so the build
metadata can be lifted straight from the source tree.

- The app downloads media through YouTube's public player interface; it
  contains no credentials, cookies, or BotGuard/PO-token handling.
- Native code is the vendored LAME encoder (LGPL), built from source by CMake.
```

### Route B — fdroiddata merge request (faster, more hands-on)

Fork <https://gitlab.com/fdroid/fdroiddata>, add
`metadata/io.github.rahmanjimmy504.ytconvert.yml`, and copy the `Builds:` /
header sections from `.fdroid.yml` in this repo (adjust `commit:` to the exact
`v1.0` commit hash). Open a merge request. The RFP reviewers and fdroiddata
maintainers will help you iterate.

---

## What to expect

- Review takes **weeks**. You will get comments in the RFP issue or MR; reply
  there.
- Reviewers may ask you to fill the reproducible-build fields
  (`AllowedAPKSigningKeys`, `Binaries`) in `.fdroid.yml` once your first
  release is signed — your signing public key is what they pin.
- They may ask about the YouTube ToS grey area. The honest answer is in
  `android-app/README.md` ("Permissions, honestly" and "Security invariants"):
  no secrets, no cookies, public-interface only.

## CI notes (not regressions)

- Opening this PR (or any change touching `android-app/**`, which includes
  `fastlane/`) triggers `android-debug.yml`. It *should* pass — that's the
  normal debug-APK check, not a failure to fix.
- `verify-youtube.yml` flakily fails when YouTube bot-blocks the runner's
  datacenter IP (~2/3 of runs). Known, unrelated.
- The Vercel check is always red (pre-existing dead account). The PR can be
  merged as long as `ci.yml` is green.
