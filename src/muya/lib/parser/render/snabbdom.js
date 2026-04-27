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
import toHTMLLib from 'snabbdom-to-html'

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

export const toHTML = toHTMLLib // helper function for convert vnode to HTML string
export const htmlToVNode = html => { // helper function for convert html to vnode
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  return toVNode(wrapper).children
}
