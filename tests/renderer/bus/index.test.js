/**
 * Tests for src/renderer/src/bus/index.js
 *
 * Covers: mitt-based event emitter default export
 */

vi.mock('mitt', () => {
  return {
    default: vi.fn(() => {
      const handlers = new Map()
      return {
        on: vi.fn((type, handler) => {
          if (!handlers.has(type)) handlers.set(type, [])
          handlers.get(type).push(handler)
        }),
        off: vi.fn((type, handler) => {
          const list = handlers.get(type) || []
          const idx = list.indexOf(handler)
          if (idx >= 0) list.splice(idx, 1)
        }),
        emit: vi.fn((type, event) => {
          const list = handlers.get(type) || []
          list.forEach(fn => fn(event))
        }),
        all: handlers
      }
    })
  }
})

import bus from '@/bus'

describe('bus/index', () => {
  it('should export a mitt emitter', () => {
    expect(bus).toBeDefined()
    expect(typeof bus.on).toBe('function')
    expect(typeof bus.off).toBe('function')
    expect(typeof bus.emit).toBe('function')
  })

  it('should support on/emit pattern', () => {
    const handler = vi.fn()
    bus.on('test-event', handler)
    bus.emit('test-event', { data: 42 })
    expect(handler).toHaveBeenCalledWith({ data: 42 })
  })

  it('should support off to remove listener', () => {
    const handler = vi.fn()
    bus.on('test-off', handler)
    bus.off('test-off', handler)
    bus.emit('test-off', 'data')
    expect(handler).not.toHaveBeenCalled()
  })

  it('should handle multiple listeners for same event', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('multi', h1)
    bus.on('multi', h2)
    bus.emit('multi', 'payload')
    expect(h1).toHaveBeenCalledWith('payload')
    expect(h2).toHaveBeenCalledWith('payload')
  })

  it('should have an all map for handlers', () => {
    expect(bus.all).toBeDefined()
  })
})
