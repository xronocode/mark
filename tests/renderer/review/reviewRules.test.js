// FILE: tests/renderer/review/reviewRules.test.js
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Pin every C-48 review-request rule — the 5-session /
//            3-distinct-day thresholds, each "never" case, the
//            120-day / next-major-minor re-ask gate, and state
//            sanitization — with a fake clock.
//   SCOPE: pure functions in src/renderer/src/review/reviewRules.js.
//   DEPENDS: vitest.
//   LINKS: .grace/changes/archive/C-48/spec.xml R-2 (board 5 rules); V-M-011 scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   at - ISO string → Date (fake clock values).
//   baseState - 5 sessions across 3 days, never asked (the eligible baseline).
//   cleanSession - a session with no blocking facts.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.1 - 2026-10-15 C-48 review: MODULE_MAP lists the `at`
//   clock helper (grace lint); pins unchanged.
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import {
  MIN_SUCCESSFUL_SESSIONS,
  MIN_DISTINCT_DAYS,
  REASK_AFTER_DAYS,
  emptyReviewState,
  sanitizeReviewState,
  isSessionSuccessful,
  registerSuccessfulSession,
  reviewReaskAllowed,
  evaluateReviewAsk
} from '@/review/reviewRules'

// TOP-LEVEL helpers (TEST/LOCALS).
const at = (iso) => new Date(iso)
const baseState = () => ({
  successfulSessions: 5,
  activeDays: ['2026-06-01', '2026-06-02', '2026-06-03'],
  lastAskedAt: null,
  lastAskedVersion: ''
})
const cleanSession = () => ({
  documentOpened: true,
  documentSaved: true,
  liveReloadApplied: false,
  errorLogged: false,
  versionChanged: false,
  firstLaunch: false
})

describe('reviewRules — session success definition', () => {
  it('opened AND saved counts', () => {
    expect(isSessionSuccessful({ documentOpened: true, documentSaved: true })).toBe(true)
  })

  it('a live reload applied counts on its own', () => {
    expect(isSessionSuccessful({ documentOpened: false, documentSaved: false, liveReloadApplied: true })).toBe(true)
  })

  it('save without open does NOT count (spec: opened and saved)', () => {
    expect(isSessionSuccessful({ documentOpened: false, documentSaved: true })).toBe(false)
  })

  it('open without save does not count', () => {
    expect(isSessionSuccessful({ documentOpened: true, documentSaved: false })).toBe(false)
  })
})

describe('reviewRules — counting sessions and days', () => {
  it('registering a successful session increments the count and adds today once', () => {
    const state = emptyReviewState()
    const first = registerSuccessfulSession(state, at('2026-06-01T09:00:00'))
    expect(first.changed).toBe(true)
    expect(first.state.successfulSessions).toBe(1)
    expect(first.state.activeDays).toEqual(['2026-06-01'])

    const sameDay = registerSuccessfulSession(first.state, at('2026-06-01T21:00:00'))
    expect(sameDay.state.successfulSessions).toBe(2)
    expect(sameDay.state.activeDays).toEqual(['2026-06-01'])

    const nextDay = registerSuccessfulSession(sameDay.state, at('2026-06-02T08:00:00'))
    expect(nextDay.state.successfulSessions).toBe(3)
    expect(nextDay.state.activeDays).toEqual(['2026-06-01', '2026-06-02'])
  })
})

describe('reviewRules — sanitizeReviewState', () => {
  it('repairs a corrupt persisted state instead of throwing', () => {
    const clean = sanitizeReviewState({
      successfulSessions: '7',
      activeDays: ['2026-06-01', 'garbage', 42, '2026-06-01', '2026-06-02'],
      lastAskedAt: 'not a date',
      lastAskedVersion: 19
    })
    expect(clean.successfulSessions).toBe(7)
    expect(clean.activeDays).toEqual(['2026-06-01', '2026-06-02'])
    expect(clean.lastAskedAt).toBeNull()
    expect(clean.lastAskedVersion).toBe('')
  })

  it('non-object input yields the empty state', () => {
    expect(sanitizeReviewState(null)).toEqual(emptyReviewState())
    expect(sanitizeReviewState('x')).toEqual(emptyReviewState())
  })

  it('negative / NaN session counts clamp to zero', () => {
    expect(sanitizeReviewState({ successfulSessions: -3 }).successfulSessions).toBe(0)
    expect(sanitizeReviewState({ successfulSessions: 'NaN' }).successfulSessions).toBe(0)
  })
})

describe('reviewRules — the 120-day / next-major-minor re-ask gate', () => {
  it('never-asked is always allowed', () => {
    expect(
      reviewReaskAllowed({
        lastAskedAt: null,
        lastAskedVersion: '',
        runningVersion: '2.3.1',
        now: at('2026-06-05T12:00:00')
      })
    ).toBe(true)
  })

  it('blocks before 120 days on the same major.minor (patch bumps included)', () => {
    const args = {
      lastAskedAt: '2026-06-01T10:00:00.000Z',
      lastAskedVersion: '2.3.1',
      runningVersion: '2.3.2',
      now: at('2026-09-01T10:00:00.000Z') // 92 days later, still < 120
    }
    expect(reviewReaskAllowed(args)).toBe(false)
  })

  it('allows again after ≥ 120 days on the same major.minor', () => {
    expect(
      reviewReaskAllowed({
        lastAskedAt: '2026-06-01T10:00:00.000Z',
        lastAskedVersion: '2.3.1',
        runningVersion: '2.3.5',
        now: at('2026-10-29T10:00:00.000Z') // 150 days later
      })
    ).toBe(true)
  })

  it('a new major.minor re-opens the gate even inside the cooldown', () => {
    expect(
      reviewReaskAllowed({
        lastAskedAt: '2026-06-01T10:00:00.000Z',
        lastAskedVersion: '2.3.1',
        runningVersion: '2.4.0',
        now: at('2026-06-15T10:00:00') // 14 days later
      })
    ).toBe(true)
  })

  it('day 119 is still blocked, day 120 passes (boundary)', () => {
    const lastAskedAt = '2026-06-01T10:00:00.000Z'
    expect(
      reviewReaskAllowed({ lastAskedAt, lastAskedVersion: '2.3.1', runningVersion: '2.3.1', now: at('2026-09-28T10:00:00.000Z') })
    ).toBe(false)
    expect(
      reviewReaskAllowed({ lastAskedAt, lastAskedVersion: '2.3.1', runningVersion: '2.3.1', now: at('2026-09-29T10:00:00.000Z') })
    ).toBe(true)
  })
})

describe('reviewRules — evaluateReviewAsk (every "never")', () => {
  it('asks when eligible', () => {
    const out = evaluateReviewAsk({
      state: baseState(),
      session: cleanSession(),
      runningVersion: '2.3.1',
      now: at('2026-06-05T12:00:00'),
      modalOpen: false
    })
    expect(out.ask).toBe(true)
    expect(out.reason).toBe('eligible')
    // The ask's bookkeeping is already folded into the returned state.
    expect(out.state.lastAskedAt).toBe(at('2026-06-05T12:00:00').toISOString())
    expect(out.state.lastAskedVersion).toBe('2.3.1')
  })

  it('never asks on the first launch', () => {
    const out = evaluateReviewAsk({
      state: baseState(),
      session: { ...cleanSession(), firstLaunch: true },
      runningVersion: '2.3.1',
      now: at('2026-06-05T12:00:00')
    })
    expect(out.ask).toBe(false)
    expect(out.reason).toBe('firstLaunch')
    expect(out.state.lastAskedAt).toBeNull()
  })

  it('never asks in a session whose version changed (update day)', () => {
    const out = evaluateReviewAsk({
      state: baseState(),
      session: { ...cleanSession(), versionChanged: true },
      runningVersion: '2.3.1',
      now: at('2026-06-05T12:00:00')
    })
    expect(out.ask).toBe(false)
    expect(out.reason).toBe('versionChanged')
  })

  it('never asks in a session with an uncaught error', () => {
    const out = evaluateReviewAsk({
      state: baseState(),
      session: { ...cleanSession(), errorLogged: true },
      runningVersion: '2.3.1',
      now: at('2026-06-05T12:00:00')
    })
    expect(out.ask).toBe(false)
    expect(out.reason).toBe('errorLogged')
  })

  it('never asks while a modal/sheet is open', () => {
    const out = evaluateReviewAsk({
      state: baseState(),
      session: cleanSession(),
      runningVersion: '2.3.1',
      now: at('2026-06-05T12:00:00'),
      modalOpen: true
    })
    expect(out.ask).toBe(false)
    expect(out.reason).toBe('modalOpen')
  })

  it('never asks below 5 successful sessions (4 sessions, 3 days)', () => {
    const state = baseState()
    state.successfulSessions = MIN_SUCCESSFUL_SESSIONS - 1
    const out = evaluateReviewAsk({
      state,
      session: cleanSession(),
      runningVersion: '2.3.1',
      now: at('2026-06-05T12:00:00')
    })
    expect(out.ask).toBe(false)
    expect(out.reason).toBe('sessions')
    expect(MIN_SUCCESSFUL_SESSIONS).toBe(5)
  })

  it('never asks with fewer than 3 distinct days (5 sessions, 2 days)', () => {
    const state = baseState()
    state.activeDays = ['2026-06-01', '2026-06-02']
    const out = evaluateReviewAsk({
      state,
      session: cleanSession(),
      runningVersion: '2.3.1',
      now: at('2026-06-05T12:00:00')
    })
    expect(out.ask).toBe(false)
    expect(out.reason).toBe('days')
    expect(MIN_DISTINCT_DAYS).toBe(3)
  })

  it('never asks again inside the cooldown window (asked today)', () => {
    const state = baseState()
    state.lastAskedAt = '2026-06-05T09:00:00.000Z'
    state.lastAskedVersion = '2.3.1'
    const out = evaluateReviewAsk({
      state,
      session: cleanSession(),
      runningVersion: '2.3.1',
      now: at('2026-08-05T12:00:00.000Z') // ~61 days later
    })
    expect(out.ask).toBe(false)
    expect(out.reason).toBe('cooldown')
  })

  it('asks again after a new major.minor even inside the cooldown', () => {
    const state = baseState()
    state.lastAskedAt = '2026-06-05T09:00:00.000Z'
    state.lastAskedVersion = '2.3.1'
    const out = evaluateReviewAsk({
      state,
      session: cleanSession(),
      runningVersion: '2.4.0',
      now: at('2026-06-20T12:00:00')
    })
    expect(out.ask).toBe(true)
    expect(out.state.lastAskedVersion).toBe('2.4.0')
  })

  it('full lifecycle: 5 sessions across 3 days ask exactly once, then cooldown', () => {
    // Simulate day-by-day sessions through the pure helpers.
    let state = emptyReviewState()
    const days = ['2026-06-01T10:00:00', '2026-06-02T10:00:00', '2026-06-03T10:00:00', '2026-06-04T10:00:00', '2026-06-05T10:00:00']
    let asked = 0
    for (const day of days) {
      const { state: next } = registerSuccessfulSession(state, at(day))
      state = next
      const decision = evaluateReviewAsk({
        state,
        session: cleanSession(),
        runningVersion: '2.3.1',
        now: at(day)
      })
      if (decision.ask) {
        asked += 1
        state = decision.state
      }
    }
    // The 3rd session already crosses 3 days but only the 5th reaches
    // MIN_SUCCESSFUL_SESSIONS — the ask happens exactly once.
    expect(asked).toBe(1)
    expect(state.lastAskedVersion).toBe('2.3.1')

    // A later eligible session inside the cooldown does not re-ask.
    const { state: sixth } = registerSuccessfulSession(state, at('2026-06-06T10:00:00'))
    const again = evaluateReviewAsk({
      state: sixth,
      session: cleanSession(),
      runningVersion: '2.3.1',
      now: at('2026-06-06T10:00:00')
    })
    expect(again.ask).toBe(false)
    expect(REASK_AFTER_DAYS).toBe(120)
  })
})
