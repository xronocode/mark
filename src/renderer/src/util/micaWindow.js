// FILE: src/renderer/src/util/micaWindow.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-38 T-007 N4 e — bridge the Windows 11 Mica window effect
//            into the renderer: query mt_window_effects_state at boot,
//            install the mica-active root class the title-bar
//            transparency CSS keys on, and re-tint the material
//            (mt_window_set_mica_theme) whenever the app theme changes.
//   SCOPE: One module-level active flag and three entry points. The
//          only DOM write is the root classList; every Tauri invoke is
//          a dynamic import read lazily (never at module scope).
//   DEPENDS: @tauri-apps/api/core (dynamic import), document.documentElement.
//   LINKS: .grace/graph/runtime.xml M-058 (m058_window_effects.rs);
//          pages/app.vue (boot + theme watch); assets/styles/index.css
//          (.mica-active section); tests/renderer/chrome/mica-window.test.js;
//          tests/e2e/window-mica.spec.ts.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MICA_ROOT_CLASS - the class installed on the document root when Mica is live ('mica-active').
//   isMicaActive - current module flag (true only after a confirmed mica:true state).
//   installMicaWindowEffect - ask mt_window_effects_state; add/remove the root class to match; returns whether Mica is active.
//   syncMicaTheme - re-tint via mt_window_set_mica_theme (no-op unless active); retires the class if the backend answers mica:false.
//   deactivateMicaWindowEffect - drop the flag and the root class (sync failure path; test isolation).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-38 T-007 N4 e: initial module.
//   Without a confirmed mica:true nothing changes anywhere — no class,
//   no invokes on theme changes — so macOS, Linux and Windows 10 keep
//   byte-for-byte today's opaque chrome.
// END_CHANGE_SUMMARY

export const MICA_ROOT_CLASS = 'mica-active'

const micaState = { active: false }

export const isMicaActive = () => micaState.active

const micaRootElement = (root) =>
  root || (typeof document !== 'undefined' ? document.documentElement : null)

// START_BLOCK_DEACTIVATE_MICA
// Drop the flag and strip the root class. Production use: the re-tint
// command answered mica:false (effect lost — Windows 10 fallback or a
// failed set_effects), and a transparent title-bar strip without the
// material behind it would show garbage, so the opaque CSS must come
// back. Also used by tests to reset the module between cases.
export const deactivateMicaWindowEffect = (root) => {
  micaState.active = false
  const target = micaRootElement(root)
  if (target && typeof target.classList !== 'undefined') {
    target.classList.remove(MICA_ROOT_CLASS)
  }
}
// END_BLOCK_DEACTIVATE_MICA

// START_BLOCK_INSTALL_MICA
// Boot entry (pages/app.vue). Asks the backend whether the Mica effect
// is live; only a confirmed { mica: true } installs the root class that
// the index.css transparency rules key on. A rejection, a missing
// command or any other shape resolves to inactive — never an error out
// of this function, boot must not depend on it.
export const installMicaWindowEffect = async (root) => {
  let mica = false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const state = await invoke('mt_window_effects_state')
    mica = state?.mica === true
  } catch (e) {
    mica = false
    console.warn('[micaWindow][install][BLOCK_MICA_STATE_FAILED]', e)
  }
  if (mica) {
    micaState.active = true
    const target = micaRootElement(root)
    if (target && typeof target.classList !== 'undefined') {
      target.classList.add(MICA_ROOT_CLASS)
    }
    console.debug('[micaWindow][install][BLOCK_MICA_ACTIVE] active=true')
  } else {
    deactivateMicaWindowEffect(root)
  }
  return mica
}
// END_BLOCK_INSTALL_MICA

// START_BLOCK_SYNC_MICA_THEME
// Theme entry (pages/app.vue watch on the app theme). Re-tints the
// material to the app theme (Paper/Ink — not just the OS appearance).
// No-op unless the effect was confirmed active at boot; if the backend
// answers mica:false the class is retired so the strip goes opaque
// again. A rejected invoke keeps the current state (transient failure —
// better one stale tint than a flashing title bar).
export const syncMicaTheme = async (dark) => {
  if (!micaState.active) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke('mt_window_set_mica_theme', { dark: dark === true })
    if (result?.mica !== true) {
      deactivateMicaWindowEffect()
      console.warn('[micaWindow][sync][BLOCK_MICA_RETIRED] mica=false')
      return false
    }
    console.debug('[micaWindow][sync][BLOCK_MICA_THEME_SYNCED] dark=' + (dark === true))
    return true
  } catch (e) {
    console.warn('[micaWindow][sync][BLOCK_MICA_THEME_SYNC_FAILED]', e)
    return false
  }
}
// END_BLOCK_SYNC_MICA_THEME
