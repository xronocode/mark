// FILE: src/muya/lib/utils/getLinkInfo.js
// START_MODULE_CONTRACT
//   PURPOSE: Resolve one logical inline link within its own editor and retain source-token identity across syntax reflow.
//   SCOPE: Safe DOM lookup and immutable metadata; no navigation, selection or content mutation.
//   DEPENDS: selection/dom, inline tokenizer.
//   LINKS: M-012; C-MD-LINK-TABS.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   resolveLinkElement - nearest current-container anchor, including its exposed syntax siblings.
//   getLinkInfo - validated source token and destination or null for stale/missing metadata.
//   linkMetadata - stable source-token dataset for existing renderer nodes.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-10 C-MD-LINK-TABS: nested labels and syntax share a logical link; missing metadata fails closed.
// END_CHANGE_SUMMARY
import { findNearestParagraph } from '../selection/dom'
import { tokenizer } from '../parser'

export const linkMetadata = (token, rendered) => ({
  start: token.range.start, end: token.range.end, raw: token.raw,
  linkToken: `${token.range.start}:${token.range.end}`,
  linkRendered: String(rendered)
})

export const resolveLinkElement = (target, container) => {
  const element = target?.nodeType === 3 ? target.parentElement : target
  if (!element?.closest || !container?.contains(element)) return null
  const direct = element.closest('a.ag-inline-rule')
  if (direct && container.contains(direct)) return direct
  const syntax = element.closest('[data-link-token]')
  const paragraph = syntax && findNearestParagraph(syntax)
  if (!paragraph || !container.contains(paragraph)) return null
  return Array.from(paragraph.querySelectorAll('a.ag-inline-rule[data-link-token]'))
    .find(a => a.dataset.linkToken === syntax.dataset.linkToken) || null
}

export const getLinkInfo = a => {
  if (!a || a.tagName !== 'A') return null
  const paragraph = findNearestParagraph(a)
  const raw = a.getAttribute('data-raw')
  const startValue = a.getAttribute('data-start')
  const endValue = a.getAttribute('data-end')
  const start = Number(startValue), end = Number(endValue)
  const href = a.getAttribute('href')
  if (!paragraph?.id || !raw || !href || startValue === null || endValue === null ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return null
  const token = tokenizer(raw)[0]
  if (!token) return null
  token.raw = raw
  token.range = { start, end }
  return { key: paragraph.id, token, href, rendered: a.dataset.linkRendered === 'true' }
}
