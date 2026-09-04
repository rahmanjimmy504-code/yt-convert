# SPDX-License-Identifier: GPL-3.0-or-later
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).with_name("android-release-notes.py")
SPEC = importlib.util.spec_from_file_location("android_release_notes", MODULE_PATH)
assert SPEC and SPEC.loader
notes = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = notes
SPEC.loader.exec_module(notes)  # type: ignore[union-attr]


class AndroidReleaseNotesTest(unittest.TestCase):
    def test_normalize_version_accepts_plain_or_v_prefixed(self) -> None:
        self.assertEqual(notes.normalize_version("1.2.3"), notes.ReleaseVersion("1.2.3", "v1.2.3"))
        self.assertEqual(notes.normalize_version(" v2.0 "), notes.ReleaseVersion("2.0", "v2.0"))

    def test_normalize_version_rejects_empty_or_pathy_values(self) -> None:
        with self.assertRaises(ValueError):
            notes.normalize_version("")
        with self.assertRaises(ValueError):
            notes.normalize_version("../bad")

    def test_previous_v_tag_returns_most_recent_reachable_tag_excluding_current(self) -> None:
        with mock.patch.object(notes, "run_git", return_value="v2.0\nv1.5\nv1.0"):
            self.assertEqual(notes.previous_v_tag("v2.0"), "v1.5")
        with mock.patch.object(notes, "run_git", return_value="v1.0"):
            self.assertIsNone(notes.previous_v_tag("v1.0"))

    def test_collect_diff_context_uses_apk_related_paths_since_previous_tag(self) -> None:
        calls: list[tuple[str, ...]] = []

        def fake_git(args, check=False):  # type: ignore[no-untyped-def]
            calls.append(tuple(args))
            if args[0] == "diff" and "--stat" in args:
                return "android-app/src/App.tsx | 12 +++++"
            if args[0] == "diff":
                return "diff --git a/android-app/src/App.tsx b/android-app/src/App.tsx\n+Offline queue"
            if args[0] == "log":
                return "feat(android): add offline queue"
            return ""

        with mock.patch.object(notes, "previous_v_tag", return_value="v1.0"), mock.patch.object(notes, "run_git", side_effect=fake_git):
            context = notes.collect_diff_context("v1.1")

        self.assertFalse(context.first_release)
        self.assertEqual(context.previous_tag, "v1.0")
        self.assertIn("Offline queue", context.text)
        self.assertEqual(context.commits, ("feat(android): add offline queue",))
        diff_calls = [call for call in calls if call and call[0] == "diff"]
        self.assertTrue(all("android-app/" in call for call in diff_calls))
        self.assertTrue(all("fastlane/" in call for call in diff_calls))
        self.assertTrue(all(".fdroid.yml" in call for call in diff_calls))

    def test_collect_diff_context_uses_readme_excerpt_on_first_v_tag(self) -> None:
        import os

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "android-app").mkdir()
            (root / "android-app" / "README.md").write_text("Android app can download media on device", encoding="utf-8")
            # pathlib.Path(raw) is cwd-relative, so use real chdir instead of
            # relying on Path.cwd() internals.
            old = os.getcwd()
            try:
                os.chdir(tmp)
                with mock.patch.object(notes, "previous_v_tag", return_value=None), mock.patch.object(notes, "run_git", return_value="feat: initial android app"):
                    context = notes.collect_diff_context("v1.0")
            finally:
                os.chdir(old)

        self.assertTrue(context.first_release)
        self.assertIsNone(context.previous_tag)
        self.assertIn("Android app can download media on device", context.text)

    def test_build_prompt_names_tag_paths_and_safety_rules(self) -> None:
        release = notes.ReleaseVersion("1.2", "v1.2")
        context = notes.DiffContext("v1.1", "diff text", ("feat: x",), False)
        prompt = notes.build_prompt(release, context)
        self.assertIn("Release version: 1.2", prompt)
        self.assertIn("Release tag: v1.2", prompt)
        self.assertIn("android-app/", prompt)
        self.assertIn("Do not invent features", prompt)
        self.assertIn("Do not mention secrets", prompt)

    def test_configured_providers_follow_openai_groq_github_order(self) -> None:
        env = {"GITHUB_TOKEN": "gh", "OPENAI_API_KEY": "oa", "GROQ_API_KEY": "gq"}
        self.assertEqual([provider.name for provider, _ in notes.configured_providers(env)], ["OpenAI", "Groq", "GitHub Models"])

    def test_request_completion_builds_github_models_chat_request(self) -> None:
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):  # type: ignore[no-untyped-def]
                return False

            def read(self) -> bytes:
                return json.dumps({"choices": [{"message": {"content": "- Better downloads"}}]}).encode()

        def fake_urlopen(request, timeout=0):  # type: ignore[no-untyped-def]
            captured["url"] = request.full_url
            captured["headers"] = dict(request.header_items())
            captured["body"] = json.loads(request.data.decode())
            captured["timeout"] = timeout
            return FakeResponse()

        provider = [provider for provider in notes.PROVIDERS if provider.name == "GitHub Models"][0]
        with mock.patch.object(notes.urllib.request, "urlopen", side_effect=fake_urlopen):
            body = notes.request_completion(provider, "gh-token", "prompt")

        self.assertEqual(body, "- Better downloads")
        self.assertEqual(captured["url"], "https://models.github.ai/inference/chat/completions")
        self.assertEqual(captured["body"]["model"], "openai/gpt-4o-mini")
        self.assertEqual(captured["headers"]["Authorization"], "Bearer gh-token")

    def test_draft_feature_notes_uses_first_safe_provider_answer(self) -> None:
        seen: list[str] = []

        def fake_request(provider, token, prompt):  # type: ignore[no-untyped-def]
            seen.append(provider.name)
            if provider.name == "OpenAI":
                raise OSError("offline")
            return "- Adds background downloads\n- Improves tablet layout"

        env = {"OPENAI_API_KEY": "oa", "GROQ_API_KEY": "gq", "GITHUB_TOKEN": "gh"}
        with mock.patch.object(notes, "request_completion", side_effect=fake_request):
            body, provider = notes.draft_feature_notes("prompt", (), env)

        self.assertEqual(provider, "Groq")
        self.assertEqual(seen, ["OpenAI", "Groq"])
        self.assertIn("background downloads", body)

    def test_sanitize_feature_notes_keeps_bullets_and_strips_secret_lines(self) -> None:
        raw = """
        ## New features
        - Adds queue controls.
        - Rotates ANDROID_KEYSTORE_PASSWORD secrets.
        1. Shares finished files from the Downloads screen
        plain paragraph ignored
        """
        safe = notes.sanitize_feature_notes(raw)
        self.assertIn("- Adds queue controls.", safe)
        self.assertIn("- Shares finished files from the Downloads screen.", safe)
        self.assertNotIn("KEYSTORE", safe)
        self.assertNotIn("secrets", safe.lower())

    def test_fallback_feature_notes_uses_feature_commit_subjects_only(self) -> None:
        commits = [
            "ci: rotate release token",
            "docs: update fdroid notes",
            "feat(android): add share sheet export",
            "fix(android): keep download notification visible",
        ]
        body = notes.fallback_feature_notes(commits)
        self.assertIn("add share sheet export", body)
        self.assertIn("keep download notification visible", body)
        self.assertNotIn("token", body.lower())

    def test_fallback_feature_notes_reports_no_user_features_when_only_ci_changed(self) -> None:
        body = notes.fallback_feature_notes(["ci: update android release workflow", "build: sign APK"])
        self.assertEqual(body, notes.NO_USER_FEATURES)

    def test_release_body_contains_tag_version_new_features_and_artifacts(self) -> None:
        release = notes.ReleaseVersion("1.3", "v1.3")
        body = notes.release_body(release, "- Adds Android download history", "OpenAI")
        self.assertIn("**Tag:** `v1.3`", body)
        self.assertIn("**Version:** `1.3`", body)
        self.assertIn("## New features", body)
        self.assertIn("- Adds Android download history", body)
        self.assertIn("app-release.apk", body)
        self.assertIn("app-release.aab", body)

    def test_write_release_notes_writes_file_without_network_when_no_provider_is_configured(self) -> None:
        context = notes.DiffContext("v1.0", "diff", ("feat(android): add paste shortcut",), False)
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(notes, "collect_diff_context", return_value=context):
            out = Path(tmp) / "android-release-notes.md"
            body = notes.write_release_notes("1.1", str(out), env={})
            self.assertEqual(out.read_text(encoding="utf-8"), body)
            self.assertIn("v1.1", body)
            self.assertIn("add paste shortcut", body)


if __name__ == "__main__":
    unittest.main()
