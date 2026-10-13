import { CLASS_OR_ID } from '../../../config'

// C-24: the `[!type] title` line of a callout. Gray while the cursor is on it,
// otherwise hidden (the rendered callout title shows instead). The span keeps
// the raw text, newline included, so cursor offsets stay exact.
export default function calloutMarker (h, cursor, block, token, outerClass) {
  const { start, end } = token.range
  const className = this.getClassName(outerClass, block, token, cursor)
  const content = this.highlight(h, block, start, end, token)
  return [
    h(`span.${className}.${CLASS_OR_ID.AG_REMOVE}.ag-callout-marker`, content)
  ]
}
