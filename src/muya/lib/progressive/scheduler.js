// FILE: src/muya/lib/progressive/scheduler.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Cooperative scheduler for the progressive tail mount
//            (C-LARGE-DOC-WAVE-A T-003, R-1): engine-agnostic lane selection
//            with a starvation-proof timer lane so the tail ALWAYS completes.
//   SCOPE: Lane management only — how a slice gets scheduled, never how much
//            work a slice does (the budget/ceiling belong to the controller's
//            runSlice). Preferred lane: requestIdleCallback where the engine
//            provides it (with an idle timeout so a busy loop still fires),
//            otherwise a postMessage/MessageChannel yielding macrotask lane
//            (WebKit/WKWebView). Timeout lane: a timer-driven interval that
//            runs a slice whenever the preferred lane made no progress within
//            timeoutLaneMs — continuous input can starve idle callbacks but
//            never the timer, so the tail is guaranteed to finish. Every lane
//            primitive (requestIdle/postYield/setTimer) and the clock are
//            injectable for the unit tier (fake clock / captured lanes).
//   DEPENDS: none (leaf module; MessageChannel/requestIdleCallback/
//            requestIdleCallback timeout resolved lazily from the engine).
//   LINKS: .grace/changes/active/C-LARGE-DOC-WAVE-A (spec R-1; plan T-003);
//          M-063 routing lands with T-008.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SCHEDULER_DEFAULTS - lane configuration defaults (idle timeout, starvation timer, slice pacing), all injectable for tests.
//   createScheduler - cooperative lane manager: start(worker) runs slices on requestIdleCallback where provided, a MessageChannel yielding lane otherwise, and a timer lane that guarantees completion under continuous input; cancel() stops all lanes.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-11-02 - C-LARGE-DOC-WAVE-A T-003: initial
//                 cooperative scheduler — ric/postMessage preferred lane plus
//                 guaranteed timer lane, all injectable.]
// END_CHANGE_SUMMARY

export const SCHEDULER_DEFAULTS = {
  // requestIdleCallback deadline: even a busy main loop must fire by then.
  idleTimeoutMs: 200,
  // Timer lane period and starvation threshold: if no slice ran within this
  // window, the timer runs one inline.
  timeoutLaneMs: 100
}

const defaultNow = () =>
  (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

/**
 * @param {object} [opts]
 * @param {() => number}  [opts.now]            injectable clock
 * @param {number}        [opts.idleTimeoutMs]
 * @param {number}        [opts.timeoutLaneMs]
 * @param {(cb: () => void, opts: {timeout: number}) => handle} [opts.requestIdle]
 * @param {(handle) => void} [opts.cancelIdle]
 * @param {(cb: () => void) => () => void} [opts.postYield]  message-lane scheduler (returns a disposer)
 * @param {(cb: () => void, ms: number) => () => void} [opts.setTimer] interval primitive (returns a disposer)
 */
export function createScheduler (opts = {}) {
  const conf = { ...SCHEDULER_DEFAULTS, ...opts }
  const now = conf.now || defaultNow

  const engineRequestIdle =
    typeof requestIdleCallback === 'function'
      ? (cb, idleOpts) => requestIdleCallback(cb, idleOpts)
      : null
  const engineCancelIdle =
    typeof cancelIdleCallback === 'function' ? (h) => cancelIdleCallback(h) : () => {}
  const requestIdle = conf.requestIdle !== undefined ? conf.requestIdle : engineRequestIdle
  const cancelIdle = conf.cancelIdle !== undefined ? conf.cancelIdle : engineCancelIdle

  const enginePostYield = () => {
    // MessageChannel lane: a postMessage macrotask still yields to input and
    // rendering between messages (the requestIdleCallback-less engines).
    const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null
    if (!channel) {
      // Last-resort engine without MessageChannel: the timer lane below is
      // then the only lane — still a completion guarantee.
      return null
    }
    const queue = []
    channel.port1.onmessage = () => {
      const cb = queue.shift()
      if (cb) cb()
    }
    return (cb) => {
      queue.push(cb)
      channel.port2.postMessage(null)
      return () => {
        const at = queue.indexOf(cb)
        if (at > -1) queue.splice(at, 1)
      }
    }
  }
  const makePostYield = () => (typeof conf.postYield === 'function' ? conf.postYield : enginePostYield())
  const engineSetTimer = (cb, ms) => {
    const id = setInterval(cb, ms)
    return () => clearInterval(id)
  }
  const setTimer = conf.setTimer !== undefined ? conf.setTimer : engineSetTimer

  let runSlice = null
  let cancelled = true
  let lastProgressAt = 0
  let preferredPending = null // { cancel: () => void }
  let timerDispose = null
  let postYieldLane = null

  const clearPreferred = () => {
    if (preferredPending) {
      preferredPending.cancel()
      preferredPending = null
    }
  }

  // One slice invocation on whatever lane drove it. Exceptions from the
  // worker cancel every lane first (no work after an error) and rethrow to
  // the driving lane's caller — the controller wraps all of this in its
  // catch-all fallback, but the scheduler must never keep ticking over a
  // broken worker.
  const runOneSlice = () => {
    if (cancelled || !runSlice) return
    clearPreferred()
    let more = false
    try {
      more = !!runSlice()
    } catch (err) {
      cancel()
      throw err
    }
    if (cancelled) return
    lastProgressAt = now()
    if (more) schedulePreferred()
  }

  const schedulePreferred = () => {
    if (cancelled || preferredPending) return
    if (requestIdle) {
      const handle = requestIdle(() => runOneSlice(), { timeout: conf.idleTimeoutMs })
      preferredPending = { cancel: () => cancelIdle(handle) }
    } else if (postYieldLane) {
      const dispose = postYieldLane(() => runOneSlice())
      preferredPending = { cancel: dispose }
    }
  }

  return {
    start (worker) {
      runSlice = worker
      cancelled = false
      lastProgressAt = now()
      postYieldLane = requestIdle ? null : makePostYield()
      schedulePreferred()
      // Starvation guarantee: whatever the preferred lane does (or never
      // does), the timer lane keeps making progress.
      timerDispose = setTimer(() => {
        if (cancelled) return
        if (now() - lastProgressAt >= conf.timeoutLaneMs) {
          runOneSlice()
        }
      }, conf.timeoutLaneMs)
    },
    cancel () {
      cancelled = true
      runSlice = null
      clearPreferred()
      if (timerDispose) {
        timerDispose()
        timerDispose = null
      }
      // A pending postMessage callback in the queue is dropped by
      // clearPreferred's disposer; the channel itself is inert once no
      // callbacks remain queued.
      postYieldLane = null
    },
    // Test/diagnostics surface (content-free).
    info () {
      return {
        cancelled,
        preferredLane: requestIdle ? 'requestIdleCallback' : postYieldLane ? 'message-channel' : 'timer-only',
        idleTimeoutMs: conf.idleTimeoutMs,
        timeoutLaneMs: conf.timeoutLaneMs
      }
    }
  }
}
