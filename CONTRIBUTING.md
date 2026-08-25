# Contributing

GravityBridge is intentionally narrow: one Antigravity login, one verified
Gemini subagent route, and reversible Codex configuration. Changes should stay
within that boundary unless a product decision expands it.

## Local setup

```bash
npx --yes bun@1.4.0 install --frozen-lockfile
cd gui
../node_modules/.bin/bun install --frozen-lockfile
cd ..
```

Run the validation commands documented in `AGENTS.md`. Pull requests should
describe the user-visible effect, list exact verification commands, and include
a screenshot for dashboard changes. Never include OAuth tokens, API keys,
account identifiers, request bodies, or private filesystem paths.

Security-sensitive changes to OAuth, credentials, management endpoints, Codex
configuration, packaging, or GitHub Actions need an explicit security review.
