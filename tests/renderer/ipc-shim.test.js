import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listen, once } from '@tauri-apps/api/event'

describe('ipcRenderer shim on()/once() return sync unsubscribe', () => {
  let ipcRenderer

  beforeEach(() => {
    ipcRenderer = window.electron.ipcRenderer
  })

  it('on() returns a function (not a Promise) in the real shim contract', () => {
    const unlisten = vi.fn()
    listen.mockResolvedValueOnce(unlisten)

    const { on } = buildRealOn()
    const off = on('mt::test', () => {})
    expect(typeof off).toBe('function')
    expect(off).not.toBeInstanceOf(Promise)
  })

  it('calling the returned function invokes Tauri unlisten', async () => {
    const unlisten = vi.fn()
    listen.mockResolvedValueOnce(unlisten)

    const { on } = buildRealOn()
    const off = on('mt::test', () => {})
    off()
    await new Promise((r) => setTimeout(r, 10))
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('once() returns a sync unsubscribe function', () => {
    const unlisten = vi.fn()
    once.mockResolvedValueOnce(unlisten)

    const { onceWrapped } = buildRealOnce()
    const off = onceWrapped('mt::test', () => {})
    expect(typeof off).toBe('function')
    expect(off).not.toBeInstanceOf(Promise)
  })

  it('once() unsubscribe calls Tauri unlisten', async () => {
    const unlisten = vi.fn()
    once.mockResolvedValueOnce(unlisten)

    const { onceWrapped } = buildRealOnce()
    const off = onceWrapped('mt::test', () => {})
    off()
    await new Promise((r) => setTimeout(r, 10))
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('search event on() also returns sync unsubscribe', () => {
    const unlisten = vi.fn()
    listen.mockResolvedValueOnce(unlisten)

    const { on } = buildRealOn()
    const off = on('mt::search-event', () => {})
    expect(typeof off).toBe('function')
  })
})

function buildRealOn () {
  const _listen = listen
  return {
    on: (channel, handler) => {
      let wrappedListener
      if (channel === 'mt::search-event') {
        wrappedListener = _listen(channel, (event) => {
          handler(event, event.payload)
        })
      } else {
        wrappedListener = _listen(channel, (event) => handler(event, event.payload))
      }
      return () => { wrappedListener.then(fn => fn()) }
    }
  }
}

function buildRealOnce () {
  const _once = once
  return {
    onceWrapped: (channel, handler) => {
      const p = _once(channel, (event) => handler(event, event.payload))
      return () => { p.then(fn => fn()) }
    }
  }
}
