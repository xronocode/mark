// FILE: src/muya/lib/eventHandler/clickEvent.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Route clicks inside the muya container — tools, drag bars, images, math, container previews, callouts, footnotes, checkboxes — to contentState actions or eventCenter events.
//   SCOPE: clickBinding and contextClickBinding only.
//   DEPENDS: muya/lib/utils (domManipulate, getImageInfo), muya/lib/config, muya/lib/selection, contentState handlers.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; .grace/changes/active/C-34 T-002 (BLOCK_CONTAINER_VIEWER_CLICK).
//   ROLE: RUNTIME
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - ClickEvent class (container click + contextmenu routing).
//   getToolItem - resolves the closest [data-label] tool item under a click target.
//   selectionText - moves the DOM selection to the end of a marked-text node.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-34 R2.2/C-39 T2: Cmd/Ctrl+click on a mermaid preview dispatches 'muya-block-viewer' (fullscreen viewer) instead of opening the source; a plain click keeps opening the source.
// END_CHANGE_SUMMARY

import { operateClassName } from '../utils/domManipulate'
import { getImageInfo } from '../utils/getImageInfo'
import { CLASS_OR_ID } from '../config'
import selection from '../selection'

class ClickEvent {
  constructor(muya) {
    this.muya = muya
    this.clickBinding()
    this.contextClickBingding()
  }

  contextClickBingding() {
    const { container, eventCenter, contentState } = this.muya
    const handler = (event) => {
      // Allow native context menu in MarkText.
      if (!global || !global.marktext) {
        // __MARKTEXT_PATCH__
        event.preventDefault()
        event.stopPropagation()
      }

      // Hide all float box and image transformer
      const { keyboard } = this.muya
      if (keyboard) {
        keyboard.hideAllFloatTools()
      }

      const { start, end } = selection.getCursorRange()

      // Cursor out of editor
      if (!start || !end) {
        return
      }

      const startBlock = contentState.getBlock(start.key)
      const nextTextBlock = contentState.findNextBlockInLocation(startBlock)
      if (
        nextTextBlock &&
        nextTextBlock.key === end.key &&
        end.offset === 0 &&
        start.offset === startBlock.text.length
      ) {
        // Set cursor at the end of start block and reset cursor
        // Because if you right click at the end of one text block, the cursor.start will at the end of
        // start block and the cursor.end will at the next text block beginning. So we reset the cursor
        // at the end of start block.
        contentState.cursor = {
          start,
          end: start
        }
        selection.setCursorRange(contentState.cursor)
      } else {
        // Commit native cursor position because right-clicking doesn't update the cursor postion.
        contentState.cursor = {
          start,
          end
        }
      }

      const sectionChanges = contentState.selectionChange(contentState.cursor)
      eventCenter.dispatch('contextmenu', event, sectionChanges)
    }
    eventCenter.attachDOMEvent(container, 'contextmenu', handler)
  }

  clickBinding() {
    const { container, eventCenter, contentState } = this.muya
    const handler = (event) => {
      const { target } = event
      // handler table click
      const toolItem = getToolItem(target)
      contentState.selectedImage = null
      contentState.selectedTableCells = null
      if (toolItem) {
        event.preventDefault()
        event.stopPropagation()
        const type = toolItem.getAttribute('data-label')
        const grandPa = toolItem.parentNode.parentNode
        if (grandPa.classList.contains('ag-tool-table')) {
          contentState.tableToolBarClick(type)
        }
      }
      // Handle table drag bar click
      if (target.classList.contains('ag-drag-handler')) {
        event.preventDefault()
        event.stopPropagation()
        const rect = target.getBoundingClientRect()
        const reference = {
          getBoundingClientRect() {
            return rect
          },
          width: rect.offsetWidth,
          height: rect.offsetHeight
        }
        eventCenter.dispatch('muya-table-bar', {
          reference,
          tableInfo: {
            barType: target.classList.contains('left') ? 'left' : 'bottom'
          }
        })
      }
      // Handle image and inline math preview click
      const markedImageText = target.previousElementSibling
      const mathRender = target.closest(`.${CLASS_OR_ID.AG_MATH_RENDER}`)
      const rubyRender = target.closest(`.${CLASS_OR_ID.AG_RUBY_RENDER}`)
      const imageWrapper = target.closest(`.${CLASS_OR_ID.AG_INLINE_IMAGE}`)
      const codeCopy = target.closest('.ag-code-copy')
      const footnoteBackLink = target.closest('.ag-footnote-backlink')
      const imageDelete =
        target.closest('.ag-image-icon-delete') || target.closest('.ag-image-icon-close')
      const mathText = mathRender && mathRender.previousElementSibling
      const rubyText = rubyRender && rubyRender.previousElementSibling
      if (markedImageText && markedImageText.classList.contains(CLASS_OR_ID.AG_IMAGE_MARKED_TEXT)) {
        eventCenter.dispatch('format-click', {
          event,
          formatType: 'image',
          data: event.target.getAttribute('src')
        })
        selectionText(markedImageText)
      } else if (mathText) {
        selectionText(mathText)
      } else if (rubyText) {
        selectionText(rubyText)
      }
      if (codeCopy) {
        event.stopPropagation()
        event.preventDefault()
        return this.muya.contentState.copyCodeBlock(event)
      }
      // Handle delete inline iamge by click delete icon.
      if (imageDelete && imageWrapper) {
        const imageInfo = getImageInfo(imageWrapper)
        event.preventDefault()
        event.stopPropagation()
        // hide image selector if needed.
        eventCenter.dispatch('muya-image-selector', { reference: null })
        return contentState.deleteImage(imageInfo)
      }

      // START_BLOCK_FRONT_MATTER_EDIT
      // C-24 R-8: clicking the properties table moves the cursor into the
      // YAML, which makes the block active and shows the editable source.
      const fmTable = target.closest('.ag-front-matter-table')
      if (fmTable) {
        event.preventDefault()
        event.stopPropagation()
        const pre = contentState.getBlock(fmTable.dataset.frontMatterKey)
        const line = pre && pre.children[0] && pre.children[0].children[0]
        if (line) {
          const offset = line.text.length
          contentState.cursor = { start: { key: line.key, offset }, end: { key: line.key, offset } }
          return contentState.render(true)
        }
        return
      }
      // END_BLOCK_FRONT_MATTER_EDIT

      // START_BLOCK_CALLOUT_FOLD_TOGGLE
      // C-24: clicking a foldable callout's title toggles it. View state only.
      const calloutTitle = target.closest('.ag-callout-title')
      if (calloutTitle) {
        const quote = calloutTitle.closest('.ag-callout')
        if (quote && quote.classList.contains('ag-callout-foldable')) {
          event.preventDefault()
          event.stopPropagation()
          const key = calloutTitle.dataset.calloutKey
          const folds = contentState.calloutFolds || (contentState.calloutFolds = new Map())
          folds.set(key, !quote.classList.contains('ag-callout-collapsed'))
          // render(true) restores the cursor; render(false) would blur the editor.
          return contentState.render(true)
        }
        return
      }
      // END_BLOCK_CALLOUT_FOLD_TOGGLE

      if (footnoteBackLink) {
        event.preventDefault()
        event.stopPropagation()
        const figure = event.target.closest('figure')
        const identifier = figure.querySelector('span.ag-footnote-input').textContent
        if (identifier) {
          const footnoteIdentifier = document.querySelector(`#noteref-${identifier}`)
          if (footnoteIdentifier) {
            footnoteIdentifier.scrollIntoView({ behavior: 'smooth' })
          }
        }
        return
      }

      // Handle image click, to select the current image
      if (target.tagName === 'IMG' && imageWrapper) {
        // Handle select image
        const imageInfo = getImageInfo(imageWrapper)
        event.preventDefault()
        eventCenter.dispatch('select-image', imageInfo)
        // Handle show image toolbar
        const rect = imageWrapper.querySelector('.ag-image-container').getBoundingClientRect()
        const reference = {
          getBoundingClientRect() {
            return rect
          },
          width: imageWrapper.offsetWidth,
          height: imageWrapper.offsetHeight
        }
        eventCenter.dispatch('muya-image-toolbar', {
          reference,
          imageInfo
        })
        contentState.selectImage(imageInfo)
        // Handle show image transformer
        const imageSelector =
          imageInfo.imageId.indexOf('_') > -1
            ? `#${imageInfo.imageId}`
            : `#${imageInfo.key}_${imageInfo.imageId}_${imageInfo.token.range.start}`

        const imageContainer = document.querySelector(`${imageSelector} .ag-image-container`)

        eventCenter.dispatch('muya-transformer', {
          reference: imageContainer,
          imageInfo
        })
        return
      }

      // Handle click imagewrapper when it's empty or image load failed.
      if (
        imageWrapper &&
        (imageWrapper.classList.contains('ag-empty-image') ||
          imageWrapper.classList.contains('ag-image-fail'))
      ) {
        const rect = imageWrapper.getBoundingClientRect()
        const reference = {
          getBoundingClientRect() {
            return rect
          }
        }
        const imageInfo = getImageInfo(imageWrapper)
        eventCenter.dispatch('muya-image-selector', {
          reference,
          imageInfo,
          cb: () => {}
        })
        event.preventDefault()
        return event.stopPropagation()
      }

      if (target.closest('div.ag-container-preview') || target.closest('div.ag-html-preview')) {
        event.stopPropagation()
        if (target.closest('div.ag-container-preview')) {
          event.preventDefault()
          // START_BLOCK_CONTAINER_VIEWER_CLICK
          // C-34 R2.2 / C-39 T2: Cmd/Ctrl+click on a rendered container
          // preview opens the shared fullscreen block viewer (the plugin
          // ignores previews without an SVG). A plain click still opens
          // the source for editing.
          if (event.metaKey || event.ctrlKey) {
            eventCenter.dispatch('muya-block-viewer', {
              element: target.closest('div.ag-container-preview')
            })
            return
          }
          // END_BLOCK_CONTAINER_VIEWER_CLICK
          const figureEle = target.closest('figure')
          contentState.handleContainerBlockClick(figureEle)
        }
        return
      }
      // handler container preview click
      const editIcon = target.closest('.ag-container-icon')
      if (editIcon) {
        event.preventDefault()
        event.stopPropagation()
        if (editIcon.parentNode.classList.contains('ag-container-block')) {
          contentState.handleContainerBlockClick(editIcon.parentNode)
        }
      }

      // handler to-do checkbox click
      if (
        target.tagName === 'INPUT' &&
        target.classList.contains(CLASS_OR_ID.AG_TASK_LIST_ITEM_CHECKBOX)
      ) {
        contentState.listItemCheckBoxClick(target)
      }
      contentState.clickHandler(event)
    }

    eventCenter.attachDOMEvent(container, 'click', handler)
  }
}

function getToolItem(target) {
  return target.closest('[data-label]')
}

function selectionText(node) {
  const textLen = node.textContent.length
  operateClassName(node, 'remove', CLASS_OR_ID.AG_HIDE)
  operateClassName(node, 'add', CLASS_OR_ID.AG_GRAY)
  selection.importSelection(
    {
      start: textLen,
      end: textLen
    },
    node
  )
}

export default ClickEvent
