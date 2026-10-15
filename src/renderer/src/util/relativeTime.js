// FILE: src/renderer/src/util/relativeTime.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render a file/folder mtime as a short localized relative label for the C-46 welcome screen ("3 min ago", "today 10:42", "yesterday", "2 days ago").
//   SCOPE: Pure formatting; no DOM, no IPC, clock injected by the caller.
//   DEPENDS: none (t is passed in so tests can stub i18n).
//   LINKS: src/renderer/src/components/recent/index.vue (recent files/folders rows).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   formatRelativeTime - mtime → localized label; '' when the mtime is unknown, in the future, or older than 7 days.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-46: welcome screen shows the mtime next to each recent file/folder.
// END_CHANGE_SUMMARY

// START_CONTRACT: formatRelativeTime
//   PURPOSE: Format an mtime as a compact relative label, localized through the supplied t().
//   INPUTS: { mtimeMs: number - epoch milliseconds (<=0/NaN treated as unknown), nowMs: number - reference epoch ms, t: (key: string, params?: object) => string - i18n translate fn }
//   OUTPUTS: { string - localized label, or '' when unknown/future/older than 7 days }
//   SIDE_EFFECTS: none
// END_CONTRACT: formatRelativeTime
export const formatRelativeTime = (mtimeMs, nowMs, t) => {
  if (!Number.isFinite(mtimeMs) || mtimeMs <= 0 || !Number.isFinite(nowMs)) return ''
  const diffMs = nowMs - mtimeMs
  if (diffMs < 0) return ''

  const MINUTE_MS = 60_000
  const DAY_MS = 86_400_000
  if (diffMs < MINUTE_MS) return t('recent.time.justNow')

  const now = new Date(nowMs)
  const mtime = new Date(mtimeMs)
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(mtime)) / DAY_MS)

  if (dayDiff <= 0) {
    const minutes = Math.min(59, Math.floor(diffMs / MINUTE_MS))
    if (diffMs < 60 * MINUTE_MS) return t('recent.time.minutesAgo', { count: minutes })
    const hh = String(mtime.getHours()).padStart(2, '0')
    const mm = String(mtime.getMinutes()).padStart(2, '0')
    return t('recent.time.todayAt', { time: `${hh}:${mm}` })
  }
  if (dayDiff === 1) return t('recent.time.yesterday')
  if (dayDiff <= 7) return t('recent.time.daysAgo', { count: dayDiff })
  return ''
}
