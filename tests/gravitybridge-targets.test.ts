import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GRAVITYBRIDGE_RULES_END,
  GRAVITYBRIDGE_RULES_START,
  discoverGravityBridgeCodexHomes,
  inspectGravityBridgeCodexTarget,
  installGravityBridgeAgentRules,
  removeGravityBridgeAgentRules,
  selectedGravityBridgeHomes,
} from "../src/gravitybridge/codex-targets";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function testRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "gravitybridge-targets-"));
  roots.push(root);
  return root;
}

function codexHome(root: string, relative: string): string {
  const home = join(root, relative);
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "config.toml"), "model = \"gpt-5.6\"\n");
  return realpathSync.native(home);
}

describe("GravityBridge Codex target management", () => {
  test("discovers native and every Cockpit client without duplicate homes", () => {
    const root = testRoot();
    const native = codexHome(root, ".codex");
    const cockpitA = codexHome(root, ".antigravity_cockpit/instances/codex/a");
    const cockpitB = codexHome(root, ".antigravity_cockpit/instances/codex/b");

    const targets = discoverGravityBridgeCodexHomes({
      homeDir: root,
      env: { CODEX_HOME: native },
    });

    expect(targets.map(target => target.home)).toEqual([native, cockpitA, cockpitB]);
    expect(targets.map(target => target.source)).toEqual(["explicit", "cockpit", "cockpit"]);
    expect(targets.every(target => target.selected)).toBe(true);
  });

  test("auto-discovers later clients while respecting explicit exclusions", () => {
    const root = testRoot();
    const native = codexHome(root, ".codex");
    const cockpit = codexHome(root, ".antigravity_cockpit/instances/codex/later");
    const selected = selectedGravityBridgeHomes({
      gravityBridge: {
        schema: 1,
        codexHomes: [native],
        autoDiscoverCodexHomes: true,
        excludedCodexHomes: [native],
        baseline: {} as never,
      },
    }, undefined, { homeDir: root, env: {} });
    expect(selected).toEqual([cockpit]);
  });

  test("installs versioned rules without replacing user instructions and removes only its block", () => {
    const root = testRoot();
    const home = codexHome(root, "codex");
    const agentsPath = join(home, "AGENTS.md");
    writeFileSync(agentsPath, "# My rules\n\nKeep this line.\n");

    expect(installGravityBridgeAgentRules(home).changed).toBe(true);
    const installed = readFileSync(agentsPath, "utf8");
    expect(installed).toContain("# My rules");
    expect(installed).toContain(GRAVITYBRIDGE_RULES_START);
    expect(installed).toContain('fork_turns` to `"none"`');
    expect(installed).toContain(GRAVITYBRIDGE_RULES_END);
    expect(installGravityBridgeAgentRules(home).changed).toBe(false);

    expect(removeGravityBridgeAgentRules(home).changed).toBe(true);
    expect(readFileSync(agentsPath, "utf8")).toBe("# My rules\n\nKeep this line.\n");
  });

  test("recognizes a complete GravityBridge route and rejects an OpenCodex-owned route", () => {
    const root = testRoot();
    const home = codexHome(root, "codex");
    const catalog = join(home, "gravitybridge-catalog.json");
    writeFileSync(catalog, "{}\n");
    writeFileSync(join(home, "config.toml"), [
      "# Auto-injected by GravityBridge",
      'openai_base_url = "http://127.0.0.1:10101/v1"',
      `model_catalog_json = ${JSON.stringify(catalog)}`,
      "[agents]",
      'default_subagent_model = "google-antigravity/gemini-3.7-flash"',
      'default_subagent_reasoning_effort = "high"',
      "",
    ].join("\n"));
    installGravityBridgeAgentRules(home);

    expect(inspectGravityBridgeCodexTarget(home, 10101)).toMatchObject({
      configured: true,
      conflict: null,
      reasons: [],
    });

    writeFileSync(join(home, "config.toml"), [
      "# Auto-injected by opencodex",
      'openai_base_url = "http://127.0.0.1:10100/v1"',
      "",
    ].join("\n"));
    expect(inspectGravityBridgeCodexTarget(home, 10101)).toMatchObject({
      configured: false,
      conflict: { code: "ROUTING_CONFLICT", owner: "opencodex" },
    });

    writeFileSync(join(home, "config.toml"), 'model_provider = "company-gateway"\n');
    expect(inspectGravityBridgeCodexTarget(home, 10101)).toMatchObject({
      configured: false,
      conflict: {
        code: "ROUTING_CONFLICT",
        owner: "custom",
        value: "model_provider=company-gateway",
      },
    });
  });
});
