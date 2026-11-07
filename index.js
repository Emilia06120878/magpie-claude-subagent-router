import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOptions } from "./lib/config.js";
import { claudeConfigDir } from "./lib/paths.js";
import { readCatalog } from "./lib/catalog.js";
import { writePageSnapshot } from "./lib/atomic.js";
import { syncAgents } from "./lib/sync.js";
import { agentName } from "./lib/agents.js";
import { syncHook } from "./lib/hook-config.js";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE_DIR = path.join(ROOT_DIR, "page");
const HOOK_SCRIPT = path.join(ROOT_DIR, "hook.js");

export async function runPlugin(input, options, env = process.env, pageDir = PAGE_DIR) {
  const configuration = normalizeOptions(options);
  const claudeDir = claudeConfigDir(env);
  const catalog = readCatalog(claudeDir);
  let sync = { ok: false, reason: "catalog-unavailable", agents: [], stale: [], conflicts: [], modified: [] };
  if (catalog.ok || configuration.models.length === 0) {
    // Clearing the pool never needs a working catalog: ownership hashes are
    // sufficient to remove only our untouched generated definitions.
    sync = syncAgents(claudeDir, configuration, catalog.ok ? catalog : { models: [] });
  }
  const hook = { ok: false, reason: "not-installed" };
  try {
    Object.assign(hook, syncHook(claudeDir, HOOK_SCRIPT), { ok: true, reason: "" });
  } catch (error) {
    hook.reason = "settings-unwritable";
    hook.message = error.message;
  }
  // A bad snapshot must never make the saved options or the existing agent
  // files disappear. The page displays its reason and lets the user retry.
  const status = {
    catalog: { ok: catalog.ok, reason: catalog.reason, count: catalog.models.length },
    sync,
    issues: configuration.models.filter((row) => !sync.agents.some((agent) => agent.model === row.model)).map((row) => {
      const filename = `${agentName(row.model)}.md`;
      const kind = sync.conflicts.includes(filename) ? "conflict" : sync.modified.includes(filename) ? "modified" : "stale";
      return { model: row.model, kind };
    }),
    hook,
    revision: Date.now(),
  };
  writePageSnapshot(pageDir, "catalog", { models: catalog.models });
  writePageSnapshot(pageDir, "status", status);
  return {};
}

export default {
  id: "claude-subagent-router",
  server: runPlugin,
};
