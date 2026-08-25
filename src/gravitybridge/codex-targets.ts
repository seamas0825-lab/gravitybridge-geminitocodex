import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteFile, getConfigDir, loadConfig } from "../config";
import { readRootTomlString } from "../codex/paths";
import type { OcxConfig } from "../types";
import {
  GRAVITYBRIDGE_CODEX_HOMES_ENV,
} from "./runtime";
import { GRAVITYBRIDGE_MODEL_SLUG } from "./core";

export const GRAVITYBRIDGE_RULES_VERSION = 1;
export const GRAVITYBRIDGE_RULES_START = "<!-- gravitybridge:subagent-rules:start -->";
export const GRAVITYBRIDGE_RULES_END = "<!-- gravitybridge:subagent-rules:end -->";

export const GRAVITYBRIDGE_AGENT_RULES = `# GravityBridge subagent routing

When GravityBridge configures \`google-antigravity/gemini-3.7-flash\` as the default subagent, call \`spawn_agent\` without the \`model\` and \`reasoning_effort\` arguments and set \`fork_turns\` to \`"none"\` by default. Codex validates an explicit non-OpenAI model override against the ChatGPT account before the local proxy can route it, which causes a false “model is not supported” error. Omitting both arguments lets the configured defaults route the subagent through GravityBridge as Gemini 3.7 Flash with high reasoning effort. Using \`fork_turns: "none"\` prevents a new subagent from inheriting and immediately compacting the parent task's full transcript. Only inherit turns when a subtask genuinely requires conversation history, and only set an explicit model when the user asks for a different native OpenAI model.

After GravityBridge is first configured, use a newly created Codex task. Tasks created earlier can retain native V2 encrypted task metadata and cannot be converted in place for a routed provider.`;

const MANAGED_RULES_BLOCK = `${GRAVITYBRIDGE_RULES_START}\n${GRAVITYBRIDGE_AGENT_RULES}\n${GRAVITYBRIDGE_RULES_END}`;

export type GravityBridgeCodexTargetSource = "explicit" | "native" | "cockpit" | "configured";

export interface GravityBridgeCodexTarget {
  home: string;
  source: GravityBridgeCodexTargetSource;
  label: string;
  selected: boolean;
  configPresent: boolean;
}

export interface GravityBridgeTargetInspection {
  home: string;
  configured: boolean;
  routeMatches: boolean;
  catalogMatches: boolean;
  defaultsMatch: boolean;
  rulesInstalled: boolean;
  conflict: null | {
    code: "ROUTING_CONFLICT";
    owner: "opencodex" | "custom";
    value: string;
  };
  reasons: string[];
}

export interface DiscoveryOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  configuredHomes?: readonly string[];
  exists?: (path: string) => boolean;
  readDir?: (path: string) => string[];
  stat?: (path: string) => { isDirectory(): boolean };
  realpath?: (path: string) => string;
}

function canonicalDirectory(path: string, options: DiscoveryOptions): string | null {
  const exists = options.exists ?? existsSync;
  const stat = options.stat ?? ((candidate: string) => statSync(candidate));
  const realpath = options.realpath ?? realpathSync.native;
  const absolute = resolve(path);
  try {
    if (!exists(absolute) || !stat(absolute).isDirectory()) return null;
    return realpath(absolute);
  } catch {
    return null;
  }
}

function envHomes(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const separator = value.includes("\n") ? /\r?\n/ : value.includes(",") ? /,/ : delimiter;
  return value.split(separator).map(item => item.trim()).filter(Boolean);
}

export function discoverGravityBridgeCodexHomes(options: DiscoveryOptions = {}): GravityBridgeCodexTarget[] {
  const env = options.env ?? process.env;
  const userHome = options.homeDir ?? homedir();
  const exists = options.exists ?? existsSync;
  const readDir = options.readDir ?? readdirSync;
  const stat = options.stat ?? ((candidate: string) => statSync(candidate));
  const candidates: Array<{ home: string; source: GravityBridgeCodexTargetSource; label: string }> = [];
  const add = (home: string | undefined, source: GravityBridgeCodexTargetSource, label: string) => {
    if (!home?.trim()) return;
    candidates.push({ home: home.trim(), source, label });
  };

  add(env.CODEX_HOME, "explicit", "Current CODEX_HOME");
  for (const home of envHomes(env[GRAVITYBRIDGE_CODEX_HOMES_ENV])) {
    add(home, "explicit", "GRAVITYBRIDGE_CODEX_HOMES");
  }
  add(join(userHome, ".codex"), "native", "Default Codex");

  const cockpitRoot = join(userHome, ".antigravity_cockpit", "instances", "codex");
  try {
    if (exists(cockpitRoot) && stat(cockpitRoot).isDirectory()) {
      for (const name of readDir(cockpitRoot).sort()) {
        const candidate = join(cockpitRoot, name);
        if (!exists(join(candidate, "config.toml"))) continue;
        add(candidate, "cockpit", `Cockpit ${name}`);
      }
    }
  } catch {
    // Discovery is best-effort. Explicit targets still remain available.
  }

  for (const home of options.configuredHomes ?? []) add(home, "configured", "Saved target");

  const selected = new Set((options.configuredHomes ?? []).map(home => canonicalDirectory(home, options)).filter(Boolean));
  const deduped = new Map<string, GravityBridgeCodexTarget>();
  for (const candidate of candidates) {
    const canonical = canonicalDirectory(candidate.home, options);
    if (!canonical || deduped.has(canonical)) continue;
    deduped.set(canonical, {
      home: canonical,
      source: candidate.source,
      label: candidate.label,
      selected: selected.size > 0 ? selected.has(canonical) : true,
      configPresent: exists(join(canonical, "config.toml")),
    });
  }
  return [...deduped.values()];
}

function agentsDefaults(content: string): { model: string | null; effort: string | null } {
  try {
    const parsed = Bun.TOML.parse(content) as Record<string, unknown>;
    const agents = parsed.agents && typeof parsed.agents === "object" && !Array.isArray(parsed.agents)
      ? parsed.agents as Record<string, unknown>
      : {};
    return {
      model: typeof agents.default_subagent_model === "string" ? agents.default_subagent_model : null,
      effort: typeof agents.default_subagent_reasoning_effort === "string"
        ? agents.default_subagent_reasoning_effort
        : null,
    };
  } catch {
    return { model: null, effort: null };
  }
}

export function gravityBridgeBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/v1`;
}

export function inspectGravityBridgeCodexTarget(home: string, port: number): GravityBridgeTargetInspection {
  const configPath = join(home, "config.toml");
  const catalogPath = join(home, "gravitybridge-catalog.json");
  const agentsPath = join(home, "AGENTS.md");
  const reasons: string[] = [];
  let content = "";
  try { content = readFileSync(configPath, "utf8"); } catch { reasons.push("config_missing"); }
  const expectedUrl = gravityBridgeBaseUrl(port);
  const route = readRootTomlString(content, "openai_base_url");
  const catalog = readRootTomlString(content, "model_catalog_json");
  const defaults = agentsDefaults(content);
  const rulesInstalled = (() => {
    try {
      const rules = readFileSync(agentsPath, "utf8");
      return rules.includes(GRAVITYBRIDGE_RULES_START) && rules.includes(GRAVITYBRIDGE_RULES_END);
    } catch { return false; }
  })();
  const routeMatches = route === expectedUrl;
  const catalogMatches = catalog === catalogPath && existsSync(catalogPath);
  const defaultsMatch = defaults.model === GRAVITYBRIDGE_MODEL_SLUG && defaults.effort === "high";
  const modelProvider = readRootTomlString(content, "model_provider");
  const legacyOpenCodex = /# Auto-injected by opencodex/.test(content)
    || modelProvider === "opencodex";
  const gravityBridgeMarker = /# Auto-injected by GravityBridge/.test(content);
  const conflict = legacyOpenCodex && !gravityBridgeMarker
    ? {
        code: "ROUTING_CONFLICT" as const,
        owner: "opencodex" as const,
        value: route ?? "model_provider=opencodex",
      }
    : route && !routeMatches
    ? {
        code: "ROUTING_CONFLICT" as const,
        owner: legacyOpenCodex ? "opencodex" as const : "custom" as const,
        value: route,
      }
    : modelProvider && modelProvider !== "openai"
    ? {
        code: "ROUTING_CONFLICT" as const,
        owner: "custom" as const,
        value: `model_provider=${modelProvider}`,
      }
    : null;
  if (!routeMatches || conflict) reasons.push(conflict ? "routing_conflict" : "route_missing");
  if (!catalogMatches) reasons.push("catalog_missing_or_stale");
  if (!defaultsMatch) reasons.push("subagent_defaults_missing");
  if (!rulesInstalled) reasons.push("agent_rules_missing");
  return {
    home,
    configured: !conflict && routeMatches && catalogMatches && defaultsMatch && rulesInstalled,
    routeMatches,
    catalogMatches,
    defaultsMatch,
    rulesInstalled,
    conflict,
    reasons,
  };
}

export function installGravityBridgeAgentRules(home: string): { changed: boolean; path: string } {
  const path = join(home, "AGENTS.md");
  let current = "";
  try { current = readFileSync(path, "utf8"); } catch { /* create below */ }
  const start = current.indexOf(GRAVITYBRIDGE_RULES_START);
  const end = current.indexOf(GRAVITYBRIDGE_RULES_END);
  let next: string;
  if (start >= 0 && end >= start) {
    next = `${current.slice(0, start)}${MANAGED_RULES_BLOCK}${current.slice(end + GRAVITYBRIDGE_RULES_END.length)}`;
  } else if (current.trim() === GRAVITYBRIDGE_AGENT_RULES.trim()) {
    // Adopt the unmarked rule written by the original manual workaround.
    next = `${MANAGED_RULES_BLOCK}\n`;
  } else {
    next = `${current.replace(/\s+$/, "")}${current.trim() ? "\n\n" : ""}${MANAGED_RULES_BLOCK}\n`;
  }
  if (next === current) return { changed: false, path };
  atomicWriteFile(path, next);
  return { changed: true, path };
}

export function removeGravityBridgeAgentRules(home: string): { changed: boolean; path: string } {
  const path = join(home, "AGENTS.md");
  let current: string;
  try { current = readFileSync(path, "utf8"); } catch { return { changed: false, path }; }
  const start = current.indexOf(GRAVITYBRIDGE_RULES_START);
  const end = current.indexOf(GRAVITYBRIDGE_RULES_END);
  if (start < 0 || end < start) return { changed: false, path };
  const next = `${current.slice(0, start)}${current.slice(end + GRAVITYBRIDGE_RULES_END.length)}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  atomicWriteFile(path, next ? `${next}\n` : "");
  return { changed: true, path };
}

export function selectedGravityBridgeHomes(
  config: Pick<OcxConfig, "gravityBridge">,
  requested?: readonly string[],
  discoveryOptions: DiscoveryOptions = {},
): string[] {
  const discovered = discoverGravityBridgeCodexHomes({
    ...discoveryOptions,
    configuredHomes: config.gravityBridge?.codexHomes,
  });
  const allowed = new Set(discovered.map(target => target.home));
  const excluded = new Set(config.gravityBridge?.excludedCodexHomes ?? []);
  const values = requested?.length
    ? requested
    : config.gravityBridge?.autoDiscoverCodexHomes !== false
      ? discovered.filter(target => !excluded.has(target.home)).map(target => target.home)
      : discovered.filter(target => target.selected).map(target => target.home);
  return [...new Set(values.map(home => {
    try { return realpathSync.native(resolve(home)); } catch { return ""; }
  }).filter(home => home && allowed.has(home)))];
}

export interface GravityBridgeTargetWorkerResult {
  ok: boolean;
  action: "sync" | "restore";
  home: string;
  code?: string;
  error?: string;
  result?: unknown;
}

export function runGravityBridgeTargetWorker(
  action: "sync" | "restore",
  home: string,
  port: number,
): GravityBridgeTargetWorkerResult {
  const worker = fileURLToPath(new URL("./target-worker.ts", import.meta.url));
  const child = spawnSync(process.execPath, [worker, action, String(port)], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_HOME: home,
      OPENCODEX_HOME: getConfigDir(),
      GRAVITYBRIDGE_HOME: getConfigDir(),
      GRAVITYBRIDGE_MODE: "1",
    },
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const raw = child.stdout.trim();
  if (raw) {
    try { return JSON.parse(raw) as GravityBridgeTargetWorkerResult; } catch { /* report below */ }
  }
  return {
    ok: false,
    action,
    home,
    code: child.error ? "WORKER_START_FAILED" : "WORKER_FAILED",
    error: child.error?.message || child.stderr.trim() || `Target worker exited with ${child.status}`,
  };
}

export function adoptLegacyGravityBridgeArtifacts(home: string, port: number): { changed: boolean } {
  const configPath = join(home, "config.toml");
  let content: string;
  try { content = readFileSync(configPath, "utf8"); } catch { return { changed: false }; }
  const expectedUrl = gravityBridgeBaseUrl(port);
  const legacyCatalog = join(home, "opencodex-catalog.json");
  const legacyJournal = join(home, "opencodex-journal.json");
  const newJournal = join(home, "gravitybridge-journal.json");
  const state = (() => {
    try {
      const parsed = JSON.parse(readFileSync(join(getConfigDir(), "config.json"), "utf8")) as OcxConfig;
      return parsed.gravityBridge?.configuredAt ? parsed : null;
    } catch { return null; }
  })();
  if (!state) return { changed: false };
  const legacyEvidence = content.includes("# Auto-injected by opencodex")
    && (readRootTomlString(content, "openai_base_url") === expectedUrl
      || readRootTomlString(content, "model_catalog_json") === legacyCatalog);
  if (!legacyEvidence) return { changed: false };
  if (existsSync(legacyJournal) && !existsSync(newJournal)) copyFileSync(legacyJournal, newJournal);
  const next = readRootTomlString(content, "openai_base_url") === expectedUrl
    ? content.replace("# Auto-injected by opencodex", "# Auto-injected by GravityBridge")
    : content;
  if (next !== content) atomicWriteFile(configPath, next);
  return { changed: next !== content || (existsSync(legacyJournal) && existsSync(newJournal)) };
}

export function startGravityBridgeTargetGuardian(
  port: number,
  options: { intervalMs?: number; retryMs?: number; log?: Pick<Console, "log" | "error"> } = {},
): { stop: () => void; runNow: () => Promise<void> } {
  const intervalMs = Math.max(1_000, options.intervalMs ?? 3_000);
  const retryMs = Math.max(intervalMs, options.retryMs ?? 60_000);
  const log = options.log ?? console;
  const attempts = new Map<string, { fingerprint: string; at: number }>();
  let running = false;
  let stopped = false;

  const fingerprint = (home: string, reasons: readonly string[]): string => {
    let mtime = 0;
    try { mtime = statSync(join(home, "config.toml")).mtimeMs; } catch { /* missing */ }
    return `${mtime}:${reasons.join("|")}`;
  };

  const runNow = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const config = loadConfig();
      if (!config.gravityBridge?.configuredAt || config.gravityBridge.autoRepair === false) return;
      const homes = selectedGravityBridgeHomes(config);
      for (const home of homes) {
        const inspection = inspectGravityBridgeCodexTarget(home, port);
        if (inspection.configured || inspection.conflict) continue;
        const nextFingerprint = fingerprint(home, inspection.reasons);
        const previous = attempts.get(home);
        const now = Date.now();
        if (previous?.fingerprint === nextFingerprint && now - previous.at < retryMs) continue;
        attempts.set(home, { fingerprint: nextFingerprint, at: now });
        const repaired = runGravityBridgeTargetWorker("sync", home, port);
        if (repaired.ok) {
          attempts.delete(home);
          log.log(`GravityBridge repaired Codex routing in ${home}.`);
        } else {
          log.error(`GravityBridge could not repair ${home}: ${repaired.error ?? repaired.code ?? "unknown error"}`);
        }
      }
    } catch (error) {
      log.error(`GravityBridge target guardian failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => { void runNow(); }, intervalMs);
  timer.unref?.();
  return {
    stop: () => { stopped = true; clearInterval(timer); },
    runNow,
  };
}
