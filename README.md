# GravityBridge

[![CI](https://github.com/seamas0825-lab/gravitybridge-geminitocodex/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/seamas0825-lab/gravitybridge-geminitocodex/actions/workflows/ci.yml?query=branch%3Amain+event%3Apush)

GravityBridge is a focused, local macOS product that adds one verified Google Antigravity model to Codex as a subagent:

- default subagent: `google-antigravity/gemini-3.7-flash`
- reasoning effort: `high`
- Codex account and main model: unchanged
- native Codex and Cockpit clients: discovered and configured independently
- setup: a beginner-friendly local dashboard with a real route test

GravityBridge runs as a self-contained local service with its own command, state directory, port, process identity, health checks, Codex artifacts, recovery journal, and managed instruction block.

## Install

Requirements: macOS, Node.js 18 or newer, and at least one Codex or Cockpit client that has been opened once.

```bash
npm install -g https://github.com/seamas0825-lab/gravitybridge-geminitocodex/archive/refs/heads/main.tar.gz
gravitybridge
```

GravityBridge opens a loopback-only dashboard at `http://127.0.0.1:10101` by default.

1. Read and accept the Google OAuth compatibility notice.
2. Sign in to a Google account that already has Antigravity access.
3. Review the detected native Codex and Cockpit clients.
4. Leave automatic discovery and the recommended app-server restart enabled.
5. Select **Configure and run real test**.
6. After setup succeeds, create a **new Codex task**.

Before writing Codex settings, GravityBridge confirms that the account advertises the exact model and sends a real non-streaming Responses request with Codex's subagent marker and `reasoning.effort=high`. If the provider, model, or effort does not match, configuration is not committed.

## Why a new Codex task is required

Do not reuse a task created before GravityBridge was configured. Older tasks can retain native V2 encrypted task metadata and cannot be converted in place to the routed provider. GravityBridge deliberately configures multi-agent V1 and installs a scoped global instruction telling agents to:

- omit explicit `model` and `reasoning_effort` arguments when spawning the configured default subagent, avoiding ChatGPT account preflight rejection;
- use `fork_turns: "none"` by default, avoiding immediate compaction caused by inheriting a large parent transcript;
- inherit history only when the subtask genuinely needs it.

These rules live in a marker-owned block in each selected `$CODEX_HOME/AGENTS.md`. Existing user instructions are preserved, and Restore removes only the GravityBridge block.

## Native Codex and Cockpit clients

The dashboard automatically discovers:

- `$CODEX_HOME`, when explicitly set;
- the default `~/.codex` home;
- every `~/.antigravity_cockpit/instances/codex/*` instance containing `config.toml`;
- saved and explicitly supplied homes from `GRAVITYBRIDGE_CODEX_HOMES`.

All detected clients are shown before setup. Unchecked homes remain excluded. With automatic discovery enabled, compatible Cockpit clients created later are configured by the local guardian; conflicting clients are reported and never overwritten.

For a custom launcher, pass one home with `GRAVITYBRIDGE_CODEX_HOME` or multiple homes with `GRAVITYBRIDGE_CODEX_HOMES` (comma, newline, or platform path-list separated).

## Local architecture

GravityBridge owns a small, explicit set of local resources:

| Resource | Default |
|---|---|
| Command | `gravitybridge` |
| State directory | `~/.gravitybridge` |
| Dashboard and proxy | `http://127.0.0.1:10101` |
| Health identity | `gravitybridge` |
| PID file | `gravitybridge.pid` |
| Codex profile | `gravitybridge.config.toml` |
| Codex catalog | `gravitybridge-catalog.json` |
| Restore journal | `gravitybridge-journal.json` |

Set `GRAVITYBRIDGE_HOME` to override the state directory. GravityBridge verifies the service identity before reusing a live process. If another integration already owns a selected Codex route, setup stops with `ROUTING_CONFLICT` before modifying that client.

See [Product isolation and multi-client design](docs/gravitybridge-isolation.md) for the complete ownership and recovery model.

## Self-healing and restore

Codex or a multi-client launcher may rewrite `config.toml` while running. After successful setup, GravityBridge checks selected homes every few seconds and repairs only missing GravityBridge-owned routing, catalog defaults, and agent rules. It never repairs across a foreign routing conflict.

New compatible Cockpit homes are included when automatic discovery is enabled. `gravitybridge stop` and `gravitybridge restore` restore all selected homes. Restore uses per-home journals and removes only marker-owned values, so unrelated user settings survive. If setup fails partway through, already-written homes and product defaults are rolled back automatically.

## Commands

```text
gravitybridge                    Start and open the local dashboard
gravitybridge start [--port N]   Start on a chosen loopback port
gravitybridge gui                Open the dashboard
gravitybridge status [--json]    Show proxy and every Codex target
gravitybridge doctor             Diagnose the local setup
gravitybridge stop               Stop and restore selected Codex homes
gravitybridge restore            Restore native Codex settings
gravitybridge restore --delete-google-login
                                 Also delete the stored Antigravity login
```

## Troubleshooting

- `ROUTING_CONFLICT`: another proxy or integration owns that client's route. Restore or stop the conflicting integration, refresh the dashboard, and retry.
- `MODEL_NOT_AVAILABLE`: the signed-in Google account does not advertise `gemini-3.7-flash`.
- `AUTH_REQUIRED`: sign in again from the dashboard.
- `RATE_LIMITED`: wait for quota recovery, then rerun the self-test.
- `UPSTREAM_BUSY`: retry later; the route is not saved as healthy.
- `ROUTE_MISMATCH` / `EFFORT_MISMATCH`: the real request did not prove the requested route, so setup was not committed.
- “model is not supported with a ChatGPT account”: an agent explicitly passed the Gemini slug. Create a new task so the installed rules load, and let the configured defaults select the subagent.
- Immediate context compaction: create a new task and use the installed default `fork_turns: "none"` behavior.
- Old tasks still fail after setup: they cannot be converted in place; create a new task.

Run `gravitybridge status` for paths and exact target states. The dashboard's **Restart Codex app-server** option is recommended because a long-lived app-server can retain its old in-memory catalog.

## Security and privacy

- First launch is read-only with respect to Codex; writes occur only after a successful real route test.
- OAuth credentials stay in GravityBridge's protected local credential store and are never copied into Codex configuration.
- The listener binds to loopback. Do not expose it on a network interface.
- GravityBridge has no telemetry and does not replace or log out the main Codex account.
- The management API exposes only the operations required by GravityBridge's guided setup and restore flow.

Google may change Antigravity access, model names, OAuth behavior, quotas, or account eligibility. Using a third-party local proxy may be restricted by provider terms. GravityBridge does not bypass access controls and is not affiliated with or endorsed by Google or OpenAI.

## Development

```bash
npx --yes bun@1.4.0 install --frozen-lockfile
cd gui && npx --yes bun@1.4.0 install --frozen-lockfile && cd ..
npx --yes bun@1.4.0 run typecheck
npx --yes bun@1.4.0 run test
npx --yes bun@1.4.0 run privacy:scan
cd gui && npx --yes bun@1.4.0 run lint && npx --yes bun@1.4.0 test tests && npx --yes bun@1.4.0 run build:gravitybridge
```
