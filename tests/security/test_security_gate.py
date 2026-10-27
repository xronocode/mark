# FILE: tests/security/test_security_gate.py
# VERSION: 2.2.0
# START_MODULE_CONTRACT
#   PURPOSE: Verify that publication safety fails closed on leaks, private paths, unavailable or unsafe reviewers, unsupported payloads and candidate changes.
#   SCOPE: Reserved private paths, private-companion and owner-workspace references, retained fixture examples, manifest-bound reviewed README screenshots, Git indexes, Gitleaks, reviewer configuration and verdicts, the two-reviewer receipt, the explicit override, outgoing history, push-endpoint/current-main-bound desktop PR rebases and exact-manifest message-only main rewrites, the candidate/local/non-local lane locks and candidate-scoped evidence; no fixture commits in the project repository.
#   DEPENDS: unittest, Python stdlib, tools/security_gate.py, local Gitleaks for its integration case.
#   LINKS: .grace/graph/features.xml M-064; .grace/verification/features.xml V-M-064.
#   ROLE: TEST
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
# START_MODULE_MAP
#   spec - import description for the repository safety gate.
#   gate - imported safety gate under test.
#   SafetyGateTests - exposure, private-reference, exact-index, two-reviewer receipt, override, per-lane lock concurrency, candidate-scoped evidence, outgoing-history, non-main rebase, merged-branch deletion, AI-name ban and raw-object history-rewrite scenarios.
# END_MODULE_MAP
# START_CHANGE_SUMMARY
#   LAST_CHANGE: 2.2.0 - 2026-10-27 C-SAFETY-REVIEW-LANES: prove the candidate/local/non-local lane split — a local review runs while another operation is remote-bound, same-lane attempts fail closed with a lane-specific message, and concurrent reviews leave candidate-scoped atomic evidence. Preserves the merged FIX-021 reviewer view and 2.1.1 output-budget diagnostics.
#   PREV: 2.1.1 - 2026-10-27: name the sanitized done_reason and answering model in the incomplete-payload rejection and raise the reviewer answer budget to 2048 output tokens.
#   PREV: 2.1.0 - 2026-10-27 FIX-021: replace removed baseline lines with a placeholder in the reviewer view and treat a bare secret or variable name as an identifier.
#   PREV: 2.0.0 - 2026-10-27 C-SAFETY-GATE-MODEL-REVIEW: prove private-companion and owner-workspace references fail, synthetic examples pass, both reviewers run with the expected pass counts, unsafe/missing reviewers fail closed and the explicit override writes an identity-bound receipt.
#   PREV: 1.9.2 - 2026-10-24 C-MESSAGE-ONLY-HISTORY-REWRITE-V3: prove a non-main PR rebase is bound to branch/main identities read from the actual push endpoint and scans only replayed commits.
#   PREV: 1.9.1 - 2026-10-24 C-MESSAGE-ONLY-HISTORY-REWRITE-V3: prove an exact replacement may preserve a historical commit message with no trailing LF.
#   PREV: 1.9.0 - 2026-10-24 C-MESSAGE-ONLY-HISTORY-REWRITE-V3: prove exact manifest binding, ordered-parent merge-DAG parity, raw header preservation, explicit signature loss, stale/shallow rejection and candidate recheck.
#   PREV: 1.8.0 - 2026-10-24 C-PUBLIC-REPOSITORY-HYGIENE: replace workstation-model scenarios with deterministic scan, exact identity and private receipt assertions.
#   PREV: 1.7.0 - 2026-10-24: prove the AI-name ban — attribution trailers fail commit and push review, AI-named branches fail push, and the installed reference-transaction hook aborts local creation of AI-named branches only.
#   PREV: 1.6.0 - 2026-10-24: prove merged-branch deletion admission — ancestor or exact merged-PR tips pass; mixed, main, tag, unproven and GitHub-failure cases stay blocked.
#   PREV: 1.4.0 - 2026-10-21 C-SAFE-SCREENSHOT-REVIEW: prove exact same-candidate manifest binding for reviewed README PNGs and retain fail-closed binary rejection.
#   PREV: 1.2.0 - 2026-10-19: reject reserved private operations and captured profiles while retaining synthetic examples and reusable tooling.
#   PREV: 1.0.0 - 2026-10-19 C-SAFE-DELIVERY: executable fail-closed safety contracts.
# END_CHANGE_SUMMARY

import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
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
    def test_private_companion_and_owner_workspace_references_are_rejected(self):
        private_companion = "mark-" + "private"
        owner_workspace = "~/" + "prj"
        blocked = [
            "see " + owner_workspace + "/" + private_companion + "/audit/report.md",
            private_companion + "/research/bakeoff/",
            "mark-" + "wt/c65",
            "mark-" + "media/story/history.md",
            "_skills/" + "local-ai-safety/gpu_check.sh",
            "cd " + owner_workspace + "/mark",
            "host." + "tail123abc" + ".ts.net",
            ".".join(["100", "102", "145", "59"]),
            "/Users/" + "private-person" + "/notes/plan.md",
        ]
        for value in blocked:
            with self.subTest(value=value), self.assertRaises(gate.GateError) as found:
                gate.validate_content([("docs/example.md", value.encode())])
            self.assertNotIn(value, str(found.exception))
        for value in ["Use ~/project", "/Users/<fixture>/notes", "/Users/<user>/project", "/Users/me/notes", "/Users/dev/project", "/Users/x/Pictures", "~/Library/Application Support/com.example.mark", "C:\\Users\\x\\doc.md"]:
            gate.validate_content([("docs/example.md", value.encode())])

    def test_non_local_reviewer_must_be_configured_private_and_unredirected(self):
        remote = "http://" + ".".join(["100", "102", "145", "59"]) + ":11434"
        with tempfile.TemporaryDirectory() as name:
            private = Path(name)
            config = {"local": {"endpoint": "http://127.0.0.1:11434", "model": "qwen3:4b"}, "nonLocal": {"endpoint": remote, "model": "qwen3:4b"}}
            path = private / "reviewers.json"
            with patch.dict(os.environ, {}, clear=True), self.assertRaises(gate.GateError):
                gate.reviewer_config(private)
            path.write_text(json.dumps(config))
            os.chmod(path, 0o600)
            with patch.dict(os.environ, {"MARK_SAFETY_REMOTE_ENDPOINT": remote}, clear=True):
                reviewers = gate.reviewer_config(private)
            self.assertEqual(reviewers["nonLocal"]["endpoint"], remote)
            public = dict(config, nonLocal={"endpoint": "http://8.8.8.8:11434", "model": "qwen3:4b"})
            path.write_text(json.dumps(public))
            with patch.dict(os.environ, {}, clear=True), self.assertRaises(gate.GateError):
                gate.reviewer_config(private)
            non_loopback = dict(config, local={"endpoint": "http://10.0.0.5:11434", "model": "qwen3:4b"})
            path.write_text(json.dumps(non_loopback))
            with patch.dict(os.environ, {}, clear=True), self.assertRaises(gate.GateError):
                gate.reviewer_config(private)
            with self.assertRaises(gate.GateError):
                gate.NoRedirect().redirect_request(None, None, 302, None, {}, "http://example.invalid")

    def test_review_runs_two_local_passes_and_one_non_local_pass(self):
        with tempfile.TemporaryDirectory() as name, patch.object(gate, "scan"), patch.object(gate, "reviewer_config", return_value={"local": {"label": "local", "model": "local-model"}, "nonLocal": {"label": "non-local", "model": "remote-model"}}), patch.object(gate, "local_review", return_value=[{}, {}]) as local, patch.object(gate, "non_local_review", return_value=[{}]) as remote:
            candidate = {"identity": "b" * 64, "payload": "public"}
            gate.review(lambda: dict(candidate), Path(name), "commit")
            local.assert_called_once()
            remote.assert_called_once()
            receipt = json.loads((Path(name) / ("commit-" + candidate["identity"] + ".json")).read_text())
            self.assertEqual(receipt["passes"], 3)

    REVIEWERS = {
        "local": {"label": "local", "model": "local-model"},
        "nonLocal": {"label": "non-local", "model": "remote-model"},
    }

    def _hold_lock(self, path):
        script = (
            "import fcntl, sys, time\n"
            "handle = open(sys.argv[1], 'a')\n"
            "fcntl.flock(handle, fcntl.LOCK_EX)\n"
            "print('ready', flush=True)\n"
            "time.sleep(30)\n"
        )
        process = subprocess.Popen(
            [sys.executable, "-c", script, str(path)],
            stdout=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )

        def stop():
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)
            process.stdout.close()

        self.addCleanup(stop)
        self.assertEqual(process.stdout.readline().strip(), "ready")
        return process

    def _review_once(self, private):
        gate.review(lambda: {"identity": "a" * 64, "payload": "public"}, private, "commit")

    def test_local_review_proceeds_while_non_local_is_held(self):
        private = Path(tempfile.mkdtemp())
        self._hold_lock(private / "inference-non-local.lock")
        local_calls = []

        def local_review(_candidate, _private, _reviewers):
            local_calls.append(1)
            return [{}, {}]

        def non_local_review(_candidate, _private, _reviewers):
            raise AssertionError("non-local review must not run while its lane is held")

        with (
            patch.object(gate, "scan"),
            patch.object(gate, "reviewer_config", return_value=self.REVIEWERS),
            patch.object(gate, "local_review", side_effect=local_review),
            patch.object(gate, "non_local_review", side_effect=non_local_review),
        ):
            with self.assertRaises(gate.GateError) as caught:
                self._review_once(private)
        self.assertIn("non-local review slot", str(caught.exception))
        self.assertEqual(len(local_calls), 1)

    def test_local_reviews_serialize(self):
        private = Path(tempfile.mkdtemp())
        self._hold_lock(private / "inference-local.lock")

        def local_review(_candidate, _private, _reviewers):
            raise AssertionError("local review must not run while its lane is held")

        def non_local_review(_candidate, _private, _reviewers):
            raise AssertionError("non-local review must not run when acquisition already failed")

        with (
            patch.object(gate, "scan"),
            patch.object(gate, "reviewer_config", return_value=self.REVIEWERS),
            patch.object(gate, "local_review", side_effect=local_review),
            patch.object(gate, "non_local_review", side_effect=non_local_review),
        ):
            with self.assertRaises(gate.GateError) as caught:
                self._review_once(private)
        self.assertIn("local review slot", str(caught.exception))

    def test_non_local_reviews_serialize(self):
        private = Path(tempfile.mkdtemp())
        self._hold_lock(private / "inference-non-local.lock")
        local_calls = []

        def local_review(_candidate, _private, _reviewers):
            local_calls.append(1)
            return [{}, {}]

        def non_local_review(_candidate, _private, _reviewers):
            raise AssertionError("non-local review must not run while its lane is held")

        with (
            patch.object(gate, "scan"),
            patch.object(gate, "reviewer_config", return_value=self.REVIEWERS),
            patch.object(gate, "local_review", side_effect=local_review),
            patch.object(gate, "non_local_review", side_effect=non_local_review),
        ):
            with self.assertRaises(gate.GateError) as caught:
                self._review_once(private)
        self.assertIn("non-local review slot", str(caught.exception))
        self.assertEqual(len(local_calls), 1)

    def test_concurrent_reviews_write_distinct_evidence(self):
        private = Path(tempfile.mkdtemp())
        records = []

        class Response(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *args):
                self.close()

        class Opener:
            def __init__(self, model):
                self.model = model

            def open(self, request, timeout=None):
                url = getattr(request, "full_url", str(request))
                if url.endswith("/api/ps"):
                    return Response(b'{"models": []}')
                answer = {
                    "done": True,
                    "done_reason": "stop",
                    "model": self.model,
                    "message": {"content": json.dumps({"verdict": "pass", "findings": []})},
                }
                return Response(json.dumps(answer).encode())

        reviewer = {"label": "local", "endpoint": "http://127.0.0.1:11434", "model": "local-model"}
        for identity in ("a" * 64, "b" * 64):
            gate._review_chunk(
                reviewer,
                "review",
                "public",
                Opener("local-model"),
                private,
                {"identity": identity, "payload": "public"},
                records,
                1,
            )
        files = sorted(private.glob("last-model-review-*.json"))
        self.assertEqual(len(files), 2)
        self.assertEqual({json.loads(path.read_text())["identity"] for path in files}, {"a" * 64, "b" * 64})
        self.assertFalse(list(private.glob(".last-model-review-*")))

    def test_override_skips_only_model_review_and_writes_identity_receipt(self):
        with tempfile.TemporaryDirectory() as name, patch.object(gate, "scan"), patch.dict(os.environ, {"MARK_SAFETY_OVERRIDE": "non-local reviewer offline"}, clear=False), patch.object(gate, "reviewer_config", side_effect=AssertionError("reviewers must not run")):
            candidate = {"identity": "c" * 64, "payload": "public"}
            gate.review(lambda: dict(candidate), Path(name), "commit")
            receipt = json.loads((Path(name) / ("override-commit-" + candidate["identity"] + ".json")).read_text())
            self.assertEqual(receipt["reason"], "non-local reviewer offline")
            self.assertIn("Gitleaks", receipt["scope"])
            self.assertIn("skipped", receipt["scope"])
            self.assertFalse(list(Path(name).glob("commit-*.json")))

    def test_reviewer_chunk_fails_closed_on_wrong_model_or_verdict(self):
        class Response:
            def __init__(self, body):
                self.body = body
            def __enter__(self):
                import io
                return io.BytesIO(self.body)
            def __exit__(self, *args):
                return False
        class Opener:
            def __init__(self, chat):
                self.chat = chat
            def open(self, request, timeout=0):
                url = request if isinstance(request, str) else request.full_url
                if url.endswith("/api/ps"):
                    return Response(json.dumps({"models": []}).encode())
                return Response(json.dumps({"done": True, "done_reason": "stop", "model": self.chat.get("model", "qwen3:4b"), "message": {"content": self.chat["content"]}}).encode())
        reviewer = {"label": "local", "endpoint": "http://127.0.0.1:11434", "model": "qwen3:4b", "gpuCheck": ""}
        candidate = {"identity": "e" * 64, "payload": "public"}
        with tempfile.TemporaryDirectory() as name:
            records = []
            ok = {"model": "qwen3:4b", "content": json.dumps({"verdict": "pass", "findings": []})}
            gate._review_chunk(reviewer, "review", "chunk", Opener(ok), Path(name), candidate, records, 1)
            self.assertEqual(len(records), 1)
            for chat in [
                {"model": "qwen3:4b", "content": json.dumps({"verdict": "fail", "findings": [{"category": "private path"}]})},
                {"model": "qwen3:4b", "content": "not json"},
                {"model": "other-model", "content": json.dumps({"verdict": "pass", "findings": []})},
            ]:
                with self.subTest(chat=chat), self.assertRaises(gate.GateError):
                    gate._review_chunk(reviewer, "review", "chunk", Opener(chat), Path(name), candidate, [], 1)

    def test_reviewer_verdict_must_be_strict_and_passing(self):
        for content in ["not json", "{}", json.dumps({"verdict": "fail", "findings": [{"category": "private path", "relative_path": "docs/x"}]}), json.dumps({"verdict": "pass", "findings": [{"category": "x"}]})]:
            with self.subTest(content=content), self.assertRaises(gate.GateError):
                gate.validate_verdict(content, "local")
        self.assertEqual(gate.validate_verdict(json.dumps({"verdict": "pass", "findings": []}), "local"), {"verdict": "pass", "findings": []})


    def test_removed_baseline_values_do_not_prevent_their_remediation(self):
        personal = "/Users/" + "private-person" + "/project"
        patch = "--- a/docs/file\n+++ b/docs/file\n-" + personal + "\n+~/project\n"
        text = gate.publication_lines(patch)
        self.assertNotIn(personal, text)
        self.assertIn("+~/project", text)
        gate.validate_content([("patch.txt", text.encode())])

    def test_removed_baseline_values_are_not_offered_to_the_reviewers(self):
        personal = "/Users/" + "private-person" + "/project"
        workspace = "~/" + "prj" + "/mark"
        companion = "mark" + "-private"
        address = "100." + "102.145.59"
        removed = "-  cd " + workspace + " && read " + companion + " at " + address + " on " + personal + "\n"
        added = "+  cd " + workspace + " && read " + companion + "\n"
        self.assertEqual(gate.review_view(removed), "- <removed baseline line>\n")
        self.assertEqual(gate.review_view(added), added)
        view = gate.review_view("--- a/docs/file\n+++ b/docs/file\n" + removed + added)
        self.assertIn("- <removed baseline line>\n", view)
        self.assertIn(added.strip(), view)
        for value in [personal, workspace, companion, address]:
            self.assertNotIn(value, view.replace(added, ""))

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
        with tempfile.TemporaryDirectory() as name, patch.object(gate, "scan"), patch.object(gate, "reviewer_config", return_value={"local": {"label": "local", "model": "local-model"}, "nonLocal": {"label": "non-local", "model": "remote-model"}}), patch.object(gate, "local_review", return_value=[{}, {}]), patch.object(gate, "non_local_review", return_value=[{}]):
            snapshots = iter([{"identity": "first", "payload": "public"}, {"identity": "changed"}])
            with self.assertRaises(gate.GateError):
                gate.review(lambda: next(snapshots), Path(name), "commit")
            self.assertFalse(list(Path(name).glob("commit-*.json")))

    def test_exact_candidate_scan_writes_a_private_two_reviewer_receipt(self):
        with tempfile.TemporaryDirectory() as name, patch.object(gate, "scan"), patch.object(gate, "reviewer_config", return_value={"local": {"label": "local", "model": "local-model"}, "nonLocal": {"label": "non-local", "model": "remote-model"}}), patch.object(gate, "local_review", return_value=[{}, {}]), patch.object(gate, "non_local_review", return_value=[{}]):
            candidate = {"identity": "a" * 64, "payload": "public"}
            gate.review(lambda: dict(candidate), Path(name), "commit")
            receipt_path = Path(name) / ("commit-" + candidate["identity"] + ".json")
            receipt = json.loads(receipt_path.read_text())
            self.assertEqual(receipt["identity"], candidate["identity"])
            self.assertEqual(receipt["checks"], ["static-exposure", "gitleaks", "local-model-review", "non-local-model-review", "candidate-identity"])
            self.assertEqual([(r["label"], r["passes"]) for r in receipt["reviewers"]], [("local", 2), ("non-local", 1)])
            self.assertEqual(receipt["passes"], 3)
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


    # START_BLOCK_NON_MAIN_REBASE_TESTS
    @staticmethod
    def non_main_rebase_fixture(directory):
        root = Path(directory) / "repo"
        remote = Path(directory) / "remote.git"
        subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
        subprocess.run(["git", "init", "-q", "-b", "main", str(root)], check=True)

        def run(*args):
            return subprocess.run(
                ["git", "-C", str(root), "-c", "user.name=Test Owner", "-c", "user.email=owner@example.com", *args],
                capture_output=True,
                check=True,
            ).stdout.decode().strip()

        (root / "base.txt").write_text("base\n")
        run("add", "base.txt")
        run("commit", "-q", "-m", "base")
        base = run("rev-parse", "HEAD")
        run("remote", "add", "fork", str(remote))
        run("push", "-q", "-u", "fork", "main")

        run("switch", "-q", "-c", "feature/pr")
        (root / "feature.txt").write_text("feature\n")
        run("add", "feature.txt")
        run("commit", "-q", "-m", "feat: product change")
        old_tip = run("rev-parse", "HEAD")
        run("push", "-q", "-u", "fork", "feature/pr")

        run("switch", "-q", "main")
        (root / "main.txt").write_text("new main\n")
        run("add", "main.txt")
        run("commit", "-q", "-m", "chore: rewritten main anchor")
        main_tip = run("rev-parse", "HEAD")
        run("push", "-q", "fork", "main")
        run("fetch", "-q", "fork", "main", "feature/pr")

        run("switch", "-q", "-c", "rebuilt", "fork/main")
        run("cherry-pick", old_tip)
        new_tip = run("rev-parse", "HEAD")
        alternate_old = run("commit-tree", run("rev-parse", old_tip + "^{tree}"), "-p", base, "-m", "alternate old")
        divergent = run("commit-tree", run("rev-parse", old_tip + "^{tree}"), "-p", base, "-m", "divergent replay")
        run("update-ref", "refs/heads/divergent", divergent)
        updates = "refs/heads/rebuilt " + new_tip + " refs/heads/feature/pr " + old_tip + "\n"
        return SimpleNamespace(
            root=root,
            remote=remote,
            updates=updates,
            base=base,
            old_tip=old_tip,
            main_tip=main_tip,
            new_tip=new_tip,
            alternate_old=alternate_old,
            divergent=divergent,
        )

    def test_non_main_rebase_binds_live_tips_and_scans_only_replayed_commits(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.non_main_rebase_fixture(directory)
            self.assertFalse(gate.history_rewrite_requested(fixture.root, fixture.updates))
            self.assertTrue(gate.non_main_rebase_requested(fixture.root, fixture.updates))
            candidate = gate.non_main_rebase_candidate(fixture.root, "fork", str(fixture.remote), fixture.updates)
            self.assertEqual(candidate["commits"], [fixture.new_tip])
            self.assertEqual(candidate["receipt"]["oldTip"], fixture.old_tip)
            self.assertEqual(candidate["receipt"]["mainTip"], fixture.main_tip)
            self.assertIn("BLOCK_NON_MAIN_REBASE", candidate["passMarker"])
            self.assertIn("REBASE MAIN: " + fixture.main_tip, candidate["payload"])

    def test_non_main_rebase_rejects_multiple_main_tag_stale_and_unbased_updates(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.non_main_rebase_fixture(directory)
            cases = [
                fixture.updates + fixture.updates,
                fixture.updates.replace("refs/heads/feature/pr", "refs/heads/main"),
                fixture.updates.replace("refs/heads/feature/pr", "refs/tags/rebuilt"),
                fixture.updates.replace("refs/heads/feature/pr", "refs/heads/mobile/rebuilt"),
                fixture.updates.replace(fixture.old_tip, fixture.alternate_old),
                "refs/heads/divergent " + fixture.divergent + " refs/heads/feature/pr " + fixture.old_tip + "\n",
                "refs/heads/main " + fixture.main_tip + " refs/heads/feature/pr " + fixture.old_tip + "\n",
            ]
            for updates in cases:
                with self.subTest(updates=updates.split()[2]), self.assertRaises(gate.GateError):
                    gate.non_main_rebase_candidate(fixture.root, "fork", str(fixture.remote), updates)

            subprocess.run(
                ["git", "-C", str(fixture.root), "update-ref", "refs/remotes/fork/main", fixture.base],
                check=True,
            )
            with self.assertRaises(gate.GateError):
                gate.non_main_rebase_candidate(fixture.root, "fork", str(fixture.remote), fixture.updates)

    def test_non_main_rebase_reads_actual_push_endpoint_not_fetch_url(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.non_main_rebase_fixture(directory)
            push_remote = Path(directory) / "push.git"
            subprocess.run(["git", "init", "-q", "--bare", str(push_remote)], check=True)
            subprocess.run(
                [
                    "git", "-C", str(fixture.root), "push", "-q", str(push_remote),
                    fixture.base + ":refs/heads/main",
                    fixture.old_tip + ":refs/heads/feature/pr",
                ],
                check=True,
            )
            subprocess.run(
                ["git", "-C", str(fixture.root), "remote", "set-url", "--push", "fork", str(push_remote)],
                check=True,
            )
            push_location = subprocess.run(
                ["git", "-C", str(fixture.root), "remote", "get-url", "--push", "fork"],
                capture_output=True,
                check=True,
                text=True,
            ).stdout.strip()

            with self.assertRaises(gate.GateError) as stopped:
                gate.non_main_rebase_candidate(fixture.root, "fork", push_location, fixture.updates)
            self.assertNotIn(push_location, str(stopped.exception))

            subprocess.run(
                [
                    "git", "-C", str(fixture.root), "push", "-q", str(push_remote),
                    fixture.main_tip + ":refs/heads/main",
                ],
                check=True,
            )
            candidate = gate.non_main_rebase_candidate(
                fixture.root,
                "fork",
                push_location,
                fixture.updates,
            )
            self.assertNotIn(push_location, candidate["payload"])
            self.assertNotIn(push_location, json.dumps(candidate["receipt"], sort_keys=True))

    def test_non_main_rebase_dispatch_uses_pre_push_endpoint_argument(self):
        root = Path("/worktree")
        private = Path("/private")
        updates = "refs/heads/rebuilt " + "a" * 40 + " refs/heads/feature/pr " + "b" * 40 + "\n"
        push_location = "ssh://push-only.example/repository.git"
        with (
            patch.object(gate.sys, "argv", ["security_gate.py", "push", "fork", push_location]),
            patch.object(gate.sys, "stdin", SimpleNamespace(read=lambda: updates)),
            patch.object(gate, "repository", return_value=(root, Path("/common"), private)),
            patch.object(gate, "ref_deletions", return_value=False),
            patch.object(gate, "history_rewrite_requested", return_value=False),
            patch.object(gate, "non_main_rebase_requested", return_value=True),
            patch.object(gate, "non_main_rebase_candidate", return_value={}) as candidate,
            patch.object(gate, "review", side_effect=lambda build, _private, _operation: build()),
        ):
            gate.main()
        candidate.assert_called_once_with(root, "fork", push_location, updates)

        with (
            patch.object(gate.sys, "argv", ["security_gate.py", "push", "fork"]),
            patch.object(gate.sys, "stdin", SimpleNamespace(read=lambda: updates)),
            patch.object(gate, "repository", return_value=(root, Path("/common"), private)),
            patch.object(gate, "ref_deletions", return_value=False),
            patch.object(gate, "history_rewrite_requested", return_value=False),
            patch.object(gate, "non_main_rebase_requested", return_value=True),
        ):
            with self.assertRaises(gate.GateError) as stopped:
                gate.main()
        self.assertNotIn(push_location, str(stopped.exception))
    # END_BLOCK_NON_MAIN_REBASE_TESTS


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


    # START_BLOCK_MESSAGE_ONLY_HISTORY_REWRITE_TESTS
    @staticmethod
    def history_fixture(directory, replacement="feature\n", mutation=None):
        root = Path(directory) / "repo"
        root.mkdir()
        subprocess.run(["git", "-C", str(root), "init", "-q", "-b", "main"], check=True)

        def git_bytes(*args, data=None):
            return subprocess.run(
                ["git", "-C", str(root), *args],
                input=data,
                capture_output=True,
                check=True,
            ).stdout

        empty_tree = git_bytes("hash-object", "-t", "tree", "-w", "--stdin", data=b"").decode().strip()
        blob = git_bytes("hash-object", "-t", "blob", "-w", "--stdin", data=b"changed\n").decode().strip()
        changed_tree = git_bytes(
            "mktree",
            data=("100644 blob " + blob + "\tfile.txt\n").encode(),
        ).decode().strip()
        author = b"author Test Owner <owner@example.com> 1700000000 +0000"
        committer = b"committer Test Owner <owner@example.com> 1700000000 +0000"

        def write_commit(tree, parents, message, signature=False, extra=(b"x-test stable", b"x-other stable")):
            headers = [("tree " + tree).encode()]
            headers.extend(("parent " + parent).encode() for parent in parents)
            headers.extend([author, committer])
            if signature:
                headers.append(b"gpgsig -----BEGIN PGP SIGNATURE-----\n fake-signature\n -----END PGP SIGNATURE-----")
            if extra:
                headers.extend(extra if isinstance(extra, tuple) else (extra,))
            raw = b"\n".join(headers) + b"\n\n" + message.encode()
            return git_bytes("hash-object", "-t", "commit", "-w", "--stdin", data=raw).decode().strip()

        base = write_commit(empty_tree, [], "base\n")
        old_message = "feature\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>\n"
        feature = write_commit(changed_tree, [base], old_message)
        follow_up = write_commit(changed_tree, [feature], "follow-up\n")
        merge = write_commit(changed_tree, [feature, follow_up], "merge\n")
        old_tip = write_commit(changed_tree, [merge], "tip\n", signature=True)
        git_bytes("update-ref", "refs/heads/main", old_tip)
        git_bytes("update-ref", "refs/remotes/fork/main", old_tip)

        rewritten = {}

        def rebuild(oid):
            if oid == base:
                return oid
            if oid in rewritten:
                return rewritten[oid]
            commit = gate.raw_commit(root, oid)
            parents = [rebuild(parent) for parent in commit["parents"]]
            message = replacement.encode() if oid == feature else commit["message"]
            stable = list(commit["stableHeaders"])
            headers = [stable[0], *[(b"parent " + parent.encode()) for parent in parents], *stable[1:]]
            if mutation:
                headers, message = mutation(oid, {"feature": feature, "merge": merge, "tip": old_tip, "altTree": empty_tree}, headers, message)
            raw = b"\n".join(headers) + b"\n\n" + message
            rewritten[oid] = git_bytes("hash-object", "-t", "commit", "-w", "--stdin", data=raw).decode().strip()
            return rewritten[oid]

        new_tip = rebuild(old_tip)
        git_bytes("update-ref", "refs/heads/rewritten", new_tip)
        manifest = {
            "schemaVersion": "1.0.0",
            "operation": "message-only-main-rewrite",
            "oldTip": old_tip,
            "expectedReachableCommitCount": 5,
            "expectedCommitCount": 4,
            "expectedMergeCount": 1,
            "expectedSignatureRemovals": 1,
            "changes": [{
                "oldSha": feature,
                "oldMessageSha256": gate.hashlib.sha256(old_message.encode()).hexdigest(),
                "newMessage": replacement,
            }],
        }
        manifest_path = Path(directory) / "history-rewrite.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))
        updates = "refs/heads/rewritten " + new_tip + " refs/heads/main " + old_tip + "\n"
        return SimpleNamespace(
            root=root,
            manifest=manifest,
            manifest_path=manifest_path,
            updates=updates,
            old_tip=old_tip,
            new_tip=new_tip,
            feature=feature,
            base=base,
        )

    def test_exact_manifest_merge_dag_and_signature_loss_are_admitted(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.history_fixture(directory)
            self.assertTrue(gate.history_rewrite_requested(fixture.root, fixture.updates))
            candidate = gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)
            self.assertEqual(candidate["receipt"]["commitCount"], 4)
            self.assertEqual(candidate["receipt"]["reachableCommitCount"], 5)
            self.assertEqual(candidate["receipt"]["mergeCount"], 1)
            self.assertEqual(candidate["receipt"]["changedMessageCount"], 1)
            self.assertEqual(candidate["receipt"]["removedSignatureCount"], 1)
            self.assertIn("BLOCK_MESSAGE_ONLY_HISTORY_REWRITE", candidate["passMarker"])
            self.assertIn("--- previous message", candidate["payload"])
            self.assertNotIn("Co-Authored-By", candidate["scanText"])

    def test_exact_manifest_preserves_a_message_without_trailing_lf(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.history_fixture(directory, replacement="feature without final LF")
            candidate = gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)
            rewritten = gate.raw_commit(fixture.root, candidate["commits"][0])["message"]
            self.assertEqual(rewritten, b"feature without final LF")

    def test_rewrite_rejects_manifest_drift_and_forbidden_replacement(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.history_fixture(directory)
            fixture.manifest["changes"][0]["newMessage"] = "different\n"
            fixture.manifest_path.write_text(json.dumps(fixture.manifest))
            with self.assertRaises(gate.GateError):
                gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)
        with tempfile.TemporaryDirectory() as directory:
            replacement = "feature\n\nCo-Authored-By: Codex <codex@openai.com>\n"
            fixture = self.history_fixture(directory, replacement=replacement)
            with self.assertRaises(gate.GateError):
                gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)

    def test_rewrite_rejects_tree_identity_extra_header_parent_and_signature_changes(self):
        def mutate_tree(oid, ids, headers, message):
            if oid == ids["feature"]:
                headers[0] = ("tree " + ids["altTree"]).encode()
            return headers, message

        def mutate_author(oid, ids, headers, message):
            if oid == ids["feature"]:
                headers = [b"author Other <other@example.com> 1700000000 +0000" if line.startswith(b"author ") else line for line in headers]
            return headers, message

        def mutate_extra(oid, ids, headers, message):
            if oid == ids["feature"]:
                headers = [b"x-test changed" if line == b"x-test stable" else line for line in headers]
            return headers, message

        def mutate_header_order(oid, ids, headers, message):
            if oid == ids["feature"]:
                first = headers.index(b"x-test stable")
                second = headers.index(b"x-other stable")
                headers[first], headers[second] = headers[second], headers[first]
            return headers, message

        def mutate_parents(oid, ids, headers, message):
            if oid == ids["merge"]:
                parent_indexes = [index for index, line in enumerate(headers) if line.startswith(b"parent ")]
                headers[parent_indexes[0]], headers[parent_indexes[1]] = headers[parent_indexes[1]], headers[parent_indexes[0]]
            return headers, message

        def copy_signature(oid, ids, headers, message):
            if oid == ids["tip"]:
                headers.append(b"gpgsig -----BEGIN PGP SIGNATURE-----\n copied\n -----END PGP SIGNATURE-----")
            return headers, message

        def split_shared_node(oid, ids, headers, message):
            if oid == ids["merge"]:
                first_parent = next(index for index, line in enumerate(headers) if line.startswith(b"parent "))
                headers[first_parent] = b"parent " + ids["feature"].encode()
            return headers, message

        for mutation in [mutate_tree, mutate_author, mutate_extra, mutate_header_order, mutate_parents, copy_signature, split_shared_node]:
            with self.subTest(mutation=mutation.__name__), tempfile.TemporaryDirectory() as directory:
                fixture = self.history_fixture(directory, mutation=mutation)
                with self.assertRaises(gate.GateError):
                    gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)

    def test_rewrite_rejects_other_refs_multiple_refs_stale_tips_and_shallow_history(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.history_fixture(directory)
            other = fixture.updates.replace("refs/heads/main", "refs/heads/other")
            with self.assertRaises(gate.GateError):
                gate.history_rewrite(fixture.root, "fork", other, fixture.manifest_path)
            tag_update = "refs/tags/release " + fixture.new_tip + " refs/tags/release " + fixture.old_tip + "\n"
            with self.assertRaises(gate.GateError):
                gate.history_rewrite_requested(fixture.root, tag_update)
            with self.assertRaises(gate.GateError):
                gate.history_rewrite(fixture.root, "fork", fixture.updates * 2, fixture.manifest_path)
            subprocess.run(["git", "-C", str(fixture.root), "update-ref", "refs/remotes/fork/main", fixture.base], check=True)
            with self.assertRaises(gate.GateError):
                gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)

            original_git = gate.git
            def shallow_git(root, *args, **kwargs):
                if args == ("rev-parse", "--is-shallow-repository"):
                    return b"true\n"
                return original_git(root, *args, **kwargs)
            with patch.object(gate, "git", side_effect=shallow_git), self.assertRaises(gate.GateError):
                gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)
            with self.assertRaises(gate.GateError):
                gate._history_manifest("~mark-user-that-does-not-exist/history-rewrite.json")

        with tempfile.TemporaryDirectory() as directory:
            old_message = "feature\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>\n"
            fixture = self.history_fixture(directory, replacement=old_message)
            with self.assertRaises(gate.GateError):
                gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)

    def test_rewrite_rejects_shared_node_mapping_conflict_independently_of_counts(self):
        def split_shared_node(oid, ids, headers, message):
            if oid == ids["merge"]:
                first_parent = next(index for index, line in enumerate(headers) if line.startswith(b"parent "))
                headers[first_parent] = b"parent " + ids["feature"].encode()
            return headers, message

        with tempfile.TemporaryDirectory() as directory:
            fixture = self.history_fixture(directory, mutation=split_shared_node)
            original_git = gate.git
            def equal_count_git(root, *args, **kwargs):
                if args[:2] == ("rev-list", "--count"):
                    return b"5\n"
                return original_git(root, *args, **kwargs)
            with patch.object(gate, "git", side_effect=equal_count_git), self.assertRaises(gate.GateError) as found:
                gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path)
            self.assertIn("maps one old commit to multiple new commits", str(found.exception))

    def test_rewrite_manifest_change_during_scan_prevents_receipt(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as private:
            fixture = self.history_fixture(directory)
            def change_manifest(_candidate):
                fixture.manifest["expectedCommitCount"] += 1
                fixture.manifest_path.write_text(json.dumps(fixture.manifest))
            with patch.object(gate, "scan", side_effect=change_manifest), self.assertRaises(gate.GateError):
                gate.review(
                    lambda: gate.history_rewrite(fixture.root, "fork", fixture.updates, fixture.manifest_path),
                    Path(private),
                    "history-rewrite",
                )
            self.assertFalse(list(Path(private).glob("history-rewrite-*.json")))
    # END_BLOCK_MESSAGE_ONLY_HISTORY_REWRITE_TESTS


if __name__ == "__main__":
    unittest.main()
