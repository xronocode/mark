// FILE: src/renderer/src/commands/headingSearch.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Go-to-Heading palette command (C-19) — fuzzy-search the active document's headings and jump via scroll-to-header slugs.
//   SCOPE: Palette command object only (search/execute/executeSubcommand/unload); no UI of its own.
//   DEPENDS: bus, i18n, descriptions map; rootState.editor.listToc.
//   LINKS: .grace/changes/active/C-19; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 scenario-31.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - HeadingSearchCommand: filters listToc into palette items; Enter emits scroll-to-header with the heading slug.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-23 v1.0.0: C-19 — heading symbol search over the active document (Cmd+T, VS Code workspace-symbol binding).
// END_CHANGE_SUMMARY

import bus from '../bus'
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'
import { delay } from '@/util'

// Case-insensitive subsequence fuzzy match: every query char appears in
// order (the quick-open file search convention, minus path splitting).
const fuzzyMatch = (query, text) => {
  if (!query) return true
  const q = query.toLowerCase()
  const s = text.toLowerCase()
  let i = 0
  for (const ch of s) {
    if (ch === q[i]) i += 1
    if (i === q.length) return true
  }
  return false
}

class HeadingSearchCommand {
  constructor(rootState) {
    this.id = 'edit.go-to-heading'
    this.description = getCommandDescriptionById('edit.go-to-heading')
    this.placeholder = t('commandPalette.placeholders.searchHeading')
    this.shortcut = null

    this.subcommands = []
    this.subcommandSelectedIndex = -1

    this._editorState = rootState.editor
  }

  search = async (query) => {
    // listToc is the ACTIVE document's heading list (document order).
    const headings = this._editorState.listToc || []
    return headings
      .filter(({ content }) => fuzzyMatch(query, content || ''))
      .map(({ slug, content, lvl }) => ({
        id: slug,
        // Non-breaking spaces — HTML collapses ASCII runs to one space.
        description: `${'\u00A0'.repeat(Math.max(0, (lvl || 1) - 1) * 2)}${content}`,
        title: content
      }))
  }

  // Sibling contract (quickOpen/fileEncoding): run() prepares state and
  // never emits; execute() re-shows the palette after a tick so the
  // opening palette can close first. Emitting from run() recurses
  // synchronously through the palette's handleShow → run.
  run = async () => {
    this.subcommands = await this.search('')
  }

  execute = async () => {
    await delay(100)
    bus.emit('show-command-palette', this)
  }

  executeSubcommand = async (slug) => {
    if (slug) bus.emit('scroll-to-header', slug)
  }

  unload = () => {
    this.subcommands = []
  }
}

export default HeadingSearchCommand
