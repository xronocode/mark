# Privacy

Mark is local-first. Your documents never leave your machine: files are read and written only where you open or save them, settings and themes live in the app's own local configuration directory, and spell-check uses locally installed dictionaries. There is no analytics code, no telemetry, no advertising and no account system.

## The only network activity

1. **Update checks** (download edition only; the App Store edition updates through the store). Mark asks `https://updates.mark.xronocode.com/feed` — our redirect service that counts the check as an anonymous aggregate daily counter and forwards to the release manifest on GitHub; if unreachable, Mark falls back to GitHub directly. Update packages are verified before being applied. Mark works offline indefinitely; a failed check is silent.
2. **Live viewer** (opt-in, off by default). When explicitly enabled, Mark listens on `127.0.0.1` — your machine only, never the network — so local tools can stream document updates.

## What we collect

Nothing from the app except the aggregate daily update counters above: checks and updater downloads per day, per OS and per version. No IP addresses, no device identifiers, no cookies, nothing that can identify you; counters are kept for three months and cannot be correlated across days or users.

## Package managers

Installing through winget, Homebrew or GitHub releases means those services see the standard download requests (such as your IP). The winget package is the same installer as the GitHub release. Website visit statistics are covered separately in the [full privacy policy](https://mark.xronocode.com/privacy).

## Contact

Questions: open an issue at [github.com/xronocode/mark](https://github.com/xronocode/mark).
