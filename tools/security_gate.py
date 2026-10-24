#!/usr/bin/env python3
# FILE: tools/security_gate.py
# VERSION: 1.9.0
# START_MODULE_CONTRACT
#   PURPOSE: Fail local commit/push operations closed until their exact payload passes deterministic exposure, lane, identity and Gitleaks checks.
#   SCOPE: Exact staged/message/outgoing snapshots, approved public/private path checks, manifest-bound reviewed README screenshots, merged-branch deletion admission, AI attribution and branch-name bans, identity recheck, private receipts and common hooks.
#   DEPENDS: Python stdlib, git, gitleaks.
#   LINKS: .grace/graph/features.xml M-064; .grace/verification/features.xml V-M-064; C-PUBLIC-REPOSITORY-HYGIENE.
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
# START_MODULE_MAP
#   GateError - non-sensitive fail-closed diagnostic.
#   git - checked Git invocation without a shell.
#   repository - resolve worktree and shared private Git storage.
#   publication_lines - exclude removed baseline lines from new-exposure scanning.
#   validate_lane - keep mobile runtime and desktop release/version writes in their own lanes.
#   staged_candidate - bind staged blobs, diff and commit message to an index tree.
#   AI_NAMES - assistant/vendor names that must not appear in attribution trailers or branch names.
#   AI_ATTRIBUTION - compiled attribution rule used for commit-message checks.
#   AI_BRANCH - compiled branch-prefix rule used for ref checks.
#   validate_attribution - reject commit messages that credit an AI assistant.
#   validate_branch_name - reject refs whose branch name starts with an AI assistant name.
#   REFERENCE_TRANSACTION_HOOK - shell hook that aborts local creation of AI-named branches and worktree branches.
#   push_candidate - inspect every outgoing commit and proposed ref update.
#   merged_by_pull_request - prove via GitHub that a tip is the exact head of a PR merged into main.
#   ref_deletions - admit a deletion-only push when every deleted branch tip is already in main or merged by PR.
#   validate_reviewed_screenshot_binaries - admit only exact reviewed README PNG bytes named by a same-candidate release manifest.
#   validate_content - reject private material, personal paths and unsupported payloads.
#   scan - run trusted Gitleaks rules against exact candidate blobs.
#   review - lock, scan, recheck candidate identity and write a private deterministic receipt.
#   install - scan the staged bootstrap and install common fail-closed hooks.
#   main - dispatch early static checks, full commit/push review and installation.
# END_MODULE_MAP
# START_CHANGE_SUMMARY
#   LAST_CHANGE: 1.9.0 - 2026-10-24 C-PUBLIC-REPOSITORY-HYGIENE: make the public gate deterministic by retaining exact candidate, static exposure, Gitleaks, lane, ref, binary-evidence and identity checks while moving optional workstation review outside the repository.
#   PREV: 1.8.0 - 2026-10-24: owner-approved AI-name ban — commit and push reject AI attribution trailers (Co-Authored-By and similar, "Generated with" lines) and AI-named branches; a reference-transaction hook stops local creation of such branches, including worktree branches.
#   PREV: 1.7.0 - 2026-10-24: owner-approved housekeeping lane — a deletion-only push of non-main branches passes when each deleted tip is an ancestor of <remote>/main or the exact head of a PR merged into main; mixed, tag, main or unproven deletions stay blocked.
#   PREV: 1.6.1 - 2026-10-21 C-SAFE-PUBLIC-GITHUB-REFERENCES-V2: keep the public-reference rule explicit inside source-controlled workflow and governance files during outgoing-history review.
#   PREV: 1.6.0 - 2026-10-21 C-SAFE-PUBLIC-GITHUB-REFERENCES: distinguish public GitHub resource/runtime-lookup references from literal credential material without masking candidate bytes or weakening scans.
#   PREV: 1.5.0 - 2026-10-21 C-SAFE-SCREENSHOT-REVIEW: admit only exact README PNG bytes bound to complete same-candidate human-review manifest evidence; all other binaries still fail closed.
#   PREV: 1.2.0 - 2026-10-19: enforce the approved public/private operational and captured-profile path boundary before publication.
#   PREV: 1.0.0 - 2026-10-19 C-SAFE-DELIVERY: mandatory exact-payload publication gate shared across independent delivery lanes.
# END_CHANGE_SUMMARY

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time


class GateError(Exception):
    pass


def git(root, *args, data=None):
    result = subprocess.run(["git", "-C", str(root), *args], input=data, capture_output=True)
    if result.returncode:
        raise GateError("Git snapshot failed; refresh the repository before retrying")
    return result.stdout


def repository():
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    common = Path(git(root, "rev-parse", "--git-common-dir").decode().strip())
    if not common.is_absolute():
        common = (root / common).resolve()
    private = common / "mark-safety"
    private.mkdir(mode=0o700, exist_ok=True)
    os.chmod(private, 0o700)
    return root, common, private


def publication_lines(patch):
    return "\n".join(line for line in patch.splitlines() if not line.startswith("-"))


def validate_lane(root, blobs, branch):
    mobile = branch.startswith(("mobile/", "refs/heads/mobile/", "refs/tags/mobile/"))
    mobile_paths = ("plugins/markmobile/", "src/renderer/src/mobile/", "src/renderer/mobile.html", "src-tauri/gen/apple/", "src-tauri/src/m060_mobile.rs", "src-tauri/src/lib.rs", "src-tauri/tauri.ios.conf.json", "src-tauri/capabilities/mobile.json", "static/mobile-fixture.md", "tests/e2e/mobile/", "tests/renderer/mobile/", "vite.mobile.config.js", ".grace/changes/active/C-MOBILE-")
    desktop_release = (".github/workflows/release", "docs/release-trains/", "src/renderer/src/whatsNew/", "src-tauri/mas.conf.json")
    for name, data in blobs:
        if not mobile and name.startswith(mobile_paths):
            raise GateError("Mobile-owned material cannot enter a desktop commit/push: " + name)
        if mobile and name.startswith(desktop_release):
            raise GateError("Mobile must not modify desktop publication state: " + name)
        if mobile and name in {"package.json", "package-lock.json", "src-tauri/tauri.conf.json"}:
            before = json.loads(git(root, "show", "HEAD:" + name))
            after = json.loads(data)
            if before.get("version") != after.get("version"):
                raise GateError("Mobile must use its own version overlay: " + name)
        if mobile and name == "Cargo.toml":
            section = r"(?ms)^\[workspace\.package\](.*?)(?=^\[|\Z)"
            before = re.search(section, git(root, "show", "HEAD:" + name).decode())
            after = re.search(section, data.decode())
            version = r'(?m)^version\s*=\s*"([^"]+)"'
            if before and after and re.search(version, before[1])[1] != re.search(version, after[1])[1]:
                raise GateError("Mobile cannot bump the desktop Cargo workspace version")


AI_NAMES = r"(?:claude|codex|anthropic|openai|copilot|chatgpt|gemini|zcode)"
AI_ATTRIBUTION = re.compile(
    r"(?im)^\s*(?:co-authored-by|signed-off-by|assisted-by|generated-by|helped-by)\s*:.*" + AI_NAMES
    + r"|generated with \[?" + AI_NAMES
)
AI_BRANCH = re.compile(r"(?i)^refs/heads/" + AI_NAMES + r"(?:[/_.-]|$)")
REFERENCE_TRANSACTION_HOOK = """#!/bin/sh
# MARK_SAFETY_SHARED_HOOK
[ "${1:-}" = prepared ] || { cat >/dev/null; exit 0; }
blocked=$(awk '$1 ~ /^0+$/ { print $3 }' | grep -i -E '^refs/heads/(claude|codex|anthropic|openai|copilot|chatgpt|gemini|zcode)([/_.-]|$)' || true)
if [ -n "$blocked" ]; then
  echo "[RepositorySafety][refs][BLOCK_AI_BRANCH_NAME] branch names must not start with an AI assistant name: $blocked" >&2
  exit 1
fi
"""


def validate_attribution(message):
    # START_BLOCK_AI_ATTRIBUTION
    if AI_ATTRIBUTION.search(message):
        raise GateError("AI attribution is not allowed in commit messages; remove the Co-Authored-By/Generated-with line")
    # END_BLOCK_AI_ATTRIBUTION


def validate_branch_name(ref):
    if AI_BRANCH.match(ref):
        raise GateError("Branch names must not start with an AI assistant name: " + ref)


def staged_candidate(root, message):
    validate_attribution(message)
    tree = git(root, "write-tree").decode().strip()
    paths = git(root, "diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z").split(b"\0")
    for entry in git(root, "ls-files", "--stage", "-z").split(b"\0"):
        if entry and entry.split(b"\t", 1)[-1] in paths and entry.startswith((b"120000 ", b"160000 ")):
            raise GateError("Symlink or submodule requires a separate reviewed scope")
    blobs = [(p.decode(), git(root, "show", ":" + p.decode())) for p in paths if p]
    branch = git(root, "symbolic-ref", "--quiet", "--short", "HEAD").decode().strip()
    validate_lane(root, blobs, branch)
    patch = git(root, "diff", "--cached", "--no-ext-diff", "--no-textconv", "--unified=3").decode("utf-8", "strict")
    payload = "OPERATION: commit\nBRANCH: " + branch + "\nMESSAGE:\n" + message + "\nSTAGED PATCH:\n" + patch
    if len(payload.encode()) > 2_000_000:
        raise GateError("Staged scope exceeds review budget; split the task")
    identity = hashlib.sha256((tree + "\n" + payload).encode()).hexdigest()
    return {"identity": identity, "payload": payload, "scanText": message + "\n" + publication_lines(patch), "blobs": blobs, "blobGroups": [blobs], "tree": tree}


def push_candidate(root, remote, updates):
    commits = []
    lanes = set()
    for line in updates.splitlines():
        fields = line.split()
        if len(fields) != 4:
            raise GateError("Malformed push ref update")
        local_ref, local_oid, remote_ref, remote_oid = fields
        source_mobile = local_ref.startswith(("refs/heads/mobile/", "refs/tags/mobile/"))
        target_mobile = remote_ref.startswith(("refs/heads/mobile/", "refs/tags/mobile/"))
        if source_mobile != target_mobile:
            raise GateError("Cross-lane push rejected; use an explicit reviewed source synchronization task")
        lanes.add(target_mobile)
        validate_branch_name(remote_ref)
        if set(local_oid) == {"0"}:
            raise GateError("Ref deletion needs a separately reviewed housekeeping task")
        if not re.fullmatch(r"[0-9a-f]{40,64}", local_oid + "") or not re.fullmatch(r"[0-9a-f]{40,64}", remote_oid):
            raise GateError("Malformed push object identity")
        if git(root, "rev-parse", "--verify", local_ref).decode().strip() != local_oid:
            raise GateError("Local ref changed after push negotiation; review again")
        # Existing remote tips are authoritative. Unknown objects fail closed.
        exclusions = [remote_oid] if set(remote_oid) != {"0"} else [
            x for x in git(root, "for-each-ref", "--format=%(objectname)", "refs/remotes/" + remote + "/").decode().splitlines()
        ]
        args = ["rev-list", "--reverse", local_oid]
        if exclusions:
            args += ["--not", *exclusions]
        commits += git(root, *args).decode().splitlines()
    blobs = []
    blob_groups = []
    payload = "OPERATION: push\nREF UPDATES:\n" + updates
    scan_text = updates
    for oid in dict.fromkeys(commits):
        parents = git(root, "rev-list", "--parents", "-n", "1", oid).decode().split()[1:]
        parent = parents[0] if parents else git(root, "hash-object", "-t", "tree", "--stdin", data=b"").decode().strip()
        names = git(root, "diff", "--name-only", "--diff-filter=ACMRT", "-z", parent, oid).split(b"\0")
        commit_blobs = []
        for name in names:
            if not name:
                continue
            entry = git(root, "ls-tree", oid, "--", name.decode())
            if entry.startswith((b"120000 ", b"160000 ")):
                raise GateError("Outgoing symlink or submodule requires separate review")
            commit_blobs.append((name.decode(), git(root, "show", oid + ":" + name.decode())))
        blobs.extend(commit_blobs)
        blob_groups.append(commit_blobs)
        message = git(root, "show", "-s", "--format=%B", oid).decode("utf-8", "strict")
        validate_attribution(message)
        patch = git(root, "diff", "--no-ext-diff", "--no-textconv", "--unified=3", parent, oid).decode("utf-8", "strict")
        payload += "\nCOMMIT " + oid + "\n" + message + patch
        scan_text += "\n" + message + publication_lines(patch)
    if len(payload.encode()) > 2_000_000:
        raise GateError("Outgoing scope exceeds review budget; split the integration task")
    if len(lanes) > 1:
        raise GateError("Push desktop and mobile tasks separately")
    validate_lane(root, blobs, "mobile/" if True in lanes else "desktop")
    return {"identity": hashlib.sha256(payload.encode()).hexdigest(), "payload": payload, "scanText": scan_text, "blobs": blobs, "blobGroups": blob_groups, "commits": commits}


def merged_by_pull_request(root, remote, oid):
    url = git(root, "remote", "get-url", remote).decode().strip()
    match = re.fullmatch(r"(?:https://github\.com/|git@github\.com:)([\w.-]+/[\w.-]+?)(?:\.git)?/?", url)
    if not match:
        return False
    try:
        result = subprocess.run(["gh", "api", "repos/" + match[1] + "/commits/" + oid + "/pulls"], capture_output=True, text=True, timeout=30)
        pulls = json.loads(result.stdout) if result.returncode == 0 else []
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return False
    if not isinstance(pulls, list):
        return False
    return any(
        isinstance(pull, dict) and pull.get("merged_at") and (pull.get("head") or {}).get("sha") == oid and (pull.get("base") or {}).get("ref") == "main"
        for pull in pulls
    )


def ref_deletions(root, remote, updates):
    # START_BLOCK_MERGED_REF_DELETION
    lines = [line.split() for line in updates.splitlines() if line.strip()]
    deletions = [fields for fields in lines if len(fields) == 4 and set(fields[1]) == {"0"}]
    if not deletions:
        return False
    if len(deletions) != len(lines):
        raise GateError("Push ref deletions separately from content updates")
    for _local_ref, _local_oid, remote_ref, remote_oid in deletions:
        if not remote_ref.startswith("refs/heads/") or remote_ref == "refs/heads/main":
            raise GateError("Only merged non-main branches may be deleted: " + remote_ref)
        if not re.fullmatch(r"[0-9a-f]{40,64}", remote_oid) or set(remote_oid) == {"0"}:
            raise GateError("Malformed push object identity")
        in_main = subprocess.run(["git", "-C", str(root), "merge-base", "--is-ancestor", remote_oid, "refs/remotes/" + remote + "/main"], capture_output=True).returncode == 0
        if not in_main and not merged_by_pull_request(root, remote, remote_oid):
            raise GateError("Branch tip is not in main and has no merged PR; fetch and retry or keep it: " + remote_ref)
    print("[RepositorySafety][push][BLOCK_MERGED_REF_DELETION] admitted", len(deletions), "merged branch deletion(s)", file=sys.stderr)
    return True
    # END_BLOCK_MERGED_REF_DELETION


def validate_reviewed_screenshot_binaries(blobs):
    # START_BLOCK_MANIFEST_BOUND_SCREENSHOT_REVIEW
    screenshots = {
        name: data
        for name, data in blobs
        if re.fullmatch(r"docs/assets/readme/[^/]+\.png", name)
    }
    if not screenshots:
        return set()

    manifest_blobs = [
        (name, data)
        for name, data in blobs
        if re.fullmatch(r"docs/assets/readme/[^/]+\.manifest\.json", name)
    ]
    if not manifest_blobs:
        raise GateError("Reviewed README screenshot requires a staged release manifest")

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result

    evidence = {}
    for manifest_name, raw in manifest_blobs:
        try:
            manifest = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=unique_object)
        except (UnicodeError, ValueError):
            raise GateError("Screenshot review manifest is malformed: " + manifest_name) from None
        review = manifest.get("review") if isinstance(manifest, dict) else None
        scenarios = review.get("scenarios") if isinstance(review, dict) else None
        if (
            manifest.get("schemaVersion") != "1.0.0"
            or not re.fullmatch(r"\d+\.\d+\.\d+", manifest.get("releaseVersion", ""))
            or manifest.get("captureState") != "fresh-reviewed"
            or not isinstance(review.get("reviewer") if isinstance(review, dict) else None, str)
            or not review["reviewer"].strip()
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", review.get("reviewedAt", "") if isinstance(review, dict) else "")
            or not isinstance(scenarios, list)
            or not scenarios
            or any(not isinstance(value, str) or not value.strip() for value in scenarios)
            or not isinstance(manifest.get("images"), list)
        ):
            raise GateError("Screenshot review manifest evidence is incomplete: " + manifest_name)
        local_paths = set()
        for entry in manifest["images"]:
            path = entry.get("path") if isinstance(entry, dict) else None
            digest = entry.get("sha256") if isinstance(entry, dict) else None
            if (
                not isinstance(path, str)
                or not re.fullmatch(r"docs/assets/readme/[^/]+\.png", path)
                or path in local_paths
                or not isinstance(digest, str)
                or not re.fullmatch(r"[0-9a-f]{64}", digest)
            ):
                raise GateError("Screenshot review manifest image evidence is invalid: " + manifest_name)
            local_paths.add(path)
            if path in evidence:
                raise GateError("Screenshot review evidence is ambiguous: " + path)
            evidence[path] = digest

    for name, data in screenshots.items():
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise GateError("Reviewed screenshot has an invalid PNG signature: " + name)
        if evidence.get(name) != hashlib.sha256(data).hexdigest():
            raise GateError("Reviewed screenshot digest evidence mismatch: " + name)
    return set(screenshots)
    # END_BLOCK_MANIFEST_BOUND_SCREENSHOT_REVIEW


def validate_content(blobs):
    # START_BLOCK_STATIC_EXPOSURE_CHECKS
    reviewed_screenshots = validate_reviewed_screenshot_binaries(blobs)
    for name, data in blobs:
        path = Path(name)
        if path.is_absolute() or ".." in path.parts:
            raise GateError("Unsafe repository path")
        reserved = (".grace/changes/active/C-59", ".grace/changes/archive/C-59", "docs/promotion", "prototypes/table-copy")
        if name == "docs/backlog.md" or any(name == prefix or name.startswith(prefix + "/") for prefix in reserved):
            raise GateError("Reserved private operational path: " + name)
        if name.startswith("fixtures/"):
            retained = {"fixtures/README.md", "fixtures/fixture-pin.lock"} | {
                "fixtures/" + version + "/migration-relevant/" + item
                for version in ["v0-marktext-userdata", "v1-userdata-mark-1.0.2"]
                for item in ["dataCenter.json", "preferences.json", "window-state.json"]
            }
            if name not in retained:
                raise GateError("Captured profile or unsupported public fixture path: " + name)
        if any(p in {".git", ".claude", ".zcode", "node_modules", "target", "target-test", "dist", "DerivedData"} for p in path.parts):
            raise GateError("Generated or private session material: " + name)
        if path.name.startswith(".env") and not path.name.endswith((".example", ".sample")):
            raise GateError("Environment file: " + name)
        if path.suffix.lower() in {".p8", ".p12", ".pem", ".key", ".mobileprovision", ".log", ".crash"} or path.name in {"id_rsa", "id_ed25519"}:
            raise GateError("Signing, credential or local log file: " + name)
        if name in reviewed_screenshots:
            continue
        if b"\0" in data:
            raise GateError("Binary requires separate local multimodal review: " + name)
        try:
            text = data.decode("utf-8", "strict")
        except UnicodeDecodeError:
            raise GateError("Non-UTF-8 payload requires separate review: " + name) from None
        if re.search(r"(?:/Users/|/home/|[A-Za-z]:[\\/]Users[\\/])[A-Za-z0-9_.-]+[\\/]", text):
            raise GateError("Personal absolute path: " + name)
        if re.search(r"[A-Za-z0-9.-]+\.tail[a-z0-9]+\.ts\.net\b", text, re.I):
            raise GateError("Private infrastructure address: " + name)
    # END_BLOCK_STATIC_EXPOSURE_CHECKS


def scan(candidate):
    scan_text = candidate.get("scanText", candidate["payload"])
    for group in candidate.get("blobGroups", [candidate["blobs"]]):
        validate_content(group)
    validate_content([("commit-message-and-diff.txt", scan_text.encode())])
    if not shutil.which("gitleaks"):
        raise GateError("Required Gitleaks executable is unavailable")
    with tempfile.TemporaryDirectory(prefix="mark-safety-") as name:
        folder = Path(name)
        payloads = folder / "payloads"
        payloads.mkdir()
        for index, (_, data) in enumerate(candidate["blobs"]):
            (payloads / str(index)).write_bytes(data)
        (payloads / "message-and-diff").write_text(scan_text)
        config = folder / "trusted.toml"
        config.write_text("[extend]\nuseDefault = true\n")
        ignored = folder / "empty-ignore"
        ignored.write_text("")
        env = {k: v for k, v in os.environ.items() if not k.startswith("GITLEAKS_")}
        run = subprocess.run(["gitleaks", "dir", str(payloads), "--config", str(config), "--gitleaks-ignore-path", str(ignored), "--ignore-gitleaks-allow", "--redact", "--no-banner", "--no-color", "--log-level", "error", "--max-decode-depth", "5", "--timeout", "120"], env=env, capture_output=True)
        if run.returncode:
            raise GateError("Gitleaks rejected the exact payload; inspect locally with full redaction")


def review(make_candidate, private, operation):
    # START_BLOCK_EXACT_CANDIDATE_SCAN
    import fcntl
    with (private / "review.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise GateError("Another repository safety scan is already running") from None
        candidate = make_candidate()
        scan(candidate)
        if make_candidate()["identity"] != candidate["identity"]:
            raise GateError("Candidate changed during scan; stage and scan again")
        receipt = {
            "operation": operation,
            "identity": candidate["identity"],
            "checkedAt": int(time.time()),
            "gateSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "checks": ["static-exposure", "gitleaks", "candidate-identity"],
        }
        path = private / (operation + "-" + candidate["identity"] + ".json")
        path.write_text(json.dumps(receipt, indent=2))
        os.chmod(path, 0o600)
        # START_BLOCK_SAFETY_SCAN_PASS
        print("[RepositorySafety][scan][BLOCK_SAFETY_SCAN_PASS]", operation, candidate["identity"], "checks=3")
        # END_BLOCK_SAFETY_SCAN_PASS
    # END_BLOCK_EXACT_CANDIDATE_SCAN


def install(root, common, private):
    source = Path(__file__).read_bytes()
    if git(root, "show", ":tools/security_gate.py") != source:
        raise GateError("Installer source must exactly match the staged deterministic gate")
    hooks = common / "hooks"
    hooks.mkdir(exist_ok=True)
    for hook in ["pre-commit", "commit-msg", "pre-push", "reference-transaction"]:
        path = hooks / hook
        if path.exists() and "MARK_SAFETY_SHARED_HOOK" not in path.read_text():
            raise GateError("Existing Git hook must be preserved and explicitly composed: " + hook)
    review(lambda: staged_candidate(root, "safety gate bootstrap"), private, "install")
    if git(root, "show", ":tools/security_gate.py") != source or Path(__file__).read_bytes() != source:
        raise GateError("Gate source changed during installation scan")
    shutil.copyfile(__file__, private / "gate.py")
    os.chmod(private / "gate.py", 0o700)
    for hook, command in [("pre-commit", "static"), ("commit-msg", "commit"), ("pre-push", "push")]:
        text = '#!/bin/sh\n# MARK_SAFETY_SHARED_HOOK\nset -eu\ncommon=$(git rev-parse --git-common-dir)\nexec python3 "$common/mark-safety/gate.py" ' + command + ' "$@"\n'
        (hooks / hook).write_text(text)
        os.chmod(hooks / hook, 0o700)
    (hooks / "reference-transaction").write_text(REFERENCE_TRANSACTION_HOOK)
    os.chmod(hooks / "reference-transaction", 0o700)
    git(root, "config", "core.hooksPath", str(hooks))
    print("Shared commit/push safety hooks installed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["static", "commit", "push", "review-staged", "install"])
    parser.add_argument("arguments", nargs="*")
    parser.add_argument("--message", default="explicit staged review")
    args = parser.parse_args()
    root, common, private = repository()
    if args.operation == "static":
        scan(staged_candidate(root, "early staged scan"))
    elif args.operation == "install":
        install(root, common, private)
    elif args.operation == "push":
        if not args.arguments:
            raise GateError("Push remote is required")
        updates = sys.stdin.read()
        if ref_deletions(root, args.arguments[0], updates):
            return
        review(lambda: push_candidate(root, args.arguments[0], updates), private, "push")
    else:
        message_file = Path(args.arguments[0]) if args.operation == "commit" and args.arguments else None
        if args.operation == "commit" and message_file is None:
            raise GateError("Commit message path is required")
        review(lambda: staged_candidate(root, message_file.read_text() if message_file else args.message), private, "commit")


if __name__ == "__main__":
    try:
        main()
    except (GateError, UnicodeError) as error:
        # START_BLOCK_SAFETY_SCAN_STOP
        print("[RepositorySafety][scan][BLOCK_SAFETY_SCAN_STOP]", str(error), file=sys.stderr)
        sys.exit(1)
        # END_BLOCK_SAFETY_SCAN_STOP
