import { getLoginStatus, startLoginFlow } from "../../oauth";
import { removeCredential } from "../../oauth/store";
import {
  getConfigDir,
  readConfigDiagnostics,
  reconcileLiveConfigFromDisk,
  saveConfigPreservingClaudeCode,
} from "../../config";
import { reconcileLiveStateStores } from "../../lib/state-store-registrations";
import { isMultiAgentV2Enabled } from "../../codex/features";
import { getCodexHome } from "../../codex/paths";
import {
  collectCodexAppServerCatalogState,
  listCodexAppServerProcesses,
  restartCodexAppServers,
} from "../../codex/app-server-processes";
import { jsonResponse } from "../auth-cors";
import { handleResponses } from "../responses";
import type { RequestLogContext } from "../request-log";
import type { ManagementContext } from "./context";
import { readManagementJsonBodyOr } from "./body";
import { fetchAllModels } from "./shared";
import {
  GRAVITYBRIDGE_EFFORT,
  GRAVITYBRIDGE_MODEL,
  GRAVITYBRIDGE_MODEL_SLUG,
  GRAVITYBRIDGE_PROVIDER,
  acceptGravityBridgeOAuthRisk,
  applyGravityBridgeDefaults,
  classifyGravityBridgeFailure,
  ensureGravityBridgeBaseline,
  extractGravityBridgeResponseText,
  gravityBridgeConfigurationMatches,
  gravityBridgeTargetAvailable,
  restoreGravityBridgeDefaults,
} from "../../gravitybridge/core";
import {
  GRAVITYBRIDGE_RULES_VERSION,
  discoverGravityBridgeCodexHomes,
  inspectGravityBridgeCodexTarget,
  runGravityBridgeTargetWorker,
  selectedGravityBridgeHomes,
} from "../../gravitybridge/codex-targets";

function persist(ctx: ManagementContext): void {
  const save = ctx.deps.saveConfigPreservingClaudeCode ?? saveConfigPreservingClaudeCode;
  save(ctx.config);
}

function restoreConfigSnapshot(
  target: ManagementContext["config"],
  snapshot: ManagementContext["config"],
): void {
  const mutable = target as unknown as Record<string, unknown>;
  for (const key of Object.keys(mutable)) delete mutable[key];
  Object.assign(mutable, snapshot);
}

async function runSelfTest(config: ManagementContext["config"]): Promise<{
  ok: true;
  output: string;
  provider: string;
  model: string;
  effort: string;
  latencyMs: number;
} | {
  ok: false;
  code: ReturnType<typeof classifyGravityBridgeFailure> | "ROUTE_MISMATCH" | "EFFORT_MISMATCH";
  error: string;
  status: number;
  latencyMs: number;
}> {
  const started = Date.now();
  const logCtx: RequestLogContext = {
    model: "unknown",
    provider: "unknown",
    inboundProtocol: "responses",
  };
  const request = new Request("http://127.0.0.1/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-openai-subagent": "collab_spawn",
      "x-gravitybridge-self-test": "1",
    },
    body: JSON.stringify({
      model: GRAVITYBRIDGE_MODEL_SLUG,
      input: "Reply with exactly GRAVITYBRIDGE_OK.",
      reasoning: { effort: GRAVITYBRIDGE_EFFORT },
      stream: false,
      store: false,
    }),
  });

  let response: Response;
  try {
    response = await handleResponses(request, config, logCtx, { abortSignal: AbortSignal.timeout(60_000) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: classifyGravityBridgeFailure(502, message),
      error: message,
      status: 502,
      latencyMs: Date.now() - started,
    };
  }

  const raw = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { payload = null; }
  if (!response.ok) {
    return {
      ok: false,
      code: classifyGravityBridgeFailure(response.status, raw),
      error: raw.slice(0, 1_000) || `Self-test returned HTTP ${response.status}`,
      status: response.status,
      latencyMs: Date.now() - started,
    };
  }

  const output = extractGravityBridgeResponseText(payload);
  if (!output) {
    return {
      ok: false,
      code: "SELF_TEST_FAILED",
      error: "The target model returned no text.",
      status: 502,
      latencyMs: Date.now() - started,
    };
  }
  if (logCtx.provider !== GRAVITYBRIDGE_PROVIDER) {
    return {
      ok: false,
      code: "ROUTE_MISMATCH",
      error: `Expected ${GRAVITYBRIDGE_PROVIDER}, resolved ${logCtx.provider}.`,
      status: 502,
      latencyMs: Date.now() - started,
    };
  }
  const effectiveEffort = logCtx.effectiveEffort ?? logCtx.requestedEffort ?? "";
  if (effectiveEffort !== GRAVITYBRIDGE_EFFORT) {
    return {
      ok: false,
      code: "EFFORT_MISMATCH",
      error: `Expected effort ${GRAVITYBRIDGE_EFFORT}, resolved ${effectiveEffort || "unknown"}.`,
      status: 502,
      latencyMs: Date.now() - started,
    };
  }
  return {
    ok: true,
    output: output.slice(0, 240),
    provider: logCtx.provider,
    model: GRAVITYBRIDGE_MODEL_SLUG,
    effort: effectiveEffort,
    latencyMs: Date.now() - started,
  };
}

export async function handleGravityBridgeRoutes(ctx: ManagementContext): Promise<Response | null> {
  const { req, url, config } = ctx;
  if (url.pathname === "/api/gravitybridge/status" && req.method === "GET") {
    const login = getLoginStatus(GRAVITYBRIDGE_PROVIDER);
    const port = Number(url.port) || config.port;
    const autoDiscoverCodexHomes = config.gravityBridge?.autoDiscoverCodexHomes !== false;
    const excludedCodexHomes = new Set(config.gravityBridge?.excludedCodexHomes ?? []);
    const targets = discoverGravityBridgeCodexHomes({
      configuredHomes: config.gravityBridge?.codexHomes,
    }).map(target => ({
      ...target,
      selected: (autoDiscoverCodexHomes && !excludedCodexHomes.has(target.home)) || target.selected,
      inspection: inspectGravityBridgeCodexTarget(target.home, port),
    }));
    const selectedTargets = targets.filter(target => target.selected);
    const appServerState = collectCodexAppServerCatalogState();
    const targetsConfigured = selectedTargets.length > 0
      && selectedTargets.every(target => target.inspection.configured);
    return jsonResponse({
      platform: process.platform,
      platformSupported: process.platform === "darwin",
      codexConfigPresent: targets.some(target => target.configPresent),
      activeCodexHome: getCodexHome(),
      targets,
      loggedIn: login.loggedIn,
      loginDone: login.done,
      loginError: login.error ?? null,
      account: login.email ?? null,
      providerConfigured: config.providers[GRAVITYBRIDGE_PROVIDER] !== undefined,
      configured: gravityBridgeConfigurationMatches(config) && targetsConfigured,
      configuredAt: config.gravityBridge?.configuredAt ?? null,
      riskAccepted: Boolean(config.gravityBridge?.acceptedRiskAt),
      model: GRAVITYBRIDGE_MODEL_SLUG,
      effort: GRAVITYBRIDGE_EFFORT,
      multiAgentMode: config.multiAgentMode ?? "default",
      nativeV2Enabled: isMultiAgentV2Enabled(),
      restartRequired: appServerState.state === "stale",
      appServerState: appServerState.state,
      newTaskRequired: gravityBridgeConfigurationMatches(config),
      autoDiscoverCodexHomes,
    });
  }

  if (url.pathname === "/api/gravitybridge/login" && req.method === "POST") {
    const body = await readManagementJsonBodyOr(req, {}) as { acceptedRisk?: unknown; force?: unknown };
    if (body.acceptedRisk !== true) {
      return jsonResponse({ error: "You must acknowledge the Google Antigravity OAuth compatibility risk before login.", code: "RISK_ACK_REQUIRED" }, 409);
    }
    const persistedBaseline = readConfigDiagnostics().config;
    ensureGravityBridgeBaseline(config);
    acceptGravityBridgeOAuthRisk(config);
    persist(ctx);
    try {
      const { url: authUrl, instructions } = await startLoginFlow(
        GRAVITYBRIDGE_PROVIDER,
        { forceLogin: body.force === true },
        {
          onSettled: () => {
            reconcileLiveConfigFromDisk(config, persistedBaseline);
            reconcileLiveStateStores();
          },
        },
      );
      if (authUrl) {
        const { openUrl } = await import("../../lib/open-url");
        openUrl(authUrl);
      }
      return jsonResponse({ ok: true, url: authUrl, instructions });
    } catch (error) {
      return jsonResponse({
        error: error instanceof Error ? error.message : String(error),
        code: "AUTH_REQUIRED",
      }, 409);
    }
  }

  if (url.pathname === "/api/gravitybridge/apply" && req.method === "POST") {
    if (process.platform !== "darwin") {
      return jsonResponse({ error: "GravityBridge Beta currently supports macOS only.", code: "PLATFORM_UNSUPPORTED" }, 409);
    }
    const login = getLoginStatus(GRAVITYBRIDGE_PROVIDER);
    if (!login.loggedIn) {
      return jsonResponse({ error: login.error ?? "Google Antigravity login is required.", code: "AUTH_REQUIRED" }, 401);
    }
    const models = await (ctx.deps.fetchAllModels ?? fetchAllModels)(config);
    if (!gravityBridgeTargetAvailable(models)) {
      return jsonResponse({
        error: `${GRAVITYBRIDGE_MODEL_SLUG} is not available to this Google account.`,
        code: "MODEL_NOT_AVAILABLE",
      }, 409);
    }

    // Prove the actual route before touching Codex's managed configuration.
    const selfTest = await runSelfTest(config);
    if (!selfTest.ok) return jsonResponse({ ...selfTest, configured: false }, selfTest.status);

    const body = await readManagementJsonBodyOr(req, {}) as {
      codexHomes?: unknown;
      restartCodex?: unknown;
      autoDiscoverCodexHomes?: unknown;
    };
    const requestedHomes = Array.isArray(body.codexHomes)
      ? body.codexHomes.filter((value): value is string => typeof value === "string")
      : undefined;
    const codexHomes = selectedGravityBridgeHomes(config, requestedHomes);
    const discoveredHomes = discoverGravityBridgeCodexHomes({
      configuredHomes: config.gravityBridge?.codexHomes,
    }).map(target => target.home);
    if (codexHomes.length === 0) {
      return jsonResponse({
        error: "No readable Codex installation was selected. Start Codex once, then refresh this page.",
        code: "NO_CODEX_TARGETS",
        configured: false,
      }, 409);
    }
    const conflicts = codexHomes
      .map(home => inspectGravityBridgeCodexTarget(home, Number(url.port) || config.port))
      .filter(inspection => inspection.conflict);
    if (conflicts.length > 0) {
      return jsonResponse({
        error: "OpenCodex or another local proxy already manages one selected Codex client. Restore/stop that integration, then retry. GravityBridge did not overwrite it.",
        code: "ROUTING_CONFLICT",
        configured: false,
        conflicts,
      }, 409);
    }

    const configBeforeApply = structuredClone(config);
    try {
      applyGravityBridgeDefaults(config);
      const state = ensureGravityBridgeBaseline(config);
      state.codexHomes = codexHomes;
      state.autoRepair = true;
      state.autoDiscoverCodexHomes = body.autoDiscoverCodexHomes !== false;
      state.excludedCodexHomes = discoveredHomes.filter(home => !codexHomes.includes(home));
      state.rulesVersion = GRAVITYBRIDGE_RULES_VERSION;
      persist(ctx);
      // First launch keeps coordination artifacts inside ~/.gravitybridge. Once
      // the user-authorized configuration is proven and saved, native Codex
      // coordination resumes in the real CODEX_HOME for convergence and traffic.
      delete process.env.GRAVITYBRIDGE_NATIVE_CLAIM_HOME;
    } catch (error) {
      return jsonResponse({
        error: error instanceof Error ? error.message : String(error),
        code: "CONFIG_WRITE_FAILED",
      }, 502);
    }
    const targetResults = codexHomes.map(home => runGravityBridgeTargetWorker("sync", home, Number(url.port) || config.port));
    const failedTargets = targetResults.filter(result => !result.ok);
    if (failedTargets.length > 0) {
      const routingConflict = failedTargets.find(result => result.code === "ROUTING_CONFLICT");
      for (const home of codexHomes) {
        runGravityBridgeTargetWorker("restore", home, Number(url.port) || config.port);
      }
      restoreConfigSnapshot(config, configBeforeApply);
      persist(ctx);
      return jsonResponse({
        error: routingConflict
          ? "OpenCodex or another local proxy already manages one selected Codex client. Restore/stop that integration, then retry. GravityBridge did not overwrite it."
          : "Gemini was verified, but one or more Codex clients could not be configured.",
        code: routingConflict ? "ROUTING_CONFLICT" : "CONFIG_WRITE_FAILED",
        configured: false,
        selfTest,
        targetResults,
      }, routingConflict ? 409 : 502);
    }
    const restart = body.restartCodex === true
      ? restartCodexAppServers(listCodexAppServerProcesses())
      : null;
    return jsonResponse({
      ok: true,
      configured: gravityBridgeConfigurationMatches(config),
      selfTest,
      targetResults,
      restart,
      restartRequired: body.restartCodex !== true && collectCodexAppServerCatalogState().state === "stale",
      newTaskRequired: true,
    });
  }

  if (url.pathname === "/api/gravitybridge/self-test" && req.method === "POST") {
    const result = await runSelfTest(config);
    return jsonResponse(result, result.ok ? 200 : result.status);
  }

  if (url.pathname === "/api/gravitybridge/restore" && req.method === "POST") {
    const body = await readManagementJsonBodyOr(req, {}) as { deleteCredential?: unknown };
    const codexHomes = selectedGravityBridgeHomes(config);
    const restored = restoreGravityBridgeDefaults(config);
    if (restored.changed) persist(ctx);
    if (body.deleteCredential === true) await removeCredential(GRAVITYBRIDGE_PROVIDER);
    const targetResults = (codexHomes.length > 0 ? codexHomes : [getCodexHome()])
      .map(home => runGravityBridgeTargetWorker("restore", home, Number(url.port) || config.port));
    const nativeRestore = {
      success: targetResults.every(result => result.ok),
      message: targetResults.every(result => result.ok)
        ? "All selected Codex clients were restored."
        : "One or more Codex clients could not be restored.",
    };
    if (process.env.GRAVITYBRIDGE_MODE === "1") {
      process.env.GRAVITYBRIDGE_NATIVE_CLAIM_HOME = getConfigDir();
    }
    return jsonResponse({
      ok: nativeRestore.success,
      changed: restored.changed,
      credentialDeleted: body.deleteCredential === true,
      nativeRestore,
      targetResults,
    }, nativeRestore.success ? 200 : 502);
  }

  return null;
}
