// FILE: src/renderer/src/util/exportImages.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: M-065 — make the styled-HTML export self-contained by embedding locally readable images as base64 data-URLs, with an 8 MiB per-image cap, deduplicated reads and honest skipped accounting (C-SELF-CONTAINED-HTML-EXPORT).
//   SCOPE: one async pass over an HTML string (detached DOM container), img src resolution (document-dir relative, POSIX absolute, file:// strip, Windows drive/extended-prefix via re-expressed muya correctImageSrc semantics, %20/unicode decode), stat-size gate before any read, readBinary + base64 encoding with an extension-mapped MIME table, and the counters the export notice reports.
//   DEPENDS: M-013-B ipcFs (stat, readBinary) via '@/ipc/runtime'; arrayBufferToBase64 from '@/util/fileSystem'; isWindows from '@/util/index'.
//   LINKS: .grace/graph/features.xml M-065; .grace/verification/features.xml V-M-065; .grace/graph/flows.xml DF-007; .grace/changes/active/C-SELF-CONTAINED-HTML-EXPORT.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   IMAGE_MIME_BY_EXT - lowercase extension → MIME for the extensions we embed; anything else is a counted skip.
//   EMBED_CAP_BYTES - per-image raw-size cap (8 MiB); at or above it the image keeps its src.
//   embedLocalImages - html + document directory → { html, embedded, total, skipped }; mutates only img src values in a detached container.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-21 v1.0.0 C-SELF-CONTAINED-HTML-EXPORT: initial pass. Reads
//     go through ipcFs.readBinary (mt::fs::read_binary, lossless bytes) —
//     window.fileUtils.readFile returns UTF-8 text and corrupts binary
//     (review-pass finding); the size gate uses ipcFs.stat so an
//     over-cap image is skipped without a read attempt. Normalization
//     semantics re-express muya's correctImageSrc (drive-letter and
//     \\?\ extended prefix, isWin-gated; file:// URLs stripped) rather
//     than importing it: it is not exported through the muya barrel and
//     yields URLs, not paths. Generic UNC \\server\share matches no
//     branch anywhere in muya and passes through uncounted.
// END_CHANGE_SUMMARY

import { ipcFs } from '@/ipc/runtime'
import { arrayBufferToBase64 } from '@/util/fileSystem'
import { isWindows } from '@/util/index'

// Extensions we embed, with their MIME. Unknown extensions keep the
// original src and count as skipped — never a guessed MIME.
export const IMAGE_MIME_BY_EXT = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon'
})

// Per-image raw-size cap. ipcFs.readBinary itself refuses above
// MAX_READ_BYTES (10 MiB) on the backend; staying below it means the
// gate always decides before a read is attempted.
export const EMBED_CAP_BYTES = 8 * 1024 * 1024

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_RESOLVE_SRC
// src → absolute filesystem path, or null for sources the pass must
// leave untouched and uncounted (remote, embedded data, unresolvable).
// Windows branches mirror muya's correctImageSrc but are re-expressed
// here: they must yield plain paths (not file:// URLs) resolved without
// the muya barrel.
// ──────────────────────────────────────────────────────────────────────
const decodeSrc = (src) => {
  // Markdown src may be percent-encoded (%20, unicode); a bare literal
  // '%' that is not valid encoding must not throw the export.
  try {
    return decodeURIComponent(src)
  } catch (_) {
    return src
  }
}

const fileUrlToPath = (decoded) => {
  // file:///path (empty host) → /path; file://host/... has a host we
  // cannot turn into a local path — treat as unresolvable.
  const m = /^file:\/\/([^/]*)\/(.*)$/.exec(decoded)
  if (!m) return null
  if (m[1] !== '' && m[1] !== 'localhost') return null
  return `/${m[2]}`
}

const resolveImageSrc = (rawSrc, baseDir) => {
  if (!rawSrc) return null
  const src = String(rawSrc).trim()
  if (!src) return null

  // Remote and already-embedded sources are never fetched or rewritten.
  if (/^(?:https?|data):/i.test(src)) return null

  const decoded = decodeSrc(src)

  // Explicit file:// URL.
  if (/^file:/i.test(decoded)) return fileUrlToPath(decoded)

  if (isWindows()) {
    // Drive letter (C:\ or C:/) — correctImageSrc's first branch.
    if (/^[a-zA-Z]:[\\/].+/.test(decoded)) {
      return decoded.replace(/\\/g, '/')
    }
    // Extended-length prefix (\\?\C:\...) — the second branch; the
    // generic \\server\share UNC form matches no muya branch at all
    // and stays untouched.
    if (/^\\\\\?\\.+/.test(decoded)) {
      return decoded.substring(4).replace(/\\/g, '/')
    }
    if (/^\\\\[^?]/.test(decoded)) return null
  } else if (/^\/.+/.test(decoded)) {
    // POSIX absolute.
    return decoded
  }

  // Relative: only resolvable when the exporting document has a
  // directory (an untitled document has none — untouched, uncounted).
  if (!baseDir) return null
  if (/^[a-zA-Z]:[\\/]/.test(decoded) || /^\\\\/.test(decoded)) return null
  const cleanBase = String(baseDir).replace(/[\\/]+$/, '')
  const cleanRel = decoded.replace(/^[\\/]+/, '')
  if (!cleanBase) return null
  return `${cleanBase}/${cleanRel}`
}
// END_BLOCK_RESOLVE_SRC

const extensionOf = (path) => {
  const base = path.replace(/[\\/][^\\/]*$/, '')
  const name = path.slice(base.length ? base.length + 1 : 0)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_EMBED_PASS
// The export pass: DOM-walk the imgs, classify each src, dedupe reads
// by resolved path, and rewrite src to data-URLs. Accounting counts
// references (what the reader sees), not reads.
// ──────────────────────────────────────────────────────────────────────
export async function embedLocalImages(html, baseDir) {
  const container = document.createElement('div')
  container.innerHTML = html

  const images = container.getElementsByTagName('img')
  // Per-path outcome cache: data-URL on success, a skip reason string
  // otherwise — repeated references reuse it without another read.
  const cache = new Map()
  let embedded = 0
  let skipped = 0

  for (const image of images) {
    const rawSrc = image.getAttribute('src')
    const resolved = resolveImageSrc(rawSrc, baseDir)
    if (resolved === null) continue

    const mime = IMAGE_MIME_BY_EXT[extensionOf(resolved)]
    if (!mime) {
      // Local candidate we deliberately do not embed.
      skipped += 1
      continue
    }

    let outcome = cache.get(resolved)
    if (outcome === undefined) {
      outcome = 'SKIP_MISSING'
      try {
        const stats = await ipcFs.stat(resolved)
        if (!stats || !stats.isFile) {
          outcome = 'SKIP_MISSING'
        } else if (stats.size >= EMBED_CAP_BYTES) {
          outcome = 'SKIP_TOO_BIG'
        } else {
          const bytes = await ipcFs.readBinary(resolved)
          outcome = `data:${mime};base64,${arrayBufferToBase64(bytes)}`
        }
      } catch (_) {
        // Missing, unreadable, or the read raced — the image keeps its
        // src; the export itself never fails on an image.
        outcome = outcome.startsWith('data:') ? outcome : 'SKIP_READ'
      }
      cache.set(resolved, outcome)
    }

    if (outcome.startsWith('data:')) {
      image.setAttribute('src', outcome)
      embedded += 1
    } else {
      skipped += 1
    }
  }

  return {
    html: container.innerHTML,
    embedded,
    total: embedded + skipped,
    skipped
  }
}
// END_BLOCK_EMBED_PASS
