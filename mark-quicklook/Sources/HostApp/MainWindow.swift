import Cocoa

class MainWindowController: NSWindowController {
    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 260),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Mark QuickLook"
        window.center()

        let view = NSView(frame: window.contentView!.bounds)
        view.autoresizingMask = [.width, .height]

        let label = NSTextField(wrappingLabelWithString:
            "Mark QuickLook is a preview extension for Finder.\n\n" +
            "Select any .md file in Finder and press Space to see a " +
            "rendered Markdown preview — with syntax highlighting, " +
            "tables, and GitHub Flavored Markdown.\n\n" +
            "This app can stay closed. The extension works automatically."
        )
        label.font = .systemFont(ofSize: 13)
        label.alignment = .center
        label.frame = view.bounds.insetBy(dx: 30, dy: 30)
        label.autoresizingMask = [.width, .height]
        view.addSubview(label)

        window.contentView = view
        self.init(window: window)
    }
}
