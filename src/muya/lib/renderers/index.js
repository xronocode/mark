const rendererCache = new Map()
/**
 *
 * @param {string} name the renderer name: katex, sequence, plantuml, flowchart, pele, vega-lite
 */
const loadRenderer = async (name) => {
  if (!rendererCache.has(name)) {
    let m
    switch (name) {
      case 'sequence':
        m = await import('../parser/render/sequence')
        rendererCache.set(name, m.default)
        break
      case 'plantuml':
        m = await import('../parser/render/plantuml')
        rendererCache.set(name, m.default)
        break
      case 'flowchart':
        m = await import('flowchart.js')
        rendererCache.set(name, m.default)
        break
      case 'pele':
        // C-55: the pele namespace (render/detectType/PeleError are named
        // exports) replaces mermaid — synchronous, DOM-free, MIT, zero deps.
        m = await import('pele')
        rendererCache.set(name, m)
        break
      case 'vega-lite': {
        // The Tauri CSP has no 'unsafe-eval', so vega's default expression
        // codegen (new Function) throws in the packaged app. Parse to an AST
        // and evaluate with vega-interpreter instead — CSP-safe everywhere.
        // Caller opts still win.
        const [embedModule, interpreterModule] = await Promise.all([
          import('vega-embed'),
          import('vega-interpreter')
        ])
        const embed = embedModule.default
        const { expressionInterpreter } = interpreterModule
        rendererCache.set(name, (el, spec, opts = {}) =>
          embed(el, spec, { ast: true, expr: expressionInterpreter, ...opts })
        )
        break
      }
      default:
        throw new Error(`Unknown diagram name ${name}`)
    }
  }

  return rendererCache.get(name)
}

export default loadRenderer
