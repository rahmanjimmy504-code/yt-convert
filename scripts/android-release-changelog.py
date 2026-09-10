#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate AI-written Android APK/AAB release notes from the previous v* tag."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

MAX_CONTEXT = 50000
MAX_ITEMS = 12

SYSTEM = """You write release notes for the YT Convert Android APK/AAB.
Review ONLY the supplied Android-related git diff and commit subjects.
Return valid JSON with exactly these arrays: new_features, bug_fixes,
improvements, other. Each array contains concise user-visible strings.
Include every real user-visible change you can identify; do not invent or
speculate. Bug fixes belong in bug_fixes, new capabilities in new_features,
and performance/UI/compatibility/usability changes in improvements. Put
release/build/signing/CI-only changes in other only when they are meaningful
for a release; otherwise omit them. Never include secrets, tokens, passwords,
API keys, keystores, signing material, credentials, or CI implementation
instructions. Maximum 12 items per category. If a category has none, return []."""


def git(*args: str) -> str:
    try:
        p = subprocess.run(["git", *args], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        return p.stdout.strip() if p.returncode == 0 else ""
    except OSError:
        return ""


def previous_tag(current: str) -> str | None:
    tags = git("for-each-ref", "--merged", "HEAD", "--sort=-creatordate", "--format=%(refname:short)", "refs/tags/v*")
    for tag in tags.splitlines():
        tag = tag.strip()
        if tag and tag != current:
            return tag
    return None


def context(current_tag: str) -> tuple[str, list[str], str | None]:
    prev = previous_tag(current_tag)
    paths = ["android-app/", "fastlane/", ".fdroid.yml"]
    if prev:
        rng = f"{prev}..HEAD"
        diff = git("diff", "--find-renames", "--unified=60", rng, "--", *paths)
        commits = [x for x in git("log", "--pretty=format:%s", rng, "--", *paths).splitlines() if x.strip()]
    else:
        diff = git("log", "--pretty=fuller", "--", *paths)
        commits = [x for x in git("log", "--pretty=format:%s", "--", *paths).splitlines() if x.strip()]
    return (diff + "\n\nCOMMIT SUBJECTS:\n" + "\n".join(commits))[-MAX_CONTEXT:], commits, prev


def ask_ai(prompt: str) -> dict[str, list[str]] | None:
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        return None
    payload = json.dumps({
        "model": "openai/gpt-4o-mini",
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 1600,
    }).encode()
    req = urllib.request.Request(
        "https://models.github.ai/inference/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            data = json.loads(response.read().decode())
        content = data["choices"][0]["message"]["content"]
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.I | re.S)
        parsed = json.loads(content)
        return {k: [str(x).strip() for x in parsed.get(k, []) if str(x).strip()][:MAX_ITEMS] for k in ("new_features", "bug_fixes", "improvements", "other")}
    except Exception as exc:
        print(f"android-release-changelog: AI unavailable: {exc}", file=sys.stderr)
        return None


def clean(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip(" -*\t")
    if re.search(r"\b(secret|token|password|keystore|api[_ -]?key|private key|signing material|credential)\b", value, re.I):
        return ""
    return value.rstrip(".!?") + "." if value else ""


def fallback(commits: list[str]) -> dict[str, list[str]]:
    result = {"new_features": [], "bug_fixes": [], "improvements": [], "other": []}
    for subject in commits:
        s = clean(subject)
        if not s or re.match(r"^(merge|ci|build|chore|docs|test)(?:\(|:|\b)", subject, re.I):
            continue
        if re.match(r"^fix(?:\(|:|\b)", subject, re.I):
            result["bug_fixes"].append(re.sub(r"^fix(?:\([^)]*\))?:\s*", "", s, flags=re.I))
        elif re.match(r"^(feat|feature)(?:\(|:|\b)", subject, re.I):
            result["new_features"].append(re.sub(r"^(?:feat|feature)(?:\([^)]*\))?:\s*", "", s, flags=re.I))
        else:
            result["improvements"].append(s)
        if sum(len(v) for v in result.values()) >= MAX_ITEMS * 4:
            break
    return result


def render(version: str, prev: str | None, notes: dict[str, list[str]], source: str) -> str:
    lines = [f"# YT Convert Android {version}", "", f"- **Version:** `{version}`", f"- **Previous release:** `{prev or 'none (first release)'}`", ""]
    labels = [("new_features", "🚀 New Features"), ("bug_fixes", "🐛 Bug Fixes"), ("improvements", "✨ Improvements"), ("other", "📦 Other Changes")]
    any_notes = False
    for key, label in labels:
        items = [clean(x) for x in notes.get(key, [])]
        items = [x for x in dict.fromkeys(items) if x]
        if not items:
            continue
        any_notes = True
        lines += [f"## {label}", *[f"- {x}" for x in items], ""]
    if not any_notes:
        lines += ["## Changes", "- No user-visible Android changes were detected.", ""]
    lines += [f"_Release notes generated from the Android diff using {source}._", ""]
    return "\n".join(lines)


def main() -> int:
    version = os.environ.get("RELEASE_VERSION", "").strip().lstrip("v")
    if not version:
        print("RELEASE_VERSION is required", file=sys.stderr)
        return 2
    tag = f"v{version}"
    diff, commits, prev = context(tag)
    prompt = f"Release: {tag}\nPrevious tag: {prev or 'none'}\n\nANDROID DIFF:\n{diff}"
    notes = ask_ai(prompt)
    source = "GitHub Models AI" if notes is not None else "git commit fallback"
    if notes is None:
        notes = fallback(commits)
    body = render(version, prev, notes, source)
    out = Path(os.environ.get("RELEASE_NOTES_OUT", "android-release-notes.md"))
    out.write_text(body, encoding="utf-8")
    print(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
