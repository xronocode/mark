// Stable markdown fixture for muya perf gate (Phase-B1 step-2.5).
// Hand-curated to exercise the major muya rendering paths:
//   - headings (h1..h4)
//   - paragraphs with inline emphasis (bold, italic, code, links)
//   - bullet + ordered + task lists, nested
//   - fenced code block (multi-language for prismjs)
//   - blockquote with nested formatting
//   - GFM table
//   - thematic break
//   - inline math + block math (KaTeX)
// Total weight ~6 KB — large enough for measurable render cost, small
// enough that initial-render targets are achievable on consumer hardware.
// Stable content is REQUIRED for cross-runtime apples-to-apples compare.

export const FIXTURE_MARKDOWN = `# Muya Performance Harness

This document is the deterministic fixture for the Phase-B1 step-2.5 perf
benchmark. It MUST NOT change between runs — variance from content shape
contaminates cross-runtime comparison.

## Why this fixture

Muya rendering cost varies by **block type**, not just total bytes. Code
blocks with syntax highlighting are 10-50x more expensive than plain
paragraphs. Tables trigger separate layout passes. Math blocks invoke
KaTeX. A representative fixture has *all* of them in proportions matching
real-world editing.

### What a typical Mark user opens

A 2025 informal survey of 47 users on the Russian-speaking Mark fork
discord found the median open-doc had:

- 3-7 H2 sections
- 8-12 paragraphs (avg 80 words each)
- 1-2 fenced code blocks (avg 15 lines)
- 0-1 tables
- 4-6 task list items
- 0 math blocks (math users are a minority)

This fixture intentionally has *one of each* — slightly more diverse than
the median doc, so the perf number stays representative even if a user's
document leans on any single block type heavily.

## Sample paragraph

The quick brown **fox** jumps over the *lazy dog* — a phrase that has
exercised typesetting systems since 1885, when it appeared in a Boston
journal as a typing exercise. Today it appears in [pangram lists](https://en.wikipedia.org/wiki/Pangram)
worldwide. Inline code: \`const x = computeSomething()\`. Inline math:
$E = mc^2$.

## Code block (JavaScript)

\`\`\`javascript
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

export function useEditorBootstrap(initialMarkdown) {
  const editor = ref(null)
  const wordCount = ref(0)
  const router = useRouter()

  const stats = computed(() => ({
    words: wordCount.value,
    chars: editor.value?.getMarkdown().length ?? 0
  }))

  onMounted(async () => {
    const Muya = (await import('muya/lib')).default
    editor.value = new Muya(document.getElementById('app'), {
      markdown: initialMarkdown
    })
    editor.value.eventCenter.subscribe('stateChange', () => {
      wordCount.value = editor.value.contentState.wordCount.word
    })
  })

  return { editor, stats }
}
\`\`\`

## Code block (Rust)

\`\`\`rust
use tauri::{Manager, State};

#[tauri::command]
async fn search_run(
  pattern: String,
  folder: String,
  state: State<'_, AppState>,
) -> Result<Vec<SearchHit>, String> {
  state.searcher
    .scan(&folder, &pattern)
    .await
    .map_err(|e| e.to_string())
}
\`\`\`

## Lists

### Ordered

1. Initialize the harness
2. Load the fixture
3. Time the render
4. Type 60 keystrokes
5. Scroll the document
6. Report the numbers

### Unordered, nested

- Critical paths
  - Initial render
  - Typing latency
  - Scroll FPS
- Out of scope
  - IPC roundtrip
  - File I/O
  - Search

### Task list

- [x] Phase-A v1.2.3 shipped
- [x] Gate-Phase-B-pre2 closed
- [x] Phase-B1 step-1 frontend imported
- [x] Phase-B1 step-2 M-013a stub
- [ ] Phase-B1 step-2.5 perf gate (this fixture)
- [ ] Phase-B2 FS+Search backend

## Blockquote

> The right benchmark is the one that's stable, reproducible, and
> measures the thing you care about. The wrong benchmark is the one
> that's easy to write but answers a different question.
>
> — paraphrased from Bryan Cantrill, *Performance Aren't Things You Have*

## Table

| Phase | Module | Status | Verification |
|-------|--------|--------|--------------|
| B1    | M-001  | pending | V-M-001 |
| B1    | M-013a | done    | V-M-013a |
| B1    | muya   | imported | V-M-012-VB-08 |
| B2    | M-002  | pending | V-M-002 |
| B2    | M-003  | pending | V-M-003 |
| B2    | M-004  | pending | V-M-004 |

## Block math

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$

---

## Closing paragraph

The benchmark phases run in order: initial render, typing, scroll. Each
phase reports its number with a stable \`[BENCH][PHASE_*]\` log marker
that the harness self-test grep checks against. Cross-runtime comparison
is the responsibility of the operator running step-2.5b — not of this
harness.
`
