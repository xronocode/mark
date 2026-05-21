let _katex = null
let _promise = null
let _rerenderScheduled = false

export function getKatex () {
  return _katex
}

export function loadKatex () {
  if (_katex) return Promise.resolve(_katex)
  if (!_promise) {
    _promise = import('katex')
      .then(m => Promise.all([
        import('katex/dist/contrib/mhchem.min.js'),
        import('katex/dist/katex.min.css')
      ]).then(() => m))
      .then(m => {
        _katex = m.default
        return _katex
      })
  }
  return _promise
}

export function scheduleRerender (muya) {
  if (_rerenderScheduled) return
  _rerenderScheduled = true
  loadKatex().then(() => {
    _rerenderScheduled = false
    muya.contentState.render()
  })
}
