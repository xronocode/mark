cask "mark" do
  version "1.0.0"

  on_arm do
    sha256 "f80a072cb81a5ae258d047425f170167151c1e8d86ede64ac8f67baf8c687bd2"

    url "https://github.com/xronocode/mark/releases/download/v#{version}/mark-mac-arm64-#{version}.dmg",
        verified: "github.com/xronocode/mark/"
  end

  on_intel do
    # Intel macOS support is deferred to v1.0.1 — the v1.0.0 CI run produced
    # an x64 DMG with arm64 native modules (cross-built on Apple Silicon
    # runner; macos-13 runner queue never freed during the release window).
    # See https://github.com/xronocode/mark/issues for status.
    odie "Mark v#{version} ships Apple Silicon only. Intel builds coming in v1.0.1."
  end

  name "Mark"
  desc "Lightweight Markdown editor — modernized fork of MarkText with Russian support"
  homepage "https://github.com/xronocode/mark"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates false
  depends_on macos: ">= :big_sur"

  app "Mark.app"

  # Mark releases are ad-hoc signed (codesign --sign -) but not Apple-notarized.
  # Strip the quarantine attribute on first install so Gatekeeper accepts the
  # ad-hoc signature without prompting.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Mark.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/mark",
    "~/Library/Preferences/com.xronocode.mark.plist",
    "~/Library/Saved Application State/com.xronocode.mark.savedState",
    "~/Library/Logs/Mark",
  ]
end
