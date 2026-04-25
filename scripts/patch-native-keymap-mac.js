// Patch node_modules/native-keymap/binding.gyp to set explicit C++17
// language standard for the macOS build.
//
// Why: native-keymap's binding.gyp omits xcode_settings, so Xcode falls
// back to its default Objective-C++ language standard. On modern macOS
// runners (macos-14, Xcode 15+) that default is pre-C++11, which makes
// keyboard_mac.mm fail at the first `constexpr` it sees in the bundled
// chromium/macros.h header.
//
// We inject CLANG_CXX_LANGUAGE_STANDARD + OTHER_CPLUSPLUSFLAGS so that
// .mm sources compile with the same standard as the rest of Electron's
// native modules.

const fs = require('fs')
const path = require('path')

const target = path.resolve(__dirname, '..', 'node_modules', 'native-keymap', 'binding.gyp')

if (!fs.existsSync(target)) {
  console.log(`[patch-native-keymap] not found, skipping: ${target}`)
  process.exit(0)
}

let content = fs.readFileSync(target, 'utf8')

if (content.includes('CLANG_CXX_LANGUAGE_STANDARD')) {
  console.log('[patch-native-keymap] already patched, skipping')
  process.exit(0)
}

// Anchor on the macOS conditional's link_settings block so we insert
// xcode_settings as a sibling key, not inside link_settings.
const anchor = `'OS=="mac"', {
          "sources": [
            "src/keyboard_mac.mm"
          ],
          'link_settings' : {
            'libraries' : [
              '-framework Cocoa'
            ]
          }
        }`

const replacement = `'OS=="mac"', {
          "sources": [
            "src/keyboard_mac.mm"
          ],
          'link_settings' : {
            'libraries' : [
              '-framework Cocoa'
            ]
          },
          'xcode_settings': {
            'CLANG_CXX_LANGUAGE_STANDARD': 'gnu++17',
            'CLANG_CXX_LIBRARY': 'libc++',
            'OTHER_CPLUSPLUSFLAGS': ['$(inherited)', '-std=gnu++17']
          }
        }`

if (!content.includes(anchor)) {
  console.error('[patch-native-keymap] anchor not found; binding.gyp shape changed?')
  process.exit(1)
}

content = content.replace(anchor, replacement)
fs.writeFileSync(target, content)
console.log('[patch-native-keymap] injected xcode_settings (C++17) for macOS')
