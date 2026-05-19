# Mark Promotion Strategy

Created: 2026-05-20
Status: draft — ready for first wave (GitHub presence)

## Product positioning

Mark is the spiritual successor to Mark Text (54k+ stars, abandoned 2023).
Unique gap: **open-source + native performance + true inline WYSIWYG**.

Key numbers:
- 11 MB on disk (vs 200 MB Electron Mark Text)
- 61 MB RAM idle (vs 400 MB)
- 5.4 MB DMG
- 792 unit tests + 5 e2e
- 33 built-in themes
- MIT license

One-liner: "The WYSIWYG Markdown editor that Mark Text should have become."

## Competitive landscape

| Editor | Engine | Size | RAM | Price | OSS | True WYSIWYG | Status |
|---|---|---|---|---|---|---|---|
| **Mark** | Tauri 2/Rust | 11 MB | 61 MB | Free | MIT | Yes | Active |
| Mark Text | Electron | 200 MB | 400 MB | Free | MIT | Yes | Abandoned 2023 |
| Typora | Electron | 100 MB | 200 MB | $14.99 | No | Yes | Active |
| Obsidian | Electron | 300 MB | 250 MB | Free/$50yr | No | No | Active |
| Zettlr | Electron | 100 MB | 200 MB | Free | GPL-3 | Partial | Active |
| iA Writer | Native/Swift | 30 MB | 50 MB | $49.99 | No | Partial | Active |
| Ulysses | Native/Swift | 30 MB | 60 MB | $49.99/yr | No | Partial | Active |
| Bear | Native/Swift | 20 MB | 40 MB | Free/$30yr | No | No | Active |

## Wave 1: GitHub ecosystem presence (NOW)

### 1a. marktext/marktext — comment in abandonment issue

Target: https://github.com/marktext/marktext/issues/3918

Tone: grateful, not self-promotional. Credit the original project.

```
For those looking for an actively maintained alternative:

I've been building [Mark](https://github.com/xronocode/mark) — a Tauri 2 + Rust
rewrite that keeps the same muya WYSIWYG engine and UX paradigm but ships as an
11 MB native macOS app instead of a 200 MB Electron bundle. 792 tests, 33 themes,
MIT licensed.

brew tap xronocode/mark && brew install --cask mark@alpha

This wouldn't exist without the incredible work by @Jocs and the Mark Text
community. Thank you for muya — it's what makes WYSIWYG markdown editing possible.
```

Rules:
- ONE comment only. Do not spam multiple issues.
- Do not disparage original maintainers.
- Do not claim to be "Mark Text 2.0" or imply official affiliation.

### 1b. Active forks — check for user demand

- **Tkaixiang/marktext** — our upstream for Electron stable. Check if they have issues/discussions about future direction.
- Other forks with recent activity — leave similar respectful comment if they have "alternatives" threads.

### 1c. GitHub Discoverability (DONE)

- [x] Topics added: markdown, markdown-editor, wysiwyg, tauri, rust, macos, text-editor, writing, marktext, native
- [x] Repo description updated
- [x] README has comparison table + install one-liner

## Wave 2: Awesome-lists (after Wave 1 settles, ~1 week)

Submit PRs to:
- [ ] mundimark/awesome-markdown — Editors section
- [ ] BubuAnabelas/awesome-markdown — Editors section
- [ ] Awesome-tauri lists — Apps section

Format: one-line entry with link + brief description.

## Wave 3: Show HN + Reddit (after perf pass, M-026/M-027 shipped)

Prerequisite: cold start <400ms, bundle <2MB, GIF/video demo recorded.

### Hacker News
- Title: "Show HN: Mark – open-source WYSIWYG markdown editor, 11 MB, built on Tauri 2 (successor to Mark Text)"
- Time: Tuesday-Thursday, 8-10 AM Pacific
- Detailed founder comment within 5 minutes explaining motivation, tech choices
- Be prepared to answer: "why not just use Typora/Obsidian/VS Code?"

### Reddit
- r/rust — "I rewrote a 200 MB Electron app in Tauri 2 + Rust. Here's what happened."
- r/macapps — "Mark: native WYSIWYG markdown editor, 11 MB, open source"
- r/markdown — "Open-source alternative to Mark Text, rebuilt on Tauri 2"
- r/opensource — project showcase

Rules:
- Stagger posts across 2-3 weeks
- "I built X to solve Y" framing, not "check out my project"
- Answer every comment for first 48 hours

## Wave 4: Product Hunt (optional, after stable v2.0.0)

- Launch at 12:01 AM PT for full voting window
- Need: polished landing page, GIF demo, tagline
- Good for backlinks and SEO, less critical for dev tools

## Prerequisites before public launch

| Need | Why | Status |
|---|---|---|
| GIF/video demo | Screenshots don't show WYSIWYG in action | TODO |
| Performance pass | White screen on cold start = bad first impression | M-024/025 done, M-026/027 pending |
| 2-3 more screenshots | Source code mode, sidebar, diagrams | TODO |
| Cmd+F (Find in file) | People will try immediately | Beta milestone |

## Messaging guidelines

DO:
- "Inspired by Mark Text" or "Continuing the vision of Mark Text"
- Credit the original project, link to it, acknowledge its community
- Explain what's different (Tauri 2 vs Electron, active maintenance, performance numbers)
- Use specific numbers (11 MB, 61 MB, 792 tests) — concrete beats vague

DON'T:
- Claim to be "Mark Text 2.0" or imply official affiliation
- Fork the brand identity
- Disparage original maintainers for abandoning
- Spam the same message in multiple places
