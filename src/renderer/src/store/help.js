// START_MODULE_CONTRACT
//   PURPOSE: Define canonical per-document state and state-construction helpers.
//   SCOPE: Defaults and cloning/option extraction for editor tabs.
//   DEPENDS: renderer util and i18n helpers.
//   LINKS: src/renderer/src/store/editor.js (tab lifecycle); tests/renderer/store/help.test.ts
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   defaultFileState - default per-document state object
//   createDocumentState - build a document state from defaults + overrides
//   getOptionsFromState - extract editor options from a document state
//   getFileStateFromData - document state from a loaded markdown document
//   getBlankFileState - untitled tab state with the next Untitled-N name
//   getSingleFileState - state for a single opened file
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-10-15 C-40 - getBlankFileState counts only real
//   "Untitled-N" names; a titled pathless tab (the Mark Guide) produced
//   "Untitled-NaN" for the next new tab.
// END_CHANGE_SUMMARY

import { getUniqueId, deepClone } from '../util'
import { i18n } from '../i18n'

/**
 * Default internel markdown document with editor options.
 *
 * @type {IDocumentState} Internel markdown document
 */
export const defaultFileState = {
  // Monotonic renderer revision used to reject stale async save/reload outcomes.
  contentRevision: 0,
  // Indicates whether there are unsaved changes.
  isSaved: true,
  // Full path to the file or empty. If the value is empty the file doesn't exist on disk.
  pathname: '',
  filename: 'Untitled-1',
  markdown: '',
  encoding: {
    encoding: 'utf8',
    isBom: false
  },
  lineEnding: 'lf', // lf or crlf
  trimTrailingNewline: 3,
  adjustLineEndingOnSave: false, // convert editor buffer (LF) to CRLF when saving
  history: {
    stack: [],
    index: -1
  },
  cursor: null,
  wordCount: {
    paragraph: 0,
    word: 0,
    character: 0,
    all: 0
  },
  searchMatches: {
    index: -1,
    matches: [],
    value: ''
  },
  // Per-tab diff mode (M-031)
  diffMode: false,
  // C-29: per-tab Split View (session only; ratio and side are preferences)
  splitView: false,
  // Per tab notifications
  notifications: []
}

export const getOptionsFromState = (file) => {
  const { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline } = file
  return { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline }
}

export const getFileStateFromData = (data) => {
  const fileState = JSON.parse(JSON.stringify(defaultFileState))
  const {
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline
  } = data
  const id = getUniqueId()

  return Object.assign(fileState, {
    id,
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline
  })
}

export const getBlankFileState = (
  tabs,
  defaultEncoding = 'utf8',
  lineEnding = 'lf',
  markdown = ''
) => {
  const fileState = deepClone(defaultFileState)
  // C-40: untitled tabs are no longer all named "Untitled-N" (the Mark
  // Guide tab carries a real title), so only filenames that actually match
  // the pattern contribute a counter — anything else used to produce
  // "Untitled-NaN" via +undefined.
  let untitleId = Math.max(
    ...tabs.map((f) => {
      if (f.pathname === '') {
        const m = /^Untitled-(\d+)/.exec(f.filename || '')
        return m ? +m[1] : 0
      }
      return 0
    }),
    0
  )

  const id = getUniqueId()

  // We may pass markdown=null as parameter.
  if (markdown == null) {
    markdown = ''
  }

  fileState.encoding.encoding = defaultEncoding
  return Object.assign(fileState, {
    lineEnding,
    adjustLineEndingOnSave: lineEnding.toLowerCase() === 'crlf',
    id,
    filename: `Untitled-${++untitleId}`,
    markdown,
    lastSavedHistoryId: -1
  })
}

export const getSingleFileState = ({
  id = getUniqueId(),
  markdown,
  filename,
  pathname,
  options
}) => {
  // TODO(refactor:renderer/editor): Replace this function with `createDocumentState`.

  const fileState = deepClone(defaultFileState)
  const { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline } = options

  return Object.assign(fileState, {
    id,
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline,
    lastSavedHistoryId: -1
  })
}

/**
 * Creates a internal document from the given document.
 *
 * @param {IMarkdownDocument} markdownDocument Markdown document
 * @param {String} [id] Random identifier
 * @returns {IDocumentState} Returns a document state
 */
export const createDocumentState = (markdownDocument, id = getUniqueId()) => {
  const docState = deepClone(defaultFileState)
  const {
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    adjustLineEndingOnSave,
    trimTrailingNewline,
    cursor = null
  } = markdownDocument

  return Object.assign(docState, {
    id,
    markdown,
    filename,
    pathname,
    encoding,
    lineEnding,
    cursor,
    adjustLineEndingOnSave,
    trimTrailingNewline,
    lastSavedHistoryId: -1
  })
}
