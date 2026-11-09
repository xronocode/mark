# Paired text-insert client support disposition

2026-11-09. The delegated stabilization decision preserves Mark's v1 request body `{text, source}` and requires a bearer belonging to an enabled extension advertising `text.insert`. No unauthenticated compatibility path is supported by the hardened candidate.

Inspected TokMo repository references, without changing its working tree:

- `origin/main` at `616109321608a5a3e3f765bced83615599cd8278`.
- Stable tag `v0.14.2` at `84e5ab1dffe3ea2b0468613eb72b91c8e88b1b3e`.

At both references, `src-tauri/src/ipc_sink.rs` constructs the `/ext/text-insert` request as a `{cap, payload}` envelope. Its transport constructor accepts an optional token. A repository-wide source search finds `IpcSink::new` only in that module's unit tests; the other IpcSink references are its declaration/implementation or explanatory comments. The current integration therefore does not establish a production-wired text-insert caller in either inspected revision. The plan's earlier `af97d7f2` observation has been refreshed against these exact references.

Disposition: no supported production text-insert caller is identified by these inspected sources. The unconnected IpcSink envelope is not treated as a supported Mark v1 client or as interoperability evidence. This candidate's supported contract is the authenticated Mark v1 body, proved separately by the paired Mark handler/event harness. A future TokMo IpcSink integration must align its actual body and bearer delivery and record its compatible version before claiming support. Existing context/apply and stream-session consumers retain their declared protocol shapes; no change to TokMo or pairing UX is included here.

This is a source-bounded support decision, not a claim about every installed or independently built client. No deployed client was probed and no live-client success is asserted.
