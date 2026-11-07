import fs from "node:fs";
import path from "node:path";
import { ROLE_IDS } from "./config.js";

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
      && typeof row?.description === "string" && row.description.length > 0
      && (!Array.isArray(row?.roles) || row.roles.every((role) => ROLE_IDS.includes(role))));
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
        `Claude Subagent Router is active in ${route.mode} mode. When delegating through Agent or Task, choose a specific subagent_type from this list before calling the tool; never omit subagent_type. ${strict ? "Do not use general-purpose or any other named agent, including OMC specialists: their model definitions may pin unavailable Claude models, and a model override cannot reliably replace a pinned model. Select a generated router agent below and describe the specialist role you need in its prompt." : "Use general-purpose or named custom agents only when explicitly required."} Select by task and responsibilities, use one or several in parallel when useful, and synthesize results yourself. Do not delegate when unnecessary. Available Magpie agents:\n${choices}`,
    },
  };
}

export function routingDecision(input, route) {
  if (!route?.agents?.length) return null;
  const type = input?.subagent_type;
  const model = input?.model;
  const generated = route.agents.find((row) => row.name === type);
  const choices = route.agents.map((row) => `- ${row.name}: ${row.description}`).join("\n");
  if (generated && model !== undefined && model !== "inherit"
    && !route.agents.some((row) => row.model === model)) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `The generated agent ${JSON.stringify(type)} supplies a model from the configured pool. Remove model ${JSON.stringify(model)} and retry with the same subagent_type, or choose a generated agent for a pool model. Agent definitions take precedence over call-time model overrides.`,
      },
    };
  }
  if (route.mode === "strict" && typeof type === "string" && type !== "general-purpose" && !generated) {
    const roleHints = {
      planner: ["reasoning"], analyst: ["reasoning"], architect: ["reasoning", "review"], critic: ["review", "reasoning"],
      executor: ["implementation"], "code-reviewer": ["review"], "code-simplifier": ["implementation", "review"],
      debugger: ["reasoning", "implementation"], designer: ["implementation"], "document-specialist": ["research", "fast"],
      explore: ["research", "fast"], "git-master": ["implementation"], "qa-tester": ["implementation", "review"],
      scientist: ["research", "reasoning"], "security-reviewer": ["review", "reasoning"], "test-engineer": ["implementation", "review"],
      tracer: ["reasoning", "research"], verifier: ["review"], writer: ["general"],
    };
    const wanted = roleHints[type.split(":").at(-1)] || [];
    const matching = route.agents.filter((row) => row.roles?.some((role) => wanted.includes(role)));
    const candidates = (matching.length ? matching : route.agents).map((row) => `- ${row.name}: ${row.description}`).join("\n");
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Strict mode permits only generated router agents. ${JSON.stringify(type)} is outside the pool and may inherit the session model or have a pinned Claude model in its agent definition. Do not add a model override: a pinned agent definition can take precedence over it. Select a generated router agent below, omit the model field, and describe the original specialist role in its prompt. Prefer mode allows explicitly named custom agents. Available agents${matching.length ? " with matching responsibilities" : ""}:\n${candidates}`,
      },
    };
  }
  if (model !== undefined && model !== "inherit"
    && (type === undefined || type === "general-purpose")
    && !route.agents.some((row) => row.model === model)) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Claude Subagent Router does not route model ${JSON.stringify(model)}. Remove the model field and retry with a subagent_type selected from the available Magpie model pool. The selected router agent supplies its own model. Select a generated router agent; available agents:\n${choices}`,
      },
    };
  }
  if (typeof type === "string" && type !== "general-purpose") return null;
  if (type === "general-purpose" && route.mode !== "strict") return null;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `Claude Subagent Router is active in ${route.mode} mode. Retry the same task with an explicit subagent_type selected from the available Magpie model pool. Do not specify model "claude-sonnet", "claude-opus", "claude-haiku", or another non-pool model; remove the model field so the router agent supplies its own model. Do not omit subagent_type or use general-purpose. You may invoke one or several matching agents in parallel. Available agents:\n${choices}`,
    },
  };
}
