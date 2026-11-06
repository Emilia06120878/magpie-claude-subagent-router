import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "./atomic.js";

export const HOOK_MARKER = "magpie-claude-subagent-router";
const EVENTS = ["PreToolUse", "SessionStart"];

export function hookEntry(script, event = "PreToolUse") {
  // Claude Code uses the command shell on Windows; quoted absolute paths
  // work for both the plugin directory and paths containing spaces.
  return {
    matcher: event === "PreToolUse" ? "Agent|Task" : "*",
    hooks: [{ type: "command", command: `node "${script}"`, timeout: 5 }],
  };
}

function ownedGroup(group) {
  return group && typeof group === "object" && !Array.isArray(group)
    && Array.isArray(group.hooks) && group.hooks.some((hook) =>
      typeof hook?.command === "string"
      && hook.command.includes(HOOK_MARKER)
      && (hook.command.endsWith(`${path.join(HOOK_MARKER, "hook.js")}"`)
        || hook.command.endsWith(`${path.posix.join(HOOK_MARKER, "hook.js")}"`)));
}

function readSettings(filename) {
  const settings = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("Claude Code settings.json is not a JSON object; the routing hook was not changed.");
  }
  if (settings.hooks !== undefined
    && (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks))) {
    throw new Error("Claude Code settings.hooks is invalid; the routing hook was not changed.");
  }
  const before = {};
  for (const event of EVENTS) {
    before[event] = settings.hooks?.[event] ?? [];
    if (!Array.isArray(before[event])) {
      throw new Error(`Claude Code ${event} hooks are invalid; the routing hook was not changed.`);
    }
  }
  return { settings, before };
}

function writeSettings(filename, settings, retained, script) {
  const next = { ...settings, hooks: { ...settings.hooks } };
  for (const event of EVENTS) {
    next.hooks[event] = script ? [...retained[event], hookEntry(script, event)] : retained[event];
    if (!next.hooks[event].length) delete next.hooks[event];
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  atomicWrite(filename, `${JSON.stringify(next, null, 2)}\n`);
}

export function syncHook(claudeDir, script) {
  const filename = path.join(claudeDir, "settings.json");
  const { settings, before } = fs.existsSync(filename)
    ? readSettings(filename)
    : { settings: {}, before: Object.fromEntries(EVENTS.map((event) => [event, []])) };
  const retained = Object.fromEntries(EVENTS.map((event) => [
    event, before[event].filter((group) => !ownedGroup(group)),
  ]));
  const unchanged = EVENTS.every((event) => retained[event].length + 1 === before[event].length
    && JSON.stringify(before[event].at(-1)) === JSON.stringify(hookEntry(script, event)));
  if (unchanged) {
    return { installed: true, changed: false, preserved: retained.PreToolUse.length + retained.SessionStart.length };
  }
  writeSettings(filename, settings, retained, script);
  return { installed: true, changed: true, preserved: retained.PreToolUse.length + retained.SessionStart.length };
}

export function removeHook(claudeDir) {
  const filename = path.join(claudeDir, "settings.json");
  if (!fs.existsSync(filename)) return false;
  const { settings, before } = readSettings(filename);
  const retained = Object.fromEntries(EVENTS.map((event) => [
    event, before[event].filter((group) => !ownedGroup(group)),
  ]));
  if (EVENTS.every((event) => retained[event].length === before[event].length)) return false;
  writeSettings(filename, settings, retained);
  return true;
}
