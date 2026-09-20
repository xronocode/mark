import Cocoa
import QuickLookUI
import WebKit

class PreviewProvider: NSViewController, QLPreviewingController {
    let webView = WKWebView()

    override func loadView() {
        self.view = webView
    }

    func preparePreviewOfFile(
        at url: URL,
        completionHandler handler: @escaping (Error?) -> Void
    ) {
        do {
            let markdown = try String(contentsOf: url, encoding: .utf8)
            let fileName = url.lastPathComponent
            let html = MarkdownRenderer.render(markdown: markdown, title: fileName)
            webView.loadHTMLString(html, baseURL: nil)
            handler(nil)
        } catch {
            handler(error)
        }
    }
}
