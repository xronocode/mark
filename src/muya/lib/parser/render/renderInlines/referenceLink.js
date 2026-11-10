// FILE: src/muya/lib/parser/render/renderInlines/referenceLink.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Render reference links with the same logical token identity across syntax expansion.
//   SCOPE: Existing reference resolution and inline metadata; unresolved references remain text.
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
import { snakeToCamel } from '../../../utils'
import { linkMetadata } from '../../../utils/getLinkInfo'
import { sanitizeHyperlink } from '../../../utils/url'

export default function referenceLink (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const labelClass = className === CLASS_OR_ID.AG_GRAY
    ? CLASS_OR_ID.AG_REFERENCE_LABEL
    : className

  const metadata = linkMetadata(token, className === CLASS_OR_ID.AG_HIDE)
  const syntax = { dataset: metadata }
  const { start, end } = token.range
  const {
    anchor,
    children,
    backlash,
    isFullLink,
    label
  } = token
  const MARKER = '['
  const key = (label + backlash.second).toLowerCase()
  const backlashStart = start + MARKER.length + anchor.length
  const content = [
    ...children.reduce((acc, to) => {
      const chunk = this[snakeToCamel(to.type)](h, cursor, block, to, className)
      return Array.isArray(chunk) ? [...acc, ...chunk] : [...acc, chunk]
    }, []),
    ...this.backlashInToken(h, backlash.first, className, backlashStart, token)
  ]

  const { href, title } = this.labels.get(key)
  const startMarker = this.highlight(
    h,
    block,
    start,
    start + MARKER.length,
    token
  )
  const endMarker = this.highlight(
    h,
    block,
    start + MARKER.length + anchor.length + backlash.first.length,
    end,
    token
  )
  const anchorSelector = href ? `a.${CLASS_OR_ID.AG_INLINE_RULE}.${CLASS_OR_ID.AG_REFERENCE_LINK}` : `span.${CLASS_OR_ID.AG_REFERENCE_LINK}`
  const data = {
    attrs: {
      spellcheck: 'false'
    },
    props: {
      title
    },
    dataset: metadata
  }
  if (href) {
    Object.assign(data.props, { href: sanitizeHyperlink(href) })
  }

  if (isFullLink) {
    const labelContent = this.highlight(
      h,
      block,
      start + 3 * MARKER.length + anchor.length + backlash.first.length,
      end - MARKER.length - backlash.second.length,
      token
    )
    const middleMarker = this.highlight(
      h,
      block,
      start + MARKER.length + anchor.length + backlash.first.length,
      start + 3 * MARKER.length + anchor.length + backlash.first.length,
      token
    )
    const lastMarker = this.highlight(
      h,
      block,
      end - MARKER.length,
      end,
      token
    )
    const secondBacklashStart = end - MARKER.length - backlash.second.length

    return [
      h(`span.${className}`, syntax, startMarker),
      h(anchorSelector, data, content),
      h(`span.${className}`, syntax, middleMarker),
      h(`span.${labelClass}`, syntax, labelContent),
      ...this.backlashInToken(h, backlash.second, className, secondBacklashStart, token),
      h(`span.${className}`, syntax, lastMarker)
    ]
  } else {
    return [
      h(`span.${className}`, syntax, startMarker),
      h(anchorSelector, data, content),
      h(`span.${className}`, syntax, endMarker)
    ]
  }
}
