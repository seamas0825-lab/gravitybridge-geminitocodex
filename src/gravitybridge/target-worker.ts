import { syncModelsToCodex } from "../codex/sync";
import { restoreNativeCodexAsync } from "../codex/inject";
import { getCodexHome } from "../codex/paths";
import { loadConfig } from "../config";
import {
  adoptLegacyGravityBridgeArtifacts,
  installGravityBridgeAgentRules,
  inspectGravityBridgeCodexTarget,
  removeGravityBridgeAgentRules,
} from "./codex-targets";

const [action, portValue] = process.argv.slice(2);
const port = Number(portValue);
const home = getCodexHome();

async function main() {
  if ((action !== "sync" && action !== "restore") || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, action, home, code: "INVALID_WORKER_ARGUMENTS" };
  }
  try {
    if (action === "sync") {
      adoptLegacyGravityBridgeArtifacts(home, port);
      const before = inspectGravityBridgeCodexTarget(home, port);
      if (before.conflict) {
        return {
          ok: false,
          action,
          home,
          code: before.conflict.code,
          error: `${before.conflict.owner} already manages Codex routing at ${before.conflict.value}`,
          result: { inspection: before },
        };
      }
      const rules = installGravityBridgeAgentRules(home);
      const result = await syncModelsToCodex(port, loadConfig(), null);
      const inspection = inspectGravityBridgeCodexTarget(home, port);
      return {
        ok: result.ok === true && inspection.configured,
        action,
        home,
        code: inspection.conflict?.code,
        error: inspection.conflict
          ? `${inspection.conflict.owner} already manages Codex routing at ${inspection.conflict.value}`
          : inspection.configured ? undefined : inspection.reasons.join(", "),
        result: { sync: result, rules, inspection },
      };
    }
    const result = await restoreNativeCodexAsync();
    const rules = removeGravityBridgeAgentRules(home);
    return { ok: result.success, action, home, error: result.success ? undefined : result.message, result: { restore: result, rules } };
  } catch (error) {
    return {
      ok: false,
      action,
      home,
      code: "WORKER_FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

console.log(JSON.stringify(await main()));
