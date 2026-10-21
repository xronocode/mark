// FILE: tests/renderer/localstorage-webstorage-compat.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin a functional jsdom localStorage contract so a shadowed storage global (Node >= 25 default-on experimental Web Storage) fails here with a pointed name instead of 841 opaque import failures.
//   SCOPE: Function-typed Storage members and a set/get/key/remove/clear/length roundtrip in the jsdom environment.
//   DEPENDS: vitest, jsdom environment
//   LINKS: M-046, V-M-046, C-FIX-013-NODE25-WEBSTORAGE-COMPAT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   contractKeys - storage members that must be functions
// END_MODULE_MAP

import { describe, expect, it } from 'vitest'

const contractKeys = ['getItem', 'setItem', 'removeItem', 'clear', 'key']

describe('jsdom localStorage Web Storage compatibility (C-FIX-013)', () => {
  it('exposes function-typed Storage members, not a shadowed Node webstorage stub', () => {
    for (const member of contractKeys) {
      expect(typeof localStorage[member], `localStorage.${member}`).toBe('function')
    }
    expect(typeof localStorage.length).toBe('number')
  })

  it('round-trips setItem/getItem/key/removeItem/clear', () => {
    localStorage.clear()
    localStorage.setItem('polygon:compat', 'works')
    expect(localStorage.getItem('polygon:compat')).toBe('works')
    expect(localStorage.length).toBe(1)
    expect(localStorage.key(0)).toBe('polygon:compat')

    localStorage.removeItem('polygon:compat')
    expect(localStorage.getItem('polygon:compat')).toBeNull()

    localStorage.setItem('polygon:compat', 'again')
    localStorage.clear()
    // eslint-disable-next-line no-console
    console.info('[Test][localStorageContract][BLOCK_LOCALSTORAGE_CONTRACT_OK] roundtrip complete')
    expect(localStorage.length).toBe(0)
  })
})
