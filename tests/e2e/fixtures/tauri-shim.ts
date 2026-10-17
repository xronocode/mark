/**
 * tauri-shim.ts — Phase-6 renderer-integration test harness.
 *
 * The reborn-mark renderer uses `@tauri-apps/api` directly AND through
 * a window.electron / window.fileUtils contextBridge surface installed
 * by `_shims/install-window-globals.js`. The Tauri SDK looks up
 * `window.__TAURI_INTERNALS__.{invoke,transformCallback,...}` and will
 * throw at script-eval time if those are missing.
 *
 * `installTauriShim(page)` calls `page.addInitScript(...)` so a stub
 * `__TAURI_INTERNALS__` (plus a tiny event bus for plugin:event|listen)
 * is installed BEFORE the renderer's `<script type="module">` runs.
 *
 * Per-test handler overrides:
 *   await page.addInitScript(() => {
 *     ;(window as any).__mockInvoke = {
 *       mt_prefs_get_all: () => ({ theme: 'ink' })
 *     }
 *   })
 *
 * NOTE: This is renderer-only. No real Tauri IPC, no cross-window flow.
 * Multi-window features (theme broadcast to settings window etc.) WILL
 * NOT exercise — that's Phase-7 CI on a Linux runner with `tauri dev`.
 */

import type { Page } from '@playwright/test'

export async function installTauriShim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Per-spec override map; defaults below cover boot.
    if (!(window as any).__mockInvoke) (window as any).__mockInvoke = {}

    // Default fake handler table — return-on-call. Tests override via
    // window.__mockInvoke[cmd] = () => ...
    const defaults: Record<string, (args: any) => any> = {
      // backend prefs/keybindings — used at boot by install-window-globals
      // and bootstrap-ipc.
      mt_prefs_get_all: () => ({
        theme: 'paper',
        autoSave: false,
        autoSaveDelay: 5000,
        titleBarStyle: 'custom',
        openFilesInNewWindow: false,
        openFolderInNewWindow: false,
        hideScrollbar: false,
        sideBarVisibility: true,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false,
        searchExclusions: [],
        searchMaxFileSize: '',
        searchIncludeHidden: false,
        searchNoIgnore: false,
        searchFollowSymlinks: false,
        watcherUsePolling: false,
        spellcheckerEnabled: false,
        spellcheckerNoUnderline: false,
        spellcheckerLanguage: 'en-US',
        language: 'en',
        endOfLine: 'default',
        textDirection: 'ltr',
        codeFontSize: '14px',
        codeFontFamily: 'DejaVu Sans Mono',
        editorFontFamily: 'Open Sans',
        fontSize: 16,
        editorLineWidth: '',
        listIndentation: 1,
        frontmatterType: '-',
        followSystemTheme: false,
        lightModeTheme: 'paper',
        darkModeTheme: 'ink',
        customCss: '',
        bulletListMarker: '-',
        orderListDelimiter: '.',
        preferLooseListItem: true,
        tabSize: 4,
        lineHeight: 1.6,
        fontWeight: 'normal',
        trimUnnecessaryCodeBlockEmptyLines: false,
        sequenceTheme: 'hand'
      }),
      mt_request_keybindings_response: () => ({}),
      mt_set_user_preference: () => null,
      mt_pandoc_status: () => ({ available: false }),
      // C-38 T-007: Windows 11 Mica surface — default inactive so every
      // other spec sees today's opaque chrome; window-mica.spec.ts
      // overrides both handlers per test.
      mt_window_effects_state: () => ({ mica: false }),
      mt_window_set_mica_theme: () => ({ mica: false }),
      // C-40 T-005: native View-menu checkmark sync — default resolves
      // false (not applied: no native menu in the renderer-only harness)
      // so other specs are unaffected; view-menu-checks.spec.ts overrides
      // it to record invocations.
      mt_menu_set_checked: () => false,
      mt_fonts_list: () => [],
      mt_fs_read: () => '',
      mt_fs_write: () => null,
      mt_fs_write_binary: () => null,
      mt_fs_stat: () => ({ isFile: false, isDirectory: false }),
      mt_fs_readdir: () => [],
      mt_fs_unlink: () => null,
      // C-56 diagram/chart picture export: the native context menu
      // resolves "nothing clicked" by default (specs override to capture
      // the items payload and/or return a clicked id), the clipboard
      // image write and the dialog save no-op (specs override to capture
      // the PNG bytes / return a save path).
      'mt_window_popup_context_menu': () => null,
      'plugin:clipboard-manager|write_image': () => null,
      'plugin:dialog|save': () => null,
      // Tauri runtime built-ins
      'plugin:path|resolve_directory': () => '/tmp/mark-e2e-fake-localdata',
      'plugin:path|resolve': () => '/tmp/mark-e2e-fake-localdata',
      'plugin:event|listen': (args: any) => {
        // Return a fake listener id; handler id is the callback id stored
        // by transformCallback. Index by event name so emitFakeEvent can
        // find all subscribers for a given mt:: channel.
        const id = ++(window as any).__shimListenerId
        const event = args?.event ?? '<unknown>'
        const handlerId = args?.handler ?? null
        ;(window as any).__shimListeners.set(id, { event, handlerId })
        return id
      },
      'plugin:event|unlisten': (args: any) => {
        ;(window as any).__shimListeners.delete(args?.eventId ?? args?.event)
        return null
      },
      'plugin:event|emit': () => null,
      'plugin:event|emit_to': () => null,
      'plugin:webview|internal_on_drag_drop_event_handler': () => null
    }

    ;(window as any).__shimListenerId = 0
    ;(window as any).__shimListeners = new Map()
    ;(window as any).__shimCallbacks = new Map()
    let __callbackId = 0

    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' },
        windows: [{ label: 'main' }],
        webviews: [{ label: 'main', windowLabel: 'main' }]
      },
      transformCallback: (cb: (msg: unknown) => void, _once?: boolean) => {
        const id = ++__callbackId
        ;(window as any).__shimCallbacks.set(id, cb)
        return id
      },
      unregisterCallback: (id: number) => {
        ;(window as any).__shimCallbacks.delete(id)
      },
      convertFileSrc: (path: string, _protocol?: string) =>
        `asset://localhost/${encodeURIComponent(path)}`,
      invoke: async (cmd: string, args: unknown) => {
        const overrides = (window as any).__mockInvoke || {}
        const handler = overrides[cmd] || defaults[cmd]
        if (!handler) {
          // Unknown command — log + resolve undefined so the renderer
          // shim's "not found" branch hits and the call degrades.
          // eslint-disable-next-line no-console
          console.warn(`[tauri-shim] unhandled invoke: ${cmd}`, args)
          return undefined
        }
        try {
          const out = handler(args)
          return await Promise.resolve(out)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[tauri-shim] handler ${cmd} threw:`, e)
          throw e
        }
      }
    }

    // Helper exposed for tests: emit a fake Tauri event to all
    // matching listeners. Returns the number of listeners notified.
    ;(window as any).__emitFakeEvent = (event: string, payload: unknown) => {
      let n = 0
      for (const meta of (window as any).__shimListeners.values()) {
        if (meta.event !== event) continue
        const cb = (window as any).__shimCallbacks.get(meta.handlerId)
        if (typeof cb === 'function') {
          cb({ event, payload, id: meta.handlerId, windowLabel: 'main' })
          n++
        }
      }
      return n
    }

    // Mock dragDropEvent listener registration: the renderer shim does
    // `await webview.onDragDropEvent(...)`; that resolves through the
    // 'plugin:event|listen' fake above and returns an unlisten fn.
    // Nothing else to do — events never fire in tests.

    // Tauri's webview.getCurrentWebview().onDragDropEvent uses the
    // event listen path, which is intercepted above. The renderer's
    // top-level-await import('@tauri-apps/api/webview') resolves fine
    // because the module's getCurrentWebview() reads metadata we set.

    // eslint-disable-next-line no-console
    console.info('[tauri-shim] installed')
  })
}
