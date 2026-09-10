#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate AI-assisted Android APK/AAB release notes from the release diff.

The analysis is based on the source changes that produced the APK/AAB between
v* tags, plus commit subjects. It deliberately avoids secrets/signing/CI data.
AI output is sanitized into four useful release-note sections: new features,
bug fixes, improvements, and breaking/compatibility changes.
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
from typing import Mapping, Sequence

MAX_CONTEXT_CHARS = 32000
SECRET_RE = re.compile(r"\b(secret|token|password|keystore|keypass|storepass|api[_ -]?key|private key|signing material)\b", re.I)
APK_PATHS = ("android-app/", "fastlane/", ".fdroid.yml")

SYSTEM_PROMPT = """You are the release-note analyst for YT Convert Android.
Analyze ONLY the supplied Android-related source diff and commit subjects.
Identify genuine user-visible changes that are actually supported by the
source. Classify them into exactly these sections:

## New features
## Bug fixes
## Improvements
## Compatibility / breaking changes

Include only sections that have at least one real item. Do not invent features
or claim a bug was fixed unless the diff supports it. Mention concrete app
behavior when the code makes it clear. Ignore CI, signing, keystores, secrets,
API keys, deployment plumbing, dependency-only maintenance, and internal-only
refactors unless they directly change user-visible behavior.
Keep each item concise (one sentence). Return Markdown only.
"""

@dataclass(frozen=True)
class Provider:
    name: str
    env_var: str
    endpoint: str
    model: str

PROVIDERS = (
    Provider("OpenAI", "OPENAI_API_KEY", "https://api.openai.com/v1/chat/completions", "gpt-4o-mini"),
    Provider("Groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1/chat/completions", "llama-3.1-8b-instant"),
    Provider("GitHub Models", "GITHUB_TOKEN", "https://models.github.ai/inference/chat/completions", "openai/gpt-4o-mini"),
)

def git(args: Sequence[str]) -> str:
    try:
        p = subprocess.run(["git", *args], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError:
        return ""
    return p.stdout.strip() if p.returncode == 0 else ""

def previous_tag(current: str) -> str | None:
    for tag in git(["for-each-ref", "--merged", "HEAD", "--sort=-creatordate", "--format=%(refname:short)", "refs/tags/v*"]).splitlines():
        tag = tag.strip()
        if tag and tag != current:
            return tag
    return None

def collect_context(current_tag: str) -> tuple[str | None, tuple[str, ...], str]:
    prev = previous_tag(current_tag)
    if prev:
        rng = f"{prev}..HEAD"
        diff = git(["diff", "--find-renames", "--unified=60", rng, "--", *APK_PATHS])
        commits = tuple(x.strip() for x in git(["log", "--pretty=format:%s", rng, "--", *APK_PATHS]).splitlines() if x.strip())
        text = f"Previous release: {prev}\nCurrent release: {current_tag}\n\nCOMMITS:\n" + "\n".join(f"- {x}" for x in commits) + "\n\nDIFF:\n" + diff
    else:
        commits = tuple(x.strip() for x in git(["log", "--pretty=format:%s", "--", *APK_PATHS]).splitlines() if x.strip())
        text = "First v* release. Review the Android source tree and recent commits.\n\nCOMMITS:\n" + "\n".join(f"- {x}" for x in commits)
    return prev, commits, text[:MAX_CONTEXT_CHARS]

def call_ai(provider: Provider, token: str, prompt: str) -> str:
    body = json.dumps({
        "model": provider.model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 800,
    }).encode()
    req = urllib.request.Request(provider.endpoint, data=body, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json",
        "User-Agent": "YTConvert-Android-Release-Intelligence/1.0",
    }, method="POST")
    with urllib.request.urlopen(req, timeout=40) as r:
        payload = json.loads(r.read().decode())
    return (((payload.get("choices") or [{}])[0]).get("message") or {}).get("content") or ""

def sanitize(text: str) -> str:
    allowed = {"new features": "## New features", "bug fixes": "## Bug fixes", "improvements": "## Improvements", "compatibility / breaking changes": "## Compatibility / breaking changes", "compatibility": "## Compatibility / breaking changes"}
    out: list[str] = []
    section = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            key = re.sub(r"^#+\s*", "", line).strip().lower()
            section = key
            if key in allowed and allowed[key] not in out:
                out.append(allowed[key])
            continue
        if not section:
            continue
        if not line.startswith(("- ", "* ", "• ")):
            continue
        item = re.sub(r"^[*-•]\s+", "", line).strip()
        if not item or SECRET_RE.search(item):
            continue
        item = re.sub(r"\s+", " ", item)
        if not item.endswith((".", "!", "?")):
            item += "."
        out.append(f"- {item}")
    # Remove empty/duplicate section headers and duplicate bullets.
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in out:
        if item.startswith("## "):
            if cleaned and cleaned[-1].startswith("## "):
                continue
            cleaned.append(item)
        else:
            if item not in seen:
                cleaned.append(item); seen.add(item)
    while cleaned and cleaned[-1].startswith("## "):
        cleaned.pop()
    return "\n".join(cleaned)

def fallback(commits: Sequence[str]) -> str:
    groups = {"## New features": [], "## Bug fixes": [], "## Improvements": []}
    for subject in commits:
        if SECRET_RE.search(subject) or re.match(r"^(ci|build|chore|test|docs|style|refactor)(\(|:|$)", subject, re.I):
            continue
        s = re.sub(r"^(feat|fix|perf|improve|refactor)(\([^)]*\))?!?:\s*", "", subject, flags=re.I).strip()
        if not s:
            continue
        key = "## New features" if re.match(r"^(feat|feature)\b", subject, re.I) else "## Bug fixes" if re.match(r"^fix\b", subject, re.I) else "## Improvements"
        groups[key].append(f"- {s.rstrip('.') }.")
    return "\n\n".join(f"{k}\n" + "\n".join(v[:8]) for k, v in groups.items() if v)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    version = args.version.lstrip("v")
    tag = f"v{version}"
    prev, commits, context = collect_context(tag)
    prompt = textwrap.dedent(f"""
        Release version: {version}
        Release tag: {tag}
        Previous tag: {prev or 'none'}
        Paths: {', '.join(APK_PATHS)}

        Determine what changed in the Android APK/AAB release. Focus on user-visible
        behavior: new features, bug fixes, usability/performance improvements, and
        compatibility/breaking changes. Treat commit messages as clues only; the diff
        is the source of truth.

        SOURCE:\n{context}
    """).strip()
    notes = ""
    provider_name = "git fallback"
    for provider in PROVIDERS:
        token = os.environ.get(provider.env_var, "").strip()
        if not token:
            continue
        try:
            notes = sanitize(call_ai(provider, token, prompt))
        except (OSError, TimeoutError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
            print(f"{provider.name} unavailable: {exc}", file=sys.stderr)
            continue
        if notes:
            provider_name = provider.name
            break
    if not notes:
        notes = fallback(commits)
    if not notes:
        notes = "## New features\n- No user-visible Android changes were detected in the reviewed release diff."
    body = f"# YT Convert Android {version}\n\n- **Tag:** `{tag}`\n- **Version:** `{version}`\n- **Previous release:** `{prev or 'first v* release'}`\n\n{notes}\n\n## Artifacts\n- `app-release.apk` — Android installer.\n- `app-release.aab` — Android App Bundle.\n\n_AI release analysis by {provider_name}; source limited to Android-related release changes._\n"
    Path(args.out).write_text(body, encoding="utf-8")
    print(body)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
