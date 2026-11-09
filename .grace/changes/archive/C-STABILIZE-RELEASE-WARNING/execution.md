# Production warning evidence

MARK_BUNDLE_ID now compiles only for its injected test consumers. The configured production identity accessor, literal fixture value and default-handler assertions are unchanged.

The actual release Cargo JSON passed the unchanged warning checker:195 allowed,0 unallowlisted,0 forbidden. The targeted fake-runner default-handler command also passed. Selected final returned0errors and4inherited Python heuristic warnings. No warning suppression/allowlist edit, external handler mutation or release action occurred.

The validation environment uses rustup-managed tools so rust-objcopy receives its installed LLVM library path. An initial direct-toolchain loader failure remains separate harness evidence; it did not justify a source or warning-rule change.
