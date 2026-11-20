/**
 * clipboard-capture.spec.ts — C-CLIPBOARD-CAPTURE-SINGLE-SOURCE file:// gate.
 *
 * Loads the REAL committed tools/clipboard-capture/index.html straight from
 * disk (no preview server, no baseURL) so the page boots exactly like a
 * downloaded repo ZIP: classic scripts, committed capture-core.browser.js
 * before app.js. Chromium project only; no Playwright/CI config change.
 *
 * Security boundaries of this automated run:
 *  - every http(s) request is aborted (deny-and-record); the page loads and
 *    captures with the network hard-denied;
 *  - navigator.clipboard.writeText and window.open are replaced by inert
 *    in-page recorders via addInitScript — no system clipboard, no owner
 *    files, no live GitHub request, no real navigation, no application
 *    state outside the file:// origin's own localStorage key;
 *  - the JSON download is saved only into the OS temporary directory and
 *    removed again;
 *  - this headless macOS run does NOT claim the non-macOS Chrome/Edge
 *    manual open-from-disk/export acceptance — that stays a distinct item.
 */

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PAGE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/clipboard-capture/index.html')

const MARKDOWN_BODY = '# Title\r\n\r\n- item'
const MARKDOWN_LF = '# Title\n\n- item'
const HTML_BODY = '<p>Rendered <strong>rich</strong> body</p>'
const PLAIN_BODY = 'Title plain'
const SOURCE_LABEL = 'e2e-fixture'

const BROWSER_KEYS = [
  'buildCaptureRecord',
  'buildHistoryEnvelope',
  'createExportFilename',
  'buildIssuePacket',
  'buildIssueUrl'
]

test('file:// capture page boots from the committed core, captures a synthetic paste and hands off inertly', async ({ page }) => {
  const denied: string[] = []
  await page.route('http://**', (route) => {
    denied.push(route.request().url())
    return route.abort()
  })
  await page.route('https://**', (route) => {
    denied.push(route.request().url())
    return route.abort()
  })

  await page.addInitScript(() => {
    const win = window as any
    win.__e2eClipboard = []
    win.__e2ePopups = []
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          win.__e2eClipboard.push(String(text))
          return Promise.resolve(true)
        }
      },
      configurable: true
    })
    win.open = (url?: string | URL) => {
      win.__e2ePopups.push(String(url ?? ''))
      return null
    }
  })

  const fileUrl = pathToFileURL(PAGE_PATH).href
  await page.goto(fileUrl)

  // Boot boundary: the committed generated core defines exactly the five
  // public keys in the former order before app.js runs.
  const bootKeys = await page.evaluate(() => Object.keys((window as any).ClipboardCaptureCore))
  expect(bootKeys).toEqual(BROWSER_KEYS)

  await page.fill('#sourceLabel', SOURCE_LABEL)

  await page.evaluate(
    ({ markdown, html, plain }) => {
      const dt = new DataTransfer()
      dt.setData('text/markdown', markdown)
      dt.setData('text/html', html)
      dt.setData('text/plain', plain)
      document.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      )
    },
    { markdown: MARKDOWN_BODY, html: HTML_BODY, plain: PLAIN_BODY }
  )

  await expect(page.locator('#status')).toContainText('Captured')
  await expect(page.locator('#summary')).toContainText(`Source: ${SOURCE_LABEL}`)
  await expect(page.locator('#textPayload')).toHaveValue(MARKDOWN_LF)
  await expect(page.locator('#renderedMeta')).toHaveText('Rendered from text/html | 42 chars')
  await expect(page.locator('#htmlPreview')).toBeVisible()

  // Download handoff: intercepted via the Playwright download event and
  // saved only into the OS temporary directory.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#downloadCapture')
  ])
  expect(download.suggestedFilename()).toMatch(/^clipboard-e2e-fixture-\d{8}-\d{6}\.json$/)
  const downloadTarget = path.join(os.tmpdir(), download.suggestedFilename())
  await download.saveAs(downloadTarget)
  try {
    const saved = JSON.parse(fs.readFileSync(downloadTarget, 'utf8'))
    expect(saved.schemaVersion).toBe('clipboard-fixture-capture/v1')
    expect(saved.sourceLabel).toBe(SOURCE_LABEL)
    expect(saved.payloads.text['text/markdown'].value).toBe(MARKDOWN_LF)
  } finally {
    fs.rmSync(downloadTarget, { force: true })
  }

  // Copy handoff: the fixture packet surfaces from the inert clipboard buffer.
  await page.click('#copyPacket')
  await expect(page.locator('#status')).toContainText('Fixture packet copied to clipboard.')
  const copiedPacket = await page.evaluate(() => (window as any).__e2eClipboard[0])
  expect(copiedPacket).toContain('# Clipboard fixture packet')
  expect(copiedPacket).toContain('## Full fixture JSON')
  expect(copiedPacket).toContain('"sourceLabel": "e2e-fixture"')

  // GitHub handoff: recorded no-op popup with the decoded human-first
  // template; the page URL stays on the file:// page.
  await page.fill('#githubRepo', 'xronocode/mark')
  await page.click('#createIssue')
  await expect(page.locator('#status')).toContainText('Opened GitHub issue for xronocode/mark')
  const popupUrl = await page.evaluate(() => (window as any).__e2ePopups[0])
  expect(popupUrl.startsWith('https://github.com/xronocode/mark/issues/new?')).toBe(true)
  const decoded = decodeURIComponent(popupUrl)
  expect(decoded).toContain('Smart paste fixture: E2e Fixture')
  expect(decoded).toContain('## What broke')
  expect(decoded).toContain('The full fixture packet was copied to the clipboard')
  expect(page.url()).toBe(fileUrl)

  // Deny-and-record boundary: any request the page attempted was an http(s)
  // request that got aborted, and the capture above still ran fully offline.
  for (const url of denied) {
    expect(url.startsWith('http://') || url.startsWith('https://')).toBe(true)
  }
})
