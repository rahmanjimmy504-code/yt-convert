# CI extras

Workflows staged here are waiting for a human to move them into
`.github/workflows/`. The automation account that opens these PRs does not
hold the GitHub App `workflows` permission, so any push that creates or edits
a file under `.github/workflows/` is rejected outright.


## `verify-youtube.workflow.yml`

A GitHub Actions workflow that runs the **live** YouTube extraction check
(`npm run verify:youtube`) from a GitHub-hosted runner.

> **PENDING CHANGE (2026-09-01, AllDL live audit).** This staged copy now
> differs from the applied `.github/workflows/verify-youtube.yml` in two
> ways that a human needs to copy over: (1) the `pull_request.paths` list
> gains `src/lib/alldl.ts` and `src/lib/cobalt-directory.ts`; (2) the
> "Verify against live YouTube" step gains `env: ALLDL_STRICT:
> ${{ github.event_name == 'schedule' && '1' || '' }}` so the weekly
> scheduled health check hard-fails on a broken AllDL endpoint while
> PR/push runs stay warn-only. Copy this whole file over
> `.github/workflows/verify-youtube.yml` (web UI: edit → replace all →
> commit) after merging its PR.

### Why it lives here instead of `.github/workflows/`

The automation account that opened this PR does not hold the `workflows`
permission, so it can create neither `.github/workflows/*` via git push nor
via the REST contents API (both are rejected). The file therefore ships here
and has to be moved into place once, by a human.

**From a phone / browser (no shell needed):** open the "add the workflow"
link in the pull request description. It opens GitHub's file editor with the
path and contents already filled in — scroll down and tap **Commit changes**.

**From a shell:**

```bash
mkdir -p .github/workflows
git mv ci/verify-youtube.workflow.yml .github/workflows/verify-youtube.yml
git commit -m "Add live YouTube verification workflow"
git push
```

### Why it exists at all

Sandboxed development environments are often behind an egress allowlist that
terminates TLS to `youtube.com` and `googlevideo.com`, which makes it
impossible to prove locally that extraction actually works. GitHub-hosted
runners have open egress, so the live check runs reliably there.

### When it runs

- **On pull requests** that touch the extraction code, so the live result
  appears in the PR checks automatically. This is the path that works when
  nobody has shell access.
- **Manually:** Actions tab → *Verify YouTube extraction (live)* → *Run
  workflow*, optionally against a different video URL. Note that this button
  only appears once the workflow exists on the default branch.
- **Weekly:** Mondays 06:00 UTC, so a YouTube-side change that breaks the
  Innertube clients surfaces before users report it.

The job fails (exit 1) if extraction stops producing a playable direct URL.
Read the log to see per-client `playabilityStatus`, direct vs cipher-only
format counts, the picked MP4/M4A, and the result of a real byte-range GET.


---

## `android-debug.workflow.yml`

Builds the Android companion (`android-app/`) and uploads an installable
**debug APK** as a run artifact.

### Moving it into place

**From a phone / browser:** use the "add the workflow" link in the pull
request description — it opens GitHub's editor with the path and contents
prefilled; scroll down and tap **Commit changes**.

**From a shell:**

```bash
mkdir -p .github/workflows
git mv ci/android-debug.workflow.yml .github/workflows/android-debug.yml
git commit -m "Add the Android debug APK workflow"
git push
```

### What it does

`npm ci` → `npm run typecheck` → `npm test` → `npm run build` (Vite) →
`npx cap sync android` → JDK 21 + Android SDK → `./gradlew assembleDebug` →
uploads `app-debug.apk` (30-day retention) and prints its size in the job
summary.

### When it runs

- **On pull requests and pushes to `main`** that touch `android-app/**` or the
  workflow itself — path-filtered, so website-only changes do not spend a
  10-minute Android build.
- **Manually:** Actions tab → *Android debug APK* → *Run workflow*. This is how
  you get a testable APK from any branch without a computer. The button only
  appears once the workflow exists on the default branch.

### What you get

An **unsigned-for-distribution, debug-signed** APK: fine for sideloading onto
your own phone (enable "install unknown apps"), not for the Play Store. Its
applicationId is suffixed `.debug`, so it installs alongside a future signed
release rather than replacing it.

No signing secrets are needed, and none may be added: an APK is trivially
unzipped, and this repository is public.
