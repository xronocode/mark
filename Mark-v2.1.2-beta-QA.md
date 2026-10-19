# Mark v2.1.2-beta verification

Check each item after testing. If something breaks, write next to it what exactly happened.

## 1. File path in the title bar

- [x] Right-click the current file's name or path in the top bar.
- [x] The context menu has a copy-path command.
- [x] Choose it and paste the result below: the full path to this file should be pasted.

Result:

> PLACE**bu yerda**HERE

## 2. First document render

- [x] Close and reopen this file via Finder or **File → Open**.
- [x] Text and styling appear immediately — no blank window before the first click or scroll.
- [x] Repeat opening 2–3 times: the result stays the same.

## 3. Cursor visibility

- [x] Put the cursor at the end of the following line and type a few words:

Cursor in a regular paragraph: test

- [x] Check the cursor in a heading:

### Cursor in a heading: test

- [x] Check the cursor in a code block:

```text
Cursor in a code block: test
```

- [x] Switch to another app and come back to Mark: the cursor is visible again.
- [x] Toggle light and dark theme: the cursor has enough contrast in both.

## 4. Updates without Terminal

- [x] Open **Help → Check for Updates**.
- [x] Mark reports that `2.1.2-beta` is up to date.
- [x] No Terminal window opens.
- [x] No `brew upgrade --cask mark@alpha` command and no untrusted tap error.

## Outcome

- [ ] Everything passed.
- [x] There is an error — describe it here and attach a screenshot if possible.

Comment:

> bug — clicked "copy path", but the clipboard still held the old data; the path was not copied
