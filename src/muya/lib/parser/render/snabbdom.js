import {
  init,
  classModule,
  attributesModule,
  datasetModule,
  propsModule,
  styleModule,
  eventListenersModule,
  h as sh,
  toVNode as sToVNode
} from 'snabbdom'
// step-8z follow-up: was `require('snabbdom-to-html')` inline below.
// Inline CJS require survives Vite's static analysis as a runtime
// `require()` call, which throws under nodeIntegration:false. ES
// import gets bundled properly.
import toHTMLInit from 'snabbdom-to-html/init'
import toHTMLModules from 'snabbdom-to-html/modules'

export const patch = init([
  classModule,
  attributesModule,
  styleModule,
  propsModule,
  datasetModule,
  eventListenersModule
])

export const h = sh
export const toVNode = sToVNode

// snabbdom-to-html's own dataset module writes the key verbatim
// (dataset.tableToolbarAction -> data-tableToolbarAction, which the DOM
// reads back as dataset.tabletoolbaraction), so every camelCase dataset key
// was lost on the partialRender path (toHTML + insertAdjacentHTML) — e.g.
// the table toolbar toggle stopped working after typing elsewhere
// (2026-10-19). Hyphenate like the DOM's dataset name conversion.
export const datasetAttributeName = key =>
  `data-${String(key).replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`)}`

const escapeAttribute = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const datasetToHTML = (vnode, attributes) => {
  const dataset = (vnode.data && vnode.data.dataset) || {}
  for (const key of Object.keys(dataset)) {
    attributes.set(datasetAttributeName(key), escapeAttribute(dataset[key]))
  }
}

// helper function for convert vnode to HTML string
export const toHTML = toHTMLInit([
  toHTMLModules.attributes,
  toHTMLModules.props,
  toHTMLModules.class,
  toHTMLModules.style,
  datasetToHTML
])
export const htmlToVNode = html => { // helper function for convert html to vnode
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  return toVNode(wrapper).children
}
