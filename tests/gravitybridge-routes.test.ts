import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDefaultConfig } from "../src/config";
import { handleGravityBridgeRoutes } from "../src/server/management/gravitybridge-routes";
import type { ManagementContext } from "../src/server/management/context";
import { nativeMainClaimPath } from "../src/codex/native-main-claim";
import { handleManagementAPI } from "../src/server/management-api";

let testHome = "";
let previousOpenCodexHome: string | undefined;
let previousClaimHome: string | undefined;
let previousProductMode: string | undefined;

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "gravitybridge-routes-"));
  previousOpenCodexHome = process.env.OPENCODEX_HOME;
  previousClaimHome = process.env.GRAVITYBRIDGE_NATIVE_CLAIM_HOME;
  previousProductMode = process.env.GRAVITYBRIDGE_MODE;
  process.env.OPENCODEX_HOME = testHome;
});

afterEach(() => {
  if (previousOpenCodexHome === undefined) delete process.env.OPENCODEX_HOME;
  else process.env.OPENCODEX_HOME = previousOpenCodexHome;
  if (previousClaimHome === undefined) delete process.env.GRAVITYBRIDGE_NATIVE_CLAIM_HOME;
  else process.env.GRAVITYBRIDGE_NATIVE_CLAIM_HOME = previousClaimHome;
  if (previousProductMode === undefined) delete process.env.GRAVITYBRIDGE_MODE;
  else process.env.GRAVITYBRIDGE_MODE = previousProductMode;
  rmSync(testHome, { recursive: true, force: true });
});

function context(path: string, body: unknown): ManagementContext {
  const url = new URL(`http://localhost${path}`);
  return {
    req: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    url,
    config: getDefaultConfig(),
    deps: {},
    convergeCodexCatalog: async () => ({ status: "skipped", reason: "test" }),
  } as ManagementContext;
}

describe("GravityBridge management guardrails", () => {
  test("refuses OAuth before the explicit compatibility acknowledgement", async () => {
    const ctx = context("/api/gravitybridge/login", { acceptedRisk: false });
    const response = await handleGravityBridgeRoutes(ctx);
    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ code: "RISK_ACK_REQUIRED" });
    expect(ctx.config.gravityBridge).toBeUndefined();
  });

  test("refuses configuration when no Antigravity login exists", async () => {
    const ctx = context("/api/gravitybridge/apply", {});
    const response = await handleGravityBridgeRoutes(ctx);
    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({ code: "AUTH_REQUIRED" });
    expect(ctx.config.providers["google-antigravity"]).toBeUndefined();
  });

  test("redirects pre-consent native-main coordination into product state", () => {
    process.env.GRAVITYBRIDGE_MODE = "1";
    process.env.GRAVITYBRIDGE_NATIVE_CLAIM_HOME = testHome;
    expect(nativeMainClaimPath({ codexHome: "/real/codex" } as never)).toBe(
      join(testHome, ".opencodex-native-main.claim.sqlite"),
    );
    delete process.env.GRAVITYBRIDGE_MODE;
  });

  test("blocks every generic management API in product mode", async () => {
    process.env.GRAVITYBRIDGE_MODE = "1";
    const url = new URL("http://localhost/api/providers");
    const response = await handleManagementAPI(
      new Request(url, { headers: { Host: "localhost" } }),
      url,
      getDefaultConfig(),
    );
    expect(response?.status).toBe(404);
    expect(await response?.json()).toMatchObject({ code: "PRODUCT_API_ONLY" });
  });
});
