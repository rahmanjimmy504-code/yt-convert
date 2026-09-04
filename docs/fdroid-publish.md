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
2. Pick **Android release APK/AAB** → **Run workflow**. For the first-ever
   release the version was `1.0`; for the fdroiddata submission now, use `1.1`
   (or a newer release version) because `v1.0` predates the Gradle wrapper SHA
   that F-Droid requires. Step 2 explains the tag rule.
3. Wait for it to go green (a few minutes). Under **Artifacts / the Release
   page** you will find a new GitHub Release `v<version>` containing
   `app-release.apk` and `app-release.aab`. A matching `v<version>` git tag is
   also created — that tag is the release marker F-Droid builds from.

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

### Current status: use the fdroiddata MR path

The Request for Packaging is already filed as
[fdroid/rfp#4347](https://gitlab.com/fdroid/rfp/-/issues/4347). It is
currently **To do**, unassigned, and the author account (`rahmanjimmy504`) still
sees **"Discussion is locked. Only members can comment."**

Do **not** open a second RFP and do **not** try to comment on the locked one.
F-Droid's own fdroiddata instructions prefer a merge request when you are ready,
so **Route B (an fdroiddata MR) is the path from here**.

### Before the fdroiddata MR: make sure the tag includes the Gradle wrapper SHA

Issuebot scanned `v1.0-3-g117dbb1` and labelled the app `insecure-gradlew`
because the Gradle wrapper checksum landed **after** tag `v1.0`. The checksum is
already present on `main` in
`android-app/android/gradle/wrapper/gradle-wrapper.properties`:

```properties
distributionSha256Sum=89d4e70e4e84e2d2dfbb63e4daa53e21b25017cc70c37e4eea31ee51fb15098a
```

That is the SHA for `gradle-8.11.1-all.zip`. Do **not** re-add or edit it here.
The important rule for fdroiddata is: `commit:` must be a **git tag whose tree
contains that SHA**, not `v1.0` and not a raw `main` commit.

At the time this guide was updated, the only published release tag was `v1.0`,
and it predates the SHA. Run **Android release APK/AAB** for `1.1` (or a newer
release version) first, then use that tag in fdroiddata — for example
`commit: v1.1`. If you choose a different `v*` tag, replace only the `commit:`
line below with that tag after confirming the tag contains the checksum.

### Route A — Request for Packaging (already filed; do not repeat)

No action here. The RFP exists at `fdroid/rfp#4347`, but discussion is locked
for non-members. Do not create another RFP and do not attempt to comment.
Mention the locked RFP in the fdroiddata MR instead.

### Route B — fdroiddata merge request (current path)

This Arena session does not have a GitLab login, so it cannot honestly create
the fdroiddata MR for you. Use the paste-ready file and MR text below.

#### GitLab UI clicks

1. Sign in to GitLab as `rahmanjimmy504` (or the account that should own the
   fork).
2. Open <https://gitlab.com/fdroid/fdroiddata>.
3. Click **Fork** and fork it to your user namespace.
4. In your fork, create a branch named exactly
   `io.github.rahmanjimmy504.ytconvert` from `master` — do not work on
   `master`.
5. Add one file only:
   `metadata/io.github.rahmanjimmy504.ytconvert.yml`.
6. Paste the YAML from the next section. Before committing, make sure
   `commit:` is the release tag whose tree contains the wrapper SHA above
   (for example `v1.1` after you run the Android release workflow). It must
   **not** be `v1.0`.
7. Commit to the `io.github.rahmanjimmy504.ytconvert` branch.
8. Open a merge request from your fork branch to
   `fdroid/fdroiddata:master`.
9. Use the title and description below, enable **Squash commits when merge
   request is accepted**, and submit.
10. Watch the **fork's** CI pipeline first; fix only review/CI feedback. Do not
    add `AllowedAPKSigningKeys` or `Binaries` unless maintainers ask for them.

#### Paste-ready fdroiddata metadata

File name:

```text
metadata/io.github.rahmanjimmy504.ytconvert.yml
```

YAML content (uses `commit: v1.1`; if you created a newer tag that contains the
same wrapper SHA, replace `v1.1` with that tag, never `v1.0`):

```yaml
Categories:
  - Internet
  - Multimedia
License: GPL-3.0-or-later
AntiFeatures: [NonFreeNet]
AuthorName: rahmanjimmy504
AuthorWebSite: https://github.com/rahmanjimmy504-code
SourceCode: https://github.com/rahmanjimmy504-code/yt-convert
IssueTracker: https://github.com/rahmanjimmy504-code/yt-convert/issues

AutoName: YT Convert

RepoType: git
Repo: https://github.com/rahmanjimmy504-code/yt-convert

Builds:
  - versionName: '1.0'
    versionCode: 1
    commit: v1.1
    subdir: android-app/android
    sudo:
      - apt-get update
      - apt-get install -y openjdk-21-jdk-headless nodejs npm
    prebuild:
      - cd .. && npm ci && npm run build && npx cap sync android
    scanignore:
      - android-app/android/app/src/main/cpp/lame
    ndk: 27.3.13750724
    gradle:
      - 'yes'

AutoUpdateMode: None
UpdateCheckMode: None
CurrentVersion: '1.0'
CurrentVersionCode: 1
```

Notes on the metadata:

- `AntiFeatures: [NonFreeNet]` is intentional because YouTube is not
  replaceable by a fully free network service; reviewers would add it if it
  were omitted.
- Keep `subdir: android-app/android`.
- Keep `prebuild: cd .. && npm ci && npm run build && npx cap sync android` so
  the Capacitor web bundle is built from `android-app/` and synced before
  Gradle runs.
- Keep the `scanignore` entry for vendored LAME; it is built from source by
  CMake.
- Keep `ndk: 27.3.13750724` and `gradle: yes`.
- Do not invent `AllowedAPKSigningKeys` or `Binaries` until F-Droid reviewers
  ask for reproducible-build pinning.

#### Merge request title

```text
New app: YT Convert (io.github.rahmanjimmy504.ytconvert)
```

#### Paste-ready merge request description

```markdown
Adds YT Convert: a GPL-3.0-or-later Android app for saving YouTube video/audio
to the device and converting on-device.

RFP context: fdroid/rfp#4347 is filed, To do, and unassigned, but discussion is
locked for the app author (`rahmanjimmy504`), so I am opening the fdroiddata MR
path instead of filing a second RFP or trying to comment there.

The earlier issuebot scan of `v1.0-3-g117dbb1` reported `insecure-gradlew`
because tag `v1.0` predates the Gradle wrapper checksum. The checksum fix is in
`rahmanjimmy504-code/yt-convert@c895667`, and this metadata uses `commit: v1.1`
(or the tag used for this MR) so the source tree contains:

`distributionSha256Sum=89d4e70e4e84e2d2dfbb63e4daa53e21b25017cc70c37e4eea31ee51fb15098a`

for `gradle-8.11.1-all.zip`. The metadata intentionally does not use `v1.0`.

App summary:

- App id: `io.github.rahmanjimmy504.ytconvert`
- License: GPL-3.0-or-later
- Converts media on-device; no server upload is needed for the Android app
- No account system, no tracking, and no advertising
- LAME is vendored as source and built by CMake for MP3 encoding
- The app uses YouTube's public player interface only; it contains no
  credentials, cookies, BotGuard/PO-token handling, or private API keys
- Fastlane metadata is included in the source repo at
  `fastlane/metadata/android/en-US/`

I enabled squash for the MR and will watch the fork's CI pipeline.
```

---

## What to expect

- Review takes **weeks**. The RFP is locked for non-members, so expect reviewer
  comments on the fdroiddata MR and reply there.
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
