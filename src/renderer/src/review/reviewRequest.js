// FILE: src/renderer/src/review/reviewRequest.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: C-48 review-request runtime wiring — count successful
//            sessions from editor bus events, watch for uncaught errors,
//            and ask (via the mt_request_review Rust command) exactly
//            when reviewRules says so, App Store build only.
//   SCOPE: initReviewRequest (bus + window listeners + persistence +
//          invoke); DOM probe for open modals; no UI of its own — the
//          system owns the sheet.
//   DEPENDS: review/reviewRules.js; util/version.js; bus;
//          ipc/runtime prefs facade; @tauri-apps/api/core invoke
//          (lazy); preferences store buildCapabilities.review.
//   LINKS: .grace/changes/active/C-48/spec.xml R-2; pages/app.vue calls
//          initReviewRequest with the whatsNew gate outcome; m053_review
//          implements mt_request_review; m048 advertises the capability.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   REVIEW_STATE_KEY - prefs key holding the review counters (one object).
//   isBlockingModalOpen - DOM probe: What's New sheet or fullscreen block viewer.
//   createReviewRequestController - stateful controller factory (bus/error listeners, session facts, ask flow) — injectable deps for tests.
//   initReviewRequest - boot wiring used by pages/app.vue; no-op when the build lacks the review capability.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-48 review fix: lastAskedAt /
//   lastAskedVersion persist only after mt_request_review resolves true
//   (was: persisted before the invoke, so a StoreKit-less build or a
//   failed dispatch burned the 120-day cooldown on an ask that never
//   happened). Log marker BLOCK_REQUEST_REVIEW now reports dispatched=.
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: initial module.
// END_CHANGE_SUMMARY

import bus from '../bus'
import { ipcPrefs } from '../ipc/runtime'
import {
  emptyReviewState,
  isSessionSuccessful,
  registerSuccessfulSession,
  evaluateReviewAsk,
  sanitizeReviewState
} from './reviewRules'

export const REVIEW_STATE_KEY = 'reviewState'

// START_BLOCK_BLOCKING_MODAL_PROBE
// "Never while a modal/sheet is open" (rules card): the What's New sheet
// (.ag-whats-new-sheet root, components/whatsNew) and muya's fullscreen
// block viewer (.ag-block-viewer) are both plain DOM citizens — probe at
// ask time instead of coupling modules through shared state.
export const isBlockingModalOpen = (doc = typeof document !== 'undefined' ? document : null) => {
  if (!doc || typeof doc.querySelector !== 'function') return false
  return !!(doc.querySelector('.ag-whats-new-sheet') || doc.querySelector('.ag-block-viewer'))
}
// END_BLOCK_BLOCKING_MODAL_PROBE

// START_BLOCK_CREATE_CONTROLLER
// Stateful controller. Deps are injectable so unit tests can drive the
// full flow (fake clock, fake ipc, fake invoke) without Tauri. Session
// facts: documentOpened/documentSaved/liveReloadApplied latch from bus
// events; errorLogged latches from window error + unhandledrejection;
// versionChanged/firstLaunch arrive from the What's New gate outcome so
// "never in the same session as an update" can never race the recorder.
export const createReviewRequestController = ({
  ipc = ipcPrefs,
  invokeFn = null,
  runningVersion = '',
  versionChanged = false,
  firstLaunch = false,
  now = () => new Date(),
  modalProbe = isBlockingModalOpen
} = {}) => {
  const session = {
    documentOpened: false,
    documentSaved: false,
    liveReloadApplied: false,
    errorLogged: false,
    counted: false
  }
  let state = emptyReviewState()
  let invokeRef = invokeFn
  let disposed = false

  const persist = async (next) => {
    try {
      await ipc.set(REVIEW_STATE_KEY, next)
    } catch (e) {
      console.error('[review][persist][BLOCK_PERSIST_FAILED]', e)
    }
  }

  const doInvoke = async () => {
    if (!invokeRef) {
      const { invoke } = await import('@tauri-apps/api/core')
      invokeRef = invoke
    }
    return invokeRef('mt_request_review')
  }

  // START_BLOCK_ON_SESSION_SUCCESS
  // First qualifying event of the session: fold the session into the
  // counters, then evaluate the full rule set right away (Apple's sheet
  // is allowed to interrupt a save; a blocked ask simply waits for the
  // next session's qualifying event — counters stay eligible).
  const onSessionSuccess = async () => {
    if (disposed || session.counted) return
    session.counted = true
    const { state: withSession } = registerSuccessfulSession(state, now())
    state = withSession
    await persist(state)

    const decision = evaluateReviewAsk({
      state,
      session: { ...session, versionChanged, firstLaunch },
      runningVersion,
      now: now(),
      modalOpen: modalProbe()
    })

    if (decision.ask) {
      // The ask (lastAskedAt / lastAskedVersion) is recorded ONLY when
      // m053 reports the request was dispatched (true). false = StoreKit
      // unavailable / no-op build; a rejection = dispatch failure — in
      // both cases nothing was asked, so the counters stay eligible.
      let dispatched = false
      try {
        dispatched = (await doInvoke()) === true
      } catch (e) {
        console.error('[review][ask][BLOCK_REQUEST_REVIEW_FAILED]', e)
      }
      if (dispatched) {
        state = sanitizeReviewState(decision.state)
        await persist(state)
      }
      console.log(`[review][ask][BLOCK_REQUEST_REVIEW asked=true dispatched=${dispatched}]`)
    } else {
      console.log(`[review][ask][BLOCK_EVALUATED ask=false reason=${decision.reason}]`)
    }
  }
  // END_BLOCK_ON_SESSION_SUCCESS

  const onFileLoaded = () => {
    session.documentOpened = true
    if (isSessionSuccessful(session)) void onSessionSuccess()
  }

  const onFileSaved = () => {
    session.documentSaved = true
    if (isSessionSuccessful(session)) void onSessionSuccess()
  }

  const onFileChanged = (payload) => {
    // loadChange live-reload applies carry contentReloaded: true
    // (store/editor APPLY_FILE_CHANGE paths).
    if (payload && payload.contentReloaded) {
      session.liveReloadApplied = true
      if (isSessionSuccessful(session)) void onSessionSuccess()
    }
  }

  const onError = () => {
    session.errorLogged = true
  }

  const start = async () => {
    try {
      const raw = await ipc.get(REVIEW_STATE_KEY)
      state = sanitizeReviewState(raw)
    } catch {
      state = emptyReviewState()
    }
    bus.on('file-loaded', onFileLoaded)
    bus.on('file-saved', onFileSaved)
    bus.on('file-changed', onFileChanged)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onError)
  }

  const dispose = () => {
    disposed = true
    bus.off('file-loaded', onFileLoaded)
    bus.off('file-saved', onFileSaved)
    bus.off('file-changed', onFileChanged)
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onError)
  }

  return { start, dispose, session, getState: () => state }
}
// END_BLOCK_CREATE_CONTROLLER

// START_BLOCK_INIT_REVIEW_REQUEST
// Boot entry used by pages/app.vue. `versionStatus` is the What's New
// gate outcome ({ versionChanged, firstLaunch }). Desktop / non-mac App
// Store builds never get the capability flag — nothing registers, no
// prefs are written (spec: "Desktop edition: nothing").
export const initReviewRequest = async ({
  preferencesStore,
  versionStatus = {},
  ipc = ipcPrefs,
  invokeFn = null,
  now = () => new Date(),
  runningVersion = ''
} = {}) => {
  const caps = preferencesStore?.buildCapabilities
  if (!caps || caps.review !== true) {
    return null
  }
  const controller = createReviewRequestController({
    ipc,
    invokeFn,
    runningVersion,
    versionChanged: !!versionStatus.versionChanged,
    firstLaunch: !!versionStatus.firstLaunch,
    now
  })
  await controller.start()
  return controller
}
// END_BLOCK_INIT_REVIEW_REQUEST
