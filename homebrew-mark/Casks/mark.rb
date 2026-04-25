cask "mark" do
  arch arm: "arm64", intel: "x64"

  version "1.0.0"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/xronocode/mark/releases/download/v#{version}/mark-mac-#{arch}-#{version}.dmg",
      verified: "github.com/xronocode/mark/"
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
