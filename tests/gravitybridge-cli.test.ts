import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runStatus(...args: string[]) {
  const root = mkdtempSync(join(tmpdir(), "gravitybridge-cli-"));
  roots.push(root);
  const state = join(root, "state");
  const codex = join(root, "codex");
  mkdirSync(state, { recursive: true });
  mkdirSync(codex, { recursive: true });
  return Bun.spawnSync(["node", "bin/gravitybridge.mjs", "status", ...args], {
    cwd: join(import.meta.dir, ".."),
    env: {
      ...process.env,
      OPENCODEX_HOME: state,
      CODEX_HOME: codex,
      GRAVITYBRIDGE_NO_BROWSER: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("GravityBridge CLI product surface", () => {
  test("status JSON exposes only the focused Antigravity contract", () => {
    const result = runStatus("--json");
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout.toString()) as {
      product?: string;
      googleAntigravity?: { loggedIn?: boolean };
      subagent?: { model?: string; effort?: string };
      codex?: { mainAccountPreserved?: boolean; mainModelPreserved?: boolean };
    };
    expect(body.product).toBe("gravitybridge");
    expect(body.googleAntigravity?.loggedIn).toBe(false);
    expect(body.subagent).toEqual({
      configured: false,
      model: "google-antigravity/gemini-3.7-flash",
      effort: "high",
    });
    expect(body.codex).toEqual({
      mainAccountPreserved: true,
      mainModelPreserved: true,
    });
  });

  test("human status does not leak the upstream multi-provider CLI", () => {
    const result = runStatus();
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    expect(output).toContain("Default Subagent: google-antigravity/gemini-3.7-flash");
    expect(output).not.toContain("OAuth logins:");
    expect(output).not.toContain("ocx start");
    expect(output).not.toContain("Claude");
  });
});
