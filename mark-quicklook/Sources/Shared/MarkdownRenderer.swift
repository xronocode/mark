// FILE: mark-quicklook/Sources/Shared/MarkdownRenderer.swift
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Render untrusted Markdown using only packaged scripts and styles.
//   SCOPE: UTF-8 data embedding, escaped titles, disabled raw HTML and nonce-based CSP; embedded raster images only.
//   DEPENDS: Foundation; unchanged packaged markdown-it/highlight/CSS resources.
//   LINKS: M-073; V-M-073; C-QUICKLOOK-CONTENT-BOUNDARY.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   MarkdownRenderer.render - Produce a self-contained restricted preview document.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-QUICKLOOK-CONTENT-BOUNDARY: keep Markdown in a data boundary and restrict executable content/resources.
// END_CHANGE_SUMMARY

import Foundation

enum MarkdownRenderer {
    static func render(markdown: String, title: String) -> String {
        let encodedMarkdown = Data(markdown.utf8).base64EncodedString()
        let nonce = UUID().uuidString
        let css = Self.css
        let markdownItJS = Self.markdownItJS
        let highlightJS = Self.highlightJS
        let highlightCSS = Self.highlightCSS

        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-\(nonce)'; style-src 'nonce-\(nonce)'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>\(escapeHTML(title))</title>
        <style nonce="\(nonce)">\(css)</style>
        <style nonce="\(nonce)">\(highlightCSS)</style>
        </head>
        <body>
        <article id="content"></article>
        <script type="application/octet-stream" id="markdown-data">\(encodedMarkdown)</script>
        <script nonce="\(nonce)">\(markdownItJS)</script>
        <script nonce="\(nonce)">\(highlightJS)</script>
        <script nonce="\(nonce)">
        (function() {
          var md = window.markdownit({
            html: false,
            linkify: true,
            typographer: true,
            highlight: function(str, lang) {
              if (lang && hljs.getLanguage(lang)) {
                try { return hljs.highlight(str, {language: lang}).value; } catch(_) {}
              }
              return '';
            }
          });
          var source = document.getElementById('markdown-data');
          var bytes = Uint8Array.from(atob(source.textContent), function(c) { return c.charCodeAt(0); });
          source.remove();
          document.getElementById('content').innerHTML = md.render(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
        })();
        </script>
        </body>
        </html>
        """
    }

    private static func escapeHTML(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
         .replacingOccurrences(of: "<", with: "&lt;")
         .replacingOccurrences(of: ">", with: "&gt;")
         .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static var css: String {
        bundleResource("style", ext: "css") ?? Self.fallbackCSS
    }

    private static var markdownItJS: String {
        bundleResource("markdown-it.min", ext: "js") ?? ""
    }

    private static var highlightJS: String {
        bundleResource("highlight.min", ext: "js") ?? ""
    }

    private static var highlightCSS: String {
        bundleResource("github-dark", ext: "css") ?? ""
    }

    private static func bundleResource(_ name: String, ext: String) -> String? {
        // Look in the extension bundle first, then the main bundle
        for bundle in [Bundle(for: BundleToken.self), Bundle.main] {
            if let url = bundle.url(forResource: name, withExtension: ext) {
                return try? String(contentsOf: url, encoding: .utf8)
            }
        }
        return nil
    }

    private static let fallbackCSS = """
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #c9d1d9;
      background: #0d1117;
      padding: 24px;
      max-width: 860px;
      margin: 0 auto;
    }
    """
}

private class BundleToken {}
