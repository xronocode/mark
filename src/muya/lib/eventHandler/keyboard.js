// FILE: src/muya/lib/eventHandler/keyboard.js
// VERSION: 1.6.0
// START_MODULE_CONTRACT
//   PURPOSE: Route Muya keyboard events to editing commands, including layout-independent undo and redo.
//   SCOPE: Composition tracking, editor state dispatch, keydown/keyup/input routing, floating-tool keyboard handling, native Shift+Up/Down selection with the passive format toolbar, direct Muya history shortcuts, and leaving keys alone (keydown AND keyup) when expand/appearance buttons hold focus (C-62).
//   DEPENDS: Muya event center/content state, selection helpers, editor config, emoji UI.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenarios 10 and 70; .grace/changes/active/C-51 T-006 and T-010 (BLOCK_KEYBOARD_EXPAND_BUTTON).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - Keyboard class; preserves native button keys and vertical selection while routing active-picker navigation.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.6.0 - 2026-10-19: keep native Shift+Up/Down and host selection updates working while the passive format toolbar is visible.
//   PREV: v1.5.0 - 2026-10-18 C-62: extend native-button keyboard isolation to the diagram appearance control.
//   PREV: v1.4.0 - 2026-10-16 C-51 T-010: the expand-button key
//   guard now covers KEYUP too (isExpandButtonEvent, shared with keydown).
//   The keyup selection machinery must not run from a button-focused
//   state: getCursorRange's needFix branch calls setCursorRange →
//   Selection.addRange inside the contenteditable, and both Chromium and
//   WebKit focus an editing host when a selection is set inside it —
//   Chromium fires no focus events while doing so and often lands the
//   move a frame later, so the viewer's close() restore and the Tab walk
//   over needing buttons (table button included) silently lost the
//   button focus to the editor container. The cursor-diff branch could
//   also partialRender, replacing the figure and detaching the focused
//   button.
//   v1.3.0 - 2026-10-16 C-51 T-006: the container keydown
//   handler returns early when the focus is on button.ag-block-expand —
//   the persistent expand button is a focusable island inside the
//   contenteditable container, and Tab (move focus) / Enter / Space
//   (click) must reach the button instead of indenting the paragraph or
//   inserting a newline (arrowHandler would also crash on its null
//   paragraph lookup from the non-editable button).
//   v1.2.0 - C-20: add ag-link-path-picker to the shownFloat keydown gate so Enter/Tab/arrows feed the link-path autocomplete float instead of the document.
//   v1.1.0 - Match undo/redo by physical KeyZ so Cmd+Я on a Russian layout reaches Muya history.
// END_CHANGE_SUMMARY

import { EVENT_KEYS, KEYS_TO_IGNORE } from '../config'
import selection from '../selection'
import { findNearestParagraph } from '../selection/dom'
import { getParagraphReference, getImageInfo } from '../utils'
import { checkEditEmoji } from '../ui/emojis'

// START_BLOCK_KEYBOARD_EXPAND_BUTTON
// C-51 T-006 (keydown) + T-010 (keyup): the persistent expand button
// lives inside the contenteditable container. When it holds focus the
// keys belong to the button — Tab moves focus, Enter/Space click — so
// the container key handlers must not run (tabHandler would indent,
// enterHandler would split a block, arrowHandler would crash on its
// paragraph lookup). Since T-010 the keyup handler needs the same guard:
// its selection repair (getCursorRange needFix → setCursorRange →
// Selection.addRange inside the contenteditable) makes the browser move
// focus into the editing host itself — silently in Chromium — which
// stole the focus back from the button after the viewer's Esc close and
// mid Tab-walk over the needing blocks' buttons.
const isExpandButtonEvent = (event) =>
  !!(
    event &&
    event.target &&
    event.target.closest &&
    event.target.closest('button.ag-block-expand, button.ag-diagram-appearance')
  )
// END_BLOCK_KEYBOARD_EXPAND_BUTTON

// START_BLOCK_NATIVE_VERTICAL_SELECTION
// The format toolbar follows a text selection; it has no arrow-key menu.
// Let the browser extend that selection, while actual autocomplete pickers
// retain their existing navigation keys even if the toolbar is also shown.
const isNativeVerticalSelection = (event, shownFloat) =>
  event.shiftKey &&
  (event.key === EVENT_KEYS.ArrowUp || event.key === EVENT_KEYS.ArrowDown) &&
  Object.keys(shownFloat).every(name => name === 'ag-format-picker')
// END_BLOCK_NATIVE_VERTICAL_SELECTION

class Keyboard {
  constructor(muya) {
    this.muya = muya
    this.isComposed = false
    this.shownFloat = {}
    this.recordIsComposed()
    this.dispatchEditorState()
    this.keydownBinding()
    this.keyupBinding()
    this.inputBinding()
    this.listen()
  }

  listen() {
    // cache shown float box
    this.muya.eventCenter.subscribe('muya-float', (tool, status) => {
      // We should use tool.name here instead as Vue3's reactivity since objects are stored as Proxy objects
      // This can cause reference issues if we use the original implementation of comparing via references.

      if (status) this.shownFloat[tool.name] = tool
      else delete this.shownFloat[tool.name]

      if (tool.name === 'ag-front-menu' && !status) {
        const seletedParagraph = this.muya.container.querySelector('.ag-selected')
        if (seletedParagraph) {
          this.muya.contentState.selectedBlock = null
          // prevent rerender, so change the class manually.
          seletedParagraph.classList.toggle('ag-selected')
        }
      }
    })
  }

  hideAllFloatTools() {
    for (const tool in this.shownFloat) {
      this.shownFloat[tool].hide()
    }
  }

  recordIsComposed() {
    const { container, eventCenter, contentState } = this.muya
    const handler = (event) => {
      if (event.type === 'compositionstart') {
        this.isComposed = true
      } else if (event.type === 'compositionend') {
        this.isComposed = false
        // Because the compose event will not cause `input` event, So need call `inputHandler` by ourself
        contentState.inputHandler(event)
        eventCenter.dispatch('stateChange')
      }
    }

    eventCenter.attachDOMEvent(container, 'compositionend', handler)
    // eventCenter.attachDOMEvent(container, 'compositionupdate', handler)
    eventCenter.attachDOMEvent(container, 'compositionstart', handler)
  }

  dispatchEditorState() {
    const { container, eventCenter } = this.muya

    let timer = null
    const changeHandler = (event) => {
      if (
        event.type === 'keyup' &&
        (event.key === EVENT_KEYS.ArrowUp || event.key === EVENT_KEYS.ArrowDown) &&
        Object.keys(this.shownFloat).length > 0 &&
        !isNativeVerticalSelection(event, this.shownFloat)
      ) {
        return
      }
      // Cursor outside editor area or over not editable elements.
      if (event.target.closest('[contenteditable=false]')) {
        return
      }

      // Ignore the event if it doesnt cause an edit in the editor (e.g control keys etc.)
      if (event.key in KEYS_TO_IGNORE) {
        return
      }

      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const cursor = selection.getCursorRange()
        if (!cursor.start || !cursor.end) {
          return
        }

        this.muya.dispatchSelectionChange(cursor)
        this.muya.dispatchSelectionFormats(cursor)
        if (!this.isComposed && event.type === 'click') {
          this.muya.dispatchChange()
        }
      })
    }

    eventCenter.attachDOMEvent(container, 'click', changeHandler)
    eventCenter.attachDOMEvent(container, 'keyup', changeHandler)
  }

  keydownBinding() {
    const { container, eventCenter, contentState } = this.muya
    const docHandler = (event) => {
      switch (event.code) {
        case EVENT_KEYS.Enter:
          return contentState.docEnterHandler(event)
        case EVENT_KEYS.Space: {
          if (contentState.selectedImage) {
            const { token } = contentState.selectedImage
            const { src } = getImageInfo(token.src || token.attrs.src)
            if (src) {
              eventCenter.dispatch('preview-image', {
                data: src
              })
            }
          }
          break
        }
        case EVENT_KEYS.Backspace: {
          return contentState.docBackspaceHandler(event)
        }
        case EVENT_KEYS.Delete: {
          return contentState.docDeleteHandler(event)
        }
        case EVENT_KEYS.ArrowUp: // fallthrough
        case EVENT_KEYS.ArrowDown: // fallthrough
        case EVENT_KEYS.ArrowLeft: // fallthrough
        case EVENT_KEYS.ArrowRight: // fallthrough
          return contentState.docArrowHandler(event)
      }
    }

    const handler = (event) => {
      // C-51 T-006 (BLOCK_KEYBOARD_EXPAND_BUTTON, keydown use): when the
      // expand button holds focus the keys belong to it — Tab moves focus,
      // Enter/Space click — so the document handlers must not run
      // (tabHandler would indent, enterHandler would split a block,
      // arrowHandler would crash on its paragraph lookup).
      if (isExpandButtonEvent(event)) {
        return
      }

      if (event.metaKey || event.ctrlKey) {
        container.classList.add('ag-meta-or-ctrl')

        // START_BLOCK_KEYBOARD_UNDO_REDO
        const isUndoKey = event.code === 'KeyZ' || event.key === 'z' || event.key === 'Z'
        if (isUndoKey) {
          event.preventDefault()
          if (event.shiftKey) {
            this.muya.redo()
          } else {
            this.muya.undo()
          }
          return
        }
        // END_BLOCK_KEYBOARD_UNDO_REDO
      }

      if (
        Object.keys(this.shownFloat).length > 0 &&
        !isNativeVerticalSelection(event, this.shownFloat) &&
        (event.key === EVENT_KEYS.Enter ||
          event.key === EVENT_KEYS.Escape ||
          event.key === EVENT_KEYS.Tab ||
          event.key === EVENT_KEYS.ArrowUp ||
          event.key === EVENT_KEYS.ArrowDown)
      ) {
        let needPreventDefault = false

        for (const tool in this.shownFloat) {
          if (
            tool === 'ag-format-picker' ||
            tool === 'ag-table-picker' ||
            tool === 'ag-quick-insert' ||
            tool === 'ag-emoji-picker' ||
            tool === 'ag-front-menu' ||
            tool === 'ag-list-picker' ||
            tool === 'ag-link-path-picker' ||
            tool === 'ag-image-selector'
          ) {
            needPreventDefault = true
            break
          }
        }
        if (needPreventDefault) {
          event.preventDefault()
        }
        // event.stopPropagation()
        return
      }
      switch (event.key) {
        case EVENT_KEYS.Backspace:
          contentState.backspaceHandler(event)
          break
        case EVENT_KEYS.Delete:
          contentState.deleteHandler(event)
          break
        case EVENT_KEYS.Enter:
          if (!this.isComposed) {
            contentState.enterHandler(event)
            this.muya.dispatchChange()
          }
          break
        case EVENT_KEYS.ArrowUp: // fallthrough
        case EVENT_KEYS.ArrowDown: // fallthrough
        case EVENT_KEYS.ArrowLeft: // fallthrough
        case EVENT_KEYS.ArrowRight: // fallthrough
          if (!this.isComposed) {
            contentState.arrowHandler(event)
          }
          break
        case EVENT_KEYS.Tab:
          contentState.tabHandler(event)
          break
        default:
          break
      }
    }

    eventCenter.attachDOMEvent(container, 'keydown', handler)
    eventCenter.attachDOMEvent(document, 'keydown', docHandler)
  }

  inputBinding() {
    const { container, eventCenter, contentState } = this.muya
    const inputHandler = (event) => {
      if (!this.isComposed) {
        contentState.inputHandler(event)
        this.muya.dispatchChange()
      }

      const { lang, paragraph } = contentState.checkEditLanguage()
      if (lang) {
        eventCenter.dispatch('muya-code-picker', {
          reference: getParagraphReference(paragraph, paragraph.id),
          lang,
          cb: (item) => {
            contentState.selectLanguage(paragraph, item.name)
          }
        })
      } else {
        // hide code picker float box
        eventCenter.dispatch('muya-code-picker', { reference: null })
      }
    }

    eventCenter.attachDOMEvent(container, 'input', inputHandler)
  }

  keyupBinding() {
    const { container, eventCenter, contentState } = this.muya
    const handler = (event) => {
      container.classList.remove('ag-meta-or-ctrl')
      // C-51 T-010 (BLOCK_KEYBOARD_EXPAND_BUTTON, keyup use): the keyup
      // mirror of the keydown guard. The selection machinery below must
      // not run from a button-focused state — repairing the selection
      // (getCursorRange needFix → setCursorRange → Selection.addRange
      // inside the contenteditable) moves the browser focus into the
      // editing host itself (silently in Chromium), stealing the focus
      // back from the button after the viewer's Esc close and during the
      // Tab walk over the needing blocks' buttons.
      if (isExpandButtonEvent(event)) {
        return
      }
      // check if edit emoji
      const node = selection.getSelectionStart()
      const paragraph = findNearestParagraph(node)
      const emojiNode = checkEditEmoji(node)
      contentState.selectedImage = null
      if (
        paragraph &&
        emojiNode &&
        event.key !== EVENT_KEYS.Enter &&
        event.key !== EVENT_KEYS.ArrowDown &&
        event.key !== EVENT_KEYS.ArrowUp &&
        event.key !== EVENT_KEYS.Tab &&
        event.key !== EVENT_KEYS.Escape
      ) {
        const reference = getParagraphReference(emojiNode, paragraph.id)
        eventCenter.dispatch('muya-emoji-picker', {
          reference,
          emojiNode
        })
      }
      if (!emojiNode) {
        eventCenter.dispatch('muya-emoji-picker', {
          emojiNode
        })
      }

      const { anchor, focus, start, end } = selection.getCursorRange()
      if (!anchor || !focus) {
        return
      }
      if (!this.isComposed) {
        const { anchor: oldAnchor, focus: oldFocus } = contentState.cursor
        if (
          anchor.key !== oldAnchor.key ||
          anchor.offset !== oldAnchor.offset ||
          focus.key !== oldFocus.key ||
          focus.offset !== oldFocus.offset
        ) {
          const needRender =
            contentState.checkNeedRender(contentState.cursor) ||
            contentState.checkNeedRender({ start, end })
          contentState.cursor = { anchor, focus }
          if (needRender) {
            return contentState.partialRender()
          }
        }
      }

      const block = contentState.getBlock(anchor.key)
      if (
        anchor.key === focus.key &&
        anchor.offset !== focus.offset &&
        block.functionType !== 'codeContent' &&
        block.functionType !== 'languageInput'
      ) {
        const reference = contentState.getPositionReference()
        const { formats } = contentState.selectionFormats()
        eventCenter.dispatch('muya-format-picker', { reference, formats })
      } else {
        eventCenter.dispatch('muya-format-picker', { reference: null })
      }
    }

    eventCenter.attachDOMEvent(container, 'keyup', handler) // temp use input event
  }
}

export default Keyboard
