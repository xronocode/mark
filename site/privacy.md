---
title: Privacy Policy
---

# Privacy Policy

Mark is a local-first application. This page describes, completely and
honestly, every kind of network activity the app can perform. The app has
no analytics, no telemetry, no advertising, and no account system. The
website's visit statistics are covered separately under "This website".

## What stays on your machine

- **Your documents.** Files are read from and written to disk only where
  you open or save them. Nothing you write is ever sent anywhere.
- **Settings, themes, recent files.** Stored locally in the app's own
  configuration directory.
- **Spell-check.** Uses locally installed dictionaries; no language data
  is downloaded or transmitted.

## What touches the network

1. **Update checks.** Mark checks for new versions by fetching
   `https://github.com/xronocode/mark/releases/latest/download/latest.json`.
   The request goes to GitHub. Update downloads are cryptographically
   verified before being applied. You can keep using Mark offline
   indefinitely — the check simply fails silently.
2. **Live viewer (opt-in, localhost only).** If you explicitly enable the
   live-viewer integration, Mark listens on `127.0.0.1` (your own machine
   only, never the network) so external local tools can stream document
   updates. It is off by default.

That is the complete list.

## What we collect

Nothing. The project has no servers that receive data from the app. The
developers have no access to your documents, settings, or usage patterns,
because none of that ever leaves your computer.

## This website

The app and the website are separate. This website (mark.xronocode.com)
uses Google Analytics 4 to count visits: pages viewed, referrer, rough
location, device and browser type. Google Analytics sets first-party
cookies to tell returning visitors apart, and Google processes that data
under its own [privacy policy](https://policies.google.com/privacy). It also
uses Cloudflare Web Analytics, which counts page views without cookies or
any identifier stored in your browser
([Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/)).
We use both only to see which pages people read and where they come from. Blocking
the script or its cookies in your browser has no effect on the site or the
app.

## Homebrew / GitHub downloads

If you install via Homebrew or download releases from GitHub, those
services see the requests any download makes (your IP, GitHub account if
logged in). Their own privacy policies apply to that infrastructure.

## Contact

Questions about this policy: open an issue at
[github.com/xronocode/mark](https://github.com/xronocode/mark).
