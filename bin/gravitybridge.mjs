#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRealBunBinary } from "../src/lib/bun-binary-validator.mjs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "..", "src", "cli", "index.ts");
const launchProofPrefix = "--ocx-internal-launch-proof=";

function resolveBun() {
  let bunRoot;
  try {
    bunRoot = dirname(require.resolve("bun/package.json"));
  } catch {
    console.error("GravityBridge could not find its bundled Bun runtime. Reinstall the package with npm lifecycle scripts enabled.");
    process.exit(1);
  }
  for (const name of ["bun.exe", "bun"]) {
    const candidate = join(bunRoot, "bin", name);
    if (isRealBunBinary(candidate)) return candidate;
  }
  const installer = join(bunRoot, "install.js");
  if (existsSync(installer)) {
    console.error("GravityBridge's bundled Bun runtime is incomplete. Reinstall with: npm install -g github:seamas0825-lab/gravitybridge");
  } else {
    console.error("GravityBridge's bundled Bun runtime is missing. Reinstall the package.");
  }
  process.exit(1);
}

const forwardedArgs = process.argv.slice(2);
const args = forwardedArgs.length === 0 ? ["start"] : forwardedArgs;
const proof = randomBytes(32).toString("base64url");
const launchContext = JSON.stringify({ version: 1, proof, anthropicEnvSlots: [] });
const configuredHome = process.env.OPENCODEX_HOME?.trim() || join(homedir(), ".gravitybridge");
const expandedHome = configuredHome === "~"
  ? homedir()
  : configuredHome.startsWith("~/")
    ? join(homedir(), configuredHome.slice(2))
    : configuredHome;
let bridgeConfigured = false;
try {
  bridgeConfigured = Boolean(JSON.parse(readFileSync(join(expandedHome, "config.json"), "utf8"))?.gravityBridge?.configuredAt);
} catch { /* fresh install */ }
const env = {
  ...process.env,
  OPENCODEX_HOME: configuredHome,
  GRAVITYBRIDGE_MODE: "1",
  OCX_NODE_LAUNCH_CONTEXT: launchContext,
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
