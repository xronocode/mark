// FILE: src/renderer/src/util/pathDisplay.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Shorten long folder paths for narrow UI (sidebar recent folders) while keeping the parts people recognise: the start (~ or root) and the last segments.
//   SCOPE: Pure string helpers; no DOM, no IPC.
//   DEPENDS: none.
//   LINKS: src/renderer/src/components/sideBar/tree.vue (recent folders).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   shortenMiddle - keeps the first segment and the last two segments of a path and replaces the middle with "…" when it is longer than maxLength.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15: recent folders in the sidebar ran past the panel edge with long paths; middle ellipsis keeps start and end readable.
// END_CHANGE_SUMMARY

// START_CONTRACT: shortenMiddle
//   PURPOSE: Shorten a "/"-separated path in the middle.
//   INPUTS: { path: string, maxLength: number - target length in characters (default 36) }
//   OUTPUTS: { string - the path unchanged when short enough, else "<first>/…/<second-to-last>/<last>" (or "<first>/…/<last>" if still too long) }
//   SIDE_EFFECTS: none
// END_CONTRACT: shortenMiddle
export const shortenMiddle = (path, maxLength = 36) => {
  if (!path || path.length <= maxLength) return path || ''
  const parts = path.split('/')
  if (parts.length <= 3) return path
  const head = parts[0] === '' ? '/' + parts[1] : parts[0]
  const restStart = parts[0] === '' ? 2 : 1
  const tail2 = parts.slice(-2).join('/')
  if (parts.length - restStart > 2) {
    const two = `${head}/…/${tail2}`
    if (two.length <= maxLength) return two
  }
  return `${head}/…/${parts[parts.length - 1]}`
}
