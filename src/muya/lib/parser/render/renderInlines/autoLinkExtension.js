// FILE: src/muya/lib/parser/render/renderInlines/autoLinkExtension.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Render automatic URL/email links with stable token metadata.
//   SCOPE: Existing URI construction and inline identity; no scheme-policy expansion.
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
export default function autoLinkExtension (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const { linkType, www, url, email } = token
  const metadata = linkMetadata(token, className === CLASS_OR_ID.AG_HIDE)
  const { start, end } = token.range

  const content = this.highlight(h, block, start, end, token)
  const hyperlink = linkType === 'www' ? encodeURI(`http://${www}`) : (linkType === 'url' ? encodeURI(url) : `mailto:${email}`)

  return [
    h(`a.${CLASS_OR_ID.AG_INLINE_RULE}.${CLASS_OR_ID.AG_AUTO_LINK_EXTENSION}`, {
      dataset: metadata,
      attrs: {
        spellcheck: 'false'
      },
      props: {
        href: sanitizeHyperlink(hyperlink),
        target: '_blank'
      }
    }, content)
  ]
}
