export const GRAVITYBRIDGE_MODE_ENV = "GRAVITYBRIDGE_MODE";
export const GRAVITYBRIDGE_HOME_ENV = "GRAVITYBRIDGE_HOME";
export const GRAVITYBRIDGE_CODEX_HOME_ENV = "GRAVITYBRIDGE_CODEX_HOME";
export const GRAVITYBRIDGE_CODEX_HOMES_ENV = "GRAVITYBRIDGE_CODEX_HOMES";
export const GRAVITYBRIDGE_DEFAULT_PORT = 10101;
export const GRAVITYBRIDGE_SERVICE_ID = "gravitybridge";
export const OPENCODEX_SERVICE_ID = "opencodex";

export function isGravityBridgeMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[GRAVITYBRIDGE_MODE_ENV] === "1";
}

export function runtimeServiceId(env: NodeJS.ProcessEnv = process.env): string {
  return isGravityBridgeMode(env) ? GRAVITYBRIDGE_SERVICE_ID : OPENCODEX_SERVICE_ID;
}

export function runtimeDefaultPort(env: NodeJS.ProcessEnv = process.env): number {
  return isGravityBridgeMode(env) ? GRAVITYBRIDGE_DEFAULT_PORT : 10100;
}

export function runtimeCodexArtifactName(opencodexName: string, gravityBridgeName: string): string {
  return isGravityBridgeMode() ? gravityBridgeName : opencodexName;
}

export const GRAVITYBRIDGE_PUBLIC_COMMANDS = new Set([
  "start",
  "stop",
  "status",
  "doctor",
  "restore",
  "gui",
  "help",
  "version",
  "--version",
  "-v",
  "--help",
  "-h",
]);
