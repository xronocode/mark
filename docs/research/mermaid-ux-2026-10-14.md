# Mermaid UX in Mark: current state, competitors, recommendation

## 1. Current state in Mark
- **Version:** `mermaid ^11.12.2` (package.json:61). It is lazy-loaded from `src/muya/lib/renderers/index.js:22`.
- **Block build:** `src/muya/lib/parser/render/renderBlock/renderLeafBlock.js:198` creates a `div.ag-container-preview` with the placeholder "loading" and queues `{code}` in `mermaidCache`. `renderContainerBlock.js:179/227` wraps it in a `figure.ag-container-block`.
- **Render:** `src/muya/lib/parser/render/index.js:103` `renderMermaid()` runs after every render, partialRender or singleRender.
  - It calls `mermaid.initialize` with `securityLevel:'strict'` and a theme of only `dark` or `default`, picked from `body.dark`. It does not follow Mark's theme palettes.
  - It calls `mermaid.render` with an id that includes `Date.now()`, so nothing is cached and the SVG is always rebuilt.
  - It moves the `<style>` element out of the SVG to satisfy WKWebView's CSP.
- **Errors:** the whole preview is replaced with `< Invalid Mermaid Codes >`. The last good diagram disappears and the user never sees mermaid's own error message.
- **Sizing:** in `src/muya/lib/assets/styles/index.css:775`, the SVG is set to `width:100%`, and mermaid adds its own `useMaxWidth`. A wide diagram is scaled down to fit the text column, which makes its text too small to read. **This is the cause of the "can't enlarge it" complaint.**
- **Interaction:** `src/muya/lib/eventHandler/clickEvent.js:248`: any click on the preview calls `handleContainerBlockClick`, which opens the source for editing.
- **Edit mode:** in edit mode the source sits in a `pre` (`yaml` highlighting, `containerCtrl.js:4`). The live preview floats underneath as an absolute popover at `z-index:10000` (`index.css:783`).
- **What's missing:** there is no zoom, pan, fullscreen, export or copy-image, and no pinch or gesture handling. The app-wide content zoom (`--content-zoom`, `store/editor.js:1798`) is the only way to enlarge anything.
- **HTML export:** `src/muya/lib/utils/exportHtml.js:46` re-renders diagrams in the light theme only.

## 2. Competitors
| Product | Zoom/pan | Fullscreen | Export/copy | Edit UX | Theming |
|---|---|---|---|---|---|
| GitHub | +/−, arrow pan, reset buttons inline | "Expand" popup. Users call it "too thin" and the steps "not granular" [1] | Copy source | View-only | Light/dark |
| VS Code (mjbvz markdown-mermaid) | Alt+wheel, pinch, Alt+click, pan-mode button, reset, drag the bottom edge to resize height [2] | – | – | Split source/preview | Separate light and dark theme settings |
| Markdown Preview Enhanced | Whole-preview zoom only (Cmd = / − / 0) [3] | – | PNG/SVG through export | Split | Configurable |
| Obsidian core | None | – | – | Click into Live Preview to edit | Follows app |
| Obsidian Diagram Zoom Drag (~16k installs) | Wheel zoom, drag, keyboard navigation; view state kept per diagram [4] | Yes | – | – | – |
| Obsidian Mermaid Zoom / Lookout / Mermaid Canvas | Cmd+wheel zoom toward the cursor, drag, fit, zoom gauge | Fullscreen modal | PNG/SVG (Canvas) | Split editor (Canvas) | Theme loader (Toolkit) [5][6] |
| Obsidian Lightbox | Popup with wheel zoom and drag, Esc closes [4] | Modal | – | – | – |
| Typora | App zoom only (1.8.3) | – | Save as image, copy as HTML [7] | Click to reveal source above the diagram | Follows theme |
| Markdown Better View / MDViewer (Mac App Store) | Click-to-zoom fullscreen [8] | Yes | – | Viewer | – |
| Mermaid Live Editor | Pan and zoom toggle | – | PNG, SVG, copy image, link | Split | Theme picker [9] |
| GitLab | None (open request) [9] | – | – | View | – |
| JetBrains | Not documented [10] | – | – | Split | – |

I could not confirm details for Notion, Marked 3, Zed, Craft, Bear or MarkView. From prior knowledge, none of them offers more than a static render or a code/preview toggle.

**Pattern:** the best tools pair a light inline viewer (a hover toolbar plus zoom that needs a modifier key) with a **fullscreen modal** that has free pan, zoom and fit. Plain wheel scrolling keeps scrolling the document.

## 3. Recommended UX for Mark
**P0, quick wins:**
1. **Fullscreen viewer.** An overlay opened from a hover "⤢" button, or by Cmd+click / Space on a selected diagram. Inside it:
   - zoom with pinch, Cmd+wheel, `+`/`−` and `0` (fit), and `1` (100%);
   - pan by dragging or scrolling;
   - close with Esc.
2. **Hover toolbar** on each diagram: expand, fit/100% toggle, copy SVG, copy PNG, edit. A plain click still opens the source for editing, as it does today.
3. **Natural size option:** show the diagram at 100% with horizontal scroll instead of shrinking it to the column (`useMaxWidth:false` plus `overflow:auto`).
4. **Keep the last good SVG** and show mermaid's error message beneath it in a small line.

**P1:**
- Inline zoom with pinch or Cmd+wheel, plus a reset button.
- Remember zoom per diagram (keyed by block plus a hash of its code).
- Export SVG/PNG through the Tauri save dialog.
- Cache rendered SVG by a hash of code and theme, so unchanged diagrams are not re-rendered.
- Debounce re-rendering while typing (about 250 ms).
- Sync the theme by using mermaid's `base` theme with `themeVariables` taken from Mark's CSS variables.

**P2:**
- Open a diagram in its own Tauri window.
- Let the user drag to resize the inline height.
- Live split source/preview inside the fullscreen view.
- Render in a worker or on an idle callback for large diagrams.
- Accessibility: `role="img"`, `aria-label` from mermaid `accTitle`/`accDescr`, and focusable toolbar buttons.
- Use the diagram's dark theme in HTML/PDF export.

**Library: `@panzoom/panzoom` 4.6.2**
- MIT, about 3.7 KB gzipped (9.5 KB minified) according to bundlephobia.
- Actively maintained, no dependencies, works on any element through pointer events.
- `zoomWithWheel` already handles ctrl+wheel. Since Safari 18 on macOS, a trackpad pinch arrives as a wheel event with `ctrlKey` set [11].

Alternatives:
- `panzoom` (anvaka): MIT, 6.2 KB gzipped.
- `svg-pan-zoom` 3.6.2: BSD-2. It changes the viewBox, so text stays sharp, but it only works on SVG and has not been updated in years.
- `d3-zoom`: ISC, 15.5 KB gzipped with d3-selection. Too heavy for this.

A fallback is to use native `gesturestart`/`gesturechange` events (WebKit `GestureEvent.scale`) to feed `panzoom.zoom()`.

## 4. Risks
- **Click conflict:** muya treats any click on the preview as "edit". Drag-to-pan needs a modifier key inline, or should only exist in the modal.
- **Pinch in WKWebView:** if `preventDefault` fails to stop page magnification there, a native fix may be needed (`allowsMagnification=false`). Test this live under Tauri; I could not verify it.
- **Sharpness:** a CSS transform scale can rasterize while animating. Use `will-change` only during the gesture, or change the viewBox on gesture end.
- **CSP and copying:** the hoisted `<style>` has to be put back inside the SVG before copying or exporting, or the export loses its styling. PNG needs a canvas plus `ClipboardItem`. WebKit taints the canvas if the SVG contains `foreignObject`, which mermaid uses for HTML labels. Use `htmlLabels:false` or render the SVG through the Rust side.
- **Patch churn:** snabbdom's `patch` replaces the preview DOM, so zoom state must live outside the DOM.
- **Coverage:** keep the 95% coverage thresholds.

## 5. Task breakdown (GRACE change spec)
- **T1:** Contract and graph delta. Add a new module `muya/lib/ui/diagramViewer` (or extend the M-0xx muya render module); add the verification entry and log markers `[DiagramViewer][open|zoom|export][BLOCK_*]`.
- **T2:** Render pipeline. Cache by code hash, keep the last good SVG, render the error message, debounce, add the natural-size option.
- **T3:** Hover toolbar inside the `figure` (`contenteditable=false`); change the click routing in `clickEvent.js`.
- **T4:** Fullscreen overlay (Vue component or muya float) with @panzoom/panzoom, keyboard shortcuts and a focus trap.
- **T5:** Inline Cmd+wheel / pinch zoom with per-diagram state.
- **T6:** Copy and export SVG/PNG: restore the style, Tauri save dialog, clipboard.
- **T7:** Mermaid theme from CSS variables; light and dark in export.
- **T8:** Tests.
  - vitest: cache, error-keep, toolbar actions, export serializer.
  - Playwright e2e: open overlay, zoom, Esc.
  - Live check in WKWebView for pinch.

## Sources
1. https://forum.obsidian.md/t/pan-and-zoom-on-mermaid-diagrams/65271
2. https://github.com/mjbvz/vscode-markdown-mermaid
3. https://github.com/shd101wyy/vscode-markdown-preview-enhanced
4. https://www.obsidianstats.com/plugins/diagram-zoom-drag ; https://community.obsidian.md/plugins/lightbox
5. https://github.com/xiaozhuang0433/mermaid-zoom ; https://www.obsidianstats.com/plugins/lookout
6. https://community.obsidian.md/plugins/mermaid-canvas
7. https://typora.io/releases/dev
8. https://macmdviewer.com/vs/markdown-better-view ; https://apps.apple.com/us/app/id6767140339
9. https://gitlab.com/gitlab-org/technical-writing/docs-gitlab-com/-/issues/230 ; https://github.com/mermaid-js/mermaid-live-editor/issues/887
10. https://www.jetbrains.com/help/rider/Markdown.html
11. https://lists.w3.org/Archives/Public/public-webapps-github/2024Oct/0088.html ; https://bugs.webkit.org/show_bug.cgi?id=230545
- Library sizes and licenses: the bundlephobia API and the npm registry (queried 2026-10-14).
