import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { removeHook } from "./lib/hook-config.js";
import { claudeConfigDir } from "./lib/paths.js";
import { routePath } from "./lib/routing.js";
import { syncAgents } from "./lib/sync.js";

// Manual cleanup remains available if the Magpie host is already stopped.
// Remove only untouched generated agents; never delete user-edited files.
// Only a bundled copy can perform destructive cleanup; a lookalike script
// copied elsewhere without the ownership implementation must do nothing.
if (!fs.existsSync(fileURLToPath(new URL("./lib/sync.js", import.meta.url)))) {
  throw new Error("Cleanup must run from the complete plugin installation directory.");
}
const claudeDir = claudeConfigDir();
const cleaned = syncAgents(claudeDir, { mode: "strict", models: [] }, { models: [] });
const removed = removeHook(claudeDir);
fs.rmSync(routePath(claudeDir), { force: true });
console.log(JSON.stringify({ removed, routeCleared: true, agentsRemoved: cleaned.removed }));
