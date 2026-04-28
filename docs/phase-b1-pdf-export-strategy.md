# Phase-B1 step-8 — PDF / Export Strategy Decision

**Date:** 2026-04-28
**Phase:** B1 (Tauri Skeleton). Decision is required BEFORE Gate-Phase-B1.
**Decision deliverable:** `M-001` exposes `mt::print_to_pdf(html) → Vec<u8>`
or an explicit unsupported fallback.

## Question

mark-electron@v1.2.3 supports PDF export. Tauri 2's WebView does not
ship a built-in `webContents.printToPDF` equivalent. What's the
strategy for the v2.0 release?

## Options surveyed

### A. macOS-native: WKWebView.createPDF via objc2 FFI

**Pros:**
- Highest fidelity (system rendering pipeline).
- No external binary dependency.
- Fast.

**Cons:**
- Requires Rust ↔ Objective-C bridging (objc2 crate, custom delegate).
- macOS-only — Linux/Windows need a separate path.
- ~200-400 LOC of FFI per platform; high maintenance cost.
- WKWebView screenshot APIs have historically been quirky for full-page
  PDF (multi-column layouts, image clipping at page boundaries).

### B. tauri-plugin-printer (3rd-party)

**Pros:**
- Cross-platform (mac/linux/win).
- No FFI in our codebase.
- Active community plugin.

**Cons:**
- 3rd-party dependency on a small project; maintenance risk.
- Renders via OS print spooler, not directly to PDF — quality varies.
- Not on the Tauri core team's roadmap; future Tauri versions may break.

### C. wkhtmltopdf shell-out

**Pros:**
- Mature, well-tested rendering engine.
- Cross-platform binaries available.
- High fidelity for complex CSS.

**Cons:**
- 50+ MB extra bundled per-platform OR external download dependency.
- Project upstream is **archived** (last release 2022) — not safe for
  long-term reliance.
- Bundling violates the ~30 MB Tauri footprint goal.

### D. Pandoc bridge (already planned)

**Pros:**
- M-015 mt-pandoc-bridge ships in **Phase-B3 step-9** with macOS
  `/Library/TeX/texbin` PATH patching for LaTeX → PDF.
- Pandoc handles markdown → PDF natively (via LaTeX) AND html → PDF
  via wkhtmltopdf as a backend if the user has it installed.
- User explicitly opts in by having pandoc + a LaTeX distribution
  installed; no bundling cost on Mark's side.
- Supports the same export formats v1 supported (HTML, PDF, DOCX) via
  one external dependency.

**Cons:**
- Requires user to have pandoc + LaTeX installed locally — not
  zero-config.
- LaTeX install can be heavy (BasicTeX ~80 MB; full MacTeX ~5 GB).
- Markdown → LaTeX → PDF path can mangle code blocks with unusual
  characters; HTML → PDF path needs wkhtmltopdf which is archived.

## Decision

**Phase-B1 ships an explicit unsupported stub. PDF export delegates
to M-015 mt-pandoc-bridge (Phase-B3 step-9).**

Rationale:
1. Pandoc is already on the roadmap — adding a second PDF path costs
   maintenance without adding capabilities pandoc doesn't already
   cover.
2. Mark's primary value prop is editing, not export. Power users who
   need bulletproof PDF will install pandoc; casual users have HTML
   export via the renderer (already in v1.2.3, unchanged in v2).
3. Keeps the Tauri footprint goal (~30 MB) by NOT bundling
   wkhtmltopdf (~50 MB) or LaTeX (~80 MB+).
4. macOS-native objc2 FFI defers a substantial implementation cost
   without clear return — pandoc covers macOS users equivalently,
   and platform-specific rendering paths violate the
   write-once-run-everywhere axis Tauri sells.

## Phase-B1 deliverable

`mt::print_to_pdf` Rust handler at `src-tauri/src/m001_pdf.rs`:

```rust
#[tauri::command]
pub async fn mt_print_to_pdf(html: String) -> Result<Vec<u8>, IpcError> {
    Err(IpcError {
        code: "MT_UNSUPPORTED".to_string(),
        message: "Direct WebView-to-PDF rendering is not supported in \
                  Mark v2 by design. Use File → Export → PDF (via pandoc) \
                  in Phase-B3, or copy HTML and use a system print dialog.".to_string(),
        command: "mt::print_to_pdf".to_string(),
        planned_phase: "B3-step-9-pandoc-bridge".to_string(),
    })
}
```

The error code is `MT_UNSUPPORTED` (NOT `MT_NOT_IMPLEMENTED`) to
distinguish "deliberately not built" from "stub awaiting impl".
Renderer can match on the code and surface the appropriate UX
(e.g. greyed-out menu item with "Install pandoc to enable" tooltip
instead of an error toast).

## Renderer-side implications

- File → Export → PDF menu item in M-009 mt-menu (B3 step-12) is
  enabled IFF `M-015 mt-pandoc-bridge.is_pandoc_available()` is true,
  else greyed-out with hint.
- v1.2.3's existing HTML export path (turndown → html → save-as) ports
  unchanged via M-013b's `mt::fs::write` once that lands in B2 step-2.
- No `mt::print_to_pdf` runtime call is expected to succeed at any
  point in v2.0 — it's a contract surface for future Mark forks that
  want to add their own PDF backend without breaking the namespace.

## What this decision does NOT close

- Whether M-015 should detect the user's pandoc binary at boot and
  cache the result — implementation detail of B3 step-9.
- DOCX export — same story (deferred to pandoc-bridge).
- Print dialog (different from PDF export) — deferred to B3 step-9
  if a user surfaces it as needed.

## Verification

- Step-8 deliverable: `mt::print_to_pdf` registered as Tauri command,
  tauri.v2.json fixture lists it, M-001 BLOCK_VALIDATE_AGAINST_FIXTURE
  parity check passes.
- Behavior: `await ipcInvoke('mt::print_to_pdf', { html: '...' })`
  rejects with IpcError { code: 'MT_UNSUPPORTED', ... }.
- Frontend M-013a's mapInvokeError currently maps unknown error codes
  to UNKNOWN_COMMAND; F-MT-UNSUPPORTED-MAPPING (B2 followup) extends
  it to recognize MT_UNSUPPORTED distinctly.

---

**Decision recorded by:** strategy doc + Rust stub (commit pending).
**Reversibility:** soft — adding a real backend later means swapping
the stub body for an objc2/wkhtmltopdf/printer-plugin impl. The
contract surface stays.
