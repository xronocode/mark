// FILE: src/muya/lib/contentState/updateCtrl.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: ContentState inline update behavior — a paragraph line's text is re-examined after each edit and the underlying block tree is converted in place (thematic break, bullet/order/task lists, ATX/Setext headings, blockquote, indent code, footnote, back to paragraph).
//   SCOPE: Prototype methods installed on ContentState (checkSameMarkerOrDelimiter, checkNeedRender, checkInlineUpdate and the update* converters); no DOM rendering of its own. Local divergence from the upstream marktext/muya algorithm (C-MUYA-MODEL-SURGERY, recorded per the local divergence policy): updateTaskListItem is a direct structural conversion — the task item and the surrounding sibling lists are assembled in one ordered pass per list, with no created-then-discarded transient wrapper block and no remove-and-reinsert walk over already-placed blocks, while the delivered block-tree outcome (including today's sibling-list split for mixed lists) is unchanged.
//   DEPENDS: muya parser tokenizer, muya utils (conflict), muya config regexes.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - updateCtrl modifier: installs the inline-update prototype methods on ContentState.
// END_MODULE_MAP

import { tokenizer } from '../parser/'
import { conflict } from '../utils'

const INLINE_UPDATE_FRAGMENTS = [
  '(?:^|\n) {0,3}([*+-] {1,4})', // Bullet list
  '(?:^|\n)(\\[[x ]{1}\\] {1,4})', // Task list
  '(?:^|\n) {0,3}(\\d{1,9}(?:\\.|\\)) {1,4})', // Order list
  '(?:^|\n) {0,3}(#{1,6})(?=\\s{1,}|$)', // ATX headings
  '^(?:[\\s\\S]+?)\\n {0,3}(\\={3,}|\\-{3,})(?= {1,}|$)', // Setext headings **match from beginning**
  '(?:^|\n) {0,3}(>).+', // Block quote
  '^( {4,})', // Indent code **match from beginning**
  '^(\\[\\^[^\\^\\[\\]\\s]+?(?<!\\\\)\\]: )', // Footnote **match from beginning**
  '(?:^|\n) {0,3}((?:\\* *\\* *\\*|- *- *-|_ *_ *_)[ \\*\\-\\_]*)$' // Thematic break
]

const INLINE_UPDATE_REG = new RegExp(INLINE_UPDATE_FRAGMENTS.join('|'), 'i')

const updateCtrl = (ContentState) => {
  ContentState.prototype.checkSameMarkerOrDelimiter = function (list, markerOrDelimiter) {
    if (!/ol|ul/.test(list.type)) return false
    return list.children[0].bulletMarkerOrDelimiter === markerOrDelimiter
  }

  ContentState.prototype.checkNeedRender = function (cursor = this.cursor) {
    const { labels } = this.stateRender
    const { start: cStart, end: cEnd, anchor, focus } = cursor
    const startBlock = this.getBlock(cStart ? cStart.key : anchor.key)
    const endBlock = this.getBlock(cEnd ? cEnd.key : focus.key)
    const startOffset = cStart ? cStart.offset : anchor.offset
    const endOffset = cEnd ? cEnd.offset : focus.offset
    const NO_NEED_TOKEN_REG = /text|hard_line_break|soft_line_break/

    for (const token of tokenizer(startBlock.text, {
      labels,
      options: this.muya.options
    })) {
      if (NO_NEED_TOKEN_REG.test(token.type)) continue
      const { start, end } = token.range
      const textLen = startBlock.text.length
      if (
        conflict([Math.max(0, start - 1), Math.min(textLen, end + 1)], [startOffset, startOffset])
      ) {
        return true
      }
    }
    for (const token of tokenizer(endBlock.text, {
      labels,
      options: this.muya.options
    })) {
      if (NO_NEED_TOKEN_REG.test(token.type)) continue
      const { start, end } = token.range
      const textLen = endBlock.text.length
      if (conflict([Math.max(0, start - 1), Math.min(textLen, end + 1)], [endOffset, endOffset])) {
        return true
      }
    }

    return false
  }

  /**
   * block must be span block.
   */
  ContentState.prototype.checkInlineUpdate = function (block) {
    // table cell can not have blocks in it
    if (/figure/.test(block.type)) {
      return false
    }
    if (/cellContent|codeContent|languageInput|footnoteInput/.test(block.functionType)) {
      return false
    }

    let line = null
    const { text } = block
    if (block.type === 'span') {
      line = block
      block = this.getParent(block)
    }
    const listItem = this.getParent(block)
    const [
      match,
      bullet,
      tasklist,
      order,
      atxHeader,
      setextHeader,
      blockquote,
      indentCode,
      footnote,
      hr
    ] = text.match(INLINE_UPDATE_REG) || []
    const { footnote: isSupportFootnote } = this.muya.options

    switch (true) {
      case !!hr && new Set(hr.split('').filter((i) => /\S/.test(i))).size === 1:
        return this.updateThematicBreak(block, hr, line)

      // Prevents nested lists from being created when updating a list item, which leads to undefined behavior.
      case !!bullet && !listItem:
        return this.updateList(block, 'bullet', bullet, line)

      // only `bullet` list item can be update to `task` list item
      case !!tasklist && listItem && listItem.listItemType === 'bullet':
        return this.updateTaskListItem(block, 'tasklist', tasklist)

      // Prevents nested lists from being created when updating a list item, which leads to undefined behavior.
      case !!order && !listItem:
        return this.updateList(block, 'order', order, line)

      case !!atxHeader:
        return this.updateAtxHeader(block, atxHeader, line)

      case !!setextHeader:
        return this.updateSetextHeader(block, setextHeader, line)

      case !!blockquote:
        return this.updateBlockQuote(block, line)

      case !!indentCode:
        return this.updateIndentCode(block, line)

      case !!footnote && block.type === 'p' && !block.parent && isSupportFootnote:
        return this.updateFootnote(block, line)

      case !match:
      default:
        return this.updateToParagraph(block, line)
    }
  }

  // Thematic break
  ContentState.prototype.updateThematicBreak = function (block, marker, line) {
    // If the block is already thematic break, no need to update.
    if (block.type === 'hr') return null
    const text = line.text
    const lines = text.split('\n')
    const preParagraphLines = []
    let thematicLine = ''
    const postParagraphLines = []
    let thematicLineHasPushed = false
    for (const l of lines) {
      /* eslint-disable no-useless-escape */
      if (/ {0,3}(?:\* *\* *\*|- *- *-|_ *_ *_)[ \*\-\_]*$/.test(l) && !thematicLineHasPushed) {
        /* eslint-enable no-useless-escape */
        thematicLine = l
        thematicLineHasPushed = true
      } else if (!thematicLineHasPushed) {
        preParagraphLines.push(l)
      } else {
        postParagraphLines.push(l)
      }
    }

    const thematicBlock = this.createBlock('hr')
    const thematicLineBlock = this.createBlock('span', {
      text: thematicLine,
      functionType: 'thematicBreakLine'
    })
    this.appendChild(thematicBlock, thematicLineBlock)
    this.insertBefore(thematicBlock, block)
    if (preParagraphLines.length) {
      const preBlock = this.createBlockP(preParagraphLines.join('\n'))
      this.insertBefore(preBlock, thematicBlock)
    }
    if (postParagraphLines.length) {
      const postBlock = this.createBlockP(postParagraphLines.join('\n'))
      this.insertAfter(postBlock, thematicBlock)
    }

    this.removeBlock(block)
    const { start, end } = this.cursor
    const key = thematicBlock.children[0].key
    const preParagraphLength = preParagraphLines.reduce((acc, i) => acc + i.length + 1, 0) // Add one, because the `\n`
    const startOffset = start.offset - preParagraphLength
    const endOffset = end.offset - preParagraphLength
    this.cursor = {
      start: { key, offset: startOffset },
      end: { key, offset: endOffset },
      isEdit: true
    }
    return thematicBlock
  }

  ContentState.prototype.updateList = function (block, type, marker = '', line) {
    const cleanMarker = marker ? marker.trim() : null
    const { preferLooseListItem } = this.muya.options
    const wrapperTag = type === 'order' ? 'ol' : 'ul' // `bullet` => `ul` and `order` => `ol`
    const { start, end } = this.cursor
    const startOffset = start.offset
    const endOffset = end.offset
    const newListItemBlock = this.createBlock('li')
    const LIST_ITEM_REG = /^ {0,3}(?:[*+-]|\d{1,9}(?:\.|\))) {0,4}/
    const text = line.text
    const lines = text.split('\n')

    const preParagraphLines = []
    let listItemLines = []
    let isPushedListItemLine = false
    if (marker) {
      for (const l of lines) {
        if (LIST_ITEM_REG.test(l) && !isPushedListItemLine) {
          listItemLines.push(l.replace(LIST_ITEM_REG, ''))
          isPushedListItemLine = true
        } else if (!isPushedListItemLine) {
          preParagraphLines.push(l)
        } else {
          listItemLines.push(l)
        }
      }
    } else {
      // From front menu click.
      listItemLines = lines
    }

    const pBlock = this.createBlockP(listItemLines.join('\n'))
    this.insertBefore(pBlock, block)

    if (preParagraphLines.length > 0) {
      const preParagraphBlock = this.createBlockP(preParagraphLines.join('\n'))
      this.insertBefore(preParagraphBlock, pBlock)
    }

    this.removeBlock(block)

    // important!
    block = pBlock

    const preSibling = this.getPreSibling(block)
    const nextSibling = this.getNextSibling(block)
    newListItemBlock.listItemType = type
    newListItemBlock.isLooseListItem = preferLooseListItem

    let bulletMarkerOrDelimiter
    if (type === 'order') {
      bulletMarkerOrDelimiter = cleanMarker && cleanMarker.length >= 2 ? cleanMarker.slice(-1) : '.'
    } else {
      const { bulletListMarker } = this.muya.options
      bulletMarkerOrDelimiter = marker ? marker.charAt(0) : bulletListMarker
    }
    newListItemBlock.bulletMarkerOrDelimiter = bulletMarkerOrDelimiter

    // Special cases for CommonMark 264 and 265: Changing the bullet or ordered list delimiter starts a new list.
    // Same list type or new list
    if (
      preSibling &&
      this.checkSameMarkerOrDelimiter(preSibling, bulletMarkerOrDelimiter) &&
      nextSibling &&
      this.checkSameMarkerOrDelimiter(nextSibling, bulletMarkerOrDelimiter)
    ) {
      this.appendChild(preSibling, newListItemBlock)
      const partChildren = nextSibling.children.splice(0)
      partChildren.forEach((b) => this.appendChild(preSibling, b))
      this.removeBlock(nextSibling)
      this.removeBlock(block)
      const isLooseListItem = preSibling.children.some((c) => c.isLooseListItem)
      preSibling.children.forEach((c) => (c.isLooseListItem = isLooseListItem))
    } else if (preSibling && this.checkSameMarkerOrDelimiter(preSibling, bulletMarkerOrDelimiter)) {
      this.appendChild(preSibling, newListItemBlock)
      this.removeBlock(block)
      const isLooseListItem = preSibling.children.some((c) => c.isLooseListItem)
      preSibling.children.forEach((c) => (c.isLooseListItem = isLooseListItem))
    } else if (
      nextSibling &&
      this.checkSameMarkerOrDelimiter(nextSibling, bulletMarkerOrDelimiter)
    ) {
      this.insertBefore(newListItemBlock, nextSibling.children[0])
      this.removeBlock(block)
      const isLooseListItem = nextSibling.children.some((c) => c.isLooseListItem)
      nextSibling.children.forEach((c) => (c.isLooseListItem = isLooseListItem))
    } else {
      // Create a new list when changing list type, bullet or list delimiter
      const listBlock = this.createBlock(wrapperTag, {
        listType: type
      })

      if (wrapperTag === 'ol') {
        const start = cleanMarker ? cleanMarker.slice(0, -1) : 1
        listBlock.start = /^\d+$/.test(start) ? start : 1
      }

      this.appendChild(listBlock, newListItemBlock)
      this.insertBefore(listBlock, block)
      this.removeBlock(block)
    }

    // key point
    this.appendChild(newListItemBlock, block)
    const TASK_LIST_REG = /^\[[x ]\] {1,4}/i
    const listItemText = block.children[0].text
    const { key } = block.children[0]
    const delta = marker.length + preParagraphLines.join('\n').length + 1
    this.cursor = {
      start: {
        key,
        offset: Math.max(0, startOffset - delta)
      },
      end: {
        key,
        offset: Math.max(0, endOffset - delta)
      },
      isEdit: true
    }
    if (TASK_LIST_REG.test(listItemText)) {
      const [, , tasklist, , , ,] = listItemText.match(INLINE_UPDATE_REG) || []
      return this.updateTaskListItem(block, 'tasklist', tasklist)
    } else {
      return block
    }
  }

  // C-MUYA-MODEL-SURGERY: link one list's final children in a single ordered
  // pass — the direct conversion below never removes and re-inserts an
  // already-placed block to assemble a list.
  const linkChildren = (list, children) => {
    list.children = children
    children.forEach((child, i) => {
      child.parent = list.key
      child.preSibling = i ? children[i - 1].key : null
      child.nextSibling = i < children.length - 1 ? children[i + 1].key : null
    })
  }

  // C-MUYA-MODEL-SURGERY: direct structural conversion. The checkbox and
  // marker mutation stays immediate, but the surrounding list is rebuilt
  // without transient surgery: every constructed block lands in the delivered
  // tree (no created-then-discarded wrapper) and no already-placed block is
  // removed and re-inserted. The delivered block-tree outcome matches the
  // previous wrapper algorithm, including today's sibling-list split for
  // mixed lists.
  ContentState.prototype.updateTaskListItem = function (block, type, marker = '') {
    const { preferLooseListItem } = this.muya.options
    const parent = this.getParent(block)
    const grandpa = this.getParent(parent)
    const checked = /\[x\]\s/i.test(marker) // use `i` flag to ignore upper case or lower case
    const checkbox = this.createBlock('input', {
      checked
    })
    const { start, end } = this.cursor

    this.insertBefore(checkbox, block)
    block.children[0].text = block.children[0].text.substring(marker.length)
    parent.listItemType = 'task'
    parent.isLooseListItem = preferLooseListItem

    let taskList = null
    if (this.isOnlyChild(parent)) {
      grandpa.listType = 'task'
    } else {
      taskList = this.createBlock('ul', {
        listType: 'task'
      })
      const isFirst = this.isFirstChild(parent)
      if (isFirst || this.isLastChild(parent)) {
        const index = this.findIndex(grandpa.children, parent)
        grandpa.children.splice(index, 1)
        linkChildren(grandpa, grandpa.children)
        linkChildren(taskList, [parent])
        isFirst ? this.insertBefore(taskList, grandpa) : this.insertAfter(taskList, grandpa)
      } else {
        const bulletList = this.createBlock('ul', {
          listType: 'bullet'
        })
        // One splice detaches the preceding siblings together with the
        // converting item; grandpa keeps the following siblings as today's
        // bullet list, so the mixed list stays sibling lists with listType
        // per ul.
        const index = this.findIndex(grandpa.children, parent)
        const taken = grandpa.children.splice(0, index + 1)
        linkChildren(bulletList, taken.slice(0, -1))
        linkChildren(taskList, [parent])
        linkChildren(grandpa, grandpa.children)
        this.insertBefore(bulletList, grandpa)
        this.insertBefore(taskList, grandpa)
      }
    }

    this.cursor = {
      start: {
        key: start.key,
        offset: Math.max(0, start.offset - marker.length)
      },
      end: {
        key: end.key,
        offset: Math.max(0, end.offset - marker.length)
      },
      isEdit: true
    }
    return taskList || grandpa
  }

  // ATX heading doesn't support soft line break and hard line break.
  ContentState.prototype.updateAtxHeader = function (block, header, line) {
    const newType = `h${header.length}`
    const headingStyle = 'atx'
    if (block.type === newType && block.headingStyle === headingStyle) {
      return null
    }
    const text = line.text
    const lines = text.split('\n')
    const preParagraphLines = []
    let atxLine = ''
    const postParagraphLines = []
    let atxLineHasPushed = false

    for (const l of lines) {
      if (/^ {0,3}#{1,6}(?=\s{1,}|$)/.test(l) && !atxLineHasPushed) {
        atxLine = l
        atxLineHasPushed = true
      } else if (!atxLineHasPushed) {
        preParagraphLines.push(l)
      } else {
        postParagraphLines.push(l)
      }
    }

    const atxBlock = this.createBlock(newType, {
      headingStyle
    })
    const atxLineBlock = this.createBlock('span', {
      text: atxLine,
      functionType: 'atxLine'
    })
    this.appendChild(atxBlock, atxLineBlock)
    this.insertBefore(atxBlock, block)
    if (preParagraphLines.length) {
      const preBlock = this.createBlockP(preParagraphLines.join('\n'))
      this.insertBefore(preBlock, atxBlock)
    }
    if (postParagraphLines.length) {
      const postBlock = this.createBlockP(postParagraphLines.join('\n'))
      this.insertAfter(postBlock, atxBlock)
    }

    this.removeBlock(block)

    // ISSUE: When pressing Shift + Enter in a paragraph and then attempting to create a header
    // If the offset of start > length of text, the cursor range will be out of bounds and cause an error.
    // Even for <= 5, it will set it to the END of the text content, which is not expected.
    // We need to not take the offset from the START of the selection, but of the actual header line
    const { start, end } = this.cursor

    const key = atxBlock.children[0].key
    this.cursor = {
      start: {
        key,
        offset: start.offset <= atxBlock.children[0].text.length ? start.offset : header.length + 1
      },
      end: {
        key,
        offset:
          end.offset <= atxBlock.children[0].text.length
            ? end.offset
            : atxBlock.children[0].text.length
      },
      isEdit: true
    }
    return atxBlock
  }

  ContentState.prototype.updateSetextHeader = function (block, marker, line) {
    const newType = /=/.test(marker) ? 'h1' : 'h2'
    const headingStyle = 'setext'
    if (block.type === newType && block.headingStyle === headingStyle) {
      return null
    }

    const text = line.text
    const lines = text.split('\n')
    const setextLines = []
    const postParagraphLines = []
    let setextLineHasPushed = false

    for (const l of lines) {
      if (/^ {0,3}(?:={3,}|-{3,})(?= {1,}|$)/.test(l) && !setextLineHasPushed) {
        setextLineHasPushed = true
      } else if (!setextLineHasPushed) {
        setextLines.push(l)
      } else {
        postParagraphLines.push(l)
      }
    }

    const setextBlock = this.createBlock(newType, {
      headingStyle,
      marker
    })
    const setextLineBlock = this.createBlock('span', {
      text: setextLines.join('\n'),
      functionType: 'paragraphContent'
    })
    this.appendChild(setextBlock, setextLineBlock)
    this.insertBefore(setextBlock, block)

    if (postParagraphLines.length) {
      const postBlock = this.createBlockP(postParagraphLines.join('\n'))
      this.insertAfter(postBlock, setextBlock)
    }

    this.removeBlock(block)

    const key = setextBlock.children[0].key
    const offset = setextBlock.children[0].text.length

    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }

    return setextBlock
  }

  ContentState.prototype.updateBlockQuote = function (block, line) {
    const text = line.text
    const lines = text.split('\n')
    const preParagraphLines = []
    const quoteLines = []
    let quoteLinesHasPushed = false

    for (const l of lines) {
      if (/^ {0,3}>/.test(l) && !quoteLinesHasPushed) {
        quoteLinesHasPushed = true
        quoteLines.push(l.trimStart().substring(1).trimStart())
      } else if (!quoteLinesHasPushed) {
        preParagraphLines.push(l)
      } else {
        quoteLines.push(l)
      }
    }
    let quoteParagraphBlock
    if (/^h\d/.test(block.type)) {
      quoteParagraphBlock = this.createBlock(block.type, {
        headingStyle: block.headingStyle
      })
      if (block.headingStyle === 'setext') {
        quoteParagraphBlock.marker = block.marker
      }
      const headerContent = this.createBlock('span', {
        text: quoteLines.join('\n'),
        functionType: block.headingStyle === 'setext' ? 'paragraphContent' : 'atxLine'
      })
      this.appendChild(quoteParagraphBlock, headerContent)
    } else {
      quoteParagraphBlock = this.createBlockP(quoteLines.join('\n'))
    }

    const quoteBlock = this.createBlock('blockquote')
    this.appendChild(quoteBlock, quoteParagraphBlock)
    this.insertBefore(quoteBlock, block)

    if (preParagraphLines.length) {
      const preParagraphBlock = this.createBlockP(preParagraphLines.join('\n'))
      this.insertBefore(preParagraphBlock, quoteBlock)
    }

    this.removeBlock(block)

    const key = quoteParagraphBlock.children[0].key
    const { start, end } = this.cursor

    this.cursor = {
      start: { key, offset: Math.max(0, start.offset - 1) },
      end: { key, offset: Math.max(0, end.offset - 1) },
      isEdit: true
    }
    return quoteBlock
  }

  ContentState.prototype.updateIndentCode = function (block, line) {
    const lang = ''
    const codeBlock = this.createBlock('code', {
      lang
    })
    const inputBlock = this.createBlock('span', {
      functionType: 'languageInput'
    })
    const preBlock = this.createBlock('pre', {
      functionType: 'indentcode',
      lang
    })

    const text = line ? line.text : block.text

    const lines = text.split('\n')
    const codeLines = []
    const paragraphLines = []
    let canBeCodeLine = true

    for (const l of lines) {
      if (/^ {4,}/.test(l) && canBeCodeLine) {
        codeLines.push(l.replace(/^ {4}/, ''))
      } else {
        canBeCodeLine = false
        paragraphLines.push(l)
      }
    }
    const codeContent = this.createBlock('span', {
      text: codeLines.join('\n'),
      functionType: 'codeContent',
      lang
    })

    this.appendChild(codeBlock, codeContent)
    this.appendChild(preBlock, inputBlock)
    this.appendChild(preBlock, codeBlock)
    this.insertBefore(preBlock, block)

    if (paragraphLines.length > 0 && line) {
      const newLine = this.createBlock('span', {
        text: paragraphLines.join('\n')
      })
      this.insertBefore(newLine, line)
      this.removeBlock(line)
    } else {
      this.removeBlock(block)
    }

    const key = codeBlock.children[0].key
    const { start, end } = this.cursor
    this.cursor = {
      start: { key, offset: start.offset - 4 },
      end: { key, offset: end.offset - 4 },
      isEdit: true
    }
    return preBlock
  }

  ContentState.prototype.updateToParagraph = function (block, line) {
    if (/^h\d$/.test(block.type) && block.headingStyle === 'setext') {
      return null
    }

    const newType = 'p'
    if (block.type !== newType) {
      const newBlock = this.createBlockP(line.text)
      this.insertBefore(newBlock, block)
      this.removeBlock(block)
      const { start, end } = this.cursor
      const key = newBlock.children[0].key
      this.cursor = {
        start: { key, offset: start.offset },
        end: { key, offset: end.offset },
        isEdit: true
      }
      return block
    }
    return null
  }
}

export default updateCtrl
