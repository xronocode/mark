// FILE: site/scripts/seo-files.mjs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure builders for the machine-facing site files — llms.txt
//            (llmstxt.org: what Mark is, install paths, docs map, source)
//            and /.well-known/security.txt (RFC 9116) — emitted in buildEnd
//            so they land in dist with the right SITE_URL/base.
//   SCOPE: llmsTxt(settings) and securityTxt(settings, now) as pure string
//          builders over resolveSiteSettings() output; facts come from
//          README.md (install paths, editions) and the repo URLs also used
//          by the JSON-LD graph.
//   DEPENDS: ../.vitepress/landing.mjs (SITE_META, install fact constants)
//   LINKS: M-053 SiteBuild; C-64 T-003 R-8; site/.vitepress/config.mts
//          buildEnd (writer); site/scripts/check-dist.mjs (gate)
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   BREW_INSTALL - the Homebrew one-liner from README.md (single source in code)
//   llmsTxt - settings -> llms.txt body (absolute URLs under siteUrl)
//   securityTxt - settings + now -> RFC 9116 body with a 365-day expiry
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.2.0 - 2026-10-21 C-64: llms.txt lists the AI Agents & Clients guide.]
//   PREV: [v1.1.0 - 2026-10-18 C-64 T-006: BREW_INSTALL is the
//                 tap-free one-liner "brew install --cask xronocode/mark/mark"
//                 (brew taps xronocode/mark automatically); the old
//                 tap-then-install pair failed when copied without the tap.]
//   PREV: [v1.0.0 - 2026-10-18 C-64 T-003: first version.]
// END_CHANGE_SUMMARY

import { APP_STORE_URL, GITHUB_RELEASES, GITHUB_REPO, SITE_META } from '../.vitepress/landing.mjs'

export const BREW_INSTALL = 'brew install --cask xronocode/mark/mark'

// START_CONTRACT: llmsTxt
//   PURPOSE: The llmstxt.org entry point for crawlers and agents: one-line
//            summary, a short orientation paragraph, the three install
//            paths, the docs map and the source/license block.
//   INPUTS: { settings: resolveSiteSettings() output (siteUrl includes base) }
//   OUTPUTS: { string - llms.txt body }
//   SIDE_EFFECTS: none
// END_CONTRACT: llmsTxt
// START_BLOCK_LLMS_TXT
export function llmsTxt (settings) {
  const u = settings.siteUrl
  return `# Mark

> ${SITE_META.description}

Mark is a WYSIWYG Markdown editor for reading and editing the files your AI
agents write, while they write them: tables, diagrams and math render inline,
every save on disk reloads the open tab, and a diff against Mark's own
snapshots shows what changed. It ships in two editions built from the same
code: a Homebrew / direct-download build for macOS and Windows, and a
sandboxed Mac App Store build.

## Install

- Mac App Store: ${APP_STORE_URL}
- Homebrew (macOS, Apple silicon): \`${BREW_INSTALL}\`
- Windows (x64): Mark_<version>_x64-setup.exe from ${GITHUB_RELEASES} (the
  installer is not code-signed yet, so SmartScreen shows "Windows protected
  your PC": choose More info, then Run anyway)

## Docs

- [Guide](${u}/guide/): what Mark is and how to set it up with your agent
- [Installation](${u}/guide/installation): every install path and its updates
- [Editions](${u}/guide/editions): what differs between the Homebrew/download and App Store builds
- [Quick start](${u}/guide/quickstart): open a file, follow an agent, edit in place
- [AI Agents & Clients](${u}/guide/ai-agents): put the mark CLI in PATH, live preview for agent output, default editor, clients with fixed editor menus, an AGENTS.md snippet
- [Editor basics](${u}/guide/editor): the editing model and view modes
- [Keyboard shortcuts](${u}/guide/shortcuts): the full shortcut list
- [Themes](${u}/guide/themes): the theme families and custom CSS
- [Export](${u}/guide/export): HTML, PDF, DOCX and the copy formats
- [Diagram gallery](${u}/diagrams/): all 32 diagram types, rendered live in every theme
- [Changelog](${u}/changelog): release history
- [Privacy](${u}/privacy): what the app and the site collect (nothing / cookies opt-in)

## Source

- Source, issues and releases: ${GITHUB_REPO}
- License: MIT
`
}
// END_BLOCK_LLMS_TXT

// START_CONTRACT: securityTxt
//   PURPOSE: RFC 9116 /.well-known/security.txt — security contact via the
//            GitHub advisory form, a 365-day expiry so stale files surface,
//            and the canonical location on this site.
//   INPUTS: { settings: resolveSiteSettings() output, now: Date - build time }
//   OUTPUTS: { string - security.txt body }
//   SIDE_EFFECTS: none
// END_CONTRACT: securityTxt
// START_BLOCK_SECURITY_TXT
export function securityTxt (settings, now = new Date()) {
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  return [
    `Contact: ${GITHUB_REPO}/security/advisories/new`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en, ru',
    `Canonical: ${settings.siteUrl}/.well-known/security.txt`,
    `Policy: ${GITHUB_REPO}/security/policy`
  ].join('\n') + '\n'
}
// END_BLOCK_SECURITY_TXT
