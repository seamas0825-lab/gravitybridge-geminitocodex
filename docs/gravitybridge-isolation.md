# Product isolation and multi-client design

## Decision

GravityBridge is an independent product boundary, not a second configuration profile for an installed OpenCodex service. It retains an attributed copy of proven OpenCodex routing internals, but it must never share mutable runtime ownership with OpenCodex.

Extracting a new networking stack would duplicate mature OAuth, Responses translation, catalog, and journal code while increasing compatibility risk. The safer boundary is a narrow product entry point plus independently named state, process, health, and Codex artifacts. Generic OpenCodex APIs and integrations remain unavailable in GravityBridge mode.

## Ownership

GravityBridge owns only:

- `~/.gravitybridge` or an explicit `GRAVITYBRIDGE_HOME`;
- its live `gravitybridge` health identity and default port `10101`;
- `gravitybridge.pid` and the runtime-port record in its state root;
- the exact marker-owned values journaled in each selected Codex home;
- `gravitybridge.config.toml`, `gravitybridge-catalog.json`, and `gravitybridge-journal.json`;
- the block between `gravitybridge:subagent-rules:start` and `gravitybridge:subagent-rules:end` in each selected `AGENTS.md`.

An ambient `OPENCODEX_HOME` is ignored by the public launcher. Internally, the upstream-compatible core receives the GravityBridge state root through a child-only `OPENCODEX_HOME`; this is an implementation adapter, not shared state.

## Multi-client discovery

Discovery canonicalizes real directories, removes aliases/symlink duplicates, and records the source of every target. Native `~/.codex`, explicit `CODEX_HOME`, Cockpit instances, saved homes, and `GRAVITYBRIDGE_CODEX_HOMES` can coexist.

Setup displays all targets and stores both selected and explicitly excluded homes. Automatic discovery includes compatible homes created later without re-including a home the user unchecked. Every write runs in a dedicated child process with that target's `CODEX_HOME`, preventing module-level path caches from redirecting one instance's files into another.

## Conflict policy

Before setup writes product defaults, each selected target is inspected. A route is a conflict when:

- an OpenCodex marker/provider owns it; or
- a non-empty root `openai_base_url` points somewhere other than the active GravityBridge listener.

Conflicts are fail-closed. GravityBridge reports the owner and value, performs no overwrite, and asks the user to restore or stop the other integration. If an unexpected later failure occurs, already-synchronized targets are restored and product defaults are rolled back.

## Drift repair

Some Codex/Cockpit processes reserialize `config.toml`, which can remove comments or recently written root keys. A local guardian re-inspects selected homes after successful setup. It repairs only when no conflict exists and only through the journaled GravityBridge transformation. Failed fingerprints are throttled to prevent noisy retry loops.

New compatible Cockpit homes are included when automatic discovery is enabled. Foreign routes are skipped indefinitely rather than treated as repairable drift.

## Subagent compatibility rules

Codex validates an explicitly supplied non-OpenAI model against the signed-in ChatGPT account before a local base-URL route can handle it. Therefore the installed default-subagent rule tells the orchestrator to omit `model` and `reasoning_effort`; GravityBridge's `[agents]` defaults supply Gemini 3.7 Flash and high effort after routing.

Full-history forks can cause a brand-new child to compact immediately. The managed rule uses `fork_turns: "none"` by default. GravityBridge also pins multi-agent V1 because older tasks can retain native V2 encrypted task metadata that the routed provider cannot read. The correct migration is a newly created task, never an in-place conversion claim.

## Restore

Restore is per target. The journal removes only recorded/marker-owned routing and restores preimages without deleting unrelated user changes. The managed `AGENTS.md` block is removed independently. Stopping GravityBridge performs the same restore unless the process is intentionally recycling.

Legacy GravityBridge installs that temporarily used OpenCodex-named artifacts are adopted only when product state proves a prior successful GravityBridge setup and the target contains matching local-route evidence. An arbitrary OpenCodex installation is never silently migrated.
