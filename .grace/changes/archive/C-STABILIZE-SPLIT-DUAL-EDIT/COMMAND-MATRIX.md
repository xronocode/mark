# Focused split command matrix

The executable `SPLIT_COMMAND_MATRIX` enumerates all 51 current edit/paragraph/format ids; registry parity is a required test. Both panes share the current tab and Muya History. Never-unified single-pane routes remain unchanged. Locked/preview surfaces reject mutation and retain selection/copy. Existing save/print/export and extension context routes flush the pending shared owner first.

| Command id | Rich focused | Source focused |
| --- | --- | --- |
| `edit.select-all` | Existing Muya command on its remembered rich selection. | Select all source text; search/dialog fields keep their ordinary selection behavior. |
| `edit.undo` | Same shared document undo and caret restoration. | Exactly one Muya-owned document undo; restore both endpoint snapshots, retain focused pane. |
| `edit.redo` | Same shared document redo and caret restoration. | Exactly one shared redo; no CodeMirror-local replay. |
| `edit.duplicate` | Existing Muya command on its remembered rich selection. | Duplicate complete selected source lines as one operation. |
| `edit.create-paragraph` | Existing Muya command on its remembered rich selection. | Insert a blank paragraph after the selected lines. |
| `edit.delete-paragraph` | Existing Muya command on its remembered rich selection. | Delete complete selected lines as one operation. |
| `edit.find` | Existing Muya command on its remembered rich selection. | Open the existing search UI, retaining source command ownership. |
| `edit.find-next` | Existing Muya command on its remembered rich selection. | Navigate next source match and scroll it into view. |
| `edit.find-previous` | Existing Muya command on its remembered rich selection. | Navigate previous source match and scroll it into view. |
| `edit.replace` | Existing Muya command on its remembered rich selection. | Replace current/all source matches, honoring case/word/regexp search options. |
| `edit.screenshot` | Existing captured-image paste pipeline. | Focus source and paste captured image through the same guarded asset insertion pipeline. |
| `edit.find-in-folder` | Existing shared workspace route. | Existing workspace search, shared document-independent route. |
| `edit.go-to-heading` | Existing Muya command on its remembered rich selection. | Existing heading palette over the shared parsed TOC; render-only follow refreshes it. |
| `edit.format-document` | Existing Muya command on its remembered rich selection. | Run the existing whole-document formatter once; one shared undo restores exact source. |
| `edit.copy-as-html` | Existing Muya command on its remembered rich selection. | Copy source selection or document through existing marked+sanitize+native HTML pipeline. |
| `edit.copy-as-plain-text` | Existing Muya command on its remembered rich selection. | Render source selection/document and write plain text through existing converter. |
| `edit.copy-as-structured-text` | Existing Muya command on its remembered rich selection. | Render source selection/document and write existing structure-preserving text flavor. |
| `edit.copy-as-markdown` | Existing Muya command on its remembered rich selection. | Write exact selected source, else exact whole raw document. |
| `paragraph.heading-1` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to heading 1. |
| `paragraph.heading-2` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to heading 2. |
| `paragraph.heading-3` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to heading 3. |
| `paragraph.heading-4` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to heading 4. |
| `paragraph.heading-5` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to heading 5. |
| `paragraph.heading-6` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to heading 6. |
| `paragraph.upgrade-heading` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to upgrade heading. |
| `paragraph.degrade-heading` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to degrade heading. |
| `paragraph.table` | Existing Muya command on its remembered rich selection. | Existing Rows/Columns dialog inserts a Markdown table at the source selection. |
| `paragraph.code-fence` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to code fence. |
| `paragraph.quote-block` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to quote block. |
| `paragraph.math-formula` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to math formula. |
| `paragraph.html-block` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to html block. |
| `paragraph.order-list` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to order list. |
| `paragraph.bullet-list` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to bullet list. |
| `paragraph.task-list` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to task list. |
| `paragraph.loose-list-item` | Existing Muya command on its remembered rich selection. | Separate selected list items with blank lines. Outside a list, show the explicit unavailable reason; no silent no-op. |
| `paragraph.paragraph` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to paragraph. |
| `paragraph.reset-paragraph` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to reset paragraph. |
| `paragraph.horizontal-line` | Existing Muya command on its remembered rich selection. | Transform the complete selected source lines to horizontal line. |
| `paragraph.front-matter` | Existing Muya command on its remembered rich selection. | Insert front matter at document start. |
| `format.strong` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.emphasis` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.underline` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.highlight` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.superscript` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.subscript` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.inline-code` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.inline-math` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.strike` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.hyperlink` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.image` | Existing Muya command on its remembered rich selection. | Wrap/unwrap the selected text with the equivalent Markdown/HTML markers; clear-format removes selected formatting. |
| `format.clear-format` | Existing Muya command on its remembered rich selection. | Remove formatting markers from the source selection. |

Source native keymap, the custom context menu, menu/palette commands, extension undo and rich keyboard undo all use the same owner. Copy/cut/plain text paste and text drop keep CodeMirror editing semantics; image paste/drop uses the existing asset saver with a tab-identity guard, bookmark insertion and propagation isolation from Muya’s document-level paste listener. Statistics use the focused source selection; diagnostics/autosave see one content event.
