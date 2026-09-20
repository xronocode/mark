import Foundation

enum MarkdownRenderer {
    static func render(markdown: String, title: String) -> String {
        let escapedMD = escapeForJS(markdown)
        let css = Self.css
        let markdownItJS = Self.markdownItJS
        let highlightJS = Self.highlightJS
        let highlightCSS = Self.highlightCSS

        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>\(escapeHTML(title))</title>
        <style>\(css)</style>
        <style>\(highlightCSS)</style>
        </head>
        <body>
        <article id="content"></article>
        <script>\(markdownItJS)</script>
        <script>\(highlightJS)</script>
        <script>
        (function() {
          var md = window.markdownit({
            html: true,
            linkify: true,
            typographer: true,
            highlight: function(str, lang) {
              if (lang && hljs.getLanguage(lang)) {
                try { return hljs.highlight(str, {language: lang}).value; } catch(_) {}
              }
              return '';
            }
          });
          document.getElementById('content').innerHTML = md.render(\(escapedMD));
        })();
        </script>
        </body>
        </html>
        """
    }

    private static func escapeForJS(_ s: String) -> String {
        let data = try! JSONEncoder().encode(s)
        return String(data: data, encoding: .utf8)!
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
