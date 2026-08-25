import { describe, expect, test } from "bun:test";
import type { CatalogModel } from "../src/codex/catalog";
import { getDefaultConfig } from "../src/config";
import {
  GRAVITYBRIDGE_MODEL_SLUG,
  acceptGravityBridgeOAuthRisk,
  applyGravityBridgeDefaults,
  classifyGravityBridgeFailure,
  ensureGravityBridgeBaseline,
  extractGravityBridgeResponseText,
  gravityBridgeConfigurationMatches,
  gravityBridgeTargetAvailable,
  prepareGravityBridgeStartup,
  restoreGravityBridgeDefaults,
} from "../src/gravitybridge/core";

describe("GravityBridge reversible configuration", () => {
  test("applies the exact Antigravity child defaults without changing the main provider", () => {
    const config = getDefaultConfig();
    config.providers["google-antigravity"] = {
      adapter: "google",
      baseUrl: "https://daily-cloudcode-pa.googleapis.com",
      authMode: "oauth",
    };
    const originalDefaultProvider = config.defaultProvider;
    ensureGravityBridgeBaseline(config);
    acceptGravityBridgeOAuthRisk(config, "2026-08-26T00:00:00.000Z");
    applyGravityBridgeDefaults(config, "2026-08-26T00:01:00.000Z");

    expect(gravityBridgeConfigurationMatches(config)).toBe(true);
    expect(config.defaultProvider).toBe(originalDefaultProvider);
    expect(config.injectionModel).toBe(GRAVITYBRIDGE_MODEL_SLUG);
    expect(config.injectionEffort).toBe("high");
    expect(config.multiAgentMode).toBe("v1");
    expect(config.syncCodexSubagentDefaults).toBe(true);
    expect(config.clientIntegrations).toEqual({
      codex: true,
      grok: false,
      "claude-desktop": false,
    });
  });

  test("keeps first launch read-only until the verified apply", () => {
    const config = getDefaultConfig();
    prepareGravityBridgeStartup(config);
    expect(config.clientIntegrations).toEqual({
      codex: false,
      grok: false,
      "claude-desktop": false,
    });
    expect(config.gravityBridge?.baseline.clientIntegrations).toEqual({ present: false });

    expect(restoreGravityBridgeDefaults(config)).toEqual({ changed: true });
    expect(config.clientIntegrations).toBeUndefined();
  });

  test("restores every pre-existing managed value exactly", () => {
    const config = getDefaultConfig();
    config.providers["google-antigravity"] = {
      adapter: "google",
      baseUrl: "https://daily-cloudcode-pa.googleapis.com",
      authMode: "oauth",
      selectedModels: ["claude-sonnet-4-6"],
    };
    config.subagentModels = ["openai/gpt-test"];
    config.injectionModel = "openai/gpt-test";
    config.injectionEffort = "low";
    config.multiAgentGuidanceEnabled = false;
    config.multiAgentMode = "default";
    const before = structuredClone(config);

    ensureGravityBridgeBaseline(config);
    applyGravityBridgeDefaults(config);
    expect(restoreGravityBridgeDefaults(config)).toEqual({ changed: true });

    expect(config).toEqual(before);
    expect(restoreGravityBridgeDefaults(config)).toEqual({ changed: false });
  });

  test("removes a provider first introduced after the baseline", () => {
    const config = getDefaultConfig();
    ensureGravityBridgeBaseline(config);
    config.providers["google-antigravity"] = {
      adapter: "google",
      baseUrl: "https://daily-cloudcode-pa.googleapis.com",
      authMode: "oauth",
    };
    applyGravityBridgeDefaults(config);
    restoreGravityBridgeDefaults(config);
    expect(config.providers["google-antigravity"]).toBeUndefined();
  });
});

describe("GravityBridge verification helpers", () => {
  test("requires the exact provider and model from live catalog rows", () => {
    const target = { provider: "google-antigravity", id: "gemini-3.7-flash" } as CatalogModel;
    expect(gravityBridgeTargetAvailable([target])).toBe(true);
    expect(gravityBridgeTargetAvailable([{ ...target, id: "gemini-3.1-pro" }])).toBe(false);
    expect(gravityBridgeTargetAvailable([{ ...target, provider: "google" }])).toBe(false);
  });

  test("extracts Responses output text without accepting unrelated fields", () => {
    expect(extractGravityBridgeResponseText({ output_text: "  ok  " })).toBe("ok");
    expect(extractGravityBridgeResponseText({
      output: [{ type: "message", content: [{ type: "output_text", text: "first" }, { text: "second" }] }],
    })).toBe("first\nsecond");
    expect(extractGravityBridgeResponseText({ text: "wrong field" })).toBe("");
  });

  test("does not mislabel authentication or parameter errors as demand", () => {
    expect(classifyGravityBridgeFailure(401, "expired token")).toBe("AUTH_REQUIRED");
    expect(classifyGravityBridgeFailure(403, "project unavailable")).toBe("ACCOUNT_NOT_ELIGIBLE");
    expect(classifyGravityBridgeFailure(400, "unknown field search_content_types")).toBe("PARAM_UNSUPPORTED");
    expect(classifyGravityBridgeFailure(429, "quota")).toBe("RATE_LIMITED");
    expect(classifyGravityBridgeFailure(503, "busy")).toBe("UPSTREAM_BUSY");
  });
});
