export const GRAVITYBRIDGE_MODE_ENV = "GRAVITYBRIDGE_MODE";

export function isGravityBridgeMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[GRAVITYBRIDGE_MODE_ENV] === "1";
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
