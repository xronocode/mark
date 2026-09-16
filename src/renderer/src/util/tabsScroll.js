// FILE: src/renderer/src/util/tabsScroll.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure geometry helpers that keep the active editor tab inside the visible window of the scrolling tab strip.
//   SCOPE: computing the minimal scrollLeft that reveals a tab; no DOM access, no state.
//   DEPENDS: none
//   LINKS: M-011 (mt-renderer), V-M-011 scenario-24, .grace/changes/active/C-6
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   computeActiveTabScroll - minimal scrollLeft that fully reveals the active tab, or null when it is already visible
// END_MODULE_MAP

// START_CONTRACT: computeActiveTabScroll
//   PURPOSE: Compute the minimal tab-strip scrollLeft that brings the active tab fully inside the visible window.
//   INPUTS: { activeLeft: number - tab offsetLeft within the strip content,
//             activeWidth: number - tab offsetWidth,
//             scrollLeft: number - current strip scrollLeft,
//             viewportWidth: number - strip clientWidth }
//   OUTPUTS: { number|null - target scrollLeft (clamped at 0), or null when the tab is already fully visible }
//   SIDE_EFFECTS: none
//   LINKS: editorWithTabs/tabs.vue scrollActiveTabIntoView
// END_CONTRACT: computeActiveTabScroll
export const computeActiveTabScroll = ({
  activeLeft,
  activeWidth,
  scrollLeft,
  viewportWidth
}) => {
  const activeRight = activeLeft + activeWidth
  if (activeWidth >= viewportWidth) {
    // Tab at least as wide as the viewport: left-align it (label origin).
    // Checked before the clip branches so repeated triggers are idempotent —
    // right-aligning here would oscillate between the two clip branches.
    return Math.max(0, activeLeft)
  }
  if (activeLeft < scrollLeft) {
    // Tab is clipped on the left: align its left edge with the viewport.
    return Math.max(0, activeLeft)
  }
  if (activeRight > scrollLeft + viewportWidth) {
    // Tab is clipped on the right: align its right edge with the viewport.
    return Math.max(0, activeRight - viewportWidth)
  }
  return null
}
