/**
 * Re-export of `setupTestPinia` from the global setup module.
 *
 * This file exists so Phase-4 tests can write
 *   `import { setupTestPinia } from '../pinia'`
 * without reaching into setup.ts (which is a vitest setupFiles module
 * and may evolve with hooks unrelated to Pinia).
 */
export { setupTestPinia } from './setup'
