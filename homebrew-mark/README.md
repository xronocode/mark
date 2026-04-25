# homebrew-mark

Homebrew tap for [Mark](https://github.com/xronocode/mark) — a modernized
fork of [marktext/marktext](https://github.com/marktext/marktext) tracking
[Tkaixiang/marktext](https://github.com/Tkaixiang/marktext) upstream, with
Russian localization and ad-hoc macOS signing.

## Install

```sh
brew tap xronocode/mark
brew install --cask mark
```

The cask is ad-hoc signed (`codesign --sign -`), not Apple-notarized. The
postflight script clears the `com.apple.quarantine` attribute so Gatekeeper
accepts the ad-hoc signature without prompting.

## Update

```sh
brew upgrade --cask mark
```

`livecheck` watches the GitHub Releases page on `xronocode/mark`, so
`brew upgrade` picks up new tags automatically once the cask sha256 is
refreshed for the new version.

## Releasing a new version (maintainer notes)

After tagging `vX.Y.Z` on `xronocode/mark` and the GitHub Actions release
workflow publishes the DMGs:

1. Compute sha256 for both arch DMGs:
   ```sh
   curl -L -O https://github.com/xronocode/mark/releases/download/vX.Y.Z/mark-mac-arm64-X.Y.Z.dmg
   curl -L -O https://github.com/xronocode/mark/releases/download/vX.Y.Z/mark-mac-x64-X.Y.Z.dmg
   shasum -a 256 mark-mac-arm64-X.Y.Z.dmg mark-mac-x64-X.Y.Z.dmg
   ```
2. Update `Casks/mark.rb`: bump `version` and replace both `sha256` values.
3. `brew style --cask Casks/mark.rb` to lint (must pass inside a real tap
   checkout).
4. Commit and push.
