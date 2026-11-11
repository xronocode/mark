// FILE: src/renderer/src/commands/lineEnding.js
// START_MODULE_CONTRACT
//   PURPOSE: Present and dispatch the existing file-format choice palette.
//   SCOPE: Refuse active composition before focus/delay/dispatch; store owns mutation.
//   DEPENDS: editor format guard, bus, i18n and command descriptions.
//   LINKS: M-009/M-011/M-014; C-METADATA-SAVE-SAFETY T-002.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   default - guarded format palette command and dispatch.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11: composition-first format choices and explicit byte policy.
// END_CHANGE_SUMMARY
import { delay } from '@/util'
import bus from '../bus'
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'

const crlfDescription = 'Carriage return and line feed (CRLF)'
const lfDescription = 'Line feed (LF)'

class LineEndingCommand {
  constructor(editorState) {
    this.id = 'file.line-ending'
    this.description = getCommandDescriptionById('file.line-ending')
    this.placeholder = t('commandPalette.placeholders.selectOption')

    this.subcommands = [
      {
        id: 'file.line-ending-crlf',
        description: crlfDescription,
        value: 'crlf'
      },
      {
        id: 'file.line-ending-lf',
        description: lfDescription,
        value: 'lf'
      }
    ]
    this.subcommandSelectedIndex = -1

    // Reference to editor state.
    this._editorState = editorState
  }

  run = async () => {
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    const lineEnding = this._editorState.currentFile.isMixedLineEndings ? 'mixed' : this._editorState.currentFile.lineEnding
    this.subcommandSelectedIndex = lineEnding === 'crlf' ? 0 : lineEnding === 'lf' ? 1 : -1
    this.subcommands[0].description = crlfDescription + (this.subcommandSelectedIndex === 0 ? ' - current' : '')
    this.subcommands[1].description = lfDescription + (this.subcommandSelectedIndex === 1 ? ' - current' : '')
  }

  execute = async () => {
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    // Timeout to hide the command palette and then show again to prevent issues.
    await delay(100)
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    bus.emit('show-command-palette', this)
  }

  executeSubcommand = async (_, value) => {
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    bus.emit('mt::set-line-ending', value)
  }

  unload = () => {}
}

export default LineEndingCommand
