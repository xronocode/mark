// MODULE_CONTRACT
//   PURPOSE: M-013b runtime barrel. Single sanctioned import surface
//            for renderer code consuming the fs / search / watch
//            facades.
//   SCOPE:   re-exports only.
//   DEPENDS: fs.ts, watch.ts, search.ts.
//   LINKS:   docs/development-plan.xml Phase-B2 step-5;
//            docs/knowledge-graph.xml M-013b runtime.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-5: initial barrel.

export { ipcFs } from './fs'
export type { IpcFs } from './fs'

export { ipcWatch, WATCH_EVENT_CHANNEL } from './watch'
export type { IpcWatch, WatchEvent, WatchEventHandler, SubscribeOptions } from './watch'

export {
  ipcSearch,
  RipgrepDirectorySearcher,
  SEARCH_EVENT_CHANNEL
} from './search'
export type { IpcSearch, SearchHit, SearcherOptions, CancelablePromise } from './search'

export { ipcPrefs, ipcWorkspace } from './prefs'
export type { IpcPrefs, IpcWorkspace } from './prefs'

// Convenience namespace: `import { ipc } from '@/ipc/runtime'`
import { ipcFs } from './fs'
import { ipcWatch } from './watch'
import { ipcSearch } from './search'
import { ipcPrefs, ipcWorkspace } from './prefs'

export const ipc = {
  fs: ipcFs,
  watch: ipcWatch,
  search: ipcSearch,
  prefs: ipcPrefs,
  workspace: ipcWorkspace
}
