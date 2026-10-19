| Item | Owner | Status | Next step |
| --- | --- | --- | --- |
| Search | Maya | Ready | Check keyboard focus |
| PDF export | Leo | In review | Keep links and footnotes |
| Sync | Sam | Planned | Resolve offline edits |

# 1. Copy as paragraphs

Manual context preview. The table above is the source. Below is the proposed plain-text result when copying a selection that also contains text before and after the table.

---

Launch review: three items need a decision this week.

Item: Search  
Owner: Maya  
Status: Ready  
Next step: Check keyboard focus

Item: PDF export  
Owner: Leo  
Status: In review  
Next step: Keep links and footnotes

Item: Sync  
Owner: Sam  
Status: Planned  
Next step: Resolve offline edits

Please confirm the next step for each item.

---

One source row becomes one paragraph block. Each column starts on a new line, prefixed by its column name. A blank line separates successive row blocks. Column and row order stay the same, and long values wrap naturally at any width. The surrounding text stays in its original position. No table syntax or column alignment is needed in the copied text. Markdown hard breaks preserve the preview layout in Mark; the proposed clipboard text uses ordinary line breaks.

This is a hand-prepared example for review. No copy command has been implemented.
