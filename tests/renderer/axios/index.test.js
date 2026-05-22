/**
 * Tests for src/renderer/src/axios/index.js
 *
 * Covers: axios instance default export
 */

vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    },
    defaults: {}
  }
  return {
    default: {
      create: vi.fn(() => mockInstance),
      _mockInstance: mockInstance
    }
  }
})

import http from '@/axios'
import axios from 'axios'

describe('axios/index', () => {
  it('should export an axios instance', () => {
    expect(http).toBeDefined()
  })

  it('should be an object (axios instance)', () => {
    expect(typeof http).toBe('object')
  })

  it('should have standard HTTP methods', () => {
    expect(typeof http.get).toBe('function')
    expect(typeof http.post).toBe('function')
    expect(typeof http.put).toBe('function')
    expect(typeof http.delete).toBe('function')
    expect(typeof http.patch).toBe('function')
  })

  it('should have interceptors', () => {
    expect(http.interceptors).toBeDefined()
    expect(http.interceptors.request).toBeDefined()
    expect(http.interceptors.response).toBeDefined()
  })
})
