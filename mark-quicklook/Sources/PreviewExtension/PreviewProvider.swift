// FILE: mark-quicklook/Sources/PreviewExtension/PreviewProvider.swift
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Present the selected Markdown file in an isolated QuickLook webview.
//   SCOPE: Selected-file reads, ephemeral preview loads and denial of document navigation/new windows.
//   DEPENDS: Cocoa, QuickLookUI, WebKit, MarkdownRenderer.
//   LINKS: M-073; V-M-073; C-QUICKLOOK-CONTENT-BOUNDARY.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   PreviewProvider.loadView - Install the restricted native webview.
//   PreviewProvider.preparePreviewOfFile - Read selected UTF-8 Markdown and initiate its native load.
//   PreviewProvider.webView - Permit only the pending native initial load and refuse new windows.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-QUICKLOOK-CONTENT-BOUNDARY: ephemeral storage and deny-by-default native navigation/UI policies.
// END_CHANGE_SUMMARY

import Cocoa
import QuickLookUI
import WebKit

class PreviewProvider: NSViewController, QLPreviewingController, WKNavigationDelegate, WKUIDelegate {
    private var nativeLoadPending = false
    private(set) lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        return view
    }()

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
            nativeLoadPending = true
            webView.loadHTMLString(html, baseURL: nil)
            handler(nil)
        } catch {
            handler(error)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let isNativeLoad = nativeLoadPending
            && navigationAction.navigationType == .other
            && navigationAction.targetFrame?.isMainFrame == true
            && navigationAction.request.url?.absoluteString == "about:blank"
        if isNativeLoad { nativeLoadPending = false }
        decisionHandler(isNativeLoad ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        return nil
    }
}
