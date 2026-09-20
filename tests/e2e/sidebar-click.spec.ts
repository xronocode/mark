import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

test.describe('sidebar tree click', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_walk_project = () => {}
      ;(window as any).__mockInvoke.mt_watch_subscribe = () => 'fake-sub-id'
      ;(window as any).__mockInvoke.mt_watch_unsubscribe = () => {}
    })
  })

  test('clicking a folder toggles its collapsed state', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })

    // Add a project root via the store, then inject tree data
    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const app = el?.__vue_app__
      const pinia = app?.config?.globalProperties?.$pinia
      if (pinia) {
        const projectState = pinia.state.value.project
        projectState.projectTrees.push({
          pathname: '/tmp/mark-e2e',
          name: 'mark-e2e',
          isDirectory: true,
          isFile: false,
          isMarkdown: false,
          folders: [],
          files: []
        })
      }
    })

    await page.waitForTimeout(300)

    // Inject tree data via update-object-tree events
    await page.evaluate(() => {
      const w = window as any
      w.__emitFakeEvent('mt::update-object-tree', {
        type: 'addDir',
        change: { pathname: '/tmp/mark-e2e/subdir', name: 'subdir' }
      })
      w.__emitFakeEvent('mt::update-object-tree', {
        type: 'add',
        change: {
          pathname: '/tmp/mark-e2e/subdir/test.md',
          name: 'test.md',
          isFile: true, isDirectory: false, isMarkdown: true,
          birthTime: Date.now()
        }
      })
      w.__emitFakeEvent('mt::update-object-tree', {
        type: 'add',
        change: {
          pathname: '/tmp/mark-e2e/hello.md',
          name: 'hello.md',
          isFile: true, isDirectory: false, isMarkdown: true,
          birthTime: Date.now()
        }
      })
    })

    await page.waitForTimeout(500)

    // Check folder "subdir" visible
    const folderName = page.locator('.side-bar-folder .folder-name span').first()
    await expect(folderName).toContainText('subdir', { timeout: 5000 })

    // Folder should be collapsed initially (isCollapsed=true from treeCtrl.js)
    const folderContents = page.locator('.side-bar-folder .folder-contents').first()
    await expect(folderContents).not.toBeVisible()

    // Click the folder to expand it
    await folderName.click()
    await page.waitForTimeout(300)

    // After click, folder should be expanded
    await expect(folderContents).toBeVisible({ timeout: 3000 })

    // File inside should be visible
    const innerFile = page.locator('.side-bar-folder .folder-contents .side-bar-file')
    await expect(innerFile).toContainText('test.md', { timeout: 3000 })

    // Click folder again to collapse
    await folderName.click()
    await page.waitForTimeout(300)
    await expect(folderContents).not.toBeVisible()
  })
})
