// step-8z follow-up: empty fs stub for the renderer bundle.
// After removing vite-plugin-electron-renderer, the renderer is a
// pure browser bundle that should never touch Node fs. The only
// remaining `require('fs')` reference is dead code inside
// muya/lib/assets/libs/sequence-diagram-snap.js (a vendored Snap.svg
// helper for sequence diagrams that has a Node-loader path which is
// never reached in browser execution).
//
// This shim exports stubs that throw if called, so any accidental
// runtime call gets a loud signal instead of a confusing
// "undefined is not a function" later.

const noop = () => {
  throw new Error(
    'fs is not available in the renderer process. Use window.fileUtils.* via preload.'
  )
}

export const readFileSync = noop
export const writeFileSync = noop
export const existsSync = () => false
export const statSync = noop
export const readdirSync = () => []
export const constants = {}

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  constants,
  promises: {
    readFile: noop,
    writeFile: noop,
    stat: noop,
    readdir: noop
  }
}
