# Quick Look preview content boundary

## What's new

- Raw HTML is displayed as readable text in Markdown previews.
- Document content cannot navigate away from the preview or load remote images and embedded websites.

## Under the hood

- Markdown is embedded as UTF-8 base64 data. Only packaged scripts and the trusted bootstrap receive the per-render script nonce.
- Raw HTML is disabled. Packaged styles and markdown-it's generated inline table-alignment styles remain supported; script evaluation and remote resource sources are restricted independently.
- The actual native provider uses ephemeral storage, disables automatic windows and refuses document navigation/new windows. The selected-file sandbox remains; the network-client entitlement is removed.
- The required test aggregate depends on the native preview job. Executed shell regressions reject failed, cancelled or empty job results, including the documentation-only branch.

## Evidence

1. tests: 61 passed, 0 failed (runner and aggregate/governance regressions), on Linux, macOS and Windows; no skips in these two suites.
2. tests: 24 passed, 0 failed (actual native provider), with 0 independently observed network requests, locally and in the hosted native job.
3. tests: 5798 passed, 0 failed (416 renderer suites, macOS); 5794 passed, 0 failed on Linux and Windows. Existing platform-dependent skips: 2 on macOS, 6 on Linux/Windows; 3 existing todos on each host. Coverage gates passed.
4. e2e: 811 passed, 0 failed (494 Chromium plus 317 WebKit); 8 existing Chromium skips. All five browser commands passed.
5. build: green (unsigned explicit preview-extension target, with isolated product/intermediate roots). The hosted build selected exactly one dependency-free extension target and contained no host product or LaunchServices registration step.
6. grace lint: 0 findings in scope (final mode with both leaf commands). Four unchanged Python heuristic warnings are outside this change's scope.
7. safety gate: gitleaks clean, deterministic checks pass (both implementation commits and pushes).

The failing-first actual provider run recorded harmless JavaScript execution for raw event-handler, SVG, iframe and fetch/beacon cases, plus 8 requests to the owned loopback observer. Ordinary Markdown, highlighting, Unicode and the embedded raster image worked before repair. Relative and absolute file images loaded zero times on the baseline; this change adds no directory access or filesystem transport.

The repaired native matrix uses the actual provider, rendering sources and unchanged packaged resources. It runs the separately identified fixture binary directly, with activation prohibited. It does not install the fixture or replace the installed owner extension.

| Native case | Verified outcome |
| --- | --- |
| markdown | Heading, table and generated right alignment retained |
| highlight | Packaged syntax highlighting retained |
| unicode-title | Unicode content and escaped filename title retained |
| embedded-raster | Embedded PNG decoded and displayed |
| raw-event-handler | Readable escaped HTML; no execution |
| raw-script | Readable escaped HTML; no active raw element |
| script-terminator | Closing-script sequence remains data |
| mixed-case-terminator | Mixed-case closing sequence remains data |
| svg-handler | Readable escaped HTML; no execution |
| iframe-srcdoc | Readable escaped HTML; no execution |
| object-embed | Readable escaped HTML; no resource request |
| form | Readable escaped HTML; no submission/navigation |
| javascript-link | Dangerous link is absent |
| data-svg | SVG data image is absent |
| remote-image | No resource request |
| fetch-beacon | No execution or request |
| external-navigation | Activated link cannot replace the preview |
| new-window | Automatic windows disabled; native delegates installed; no extra window/request |
| subframe | Independently inserted frame cannot request remote content |
| initial-load | Native initial load succeeds with ephemeral configuration |
| missing-file | Completion returns a read error |
| resource-integrity | Packaged styles and both rendering libraries are present |
| file-resource-policy | Relative and absolute file images remain blocked |
| repeat-preview | Reused provider shows only the new document |

Runner regressions cover malformed/incomplete/duplicate/failed native results, unsupported hosts, missing resources/compiler/binary, nonzero processes, source/resource drift, observer failure, requests/errors during post-native integrity collection, stalled startup and post-native reads, and owned descendants retaining pipes after their direct parent exits. A real owned-process probe confirmed that the last case terminates with the existing deadline; injected process tests establish orchestration only.

All four live required contexts passed on the implementation head: status check, ordinary governance, readiness and docs-security. The complete native/browser/unit/backend matrix, unsigned application QA build and all five CodeQL analyses passed. The implementation PR merged as `ab1f0c00c02365d1c13aa1098300dd678d2b145b`; its complete tree matches the checked implementation head. The fresh final gate also passed again before the apply/archive request, including both declared leaf commands.

Fresh owner-apply validation on the unchanged checked head passed the full final gate: 61 focused tests and all 24 actual native cases, with zero requests. The final gate reported zero errors and four unchanged out-of-scope warnings. The native fixture binary SHA-256 was `17626b6f388efccbe19bd5a844672ab163e14d7edc096bc5e0ee81f6112a77d8`. Owner apply/archive confirmation is recorded separately from installed-extension acceptance.

## Release status

Applied and archived after explicit owner confirmation on 2026-11-12. Owner acceptance of the installed extension remains pending. Train membership and its testing protocol are recorded separately in the collecting ledger; this lifecycle action authorizes no version, production signing, installation, tag, dispatch or publication.

## References

- Change: C-QUICKLOOK-CONTENT-BOUNDARY; ownership: M-073/V-M-073 and M-046/V-M-046.
- [Specification](spec.xml), [plan](plan.xml).
- [Implementation PR #225](https://github.com/xronocode/mark/pull/225), head `4800c3020d219de7ab0fcad80439b6461a7a8da0`, reviewed tree `7dbda2c8f6e9c861962a050428374d38788e689a`.
- [Hosted native job](https://github.com/xronocode/mark/actions/runs/43088711667/job/130759838430), [required test workflow](https://github.com/xronocode/mark/actions/runs/43088711667), [ordinary governance](https://github.com/xronocode/mark/actions/runs/43088711565).
- Fixture identifier: `com.xronocode.mark.quicklook.fixture`; binary SHA-256: `17626b6f388efccbe19bd5a844672ab163e14d7edc096bc5e0ee81f6112a77d8`. All nine recorded source/resource SHA-256 values match the implementation head; the fresh pre-apply fixture records that exact implementation revision.
- Native command: `node tools/check-quicklook.mjs`; focused command: `npx --no-install vitest run tests/renderer/quicklook-runner.test.js tests/renderer/release-github-controls.test.js --maxWorkers=2`.
- Verified build: `xcodebuild -project mark-quicklook/MarkQuickLook.xcodeproj -target MarkPreview -configuration Debug SYMROOT="$PWD/.claude/quicklook-content-boundary/target-build/products" OBJROOT="$PWD/.claude/quicklook-content-boundary/target-build/intermediates" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= REGISTER_APP_WITH_LAUNCH_SERVICES=NO SKIP_INSTALL=YES build`.
