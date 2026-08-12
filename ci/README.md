# CI extras

## `verify-youtube.workflow.yml`

A GitHub Actions workflow that runs the **live** YouTube extraction check
(`npm run verify:youtube`) from a GitHub-hosted runner.

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
