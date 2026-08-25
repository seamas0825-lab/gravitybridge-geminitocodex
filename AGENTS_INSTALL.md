# Rules for agents installing GravityBridge

Installing or starting GravityBridge authorizes local setup work only. It does
not authorize an agent to approve Google's OAuth consent screen, accept provider
terms for the user, star repositories, or otherwise act through the user's
online identity.

- Let the user personally complete Google sign-in and consent.
- Never expose GravityBridge beyond loopback.
- Never copy, print, or persist OAuth credentials outside GravityBridge's local
  credential store.
- Do not enable Codex routing until the dashboard's model discovery and real
  subagent verification pass.
- Use `gravitybridge restore` to roll back managed settings.

The product intentionally suppresses OpenCodex's repository-star prompt and all
unrelated provider/client integrations.
