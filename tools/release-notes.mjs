// FILE: tools/release-notes.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Extract the reviewed human release-note draft for one tag and compose it above an untouched automated verification block.
//   SCOPE: Parse the English draft ledger and combine Markdown strings; never creates, edits, or publishes a GitHub Release.
//   DEPENDS: Node.js fs, path, and url standard-library modules; docs/release-notes-en-drafts.md.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ReleaseNotesError - Stable coded release-note extraction error.
//   extractReleaseNotes - Returns the fenced reviewed Markdown for one exact tag.
//   composeReleaseBody - Places reviewed notes above one preserved automated block separator.
//   fail - Raise one stable release-note error.
//   escapeRegExp - Escape one tag for exact section matching.
//   optionValue - Read one named command-line option.
//   main - Run the command-line interface.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-20 v1.0.0: add deterministic reviewed-draft extraction and automated-block preservation for 2.6.0.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export class ReleaseNotesError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleaseNotesError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReleaseNotesError(code, message)
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// START_CONTRACT: extractReleaseNotes
//   PURPOSE: Extract exactly one reviewed fenced Markdown section for a release tag.
//   INPUTS: { source: string - English draft ledger, tag: string - exact v-prefixed SemVer tag }
//   OUTPUTS: { string - human Markdown without the outer code fence }
//   SIDE_EFFECTS: none.
//   LINKS: docs/release-notes-en-drafts.md
// END_CONTRACT: extractReleaseNotes
// START_BLOCK_EXTRACT_RELEASE_NOTES
export const extractReleaseNotes = (source, tag) => {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag ?? '')) {
    fail('MT_RELEASE_NOTES_TAG_INVALID', `tag=${tag ?? 'missing'}`)
  }
  const section = new RegExp(
    '^## ' +
      escapeRegExp(tag) +
      '\\s*\\n+```markdown\\n([\\s\\S]*?)\\n```(?=\\n+## v|$)',
    'm'
  ).exec(source)
  if (!section) fail('MT_RELEASE_NOTES_MISSING', `tag=${tag}`)
  const notes = section[1].trim()
  if (!notes.startsWith("## What's new")) {
    fail('MT_RELEASE_NOTES_INVALID', `tag=${tag};heading=missing`)
  }
  if (notes.includes('\n---\n')) {
    fail('MT_RELEASE_NOTES_INVALID', `tag=${tag};separator=reserved`)
  }
  return notes
}
// END_BLOCK_EXTRACT_RELEASE_NOTES

// START_CONTRACT: composeReleaseBody
//   PURPOSE: Put reviewed human notes above an automated verification block while preserving the automated bytes.
//   INPUTS: { humanNotes: string - reviewed Markdown, automatedBody: string - generated release body }
//   OUTPUTS: { string - combined body with one separator }
//   SIDE_EFFECTS: none.
//   LINKS: .github/workflows/release.yml
// END_CONTRACT: composeReleaseBody
// START_BLOCK_COMPOSE_RELEASE_BODY
export const composeReleaseBody = (humanNotes, automatedBody) => {
  const human = humanNotes.trim()
  if (!human.startsWith("## What's new")) {
    fail('MT_RELEASE_NOTES_INVALID', 'humanHeading=missing')
  }
  const generated = automatedBody.trim()
  const preserved = generated.startsWith('---')
    ? generated.replace(/^---\s*/, '')
    : generated
  if (!preserved) fail('MT_RELEASE_NOTES_INVALID', 'automatedBody=missing')
  return `${human}\n\n---\n\n${preserved}\n`
}
// END_BLOCK_COMPOSE_RELEASE_BODY

const optionValue = (args, name) => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) fail('MT_RELEASE_NOTES_ARGUMENT_INVALID', `${name}=missing`)
  return value
}

const main = () => {
  try {
    const args = process.argv.slice(2)
    const tag = optionValue(args, '--tag')
    const drafts = readFileSync(resolve('docs/release-notes-en-drafts.md'), 'utf8')
    const notes = extractReleaseNotes(drafts, tag)
    const automatedPath = optionValue(args, '--automated-body')
    process.stdout.write(
      automatedPath
        ? composeReleaseBody(notes, readFileSync(resolve(automatedPath), 'utf8'))
        : `${notes}\n`
    )
  } catch (error) {
    const code = error?.code ?? 'MT_RELEASE_NOTES_INVALID'
    console.error(`[ReleaseNotes][compose][BLOCK_RELEASE_NOTES_REJECTED] code=${code} ${error.message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (import.meta.url === invokedPath) main()
