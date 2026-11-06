import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeConfigDir } from "./lib/paths.js";
import { readRoute, routingDecision, sessionGuidance } from "./lib/routing.js";

// This file is the only work done for an Agent/Task call. There are no
// network calls and every failure exits 0 without a routing decision.
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (input?.hook_event_name === "SessionStart") {
    const guidance = sessionGuidance(readRoute(claudeConfigDir()));
    if (guidance) process.stdout.write(JSON.stringify(guidance));
  } else if (["Agent", "Task"].includes(input?.tool_name)) {
    const decision = routingDecision(input.tool_input, readRoute(claudeConfigDir()));
    if (decision) process.stdout.write(JSON.stringify(decision));
  }
} catch {
  // Fail open: native subagent behavior is safer than blocking on bad state.
}
