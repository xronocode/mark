// FILE: tools/clipboard-capture/app.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Drive the standalone clipboard fixture capture UI so users can paste once, inspect the rendered/text result, and export or report the current fixture.
//   SCOPE: DOM event handling, single-capture state, rendered preview, preferred text preview, JSON export, and GitHub issue handoff.
//   DEPENDS: tools/clipboard-capture/capture-core.browser.js, browser DOM APIs, optional localStorage.
//   LINKS: M-044, V-M-044
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   initApp - Wires the DOM and bootstraps the single-capture UI.
//   handlePasteCapture - Converts one paste event into the current capture record.
//   render - Renders status, summary, rendered preview, and preferred text preview.
// END_MODULE_MAP

const REPO_STORAGE_KEY = 'mark.clipboard.fixture.capture.github-repo.v1'

const state = {
  capture: null
}

// START_CONTRACT: initApp
//   PURPOSE: Initialize DOM references, wire event handlers, and render the empty single-capture state.
//   INPUTS: none
//   OUTPUTS: { void }
//   SIDE_EFFECTS: Attaches DOM listeners and may read localStorage.
//   LINKS: M-044, V-M-044
// END_CONTRACT: initApp
function initApp() {
  const dom = getDom()
  const core = getCoreApi()

  if (!core) {
    renderStatus(
      dom.status,
      'Clipboard core did not load. Re-open the page from disk or use Chrome/Edge.'
    )
    syncToolbar(dom)
    return
  }

  dom.githubRepo.value = loadRepoSlug()

  document.addEventListener('paste', (event) => handleDocumentPaste(event, dom), true)
  dom.pasteZone.addEventListener('click', () => dom.pasteZone.focus())
  dom.downloadCapture.addEventListener('click', () => downloadCapture())
  dom.copyPacket.addEventListener('click', () => copyFixturePacket(dom))
  dom.createIssue.addEventListener('click', () => createGitHubIssue(dom))
  dom.githubRepo.addEventListener('change', () => persistRepoSlug(dom.githubRepo.value))
  dom.githubRepo.addEventListener('blur', () => persistRepoSlug(dom.githubRepo.value))

  dom.pasteZone.focus()
  render(dom, 'Ready. Focus the capture zone and paste.')
}

function getDom() {
  return {
    sourceLabel: document.querySelector('#sourceLabel'),
    githubRepo: document.querySelector('#githubRepo'),
    pasteZone: document.querySelector('#pasteZone'),
    downloadCapture: document.querySelector('#downloadCapture'),
    copyPacket: document.querySelector('#copyPacket'),
    createIssue: document.querySelector('#createIssue'),
    status: document.querySelector('#status'),
    summary: document.querySelector('#summary'),
    renderedMeta: document.querySelector('#renderedMeta'),
    htmlPreview: document.querySelector('#htmlPreview'),
    renderFallback: document.querySelector('#renderFallback'),
    textMeta: document.querySelector('#textMeta'),
    textPayload: document.querySelector('#textPayload')
  }
}

// START_CONTRACT: handlePasteCapture
//   PURPOSE: Build one capture record from a browser paste event and replace the current UI state with it.
//   INPUTS: { event: ClipboardEvent - Browser paste event, dom: object - Cached DOM references }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: Prevents default paste rendering and updates DOM state.
//   LINKS: M-044, V-M-044
// END_CONTRACT: handlePasteCapture
function handleDocumentPaste(event, dom) {
  if (!shouldCapturePaste(event)) {
    return
  }

  handlePasteCapture(event, dom)
}

function handlePasteCapture(event, dom) {
  event.preventDefault()
  const core = getCoreApi()

  if (!event.clipboardData || !core) {
    render(dom, 'Paste event had no clipboardData. Try Chrome or Edge.')
    return
  }

  state.capture = core.buildCaptureRecord({
    dataTransfer: event.clipboardData,
    sourceLabel: dom.sourceLabel.value
  })

  const types = state.capture.clipboard.advertisedTypes.join(', ') || 'no advertised types'
  dom.pasteZone.focus()
  render(dom, `Captured ${types}.`)
}

function render(dom, statusMessage) {
  renderStatus(dom.status, statusMessage)
  renderSummary(dom.summary)
  renderRenderedPreview(dom)
  renderTextPayload(dom)
  syncToolbar(dom)
}

function renderStatus(container, message) {
  container.textContent = message
}

function renderSummary(container) {
  const record = state.capture
  if (!record) {
    container.textContent =
      'Paste a rendered answer, README fragment, or docs block to inspect the browser-visible clipboard payload.'
    return
  }

  const preferred = getPreferredTextPayload(record)
  const types = record.clipboard.advertisedTypes.join(', ') || 'none'
  container.textContent =
    `Source: ${record.sourceLabel || 'unlabeled'}; types: ${types}; ` +
    `preferred text: ${preferred?.type || 'none'}; files: ${record.clipboard.fileCount}.`
}

function renderRenderedPreview(dom) {
  const record = state.capture

  if (!record) {
    dom.renderedMeta.textContent = 'No capture yet.'
    dom.htmlPreview.srcdoc = ''
    dom.htmlPreview.classList.add('is-hidden')
    dom.renderFallback.classList.remove('is-hidden')
    dom.renderFallback.textContent =
      'Rendered preview will appear here after paste. HTML payloads render in a sandboxed iframe.'
    return
  }

  const htmlPayload = record.payloads.text['text/html']
  if (htmlPayload?.value) {
    dom.renderedMeta.textContent = `Rendered from text/html | ${htmlPayload.length} chars`
    dom.htmlPreview.srcdoc = buildRenderedPreviewDoc(htmlPayload.value)
    dom.htmlPreview.classList.remove('is-hidden')
    dom.renderFallback.classList.add('is-hidden')
    dom.renderFallback.textContent = ''
    return
  }

  const preferred = getPreferredTextPayload(record)
  dom.renderedMeta.textContent = preferred
    ? `Fallback preview from ${preferred.type}`
    : 'No renderable preview available.'
  dom.htmlPreview.srcdoc = ''
  dom.htmlPreview.classList.add('is-hidden')
  dom.renderFallback.classList.remove('is-hidden')
  dom.renderFallback.textContent = preferred?.payload.value || 'No HTML or text payload was exposed by this browser.'
}

function renderTextPayload(dom) {
  const record = state.capture

  if (!record) {
    dom.textMeta.textContent = 'No capture yet.'
    dom.textPayload.value = ''
    return
  }

  const preferred = getPreferredTextPayload(record)
  if (!preferred) {
    dom.textMeta.textContent = 'No text payloads were exposed by this browser.'
    dom.textPayload.value = ''
    return
  }

  dom.textMeta.textContent =
    `${preferred.type} | ${preferred.payload.length} chars | ${preferred.payload.lineCount} lines`
  dom.textPayload.value = preferred.payload.value
}

function syncToolbar(dom) {
  const hasCapture = Boolean(state.capture)
  dom.downloadCapture.disabled = !hasCapture
  dom.copyPacket.disabled = !hasCapture
  dom.createIssue.disabled = !hasCapture
}

function downloadCapture() {
  const record = state.capture
  if (!record) return
  downloadJson(getCoreApi().createExportFilename(record, 'single'), record)
}

async function copyFixturePacket(dom) {
  const record = state.capture
  if (!record) return

  const packet = getCoreApi().buildIssuePacket(record)
  const copied = await copyText(packet)
  render(
    dom,
    copied ? 'Fixture packet copied to clipboard.' : 'Could not copy the fixture packet automatically.'
  )
}

async function createGitHubIssue(dom) {
  const record = state.capture
  if (!record) return

  const repo = String(dom.githubRepo.value || '').trim()
  if (!isValidRepoSlug(repo)) {
    render(dom, 'GitHub repo must look like owner/repo.')
    dom.githubRepo.focus()
    return
  }

  persistRepoSlug(repo)

  const packet = getCoreApi().buildIssuePacket(record)
  const copied = await copyText(packet)
  const issueUrl = getCoreApi().buildIssueUrl({
    repo,
    record,
    copiedFullPacket: copied
  })

  window.open(issueUrl, '_blank', 'noopener')
  render(
    dom,
    copied
      ? `Opened GitHub issue for ${repo}; fixture packet copied to clipboard.`
      : `Opened GitHub issue for ${repo}; download JSON if you need to attach the raw fixture manually.`
  )
}

function getPreferredTextPayload(record) {
  const textPayloads = record?.payloads?.text || {}
  const preferredTypes = ['text/markdown', 'text/x-markdown', 'text/plain', 'text/html']

  for (const type of preferredTypes) {
    if (textPayloads[type]) {
      return { type, payload: textPayloads[type] }
    }
  }

  return null
}

function buildRenderedPreviewDoc(html) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<base target="_blank" />',
    '<style>',
    'html,body{margin:0;padding:0;background:#fff9ee;color:#2a2218;font:16px/1.55 Georgia,serif;}',
    'body{padding:18px;}',
    'img,svg,video,canvas,table,pre{max-width:100%;}',
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;}',
    'code,pre{font-family:SFMono-Regular,Consolas,monospace;}',
    'blockquote{margin:0;padding-left:14px;border-left:3px solid rgba(22,96,93,0.28);color:#665948;}',
    '</style>',
    '</head>',
    '<body>',
    html,
    '</body>',
    '</html>'
  ].join('')
}

function shouldCapturePaste(event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return true
  }

  if (target.id === 'sourceLabel' || target.id === 'githubRepo') {
    return false
  }

  return true
}

function downloadJson(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function loadRepoSlug() {
  try {
    return localStorage.getItem(REPO_STORAGE_KEY) || 'xronocode/mark'
  } catch {
    return 'xronocode/mark'
  }
}

function persistRepoSlug(value) {
  try {
    localStorage.setItem(REPO_STORAGE_KEY, String(value || '').trim() || 'xronocode/mark')
  } catch {
    // Optional only.
  }
}

function getCoreApi() {
  return globalThis.ClipboardCaptureCore || null
}

function isValidRepoSlug(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value || '').trim())
}

async function copyText(value) {
  const text = String(value || '')

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to legacy copy path.
  }

  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', 'readonly')
  area.style.position = 'fixed'
  area.style.top = '-9999px'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  area.setSelectionRange(0, area.value.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

initApp()
