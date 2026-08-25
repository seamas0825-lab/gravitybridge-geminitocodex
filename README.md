# GravityBridge

GravityBridge adds one verified Google Antigravity model to Codex as a subagent:

- model: `google-antigravity/gemini-3.7-flash`
- reasoning effort: `high`
- main Codex account and main model: unchanged
- interface: a local CLI and browser dashboard, like OpenCodex

It is intentionally narrow. There is no generic API-key importer, no desktop app, and no support for providers other than Google Antigravity.

## Install

Requirements: macOS, Node.js 18 or newer, and Codex already signed in to the account you want to keep.

```bash
npm install -g github:seamas0825-lab/gravitybridge
gravitybridge
```

The command starts a loopback-only proxy and opens `http://localhost:10100`. In the dashboard:

1. Read and accept the Google OAuth compatibility notice.
2. Sign in to the Google account you use with Antigravity.
3. Select **Verify and configure**.

GravityBridge first checks that the exact model exists for the account, then sends a real non-streaming Responses request carrying Codex's subagent marker and `reasoning.effort=high`. It writes Codex settings only after the response resolves to the expected provider, model, and effort.

## Commands

```text
gravitybridge                    Start and open the local dashboard
gravitybridge start [--port N]   Start on a chosen port
gravitybridge gui                Open the dashboard
gravitybridge status             Show proxy and Codex integration status
gravitybridge doctor             Diagnose the local setup
gravitybridge stop               Stop and restore native Codex routing
gravitybridge restore            Remove GravityBridge defaults and restore Codex
gravitybridge restore --delete-google-login
                                 Also delete the stored Antigravity login
```

## Safety and reversibility

- GravityBridge uses its own state directory at `~/.gravitybridge`; it does not reuse `~/.opencodex`.
- First launch is read-only with respect to Codex. Codex integration stays off until live verification passes.
- Codex authentication is not copied, replaced, or logged out.
- OAuth credentials are kept in GravityBridge's local credential file with restrictive filesystem permissions; they are never written into Codex configuration.
- Only the Codex client integration is enabled. Grok and Claude integrations are explicitly disabled in product mode.
- The original managed values are captured once and restored field-for-field. Native Codex files use OpenCodex's journaled restore path.
- The listener defaults to `127.0.0.1`. Do not expose it to a network interface.

Google may change Antigravity access, model names, OAuth behavior, quotas, or account eligibility. Using a third-party local proxy may be restricted by provider terms. Review the relevant terms and use an account whose risk you accept. GravityBridge is not affiliated with or endorsed by Google or OpenAI.

## Troubleshooting

- `MODEL_NOT_AVAILABLE`: the signed-in Google account did not advertise `gemini-3.7-flash`.
- `AUTH_REQUIRED`: sign in again from the dashboard.
- `RATE_LIMITED`: wait for quota recovery, then run the self-test again.
- `UPSTREAM_BUSY`: retry later; the route was not saved as healthy.
- `ROUTE_MISMATCH` or `EFFORT_MISMATCH`: configuration is not applied because the live request did not prove the requested route.
- A running OpenCodex instance may already own port `10100`. Stop it or start GravityBridge with another port.
- After successful configuration, start a new Codex task so the refreshed subagent roster is loaded.

## Development

```bash
npx --yes bun@1.4.0 install --frozen-lockfile
cd gui && ../node_modules/.bin/bun install --frozen-lockfile && cd ..
npx --yes bun@1.4.0 test tests/gravitybridge-core.test.ts
npx --yes bun@1.4.0 x tsc --noEmit
npx --yes bun@1.4.0 run build:gui
```

GravityBridge is derived from [OpenCodex](https://github.com/lidge-jun/opencodex) under the MIT License. See [NOTICE](NOTICE) for attribution.
