import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupTestPinia } from '../pinia'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({})
}))

describe('M-031 diff-mode integration', () => {
  beforeEach(() => {
    setupTestPinia()
  })

  it('preferences store has diffMode default false', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const prefs = usePreferencesStore()
    expect(prefs.diffMode).toBe(false)
  })

  it('diffMode can be toggled', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const prefs = usePreferencesStore()
    prefs.diffMode = true
    expect(prefs.diffMode).toBe(true)
    prefs.diffMode = false
    expect(prefs.diffMode).toBe(false)
  })

  it('view.diff-mode command toggles diffMode on current tab', async () => {
    const { useEditorStore } = await import('@/store/editor')
    const editor = useEditorStore()
    // Set up a current file with an id so the command can toggle its diffMode.
    editor.currentFile = { id: 'test-tab-1', diffMode: false }

    const commands = (await import('@/commands/index.js')).default
    const diffCmd = commands.find(c => c.id === 'view.diff-mode')
    expect(diffCmd).toBeDefined()

    await diffCmd.execute()
    expect(editor.currentFile.diffMode).toBe(true)

    await diffCmd.execute()
    expect(editor.currentFile.diffMode).toBe(false)
  })

  it('view.diff-mode has a description entry', async () => {
    const getDescription = (await import('@/commands/descriptions.js')).default
    const desc = getDescription('view.diff-mode')
    expect(desc).not.toBe('view.diff-mode')
  })
})
