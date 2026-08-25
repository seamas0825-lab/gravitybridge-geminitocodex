#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRealBunBinary } from "../src/lib/bun-binary-validator.mjs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "..", "src", "cli", "index.ts");
const launchProofPrefix = "--ocx-internal-launch-proof=";

function expandHomePath(value) {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function cockpitCodexHomes() {
  const root = join(homedir(), ".antigravity_cockpit", "instances", "codex");
  try {
    return readdirSync(root)
      .map(name => join(root, name))
      .filter(path => statSync(path).isDirectory() && existsSync(join(path, "config.toml")));
  } catch {
    return [];
  }
}

function resolveCodexHome() {
  const explicit = process.env.GRAVITYBRIDGE_CODEX_HOME?.trim() || process.env.CODEX_HOME?.trim();
  if (explicit) return expandHomePath(explicit);
  const cockpitHomes = cockpitCodexHomes();
  return cockpitHomes.length === 1 ? cockpitHomes[0] : undefined;
}

function resolveBun() {
  const configuredBinary = process.env.GRAVITYBRIDGE_BUN_PATH?.trim();
  if (configuredBinary && isRealBunBinary(configuredBinary)) return configuredBinary;

  const platformPackage = process.platform === "darwin"
    ? process.arch === "arm64"
      ? "@oven/bun-darwin-aarch64"
      : process.arch === "x64"
        ? "@oven/bun-darwin-x64"
        : null
    : null;
  if (platformPackage) {
    try {
      const binaryRoot = dirname(require.resolve(`${platformPackage}/package.json`));
      const candidate = join(binaryRoot, "bin", "bun");
      if (isRealBunBinary(candidate)) return candidate;
    } catch { /* fall through to the legacy wrapper lookup */ }
  }

  let bunRoot;
  try {
    bunRoot = dirname(require.resolve("bun/package.json"));
  } catch {
    console.error(process.platform === "darwin"
      ? "GravityBridge could not find its bundled Bun runtime. Reinstall the package."
      : "GravityBridge Beta currently supports macOS only.");
    process.exit(1);
  }
  for (const name of ["bun.exe", "bun"]) {
    const candidate = join(bunRoot, "bin", name);
    if (isRealBunBinary(candidate)) return candidate;
  }
  const installer = join(bunRoot, "install.js");
  if (existsSync(installer)) {
    console.error("GravityBridge's bundled Bun runtime is incomplete. Reinstall the package.");
  } else {
    console.error("GravityBridge's bundled Bun runtime is missing. Reinstall the package.");
  }
  process.exit(1);
}

const forwardedArgs = process.argv.slice(2);
const args = forwardedArgs.length === 0 ? ["start"] : forwardedArgs;
const proof = randomBytes(32).toString("base64url");
const launchContext = JSON.stringify({ version: 1, proof, anthropicEnvSlots: [] });
// GravityBridge deliberately ignores ambient OPENCODEX_HOME. Both products may
// be installed on the same Mac, but they never share state or process records.
const configuredHome = process.env.GRAVITYBRIDGE_HOME?.trim() || join(homedir(), ".gravitybridge");
const expandedHome = expandHomePath(configuredHome);
const codexHome = resolveCodexHome();
let bridgeConfigured = false;
try {
  bridgeConfigured = Boolean(JSON.parse(readFileSync(join(expandedHome, "config.json"), "utf8"))?.gravityBridge?.configuredAt);
} catch { /* fresh install */ }
const env = {
  ...process.env,
  OPENCODEX_HOME: configuredHome,
  GRAVITYBRIDGE_HOME: configuredHome,
  GRAVITYBRIDGE_MODE: "1",
  OCX_NODE_LAUNCH_CONTEXT: launchContext,
  ...(codexHome ? { CODEX_HOME: codexHome } : {}),
  ...(!bridgeConfigured ? { GRAVITYBRIDGE_NATIVE_CLAIM_HOME: expandedHome } : {}),
};

const child = spawn(resolveBun(), [cliPath, `${launchProofPrefix}${proof}`, ...args], {
  stdio: "inherit",
  env,
  windowsHide: true,
});

const signals = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];
const handlers = signals.map(signal => {
  const handler = () => {
    try { child.kill(signal); } catch { /* child already stopped */ }
  };
  process.on(signal, handler);
  return [signal, handler];
});

function clearHandlers() {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
}

child.on("error", error => {
  clearHandlers();
  console.error(`GravityBridge failed to start: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearHandlers();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
