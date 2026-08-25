# GravityBridge contributor guidance

GravityBridge is a focused macOS CLI and local web dashboard that connects an
eligible Google Antigravity account to Codex subagents. It preserves the user's
Codex login and main model, verifies the live route before applying settings,
and can restore the exact prior managed values.

The runtime is Bun-native TypeScript. The dashboard is React + Vite and its
generated output lives in `gui/dist`.

## Product boundaries

- Product mode supports only `google-antigravity/gemini-3.7-flash`.
- The default subagent effort is `high`; the main Codex model is untouched.
- Do not add generic API-key import, other providers, telemetry, or a desktop
  shell without an explicit product decision.
- First launch must not mutate Codex. Apply settings only after model discovery
  and a real Responses subagent request both succeed.
- OAuth credentials stay in GravityBridge's protected local store and must
  never be copied into Codex configuration, logs, diagnostics, or tests.
- Every managed change must remain reversible through `gravitybridge restore`.

## Editing rules

- Read the nearest nested `AGENTS.md` before changing `src/`, `gui/`,
  `scripts/`, or `.github/`.
- Use Bun and Web APIs in runtime code and preserve strict ESM TypeScript.
- Authentication, credential, management API, packaging, and CI changes require
  a focused security review for secret exposure, unsafe destinations, and
  unintended writes.
- Generated `gui/dist` assets are produced by the product build and are never
  edited by hand.

## Required validation

```bash
bun run typecheck
bun run test
bun run privacy:scan
cd gui
bun run lint:i18n
bun run lint
bun test tests
bun run build:gravitybridge
```

Before publishing, install the `npm pack` tarball into an isolated prefix and
verify `gravitybridge --version`, `gravitybridge --help`, loopback startup,
the status API, and clean shutdown.
