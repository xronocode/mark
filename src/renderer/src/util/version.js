// FILE: src/renderer/src/util/version.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure semver-lite helpers shared by the C-48 What's New gate
//            and the C-48 review-request rules (normalize, compare,
//            major.minor projection, ISO day math).
//   SCOPE: Pure functions over version strings and ISO date strings. No
//          I/O, no state, no clock access — callers pass `now` in.
//   DEPENDS: none.
//   LINKS: .grace/changes/archive/C-48/spec.xml R-1/R-2; whatsNew/gate.js;
//          review/reviewRules.js.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   normalizeVersion - strip a leading "v" and any prerelease/build suffix ("2.3.1-beta" → "2.3.1").
//   parseVersion - numeric [major, minor, patch] triple, zeros when unparseable.
//   compareVersions - -1 | 0 | 1 over normalized inputs; unparseable strings compare lexically.
//   majorMinor - normalized "major.minor" projection ("2.3.1" → "2.3").
//   toIsoDay - local calendar day "YYYY-MM-DD" from a Date.
//   daysBetweenIso - whole-day delta between two ISO day strings.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-48 T-001: initial module.
// END_CHANGE_SUMMARY

// START_BLOCK_NORMALIZE_VERSION
// Release tags look like "v2.3.1" and dev builds like "2.3.1-beta"; the
// What's New content is keyed by the release triple ("2.3.1"), so both
// decorations collapse before any comparison or content lookup. A beta of
// the same triple equals its release ("2.3.1-beta" === "2.3.1"): the sheet
// must not reappear when the GA build of an already-seen version lands.
export const normalizeVersion = (version) => {
  if (typeof version !== 'string') return ''
  const trimmed = version.trim()
  const bare = trimmed.startsWith('v') || trimmed.startsWith('V') ? trimmed.slice(1) : trimmed
  const [core] = bare.split(/[-+]/)
  return core || ''
}
// END_BLOCK_NORMALIZE_VERSION

// START_BLOCK_PARSE_VERSION
export const parseVersion = (version) => {
  const m = normalizeVersion(version).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/)
  if (!m) return null
  return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)]
}
// END_BLOCK_PARSE_VERSION

// START_BLOCK_COMPARE_VERSIONS
// -1 | 0 | 1. Two unparseable-but-equal strings are equal; one
// unparseable side sorts first (parseable wins) so an upgrade is only
// ever detected from real numeric evidence.
export const compareVersions = (a, b) => {
  const na = normalizeVersion(a)
  const nb = normalizeVersion(b)
  if (na === nb) return 0
  const pa = parseVersion(na)
  const pb = parseVersion(nb)
  if (pa && pb) {
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
    }
    return 0
  }
  if (pa) return 1
  if (pb) return -1
  return na < nb ? -1 : 1
}
// END_BLOCK_COMPARE_VERSIONS

// START_BLOCK_MAJOR_MINOR
// The review re-ask gate treats the next major/minor as a fresh chance
// ("2.3.1" → "2.3"; a patch bump does not reset the 120-day cooldown).
export const majorMinor = (version) => {
  const p = parseVersion(version)
  if (!p) return normalizeVersion(version)
  return `${p[0]}.${p[1]}`
}
// END_BLOCK_MAJOR_MINOR

// START_BLOCK_ISO_DAY
// Local-calendar day key — distinct-day counting for review sessions must
// follow the days the user actually used the app, not UTC slices.
export const toIsoDay = (date) => {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export const daysBetweenIso = (fromDay, toDay) => {
  const a = Date.parse(`${fromDay}T00:00:00`)
  const b = Date.parse(`${toDay}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN
  return Math.round((b - a) / 86_400_000)
}
// END_BLOCK_ISO_DAY
