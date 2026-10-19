# Product backlog

## Editor: show or hide structural and whitespace markers

- Recorded: 2026-10-19, at the owner's request.
- Status: deferred idea; no investigation, design or implementation scheduled.
- Observation: in the table-copy paragraph preview, line-break glyphs appeared on some lines but not others. The cause and whether this distinction is expected have not been assessed.
- Consider an optional mode to show or hide editor markers together, including line-break symbols and heading-level labels such as H1.
- When this item is picked up, review which structural and whitespace markers belong in the mode and whether any required symbols are currently missing from the rendering.
- Owner instruction: record the idea only; take no further action on it for now.

## Agent-opened documents: preserve focus and signal unseen activity

- Recorded: 2026-10-19, at the owner's request.
- Status: deferred product idea; no investigation, design or implementation scheduled.
- Problem: while the user is editing one file, an agent opens another file in Mark and the new tab becomes active unexpectedly. The user loses their place and lacks context about what opened and why.
- Preferred option to explore: open agent-supplied files in a background tab, preserving the current document, focus, caret, selection and scroll position. Mark the new tab with a distinct color or dot to indicate that it was opened by an agent and has not been viewed yet. A subtle pulse is an optional treatment to consider.
- Alternative configurable behavior: open the agent-supplied file in a separate Mark window. The owner considers this less attractive than the background-tab option; focus behavior for the separate window remains to be decided.
- Extend the background-tab option to subsequent agent changes: if the user has switched away from a document and the agent updates it again, restore its unseen-activity indicator. Repeated updates should reuse the tab and indicator. The existing document diff view can explain what changed when the user chooses to review it.
- Design suggestion for later review, not an approved decision: prefer a steady dot or color as the default signal, with an accessible text label describing a new agent-opened file or unseen agent changes. Consider only a brief, optional pulse rather than persistent blinking, and respect reduced-motion preferences.
- Questions for later design: how to identify agent-originated opens and updates; when activity counts as reviewed and the indicator clears; how to distinguish unseen activity from unsaved edits; whether opening and updating need different signals; and which behavior should be the default setting.
- Owner instruction: record the idea only; do not implement or investigate it yet.

## Review comments, agent responses and tracked changes in WYSIWYG

Recorded: 2026-10-19, at the owner's request. Status: backlog brainstorm only; no approved behavior, file format, change spec or implementation plan. The owner relates this idea to Yuri's backlog; the specific item and overlap must be reconciled when a reference is available.

### Intended experience

Bring proofreading comments and a Word-like review workflow into a Markdown document. A reader selects text, leaves an anchored comment, and can ask an agent to act on it. The agent's proposed changes are visible directly in WYSIWYG as well as in the existing document diff view. Comments and review information should persist inside the `.md` file itself.

### Selection and comment entry

1. Add a visually distinct **Comment** action to the existing floating selection-formatting toolbar. Explore an accent treatment that remains identifiable without relying on color alone.
2. Open a small editor anchored to the selection while preserving the selected range. Start compact; grow with the text up to a line-count and viewport-relative height limit, then wrap and scroll internally. Reposition near viewport edges and keep the submit control reachable. Exact limits remain a design question.
3. Provide an explicit submit action and a keyboard equivalent. Explore Enter to submit and Shift+Enter for a newline; confirm the final convention and composition-input behavior before implementation. Preserve unfinished text on accidental dismissal instead of silently submitting or losing it.
4. After submission, highlight the referenced text and display a compact comment marker in the document. Clicking the marker opens the thread. Explore a margin card on wide windows and an anchored popover on narrow ones, keeping the reading flow usable.

Each comment needs a stable identity, author, timestamps, target range and lifecycle state. Replies and resolution should be supported by the eventual format. A comment about the whole document may be useful, but selection-based comments are the starting point requested by the owner.

### Keeping review data inside Markdown

These are candidates for prototyping later, not a selected syntax:

| Candidate | Benefit to explore | Main tradeoff to validate |
| --- | --- | --- |
| Hidden HTML-comment records with stable range anchors and structured thread data | Keeps the discussion in the same file and gives agents an identifiable review surface | Compatibility with Mark's parser, source editing, ordinary renderers, export, escaping and save round trips |
| Visible Markdown review blocks, such as a labeled quote or callout near the target | Makes the discussion easy to inspect as plain source | Adds visible material to the document and needs rules for separating review notes from publishable content |
| A separate sidecar file | Can hold a richer review model without adding records to the document | Does not satisfy the requested in-document persistence on its own; consider only as a derived index or optional supporting format |

Initial recommendation for investigation: versioned hidden records inside the document, with stable comment and revision IDs and explicit range anchors. Avoid relying solely on line numbers, which change during editing. Explore a combination of anchor IDs, the quoted selection and nearby context. If an anchor can no longer be matched confidently, surface a detached comment for reassignment rather than attaching it to unrelated text. Test arbitrary comment content, delimiter escaping, ranges across blocks and tables, and preservation through external edits before choosing a format.

The format should distinguish the comment, its optional agent request and any resulting revision. Raw storage details should stay out of the normal WYSIWYG interaction. Saving must preserve review records; publishing or exporting needs an explicit policy for including or omitting them. Hiding review decoration must not delete the underlying discussion.

### Agent workflow

An optional, visibly enabled mode could let a connected agent wait for newly submitted comments addressed to it and start processing immediately. Record this as a future configuration option, not permission to start an agent now. Consider document or project scope, pause/stop controls and explicit routing so ordinary discussion is not automatically treated as an instruction.

Show useful states such as queued, working, needs clarification and proposal ready. Associate each proposed revision with its originating comment, agent and baseline document version. Repeated file notifications must not execute the same request again, and simultaneous edits to one document need coordination. A stale baseline or changed target should trigger reconciliation or clarification rather than overwrite newer work.

Agent completion and comment resolution are separate events. A useful default to consider is: the agent prepares a proposal, the user reviews it, and the thread remains open until resolved. Any automatic-apply behavior would require a separate, explicit setting and clear scope.

### Show the delta in WYSIWYG

- Display insertions inline with an addition treatment and deletions with a removal treatment, using more than color alone. Keep the text readable and consider a compact expansion for long deleted passages.
- Treat replacements as linked deletion/insertion groups. Formatting changes, moved blocks and table edits need their own intelligible presentation rather than exposing raw Markdown punctuation as the only explanation.
- Offer accept/reject actions for an individual change and for the proposal associated with a comment. Group review actions into predictable undo steps; retain thread context when a proposal is rejected or revised.
- Let users switch review decoration on or off and explore original/proposed views without accidentally changing the accepted document. The diff view and WYSIWYG review must describe the same revision and baseline.
- If the user edits through a pending proposal, define how that affects the proposal before allowing acceptance. Comment targets must remain meaningful when text is changed, deleted, accepted or rejected.

### Connections and unresolved decisions

Reuse the earlier background-tab idea for proposal-ready or unseen-agent-change signals: preserve the user's current file, focus and position. Keep review visibility conceptually distinct from the general whitespace/H1 marker toggle so hiding editing symbols does not unexpectedly hide pending review work.

Open questions include exact storage syntax; range behavior across complex Markdown structures; selection-toolbar and narrow-window layout; draft submission; comment/revision visibility controls; acceptance and resolution semantics; agent integration and attribution; and compatibility with source editing, external tools and exports. Reconcile these with Yuri's related backlog item before creating an approved change.

A possible future exploration order is anchored comments and durable storage, then manual tracked proposals and inline review, then optional agent processing. This is a scoping suggestion only. The current request authorizes brainstorming and this backlog note, with no implementation.
