# FILE: tests/security/test_security_gate.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Verify that publication safety fails closed on leaks, private paths, unsupported payloads, incomplete local review and candidate changes.
#   SCOPE: Real temporary Git indexes, Gitleaks rejection, network isolation, review responses and outgoing intermediate commits; never create or publish fixture commits.
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
#   LAST_CHANGE: 1.0.0 - 2026-10-19 C-SAFE-DELIVERY: executable fail-closed safety contracts.
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
        opener.open.side_effect = lambda *a, **k: io.BytesIO(json.dumps(answer).encode())
        with tempfile.TemporaryDirectory() as name, patch.object(Path, "is_file", return_value=True), patch.object(gate.subprocess, "run", return_value=SimpleNamespace(returncode=0)), patch.object(gate.urllib.request, "build_opener", return_value=opener):
            records = gate.local_review({"payload": "public", "identity": "hash"}, Path(name))
            self.assertEqual([x["phase"] for x in records], ["review", "skeptical independent recheck"])
            self.assertEqual(opener.open.call_count, 2)
            for call in opener.open.call_args_list:
                self.assertEqual(call.args[0].full_url, "http://127.0.0.1:11434/api/chat")
            answer["done_reason"] = "length"
            with self.assertRaises(gate.GateError):
                gate.local_review({"payload": "public", "identity": "hash"}, Path(name))

    def test_local_network_failure_and_redirect_never_fall_back(self):
        with self.assertRaises(gate.GateError):
            gate.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://example.invalid")
        opener = Mock()
        opener.open.side_effect = urllib.error.URLError("offline")
        with tempfile.TemporaryDirectory() as name, patch.object(Path, "is_file", return_value=True), patch.object(gate.subprocess, "run", return_value=SimpleNamespace(returncode=0)), patch.object(gate.urllib.request, "build_opener", return_value=opener):
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
