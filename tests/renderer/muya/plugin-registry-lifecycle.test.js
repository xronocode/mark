// FILE: tests/renderer/muya/plugin-registry-lifecycle.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the muya plugin-registry lifecycle invariants exposed by
//            the C-FILE-POSITION-MEMORY e2e wave — idempotent Muya.use and
//            a destroy() that tears down every registered plugin.
//   SCOPE: Static registry dedup, per-instance plugin destroy coverage,
//          and body-level float container removal on destroy.
//   DEPENDS: muya/lib (Muya class), jsdom document.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-77-file-position-memory; src/muya/lib/index.js Muya.use/destroy.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeFakePlugin - a minimal plugin class (pluginName, constructor appending a probe node, destroy spy removing it).
//   mountEl - a div appended to body for one muya construction.
//   RESTORE_LEN - the registry length snapshot a test restores in afterEach.
//   await_import_cache - module cache carrying the Muya class to afterEach for the registry trim.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-25 C-FILE-POSITION-MEMORY: pin Muya.use
//                idempotence (per-mount re-registration must not duplicate
//                plugin instances) and registry-driven destroy coverage
//                (a destroyed editor leaves no float containers behind).
// END_CHANGE_SUMMARY

import { describe, it, expect, afterEach } from 'vitest'

const mountEl = () => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

let RESTORE_LEN = null

afterEach(() => {
  // The plugin registry is module-global static state — trim any fakes a
  // test registered so later suites construct pristine muyas.
  if (await_import_cache.Muya && RESTORE_LEN !== null) {
    await_import_cache.Muya.plugins.length = RESTORE_LEN
    RESTORE_LEN = null
  }
})

// Constructed lazily; kept on the module so afterEach can trim.
const await_import_cache = {}

const makeFakePlugin = (name) => {
  const created = []
  const destroyed = []
  class FakePlugin {
    static pluginName = name
    constructor(muya) {
      this.muya = muya
      this.destroyed = false
      // Mimic a BaseFloat: append a body-level container per instance.
      this.floatBox = document.createElement('div')
      this.floatBox.className = `fake-float-${name}`
      document.body.appendChild(this.floatBox)
      created.push(this)
    }
    destroy() {
      this.destroyed = true
      this.floatBox.remove()
      destroyed.push(this)
    }
  }
  FakePlugin.created = created
  FakePlugin.destroyed = destroyed
  return FakePlugin
}

describe('muya plugin registry lifecycle (C-FILE-POSITION-MEMORY)', () => {
  it('Muya.use is idempotent — re-registering a plugin is a no-op', async () => {
    const { default: Muya } = await import('muya/lib')
    await_import_cache.Muya = Muya
    RESTORE_LEN = Muya.plugins.length
    const P = makeFakePlugin('dedupProbe')
    Muya.use(P)
    Muya.use(P)
    Muya.use(P)
    const entries = Muya.plugins.filter((e) => e.plugin === P)
    expect(entries).toHaveLength(1)
  })

  it('a new Muya instantiates a duplicated plugin once (no leaked extra floats)', async () => {
    const { default: Muya } = await import('muya/lib')
    await_import_cache.Muya = Muya
    RESTORE_LEN = Muya.plugins.length
    const P = makeFakePlugin('singleInstance')
    Muya.use(P)
    Muya.use(P)
    const el = mountEl()
    const muya = new Muya(el, { markdown: '# x\n\npara\n' })
    expect(P.created).toHaveLength(1)
    muya.destroy()
    el.remove()
  })

  it('destroy() tears down every registered plugin and removes its float container', async () => {
    const { default: Muya } = await import('muya/lib')
    await_import_cache.Muya = Muya
    RESTORE_LEN = Muya.plugins.length
    const A = makeFakePlugin('floatA')
    const B = makeFakePlugin('floatB')
    Muya.use(A)
    Muya.use(B)
    const el = mountEl()
    const muya = new Muya(el, { markdown: '# x\n\npara\n' })
    expect(document.querySelectorAll('.fake-float-floatA').length).toBe(1)
    expect(document.querySelectorAll('.fake-float-floatB').length).toBe(1)
    muya.destroy()
    expect(A.destroyed).toHaveLength(1)
    expect(B.destroyed).toHaveLength(1)
    expect(document.querySelectorAll('.fake-float-floatA').length).toBe(0)
    expect(document.querySelectorAll('.fake-float-floatB').length).toBe(0)
    el.remove()
  })

  it('plugins without a destroy method survive the registry-driven teardown', async () => {
    const { default: Muya } = await import('muya/lib')
    await_import_cache.Muya = Muya
    RESTORE_LEN = Muya.plugins.length
    class NoDestroy {
      static pluginName = 'noDestroy'
      constructor() {
        this.marker = true
      }
    }
    Muya.use(NoDestroy)
    const el = mountEl()
    const muya = new Muya(el, { markdown: '# x\n' })
    expect(() => muya.destroy()).not.toThrow()
    el.remove()
  })

  it('a throwing plugin destroy does not skip later plugins or the trailing cleanup', async () => {
    const { default: Muya } = await import('muya/lib')
    await_import_cache.Muya = Muya
    RESTORE_LEN = Muya.plugins.length
    const A = makeFakePlugin('throwsFirst')
    const B = makeFakePlugin('survivesSecond')
    A.prototype.destroy = function () {
      throw new Error('plugin teardown exploded')
    }
    Muya.use(A)
    Muya.use(B)
    const el = mountEl()
    const muya = new Muya(el, { markdown: '# x\n' })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => muya.destroy()).not.toThrow()
      expect(B.destroyed).toHaveLength(1)
      expect(document.querySelectorAll('.fake-float-survivesSecond').length).toBe(0)
    } finally {
      warnSpy.mockRestore()
      el.remove()
    }
  })

  it('re-registering a plugin refreshes its options (a remount supplies fresh closures)', async () => {
    const { default: Muya } = await import('muya/lib')
    await_import_cache.Muya = Muya
    RESTORE_LEN = Muya.plugins.length
    const P = makeFakePlugin('optsRefresh')
    Muya.use(P, { tag: 'first' })
    Muya.use(P, { tag: 'second' })
    const entries = Muya.plugins.filter((e) => e.plugin === P)
    expect(entries).toHaveLength(1)
    expect(entries[0].options.tag).toBe('second')
  })
})
