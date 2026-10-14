# Security policy

## Supported versions

Security fixes go into the latest release only. Update to the [latest release](https://github.com/xronocode/mark/releases/latest) (or the latest App Store version) before reporting.

| Version | Supported |
|:---|:---:|
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

1. Open [a private security advisory](https://github.com/xronocode/mark/security/advisories/new) for this repository.
2. Describe the problem, the affected version and platform (macOS or Windows, App Store or Homebrew/download build), and the steps to reproduce it. A minimal Markdown file that triggers the problem helps.

You will get a reply in the advisory thread. Once a fix is released, the advisory is published with credit to you unless you prefer otherwise.

## Verifying a release

Each GitHub release lists how to verify its build provenance (`gh attestation verify`) and its cosign signature. The release notes carry the exact commands for that version.
