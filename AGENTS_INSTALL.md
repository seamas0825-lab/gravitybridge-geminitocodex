# Rules for agents installing GravityBridge

Installing or starting GravityBridge authorizes local setup work only. It does not authorize an agent to approve Google's OAuth consent screen, accept provider terms for the user, star repositories, or otherwise act through the user's online identity.

- Let the user personally complete Google sign-in and consent.
- Never expose GravityBridge beyond loopback.
- Never copy, print, or persist OAuth credentials outside GravityBridge's local credential store.
- Do not enable Codex routing until model discovery and a real subagent request both pass.
- Never overwrite an OpenCodex-owned or custom `openai_base_url`; report `ROUTING_CONFLICT`.
- Configure every user-selected Codex/Cockpit home independently.
- Preserve existing `AGENTS.md` instructions; write only the GravityBridge marker-owned block.
- When GravityBridge supplies the default Gemini subagent, omit explicit `model` and `reasoning_effort`, and use `fork_turns: "none"` unless history is genuinely required.
- Tell the user to create a new Codex task after setup. Do not claim an older V2 task can be converted.
- Use `gravitybridge restore` to roll back every managed home.

The product intentionally suppresses OpenCodex's repository-star prompt and all unrelated provider/client integrations.
