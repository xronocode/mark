// MODULE_CONTRACT
//   PURPOSE: Render exported HTML for the current markdown document,
//            including syntax highlighting, KaTeX, diagrams, and export-only
//            stylesheet assembly and shared per-diagram appearance (C-62).
//   SCOPE:   Export-only DOM/CSS generation. Does not mutate the live editor
//            runtime beyond reusing shared renderers and CSS assets.
//   DEPENDS: marked, Prism, katex, renderer loaders, inline CSS assets,
//            utils/diagramAppearance (local palettes and readonly overrides),
//            sanitize helpers, parser/render/diagramTheme (C-55 pele
//            variables), parser/render/peleOptions (C-55 per-type options),
//            parser/render/contentTheme (C-51 T-005 diagram theming).
//   LINKS: docs/knowledge-graph.xml M-012; docs/verification-plan.xml
//          V-M-012 export scenarios; .grace/changes/active/C-39 T-001;
//          .grace/changes/active/C-51 T-003 (export uses the app theme)
//          and T-005 (vega-lite/flowchart/sequence export with the same
//          themed configs as the editor).
//   STATUS: Screen layout CSS no longer uses `@media not print`; print
//          behavior stays isolated in the dedicated `@media print` block.
//
// MODULE_MAP
//   ExportHtml.renderPele - shared appearance policy on each standalone diagram, including indexed read-only overrides.
// CHANGE_SUMMARY:
//   - 2026-10-18 C-62: apply the shared per-diagram appearance policy and temporary read-only overrides to standalone HTML diagrams.
//   - 2026-10-17 C-55: ```mermaid blocks export through pele (renderPele —
//     synchronous render, escaped labels, no securityLevel config); the
//     export document inlines the --pele-* variable block resolved from the
//     live theme so the diagrams carry their colours standalone; the
//     container keeps the `mermaid` class for the print stylesheet.
//   - 2026-10-16 C-51 T-005: exported vega-lite, flowchart.js and
//     sequence diagrams use the same theme-driven configs as the editor
//     (contentTheme.js — tokens read from the live document at export
//     time; vega gets a token-built config instead of the hard-coded
//     latimes theme, and js-sequence is repainted after drawing), and a
//     null muya no longer crashes the sequence branch.
//   - 2026-10-16 C-51 T-003: exported Mermaid diagrams use the same
//     theme-driven config as the editor (mermaidTheme.js — tokens read from
//     the live document's CSS variables at export time, per-diagram-type
//     initialize), replacing the old default/dark flip.
//   - 2026-05-21 drag-theme-refactor: remove `@media not print` from the
//     export HTML stylesheet so bundle-level grep stays clean without
//     changing the dedicated print rules below.
//   - 2026-10-15 C-39 T-001: exported tables wrap instead of scrolling —
//     no scroll container exists in export HTML, so cells use
//     overflow-wrap: anywhere and the table is capped at the article width
//     to keep every column visible in PDF.

import marked from '../parser/marked'
import Prism from 'prismjs'
import { getKatex, loadKatex } from './lazy-katex'
import loadRenderer from '../renderers'
import {
  readActiveThemeTokens,
  buildPeleVariables
} from '../parser/render/diagramTheme'
import { buildPeleRenderOptions } from '../parser/render/peleOptions'
import { applyDiagramAppearance } from './diagramAppearance'
import {
  buildVegaThemeConfig,
  buildFlowchartThemeOptions,
  buildSequenceThemeOptions,
  applySequenceTheme,
  applySequenceThemeWhenDrawn
} from '../parser/render/contentTheme'
import githubMarkdownCss from 'github-markdown-css/github-markdown.css?inline'
import exportStyle from '../assets/styles/exportStyle.css?inline'
import highlightCss from 'prismjs/themes/prism.css?inline'
import footerHeaderCss from '../assets/styles/headerFooterStyle.css?inline'
import { EXPORT_DOMPURIFY_CONFIG } from '../config'
import { sanitize, unescapeHTML } from '../utils'
import { validEmoji } from '../ui/emojis'

export const getSanitizeHtml = (markdown, options) => {
  const html = marked(markdown, options)
  return sanitize(html, EXPORT_DOMPURIFY_CONFIG, false)
}

const DIAGRAM_TYPE = ['mermaid', 'flowchart', 'sequence', 'plantuml', 'vega-lite']

class ExportHtml {
  constructor(markdown, muya) {
    this.markdown = markdown
    this.muya = muya
    this.exportContainer = null
    this.mathRendererCalled = false
  }

  // START_BLOCK_EXPORT_PELE_RENDER
  // C-55: the export renders ```mermaid blocks with pele — synchronous,
  // DOM-free, XSS-safe by construction (labels escaped, javascript: links
  // stripped — no securityLevel config anymore). Colours do NOT ride the
  // SVG: the emitted markup resolves var(--pele-*), and generate() inlines
  // the variable block resolved from the live theme at export time, so the
  // standalone file looks like the editor. The container keeps the
  // `mermaid` class the print stylesheet centres on.
  async renderPele() {
    const codes = this.exportContainer.querySelectorAll('code.language-mermaid')
    const pele = await loadRenderer('pele')
    const tokens = readActiveThemeTokens()
    let index = 0
    for (const code of codes) {
      const preEle = code.parentNode
      const peleContainer = document.createElement('div')
      peleContainer.classList.add('mermaid')
      preEle.replaceWith(peleContainer)
      try {
        const rawCode = unescapeHTML(code.innerHTML)
        const rendered = pele.render(rawCode, {
          idPrefix: `pele-export-${index++}`,
          ...buildPeleRenderOptions(pele.detectType(rawCode), tokens)
        })
        peleContainer.innerHTML = rendered.svg
        applyDiagramAppearance(peleContainer, rawCode, this.muya?.diagramAppearance?.getExportOverride(index - 1, rawCode))
      } catch (err) {
        peleContainer.innerHTML = '< Invalid Mermaid Codes >'
      }
    }
  }
  // END_BLOCK_EXPORT_PELE_RENDER

  async renderDiagram() {
    const selector =
      'code.language-vega-lite, code.language-flowchart, code.language-sequence, code.language-plantuml'
    const RENDER_MAP = {
      flowchart: await loadRenderer('flowchart'),
      sequence: await loadRenderer('sequence'),
      plantuml: await loadRenderer('plantuml'),
      'vega-lite': await loadRenderer('vega-lite')
    }
    // C-51 T-005: the same theme-driven configs as the editor — tokens
    // are read from the live document (the export container is attached
    // to it) at export time; the user's own vega spec config still wins
    // (vega-embed merges spec.config over the passed config).
    const tokens = readActiveThemeTokens()
    const codes = this.exportContainer.querySelectorAll(selector)
    for (const code of codes) {
      const rawCode = unescapeHTML(code.innerHTML)
      const functionType = (() => {
        if (/sequence/.test(code.className)) {
          return 'sequence'
        } else if (/plantuml/.test(code.className)) {
          return 'plantuml'
        } else if (/flowchart/.test(code.className)) {
          return 'flowchart'
        } else {
          return 'vega-lite'
        }
      })()
      const render = RENDER_MAP[functionType]
      const preParent = code.parentNode
      const diagramContainer = document.createElement('div')
      diagramContainer.classList.add(functionType)
      preParent.replaceWith(diagramContainer)
      const options = {}
      if (functionType === 'sequence') {
        Object.assign(
          options,
          buildSequenceThemeOptions(tokens, this.muya ? this.muya.options.sequenceTheme : undefined)
        )
      } else if (functionType === 'flowchart') {
        Object.assign(options, buildFlowchartThemeOptions(tokens))
      } else if (functionType === 'vega-lite') {
        Object.assign(options, {
          actions: false,
          tooltip: false,
          renderer: 'svg',
          config: buildVegaThemeConfig(tokens)
        })
      }
      try {
        if (functionType === 'flowchart' || functionType === 'sequence') {
          const diagram = render.parse(rawCode)
          diagramContainer.innerHTML = ''
          diagram.drawSVG(diagramContainer, options)
          if (functionType === 'sequence') {
            // js-sequence hard-codes #000/#fff — repaint from the tokens.
            applySequenceTheme(diagramContainer, tokens)
          }
        }
        if (functionType === 'plantuml') {
          const diagram = render.parse(rawCode)
          diagramContainer.innerHTML = ''
          diagram.insertImgElement(diagramContainer)
        }
        if (functionType === 'vega-lite') {
          await render(diagramContainer, JSON.parse(rawCode), options)
        }
      } catch (err) {
        diagramContainer.innerHTML = '< Invalid Diagram >'
      }
    }
  }

  mathRenderer = (math, displayMode) => {
    this.mathRendererCalled = true
    const katex = getKatex()
    if (!katex) {
      return displayMode
        ? `<pre class="multiple-math">\n${math}</pre>\n`
        : `<span class="inline-math">${math}</span>`
    }

    try {
      return katex.renderToString(math, {
        displayMode
      })
    } catch (err) {
      return displayMode
        ? `<pre class="multiple-math invalid">\n${math}</pre>\n`
        : `<span class="inline-math invalid" title="invalid math">${math}</span>`
    }
  }

  // render pure html by marked
  async renderHtml(toc) {
    await loadKatex()
    this.mathRendererCalled = false
    let html = marked(this.markdown, {
      superSubScript: this.muya ? this.muya.options.superSubScript : false,
      footnote: this.muya ? this.muya.options.footnote : false,
      isGitlabCompatibilityEnabled: this.muya
        ? this.muya.options.isGitlabCompatibilityEnabled
        : false,
      highlight(code, lang) {
        // Language may be undefined (GH#591)
        if (!lang) {
          return code
        }

        if (DIAGRAM_TYPE.includes(lang)) {
          return code
        }

        const grammar = Prism.languages[lang]
        if (!grammar) {
          console.warn(`Unable to find grammar for "${lang}".`)
          return code
        }
        return Prism.highlight(code, grammar, lang)
      },
      emojiRenderer(emoji) {
        const validate = validEmoji(emoji)
        if (validate) {
          return validate.emoji
        } else {
          return `:${emoji}:`
        }
      },
      mathRenderer: this.mathRenderer,
      tocRenderer() {
        if (!toc) {
          return ''
        }
        return toc
      }
    })

    html = sanitize(html, EXPORT_DOMPURIFY_CONFIG, false)

    const exportContainer = (this.exportContainer = document.createElement('div'))
    exportContainer.classList.add('ag-render-container')
    exportContainer.innerHTML = html
    document.body.appendChild(exportContainer)

    // Diagrams: pele's renders are synchronous once the module is loaded;
    // the async diagram renderers (flowchart/sequence/plantuml/vega-lite)
    // follow.
    await this.renderPele()
    await this.renderDiagram()
    let result = exportContainer.innerHTML
    exportContainer.remove()

    // hack to add arrow marker to output html
    const pathes = document.querySelectorAll('path[id^=raphael-marker-]')
    const def = '<defs style="-webkit-tap-highlight-color: rgba(0, 0, 0, 0);">'
    result = result.replace(def, () => {
      let str = ''
      for (const path of pathes) {
        str += path.outerHTML
      }
      return `${def}${str}`
    })

    this.exportContainer = null
    return result
  }

  /**
   * Get HTML with style
   *
   * @param {*} options Document options
   */
  async generate(options) {
    const { printOptimization } = options

    // WORKAROUND: Hide Prism.js style when exporting or printing. Otherwise the background color is white in the dark theme.
    const highlightCssStyle = printOptimization ? `@media print { ${highlightCss} }` : highlightCss
    const html = this._prepareHtml(await this.renderHtml(options.toc), options)
    const katexCssStyle = this.mathRendererCalled
      ? (await import('katex/dist/katex.css?inline')).default
      : ''
    this.mathRendererCalled = false

    // `extraCss` may changed in the mean time.
    const { title, extraCss } = options
    // C-55: the pele diagram variables of the theme active at export time —
    // the exported SVGs resolve them, so the file is standalone.
    const peleVars = buildPeleVariables(readActiveThemeTokens())
    const peleVarsCss = Object.entries(peleVars)
      .map(([name, value]) => `${name}: ${value};`)
      .join('\n    ')
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${sanitize(title, EXPORT_DOMPURIFY_CONFIG, true)}</title>
  <style>
  ${githubMarkdownCss}
  </style>
  <style>
  ${highlightCssStyle}
  </style>
  <style>
  ${katexCssStyle}
  </style>
  <style>
    .markdown-body {
      font-family: -apple-system,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji;
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }

    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }

    .hf-container {
      color: #24292e;
      line-height: 1.3;
    }

    .markdown-body .highlight pre,
    .markdown-body pre {
      white-space: pre-wrap;
    }
    /* C-39 T-001: export has no scroll container (the editor wrapper
     * div.ag-table-scroll never exists here), so a wide table must wrap
     * to the article width — every column stays visible in PDF. */
    .markdown-body table {
      display: table;
      max-width: 100%;
      margin-left: auto;
      margin-right: auto;
    }
    .markdown-body table th,
    .markdown-body table td {
      overflow-wrap: anywhere;
    }
    .markdown-body img[data-align="center"] {
      display: block;
      margin: 0 auto;
    }
    .markdown-body img[data-align="right"] {
      display: block;
      margin: 0 0 0 auto;
    }
    .markdown-body li.task-list-item {
      list-style-type: none;
    }
    .markdown-body li > [type=checkbox] {
      margin: 0 0 0 -1.3em;
    }
    .markdown-body input[type="checkbox"] ~ p {
      margin-top: 0;
      display: inline-block;
    }
    .markdown-body ol ol,
    .markdown-body ul ol {
      list-style-type: decimal;
    }
    .markdown-body ol ol ol,
    .markdown-body ol ul ol,
    .markdown-body ul ol ol,
    .markdown-body ul ul ol {
      list-style-type: decimal;
    }
  </style>
  <style>:root { ${peleVarsCss} }</style>
  <style>${exportStyle}</style>
  <style>${extraCss}</style>
</head>
<body>
  ${html}
</body>
</html>`
  }

  /**
   * @private
   *
   * @param {string} html The converted HTML text.
   * @param {*} options The export options.
   */
  _prepareHtml(html, options) {
    const { header, footer } = options
    const appendHeaderFooter = !!header || !!footer
    if (!appendHeaderFooter) {
      return createMarkdownArticle(html)
    }

    if (!options.extraCss) {
      options.extraCss = footerHeaderCss
    } else {
      options.extraCss = footerHeaderCss + options.extraCss
    }

    let output = HF_TABLE_START
    if (header) {
      output += createTableHeader(options)
    }

    if (footer) {
      output += HF_TABLE_FOOTER
      output = createRealFooter(options) + output
    }

    output = output + createTableBody(html) + HF_TABLE_END
    return sanitize(output, EXPORT_DOMPURIFY_CONFIG, false)
  }
}

// Variables and function to generate the header and footer.
const HF_TABLE_START = '<table class="page-container">'
const createTableBody = (html) => {
  return `<tbody><tr><td>
  <div class="main-container">
    ${createMarkdownArticle(html)}
  </div>
</td></tr></tbody>`
}
const HF_TABLE_END = '</table>'

/// The header at is shown at the top.
const createTableHeader = (options) => {
  const { header, headerFooterStyled } = options
  const { type, left, center, right } = header
  let headerClass = type === 1 ? 'single' : ''
  headerClass += getHeaderFooterStyledClass(headerFooterStyled)
  return `<thead class="page-header ${headerClass}"><tr><th>
  <div class="hf-container">
    <div class="header-content-left">${left}</div>
    <div class="header-content">${center}</div>
    <div class="header-content-right">${right}</div>
  </div>
</th></tr></thead>`
}

/// Fake footer to reserve space.
const HF_TABLE_FOOTER = `<tfoot class="page-footer-fake"><tr><td>
  <div class="hf-container">
    &nbsp;
  </div>
</td></tr></tfoot>`

/// The real footer at is shown at the bottom.
const createRealFooter = (options) => {
  const { footer, headerFooterStyled } = options
  const { type, left, center, right } = footer
  let footerClass = type === 1 ? 'single' : ''
  footerClass += getHeaderFooterStyledClass(headerFooterStyled)
  return `<div class="page-footer ${footerClass}">
  <div class="hf-container">
    <div class="footer-content-left">${left}</div>
    <div class="footer-content">${center}</div>
    <div class="footer-content-right">${right}</div>
  </div>
</div>`
}

/// Generate the mardown article HTML.
const createMarkdownArticle = (html) => {
  return `<article class="markdown-body">${html}</article>`
}

/// Return the class whether a header/footer should be styled.
const getHeaderFooterStyledClass = (value) => {
  if (value === undefined) {
    // Prefer theme settings.
    return ''
  }
  return !value ? ' simple' : ' styled'
}

export default ExportHtml
