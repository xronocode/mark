// FILE: src/renderer/src/util/clipboardOpen.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-52 clipboard-open orchestrator — read the system
//            clipboard (m059 mt_read_clipboard_paths, webview text
//            fallback), resolve it through util/clipboardPath.js and
//            route: folder → projectStore.OPEN_FOLDER_AS_WORKSPACE
//            (replace, the Open Folder store path; App Store build →
//            the native Open Folder panel pre-pointed at the folder),
//            Markdown file → a tab like a drop, nothing usable → a
//            localized notification. Shared by the File › Open from
//            Clipboard command (⌥⌘V) and the welcome-screen ⌘V.
//   SCOPE: one entry point (openFromClipboard); classification and the
//            tab-open emit live in util/clipboardPath.js. The document
//            editor's paste path never calls into this module (D-3).
//   DEPENDS: util/clipboardPath (resolver), i18n (t), dynamic imports of
//            @tauri-apps/api/core, @tauri-apps/api/path,
//            @/services/notification, @/store/project,
//            @/store/preferences (lazy — no Pinia at import time).
//   LINKS: .grace/changes/archive/C-52/spec.xml R-1/R-2/R-5;
//            commands/index.js file.open-from-clipboard;
//            components/recent/index.vue START_BLOCK_PASTE_OPEN.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   openFromClipboard - read + resolve + route the clipboard (folder workspace / markdown tab / notification).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 C-52 T-001: initial module.
//   - 2026-10-17 C-52 gate fix: the resolver call passes
//     { filePaths: clip.paths, text: clip.text } — resolveClipboardTarget
//     reads `filePaths`, so spreading m059's `{ paths, text }` shape
//     dropped every pasteboard file path (Finder ⌘C never resolved).
// END_CHANGE_SUMMARY

import { resolveClipboardTarget, openMarkdownFileTab } from './clipboardPath'
import { t } from '../i18n'

// START_BLOCK_READ_CLIPBOARD
// m059's native read carries pasteboard file URLs (Finder ⌘C) AND the
// text. When the command is unavailable (older backend, shimmed tests),
// fall back to the webview clipboard text — the text resolver still
// covers the `pwd | pbcopy` flow.
const readClipboard = async () => {
  let clip = { paths: [], text: '' }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke('mt_read_clipboard_paths')
    if (raw && typeof raw === 'object') {
      clip = {
        paths: Array.isArray(raw.paths) ? raw.paths : [],
        text: typeof raw.text === 'string' ? raw.text : ''
      }
    }
  } catch (e) {
    console.warn('[ClipboardOpen][readClipboard][BLOCK_CLIPBOARD_COMMAND_FAILED]', e)
  }
  if (!clip.text) {
    try {
      const webviewText = await window.electron?.clipboard?.readText?.()
      if (typeof webviewText === 'string') clip.text = webviewText
    } catch {
      // clipboard read denied — nothing usable, the resolver reports it
    }
  }
  return clip
}
// END_BLOCK_READ_CLIPBOARD

// START_BLOCK_OPEN_FROM_CLIPBOARD
// R-1/R-2/R-5 routing. Every branch is best-effort: a failed open logs
// its marker and resolves — the notification service owns user-visible
// errors, and the caller (menu command / ⌘V handler) never rethrows.
export const openFromClipboard = async () => {
  const clip = await readClipboard()

  let homeDir = ''
  try {
    const { homeDir: getHomeDir } = await import('@tauri-apps/api/path')
    homeDir = (await getHomeDir()) || ''
  } catch {
    // no home dir → ~ paths simply don't resolve
  }

  // resolveClipboardTarget takes `filePaths`; m059 answers `paths`
  // (gate fix 2026-10-17: passing the m059 shape straight through
  // silently DROPPED the pasteboard file list, so a Finder ⌘C always
  // fell through to the text resolver / the nothing-found notification).
  const target = await resolveClipboardTarget(
    { filePaths: clip.paths, text: clip.text },
    { homeDir }
  )
  if (!target) {
    console.info('[ClipboardOpen][openFromClipboard][BLOCK_CLIPBOARD_NOTHING_FOUND]')
    const notice = (await import('@/services/notification')).default
    notice.notify({
      title: t('clipboardOpen.nothingFoundTitle'),
      message: t('clipboardOpen.nothingFoundMessage'),
      type: 'info',
      time: 6000
    })
    return
  }

  if (target.kind === 'folder') {
    const { useProjectStore } = await import('@/store/project')
    const { usePreferencesStore } = await import('@/store/preferences')
    const mode = usePreferencesStore()?.buildCapabilities?.mode
    if (mode === 'app-store') {
      // R-5: a path from the clipboard grants no sandbox access — only
      // the Open Folder panel (or a drop) does. Pre-point the panel at
      // the resolved folder so confirming is one click; a cancelled
      // panel is a silent no-op, exactly like Open Folder.
      let picked = null
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        picked = await invoke('mt_pick_folder', { defaultPath: target.path })
      } catch (e) {
        console.error('[ClipboardOpen][openFromClipboard][BLOCK_PICK_FOLDER_FAILED]', e)
        return
      }
      if (picked) {
        await useProjectStore().OPEN_FOLDER(picked, { mode: 'ask', origin: 'clipboard' })
      }
      return
    }
    // C-MULTI-SOURCE-WORKSPACE: ambiguous input — the shared Add-or-
    // Replace chooser decides (Add preselected).
    await useProjectStore().OPEN_FOLDER(target.path, { mode: 'ask', origin: 'clipboard' })
    return
  }

  // Markdown file → a tab, exactly like a drop.
  await openMarkdownFileTab(target.path)
}
// END_BLOCK_OPEN_FROM_CLIPBOARD
