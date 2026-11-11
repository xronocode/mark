// FILE: src/renderer/src/commands/trailingNewline.js
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

const descriptions = ['Trim all trailing newlines', 'Ensure single newline', 'Disabled']

class TrailingNewlineCommand {
  constructor(editorState) {
    this.id = 'file.trailing-newline'
    this.description = getCommandDescriptionById('file.trailing-newline')
    this.placeholder = t('commandPalette.placeholders.selectOption')
    this.subcommands = []
    this.subcommandSelectedIndex = -1

    // Reference to editor state.
    this._editorState = editorState
  }

  run = async () => {
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    const { trimTrailingNewline } = this._editorState.currentFile
    let index = trimTrailingNewline
    if (index !== 0 && index !== 1) {
      index = 2
    }

    this.subcommands = [
      {
        id: 'file.trailing-newline-trim',
        description: descriptions[0],
        value: 0
      },
      {
        id: 'file.trailing-newline-single',
        description: descriptions[1],
        value: 1
      },
      {
        id: 'file.trailing-newline-disabled',
        description: descriptions[2],
        value: 3
      }
    ]
    this.subcommands[index].description = `${descriptions[index]} - current`
    this.subcommandSelectedIndex = index
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
    bus.emit('mt::set-final-newline', value)
  }

  unload = () => {}
}

export default TrailingNewlineCommand
