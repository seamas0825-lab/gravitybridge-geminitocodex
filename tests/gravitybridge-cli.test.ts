import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
      OPENCODEX_HOME: join(root, "must-not-be-used"),
      GRAVITYBRIDGE_HOME: state,
      GRAVITYBRIDGE_CODEX_HOME: codex,
      CODEX_HOME: codex,
      GRAVITYBRIDGE_NO_BROWSER: "1",
      GRAVITYBRIDGE_BUN_PATH: process.execPath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("GravityBridge CLI product surface", () => {
  test("uses product-specific runtime and ownership identities", () => {
    const result = Bun.spawnSync([
      process.execPath,
      "-e",
      [
        'import { runtimeDefaultPort, runtimeServiceId } from "./src/gravitybridge/runtime.ts";',
        'import { CONFIG_OWNER_FILE, CONFIG_UNINSTALL_MANIFEST } from "./src/lib/config-ownership.ts";',
        "console.log(JSON.stringify({ port: runtimeDefaultPort(), service: runtimeServiceId(), owner: CONFIG_OWNER_FILE, uninstall: CONFIG_UNINSTALL_MANIFEST }));",
      ].join(" "),
    ], {
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, GRAVITYBRIDGE_MODE: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual({
      port: 10101,
      service: "gravitybridge",
      owner: ".gravitybridge-owner.json",
      uninstall: ".gravitybridge-uninstall.json",
    });
  });

  test("bundles macOS Bun binaries without the lifecycle installer wrapper", () => {
    const packageJson = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      engines?: Record<string, string>;
    };
    expect(packageJson.dependencies?.bun).toBeUndefined();
    expect(packageJson.engines?.bun).toBe("1.4.0");
    expect(packageJson.optionalDependencies).toMatchObject({
      "@oven/bun-darwin-aarch64": "1.4.0",
      "@oven/bun-darwin-x64": "1.4.0",
    });
  });

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
      targets: expect.any(Array),
    });
    expect((body.codex as { targets?: Array<{ home?: string }> })?.targets?.[0]?.home).toContain("/codex");
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
