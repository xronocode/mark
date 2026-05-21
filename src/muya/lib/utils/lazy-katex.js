let _katex = null
let _promise = null

export function getKatex () {
  return _katex
}

export function loadKatex () {
  if (_katex) return Promise.resolve(_katex)
  if (!_promise) {
    _promise = import('katex')
      .then(m => import('katex/dist/contrib/mhchem.min.js').then(() => m))
      .then(m => {
        _katex = m.default
        return _katex
      })
  }
  return _promise
}
