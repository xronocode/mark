import TurndownService from 'turndown'
import { identity } from './index'
// step-8z follow-up: was `const turndownPluginGfm = require('joplin-...')`
// inline. The package exports named symbols (gfm/highlightedCodeBlock/
// strikethrough/tables/taskListItems), not a default. Original code
// destructured `{ gfm }` from the require result; we now import gfm
// directly and reconstruct the same shape for the legacy spread below.
import { gfm as gfmPlugin } from 'joplin-turndown-plugin-gfm'
const turndownPluginGfm = { gfm: gfmPlugin }

export const usePluginAddRules = (turndownService, keeps) => {
  // Use the gfm plugin
  const { gfm } = turndownPluginGfm
  turndownService.use(gfm)

  // We need a extra strikethrough rule because the strikethrough rule in gfm is single `~`.
  turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement (content) {
      return '~~' + content + '~~'
    }
  })

  turndownService.addRule('paragraph', {
    filter: 'p',

    replacement: function (content, node) {
      const isTaskListItemParagraph = node.previousElementSibling && node.previousElementSibling.tagName === 'INPUT'

      return isTaskListItemParagraph ? content + '\n\n' : '\n\n' + content + '\n\n'
    }
  })

  turndownService.addRule('listItem', {
    filter: 'li',

    replacement: function (content, node, options) {
      content = content
        .replace(/^\n+/, '') // remove leading newlines
        .replace(/\n+$/, '\n') // replace trailing newlines with just a single one
        .replace(/\n/gm, '\n  ') // indent

      let prefix = options.bulletListMarker + ' '
      const parent = node.parentNode
      if (parent.nodeName === 'OL') {
        const start = parent.getAttribute('start')
        const index = Array.prototype.indexOf.call(parent.children, node)
        prefix = (start ? Number(start) + index : index + 1) + '. '
      }
      return (
        prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
      )
    }
  })

  // Handle multiple math lines
  turndownService.addRule('multiplemath', {
    filter (node, options) {
      return node.nodeName === 'PRE' && node.classList.contains('multiple-math')
    },
    replacement (content, node, options) {
      return `$$\n${content}\n$$`
    }
  })

  turndownService.escape = identity
  turndownService.keep(keeps)
}

export default TurndownService
