// FILE: src/renderer/src/util/pathDisplay.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Shorten long folder paths for narrow UI (sidebar recent folders, C-46 welcome rows) while keeping the parts people recognise: the start (~, root or drive) and the last segments; split display paths into name + parent on both POSIX and Windows separators.
//   SCOPE: Pure string helpers; no DOM, no IPC.
//   DEPENDS: none.
//   LINKS: src/renderer/src/components/sideBar/tree.vue (recent folders); src/renderer/src/components/recent/index.vue (C-46 welcome rows).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   shortenMiddle - keeps the first segment and the last two segments of a path and replaces the middle with "…" when it is longer than maxLength ("/" or "\" separated).
//   pathBasename - last segment of a "/" or "\" separated path.
//   pathDirname - parent of a "/" or "\" separated path ("/" and "C:\" roots kept).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-46 review: Windows paths — the welcome
//     screen split names on "/" only, so C:\Users\x\doc.md showed the whole
//     path as the name; pathBasename/pathDirname accept both separators and
//     shortenMiddle keeps the path's own separator.
//   v1.0.0 - 2026-10-15: recent folders in the sidebar ran past the panel edge with long paths; middle ellipsis keeps start and end readable.
// END_CHANGE_SUMMARY

// Windows paths use "\" (a drive path may mix in "/"); POSIX paths "/".
const separatorOf = (path) => (path.includes('\\') ? '\\' : '/')
const lastSeparatorIndex = (path) => Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))

// START_CONTRACT: shortenMiddle
//   PURPOSE: Shorten a "/"- or "\"-separated path in the middle.
//   INPUTS: { path: string, maxLength: number - target length in characters (default 36) }
//   OUTPUTS: { string - the path unchanged when short enough, else "<first>/…/<second-to-last>/<last>" (or "<first>/…/<last>" if still too long), joined with the path's own separator }
//   SIDE_EFFECTS: none
// END_CONTRACT: shortenMiddle
export const shortenMiddle = (path, maxLength = 36) => {
  if (!path || path.length <= maxLength) return path || ''
  const sep = separatorOf(path)
  const parts = path.split(/[\\/]/)
  if (parts.length <= 3) return path
  const head = parts[0] === '' ? sep + parts[1] : parts[0]
  const restStart = parts[0] === '' ? 2 : 1
  const tail2 = parts.slice(-2).join(sep)
  if (parts.length - restStart > 2) {
    const two = `${head}${sep}…${sep}${tail2}`
    if (two.length <= maxLength) return two
  }
  return `${head}${sep}…${sep}${parts[parts.length - 1]}`
}

// START_CONTRACT: pathBasename
//   PURPOSE: Last segment of a path, whichever separator it uses.
//   INPUTS: { path: string }
//   OUTPUTS: { string - the segment after the last "/" or "\" ('' for empty input; the input itself when it ends with a separator) }
//   SIDE_EFFECTS: none
// END_CONTRACT: pathBasename
export const pathBasename = (path) => {
  if (!path) return ''
  return path.substring(lastSeparatorIndex(path) + 1) || path
}

// START_CONTRACT: pathDirname
//   PURPOSE: Parent directory of a path, whichever separator it uses.
//   INPUTS: { path: string }
//   OUTPUTS: { string - everything before the last separator; "/" for a POSIX root child, "C:\" for a drive-root child, '' when there is no separator }
//   SIDE_EFFECTS: none
// END_CONTRACT: pathDirname
export const pathDirname = (path) => {
  if (!path) return ''
  const idx = lastSeparatorIndex(path)
  if (idx < 0) return ''
  if (idx === 0) return path[0]
  if (idx === 2 && /^[A-Za-z]:$/.test(path.substring(0, 2))) return path.substring(0, 3)
  return path.substring(0, idx)
}
