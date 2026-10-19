# Public source and private operations

The public Mark repository contains application source, reusable release tools,
technical GRACE contracts, tests and publishable product documentation.

Keep account-specific App Store Connect submission state, delivery records,
one-off apply scripts, launch and outreach planning, owner discussion notes,
security audit evidence and captured user profiles in a private companion
repository outside this checkout. Review and sanitize any extract before
deliberately publishing it. The companion must not share this repository's Git
directory or public remote.

Reusable tools in `tools/release/` remain public. Credentials and account state
are supplied locally; generated operational output belongs outside the public
tree. The former C-59 submission bundle and `docs/promotion/` are reserved private
locations and are ignored to prevent accidental reintroduction. The owner backlog
(`docs/backlog.md`) and table-copy discussion previews (`prototypes/table-copy/`)
also belong in the private companion, including versions previously recovered
into public source.

`fixtures/` retains six sanitized legacy preference examples, with
`/Users/<fixture>` as their synthetic home identity. It excludes original profile
archives, browser databases and runtime logs. Its manifest pins the retained
examples. The retired legacy migration pipeline does not consume these examples.
See [the fixture description](../fixtures/README.md).

Ignoring a path only prevents new files from being added accidentally. Tracked
files require an explicit removal commit. An ordinary removal commit changes
the current tree; it does not erase earlier commits, releases, forks or clones.
Any history cleanup is a separate maintainer operation.
