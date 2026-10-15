// FILE: tests/renderer/review/reviewRequest.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-48 review-request controller wiring — bus events
//            fold into session facts, successful sessions persist, the
//            ask fires mt_request_review exactly once per eligibility,
//            desktop capability never registers anything.
//   SCOPE: createReviewRequestController / initReviewRequest with
//          injected fake ipc, invoke and clock; mocked bus.
//   DEPENDS: src/renderer/src/review/reviewRequest.js, vitest, @/bus mock.
//   LINKS: .grace/changes/archive/C-48/spec.xml R-2; V-M-011 scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   at - ISO string → Date (fake clock values).
//   makeFakeIpc - in-memory prefs facade for the reviewState key.
//   eligibleState - persisted counters one session short of the ask threshold.
//   driveEligibleSession - run one qualifying session (open + save) against a given invoke double.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-48 review fix: the ask is recorded
//   (lastAskedAt / lastAskedVersion) only when mt_request_review resolves
//   true — false (no StoreKit / no-op build) and a rejection leave the
//   cooldown untouched; MODULE_MAP synced with the real locals.
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/bus', () => {
  const handlers = new Map()
  return {
    default: {
      on: vi.fn((event, handler) => {
        if (!handlers.has(event)) handlers.set(event, [])
        handlers.get(event).push(handler)
      }),
      off: vi.fn((event, handler) => {
        const list = handlers.get(event) || []
        const idx = list.indexOf(handler)
        if (idx >= 0) list.splice(idx, 1)
      }),
      emit: vi.fn((event, payload) => {
        for (const handler of [...(handlers.get(event) || [])]) handler(payload)
      })
    },
    __handlers: handlers
  }
})

import bus from '@/bus'
import {
  createReviewRequestController,
  initReviewRequest,
  isBlockingModalOpen,
  REVIEW_STATE_KEY
} from '@/review/reviewRequest'
import { emptyReviewState } from '@/review/reviewRules'

// TOP-LEVEL helpers (TEST/LOCALS).
const at = (iso) => new Date(iso)

const makeFakeIpc = (initial = null) => {
  const store = new Map()
  if (initial !== null) store.set(REVIEW_STATE_KEY, initial)
  const calls = []
  return {
    calls,
    async get(key) {
      return store.has(key) ? store.get(key) : null
    },
    async set(key, value) {
      store.set(key, value)
      calls.push({ key, value })
    }
  }
}

const eligibleState = () => ({
  successfulSessions: 4,
  activeDays: ['2026-06-01', '2026-06-02', '2026-06-03'],
  lastAskedAt: null,
  lastAskedVersion: ''
})

const driveEligibleSession = async (invokeFn) => {
  const ipc = makeFakeIpc(eligibleState())
  const controller = createReviewRequestController({
    ipc,
    invokeFn,
    runningVersion: '2.3.1',
    now: () => at('2026-06-05T10:00:00.000Z'),
    modalProbe: () => false
  })
  await controller.start()
  bus.emit('file-loaded', { id: 1 })
  bus.emit('file-saved', { id: 1, pathname: '/tmp/a.md' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  controller.dispose()
  return { ipc, controller }
}

describe('review/reviewRequest — isBlockingModalOpen', () => {
  it('detects the What\'s New sheet root in the DOM', () => {
    const div = document.createElement('div')
    div.className = 'ag-whats-new-sheet'
    document.body.appendChild(div)
    try {
      expect(isBlockingModalOpen()).toBe(true)
    } finally {
      div.remove()
    }
  })

  it('detects the fullscreen block viewer in the DOM', () => {
    const div = document.createElement('div')
    div.className = 'ag-block-viewer'
    document.body.appendChild(div)
    try {
      expect(isBlockingModalOpen()).toBe(true)
    } finally {
      div.remove()
    }
  })

  it('is false with no modal mounted', () => {
    expect(isBlockingModalOpen()).toBe(false)
  })
})

describe('review/reviewRequest — controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('open + save complete a session: counters persist and the ask fires when eligible', async () => {
    const ipc = makeFakeIpc(eligibleState()) // 4 sessions, 3 days → the 5th lands now
    const invokeFn = vi.fn(async () => true)
    const clock = at('2026-06-05T10:00:00.000Z')
    const controller = createReviewRequestController({
      ipc,
      invokeFn,
      runningVersion: '2.3.1',
      versionChanged: false,
      firstLaunch: false,
      now: () => clock,
      modalProbe: () => false
    })
    await controller.start()

    bus.emit('file-loaded', { id: 1 })
    // Loaded alone is not yet successful — no persistence.
    expect(ipc.calls).toHaveLength(0)
    bus.emit('file-saved', { id: 1, pathname: '/tmp/a.md' })

    // The success handler is async — let it settle.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(ipc.calls.length).toBeGreaterThanOrEqual(1)
    const persisted = ipc.calls[ipc.calls.length - 1].value
    expect(persisted.successfulSessions).toBe(5)
    expect(persisted.activeDays).toContain('2026-06-05')
    expect(persisted.lastAskedVersion).toBe('2.3.1')
    expect(invokeFn).toHaveBeenCalledTimes(1)
    expect(invokeFn).toHaveBeenCalledWith('mt_request_review')

    controller.dispose()
  })

  it('records the ask only when mt_request_review reports a dispatch (true)', async () => {
    const invokeFn = vi.fn(async () => true)
    const { ipc, controller } = await driveEligibleSession(invokeFn)
    expect(invokeFn).toHaveBeenCalledTimes(1)
    const persisted = ipc.calls[ipc.calls.length - 1].value
    expect(persisted.lastAskedAt).toBe('2026-06-05T10:00:00.000Z')
    expect(persisted.lastAskedVersion).toBe('2.3.1')
    expect(controller.getState().lastAskedAt).toBe('2026-06-05T10:00:00.000Z')
  })

  it('false (StoreKit missing / no-op build) never records an ask; the session still counts', async () => {
    const invokeFn = vi.fn(async () => false)
    const { ipc, controller } = await driveEligibleSession(invokeFn)
    expect(invokeFn).toHaveBeenCalledTimes(1)
    for (const call of ipc.calls) {
      expect(call.value.lastAskedAt).toBeNull()
      expect(call.value.lastAskedVersion).toBe('')
    }
    expect(ipc.calls[ipc.calls.length - 1].value.successfulSessions).toBe(5)
    expect(controller.getState().lastAskedAt).toBeNull()
  })

  it('a rejected dispatch never records an ask', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const invokeFn = vi.fn(async () => {
      throw new Error('main thread dispatch: closed')
    })
    const { ipc, controller } = await driveEligibleSession(invokeFn)
    for (const call of ipc.calls) {
      expect(call.value.lastAskedAt).toBeNull()
    }
    expect(controller.getState().lastAskedAt).toBeNull()
    expect(err).toHaveBeenCalledWith('[review][ask][BLOCK_REQUEST_REVIEW_FAILED]', expect.any(Error))
    err.mockRestore()
  })

  it('a live reload alone completes a session (file-changed with contentReloaded)', async () => {
    const ipc = makeFakeIpc(eligibleState())
    const invokeFn = vi.fn(async () => true)
    const controller = createReviewRequestController({
      ipc,
      invokeFn,
      runningVersion: '2.3.1',
      now: () => at('2026-06-05T10:00:00.000Z'),
      modalProbe: () => false
    })
    await controller.start()

    // Plain file-changed (tab switch) must NOT count.
    bus.emit('file-changed', { id: 1 })
    expect(ipc.calls).toHaveLength(0)
    bus.emit('file-changed', { id: 1, contentReloaded: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(invokeFn).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('a session counts once even when more success events follow', async () => {
    const ipc = makeFakeIpc(eligibleState())
    const invokeFn = vi.fn(async () => true)
    const controller = createReviewRequestController({
      ipc,
      invokeFn,
      runningVersion: '2.3.1',
      now: () => at('2026-06-05T10:00:00.000Z'),
      modalProbe: () => false
    })
    await controller.start()

    bus.emit('file-loaded', { id: 1 })
    bus.emit('file-saved', { id: 1 })
    bus.emit('file-saved', { id: 1 })
    bus.emit('file-changed', { id: 1, contentReloaded: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const persisted = ipc.calls[ipc.calls.length - 1].value
    expect(persisted.successfulSessions).toBe(5) // +1, not +3
    expect(invokeFn).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('an uncaught error before the success event blocks the ask but still counts', async () => {
    const ipc = makeFakeIpc(eligibleState())
    const invokeFn = vi.fn(async () => true)
    const controller = createReviewRequestController({
      ipc,
      invokeFn,
      runningVersion: '2.3.1',
      now: () => at('2026-06-05T10:00:00.000Z'),
      modalProbe: () => false
    })
    await controller.start()

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    bus.emit('file-loaded', { id: 1 })
    bus.emit('file-saved', { id: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(invokeFn).not.toHaveBeenCalled()
    const persisted = ipc.calls[ipc.calls.length - 1].value
    expect(persisted.successfulSessions).toBe(5)
    expect(persisted.lastAskedAt).toBeNull()
    controller.dispose()
  })

  it('a versionChanged session never asks (update day) but still counts', async () => {
    const ipc = makeFakeIpc(eligibleState())
    const invokeFn = vi.fn(async () => true)
    const controller = createReviewRequestController({
      ipc,
      invokeFn,
      runningVersion: '2.3.1',
      versionChanged: true, // What's New showed this session
      now: () => at('2026-06-05T10:00:00.000Z'),
      modalProbe: () => false
    })
    await controller.start()

    bus.emit('file-loaded', { id: 1 })
    bus.emit('file-saved', { id: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(invokeFn).not.toHaveBeenCalled()
    expect(ipc.calls[ipc.calls.length - 1].value.successfulSessions).toBe(5)
    controller.dispose()
  })

  it('dispose removes the bus listeners', async () => {
    const ipc = makeFakeIpc(null)
    const controller = createReviewRequestController({
      ipc,
      runningVersion: '2.3.1',
      now: () => at('2026-06-05T10:00:00.000Z'),
      modalProbe: () => false
    })
    await controller.start()
    controller.dispose()

    bus.emit('file-loaded', { id: 1 })
    bus.emit('file-saved', { id: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ipc.calls).toHaveLength(0)
  })

  it('a corrupt persisted state is sanitized before use', async () => {
    const ipc = makeFakeIpc({ successfulSessions: 'bogus', activeDays: 'nope' })
    const controller = createReviewRequestController({
      ipc,
      runningVersion: '2.3.1',
      now: () => at('2026-06-05T10:00:00.000Z'),
      modalProbe: () => false
    })
    await controller.start()
    expect(controller.getState()).toEqual(emptyReviewState())
    controller.dispose()
  })

  it('lazily imports the tauri invoke when no invokeFn is injected', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const ipc = makeFakeIpc(eligibleState())
    const controller = createReviewRequestController({
      ipc, // no invokeFn — the ask must reach for @tauri-apps/api/core itself
      runningVersion: '2.3.1',
      now: () => at('2026-06-05T10:00:00.000Z'),
      modalProbe: () => false
    })
    await controller.start()

    bus.emit('file-loaded', { id: 1 })
    bus.emit('file-saved', { id: 1, pathname: '/tmp/a.md' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(invoke).toHaveBeenCalledWith('mt_request_review')
    controller.dispose()
  })
})

describe('review/reviewRequest — initReviewRequest capability gate', () => {
  it('never registers when the build lacks the review capability (desktop)', async () => {
    const ipc = makeFakeIpc(null)
    const controller = await initReviewRequest({
      preferencesStore: { buildCapabilities: { mode: 'desktop', review: false } },
      versionStatus: {},
      ipc,
      runningVersion: '2.3.1'
    })
    expect(controller).toBeNull()
    expect(ipc.calls).toHaveLength(0)
  })

  it('never registers when capabilities are unknown (shims / fail-open)', async () => {
    const ipc = makeFakeIpc(null)
    const controller = await initReviewRequest({
      preferencesStore: { buildCapabilities: {} },
      versionStatus: {},
      ipc,
      runningVersion: '2.3.1'
    })
    expect(controller).toBeNull()
  })

  it('registers when the m048 review capability is explicitly true', async () => {
    const ipc = makeFakeIpc(null)
    const controller = await initReviewRequest({
      preferencesStore: { buildCapabilities: { mode: 'app-store', review: true } },
      versionStatus: { versionChanged: false },
      ipc,
      runningVersion: '2.3.1',
      now: () => at('2026-06-05T10:00:00.000Z')
    })
    expect(controller).not.toBeNull()
    controller.dispose()
  })
})
