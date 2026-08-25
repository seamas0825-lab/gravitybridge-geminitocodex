import { afterEach, describe, expect, test } from "bun:test";
import { jsonRequest } from "../src/gravitybridge-request";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GravityBridge dashboard requests", () => {
  test("returns JSON from a successful response", async () => {
    globalThis.fetch = (async () => Response.json({ configured: true })) as typeof fetch;

    await expect(jsonRequest<{ configured: boolean }>("/status"))
      .resolves.toEqual({ configured: true });
  });

  test("parses a structured error only after checking the response status", async () => {
    globalThis.fetch = (async () => Response.json(
      { code: "AUTH_REQUIRED", error: "Google login required" },
      { status: 401 },
    )) as typeof fetch;

    try {
      await jsonRequest("/apply");
      throw new Error("expected request to fail");
    } catch (error) {
      const typed = error as Error & { payload?: { code?: string } };
      expect(typed.message).toBe("Google login required");
      expect(typed.payload?.code).toBe("AUTH_REQUIRED");
    }
  });

  test("falls back to the HTTP status for a non-JSON error", async () => {
    globalThis.fetch = (async () => new Response("not json", { status: 502 })) as typeof fetch;

    await expect(jsonRequest("/self-test")).rejects.toThrow("HTTP 502");
  });
});
