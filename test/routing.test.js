import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readRoute, routePath, routingDecision } from "../lib/routing.js";
import { syncAgents } from "../lib/sync.js";
import { agentName } from "../lib/agents.js";
import { syncHook, removeHook, hookEntry, HOOK_MARKER } from "../lib/hook-config.js";
import { normalizeOptions } from "../lib/config.js";

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-router-routing-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function activeRoute(t) {
  const dir = sandbox(t);
  const config = normalizeOptions({ mode: "strict", models: [
    { model: "provider/fast", roles: ["fast"] },
    { model: "group/reasoning[1m]", roles: ["reasoning"] },
  ] });
  syncAgents(dir, config, { models: config.models });
  return { dir, config, route: readRoute(dir) };
}

test("strict routing intercepts omitted and general-purpose delegation", (t) => {
  const { route } = activeRoute(t);
  for (const toolInput of [{ prompt: "work" }, { prompt: "work", subagent_type: "general-purpose" }]) {
    const result = routingDecision(toolInput, route);
    assert.equal(result.hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.hookSpecificOutput.permissionDecisionReason, /provider\/fast/);
    assert.match(result.hookSpecificOutput.permissionDecisionReason, /group\/reasoning\[1m\]/);
    assert.equal(result.hookSpecificOutput.updatedInput, undefined);
  }
  assert.equal(routingDecision({ subagent_type: agentName("provider/fast") }, route), null);
});

test("strict routing intercepts OMC named agents even when their model is pinned", (t) => {
  const { route } = activeRoute(t);
  for (const name of ["planner", "oh-my-claudecode:planner", "executor", "oh-my-claudecode:executor", "writer", "oh-my-claudecode:writer"]) {
    for (const input of [{ subagent_type: name }, { subagent_type: name, model: "inherit" }]) {
      const result = routingDecision(input, route);
      assert.equal(result.hookSpecificOutput.permissionDecision, "deny", name);
      assert.match(result.hookSpecificOutput.permissionDecisionReason, /pinned Claude model|model definition/);
      assert.match(result.hookSpecificOutput.permissionDecisionReason, /router-/);
      assert.equal(result.hookSpecificOutput.updatedInput, undefined);
    }
    assert.equal(routingDecision({ subagent_type: name }, { ...route, mode: "prefer" }), null);
  }
});

test("strict routing allows only generated pool agents among named types", (t) => {
  const { route } = activeRoute(t);
  for (const subagent_type of ["Explore", "Plan", "custom-agent", "oh-my-claudecode:code-reviewer", "general-purpose:reviewer"]) {
    const result = routingDecision({ subagent_type }, route);
    assert.equal(result.hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.hookSpecificOutput.permissionDecisionReason, /Select a generated router agent/);
  }
  for (const name of ["planner", "executor", "writer", "code-reviewer"]) {
    const result = routingDecision({ subagent_type: `oh-my-claudecode:${name}` }, route);
    assert.equal(result.hookSpecificOutput.permissionDecision, "deny");
  }
  for (const model of ["inherit", "provider/fast", "group/reasoning[1m]"]) {
    assert.equal(routingDecision({ subagent_type: agentName("provider/fast"), model }, route), null);
  }
  const override = routingDecision({ subagent_type: agentName("provider/fast"), model: "sonnet" }, route);
  assert.equal(override.hookSpecificOutput.permissionDecision, "deny");
  assert.match(override.hookSpecificOutput.permissionDecisionReason, /supplies a model/);
});

test("default delegation cannot bypass the router with direct Claude models", (t) => {
  const { route } = activeRoute(t);
  for (const toolInput of [
    { model: "claude-sonnet" },
    { subagent_type: "general-purpose", model: "claude-sonnet" },
    { model: "sonnet" },
    { model: "claude-sonnet-4-5" },
    { model: "claude-opus" },
    { model: "claude-haiku" },
    { model: "opus" },
    { model: "haiku" },
    { model: "claude-opus-4-5" },
    { model: "claude-haiku-4-5" },
  ]) {
    const result = routingDecision(toolInput, route);
    assert.equal(result.hookSpecificOutput.permissionDecision, "deny");
    assert.match(result.hookSpecificOutput.permissionDecisionReason, /Remove the model field/);
    assert.match(result.hookSpecificOutput.permissionDecisionReason, /provider\/fast/);
    assert.equal(result.hookSpecificOutput.updatedInput, undefined);
  }
  for (const model of ["inherit", "provider/fast", "group/reasoning[1m]"]) {
    assert.equal(routingDecision({ subagent_type: "general-purpose", model }, { ...route, mode: "prefer" }), null);
  }
  for (const toolInput of [
    { subagent_type: "custom-agent", model: "claude-sonnet" },
    { subagent_type: "custom-agent" },
  ]) {
    assert.equal(routingDecision(toolInput, { ...route, mode: "prefer" }), null);
    assert.equal(routingDecision(toolInput, route).hookSpecificOutput.permissionDecision, "deny");
  }
  assert.equal(routingDecision({ subagent_type: agentName("provider/fast"), model: "claude-sonnet" }, route).hookSpecificOutput.permissionDecision, "deny");
});

test("prefer mode allows explicit general-purpose; empty or invalid state fails open", (t) => {
  const { dir, route } = activeRoute(t);
  const prefer = { ...route, mode: "prefer" };
  assert.equal(routingDecision({ subagent_type: "general-purpose" }, prefer), null);
  assert.equal(routingDecision({}, prefer).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(routingDecision({}, { ...route, agents: [] }), null);
  assert.equal(routingDecision({}, null), null);
  fs.writeFileSync(routePath(dir), "broken");
  assert.equal(readRoute(dir), null);
  fs.writeFileSync(routePath(dir), JSON.stringify({ version: 1, mode: "strict", agents: [{ name: "../bad" }] }));
  assert.equal(readRoute(dir), null);
});

test("route contains successfully generated agents, not conflicts, edits, or stale models", (t) => {
  const { dir, config } = activeRoute(t);
  const filename = path.join(dir, "agents", `${agentName("provider/fast")}.md`);
  fs.appendFileSync(filename, "user edit\n");
  syncAgents(dir, config, { models: config.models });
  assert.deepEqual(readRoute(dir).agents.map((row) => row.model), ["group/reasoning[1m]"]);
  syncAgents(dir, normalizeOptions({ models: [] }), { models: [] });
  assert.deepEqual(readRoute(dir).agents, []);
});

test("hook management preserves unrelated settings and is idempotent", (t) => {
  const dir = sandbox(t);
  const settings = path.join(dir, "settings.json");
  const original = {
    model: "unchanged",
    modelPicker: { options: [] },
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "user-hook" }] }],
      SessionStart: [{ hooks: [{ type: "command", command: "keep-session" }] }],
    },
  };
  fs.writeFileSync(settings, JSON.stringify(original));
  const script = path.join(dir, "plugin with spaces", HOOK_MARKER, "hook.js");
  assert.equal(syncHook(dir, script).changed, true);
  assert.equal(syncHook(dir, script).changed, false);
  const installed = JSON.parse(fs.readFileSync(settings));
  assert.equal(installed.model, "unchanged");
  assert.deepEqual(installed.modelPicker, original.modelPicker);
  assert.equal(installed.hooks.PreToolUse.length, 2);
  assert.deepEqual(installed.hooks.PreToolUse[0], original.hooks.PreToolUse[0]);
  assert.equal(installed.hooks.SessionStart.length, 2);
  assert.deepEqual(installed.hooks.SessionStart[0], original.hooks.SessionStart[0]);
  assert.deepEqual(installed.hooks.PreToolUse[1], hookEntry(script));
  assert.deepEqual(installed.hooks.SessionStart[1], hookEntry(script, "SessionStart"));
  assert.equal(removeHook(dir), true);
  assert.equal(removeHook(dir), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(settings)), original);
});

test("invalid settings are never replaced during hook installation or removal", (t) => {
  const dir = sandbox(t);
  const filename = path.join(dir, "settings.json");
  fs.writeFileSync(filename, "broken");
  assert.throws(() => syncHook(dir, path.join(dir, "hook.js")));
  assert.throws(() => removeHook(dir));
  assert.equal(fs.readFileSync(filename, "utf8"), "broken");
  fs.writeFileSync(filename, JSON.stringify({ hooks: { PreToolUse: "invalid" } }));
  assert.throws(() => syncHook(dir, path.join(dir, "hook.js")));
  assert.equal(fs.readFileSync(filename, "utf8"), JSON.stringify({ hooks: { PreToolUse: "invalid" } }));
});

test("manual cleanup removes only the owned hook and route state", (t) => {
  const { dir } = activeRoute(t);
  const settings = path.join(dir, "settings.json");
  fs.writeFileSync(settings, JSON.stringify({
    model: "unchanged",
    hooks: {
      PreToolUse: [hookEntry(path.join(dir, HOOK_MARKER, "hook.js")), {
        matcher: "Bash", hooks: [{ type: "command", command: "user-hook" }],
      }],
      SessionStart: [{ hooks: [{ type: "command", command: "keep-session" }] }],
    },
  }));
  const cleanup = spawnSync(process.execPath, [fileURLToPath(new URL("../uninstall-hook.js", import.meta.url))], {
    encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
  });
  assert.equal(cleanup.status, 0, cleanup.stderr);
  const result = JSON.parse(cleanup.stdout);
  assert.equal(result.removed, true);
  assert.equal(result.routeCleared, true);
  assert.equal(result.agentsRemoved, 2);
  assert.equal(fs.existsSync(routePath(dir)), false);
  assert.equal(fs.readdirSync(path.join(dir, "agents")).filter((name) => name.endsWith(".md")).length, 0);
  const remaining = JSON.parse(fs.readFileSync(settings));
  assert.equal(remaining.model, "unchanged");
  assert.equal(remaining.hooks.PreToolUse.length, 1);
  assert.equal(remaining.hooks.PreToolUse[0].matcher, "Bash");
  assert.equal(remaining.hooks.SessionStart.length, 1);
});

test("manual cleanup preserves edited agents and other Claude definitions", (t) => {
  const { dir } = activeRoute(t);
  const agents = path.join(dir, "agents");
  const generated = fs.readdirSync(agents).filter((name) => name.endsWith(".md"));
  fs.appendFileSync(path.join(agents, generated[0]), "\nUser notes.\n");
  fs.writeFileSync(path.join(agents, "personal.md"), "unrelated agent");
  const cleanup = spawnSync(process.execPath, [fileURLToPath(new URL("../uninstall-hook.js", import.meta.url))], {
    encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
  });
  assert.equal(cleanup.status, 0, cleanup.stderr);
  assert.equal(JSON.parse(cleanup.stdout).agentsRemoved, 1);
  assert.equal(fs.existsSync(path.join(agents, generated[0])), true);
  assert.equal(fs.readFileSync(path.join(agents, "personal.md"), "utf8"), "unrelated agent");
  const second = spawnSync(process.execPath, [fileURLToPath(new URL("../uninstall-hook.js", import.meta.url))], {
    encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
  });
  assert.equal(second.status, 0, second.stderr);
});

test("real Node command hook reads stdin, routes Agent and Task, and fails open", (t) => {
  const { dir, route } = activeRoute(t);
  const hook = fileURLToPath(new URL("../hook.js", import.meta.url));
  const run = (input) => spawnSync(process.execPath, [hook], {
    input: JSON.stringify(input), encoding: "utf8",
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
  });
  for (const tool_name of ["Agent", "Task"]) {
    const result = run({ tool_name, tool_input: { prompt: "simple task" } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  }
  for (const toolInput of [
    { subagent_type: "Explore" },
    { subagent_type: "oh-my-claudecode:executor" },
  ]) {
    const result = run({ tool_name: "Agent", tool_input: toolInput });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  }
  fs.writeFileSync(routePath(dir), JSON.stringify({ ...route, mode: "prefer" }));
  assert.equal(run({ tool_name: "Agent", tool_input: { subagent_type: "oh-my-claudecode:executor" } }).stdout, "");
  fs.writeFileSync(routePath(dir), JSON.stringify(route));
  assert.equal(run({ tool_name: "Bash", tool_input: {} }).stdout, "");
  const startup = run({ hook_event_name: "SessionStart" });
  assert.equal(startup.status, 0, startup.stderr);
  const guidance = JSON.parse(startup.stdout).hookSpecificOutput;
  assert.equal(guidance.hookEventName, "SessionStart");
  assert.match(guidance.additionalContext, /never omit subagent_type/);
  assert.match(guidance.additionalContext, /Do not use general-purpose/);
  assert.ok(guidance.additionalContext.includes(agentName("provider/fast")));
  fs.writeFileSync(routePath(dir), JSON.stringify({ version: 1, mode: "strict", agents: [] }));
  assert.equal(run({ hook_event_name: "SessionStart" }).stdout, "");
  fs.writeFileSync(routePath(dir), "broken");
  assert.equal(run({ hook_event_name: "SessionStart" }).stdout, "");
  const invalid = run({ tool_name: "Agent", tool_input: {} });
  assert.equal(invalid.status, 0);
  assert.equal(invalid.stdout, "");
});
