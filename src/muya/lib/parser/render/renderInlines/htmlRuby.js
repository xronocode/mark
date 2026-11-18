import { CLASS_OR_ID, PREVIEW_DOMPURIFY_CONFIG } from '../../../config'
import { sanitize } from '../../../utils'
import { htmlToVNode } from '../snabbdom'

export default function htmlRuby (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const { children } = token
  const { start, end } = token.range
  const content = this.highlight(h, block, start, end, token)
  // token.raw is attacker-controlled document HTML; sanitize it with the
  // same DOMPurify pass the HTML-block preview uses (#282) before it
  // reaches htmlToVNode's innerHTML sink.
  const { disableHtml } = this.muya.options
  const vNode = htmlToVNode(sanitize(token.raw, PREVIEW_DOMPURIFY_CONFIG, disableHtml))

  const previewSelector = `span.${CLASS_OR_ID.AG_RUBY_RENDER}`

  return children
    ? [
      h(`span.${className}.${CLASS_OR_ID.AG_RUBY}`, [
        h(`span.${CLASS_OR_ID.AG_INLINE_RULE}.${CLASS_OR_ID.AG_RUBY_TEXT}`, content),
        h(previewSelector, {
          attrs: {
            contenteditable: 'false',
            spellcheck: 'false'
          }
        }, vNode)
      ])
  // if children is empty string, no need to render ruby charactors...
    ]
    : [
      h(`span.${className}.${CLASS_OR_ID.AG_RUBY}`, [
        h(`span.${CLASS_OR_ID.AG_INLINE_RULE}.${CLASS_OR_ID.AG_RUBY_TEXT}`, content)
      ])
    ]
}
