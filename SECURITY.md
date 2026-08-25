# Security Policy

The `main` branch and latest tagged release receive security fixes on a
best-effort basis.

Do not post undisclosed vulnerabilities, OAuth credentials, account details, or
live tokens in public issues. Use GitHub private vulnerability reporting:

<https://github.com/seamas0825-lab/gravitybridge/security/advisories/new>

Include the affected version, macOS and Codex versions, minimal reproduction,
impact, and redacted diagnostics. Remove personal paths, request contents,
cookies, tokens, and account identifiers from logs and screenshots.

GravityBridge binds to loopback by default and must not be exposed to a network
interface. Google sign-in must be completed by the user, and the account must
already be eligible for Antigravity.
