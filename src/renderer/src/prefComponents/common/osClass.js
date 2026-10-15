// FILE: src/renderer/src/prefComponents/common/osClass.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Per-OS class for the Settings controls, resolved when a control mounts rather than at module import.
//   SCOPE: One pure helper reading the platform the window shim exposes.
//   DEPENDS: window.electron.process.platform (window shim).
//   LINKS: C-38 T-003; prefComponents/common/* controls.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   prefOsClass - 'pref-os-mac' on macOS, 'pref-os-win' elsewhere.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - C-38 T-003 review: util/index.js reads the window shim at import time, which made every control unimportable before the shim exists (tests, early boot); the controls resolve their OS class at mount instead.]
// END_CHANGE_SUMMARY

export const prefOsClass = () =>
  window.electron?.process?.platform === 'darwin' ? 'pref-os-mac' : 'pref-os-win'
