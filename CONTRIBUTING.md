# Contributing to Mark

Thanks for helping. Bug reports, ideas and pull requests are all welcome. For anything larger than a small fix, open an issue first so we can agree on the approach before you write the code.

## Language and public artifacts

English is the working language for committed code, comments, tests,
documentation, change records, commit messages and pull requests. Product
localizations, localization fixtures, transliteration data, frozen GRACE 3 XML
and archived change bundles are deliberate exceptions; do not translate them as
cleanup. Never commit credentials, personal absolute paths, captured profiles,
private infrastructure details or workstation/session output.

Pull-request descriptions, release notes and README "What's new" sections
follow the [public artifact format](docs/public-artifacts-format.md): user-facing
changes first, verification stated as numbered facts, explicit release status,
and text a newcomer can read without the backstory.

## Build

Requirements: Node.js 22, stable Rust (via [rustup](https://rustup.rs)), and on macOS the Xcode command line tools. On Linux, the Tauri system packages listed in [`.github/workflows/test.yml`](.github/workflows/test.yml) (WebKitGTK 4.1 and friends).

```sh
git clone https://github.com/xronocode/mark.git && cd mark
npm ci
npm run tauri dev       # run the app with hot reload
npm run tauri build     # build a release bundle
```

Other useful scripts from `package.json`:

| Script | What it does |
|:---|:---|
| `npm run dev` | Vite dev server for the renderer, without the Rust backend |
| `npm run build` | Build the renderer |
| `npm run docs:dev` | Run the documentation site locally |
| `npm run bench:launch` | Measure launch time |

## Tests

```sh
npm test                                   # renderer unit tests (Vitest)
npm run test:coverage                      # the same, with the coverage gate CI uses
cd src-tauri && cargo test --bin mark      # Rust backend tests
npm run build && npm run test:e2e          # end-to-end tests (Playwright, Chromium)
```

Renderer tests live in `tests/renderer/`, end-to-end tests in `tests/e2e/`, Rust tests next to the code in `src-tauri/src/`. CI runs the unit suites on macOS, Windows and Linux. Coverage thresholds only go up: if a change drops coverage, add tests rather than lowering the threshold.

## How the code is organised (GRACE)

Mark is developed with GRACE, a set of conventions that keeps a large codebase navigable. Every module has a contract at the top of the file (`START_MODULE_CONTRACT` with its purpose, scope and dependencies) and a `MODULE_MAP` of what it exports. Longer functions are split into named `START_BLOCK_…` / `END_BLOCK_…` sections, and important log lines carry the block name, so a log message leads straight to the code that wrote it.

The project's current state is described in `.grace/`: `context/` holds requirements and technology choices, `graph/` the module graph, `verification/` which tests cover which module, and `changes/` the approved change specs and plans. When you change what a module does, update its contract and the matching graph and verification entries. Check `current` before editing, run the active change's `target` assertions during implementation, then run `final --run-commands` before archiving and rerun `current` afterwards. The [Engineering protocol](docs/engineering-protocol.md) contains the complete commands, contract, markup and verification rules. For a small bug fix you rarely need more than to keep the existing markers intact and add a line to the file's `CHANGE_SUMMARY`.

Before committing or pushing, follow the [deterministic safety protocol](docs/commit-push-safety.md). Acceptance and release are separate states; the [release-train protocol](docs/release-trains/README.md) is authoritative for both.

## Pull requests

- Keep them small and focused: one fix or one feature per pull request.
- Add or update tests for the behaviour you change, and run the test suites above before you push.
- Explain what changed, why, and how you tested it. Add screenshots for anything visible.
- Do not bump the version or edit release files; releases are cut by the maintainer.
- Features that only work outside the App Store sandbox (running other programs, opening a local server) must stay hidden in the App Store build. See `src-tauri/src/m048_build_mode.rs`.

By contributing you agree that your work is released under the [MIT License](LICENSE).
