// FILE: src/renderer/src/commands/fileEncoding.js
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
import { ENCODING_NAME_MAP, getEncodingCapability } from 'common/encoding'
import { delay } from '@/util'
import bus from '../bus'
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'

class FileEncodingCommand {
  constructor(editorState) {
    this.id = 'file.change-encoding'
    this.description = getCommandDescriptionById('file.change-encoding')
    this.placeholder = t('commandPalette.placeholders.selectOption')

    this.subcommands = []
    this.subcommandSelectedIndex = -1

    // Reference to editor state.
    this._editorState = editorState
  }

  run = async () => {
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    this.subcommands = []
    this.subcommandSelectedIndex = -1
    const current = this._getCurrentEncoding()
    for (const [encoding, label] of Object.entries(ENCODING_NAME_MAP)) {
      const codec = getEncodingCapability(encoding)
      const unicode = ['utf8','utf16le','utf16be'].includes(encoding)
      for (const isBom of unicode ? [false,true] : [false]) {
        const selected = codec.supported && current.encoding === encoding && !!current.isBom === isBom
        const suffix = unicode ? ` ${t(isBom ? 'fileFormat.withBom' : 'fileFormat.withoutBom')}` : ''
        const explanation = codec.supported ? '' : ` — ${t(codec.unavailableReason)}`
        const item = { id:encoding + (isBom ? '-bom' : ''),
          description:`${label}${suffix}${explanation}${selected ? ` - ${t('fileFormat.current')}` : ''}`,
          disabled:!codec.supported,
          ...(codec.supported ? { value:{encoding,isBom} } : {}) }
        if (selected) this.subcommands.unshift(item)
        else this.subcommands.push(item)
      }
    }
    this.subcommandSelectedIndex = this.subcommands.findIndex(item => !item.disabled && item.value.encoding === current.encoding && item.value.isBom === !!current.isBom)
  }

  execute = async () => {
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    await delay(100)
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    bus.emit('show-command-palette', this)
  }

  executeSubcommand = async id => {
    if (!this._editorState.CAN_CHANGE_DOCUMENT_FORMAT()) return false
    const isBom = id.endsWith('-bom'); const encoding = isBom ? id.slice(0,-4) : id
    const codec = getEncodingCapability(encoding)
    if (!codec?.supported || (isBom && !['utf8','utf16le','utf16be'].includes(encoding))) {
      this._editorState._notifyFormatError(codec ? 'MT_ENC_UNSUPPORTED' : 'MT_ENC_UNKNOWN')
      return false
    }
    bus.emit('mt::set-file-encoding', { encoding,isBom })
  }

  unload = () => {
    this.subcommands = []
  }

  _getCurrentEncoding = () => {
    const { _editorState } = this
    const { currentFile } = _editorState
    if (currentFile) {
      return currentFile.encoding
    }
    return {}
  }
}

export default FileEncodingCommand
