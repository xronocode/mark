// FILE: src/muya/lib/eventHandler/resize.js
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Re-align table viewports and code-block line-number gutters when editor dimensions or fonts change.
//   SCOPE: Instance-scoped throttled window/container resize and font completion listeners; table refresh always runs, gutter refresh follows codeBlockLineNumbers; destroy detaches every listener.
//   DEPENDS: muya utils throttle; contentState.resizeLineNumber(forceAll); tableResize.refreshTableSurfaces.
//   LINKS: .grace/graph/runtime.xml M-012 fn-resizeSurfaces; .grace/verification/runtime.xml V-M-012 scenario-20 and scenario-69; C-38 T-005; C-71.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - Resize class: refresh table viewports and optional gutters on container/window/font changes; destroy detaches listeners and observer.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.1.0 - 2026-10-19 C-71: table layout refresh also runs
//   with line numbers disabled; font loading completion and container
//   resize keep centered tables aligned without Markdown edits.
//   v2.0.0 - 2026-10-15 C-38 T-005 (#1648): listener active again.
//   The handler checks the option at fire time (not construction time) so
//   setOptions can toggle line numbers live, throttles to one re-measure per
//   300 ms, queries only this muya container (the upstream
//   document.querySelectorAll measured every editor's code blocks), and
//   destroy() removes the window listener and disconnects the observer.
//   v1.0.0 - upstream muya; disabled due to #1648.
// END_CHANGE_SUMMARY

import { throttle } from '../utils'

const RESIZE_THROTTLE_MS = 300

class Resize {
  constructor(muya) {
    this.muya = muya
    this.destroyed = false
    this.listener = null
    this.observer = null
    this.listen()
  }

  // START_BLOCK_RESIZE_LISTEN
  listen() {
    this.listener = throttle(() => {
      if (this.destroyed) return
      this.muya.tableResize?.refreshTableSurfaces()
      // Width changes re-wrap code lines, so measured gutter heights go
      // stale; non-wrapping code re-checks cheaply (white-space is read
      // per block and natural heights are kept).
      if (this.muya.options.codeBlockLineNumbers) this.muya.contentState.resizeLineNumber(true)
    }, RESIZE_THROTTLE_MS)

    window.addEventListener('resize', this.listener)
    // Sidebar toggles and split-view drags resize the editor without a
    // window resize event — observe the container itself when available.
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.listener)
      this.observer.observe(this.muya.container)
    }
    // A late web-font swap re-wraps code without resizing anything; the
    // measured heights go stale the moment the real font lands.
    if (document.fonts && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(() => {
        this.listener?.()
      })
    }
    document.fonts?.addEventListener?.('loadingdone', this.listener)
  }
  // END_BLOCK_RESIZE_LISTEN

  destroy() {
    this.destroyed = true
    if (this.listener) {
      document.fonts?.removeEventListener?.('loadingdone', this.listener)
      window.removeEventListener('resize', this.listener)
      this.listener = null
    }
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }
}

export default Resize
