# Clipboard Fixture Capture

Standalone zero-build tool for harvesting clipboard fixtures from rendered chat and web surfaces.

## What it captures

- Advertised clipboard MIME types
- `text/plain`
- `text/html`
- `text/markdown`
- `text/x-markdown`
- `text/rtf` / `application/rtf` when the browser exposes them
- Clipboard item metadata
- File/image metadata such as name, type, and size

## What it does not capture

- Raw OS-native clipboard envelopes like Windows `CF_HTML` headers
- Proprietary app-private clipboard formats that the browser does not expose
- Binary file contents

This is intentional. For `Mark` smart-paste work, the browser-visible payload is the first fixture family we need because the editor consumes clipboard content through browser/webview APIs.

## Usage

1. Download the repo zip or clone it.
2. Open `tools/clipboard-capture/index.html` in Chrome or Edge.
3. Fill `Source label` with something stable like `claude-vscode`, `chatgpt-web`, or `github-readme`.
4. Click the large capture zone.
5. In the source app/page, copy the rendered content you want to study.
6. Return to the capture page and press `Ctrl+V` on Windows/Linux or `Cmd+V` on macOS.
7. Review the rendered preview and the preferred text payload.
8. Use `Copy fixture packet` to copy the full markdown packet, `Download JSON` to save the raw fixture, or `Open GitHub issue` to open a prefilled issue for `owner/repo`.
9. The tool will try to copy the full issue packet to the clipboard automatically before opening GitHub.

## Recommended fixture naming

- `claude-vscode-list-inline-code`
- `chatgpt-fenced-code`
- `github-readme-table`
- `notion-bullets-links`

## Notes for Windows

- Use Edge or Chrome first; clipboard MIME exposure is typically stronger than Firefox for rich HTML.
- If a source only exposes `text/plain`, that is still useful evidence.
- This page is intentionally `file://`-safe: it uses classic browser scripts instead of module imports, so your friend can open it straight from a downloaded repo zip.
- `Open GitHub issue` uses a compact human-first issue body plus a copied full packet. The compact part avoids browser URL-length limits on very large HTML clipboard payloads.
- If you eventually need the raw `CF_HTML` envelope, build a second native capture tool later. This page is the browser/webview fixture layer, not the OS clipboard forensic layer.
