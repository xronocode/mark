# Shared Settings keyboard-focus evidence

## Behavior

The existing switch, native select and segment controls use a two-pixel preference-accent outline with a one-pixel offset for `:focus-visible`. The shared component owns each rule; Settings and Quick Settings inherit it. All three templates and script ASTs match their preceding implementation, and every other style is unchanged. Values, callbacks, disabled behavior and selected/on/nearest-preset presentation remain intact.

The matching specification and sequential plan were explicitly approved. Their bodies, assertions, scopes and tasks remain unchanged.

## Verification

- Failing-first browser regression: 8 failed in Chromium and WebKit across Paper/Ink. Thirty-six real keyboard control states lacked the requested outline and had identical before/after row images; four textbox positive controls retained their existing focus border. Eighty logical screenshots and forty state records bind the durable failing run to the original component styles.
- Focused browser regression after the three rules: 8/8 passed, including forty keyboard checkpoints, four pointer-first activation controls, actual Settings/Quick Settings consumers and the nearest-preset state. Values, row-relative geometry, selection, aria-checked and complete preference-write counts remained unchanged across focus. Keyboard routes record ordinary Tab and any WebKit Option-Tab fallback.
- Full Settings-shell regression: 30/30 passed in the existing Chromium and webkit-settings projects, including the eight focused cases and all existing Settings/export checks.
- Component suites: 26 passed, 0 failed across three existing files, retaining disabled and callback guards.
- The selected target command gate passed its unit and renderer-build commands with zero errors and five warnings: four existing Python heuristic warnings and the overlapping M-011 durable scope of the unrelated, nonexecuted C-50. Execution remains sequential; no C-50 work is included.
- Template/script equivalence and exact style comparison prove that only the three approved outline rules affect runtime rendering. Source design detection reported no findings. Focused Paper/Ink row captures were reviewed for readable, unclipped focus and preserved selected/nearest-preset states; desktop and unsupported-width context observations remain separate.
- Earlier fixture/capture failures are preserved. The final fixture awaits the controlled document's actual session/position bootstrap writes before measuring focus, retains every transport event and uses strict before/after write-count equality. No counter reset, event filtering, artificial sleep or relaxed test oracle was introduced.

## Remaining gates

Fresh final command validation passed before the owner-approved application below. Exact committed-head hosted checks and normal commit/push safety gates remain required before integration.

Native application keyboard acceptance is unverified because the native-window capture/input route was unavailable during preflight. No native task artifact was built or retained. Browser transport shims do not supply native or owner/platform verdicts. Any apply/archive decision retaining that open item must be explicit.

Owner acceptance and release authorization are pending. No version, tag, signing, dispatch or publication change is included.

## Owner-approved application with retained native acceptance

The owner approved apply/archive and main integration on 2026-11-14, explicitly retaining native keyboard and owner/platform acceptance as open items. The candidate is based on integrated main `4b68982347e2b1838787740317208221e44ac5b9`; all nine prepared files retained the reviewed candidate bytes before application. Specification and plan bodies, assertions, scopes and tasks are unchanged.

Fresh final assertions passed both commands: the 26-test component gate and the renderer build. Integrity reported zero errors, four existing heuristic warnings and the known overlap with the unrelated nonexecuted change. The source-bound 30-case Chromium/WebKit Settings matrix remains attributed to the unchanged observed implementation. No new browser or native acceptance is claimed. Earlier native select-outline observations remain partial; switch/segment native keyboard routing is still unproven.

The complete three-file bundle is applied and archived. Exact committed-head hosted checks and ordinary commit/push safety gates remain mandatory before integration. Owner/platform acceptance, release, versions, tags, signing and publication remain separate.
