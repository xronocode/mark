// electron-builder afterPack hook: ad-hoc-sign macOS bundles.
//
// We ship Mark without an Apple Developer ID, so electron-builder's
// real signing path (`mac.identity` set to a cert name) cannot run.
// Instead `mac.identity` is null and this hook runs after each Mac
// platform pack to apply an ad-hoc signature (`codesign --sign -`).
//
// Ad-hoc-signed binaries still require quarantine to be cleared on
// first launch (the Homebrew cask handles this via `xattr -cr` in
// postflight), but Gatekeeper accepts them more reliably than fully
// unsigned binaries on Apple Silicon.

const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function adHocSign (context) {
  const platform = context.electronPlatformName
  if (platform !== 'darwin' && platform !== 'mas') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  console.log(`[ad-hoc-sign] signing ${appPath}`)
  execFileSync(
    '/usr/bin/codesign',
    ['--force', '--deep', '--sign', '-', appPath],
    { stdio: 'inherit' }
  )
  console.log('[ad-hoc-sign] done')
}
