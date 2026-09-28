# App Store Connect — submission pack (C-15 T-M6)

Created: 2026-09-21. App record: "Mark: light MD editor for AI",
bundle `com.xronocode.mark`, team prefix NY72L3P5TN, SKU mark-001,
platform macOS, primary language English (U.S.).

## Store listing

- **Name**: Mark: light MD editor for AI (30-char limit, accepted)
- **Subtitle** (30 chars): `WYSIWYG markdown, 11 MB`
- **Keywords** (100 chars): `markdown,wysiwyg,editor,mermaid,katex,live reload,agent,ai,notes,plain text`
- **Description** (≤4000):

```
Mark is a native macOS Markdown editor built around one idea: your editor
should be the cheapest window you have open.

ULTRALIGHT
The whole app is 11 MB (28 MB installed), uses ~61 MB of RAM at idle and
opens in under a second. No Electron, no bundled browser — Mark renders
through the system WebKit your Mac already runs.

WYSIWYG, NOT FRAGILE SOURCE
Rich editing with live-rendered tables, Mermaid diagrams, KaTeX math and
syntax-highlighted code — plus a source mode when you want it. 21 themes
from Cadmium Light to Synthwave '84.

BUILT FOR AI WORKFLOWS
Your agents write Markdown to disk; Mark re-renders instantly with the
cursor preserved, so you can jump back in the moment a pass finishes.
An opt-in localhost live-viewer endpoint lets local tools stream document
updates as the agent types.

FOR HUMANS TOO
Project sidebar with file tree, tabs, fuzzy search, diff view, spell
checking, and Copy as HTML / Plain Text for pasting clean formatting
straight into email.

PRIVACY
No account, no analytics, no telemetry. Your documents never leave your
machine. Privacy policy: https://xronocode.github.io/mark/privacy

Open source (MIT): https://github.com/xronocode/mark
```

- **What's New (v2.1.x)**: first App Store release; see changelog
  https://xronocode.github.io/mark/changelog

## Privacy answers (Nutrition Label)

- Data collection: **NONE** (no data types declared — no identifiers,
  no usage data, no location). Grounded in site/privacy.md.
- Uses encryption? Yes → **ITSAppUsesNonExemptEncryption=false**
  (HTTPS-only via system frameworks; exempt from French declaration too).

## App Review notes (Reviewer Notes field)

```
Mark is a local Markdown editor. All features work offline. The optional
"live viewer" (Settings) listens on 127.0.0.1 only and is off by default.
There is no account system and no server. Documents open via the standard
open panel; sandbox entitlements: user-selected read-write only.
```

## Remaining human steps

1. [x] App ID registered: com.xronocode.mark (explicit, no capabilities)
2. [x] ASC app record created, name accepted
3. [x] Trader status — user (2026-09-28)
4. [x] Apple Distribution certificate — user (valid to 2027-09-27)
4b. [x] 3rd Party Mac Developer Installer certificate — user
5. [x] Build 2.1.15 uploaded (Delivery 7310d278), state=VALID,
        export-compliance answered false via API
6. [x] Internal group "Mark Test" + Account Holder tester (user)
7. [x] Listing filled via API: subtitle/privacy URL (appInfo);
        description 1123 chars / keywords / support / marketing
        (version localization); version 2.1.15 renamed; build linked;
        8 APP_DESKTOP screenshots uploaded; whatsNew N/A on first release
8. [ ] App Privacy label — user, UI only: App Privacy → Get Started →
        "Data Not Collected" (API path not exposed)
9. [ ] Submit for review (API submissions endpoint or UI Add for Review)
