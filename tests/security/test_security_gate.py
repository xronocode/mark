# FILE: tests/security/test_security_gate.py
# VERSION: 1.8.0
# START_MODULE_CONTRACT
#   PURPOSE: Verify that deterministic publication safety fails closed on leaks, private paths, unsupported payloads and candidate changes.
#   SCOPE: Reserved private paths, retained fixture examples, manifest-bound reviewed README screenshots, Git indexes, Gitleaks, exact identity receipts and outgoing history; no fixture commits.
#   DEPENDS: unittest, Python stdlib, tools/security_gate.py, local Gitleaks for its integration case.
#   LINKS: .grace/graph/features.xml M-064; .grace/verification/features.xml V-M-064.
#   ROLE: TEST
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
# START_MODULE_MAP
#   spec - import description for the repository safety gate.
#   gate - imported safety gate under test.
#   SafetyGateTests - exposure, exact-index, deterministic receipt, outgoing-history, merged-branch deletion and AI-name ban scenarios.
# END_MODULE_MAP
# START_CHANGE_SUMMARY
#   LAST_CHANGE: 1.8.0 - 2026-10-24 C-PUBLIC-REPOSITORY-HYGIENE: replace workstation-model scenarios with deterministic scan, exact identity and private receipt assertions.
#   PREV: 1.7.0 - 2026-10-24: prove the AI-name ban — attribution trailers fail commit and push review, AI-named branches fail push, and the installed reference-transaction hook aborts local creation of AI-named branches only.
#   PREV: 1.6.0 - 2026-10-24: prove merged-branch deletion admission — ancestor or exact merged-PR tips pass; mixed, main, tag, unproven and GitHub-failure cases stay blocked.
#   PREV: 1.4.0 - 2026-10-21 C-SAFE-SCREENSHOT-REVIEW: prove exact same-candidate manifest binding for reviewed README PNGs and retain fail-closed binary rejection.
#   PREV: 1.2.0 - 2026-10-19: reject reserved private operations and captured profiles while retaining synthetic examples and reusable tooling.
#   PREV: 1.0.0 - 2026-10-19 C-SAFE-DELIVERY: executable fail-closed safety contracts.
# END_CHANGE_SUMMARY

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


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

    def test_approved_private_paths_cannot_be_force_added_or_pushed(self):
        for name in ["docs/backlog.md", "docs/promotion/strategy.md", "prototypes/table-copy/preview.md", ".grace/changes/active/C-59/state.json", ".grace/changes/archive/C-59/state.json", "fixtures/v0-marktext-userdata/userdata.tar.gz", "fixtures/v1-userdata-mark-1.0.2/migration-relevant/Local Storage/profile.json"]:
            with self.subTest(path=name), self.assertRaises(gate.GateError):
                gate.validate_content([(name, b"record")])
        for version in ["v0-marktext-userdata", "v1-userdata-mark-1.0.2"]:
            for item in ["dataCenter.json", "preferences.json", "window-state.json"]:
                gate.validate_content([("fixtures/" + version + "/migration-relevant/" + item, b'{"path":"/Users/<fixture>/notes"}')])
        for name in ["fixtures/README.md", "fixtures/fixture-pin.lock", "tools/release/asc-api.py", "docs/publication-policy.md"]:
            gate.validate_content([(name, b"public reusable content")])

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

    def test_candidate_changes_fail_after_scan_and_before_receipt(self):
        with tempfile.TemporaryDirectory() as name, patch.object(gate, "scan"):
            snapshots = iter([{"identity": "first", "payload": "public"}, {"identity": "changed"}])
            with self.assertRaises(gate.GateError):
                gate.review(lambda: next(snapshots), Path(name), "commit")
            self.assertFalse(list(Path(name).glob("commit-*.json")))

    def test_exact_candidate_scan_writes_a_private_deterministic_receipt(self):
        with tempfile.TemporaryDirectory() as name, patch.object(gate, "scan"):
            candidate = {"identity": "a" * 64, "payload": "public"}
            gate.review(lambda: dict(candidate), Path(name), "commit")
            receipt_path = Path(name) / ("commit-" + candidate["identity"] + ".json")
            receipt = json.loads(receipt_path.read_text())
            self.assertEqual(receipt["identity"], candidate["identity"])
            self.assertEqual(receipt["checks"], ["static-exposure", "gitleaks", "candidate-identity"])
            self.assertNotIn("model", receipt)
            self.assertNotIn("reason", receipt)

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


    # START_BLOCK_MERGED_REF_DELETION_TESTS
    ZERO = "0" * 40
    TIP = "a" * 40

    def deletion(self, ref="refs/heads/fix/done", oid=None):
        return "(delete) " + self.ZERO + " " + ref + " " + (oid or self.TIP) + "\n"

    def test_push_without_deletions_goes_to_full_review(self):
        self.assertFalse(gate.ref_deletions(Path("."), "fork", "refs/heads/x " + "1" * 40 + " refs/heads/x " + "2" * 40))

    def test_branch_already_in_main_may_be_deleted(self):
        with patch.object(gate.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run:
            self.assertTrue(gate.ref_deletions(Path("."), "fork", self.deletion()))
        self.assertIn("refs/remotes/fork/main", run.call_args.args[0])

    def test_branch_merged_by_exact_pull_request_may_be_deleted(self):
        pulls = json.dumps([{"merged_at": "2026-10-23T00:00:00Z", "head": {"sha": self.TIP}, "base": {"ref": "main"}}])
        runs = [SimpleNamespace(returncode=1), SimpleNamespace(returncode=0, stdout=pulls)]
        with patch.object(gate.subprocess, "run", side_effect=runs), patch.object(gate, "git", return_value=b"https://github.com/owner/repo.git\n"):
            self.assertTrue(gate.ref_deletions(Path("."), "fork", self.deletion()))

    def test_unmerged_moved_or_unverifiable_branches_stay_blocked(self):
        cases = [
            json.dumps([]),
            json.dumps([{"merged_at": None, "head": {"sha": self.TIP}, "base": {"ref": "main"}}]),
            json.dumps([{"merged_at": "2026-10-23T00:00:00Z", "head": {"sha": "b" * 40}, "base": {"ref": "main"}}]),
            json.dumps([{"merged_at": "2026-10-23T00:00:00Z", "head": {"sha": self.TIP}, "base": {"ref": "release/2.5"}}]),
            json.dumps({"message": "Not Found"}),
            "not json",
        ]
        for stdout in cases:
            runs = [SimpleNamespace(returncode=1), SimpleNamespace(returncode=0, stdout=stdout)]
            with patch.object(gate.subprocess, "run", side_effect=runs), patch.object(gate, "git", return_value=b"https://github.com/owner/repo.git\n"):
                with self.assertRaises(gate.GateError):
                    gate.ref_deletions(Path("."), "fork", self.deletion())
        for failure in [SimpleNamespace(returncode=1, stdout=""), OSError("gh missing"), subprocess.TimeoutExpired("gh", 30)]:
            runs = [SimpleNamespace(returncode=1), failure]
            with patch.object(gate.subprocess, "run", side_effect=runs), patch.object(gate, "git", return_value=b"https://github.com/owner/repo.git\n"):
                with self.assertRaises(gate.GateError):
                    gate.ref_deletions(Path("."), "fork", self.deletion())

    def test_main_tags_mixed_and_malformed_deletions_stay_blocked(self):
        with patch.object(gate.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
            for updates in [
                self.deletion("refs/heads/main"),
                self.deletion("refs/tags/v2.8.0"),
                self.deletion(oid="z" * 40),
                self.deletion() + "refs/heads/x " + "1" * 40 + " refs/heads/x " + "2" * 40,
            ]:
                with self.assertRaises(gate.GateError):
                    gate.ref_deletions(Path("."), "fork", updates)
    # END_BLOCK_MERGED_REF_DELETION_TESTS


    # START_BLOCK_AI_NAME_BAN_TESTS
    def test_ai_attribution_lines_are_rejected(self):
        for message in [
            "fix: x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
            "fix: x\n\nco-authored-by: Codex <codex@openai.com>",
            "fix: x\n\nAssisted-by: GitHub Copilot",
            "fix: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
        ]:
            with self.assertRaises(gate.GateError):
                gate.validate_attribution(message)

    def test_human_attribution_and_product_mentions_pass(self):
        gate.validate_attribution("fix: x\n\nCo-Authored-By: Jane Doe <jane@example.com>")
        gate.validate_attribution("docs(guide): explain the Claude Code and Codex agent setup")

    def test_ai_named_branches_are_rejected_on_push(self):
        for ref in ["refs/heads/claude/audit-1", "refs/heads/Codex/fix", "refs/heads/copilot-x", "refs/heads/zcode"]:
            with self.assertRaises(gate.GateError):
                gate.validate_branch_name(ref)
        for ref in ["refs/heads/feat/claude-hooks", "refs/heads/fix/codexample", "refs/heads/main", "refs/tags/v2.8.0"]:
            gate.validate_branch_name(ref)
        with self.assertRaises(gate.GateError):
            gate.push_candidate(Path("."), "fork", "refs/heads/x " + "1" * 40 + " refs/heads/claude/x " + "0" * 40)

    def test_reference_transaction_hook_blocks_only_new_ai_branches(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            run = lambda *args, **kw: subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, **kw)
            run("init", "-q")
            run("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "base")
            hook = repo / ".git/hooks/reference-transaction"
            hook.write_text(gate.REFERENCE_TRANSACTION_HOOK)
            hook.chmod(0o700)
            blocked = run("branch", "claude/new")
            self.assertNotEqual(blocked.returncode, 0)
            self.assertIn("BLOCK_AI_BRANCH_NAME", blocked.stderr)
            self.assertNotEqual(run("worktree", "add", "-q", "-b", "codex/wt", str(repo / "wt")).returncode, 0)
            self.assertEqual(run("branch", "feat/claude-hooks").returncode, 0)
            self.assertEqual(run("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "next").returncode, 0)
    # END_BLOCK_AI_NAME_BAN_TESTS


if __name__ == "__main__":
    unittest.main()
