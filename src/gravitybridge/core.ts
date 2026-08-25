import type { CatalogModel } from "../codex/catalog";
import type { OcxConfig } from "../types";

export const GRAVITYBRIDGE_PROVIDER = "google-antigravity";
export const GRAVITYBRIDGE_MODEL = "gemini-3.7-flash";
export const GRAVITYBRIDGE_MODEL_SLUG = `${GRAVITYBRIDGE_PROVIDER}/${GRAVITYBRIDGE_MODEL}`;
export const GRAVITYBRIDGE_EFFORT = "high";
export const GRAVITYBRIDGE_SCHEMA = 1 as const;

type SavedValue<T> = { present: boolean; value?: T };
type Baseline = NonNullable<OcxConfig["gravityBridge"]>["baseline"];

function capture<T>(record: object, key: PropertyKey, value: T | undefined): SavedValue<T> {
  return Object.hasOwn(record, key) ? { present: true, value } : { present: false };
}

function restore<T extends object, K extends keyof T>(record: T, key: K, saved: SavedValue<T[K]>): void {
  if (saved.present) record[key] = saved.value as T[K];
  else delete record[key];
}

export function captureGravityBridgeBaseline(config: OcxConfig): Baseline {
  const provider = config.providers[GRAVITYBRIDGE_PROVIDER];
  return {
    providerPresent: provider !== undefined,
    providerSelectedModels: capture(provider ?? {}, "selectedModels", provider?.selectedModels),
    subagentModels: capture(config, "subagentModels", config.subagentModels),
    injectionModel: capture(config, "injectionModel", config.injectionModel),
    injectionEffort: capture(config, "injectionEffort", config.injectionEffort),
    multiAgentGuidanceEnabled: capture(config, "multiAgentGuidanceEnabled", config.multiAgentGuidanceEnabled),
    syncCodexSubagentDefaults: capture(config, "syncCodexSubagentDefaults", config.syncCodexSubagentDefaults),
    multiAgentMode: capture(config, "multiAgentMode", config.multiAgentMode),
    keepNativeChatGptOnV1: capture(config, "keepNativeChatGptOnV1", config.keepNativeChatGptOnV1),
    clientIntegrations: capture(config, "clientIntegrations", config.clientIntegrations),
  };
}

/**
 * Keep first launch read-only with respect to Codex and every unrelated client.
 * The baseline is captured before these product-mode guards are installed, so
 * Restore can return an imported config to its exact prior intent.
 */
export function prepareGravityBridgeStartup(config: OcxConfig): boolean {
  if (config.gravityBridge?.configuredAt) return false;
  ensureGravityBridgeBaseline(config);
  config.clientIntegrations = {
    ...config.clientIntegrations,
    codex: false,
    grok: false,
    "claude-desktop": false,
  };
  return true;
}

/** Capture once, before OAuth can publish the Antigravity provider into config. */
export function ensureGravityBridgeBaseline(config: OcxConfig): NonNullable<OcxConfig["gravityBridge"]> {
  if (config.gravityBridge?.schema === GRAVITYBRIDGE_SCHEMA) return config.gravityBridge;
  const state: NonNullable<OcxConfig["gravityBridge"]> = {
    schema: GRAVITYBRIDGE_SCHEMA,
    baseline: captureGravityBridgeBaseline(config),
  };
  config.gravityBridge = state;
  return state;
}

export function acceptGravityBridgeOAuthRisk(config: OcxConfig, at = new Date().toISOString()): void {
  ensureGravityBridgeBaseline(config).acceptedRiskAt = at;
}

export function applyGravityBridgeDefaults(config: OcxConfig, at = new Date().toISOString()): void {
  const state = ensureGravityBridgeBaseline(config);
  const provider = config.providers[GRAVITYBRIDGE_PROVIDER];
  if (!provider) throw new Error("Google Antigravity provider is not configured");

  // Narrow the provider's catalog without changing the main Codex provider/model.
  provider.selectedModels = [GRAVITYBRIDGE_MODEL];
  config.subagentModels = [GRAVITYBRIDGE_MODEL_SLUG];
  config.injectionModel = GRAVITYBRIDGE_MODEL_SLUG;
  config.injectionEffort = GRAVITYBRIDGE_EFFORT;
  config.multiAgentGuidanceEnabled = true;
  config.syncCodexSubagentDefaults = true;
  config.multiAgentMode = "v1";
  config.keepNativeChatGptOnV1 = true;
  config.clientIntegrations = {
    ...config.clientIntegrations,
    codex: true,
    grok: false,
    "claude-desktop": false,
  };
  state.configuredAt = at;
}

export function restoreGravityBridgeDefaults(config: OcxConfig): { changed: boolean } {
  const state = config.gravityBridge;
  if (!state || state.schema !== GRAVITYBRIDGE_SCHEMA) return { changed: false };
  const baseline = state.baseline;

  restore(config, "subagentModels", baseline.subagentModels);
  restore(config, "injectionModel", baseline.injectionModel);
  restore(config, "injectionEffort", baseline.injectionEffort);
  restore(config, "multiAgentGuidanceEnabled", baseline.multiAgentGuidanceEnabled);
  restore(config, "syncCodexSubagentDefaults", baseline.syncCodexSubagentDefaults);
  restore(config, "multiAgentMode", baseline.multiAgentMode);
  restore(config, "keepNativeChatGptOnV1", baseline.keepNativeChatGptOnV1);
  restore(config, "clientIntegrations", baseline.clientIntegrations);

  const provider = config.providers[GRAVITYBRIDGE_PROVIDER];
  if (!baseline.providerPresent) {
    delete config.providers[GRAVITYBRIDGE_PROVIDER];
  } else if (provider) {
    restore(provider, "selectedModels", baseline.providerSelectedModels);
  }

  delete config.gravityBridge;
  return { changed: true };
}

export function gravityBridgeTargetAvailable(models: readonly CatalogModel[]): boolean {
  return models.some(model => model.provider === GRAVITYBRIDGE_PROVIDER && model.id === GRAVITYBRIDGE_MODEL);
}

export function gravityBridgeConfigurationMatches(config: OcxConfig): boolean {
  return config.providers[GRAVITYBRIDGE_PROVIDER]?.selectedModels?.length === 1
    && config.providers[GRAVITYBRIDGE_PROVIDER]?.selectedModels?.[0] === GRAVITYBRIDGE_MODEL
    && config.subagentModels?.length === 1
    && config.subagentModels[0] === GRAVITYBRIDGE_MODEL_SLUG
    && config.injectionModel === GRAVITYBRIDGE_MODEL_SLUG
    && config.injectionEffort === GRAVITYBRIDGE_EFFORT
    && config.multiAgentGuidanceEnabled !== false
    && config.syncCodexSubagentDefaults === true
    && config.multiAgentMode === "v1"
    && config.clientIntegrations?.codex === true
    && config.clientIntegrations?.grok === false
    && config.clientIntegrations?.["claude-desktop"] === false;
}

export function extractGravityBridgeResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text.trim();
  if (!Array.isArray(record.output)) return "";
  const parts: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const text = (block as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) parts.push(text.trim());
    }
  }
  return parts.join("\n").trim();
}

export type GravityBridgeErrorCode =
  | "AUTH_REQUIRED"
  | "ACCOUNT_NOT_ELIGIBLE"
  | "MODEL_NOT_AVAILABLE"
  | "ROUTE_MISMATCH"
  | "EFFORT_MISMATCH"
  | "PARAM_UNSUPPORTED"
  | "RATE_LIMITED"
  | "UPSTREAM_BUSY"
  | "CONFIG_WRITE_FAILED"
  | "SELF_TEST_FAILED";

export function classifyGravityBridgeFailure(status: number, detail: string): GravityBridgeErrorCode {
  const normalized = detail.toLowerCase();
  if (status === 401 || /token|credential|login|auth/.test(normalized)) return "AUTH_REQUIRED";
  if (status === 403 || /permission|not eligible|access denied|project unavailable/.test(normalized)) return "ACCOUNT_NOT_ELIGIBLE";
  if (status === 404 || /model.*(?:missing|unavailable|not found)/.test(normalized)) return "MODEL_NOT_AVAILABLE";
  if (status === 429) return "RATE_LIMITED";
  if (/unsupported|unknown field|invalid argument|invalid parameter/.test(normalized)) return "PARAM_UNSUPPORTED";
  if (status === 502 || status === 503 || status === 504) return "UPSTREAM_BUSY";
  return "SELF_TEST_FAILED";
}
