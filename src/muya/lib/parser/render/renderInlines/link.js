// FILE: src/muya/lib/parser/render/renderInlines/link.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Render inline Markdown links with stable token metadata on anchor and syntax nodes.
//   SCOPE: Existing source syntax and token range; no wrapper or document-model changes.
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
import { isLengthEven, snakeToCamel } from '../../../utils'
import { linkMetadata } from '../../../utils/getLinkInfo'
import { sanitizeHyperlink } from '../../../utils/url'

// 'link': /^(\[)((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*?)(\\*)\]\((.*?)(\\*)\)/, // can nest
export default function link(h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const linkClassName =
    className === CLASS_OR_ID.AG_HIDE ? className : CLASS_OR_ID.AG_LINK_IN_BRACKET
  const metadata = linkMetadata(token, className === CLASS_OR_ID.AG_HIDE)
  const syntax = { dataset: metadata }
  const { start, end } = token.range
  const firstMiddleBracket = this.highlight(h, block, start, start + 3, token)

  const firstBracket = this.highlight(h, block, start, start + 1, token)
  const middleBracket = this.highlight(
    h,
    block,
    start + 1 + token.anchor.length + token.backlash.first.length,
    start + 1 + token.anchor.length + token.backlash.first.length + 2,
    token
  )
  const hrefContent = this.highlight(
    h,
    block,
    start + 1 + token.anchor.length + token.backlash.first.length + 2,
    start + 1 + token.anchor.length + token.backlash.first.length + 2 + token.hrefAndTitle.length,
    token
  )
  const middleHref = this.highlight(
    h,
    block,
    start + 1 + token.anchor.length + token.backlash.first.length,
    block,
    start + 1 + token.anchor.length + token.backlash.first.length + 2 + token.hrefAndTitle.length,
    token
  )

  const lastBracket = this.highlight(h, block, end - 1, end, token)
  const firstBacklashStart = start + 1 + token.anchor.length
  const secondBacklashStart = end - 1 - token.backlash.second.length

  if (isLengthEven(token.backlash.first) && isLengthEven(token.backlash.second)) {
    if (!token.children.length && !token.backlash.first) {
      // no-text-link
      return [
        h(`span.${CLASS_OR_ID.AG_GRAY}.${CLASS_OR_ID.AG_REMOVE}`, syntax, firstMiddleBracket),
        h(
          `a.${CLASS_OR_ID.AG_NOTEXT_LINK}.${CLASS_OR_ID.AG_INLINE_RULE}`,
          {
            dataset: metadata,
            props: {
              href: sanitizeHyperlink(token.href + encodeURI(token.backlash.second)),
              target: '_blank',
              title: token.title
            }
          },
          [
            ...hrefContent,
            ...this.backlashInToken(h, token.backlash.second, className, secondBacklashStart, token)
          ]
        ),
        h(`span.${CLASS_OR_ID.AG_GRAY}.${CLASS_OR_ID.AG_REMOVE}`, syntax, lastBracket)
      ]
    } else {
      // has children
      return [
        h(`span.${className}.${CLASS_OR_ID.AG_REMOVE}`, syntax, firstBracket),
        h(
          `a.${CLASS_OR_ID.AG_INLINE_RULE}`,
          {
            props: {
              href: sanitizeHyperlink(token.href + encodeURI(token.backlash.second)),
              target: '_blank',
              title: token.title
            },
            dataset: metadata
          },
          [
            ...token.children.reduce((acc, to) => {
              const chunk = this[snakeToCamel(to.type)](h, cursor, block, to, className)
              return Array.isArray(chunk) ? [...acc, ...chunk] : [...acc, chunk]
            }, []),
            ...this.backlashInToken(h, token.backlash.first, className, firstBacklashStart, token)
          ]
        ),
        h(`span.${className}.${CLASS_OR_ID.AG_REMOVE}`, syntax, middleBracket),
        h(
          `span.${linkClassName}.${CLASS_OR_ID.AG_REMOVE}`,
          {
            dataset: metadata,
            attrs: { spellcheck: 'false' }
          },
          [
            ...hrefContent,
            ...this.backlashInToken(h, token.backlash.second, className, secondBacklashStart, token)
          ]
        ),
        h(`span.${className}.${CLASS_OR_ID.AG_REMOVE}`, syntax, lastBracket)
      ]
    }
  } else {
    return [
      ...firstBracket,
      ...token.children.reduce((acc, to) => {
        const chunk = this[snakeToCamel(to.type)](h, cursor, block, to, className)
        return Array.isArray(chunk) ? [...acc, ...chunk] : [...acc, chunk]
      }, []),
      ...this.backlashInToken(h, token.backlash.first, className, firstBacklashStart, token),
      ...middleHref,
      ...this.backlashInToken(h, token.backlash.second, className, secondBacklashStart, token),
      ...lastBracket
    ]
  }
}
