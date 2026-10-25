# Accessibility

Mark is a desktop Markdown editor for macOS and Windows. We want it to stay usable with keyboard-only operation, larger text, and screen readers, and we treat a report about a barrier the same as a bug report.

We have not run a formal WCAG evaluation and do not claim conformance to any level. This page describes what works today, what does not, and where to report a barrier.

## Supported environments

- macOS and Windows. Every command is a native menu item with a keyboard shortcut.
- Editor text size is adjustable with `Cmd/Ctrl+=` and `Cmd/Ctrl+-`.
- Built-in light and dark themes.
- Interface in ten languages.

## Known limitations

- The visual editor is a custom contenteditable canvas. In WYSIWYG mode, screen readers do not always announce structure such as headings and lists. Source Code Mode (`Cmd/Ctrl+Alt+S`) edits plain text and works more reliably with screen readers; Split View (`Cmd/Ctrl+Alt+\`) shows source and rendered text side by side.
- Rendered diagrams and math are visual images; we do not generate text alternatives for them.
- We have not done systematic testing with VoiceOver, NVDA, or JAWS. Reports from people who use assistive technology are our main source of feedback here.

## Reporting a barrier

Open an issue with the [bug report form](https://github.com/xronocode/mark/issues/new?template=bug_report.yml) and describe what you were trying to do and what got in the way. Mention the screen reader or other assistive technology you use if it is relevant; you never need to disclose a disability. You can also write to myevdokimov@gmail.com if you prefer email.
