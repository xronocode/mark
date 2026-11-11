// FILE: tests/quicklook/PreviewBoundaryTests.swift
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Exercise the actual QuickLook provider and packaged renderer in a separately identified native fixture.
//   SCOPE: Twenty-four positive/negative cases, harmless markers, local resources and navigation; no installed extension or external service.
//   DEPENDS: Cocoa, WebKit, actual PreviewProvider and MarkdownRenderer.
//   LINKS: M-073; V-M-073; C-QUICKLOOK-CONTENT-BOUNDARY.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   BoundaryCase - Named Markdown fixture with an optional native-policy probe.
//   PreviewBoundaryTests - Main-actor native case runner and result protocol.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11 C-QUICKLOOK-CONTENT-BOUNDARY: run actual provider cases without registration or a replacement webview.
// END_CHANGE_SUMMARY

import Cocoa
import WebKit

private struct BoundaryCase {
    let id: String
    let markdown: String
    let action: String
    let filename: String?

    init(_ id: String, _ markdown: String = "", action: String = "", filename: String? = nil) {
        self.id = id
        self.markdown = markdown
        self.action = action
        self.filename = filename
    }
}

@main
@MainActor
private enum PreviewBoundaryTests {
    private static let snapshotScript = """
    JSON.stringify({
      ready: document.readyState,
      text: document.getElementById('content')?.textContent || '',
      title: document.title,
      marker: window.__quicklookBoundaryExecuted === true,
      attackers: document.querySelectorAll('[data-quicklook-attacker]').length,
      tableHeaders: document.querySelectorAll('table th').length,
      heading: document.querySelector('h1')?.textContent || '',
      rightAligned: Array.from(document.querySelectorAll('th,td')).filter(cell => getComputedStyle(cell).textAlign === 'right').length,
      highlighted: !!document.querySelector('code span.hljs-keyword'),
      dangerousLinks: Array.from(document.querySelectorAll('a[href]')).filter(a => /^javascript:/i.test(a.getAttribute('href'))).length,
      svgImages: Array.from(document.images).filter(i => /^data:image\\/svg/i.test(i.getAttribute('src') || '')).length,
      rasterLoaded: Array.from(document.images).some(i => /^data:image\\/(png|gif|jpeg|webp)/i.test(i.getAttribute('src') || '') && i.naturalWidth > 0),
      localLoaded: Array.from(document.images).filter(i => /^(file:|pixel\\.png$)/i.test(i.getAttribute('src') || '') && i.naturalWidth > 0).length,
      styleLength: document.querySelector('style')?.textContent?.length || 0,
      markdownLibrary: typeof window.markdownit === 'function',
      highlightLibrary: typeof window.hljs?.highlight === 'function',
      csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    })
    """

    private static func evaluate(_ view: WKWebView, _ script: String) async -> Any? {
        await withCheckedContinuation { continuation in
            view.evaluateJavaScript(script) { value, error in
                continuation.resume(returning: error == nil ? value : nil)
            }
        }
    }

    private static func snapshot(_ view: WKWebView) async -> [String: Any]? {
        guard let json = await evaluate(view, snapshotScript) as? String,
              let data = json.data(using: .utf8),
              let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return result
    }

    private static func prepare(_ provider: PreviewProvider, file: URL, sentinel: String) async -> Bool {
        provider.view.frame = NSRect(x: 0, y: 0, width: 640, height: 480)
        let readSucceeded: Bool = await withCheckedContinuation { continuation in
            provider.preparePreviewOfFile(at: file) { error in
                continuation.resume(returning: error == nil)
            }
        }
        guard readSucceeded else { return false }
        for _ in 0..<100 {
            if let result = await snapshot(provider.webView),
               result["ready"] as? String == "complete",
               (result["text"] as? String)?.contains(sentinel) == true { return true }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return false
    }

    private static func cases(base: String, png: URL, dataImage: String) -> [BoundaryCase] {
        let mark = "window.__quicklookBoundaryExecuted=true"
        let brokenImage = "data:image/png;base64,AA=="
        let svgData = Data("<svg onload=\"\(mark)\"></svg>".utf8).base64EncodedString()
        return [
            BoundaryCase("markdown", "# Heading\n\n| A | B |\n| :--- | ---: |\n| 1 | 2 |\n\n[Readable link](#section)"),
            BoundaryCase("highlight", "```javascript\nconst answer = 42;\n```"),
            BoundaryCase("unicode-title", "Résumé 日本語 Кириллица \u{2028} \u{2029}", filename: "Résumé & <title> \"日本語\" \\ \u{2028}.md"),
            BoundaryCase("embedded-raster", "![embedded](\(dataImage))"),
            BoundaryCase("raw-event-handler", "<img data-quicklook-attacker src=\"\(brokenImage)\" onerror=\"\(mark)\">"),
            BoundaryCase("raw-script", "<script data-quicklook-attacker>\(mark)</script>"),
            BoundaryCase("script-terminator", "</script><script data-quicklook-attacker>\(mark)</script>"),
            BoundaryCase("mixed-case-terminator", "</ScRiPt><script data-quicklook-attacker>\(mark)</script>"),
            BoundaryCase("svg-handler", "<svg data-quicklook-attacker onload=\"\(mark)\"></svg>"),
            BoundaryCase("iframe-srcdoc", "<iframe data-quicklook-attacker srcdoc=\"<script>parent.__quicklookBoundaryExecuted=true</script>\"></iframe>"),
            BoundaryCase("object-embed", "<object data-quicklook-attacker data=\"\(base)/object\"></object><embed data-quicklook-attacker src=\"\(base)/embed\">"),
            BoundaryCase("form", "<form data-quicklook-attacker action=\"\(base)/form\" method=\"post\"><input name=\"fixture\" value=\"only\"></form>", action: "document.querySelector('form')?.submit(); null"),
            BoundaryCase("javascript-link", "[unsafe](javascript:window.__quicklookBoundaryExecuted=true)"),
            BoundaryCase("data-svg", "![unsafe](data:image/svg+xml;base64,\(svgData))"),
            BoundaryCase("remote-image", "![remote](\(base)/remote-image)"),
            BoundaryCase("fetch-beacon", "<img data-quicklook-attacker src=\"\(brokenImage)\" onerror=\"\(mark);fetch('\(base)/fetch');navigator.sendBeacon('\(base)/beacon','fixture')\">"),
            BoundaryCase("external-navigation", "[Leave](\(base)/navigation)", action: "document.querySelector('a')?.click(); null"),
            BoundaryCase("new-window", action: "window.open('\(base)/new-window'); null"),
            BoundaryCase("subframe", action: "var f=document.createElement('iframe');f.src='\(base)/subframe';document.body.appendChild(f);null"),
            BoundaryCase("initial-load"),
            BoundaryCase("missing-file"),
            BoundaryCase("resource-integrity"),
            BoundaryCase("file-resource-policy", "![relative](pixel.png)\n\n![absolute](\(png.absoluteString))"),
            BoundaryCase("repeat-preview")
        ]
    }

    private static func runCase(_ fixture: BoundaryCase, directory: URL, styleLength: Int) async -> [String: Any] {
        let provider = PreviewProvider()
        _ = provider.view
        if fixture.id == "missing-file" {
            let failed: Bool = await withCheckedContinuation { continuation in
                provider.preparePreviewOfFile(at: directory.appendingPathComponent("absent.md")) { error in
                    continuation.resume(returning: error != nil)
                }
            }
            return ["id": fixture.id, "passed": failed, "checks": ["readErrorReturned": failed]]
        }

        let sentinel = "QLFIXTURE-" + fixture.id
        let name = fixture.filename ?? (fixture.id + ".md")
        let file = directory.appendingPathComponent(name)
        do {
            if fixture.id == "repeat-preview" {
                let old = directory.appendingPathComponent("retired.md")
                try "QLFIXTURE-retired".write(to: old, atomically: true, encoding: .utf8)
                guard await prepare(provider, file: old, sentinel: "QLFIXTURE-retired") else {
                    return ["id": fixture.id, "passed": false, "error": "initial-preview-not-ready"]
                }
            }
            try (sentinel + "\n\n" + fixture.markdown).write(to: file, atomically: true, encoding: .utf8)
        } catch {
            return ["id": fixture.id, "passed": false, "error": "fixture-write-failed"]
        }
        guard await prepare(provider, file: file, sentinel: sentinel) else {
            return ["id": fixture.id, "passed": false, "error": "preview-not-ready"]
        }
        try? await Task.sleep(nanoseconds: 150_000_000)
        let windowsBefore = NSApplication.shared.windows.count
        let windowTypesBefore = NSApplication.shared.windows.map { "\(type(of: $0)) visible=\($0.isVisible)" }
        if !fixture.action.isEmpty { _ = await evaluate(provider.webView, fixture.action) }
        try? await Task.sleep(nanoseconds: 150_000_000)
        guard let result = await snapshot(provider.webView) else {
            return ["id": fixture.id, "passed": false, "error": "native-observation-failed"]
        }
        var checks: [String: Bool] = [
            "loaded": result["ready"] as? String == "complete",
            "ownText": (result["text"] as? String)?.contains(sentinel) == true,
            "noExecution": result["marker"] as? Bool == false,
            "noRawActiveElement": result["attackers"] as? Int == 0,
            "noDangerousLink": result["dangerousLinks"] as? Int == 0,
            "noSVGDataImage": result["svgImages"] as? Int == 0,
            "noNewNativeWindow": NSApplication.shared.windows.count == windowsBefore
        ]
        switch fixture.id {
        case "markdown":
            checks["heading"] = result["heading"] as? String == "Heading"
            checks["table"] = (result["tableHeaders"] as? Int ?? 0) >= 2
            checks["tableAlignment"] = result["rightAligned"] as? Int == 2
        case "highlight": checks["highlight"] = result["highlighted"] as? Bool == true
        case "unicode-title":
            checks["title"] = result["title"] as? String == name
            checks["unicode"] = (result["text"] as? String)?.contains("日本語 Кириллица") == true
        case "embedded-raster": checks["raster"] = result["rasterLoaded"] as? Bool == true
        case "raw-event-handler", "raw-script", "script-terminator", "mixed-case-terminator", "svg-handler", "iframe-srcdoc", "object-embed", "form", "fetch-beacon":
            checks["rawHTMLReadable"] = (result["text"] as? String)?.contains("data-quicklook-attacker") == true
        case "initial-load", "new-window":
            checks["ephemeralStorage"] = !provider.webView.configuration.websiteDataStore.isPersistent
            checks["automaticWindowsDisabled"] = !provider.webView.configuration.preferences.javaScriptCanOpenWindowsAutomatically
            checks["nativeNavigationDelegate"] = provider.webView.navigationDelegate === provider
            checks["nativeUIDelegate"] = provider.webView.uiDelegate === provider
        case "resource-integrity":
            checks["markdownLibrary"] = result["markdownLibrary"] as? Bool == true
            checks["highlightLibrary"] = result["highlightLibrary"] as? Bool == true
            checks["packagedStyle"] = result["styleLength"] as? Int == styleLength
            checks["contentSecurityPolicy"] = result["csp"] as? Bool == true
        case "file-resource-policy": checks["localImagesBlocked"] = result["localLoaded"] as? Int == 0
        case "repeat-preview": checks["retiredTextAbsent"] = (result["text"] as? String)?.contains("QLFIXTURE-retired") == false
        default: break
        }
        return ["id": fixture.id, "passed": checks.values.allSatisfy { $0 }, "checks": checks,
                "windowsBefore": windowTypesBefore,
                "windowsAfter": NSApplication.shared.windows.map { "\(type(of: $0)) visible=\($0.isVisible)" },
                "localImagesLoaded": result["localLoaded"] as? Int ?? -1]
    }

    private static func run() async -> [String: Any] {
        guard CommandLine.arguments.count == 4,
              let styleLength = Int(CommandLine.arguments[3]) else {
            return ["cases": [], "error": "invalid-fixture-arguments"]
        }
        let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let base = CommandLine.arguments[2]
        guard base.hasPrefix("http://127.0.0.1:") else { return ["cases": [], "error": "non-loopback-observer"] }
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1, pixelsHigh: 1,
                                            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                            isPlanar: false, colorSpaceName: .deviceRGB,
                                            bytesPerRow: 4, bitsPerPixel: 32) else {
            return ["cases": [], "error": "fixture-raster-unavailable"]
        }
        bitmap.setColor(NSColor.red, atX: 0, y: 0)
        guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
            return ["cases": [], "error": "fixture-raster-encode-failed"]
        }
        let png = directory.appendingPathComponent("pixel.png")
        do { try pngData.write(to: png) }
        catch { return ["cases": [], "error": "fixture-raster-write-failed"] }
        let dataImage = "data:image/png;base64," + pngData.base64EncodedString()
        // Cocoa initializes its hidden text-input window on first WebKit use.
        // Finish that startup before measuring additional windows in each case.
        let warmup = PreviewProvider()
        let warmupFile = directory.appendingPathComponent("warmup.md")
        do { try "QLFIXTURE-warmup".write(to: warmupFile, atomically: true, encoding: .utf8) }
        catch { return ["cases": [], "error": "warmup-write-failed"] }
        guard await prepare(warmup, file: warmupFile, sentinel: "QLFIXTURE-warmup") else {
            return ["cases": [], "error": "warmup-preview-not-ready"]
        }
        var lastCount = -1
        var stableCount = 0
        for _ in 0..<20 {
            let count = NSApplication.shared.windows.count
            stableCount = count == lastCount ? stableCount + 1 : 0
            lastCount = count
            if stableCount >= 3 { break }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        guard stableCount >= 3 else { return ["cases": [], "error": "native-windows-not-stable"] }
        var results: [[String: Any]] = []
        for fixture in cases(base: base, png: png, dataImage: dataImage) {
            results.append(await runCase(fixture, directory: directory, styleLength: styleLength))
        }
        return ["cases": results]
    }

    static func main() {
        let application = NSApplication.shared
        application.setActivationPolicy(.prohibited)
        Task { @MainActor in
            let result = await run()
            guard let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]),
                  let json = String(data: data, encoding: .utf8) else { exit(2) }
            print(json)
            let rows = result["cases"] as? [[String: Any]] ?? []
            exit(rows.count == 24 && rows.allSatisfy { $0["passed"] as? Bool == true } ? 0 : 1)
        }
        application.run()
    }
}
