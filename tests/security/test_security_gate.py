# FILE: tests/security/test_security_gate.py
# VERSION: 1.4.0
# START_MODULE_CONTRACT
#   PURPOSE: Verify that publication safety fails closed on leaks, private paths, unsupported payloads, incomplete local review and candidate changes.
#   SCOPE: Reserved private paths, retained fixture examples, manifest-bound reviewed README screenshots, Git indexes, Gitleaks, network isolation, complete locale deltas, local verdicts and outgoing history; no fixture commits.
#   DEPENDS: unittest, Python stdlib, tools/security_gate.py, local Gitleaks for its integration case.
#   LINKS: .grace/graph/features.xml M-064; .grace/verification/features.xml V-M-064.
#   ROLE: TEST
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
# START_MODULE_MAP
#   spec - import description for the repository safety gate.
#   gate - imported safety gate under test.
#   SafetyGateTests - exposure, exact-index, local-only review and outgoing-history failure scenarios.
# END_MODULE_MAP
# START_CHANGE_SUMMARY
#   LAST_CHANGE: 1.4.0 - 2026-10-21 C-SAFE-SCREENSHOT-REVIEW: prove exact same-candidate manifest binding for reviewed README PNGs and retain fail-closed binary rejection.
#   PREV: 1.3.0 - 2026-10-19: prove target-aware GPU ownership before model loading, including one-other-engine and multiple-model failures.
#   PREV: 1.2.0 - 2026-10-19: reject reserved private operations and captured profiles while retaining synthetic examples and reusable tooling.
#   PREV: 1.1.0 - 2026-10-19: prove locale deltas retain nested changes and raw fallback without reducing static scans.
#   PREV: 1.0.0 - 2026-10-19 C-SAFE-DELIVERY: executable fail-closed safety contracts.
# END_CHANGE_SUMMARY

import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import urllib.error


spec = importlib.util.spec_from_file_location("security_gate", Path(__file__).resolve().parents[2] / "tools/security_gate.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class SafetyGateTests(unittest.TestCase):
    @staticmethod
    def reviewed_screenshot_blobs(path="docs/assets/readme/01-agents.png", data=b"\x89PNG\r\n\x1a\nreviewed\0pixels"):
        manifest = {
            "schemaVersion": "1.0.0",
            "releaseVersion": "2.6.0",
            "captureState": "fresh-reviewed",
            "review": {
                "reviewer": "owner",
                "reviewedAt": "2026-10-21",
                "scenarios": ["Reviewed in the complete release contact sheet."]
            },
            "images": [{"path": path, "sha256": gate.hashlib.sha256(data).hexdigest()}]
        }
        return [(path, data), ("docs/assets/readme/2.6.0.manifest.json", json.dumps(manifest).encode())]

    def test_gpu_preflight_timeout_is_bounded_and_does_not_echo_command(self):
        with patch.object(gate.subprocess, "run", side_effect=subprocess.TimeoutExpired(["private-host-command"], 60)):
            with self.assertRaises(gate.GateError) as found:
                gate.gpu_preflight(Path("canonical-check"))
            self.assertNotIn("private-host-command", str(found.exception))

    def test_gpu_slot_requires_positive_empty_or_expected_engine_evidence(self):
        opener = Mock()
        for models, report in [([], b"no inference engine active"), ([{"name": "qwen3:4b"}], b"ollama: model loaded")]:
            opener.open.side_effect = lambda *a, **k: io.BytesIO(json.dumps({"models": models}).encode())
            gate.gpu_ownership(SimpleNamespace(returncode=0, stdout=report), opener)

    def test_one_other_engine_or_multiple_models_block_before_chat(self):
        for models, report in [([], b"LM Studio: model loaded"), ([{"name": "other-model"}], b"ollama: model loaded"), ([{"name": "qwen3:4b"}, {"name": "other-model"}], b"ollama: model loaded"), ([], b"unrecognized preflight output"), ({}, b"no inference engine active")]:
            opener = Mock()
            opener.open.side_effect = lambda *a, **k: io.BytesIO(json.dumps({"models": models}).encode())
            with self.assertRaises(gate.GateError):
                gate.gpu_ownership(SimpleNamespace(returncode=2, stdout=report), opener)
            self.assertEqual(opener.open.call_args.args[0], "http://127.0.0.1:11434/api/ps")

    def test_malformed_model_inventory_stops_without_a_chat_request(self):
        opener = Mock()
        opener.open.side_effect = lambda *a, **k: io.BytesIO(b"[]")
        with self.assertRaises(gate.GateError):
            gate.gpu_ownership(SimpleNamespace(returncode=0, stdout=b"no inference engine active"), opener)
        self.assertEqual(opener.open.call_count, 1)

    def test_approved_private_paths_cannot_be_force_added_or_pushed(self):
        for name in ["docs/backlog.md", "docs/promotion/strategy.md", "prototypes/table-copy/preview.md", ".grace/changes/active/C-59/state.json", ".grace/changes/archive/C-59/state.json", "fixtures/v0-marktext-userdata/userdata.tar.gz", "fixtures/v1-userdata-mark-1.0.2/migration-relevant/Local Storage/profile.json"]:
            with self.subTest(path=name), self.assertRaises(gate.GateError):
                gate.validate_content([(name, b"record")])
        for version in ["v0-marktext-userdata", "v1-userdata-mark-1.0.2"]:
            for item in ["dataCenter.json", "preferences.json", "window-state.json"]:
                gate.validate_content([("fixtures/" + version + "/migration-relevant/" + item, b'{"path":"/Users/<fixture>/notes"}')])
        for name in ["fixtures/README.md", "fixtures/fixture-pin.lock", "tools/release/asc-api.py", "docs/publication-policy.md"]:
            gate.validate_content([(name, b"public reusable content")])

    @staticmethod
    def locale_patch(before, after):
        name = "static/locales/en.min.json"
        return "diff --git a/" + name + " b/" + name + "\nindex abc123..def456 100644\n--- a/" + name + "\n+++ b/" + name + "\n@@ -1 +1 @@\n-" + before + "\n+" + after + "\n"

    def test_locale_review_retains_all_nested_changes_and_omits_only_unchanged_fields(self):
        before = {"stable": "unchanged corpus", "nested": {"removed": "old", "changed": "before"}, "list": [1]}
        after = {"stable": "unchanged corpus", "nested": {"changed": "after", "added": "new"}, "list": [1, 2]}
        raw = self.locale_patch(json.dumps(before), json.dumps(after))
        viewed = gate.review_view(raw)
        self.assertIn('-JSON ["nested", "removed"] "old"', viewed)
        self.assertIn('-JSON ["nested", "changed"] "before"', viewed)
        self.assertIn('+JSON ["nested", "changed"] "after"', viewed)
        self.assertIn('+JSON ["nested", "added"] "new"', viewed)
        self.assertIn('-JSON ["list"] [1]', viewed)
        self.assertIn('+JSON ["list"] [1, 2]', viewed)
        self.assertNotIn("unchanged corpus", viewed)

    def test_locale_review_preserves_value_type_changes_at_every_depth(self):
        viewed = gate.review_view(self.locale_patch('{"nested":{"value":1}}', '{"nested":{"value":true}}'))
        self.assertIn('-JSON ["nested", "value"] 1', viewed)
        self.assertIn('+JSON ["nested", "value"] true', viewed)
        viewed = gate.review_view(self.locale_patch('{"list":[{"value":1}]}', '{"list":[{"value":true}]}'))
        self.assertIn('-JSON ["list"] [{"value": 1}]', viewed)
        self.assertIn('+JSON ["list"] [{"value": true}]', viewed)

    def test_ambiguous_or_unsupported_locale_json_retains_raw_diff(self):
        for before, after in [('{"a":1}', '{"a":2,"a":3}'), ('{"a":1}', '{"a":NaN}'), ('{"a":1}', '{"a":1.5}'), ('{"a":1}', 'invalid'), ('[]', '{}')]:
            raw = self.locale_patch(before, after)
            self.assertEqual(gate.review_view(raw), raw)
        raw = self.locale_patch('{"a":1}', '{"a":2}')
        for edited in [raw.replace('@@ -1 +1 @@', '@@ -2 +2 @@'), raw + ' context\n', raw.replace('100644', '100755')]:
            self.assertEqual(gate.review_view(edited), edited)

    def test_added_locale_exposure_stays_visible_and_full_blob_scan_still_blocks_it(self):
        value = "/Users/" + "private-person" + "/notes"
        added = json.dumps({"path": value})
        viewed = gate.review_view(self.locale_patch('{}', added))
        self.assertIn(value, viewed)
        with self.assertRaises(gate.GateError):
            gate.scan({"blobs": [("static/locales/en.min.json", added.encode())], "payload": "raw identity-bound payload"})

    def test_multiple_locale_sections_preserve_other_diff_and_commit_context(self):
        first = self.locale_patch('{"a":"old"}', '{"a":"new"}')
        second = first.replace('en.min.json', 'fr.min.json')
        other = 'diff --git a/file.md b/file.md\n+independent changed text\n'
        viewed = gate.review_view('COMMIT identity\n' + first + second + other)
        self.assertIn('COMMIT identity', viewed)
        self.assertEqual(viewed.count('+JSON ["a"] "new"'), 2)
        self.assertIn(other, viewed)

    def test_desktop_rejects_mobile_owned_source_and_mobile_rejects_release_state(self):
        with self.assertRaises(gate.GateError):
            gate.validate_lane(Path("."), [("src/renderer/src/mobile/viewer.js", b"source")], "integ/desktop")
        with self.assertRaises(gate.GateError):
            gate.validate_lane(Path("."), [(".github/workflows/release.yml", b"publish")], "mobile/viewer-mvp")
        gate.validate_lane(Path("."), [("docs/mobile-delivery/README.md", b"independent cadence")], "mobile/viewer-mvp")

    def test_mobile_cannot_change_desktop_marketing_version(self):
        with patch.object(gate, "git", return_value=b'{"version":"2.5.3"}'):
            with self.assertRaises(gate.GateError):
                gate.validate_lane(Path("."), [("package.json", b'{"version":"2.5.4"}')], "mobile/viewer-mvp")

    def test_mobile_branch_cannot_be_pushed_as_desktop_main(self):
        with self.assertRaises(gate.GateError):
            gate.push_candidate(Path("."), "fork", "refs/heads/mobile/viewer-mvp " + "1" * 40 + " refs/heads/main " + "2" * 40)

    def test_personal_paths_and_credentials_are_rejected_without_values(self):
        value = "/Users/" + "private-person" + "/notes/plan.md"
        with self.assertRaises(gate.GateError) as found:
            gate.validate_content([("docs/example.md", value.encode())])
        self.assertNotIn(value, str(found.exception))
        with self.assertRaises(gate.GateError):
            gate.validate_content([(".env.production", b"example")])
        with self.assertRaises(gate.GateError):
            gate.validate_content([("signing/example.p8", b"example")])

    def test_private_infrastructure_and_generated_layers_are_rejected(self):
        private_host = "host." + "tail123abc" + ".ts.net"
        for name, data in [("docs/log.md", private_host.encode()), ("target-test/result.txt", b"output"), (".claude/session.md", b"session")]:
            with self.assertRaises(gate.GateError):
                gate.validate_content([(name, data)])

    def test_portable_public_examples_are_accepted(self):
        gate.validate_content([("docs/example.md", b"Use ~/project and /Users/<user>/project; https://github.com/xronocode/mark")])

    def test_removed_baseline_values_do_not_prevent_their_remediation(self):
        personal = "/Users/" + "private-person" + "/project"
        patch = "--- a/docs/file\n+++ b/docs/file\n-" + personal + "\n+~/project\n"
        text = gate.publication_lines(patch)
        self.assertNotIn(personal, text)
        self.assertIn("+~/project", text)
        gate.validate_content([("patch.txt", text.encode())])
        viewed = gate.review_view(patch + "+" + personal + "\n")
        self.assertIn("-<removed-baseline-home>/project", viewed)
        self.assertIn("+" + personal, viewed)

    def test_binary_and_non_utf8_data_cannot_get_text_only_approval(self):
        for data in [b"image\0pixels", bytes([255, 254, 253])]:
            with self.assertRaises(gate.GateError):
                gate.validate_content([("docs/image.png", data)])

    def test_reviewed_readme_png_requires_exact_same_candidate_manifest_evidence(self):
        blobs = self.reviewed_screenshot_blobs()
        gate.validate_content(blobs)
        with self.assertRaises(gate.GateError):
            gate.validate_content([blobs[0]])
        changed = list(blobs)
        changed[0] = (changed[0][0], changed[0][1] + b"changed")
        with self.assertRaises(gate.GateError):
            gate.validate_content(changed)

    def test_reviewed_screenshot_lane_rejects_wrong_path_signature_or_review_state(self):
        blobs = self.reviewed_screenshot_blobs()
        with self.assertRaises(gate.GateError):
            gate.validate_content(self.reviewed_screenshot_blobs(path="docs/other/image.png"))
        with self.assertRaises(gate.GateError):
            gate.validate_content(self.reviewed_screenshot_blobs(data=b"not-a-png\0payload"))
        manifest = json.loads(blobs[1][1])
        manifest["captureState"] = "retained"
        with self.assertRaises(gate.GateError):
            gate.validate_content([blobs[0], (blobs[1][0], json.dumps(manifest).encode())])

    def test_reviewed_screenshot_lane_rejects_duplicate_or_malformed_evidence(self):
        blobs = self.reviewed_screenshot_blobs()
        manifest = json.loads(blobs[1][1])
        manifest["images"].append(dict(manifest["images"][0]))
        with self.assertRaises(gate.GateError):
            gate.validate_content([blobs[0], (blobs[1][0], json.dumps(manifest).encode())])
        duplicate_key = blobs[1][1].decode().replace('{"schemaVersion":', '{"schemaVersion":"1.0.0","schemaVersion":')
        with self.assertRaises(gate.GateError):
            gate.validate_content([blobs[0], (blobs[1][0], duplicate_key.encode())])

    def test_push_groups_do_not_borrow_later_manifest_evidence(self):
        png, manifest = self.reviewed_screenshot_blobs()
        candidate = {"blobs": [png, manifest], "blobGroups": [[png], [manifest]], "payload": "binary commit then evidence commit"}
        with patch.object(gate.shutil, "which", return_value="gitleaks"), self.assertRaises(gate.GateError):
            gate.scan(candidate)

    def test_chunks_preserve_every_character_with_a_utf8_byte_bound(self):
        text = ("plain \u4e2d\U0001f642" * 4000)
        result = gate.chunks(text)
        self.assertEqual("".join(result), text)
        self.assertTrue(all(len(x.encode()) <= 6000 for x in result))

    def test_only_exact_passing_json_is_accepted(self):
        gate.validate_verdict('{"verdict":"pass","findings":[]}')
        for value in ["pass", '```json\n{}\n```', '{"verdict":"pass"}', '{"verdict":"fail","findings":[]}', '{"verdict":"pass","findings":[{"category":"secret"}]}', '{"verdict":"pass","findings":[],"extra":true}']:
            with self.assertRaises(gate.GateError):
                gate.validate_verdict(value)

    def test_real_staged_index_is_reviewed_instead_of_unstaged_worktree(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            subprocess.run(["git", "init", "-q", name], check=True)
            (root / "file.md").write_text("staged public text\n")
            subprocess.run(["git", "-C", name, "add", "file.md"], check=True)
            (root / "file.md").write_text("different unstaged text\n")
            candidate = gate.staged_candidate(root, "test staged identity")
            self.assertEqual(candidate["blobs"], [("file.md", b"staged public text\n")])
            self.assertNotIn("different unstaged text", candidate["payload"])
            first = candidate["identity"]
            subprocess.run(["git", "-C", name, "add", "file.md"], check=True)
            self.assertNotEqual(first, gate.staged_candidate(root, "test staged identity")["identity"])

    def test_symlink_is_rejected_at_the_staged_index_boundary(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            subprocess.run(["git", "init", "-q", name], check=True)
            (root / "link").symlink_to("../outside")
            subprocess.run(["git", "-C", name, "add", "link"], check=True)
            with self.assertRaises(gate.GateError):
                gate.staged_candidate(root, "test")

    def test_gitleaks_rejects_a_synthetic_credential_without_printing_it(self):
        token = "gh" + "p_" + "A1b2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
        candidate = {"blobs": [("config.txt", ("token=" + token).encode())], "payload": "test candidate"}
        with self.assertRaises(gate.GateError) as found:
            gate.scan(candidate)
        self.assertNotIn(token, str(found.exception))
        self.assertIn("Gitleaks rejected", str(found.exception))

    def test_gpu_conflict_stops_before_any_inference_request(self):
        with tempfile.TemporaryDirectory() as name, patch.object(Path, "is_file", return_value=True), patch.object(gate.subprocess, "run", return_value=SimpleNamespace(returncode=3)), patch.object(gate.urllib.request, "build_opener") as network:
            with self.assertRaises(gate.GateError):
                gate.local_review({"payload": "public", "identity": "hash"}, Path(name))
            network.assert_not_called()

    def test_local_review_requires_two_complete_serial_responses(self):
        answer = {"done": True, "done_reason": "stop", "model": "qwen3:4b", "message": {"content": '{"verdict":"pass","findings":[]}'}}
        opener = Mock()
        opener.open.side_effect = lambda request, **k: io.BytesIO(json.dumps({"models": []} if isinstance(request, str) else answer).encode())
        with tempfile.TemporaryDirectory() as name, patch.object(Path, "is_file", return_value=True), patch.object(gate.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=b"no inference engine active")), patch.object(gate.urllib.request, "build_opener", return_value=opener):
            records = gate.local_review({"payload": "public", "identity": "hash"}, Path(name))
            self.assertEqual([x["phase"] for x in records], ["review", "skeptical independent recheck"])
            self.assertEqual(opener.open.call_count, 4)
            for call in opener.open.call_args_list:
                request = call.args[0]
                self.assertIn(request if isinstance(request, str) else request.full_url, ["http://127.0.0.1:11434/api/ps", "http://127.0.0.1:11434/api/chat"])
            answer["done_reason"] = "length"
            with self.assertRaises(gate.GateError):
                gate.local_review({"payload": "public", "identity": "hash"}, Path(name))

    def test_local_network_failure_and_redirect_never_fall_back(self):
        with self.assertRaises(gate.GateError):
            gate.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://example.invalid")
        opener = Mock()
        opener.open.side_effect = urllib.error.URLError("offline")
        with tempfile.TemporaryDirectory() as name, patch.object(Path, "is_file", return_value=True), patch.object(gate.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=b"no inference engine active")), patch.object(gate.urllib.request, "build_opener", return_value=opener):
            with self.assertRaises(gate.GateError):
                gate.local_review({"payload": "public", "identity": "hash"}, Path(name))
            self.assertEqual(opener.open.call_count, 1)

    def test_candidate_changes_fail_after_review_and_before_receipt(self):
        with tempfile.TemporaryDirectory() as name, patch.object(gate, "scan"), patch.object(gate, "local_review", return_value=[{}, {}]):
            snapshots = iter([{"identity": "first", "payload": "public"}, {"identity": "changed"}])
            with self.assertRaises(gate.GateError):
                gate.review(lambda: next(snapshots), Path(name), "commit")
            self.assertFalse(list(Path(name).glob("commit-*.json")))

    def test_outgoing_history_includes_intermediate_commits_not_just_tip(self):
        base, middle, tip = "1" * 40, "2" * 40, "3" * 40
        calls = []
        def fake_git(root, *args, **kwargs):
            calls.append(args)
            if args[:2] == ("rev-parse", "--verify"):
                return tip.encode()
            if args[:2] == ("rev-list", "--reverse"):
                return (middle + "\n" + tip).encode()
            if args[:2] == ("rev-list", "--parents"):
                oid = args[-1]
                return (oid + " " + (base if oid == middle else middle)).encode()
            if args[:2] == ("diff", "--name-only"):
                return b"file.md\0"
            if args[0] == "ls-tree":
                return b"100644 blob"
            if args[0] == "show" and len(args) == 2:
                return ("intermediate" if args[1].startswith(middle) else "final").encode()
            return b"public patch\n"
        with patch.object(gate, "git", side_effect=fake_git):
            result = gate.push_candidate(Path("."), "fork", "refs/heads/main " + tip + " refs/heads/main " + base + "\n")
        self.assertEqual([value for _, value in result["blobs"]], [b"intermediate", b"final"])
        self.assertIn(("rev-list", "--reverse", tip, "--not", base), calls)


if __name__ == "__main__":
    unittest.main()
