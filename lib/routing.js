import fs from "node:fs";
import path from "node:path";

export const ROUTE_VERSION = 1;
export const ROUTE_FILE = ".claude-subagent-router-route.json";

export function routePath(claudeDir) {
  return path.join(claudeDir, "agents", ROUTE_FILE);
}

export function readRoute(claudeDir) {
  try {
    const value = JSON.parse(fs.readFileSync(routePath(claudeDir), "utf8"));
    if (value?.version !== ROUTE_VERSION || !Array.isArray(value.agents)
      || !["strict", "prefer"].includes(value.mode)) return null;
    const agents = value.agents.filter((row) =>
      typeof row?.name === "string" && /^router-[a-z0-9-]+$/.test(row.name)
      && typeof row?.model === "string" && row.model.length > 0
      && typeof row?.description === "string" && row.description.length > 0);
    if (agents.length !== value.agents.length) return null;
    return { version: ROUTE_VERSION, mode: value.mode, agents };
  } catch {
    // A missing, partial, or corrupt route must never block native agents.
    return null;
  }
}

export function sessionGuidance(route) {
  if (!route?.agents?.length) return null;
  const choices = route.agents.map((row) => `- ${row.name}: ${row.description}`).join("\n");
  const strict = route.mode === "strict";
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        `Claude Subagent Router is active in ${route.mode} mode. When delegating through Agent or Task, choose a specific subagent_type from this list before calling the tool; never omit subagent_type. ${strict ? "Do not use general-purpose." : "Use general-purpose only when it is explicitly required."} Select by task and responsibilities, use one or several in parallel when useful, and synthesize results yourself. Do not delegate when unnecessary. Available Magpie agents:\n${choices}`,
    },
  };
}

export function routingDecision(input, route) {
  if (!route?.agents?.length) return null;
  const type = input?.subagent_type;
  if (typeof type === "string" && type !== "general-purpose") return null;
  if (type === "general-purpose" && route.mode !== "strict") return null;
  const choices = route.agents.map((row) => `- ${row.name}: ${row.description}`).join("\n");
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `Claude Subagent Router is active in ${route.mode} mode. Retry the same task with an explicit subagent_type selected from the available Magpie model pool. Do not omit subagent_type or use general-purpose. You may invoke one or several matching agents in parallel. Available agents:\n${choices}`,
    },
  };
}
