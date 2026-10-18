// FILE: src/muya/lib/parser/render/renderBlock/renderContainerBlock.js
// VERSION: 1.8.0
// START_MODULE_CONTRACT
//   PURPOSE: Render a muya container block (blockquote, list, table, figure, pre) to a snabbdom vnode.
//   SCOPE: Selectors, data attributes and auxiliary children (tools, icons, copy buttons, the C-51 expand button, the C-56 T-005 corner pill on mermaid/vega-lite figures, code-block line-number gutter, table column-resize handle) per container type; the table element is returned inside its C-39 horizontal scroll wrapper, with its C-39 T-002 session colgroup when widths are stored. C-62: nonempty Mermaid figures also render the stable appearance button.
//   DEPENDS: muya config, render helpers, snabbdom, ../../../utils/callout, ../../../tableResize (width constants).; ./renderDiagramAppearance.
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-012 scenario-18, scenario-20, scenario-21, scenario-60 and scenario-64; .grace/changes/active/C-39 T-001 and T-002, C-38 T-005, C-51 T-006 and T-010, C-56 T-005.; .grace/changes/archive/C-62.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - renderContainerBlock(parent, block, activeBlocks, matches, useCache, t); a `table` block returns div.ag-table-scroll > table (plus the session colgroup when muya.tableResize has matching widths); a `th` block gets the span.ag-column-resizer handle; a fence/indent `code` block records its pre in stateRender.lineNumberPreKeys for post-render gutter measuring; mermaid/flowchart/sequence/plantuml/vega-lite figures with non-empty source and table figures get the ag-has-expand marker (C-51 T-006; visibility need-gated by expandNeed.js since T-010) — flowchart/sequence/plantuml figures and tables carry a button.ag-block-expand child, while mermaid/vega-lite figures instead carry the C-56 T-005 corner pill (div.ag-block-toolbar, replacing the PNG edit pencil and the standalone glyph; their expand action lives inside the pill under the same need gate). Nonempty Mermaid figures also get the stable appearance button (C-62).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.8.0 - 2026-10-18 merge of C-56 onto C-62: both the corner pill and the appearance button render on Mermaid figures.
//   - 2026-10-18 v1.7.0 (C-62): render the appearance button as a stable figure child on nonempty Mermaid blocks.
//   - 2026-10-18 v1.7.0: C-56 T-005 — mermaid (pele) and vega-lite
//     figures with non-empty source render the corner pill
//     (div.ag-block-toolbar, START_BLOCK_TOOLBAR_RENDER) instead of the
//     PNG edit pencil and the standalone button.ag-block-expand glyph;
//     they keep the ag-has-expand marker so expandNeed.js still gates the
//     pill's Open-full-screen button through ag-expand-needed. Empty
//     mermaid/vega-lite fences keep the pencil; html, multiplemath,
//     flowchart, sequence, plantuml and table figures are unchanged.
//   - (v1.0.0 implied: upstream muya, previously ungoverned.)
//   - 2026-10-13 v1.1.0: C-24 START_BLOCK_CALLOUT_RENDER: a `[!type]` blockquote gets ag-callout classes, a non-editable title row and view-only fold state.
//   - 2026-10-15 v1.2.0: C-39 T-001 START_BLOCK_TABLE_SCROLL_WRAPPER: the table element renders inside div.ag-table-scroll so wide tables scroll horizontally instead of overflowing the text column.
//   - 2026-10-15 v1.3.0: C-38 T-005 START_BLOCK_CODE_LINE_NUMBERS: fence/indent code blocks get the .line-numbers class and gutter rows when codeBlockLineNumbers is on (html/math/diagram/front-matter pre blocks stay gutter-free); every gutter rendered this pass is recorded for the post-render measurement instead of re-measuring the whole document.
//   - 2026-10-15 v1.4.0: C-39 T-002 START_BLOCK_TABLE_COLUMN_WIDTHS + START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE: session column widths render as a colgroup + table.ag-column-widths-fixed (auto layout kept when no widths are stored or the column count differs), and every th gains the invisible span.ag-column-resizer hit zone (skipped when disableTableColumnResize is on — the Split View mirror).
//   - 2026-10-16 v1.5.0: C-51 T-006 START_BLOCK_EXPAND_BUTTON: mermaid/flowchart/sequence/plantuml/vega-lite figures (non-empty source only) and table figures render the ag-has-expand marker plus button.ag-block-expand (drawn M-057 glyph, keyboard-focusable) as a direct figure child — the always-visible expand that opens the fullscreen block viewer. A figure child (not a preview child) survives the mermaid pipeline's innerHTML inserts and every snabbdom re-patch by construction.
//   - 2026-10-16 v1.6.0: C-51 T-010 (D-7): the marker and button are unchanged, but visibility is now need-gated — expandNeed.js toggles ag-expand-needed post-render and CSS keeps the button display:none without it (small diagrams/tables have no button and no Tab stop).
// END_CHANGE_SUMMARY

import { CLASS_OR_ID } from '../../../config'
import { renderTableTools } from './renderToolBar'
import { footnoteJumpIcon } from './renderFootnoteJump'
import { renderEditIcon } from './renderContainerEditIcon'
import renderLineNumberRows from './renderLineNumber'
import renderCopyButton from './renderCopyButton'
import renderExpandButton from './renderExpandButton'
import renderDiagramAppearance from './renderDiagramAppearance'
import renderBlockToolbar from './renderBlockToolbar'
import { renderLeftBar, renderBottomBar } from './renderTableDargBar'
import { renderColumnResizer } from './renderColumnResizer'
import { TABLE_FIXED_CLASS, sumWidths } from '../../../tableResize'
import { h } from '../snabbdom'
import { parseCalloutMarker } from '../../../utils/callout'
import { parseFrontMatterProps } from '../../../utils/frontMatterProps'

const PRE_BLOCK_HASH = {
  fencecode: `.${CLASS_OR_ID.AG_FENCE_CODE}`,
  indentcode: `.${CLASS_OR_ID.AG_INDENT_CODE}`,
  html: `.${CLASS_OR_ID.AG_HTML_BLOCK}`,
  frontmatter: `.${CLASS_OR_ID.AG_FRONT_MATTER}`,
  multiplemath: `.${CLASS_OR_ID.AG_MULTIPLE_MATH}`,
  flowchart: `.${CLASS_OR_ID.AG_FLOWCHART}`,
  sequence: `.${CLASS_OR_ID.AG_SEQUENCE}`,
  plantuml: `.${CLASS_OR_ID.AG_PLANTUML}`,
  mermaid: `.${CLASS_OR_ID.AG_MERMAID}`,
  'vega-lite': `.${CLASS_OR_ID.AG_VEGA_LITE}`
}

// C-38 T-005: editable source-code blocks. html/math/diagram sources are only
// visible while their figure is active and render one span per line, and the
// YAML front matter is metadata, so none of them get a gutter.
const CODE_LINE_NUMBER_FUNCTION_TYPES = /^(?:fencecode|indentcode)$/

// C-39 T-002: current column count of a table block, read structurally
// (thead > first tr > cells) so it can never drift from the rendered DOM.
const tableColumnCount = tableBlock => {
  const thead = tableBlock.children[0]
  const row = thead && thead.children ? thead.children[0] : null
  return row && row.children ? row.children.length : 0
}

export default function renderContainerBlock (parent, block, activeBlocks, matches, useCache = false, t) {
  let selector = this.getSelector(block, activeBlocks)
  const {
    key,
    align,
    type,
    headingStyle,
    editable,
    functionType,
    listType,
    listItemType,
    bulletMarkerOrDelimiter,
    isLooseListItem,
    lang,
    column
  } = block

  if (type === 'table') {
    this.renderingTable = block
  } else if (/thead|tbody/.test(type)) {
    this.renderingRowContainer = block
  }

  const children = block.children.map(child => this.renderBlock(block, child, activeBlocks, matches, useCache, t))
  const data = {
    attrs: {},
    dataset: {}
  }

  if (editable === false) {
    Object.assign(data.attrs, {
      contenteditable: 'false',
      spellcheck: 'false'
    })
  }

  if (/code|pre/.test(type)) {
    if (typeof lang === 'string' && !!lang) {
      selector += `.language-${lang.replace(/[#.]{1}/g, '')}`
    }
    if (type === 'pre') {
      children.unshift(renderCopyButton(t))
    }
    // START_BLOCK_CODE_LINE_NUMBERS
    // C-38 T-005 (#1648): the gutter is rendered for fence/indent code blocks
    // only. The pre carries the .line-numbers class (counter scope + gutter
    // padding); the code element gets the rows. Every gutter created in this
    // render pass is recorded so postRender measures exactly the code blocks
    // that were re-rendered — typing in one block never re-measures the rest.
    const wantsLineNumbers =
      !!this.muya.options.codeBlockLineNumbers &&
      (type === 'pre'
        ? CODE_LINE_NUMBER_FUNCTION_TYPES.test(functionType || '')
        : !!(parent && CODE_LINE_NUMBER_FUNCTION_TYPES.test(parent.functionType || '')))
    if (wantsLineNumbers) {
      if (type === 'pre') {
        selector += '.line-numbers'
      } else {
        children.unshift(renderLineNumberRows(block))
        this.lineNumberPreKeys.add(parent.key)
      }
    }
    // END_BLOCK_CODE_LINE_NUMBERS
    Object.assign(data.attrs, { spellcheck: 'false' })
  }

  if (/^(?:th|td)$/.test(type)) {
    const { cells } = this.muya.contentState.selectedTableCells || {}
    if (align) {
      Object.assign(data.attrs, {
        style: `text-align:${align}`
      })
    }

    if (typeof column === 'number') {
      Object.assign(data.dataset, {
        column
      })
    }

    if (cells && cells.length) {
      const cell = cells.find(c => c.key === key)
      if (cell) {
        const { top, right, bottom, left } = cell
        selector += '.ag-cell-selected'
        if (top) {
          selector += '.ag-cell-border-top'
        }
        if (right) {
          selector += '.ag-cell-border-right'
        }
        if (bottom) {
          selector += '.ag-cell-border-bottom'
        }
        if (left) {
          selector += '.ag-cell-border-left'
        }
      }
    } else {
      // Judge whether to render the table drag bar.
      const { renderingTable, renderingRowContainer } = this

      const findTable = renderingTable ? activeBlocks.find(b => b.key === renderingTable.key) : null
      if (findTable && renderingRowContainer) {
        const { row: tableRow, column: tableColumn } = findTable
        const isLastRow = () => {
          if (renderingRowContainer.type === 'thead') {
            return tableRow === 0
          } else {
            return !parent.nextSibling
          }
        }
        if (block.parent === activeBlocks[1].parent && !block.preSibling && tableRow > 0) {
          children.unshift(renderLeftBar())
        }

        if (column === activeBlocks[1].column && isLastRow() && tableColumn > 0) {
          children.push(renderBottomBar())
        }
      }
    }
  } else if (/^h/.test(type)) {
    if (/^h\d$/.test(type)) {
      // TODO: This should be the best place to create and update the TOC.
      //       Cache `block.key` and title and update only if necessary.
      Object.assign(data.dataset, {
        head: type
      })
      selector += `.${headingStyle}`
    }
    Object.assign(data.dataset, {
      role: type
    })
  } else if (type === 'figure') {
    // START_BLOCK_TOOLBAR_RENDER
    // C-56 T-005: on ```mermaid (pele) and ```vega-lite figures with
    // non-empty source the corner pill (renderBlockToolbar.js) REPLACES
    // the PNG edit pencil AND the standalone expand glyph — its Edit
    // source action is the same container edit action, its Open full
    // screen action the same viewer dispatch, and Copy as image is the
    // C-56 transport. The other roles keep today's icons. The source
    // lookup is computed once for the five viewable diagram roles and
    // reused by the expand marker below (same `code === ''` emptiness
    // rule renderLeafBlock uses for the "empty diagram" placeholder).
    let diagramHasSource = false
    if (/^(?:flowchart|mermaid|sequence|plantuml|vega-lite)$/.test(functionType)) {
      const preBlock = block.children.find(child => child.type === 'pre')
      const code = preBlock ? this.codeCache.get(preBlock.key) : ''
      diagramHasSource = typeof code === 'string' && code !== ''
    }
    const pillFigure = diagramHasSource && /^(?:mermaid|vega-lite)$/.test(functionType)

    if (functionType) {
      Object.assign(data.dataset, { role: functionType.toUpperCase() })
      if (functionType === 'table' && activeBlocks[0] && activeBlocks[0].functionType === 'cellContent') {
        children.unshift(renderTableTools(activeBlocks, t))
      } else if (pillFigure) {
        // A figure child (like the old glyph) so the mermaid pipeline's
        // preview innerHTML inserts and every snabbdom re-patch keep the
        // pill alive by construction.
        children.push(renderBlockToolbar(t))
      } else if (functionType !== 'footnote') {
        children.unshift(renderEditIcon(t))
      } else {
        children.push(footnoteJumpIcon())
      }
    }
    // END_BLOCK_TOOLBAR_RENDER

    if (
      /html|multiplemath|flowchart|mermaid|sequence|plantuml|vega-lite/.test(functionType)
    ) {
      selector += `.${CLASS_OR_ID.AG_CONTAINER_BLOCK}`
      Object.assign(data.attrs, { spellcheck: 'false' })
    }

    // START_BLOCK_EXPAND_BUTTON
    // C-51 T-006 (R-4) + T-010 (D-7): every viewable figure gets the
    // expand affordance as a DIRECT FIGURE CHILD. The figure is never
    // touched by the mermaid pipeline (which replaces the preview div's
    // innerHTML) and the button rides the vnode tree, so it survives every
    // re-patch by construction — no post-render DOM pass. The
    // ag-has-expand marker scopes the CSS and the expandNeed.js
    // evaluation; VISIBILITY is need-gated: expandNeed.js toggles
    // ag-expand-needed after each render (scaled/tall diagram,
    // overflowing/tall table) and CSS keeps the button display:none
    // without it — small blocks have no button and no Tab stop. Scope: the
    // five diagram types with non-empty source and tables.
    // html/multiplemath figures are deliberately out of scope. C-56 T-005:
    // mermaid/vega-lite figures carry the marker for the need gate but NOT
    // the standalone glyph — their expand action lives inside the corner
    // pill (button.ag-block-toolbar-expand, gated by the same class).
    if (/^(?:flowchart|mermaid|sequence|plantuml|vega-lite)$/.test(functionType)) {
      if (diagramHasSource) {
        selector += '.ag-has-expand'
        if (functionType === 'mermaid') children.push(renderDiagramAppearance(t, code))
        if (!pillFigure) {
          children.push(renderExpandButton(t))
        }
      }
    } else if (functionType === 'table') {
      selector += '.ag-has-expand'
      // First child: Chromium makes the overflowing C-39 scroll wrapper a
      // keyboard-focusable scroller, so a button AFTER it would be reached
      // only after the scroll region. Absolute positioning keeps the look.
      children.unshift(renderExpandButton(t))
    }
    // END_BLOCK_EXPAND_BUTTON
  } else if (/ul|ol/.test(type) && listType) {
    selector += `.ag-${listType}-list`
    if (type === 'ol') {
      Object.assign(data.attrs, { start: block.start })
    }
  } else if (type === 'li' && listItemType) {
    Object.assign(data.dataset, { marker: bulletMarkerOrDelimiter })
    selector += `.${CLASS_OR_ID.AG_LIST_ITEM}`
    selector += `.ag-${listItemType}-list-item`
    selector += isLooseListItem ? `.${CLASS_OR_ID.AG_LOOSE_LIST_ITEM}` : `.${CLASS_OR_ID.AG_TIGHT_LIST_ITEM}`
  } else if (type === 'blockquote') {
    // START_BLOCK_CALLOUT_RENDER
    // C-24: a blockquote whose first line is `[!type]` renders as a callout:
    // per-style class, a non-editable title row, optional fold. Fold state is
    // view-only (contentState.calloutFolds); the markdown is never rewritten.
    const firstP = block.children[0]
    const firstSpan = firstP && firstP.type === 'p' ? firstP.children[0] : null
    const callout = firstSpan && firstSpan.functionType === 'paragraphContent'
      ? parseCalloutMarker(firstSpan.text)
      : null
    if (callout) {
      selector += `.ag-callout.ag-callout-${callout.style}`
      Object.assign(data.dataset, { calloutType: callout.type })
      if (callout.fold) {
        const folds = this.muya.contentState.calloutFolds
        const collapsed = folds && folds.has(key) ? folds.get(key) : callout.fold === 'collapsed'
        selector += collapsed ? '.ag-callout-foldable.ag-callout-collapsed' : '.ag-callout-foldable'
      }
      children.unshift(h('div.ag-callout-title', {
        attrs: { contenteditable: 'false' },
        dataset: { calloutKey: key }
      }, [
        h('span.ag-callout-icon'),
        h('span.ag-callout-title-text', callout.title),
        ...(callout.fold ? [h('span.ag-callout-fold')] : [])
      ]))
    }
    // END_BLOCK_CALLOUT_RENDER
  } else if (type === 'pre') {
    Object.assign(data.attrs, { spellcheck: 'false' })
    Object.assign(data.dataset, { role: functionType })
    selector += PRE_BLOCK_HASH[block.functionType]

    if (/html|multiplemath|mermaid|flowchart|vega-lite|sequence|plantuml/.test(functionType)) {
      const codeBlock = block.children[0]
      const code = codeBlock.children.map(line => line.text).join('\n')
      this.codeCache.set(block.key, code)
    }

    // START_BLOCK_FRONT_MATTER_VIEW
    // C-24 R-8: YAML front matter shows as a read-only properties table until
    // the cursor enters it; then the editable YAML returns. View only: the
    // table is never written back.
    if (functionType === 'frontmatter' && this.muya.options.frontmatterProperties !== false &&
      block.lang === 'yaml' && !activeBlocks.some(b => b.key === key)) {
      const codeBlock = block.children[0]
      const yaml = codeBlock ? codeBlock.children.map(line => line.text).join('\n') : ''
      const rows = parseFrontMatterProps(yaml)
      if (rows) {
        selector += '.ag-front-matter-props'
        children.push(h('div.ag-front-matter-table', {
          attrs: { contenteditable: 'false' },
          dataset: { frontMatterKey: key }
        }, rows.map(({ key: name, value }) => h('div.ag-fm-row', [
          h('span.ag-fm-key', name),
          h('span.ag-fm-value', Array.isArray(value)
            ? value.map(item => h('span.ag-fm-chip', item))
            : value)
        ]))))
      }
    }
    // END_BLOCK_FRONT_MATTER_VIEW
  }

  if (!block.parent) {
    children.unshift(this.renderIcon(block, t))
  }

  // START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE
  // C-39 T-002: an invisible ~6px hit zone on every header cell's right
  // border (th is position:relative in the themes). The gesture itself
  // lives in muya.tableResize (capture-phase pointer listeners on the
  // editor container); the vnode only supplies the target, and the column
  // index is resolved at event time from the th's cellIndex. Header row
  // only — body cells stay free of extra children so cell selection and
  // copy never walk an unexpected node. Skipped entirely on surfaces that
  // disable the affordance (the read-only Split View mirror).
  if (type === 'th' && this.muya.tableResize && this.muya.tableResize.enabled()) {
    children.push(renderColumnResizer())
  }
  // END_BLOCK_TABLE_COLUMN_RESIZER_HANDLE

  // START_BLOCK_TABLE_SCROLL_WRAPPER
  // C-39 T-001: a table wider than the text column must scroll inside it.
  // The scroll container is a wrapper between the figure and the table
  // (not the figure itself) because the table tools bar sits at
  // top:-22px and the front icon at left:-35px relative to the figure —
  // overflow on the figure would clip both. Every table mouse handler
  // (drag bars, cell selection, click→caret) resolves its targets with
  // closest('th'|'td'|'tr'|'table') from inside the table, so the extra
  // ancestor is transparent to them; the drag bars stay children of their
  // cells. Export/print renders its own HTML from markdown and never sees
  // this wrapper. Sizing/shadow rules live in the C-39 section of
  // lib/assets/styles/index.css.
  if (type === 'table') {
    // START_BLOCK_TABLE_COLUMN_WIDTHS
    // C-39 T-002: session column widths are part of the vnode, so EVERY
    // muya re-render re-applies them by construction (the table DOM is
    // rebuilt from this vnode on each keystroke; inline styles applied
    // post-render would be dropped). A stored entry whose column count no
    // longer matches renders auto here and is reconciled right after the
    // patch by muya.tableResize.reconcileAfterRender (see render/index.js
    // START_BLOCK_TABLE_WIDTHS_KEEP). Tables without widths keep the
    // C-39 T-001 auto layout untouched.
    const tableResize = this.muya.tableResize
    const widthEntry = tableResize
      ? tableResize.getRenderWidths(key, tableColumnCount(block))
      : null
    if (widthEntry) {
      selector += `.${TABLE_FIXED_CLASS}`
      data.style = Object.assign({}, data.style, {
        width: `${sumWidths(widthEntry.widths)}px`
      })
      children.unshift(
        h('colgroup', {}, widthEntry.widths.map(w => h('col', { style: { width: `${w}px` } })))
      )
    }
    // END_BLOCK_TABLE_COLUMN_WIDTHS
    return h('div.ag-table-scroll', {}, [h(selector, data, children)])
  }
  // END_BLOCK_TABLE_SCROLL_WRAPPER

  return h(selector, data, children)
}
