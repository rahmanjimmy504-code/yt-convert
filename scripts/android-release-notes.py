#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Draft Android APK/AAB GitHub Release notes from the APK-related diff.

The workflow calls this after building the signed APK and AAB. It reviews only
Android-release-relevant paths since the previous ``v*`` tag, asks AI providers
in a fixed order, and falls back to the git log when no provider returns a safe
answer. The generated Markdown always includes the release tag and version so
both the GitHub Release body and the job summary carry the F-Droid marker.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence

APK_RELATED_PATHS: tuple[str, ...] = ("android-app/", "fastlane/", ".fdroid.yml")
README_EXCERPT_FILES: tuple[str, ...] = ("android-app/README.md", "README.md")
MAX_CONTEXT_CHARS = 24_000
MAX_FEATURE_BULLETS = 8
NO_USER_FEATURES = "- No user-visible Android APK features were detected in the APK-related diff."

SECRET_OR_CI_RE = re.compile(
    r"\b("
    r"secret|secrets|token|tokens|password|passwords|keystore|keypass|storepass|"
    r"android_keystore|android_key|api[_ -]?key|signing material|private key|"
    r"github_token|openai_api_key|groq_api_key"
    r")\b",
    re.IGNORECASE,
)

CONVENTIONAL_PREFIX_RE = re.compile(
    r"^(?:feat|fix|docs|ci|build|chore|refactor|test|perf|style)(?:\([^)]*\))?!?:\s*",
    re.IGNORECASE,
)

SYSTEM_PROMPT = """\
You draft GitHub Release notes for YT Convert's Android APK/AAB release.
Use only the supplied APK-related diff or README excerpt. Do not invent
features, do not speculate, and do not mention secrets, tokens, API keys,
keystores, passwords, signing material, or CI implementation details. Return
only concise Markdown bullet points describing user-visible new features for
the Android APK. If the supplied context does not show user-visible Android APK
feature changes, return exactly:
- No user-visible Android APK features were detected in the APK-related diff.
"""


@dataclass(frozen=True)
class ReleaseVersion:
    version: str
    tag: str


@dataclass(frozen=True)
class DiffContext:
    previous_tag: str | None
    text: str
    commits: tuple[str, ...]
    first_release: bool


@dataclass(frozen=True)
class Provider:
    name: str
    env_var: str
    endpoint: str
    model: str


PROVIDERS: tuple[Provider, ...] = (
    Provider("OpenAI", "OPENAI_API_KEY", "https://api.openai.com/v1/chat/completions", "gpt-4o-mini"),
    Provider("Groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1/chat/completions", "llama-3.1-8b-instant"),
    Provider(
        "GitHub Models",
        "GITHUB_TOKEN",
        "https://models.github.ai/inference/chat/completions",
        "openai/gpt-4o-mini",
    ),
)


def run_git(args: Sequence[str], *, check: bool = False) -> str:
    """Run git and return stdout, or an empty string on non-fatal failure."""
    try:
        completed = subprocess.run(
            ["git", *args],
            check=check,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        if check:
            raise
        print(f"android-release-notes: git {' '.join(args)} failed: {exc}", file=sys.stderr)
        return ""
    if completed.returncode != 0:
        if check:
            completed.check_returncode()
        return ""
    return completed.stdout.strip()


def normalize_version(raw: str) -> ReleaseVersion:
    version = (raw or "").strip()
    if version.lower().startswith("v"):
        version = version[1:]
    if not version:
        raise ValueError("--version must not be empty")
    if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._+-]*", version):
        raise ValueError("--version must be a plain release version, e.g. 1.0")
    return ReleaseVersion(version=version, tag=f"v{version}")


def previous_v_tag(current_tag: str) -> str | None:
    """Return the most recent reachable v* tag before the one being created."""
    out = run_git(
        [
            "for-each-ref",
            "--merged",
            "HEAD",
            "--sort=-creatordate",
            "--format=%(refname:short)",
            "refs/tags/v*",
        ],
    )
    for tag in out.splitlines():
        tag = tag.strip()
        if tag and tag != current_tag:
            return tag
    return None


def _truncate(text: str, limit: int = MAX_CONTEXT_CHARS) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n\n[diff truncated for release-note drafting]"


def _read_first_existing(paths: Iterable[str]) -> str:
    chunks: list[str] = []
    for raw in paths:
        path = Path(raw)
        if not path.exists() or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            continue
        if text:
            chunks.append(f"# {raw}\n\n{text[:8_000]}")
    return "\n\n".join(chunks)


def collect_diff_context(current_tag: str) -> DiffContext:
    previous = previous_v_tag(current_tag)
    if previous:
        commit_range = f"{previous}..HEAD"
        stat = run_git(["diff", "--stat", commit_range, "--", *APK_RELATED_PATHS])
        diff = run_git(["diff", "--find-renames", "--unified=80", commit_range, "--", *APK_RELATED_PATHS])
        commits = tuple(
            line.strip()
            for line in run_git(["log", "--pretty=format:%s", commit_range, "--", *APK_RELATED_PATHS]).splitlines()
            if line.strip()
        )
        text = "\n\n".join(part for part in [f"Previous tag: {previous}", stat, diff] if part.strip())
        return DiffContext(previous_tag=previous, text=_truncate(text), commits=commits, first_release=False)

    excerpt = _read_first_existing(README_EXCERPT_FILES)
    if not excerpt:
        excerpt = "No previous v* tag exists and no README excerpt was available."
    commits = tuple(
        line.strip()
        for line in run_git(["log", "--pretty=format:%s", "--", *APK_RELATED_PATHS]).splitlines()
        if line.strip()
    )
    return DiffContext(previous_tag=None, text=_truncate(excerpt), commits=commits, first_release=True)


def build_prompt(release: ReleaseVersion, context: DiffContext) -> str:
    source = "README excerpt for the first Android release" if context.first_release else "APK-related git diff"
    previous = context.previous_tag or "none (first v* tag)"
    return textwrap.dedent(
        f"""\
        Release version: {release.version}
        Release tag: {release.tag}
        Previous v* tag: {previous}
        Source: {source}
        Paths reviewed: {', '.join(APK_RELATED_PATHS)}

        Task: Write the "New features" bullet list for the Android APK/AAB
        GitHub Release. Base every bullet only on the supplied source below.
        Do not invent features. Do not mention secrets, tokens, API keys,
        keystores, passwords, signing material, or CI implementation details.

        {context.text}
        """
    ).strip()


def _chat_payload(provider: Provider, prompt: str) -> bytes:
    return json.dumps(
        {
            "model": provider.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 500,
        }
    ).encode("utf-8")


def request_completion(provider: Provider, token: str, prompt: str, *, timeout: int = 35) -> str:
    request = urllib.request.Request(
        provider.endpoint,
        data=_chat_payload(provider, prompt),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "YTConvert-Android-Release-Notes/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - trusted provider URLs above
        payload = json.loads(response.read().decode("utf-8"))
    choice = (payload.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    content = message.get("content")
    return content if isinstance(content, str) else ""


def configured_providers(env: Mapping[str, str]) -> list[tuple[Provider, str]]:
    out: list[tuple[Provider, str]] = []
    for provider in PROVIDERS:
        token = (env.get(provider.env_var) or "").strip()
        if token:
            out.append((provider, token))
    return out


def _clean_bullet_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip(" -\t")
    text = CONVENTIONAL_PREFIX_RE.sub("", text).strip()
    return text.rstrip(".") + "." if text and not text.endswith((".", "!", "?", "`")) else text


def sanitize_feature_notes(text: str) -> str:
    """Keep concise markdown bullets and drop anything unsafe or non-featurey."""
    bullets: list[str] = []
    in_code_block = False
    for raw in (text or "").splitlines():
        line = raw.strip()
        if line.startswith("```"):
            in_code_block = not in_code_block
            continue
        if in_code_block or not line:
            continue
        if line.lower().startswith(("new features", "## new features", "### new features")):
            continue
        if line.startswith(("- ", "* ", "• ")):
            candidate = line[2:].strip()
        elif re.match(r"^\d+[.)]\s+", line):
            candidate = re.sub(r"^\d+[.)]\s+", "", line).strip()
        else:
            continue
        if not candidate:
            continue
        if SECRET_OR_CI_RE.search(candidate):
            continue
        if re.search(r"\b(secret|token|password|keystore)\b", candidate, re.IGNORECASE):
            continue
        clean = _clean_bullet_text(candidate)
        if not clean:
            continue
        bullet = f"- {clean}"
        if bullet not in bullets:
            bullets.append(bullet)
        if len(bullets) >= MAX_FEATURE_BULLETS:
            break
    if not bullets:
        return ""
    if bullets == [NO_USER_FEATURES]:
        return NO_USER_FEATURES
    return "\n".join(bullets)


def fallback_feature_notes(commits: Sequence[str]) -> str:
    bullets: list[str] = []
    for subject in commits:
        if not subject or subject.lower().startswith("merge "):
            continue
        if SECRET_OR_CI_RE.search(subject):
            continue
        # Prefer feature-ish subjects. If none exist, the no-user-feature line
        # is safer than turning build/signing maintenance into release hype.
        without_prefix = _clean_bullet_text(subject)
        if re.match(r"^(?:ci|build|chore|test|docs)\b", subject, re.IGNORECASE):
            continue
        if without_prefix:
            bullet = f"- {without_prefix}"
            if bullet not in bullets:
                bullets.append(bullet)
        if len(bullets) >= MAX_FEATURE_BULLETS:
            break
    return "\n".join(bullets) if bullets else NO_USER_FEATURES


def draft_feature_notes(prompt: str, commits: Sequence[str], env: Mapping[str, str]) -> tuple[str, str]:
    for provider, token in configured_providers(env):
        try:
            response = request_completion(provider, token, prompt)
        except (OSError, TimeoutError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
            print(f"android-release-notes: {provider.name} did not answer ({exc})", file=sys.stderr)
            continue
        notes = sanitize_feature_notes(response)
        if notes:
            return notes, provider.name
        print(f"android-release-notes: {provider.name} returned no safe feature bullets", file=sys.stderr)
    return fallback_feature_notes(commits), "git log fallback"


def release_body(release: ReleaseVersion, feature_notes: str, provider_name: str) -> str:
    safe_notes = sanitize_feature_notes(feature_notes) or NO_USER_FEATURES
    return textwrap.dedent(
        f"""\
        # YT Convert Android {release.version}

        - **Tag:** `{release.tag}`
        - **Version:** `{release.version}`

        ## New features
        {safe_notes}

        ## Artifacts
        - `app-release.apk` — install on your phone.
        - `app-release.aab` — for stores and F-Droid build servers.

        The `{release.tag}` tag is the release marker F-Droid builds from.

        _Notes drafted by {provider_name}; reviewed source was limited to `android-app/`, `fastlane/`, and `.fdroid.yml`._
        """
    ).strip() + "\n"


def write_release_notes(version: str, out_path: str, env: Mapping[str, str] | None = None) -> str:
    release = normalize_version(version)
    context = collect_diff_context(release.tag)
    prompt = build_prompt(release, context)
    effective_env = os.environ if env is None else env
    notes, provider = draft_feature_notes(prompt, context.commits, effective_env)
    body = release_body(release, notes, provider)
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return body


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Draft Android APK/AAB release notes")
    parser.add_argument("--version", required=True, help="Release version, e.g. 1.0 or v1.0")
    parser.add_argument("--out", required=True, help="Markdown file to write")
    args = parser.parse_args(argv)
    try:
        body = write_release_notes(args.version, args.out)
    except ValueError as exc:
        print(f"android-release-notes: {exc}", file=sys.stderr)
        return 2
    print(body)
    return 0


def __getattr__(name: str):
    """Compatibility for the required unittest path with a dotted filename.

    ``python -m unittest scripts/android-release-notes.test.py`` asks Python to
    import ``scripts.android-release-notes`` and then look up ``.test.py`` as
    attributes. Expose the adjacent test module lazily so that exact command
    works without renaming the script the workflow calls.
    """
    if name != "test":
        raise AttributeError(name)
    import importlib.util

    test_path = Path(__file__).with_name("android-release-notes.test.py")
    spec = importlib.util.spec_from_file_location("android_release_notes_test", test_path)
    if not spec or not spec.loader:
        raise AttributeError(name)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
