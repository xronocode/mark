// FILE: src/muya/lib/contentState/dragDropCtrl.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: ContentState drag-and-drop behavior — dragover ghost creation, dragleave cleanup, and drop handling for web-link images and local image files.
//   SCOPE: Prototype methods installed on ContentState (hideGhost, createGhost, dragoverHandler, dragleaveHandler, dropHandler); no DOM rendering of its own. Local divergence from the upstream marktext/muya algorithm (C-MUYA-MODEL-SURGERY, recorded per the local divergence policy): the dropHandler file branch is confirmed-or-rolled-back (insert-after-confirm) — muya.options.imageAction runs before any document-model write, a rejection inserts nothing, restores the captured dropAnchor, leaves the cursor at its pre-drop position and emits one muya-image-action-failed event carrying { id, error } only; the web-link branch keeps the upstream algorithm.
//   DEPENDS: muya config regexes (URL_REG, IMAGE_EXT_REG), muya selection/utils (findNearestParagraph, findOutMostParagraph, verticalPositionInRect, getUniqueId, getImageInfo, checkImageContentType), window.electron.webUtils.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - dragDropCtrl modifier: installs the drag-and-drop prototype methods on ContentState.
// END_MODULE_MAP

import { findNearestParagraph, findOutMostParagraph } from '../selection/dom'
import {
  verticalPositionInRect,
  getUniqueId,
  getImageInfo as getImageSrc,
  checkImageContentType
} from '../utils'
import { getImageInfo } from '../utils/getImageInfo'
import { URL_REG, IMAGE_EXT_REG } from '../config'

const GHOST_ID = 'mu-dragover-ghost'
const GHOST_HEIGHT = 3

const dragDropCtrl = (ContentState) => {
  ContentState.prototype.hideGhost = function () {
    this.dropAnchor = null
    const ghost = document.querySelector(`#${GHOST_ID}`)
    ghost && ghost.remove()
  }
  /**
   * create the ghost element.
   */
  ContentState.prototype.createGhost = function (event) {
    const target = event.target
    let ghost = null
    const nearestParagraph = findNearestParagraph(target)
    const outmostParagraph = findOutMostParagraph(target)

    if (!outmostParagraph) {
      return this.hideGhost()
    }

    const block = this.getBlock(nearestParagraph.id)
    let anchor = this.getAnchor(block)

    // dragover preview container
    if (!anchor && outmostParagraph) {
      anchor = this.getBlock(outmostParagraph.id)
    }

    if (anchor) {
      const anchorParagraph = this.muya.container.querySelector(`#${anchor.key}`)
      const rect = anchorParagraph.getBoundingClientRect()
      const position = verticalPositionInRect(event, rect)
      this.dropAnchor = {
        position,
        anchor
      }
      // create ghost
      ghost = document.querySelector(`#${GHOST_ID}`)
      if (!ghost) {
        ghost = document.createElement('div')
        ghost.id = GHOST_ID
        document.body.appendChild(ghost)
      }

      Object.assign(ghost.style, {
        width: `${rect.width}px`,
        left: `${rect.left}px`,
        top: position === 'up' ? `${rect.top - GHOST_HEIGHT}px` : `${rect.top + rect.height}px`
      })
    }
  }

  ContentState.prototype.dragoverHandler = function (event) {
    // Cancel to allow tab drag&drop.
    if (!event.dataTransfer.types.length) {
      event.dataTransfer.dropEffect = 'none'
      return
    }

    if (event.dataTransfer.types.includes('text/uri-list')) {
      const items = Array.from(event.dataTransfer.items)
      const hasUriItem = items.some((i) => i.type === 'text/uri-list')
      const hasTextItem = items.some((i) => i.type === 'text/plain')
      const hasHtmlItem = items.some((i) => i.type === 'text/html')
      if (hasUriItem && hasHtmlItem && !hasTextItem) {
        this.createGhost(event)
        event.dataTransfer.dropEffect = 'copy'
      }
    }

    if (event.dataTransfer.types.indexOf('Files') >= 0) {
      if (
        event.dataTransfer.items.length === 1 &&
        event.dataTransfer.items[0].type.indexOf('image') > -1
      ) {
        event.preventDefault()
        this.createGhost(event)
        event.dataTransfer.dropEffect = 'copy'
      }
    } else {
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'none'
    }
  }

  ContentState.prototype.dragleaveHandler = function (event) {
    return this.hideGhost()
  }

  ContentState.prototype.dropHandler = async function (event) {
    event.preventDefault()
    const { dropAnchor } = this
    this.hideGhost()
    // handle drag/drop web link image.
    if (event.dataTransfer.items.length) {
      for (const item of event.dataTransfer.items) {
        if (item.kind === 'string' && item.type === 'text/uri-list') {
          item.getAsString(async (str) => {
            if (URL_REG.test(str) && dropAnchor) {
              let isImage = false
              if (IMAGE_EXT_REG.test(str)) {
                isImage = true
              }
              if (!isImage) {
                isImage = await checkImageContentType(str)
              }
              if (!isImage) return
              const text = `![](${str})`
              const imageBlock = this.createBlockP(text)
              const { anchor, position } = dropAnchor
              if (position === 'up') {
                this.insertBefore(imageBlock, anchor)
              } else {
                this.insertAfter(imageBlock, anchor)
              }

              const key = imageBlock.children[0].key
              const offset = 0
              this.cursor = {
                start: { key, offset },
                end: { key, offset },
                isEdit: true
              }
              this.render()
              this.muya.eventCenter.dispatch('stateChange')
            }
          })
        }
      }
    }

    if (event.dataTransfer.files) {
      const fileList = []
      for (const file of event.dataTransfer.files) {
        fileList.push(file)
      }
      const image = fileList.find((file) => /image/.test(file.type))
      if (image && dropAnchor) {
        const { name } = image
        const path = window.electron.webUtils.getPathForFile(image)
        const id = `loading-${getUniqueId()}`

        // C-MUYA-MODEL-SURGERY: insert-after-confirm — imageAction runs
        // before any document-model write, so a rejection writes nothing, the
        // captured dropAnchor is restored and the cursor stays at its
        // pre-drop position; the failure surfaces as one engine-clean
        // `muya-image-action-failed` event carrying { id, error } only.
        let newSrc = null
        let confirmed = false
        try {
          newSrc = await this.muya.options.imageAction(path, id, name)
          confirmed = true
        } catch (error) {
          this.dropAnchor = dropAnchor
          this.muya.eventCenter.dispatch('muya-image-action-failed', { id, error })
        }

        if (confirmed) {
          const text = `![${id}](${path})`
          const imageBlock = this.createBlockP(text)
          const { anchor, position } = dropAnchor
          if (position === 'up') {
            this.insertBefore(imageBlock, anchor)
          } else {
            this.insertAfter(imageBlock, anchor)
          }

          const key = imageBlock.children[0].key
          const offset = 0
          this.cursor = {
            start: { key, offset },
            end: { key, offset },
            isEdit: true
          }
          this.render()

          const { src } = getImageSrc(path)
          if (src) {
            this.stateRender.urlMap.set(newSrc, src)
          }
          const imageWrapper = this.muya.container.querySelector(`span[data-id=${id}]`)

          if (imageWrapper) {
            const imageInfo = getImageInfo(imageWrapper)
            this.replaceImage(imageInfo, {
              alt: name,
              src: newSrc
            })
          }
        }
      }
      this.muya.eventCenter.dispatch('stateChange')
    }
  }
}

export default dragDropCtrl
