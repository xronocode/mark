# FILE: Casks/mark.rb
# VERSION: 0.0.0-placeholder
# START_MODULE_CONTRACT
#   PURPOSE: Homebrew cask placeholder for Mark editor; filled at Phase-A3.
#   SCOPE: Declares app bundle name, URL template, livecheck hook, postflight xattr strip.
#   DEPENDS: GitHub Release on xronocode/mark (publicized in Phase-A3).
#   LINKS: docs/development-plan.xml Phase-A3 step-4
#   ROLE: CONFIG
#   MAP_MODE: NONE
# END_MODULE_CONTRACT

cask "mark" do
  version "0.0.0"
  sha256 :no_check  # replaced in Phase-A3 release job

  url "https://github.com/xronocode/mark/releases/download/v#{version}/Mark-#{version}.dmg"
  name "Mark"
  desc "Lightweight Markdown editor (fork of MarkText)"
  homepage "https://github.com/xronocode/mark"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Mark.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Mark.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/mark",
    "~/Library/Preferences/com.xronocode.mark.plist",
    "~/Library/Saved Application State/com.xronocode.mark.savedState",
  ]
end
