// FILE: src/renderer/src/store/treeFilter.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure view-model filter for the sidebar folder tree (C-51 T-001) — by default only Markdown files are shown and folders with no Markdown anywhere below are hidden; treeShowAllFiles restores everything.
//   SCOPE: Three pure predicates/lists over the treeCtrl model shape ({ files: [{isMarkdown}], folders: [...] }); no state, no IPC, no DOM.
//   DEPENDS: none (operates on plain tree model objects passed in).
//   LINKS: components/sideBar/{tree.vue,treeFolder.vue,treeFile.vue}; store/preferences.js treeShowAllFiles; .grace/changes/active/C-51 T-001; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   folderHasMarkdownBelow - recursive predicate: true when the folder (or any descendant folder) holds at least one Markdown file.
//   visibleFiles - files of one folder level for display: all of them when showAllFiles, otherwise only Markdown ones.
//   visibleFolders - sub-folders of one level for display: all when showAllFiles, otherwise only those with Markdown anywhere below.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-001: initial module. Filtering
//   lives in the renderer view model (not the Rust walk): the model keeps
//   every file/dir from both the initial walk and the watcher, so the
//   treeShowAllFiles preference applies live without re-walking and both
//   event paths enforce one rule here.
// END_CHANGE_SUMMARY

// START_BLOCK_HAS_MARKDOWN_BELOW
// A folder is worth showing in the Markdown-only view when a Markdown file
// exists anywhere inside it — directly or in any descendant folder. The
// recursion mirrors treeCtrl's model (folders/files arrays on every node),
// so a folder that gains its first Markdown file deep below appears, and
// one that loses its last one disappears, purely from model mutations.
export const folderHasMarkdownBelow = (folder) => {
  if (!folder) return false
  if (Array.isArray(folder.files) && folder.files.some((f) => f && f.isMarkdown)) {
    return true
  }
  if (Array.isArray(folder.folders) && folder.folders.length > 0) {
    return folder.folders.some(folderHasMarkdownBelow)
  }
  return false
}
// END_BLOCK_HAS_MARKDOWN_BELOW

// START_BLOCK_VISIBLE_LISTS
// Per-level display lists. showAllFiles=true is exactly the pre-C-51
// behaviour (every file incl. non-Markdown, every directory).
export const visibleFiles = (files, showAllFiles) => {
  if (!Array.isArray(files)) return []
  if (showAllFiles) return files
  return files.filter((f) => f && f.isMarkdown)
}

export const visibleFolders = (folders, showAllFiles) => {
  if (!Array.isArray(folders)) return []
  if (showAllFiles) return folders
  return folders.filter(folderHasMarkdownBelow)
}
// END_BLOCK_VISIBLE_LISTS
