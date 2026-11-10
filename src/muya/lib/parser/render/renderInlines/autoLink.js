// FILE: src/muya/lib/parser/render/renderInlines/autoLink.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Render autolinks with stable metadata for owned link gestures.
//   SCOPE: Existing autolink URI and source syntax; no destination-policy changes.
//   DEPENDS: Existing Muya inline/event APIs and getLinkInfo ownership helpers.
//   LINKS: M-012; C-MD-LINK-TABS.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   default - Preserved module entry with scoped logical-link behavior.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-10 C-MD-LINK-TABS: stable container-local hit testing and cancellable hover ownership; canonical Markdown unchanged.
// END_CHANGE_SUMMARY
import { CLASS_OR_ID } from '../../../config'
import { linkMetadata } from '../../../utils/getLinkInfo'
import { sanitizeHyperlink } from '../../../utils/url'

// render auto_link to vdom
export default function autoLink (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const { isLink, marker, href, email } = token
  const metadata = linkMetadata(token, className === CLASS_OR_ID.AG_HIDE)
  const syntax = { dataset: metadata }
  const { start, end } = token.range

  const startMarker = this.highlight(h, block, start, start + marker.length, token)
  const endMarker = this.highlight(h, block, end - marker.length, end, token)
  const content = this.highlight(h, block, start + marker.length, end - marker.length, token)

  const hyperlink = isLink ? encodeURI(href) : `mailto:${email}`
  return [
    h(`span.${className}`, syntax, startMarker),
    h(`a.${CLASS_OR_ID.AG_INLINE_RULE}.${CLASS_OR_ID.AG_AUTO_LINK}`, {
      dataset: metadata,
      attrs: {
        spellcheck: 'false'
      },
      props: {
        href: sanitizeHyperlink(hyperlink),
        target: '_blank'
      }
    }, content),
    h(`span.${className}`, syntax, endMarker)
  ]
}
